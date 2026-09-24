# main.py
# ─────────────────────────────────────────────────────────────────────────────
# Entry point for the Recommendation Service FastAPI application.
# Uses Neo4j graph database to power real-time collaborative filtering and
# product recommendations.
#
# Route summary:
#   GET  /health                                → Neo4j liveness & health probe
#   POST /graph/purchase                        → Ingest order event / create relationship
#   GET  /recommendations/product/{product_id}  → Item-to-item "also bought" recommendations
#   GET  /recommendations/user/{user_id}        → User-to-user collaborative recommendations
# ─────────────────────────────────────────────────────────────────────────────

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query, status
import uvicorn

import schemas
from graph import neo4j_service

# Configure console logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("recommendation_service")


# ── Lifespan Context Manager ─────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── STARTUP ──────────────────────────────────────────────────────────────
    logger.info("Initializing Neo4j schema constraints...")
    try:
        neo4j_service.init_constraints()
        logger.info("[Neo4j] Constraints initialized successfully.")
    except Exception as e:
        logger.warning(f"[Neo4j] Could not initialize constraints at startup: {e}")

    yield

    # ── SHUTDOWN ─────────────────────────────────────────────────────────────
    logger.info("Closing Neo4j driver connection...")
    neo4j_service.close()


# ── FastAPI App Instance ──────────────────────────────────────────────────────
app = FastAPI(
    title="Recommendation Service",
    description="Real-time Graph Recommendation Engine powered by Neo4j and Cypher.",
    version="1.0.0",
    lifespan=lifespan,
)


# ═════════════════════════════════════════════════════════════════════════════
#  GET /health  — Neo4j Connectivity Probe
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/health", tags=["Health"])
def health_check():
    """Verifies that the service can communicate with the Neo4j graph cluster."""
    try:
        is_healthy = neo4j_service.check_connection()
        if is_healthy:
            return {
                "status": "healthy",
                "service": "recommendation-service",
                "database": "Neo4j Graph Database connected",
            }
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Neo4j probe returned unhealthy response.",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Cannot reach Neo4j: {str(exc)}",
        )


# ═════════════════════════════════════════════════════════════════════════════
#  POST /graph/purchase  — Ingest Purchase Relationship
# ═════════════════════════════════════════════════════════════════════════════
@app.post(
    "/graph/purchase",
    response_model=schemas.PurchaseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a purchase in the graph",
    tags=["Graph Operations"],
)
def record_purchase(record: schemas.PurchaseRecord):
    """
    Idempotently creates/merges User and Product nodes and establishes a
    `[:PURCHASED]` relationship between them.
    """
    try:
        result = neo4j_service.record_purchase(
            user_id=record.user_id,
            product_id=record.product_id,
            product_name=record.product_name,
            category=record.category,
        )
        return schemas.PurchaseResponse(
            message="Purchase relationship recorded in Neo4j graph.",
            user_id=result.get("user_id", record.user_id),
            product_id=result.get("product_id", record.product_id),
        )
    except Exception as exc:
        logger.error(f"Failed to record purchase in Neo4j: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Neo4j write error: {str(exc)}",
        )


# ═════════════════════════════════════════════════════════════════════════════
#  GET /recommendations/product/{product_id}  — Item-to-Item Recommendations
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/recommendations/product/{product_id}",
    response_model=schemas.ProductRecommendationResponse,
    summary="Get 'Customers who bought this also bought' recommendations",
    tags=["Recommendations"],
)
def get_product_recommendations(
    product_id: int,
    limit: int = Query(default=5, ge=1, le=20, description="Max recommendations to return"),
):
    """
    Returns top co-purchased products based on graph traversal of customers
    who bought this item, ranked by co-occurrence frequency.
    """
    try:
        results = neo4j_service.get_product_recommendations(product_id=product_id, limit=limit)
        return schemas.ProductRecommendationResponse(
            product_id=product_id,
            recommendations=results,
            count=len(results),
        )
    except Exception as exc:
        logger.error(f"Error querying product recommendations: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Graph recommendation error: {str(exc)}",
        )


# ═════════════════════════════════════════════════════════════════════════════
#  GET /recommendations/user/{user_id}  — User-to-User Collaborative Filtering
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/recommendations/user/{user_id}",
    response_model=schemas.UserRecommendationResponse,
    summary="Get collaborative recommendations for a user",
    tags=["Recommendations"],
)
def get_user_recommendations(
    user_id: int,
    limit: int = Query(default=5, ge=1, le=20, description="Max recommendations to return"),
):
    """
    Returns personalized recommendations by finding peer users with overlapping
    purchase history and recommending items they purchased that this user hasn't
    bought yet.
    """
    try:
        results = neo4j_service.get_user_recommendations(user_id=user_id, limit=limit)
        return schemas.UserRecommendationResponse(
            user_id=user_id,
            recommendations=results,
            count=len(results),
        )
    except Exception as exc:
        logger.error(f"Error querying user recommendations: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Graph recommendation error: {str(exc)}",
        )


# ─────────────────────────────────────────────────────────────────────────────
# Run directly with:  python main.py
# Or via uvicorn:     uvicorn main:app --reload --port 8005
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("PORT", "8005"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
