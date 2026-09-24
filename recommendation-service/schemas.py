# schemas.py
# ─────────────────────────────────────────────────────────────────────────────
# Pydantic schemas for the Neo4j Recommendation Service.
# Defines request bodies for graph updates and structured recommendation outputs.
# ─────────────────────────────────────────────────────────────────────────────

from typing import List
from pydantic import BaseModel, Field


# ── Purchase Schemas ──────────────────────────────────────────────────────────
class PurchaseRecord(BaseModel):
    user_id: int = Field(
        ...,
        gt=0,
        description="ID of the user who made the purchase",
    )
    product_id: int = Field(
        ...,
        gt=0,
        description="ID of the purchased product",
    )
    product_name: str = Field(
        ...,
        min_length=1,
        description="Name of the product",
    )
    category: str = Field(
        ...,
        min_length=1,
        description="Category of the product (e.g., Electronics, Books)",
    )


class PurchaseResponse(BaseModel):
    message: str
    user_id: int
    product_id: int


# ── Recommendation Schemas ────────────────────────────────────────────────────
class RecommendedProduct(BaseModel):
    product_id: int = Field(..., description="ID of recommended product")
    name: str = Field(..., description="Product display name")
    category: str = Field(..., description="Product category")
    score: int = Field(
        ...,
        description="Recommendation strength (number of co-purchasers or overlapping peer purchases)",
    )


class ProductRecommendationResponse(BaseModel):
    product_id: int
    recommendation_type: str = "item_collaborative_filtering (Customers who bought this also bought)"
    recommendations: List[RecommendedProduct]
    count: int


class UserRecommendationResponse(BaseModel):
    user_id: int
    recommendation_type: str = "user_collaborative_filtering (Recommended by similar peer users)"
    recommendations: List[RecommendedProduct]
    count: int
