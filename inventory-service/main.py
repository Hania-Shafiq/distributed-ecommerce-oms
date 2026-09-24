# main.py
# ─────────────────────────────────────────────────────────────────────────────
# Entry point for the Inventory Service FastAPI application.
# Microservice in charge of tracking and atomically managing product stock levels.
#
# Route summary:
#   GET    /health                        → Liveness / health probe
#   POST   /inventory                     → Create initial stock entry for product
#   GET    /inventory                     → List all inventory entries (paginated)
#   GET    /inventory/{product_id}        → Get stock level for product
#   PUT    /inventory/{product_id}/reduce → Atomically reduce stock (e.g. order placed)
#   PUT    /inventory/{product_id}/restock→ Atomically restock / increase inventory
# ─────────────────────────────────────────────────────────────────────────────

import os
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import uvicorn

# Internal modules
import models
import schemas
from database import engine, get_db


# ── App lifespan (startup / shutdown) ─────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── STARTUP ──────────────────────────────────────────────────────────────
    # Create all database tables and constraints defined in ORM models (idempotent).
    models.Base.metadata.create_all(bind=engine)
    print("[DB] Inventory tables and constraints created / verified.")

    yield  # Application runs and serves requests

    # ── SHUTDOWN ─────────────────────────────────────────────────────────────
    print("[App] Inventory Service shutting down.")


# ── FastAPI application instance ──────────────────────────────────────────────
app = FastAPI(
    title="Inventory Service",
    description="Microservice managing stock levels with atomic updates and concurrency safety.",
    version="1.0.0",
    lifespan=lifespan,
)


# ═════════════════════════════════════════════════════════════════════════════
#  GET /health  — Service health check
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/health", tags=["Health"])
def health_check():
    """Liveness probe for the Inventory Service."""
    return {"status": "healthy", "service": "inventory-service"}


# ═════════════════════════════════════════════════════════════════════════════
#  POST /inventory  — Create initial stock entry
# ═════════════════════════════════════════════════════════════════════════════
@app.post(
    "/inventory",
    response_model=schemas.InventoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create inventory record",
    tags=["Inventory"],
)
def create_inventory(
    payload: schemas.InventoryCreate,
    db: Session = Depends(get_db),
):
    """
    Creates an initial stock record for a product.
    Returns 409 Conflict if an inventory record for this product_id already exists.
    """
    # Check if inventory already exists for this product
    existing_inventory = (
        db.query(models.Inventory)
        .filter(models.Inventory.product_id == payload.product_id)
        .first()
    )
    if existing_inventory:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Inventory record for product ID {payload.product_id} already exists.",
        )

    new_inventory = models.Inventory(
        product_id=payload.product_id,
        stock_quantity=payload.stock_quantity,
    )

    db.add(new_inventory)
    try:
        db.commit()
        db.refresh(new_inventory)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Inventory record for product ID {payload.product_id} already exists.",
        )

    return new_inventory


# ═════════════════════════════════════════════════════════════════════════════
#  GET /inventory  — List all inventory items
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/inventory",
    response_model=List[schemas.InventoryResponse],
    summary="List all inventory records",
    tags=["Inventory"],
)
def list_inventory(
    skip: int = Query(default=0, ge=0, description="Pagination offset"),
    limit: int = Query(default=100, ge=1, le=1000, description="Max items per page"),
    db: Session = Depends(get_db),
):
    """Returns a paginated list of all inventory records."""
    return db.query(models.Inventory).offset(skip).limit(limit).all()


# ═════════════════════════════════════════════════════════════════════════════
#  GET /inventory/{product_id}  — Get current stock for a product
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/inventory/{product_id}",
    response_model=schemas.InventoryResponse,
    summary="Get stock by product ID",
    tags=["Inventory"],
)
def get_inventory(
    product_id: int,
    db: Session = Depends(get_db),
):
    """
    Fetches the current inventory record for a given product ID.
    Returns 404 if the product inventory record is not found.
    """
    inventory_item = (
        db.query(models.Inventory)
        .filter(models.Inventory.product_id == product_id)
        .first()
    )
    if not inventory_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory for product ID {product_id} not found.",
        )
    return inventory_item


# ═════════════════════════════════════════════════════════════════════════════
#  PUT /inventory/{product_id}/reduce  — Atomically reduce stock
# ═════════════════════════════════════════════════════════════════════════════
@app.put(
    "/inventory/{product_id}/reduce",
    response_model=schemas.InventoryResponse,
    summary="Atomically reduce stock quantity",
    tags=["Inventory"],
)
def reduce_stock(
    product_id: int,
    adjustment: schemas.StockAdjustment,
    db: Session = Depends(get_db),
):
    """
    Atomically decreases the available stock for a product.

    Concurrency & Safety Architecture:
    1. SELECT ... FOR UPDATE (Row-Level Locking):
       Acquires an exclusive lock on the row for the duration of the transaction.
       Concurrent reduction requests on the same product queue up, preventing race
       conditions and double-spending.
    2. Check Stock Sufficiency:
       If current stock < requested amount, raises 409 Conflict.
    3. PostgreSQL CHECK Constraint:
       The database constraint (stock_quantity >= 0) acts as an iron-clad guarantee.
    """
    # Acquire exclusive row-level lock
    inventory_item = (
        db.query(models.Inventory)
        .filter(models.Inventory.product_id == product_id)
        .with_for_update()
        .first()
    )

    if not inventory_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory for product ID {product_id} not found.",
        )

    if inventory_item.stock_quantity < adjustment.amount:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Insufficient stock for product ID {product_id}. "
                f"Requested: {adjustment.amount}, Available: {inventory_item.stock_quantity}."
            ),
        )

    # Perform atomic reduction
    inventory_item.stock_quantity -= adjustment.amount

    try:
        db.commit()
        db.refresh(inventory_item)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update stock: {str(e)}",
        )

    return inventory_item


# ═════════════════════════════════════════════════════════════════════════════
#  PUT /inventory/{product_id}/restock  — Atomically increase stock
# ═════════════════════════════════════════════════════════════════════════════
@app.put(
    "/inventory/{product_id}/restock",
    response_model=schemas.InventoryResponse,
    summary="Atomically restock / increase inventory",
    tags=["Inventory"],
)
def restock_inventory(
    product_id: int,
    adjustment: schemas.StockAdjustment,
    db: Session = Depends(get_db),
):
    """
    Atomically increases available stock quantity for a product.
    Uses row-level locking (SELECT ... FOR UPDATE) for consistency.
    """
    inventory_item = (
        db.query(models.Inventory)
        .filter(models.Inventory.product_id == product_id)
        .with_for_update()
        .first()
    )

    if not inventory_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory for product ID {product_id} not found.",
        )

    inventory_item.stock_quantity += adjustment.amount

    try:
        db.commit()
        db.refresh(inventory_item)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to restock inventory: {str(e)}",
        )

    return inventory_item


# ─────────────────────────────────────────────────────────────────────────────
# Run directly with:  python main.py
# Or via uvicorn:     uvicorn main:app --reload --port 8003
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("PORT", "8003"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
