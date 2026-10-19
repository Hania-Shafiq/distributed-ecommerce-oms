# main.py
# ─────────────────────────────────────────────────────────────────────────────
# Entry point for the Order Service FastAPI application.
# Acts as the SAGA Orchestrator for distributed order processing across
# Product and Inventory microservices.
#
# Route summary:
#   GET    /health             → Health & liveness probe
#   POST   /orders             → Place order (triggers distributed SAGA flow)
#   GET    /orders/{order_id}  → Get order details with line items
#   GET    /orders?user_id=... → List orders with optional user_id filter
# ─────────────────────────────────────────────────────────────────────────────

import os
import time
import logging
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, Query, Header, status
from sqlalchemy.orm import Session
import uvicorn

# Internal modules
import models
import schemas
from database import engine, get_db
from saga import execute_order_saga
from clients import USE_MOCK
from auth import get_current_user

# Configure clean logging for demo visibility
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("order_service")


# ── App lifespan (startup / shutdown) ─────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── STARTUP ──────────────────────────────────────────────────────────────
    # Ensure database tables (orders, order_items) are created
    models.Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.exec_driver_sql("ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);")
    logger.info("[DB] Orders database tables verified/created with idempotency_key.")
    logger.info(f"[Config] Mock Mode active: {USE_MOCK}")

    yield

    # ── SHUTDOWN ─────────────────────────────────────────────────────────────
    logger.info("[App] Order Service shutting down.")


# ── FastAPI Application Instance ──────────────────────────────────────────────
app = FastAPI(
    title="Order Service",
    description="Microservice coordinating distributed order fulfillment using the SAGA Orchestration pattern.",
    version="1.0.0",
    lifespan=lifespan,
)

from fastapi.middleware.cors import CORSMiddleware

cors_origins_env = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:8000,http://127.0.0.1:5173,http://127.0.0.1:8000,http://localhost,http://127.0.0.1")
cors_origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip() and origin.strip() != "*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═════════════════════════════════════════════════════════════════════════════
#  GET /health  — Service health probe
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/health", tags=["Health"])
def health_check():
    """Health check endpoint indicating service status and mock mode."""
    return {
        "status": "healthy",
        "service": "order-service",
        "mock_mode": USE_MOCK,
    }


# ═════════════════════════════════════════════════════════════════════════════
#  POST /orders  — Place order via SAGA Orchestrator
# ═════════════════════════════════════════════════════════════════════════════
@app.post(
    "/orders",
    response_model=schemas.OrderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Place a new order (triggers SAGA transaction)",
    tags=["Orders"],
)
def create_order(
    payload: schemas.OrderCreate,
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Initiates the distributed SAGA transaction:
    1. Verifies caller is placing order for themselves (or caller is admin).
    2. Checks if Idempotency-Key already exists; if so, returns existing order.
    3. Executes distributed SAGA flow across inventory and product services.
    """
    is_admin = current_user.get("role") == "admin"
    caller_sub = current_user.get("sub")
    if not is_admin and str(payload.user_id) != str(caller_sub):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Cannot place order for another user",
        )

    if idempotency_key and idempotency_key.strip():
        key = idempotency_key.strip()
        existing = db.query(models.Order).filter(models.Order.idempotency_key == key).first()
        if existing:
            if existing.status in ("CONFIRMED", "FAILED"):
                logger.info(f"[IDEMPOTENCY] Order #{existing.id} already processed for key '{key}'. Returning existing order.")
                return existing
            for _ in range(30):
                time.sleep(0.1)
                db.expire(existing)
                db.refresh(existing)
                if existing.status in ("CONFIRMED", "FAILED"):
                    return existing
            return existing

    return execute_order_saga(payload, db, idempotency_key=idempotency_key.strip() if idempotency_key else None)


# ═════════════════════════════════════════════════════════════════════════════
#  GET /orders/{order_id}  — Get order by ID
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/orders/{order_id}",
    response_model=schemas.OrderResponse,
    summary="Get order details by ID",
    tags=["Orders"],
)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Retrieves an order and its associated line items by order ID.
    Returns 404 if the order does not exist.
    Returns 403 if customer attempts to view another user's order.
    """
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order #{order_id} not found.",
        )

    is_admin = current_user.get("role") == "admin"
    caller_sub = current_user.get("sub")
    if not is_admin and str(order.user_id) != str(caller_sub):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Cannot view another user's order",
        )

    return order


# ═════════════════════════════════════════════════════════════════════════════
#  GET /orders  — List orders (optional user_id filter)
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/orders",
    response_model=List[schemas.OrderResponse],
    summary="List orders (optionally filtered by user_id)",
    tags=["Orders"],
)
def list_orders(
    user_id: Optional[int] = Query(default=None, description="Filter orders by user ID"),
    order_status: Optional[str] = Query(default=None, alias="status", description="Filter orders by status"),
    skip: int = Query(default=0, ge=0, description="Pagination offset"),
    limit: int = Query(default=100, ge=1, le=200, description="Max items per page"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Returns a list of orders.
    - If user_id is omitted or status filter is provided: requires admin role.
    - If user_id is provided: customer can only query their own user_id.
    - List limit is capped at 200.
    """
    # Cap list limit at 200
    if limit > 200:
        limit = 200

    is_admin = current_user.get("role") == "admin"
    caller_sub = current_user.get("sub")

    if user_id is None:
        if not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Admin access required to query all orders",
            )

    if order_status is not None:
        if not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Admin access required to filter orders by status",
            )

    if user_id is not None:
        if not is_admin and str(user_id) != str(caller_sub):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Cannot access orders of another user",
            )

    query = db.query(models.Order)
    if user_id is not None:
        query = query.filter(models.Order.user_id == user_id)
    if order_status is not None:
        query = query.filter(models.Order.status == order_status)

    orders = query.order_by(models.Order.created_at.desc()).offset(skip).limit(limit).all()
    return orders


# ─────────────────────────────────────────────────────────────────────────────
# Run directly with:  python main.py
# Or via uvicorn:     uvicorn main:app --reload --port 8004
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("PORT", "8004"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
