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
import logging
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
import uvicorn

# Internal modules
import models
import schemas
from database import engine, get_db
from saga import execute_order_saga
from clients import USE_MOCK

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
    logger.info("[DB] Orders database tables verified/created.")
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    db: Session = Depends(get_db),
):
    """
    Initiates the distributed SAGA transaction:
    1. Creates order in PostgreSQL with status 'PENDING'.
    2. Validates product prices against Product Service.
    3. Reserves stock atomically against Inventory Service.
    4. If any item fails: triggers automatic compensating transactions
       (releases previously reserved items), sets status to 'FAILED',
       and returns a 409 Conflict.
    5. If all succeed: sets status to 'CONFIRMED' and commits the transaction.
    """
    return execute_order_saga(payload, db)


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
):
    """
    Retrieves an order and its associated line items by order ID.
    Returns 404 if the order does not exist.
    """
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order #{order_id} not found.",
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
    skip: int = Query(default=0, ge=0, description="Pagination offset"),
    limit: int = Query(default=100, ge=1, le=1000, description="Max items per page"),
    db: Session = Depends(get_db),
):
    """
    Returns a list of orders. If `user_id` query parameter is provided,
    filters the results for that specific user.
    """
    query = db.query(models.Order)
    if user_id is not None:
        query = query.filter(models.Order.user_id == user_id)

    orders = query.order_by(models.Order.created_at.desc()).offset(skip).limit(limit).all()
    return orders


# ─────────────────────────────────────────────────────────────────────────────
# Run directly with:  python main.py
# Or via uvicorn:     uvicorn main:app --reload --port 8004
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("PORT", "8004"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
