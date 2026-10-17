# schemas.py
# ─────────────────────────────────────────────────────────────────────────────
# Pydantic schemas for the Order Service.
# Defines request payloads and serialized response bodies.
# ─────────────────────────────────────────────────────────────────────────────

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


# ── Order Item Schemas ────────────────────────────────────────────────────────
class OrderItemCreate(BaseModel):
    product_id: int = Field(
        ...,
        gt=0,
        description="ID of the product to purchase",
    )
    quantity: int = Field(
        ...,
        gt=0,
        description="Quantity of units to order",
    )


class OrderItemResponse(BaseModel):
    id: int
    product_id: int
    quantity: int
    unit_price: float

    model_config = {"from_attributes": True}


# ── Order Schemas ─────────────────────────────────────────────────────────────
class OrderCreate(BaseModel):
    user_id: int = Field(
        ...,
        gt=0,
        description="ID of the ordering customer",
    )
    items: List[OrderItemCreate] = Field(
        ...,
        min_length=1,
        description="List of product items to order",
    )


class OrderResponse(BaseModel):
    id: int
    user_id: int
    total_amount: float
    status: str
    idempotency_key: Optional[str] = None
    created_at: datetime
    items: List[OrderItemResponse]

    model_config = {"from_attributes": True}
