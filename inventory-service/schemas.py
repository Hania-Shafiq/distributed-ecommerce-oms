# schemas.py
# ─────────────────────────────────────────────────────────────────────────────
# Pydantic schemas define the shape of data traveling over the HTTP wire:
#   • Request bodies (creation, stock adjustments)
#   • Response bodies (inventory details, status responses)
#
# These are kept strictly decoupled from SQLAlchemy ORM models.
# ─────────────────────────────────────────────────────────────────────────────

from datetime import datetime
from pydantic import BaseModel, Field


# ── InventoryBase ─────────────────────────────────────────────────────────────
# Contains fields common to creation and retrieval.
class InventoryBase(BaseModel):
    product_id: int = Field(
        ...,
        gt=0,
        description="Unique product ID from Product Service",
    )
    stock_quantity: int = Field(
        default=0,
        ge=0,
        description="Available stock quantity (must be >= 0)",
    )


# ── InventoryCreate ───────────────────────────────────────────────────────────
# Schema used for POST /inventory
class InventoryCreate(InventoryBase):
    pass


# ── StockAdjustment ───────────────────────────────────────────────────────────
# Schema used for PUT /inventory/{product_id}/reduce and /restock
class StockAdjustment(BaseModel):
    amount: int = Field(
        ...,
        gt=0,
        description="Quantity of stock to adjust (must be strictly greater than 0)",
    )


# ── InventoryResponse ─────────────────────────────────────────────────────────
# Schema used in API response bodies (GET, POST, PUT)
class InventoryResponse(InventoryBase):
    id: int
    updated_at: datetime

    model_config = {"from_attributes": True}
