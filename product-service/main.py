# main.py
# ─────────────────────────────────────────────────────────────────────────────
# Entry point for the Product Service FastAPI application.
# Wires together:
#   • PostgreSQL (via SQLAlchemy — database.py / models.py)
#   • Elasticsearch (elastic.py)
#   • Pydantic validation (schemas.py)
#
# Route summary:
#   POST   /products             → create a product
#   GET    /products             → list all products
#   GET    /products/search?q=   → full-text ES search  ← must come BEFORE /{id}
#   GET    /products/{id}        → get one product by id
#   PUT    /products/{id}        → update a product
#   DELETE /products/{id}        → delete a product
# ─────────────────────────────────────────────────────────────────────────────

from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, Depends, HTTPException, Query
from sqlalchemy.orm import Session

# Internal modules
import models
import schemas
import elastic
from database import engine, get_db


# ── App lifespan (startup / shutdown) ─────────────────────────────────────────
# The @asynccontextmanager lifespan hook replaces the deprecated @app.on_event
# pattern.  Everything BEFORE `yield` runs at startup; everything AFTER runs at
# shutdown (useful for closing connections, etc.).
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── STARTUP ──────────────────────────────────────────────────────────────
    # 1. Create all tables defined in our ORM models if they don't yet exist.
    #    create_all() is idempotent — safe to call on every restart.
    models.Base.metadata.create_all(bind=engine)
    print("[DB] Tables created / verified.")

    # 2. Bootstrap the Elasticsearch index (creates it only if missing).
    elastic.create_index_if_not_exists()
    print("[ES] Index ready.")

    yield   # ← the app runs here (serves requests)

    # ── SHUTDOWN ─────────────────────────────────────────────────────────────
    # Nothing special needed; SQLAlchemy pool and ES client clean up on GC.
    print("[App] Shutting down.")


# ── FastAPI application instance ──────────────────────────────────────────────
app = FastAPI(
    title="Product Service",
    description="Manages products in PostgreSQL and indexes them in Elasticsearch for search.",
    version="1.0.0",
    lifespan=lifespan,   # register our startup/shutdown hook
)


# ═════════════════════════════════════════════════════════════════════════════
#  POST /products  — Create a new product
# ═════════════════════════════════════════════════════════════════════════════
@app.post(
    "/products",
    response_model=schemas.ProductResponse,   # shape of the JSON response
    status_code=201,                          # HTTP 201 Created (more correct than 200)
    tags=["Products"],
)
def create_product(
    payload: schemas.ProductCreate,   # FastAPI auto-parses + validates the JSON body
    db: Session = Depends(get_db),    # injects a DB session; closed automatically after
):
    """
    Create a new product.

    Steps:
    1. Build a SQLAlchemy model instance from the validated Pydantic payload.
    2. Save it to PostgreSQL.
    3. Index the same data into Elasticsearch so it becomes searchable.
    4. Return the saved product (including its auto-generated id).
    """
    # Step 1 — Convert Pydantic schema → SQLAlchemy model.
    # model_dump() gives us a plain dict; ** unpacks it as keyword arguments.
    new_product = models.Product(**payload.model_dump())

    # Step 2 — Persist to PostgreSQL.
    db.add(new_product)       # stage the INSERT
    db.commit()               # execute INSERT; PostgreSQL assigns the id now
    db.refresh(new_product)   # reload the row so new_product.id is populated

    # Step 3 — Mirror to Elasticsearch.
    # We build the ES document from the same Pydantic payload (which is already
    # validated) rather than re-reading from the DB, saving one round-trip.
    elastic.index_product(
        product_id=new_product.id,
        product_data=payload.model_dump(),
    )

    # Step 4 — FastAPI serialises new_product (ORM object) using ProductResponse
    # (from_attributes=True in the schema handles ORM → Pydantic conversion).
    return new_product


# ═════════════════════════════════════════════════════════════════════════════
#  GET /products  — List all products
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/products",
    response_model=List[schemas.ProductResponse],
    tags=["Products"],
)
def list_products(
    skip:  int = Query(default=0,   ge=0,   description="Number of records to skip (pagination offset)"),
    limit: int = Query(default=100, ge=1, le=1000, description="Max records to return"),
    db: Session = Depends(get_db),
):
    """
    Return a paginated list of all products from PostgreSQL.

    `skip` and `limit` implement offset-based pagination:
      • GET /products?skip=0&limit=20  → first page
      • GET /products?skip=20&limit=20 → second page

    Note: For very large datasets, keyset/cursor pagination is more efficient,
    but offset pagination is simpler and sufficient for most cases.
    """
    products = db.query(models.Product).offset(skip).limit(limit).all()
    return products


# ═════════════════════════════════════════════════════════════════════════════
#  GET /products/search  — Full-text search via Elasticsearch
#  ⚠ IMPORTANT: This route MUST be defined BEFORE GET /products/{id}.
#    FastAPI matches routes in declaration order. If /{id} came first,
#    the literal string "search" would be captured as the id parameter,
#    causing a 422 Unprocessable Entity error.
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/products/search",
    tags=["Products"],
)
def search_products(
    q: str = Query(..., min_length=1, description="Search query string"),
):
    """
    Full-text search across product name and description using Elasticsearch.
    Results are ranked by relevance score (best match first).
    Supports ~2 character typo tolerance (fuzziness=AUTO).

    Example: GET /products/search?q=wireless+headphones
    """
    results = elastic.search_products(query=q)
    return {"query": q, "results": results, "count": len(results)}


# ═════════════════════════════════════════════════════════════════════════════
#  GET /products/{id}  — Get a single product by id
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/products/{product_id}",
    response_model=schemas.ProductResponse,
    tags=["Products"],
)
def get_product(
    product_id: int,            # FastAPI extracts and validates this from the URL path
    db: Session = Depends(get_db),
):
    """
    Fetch a single product from PostgreSQL by its primary key.
    Returns 404 if no product with that id exists.
    """
    product = db.query(models.Product).filter(models.Product.id == product_id).first()

    if not product:
        # raise HTTPException → FastAPI converts this into a JSON error response:
        # {"detail": "Product not found"} with status 404.
        raise HTTPException(status_code=404, detail="Product not found")

    return product


# ═════════════════════════════════════════════════════════════════════════════
#  PUT /products/{id}  — Update a product
# ═════════════════════════════════════════════════════════════════════════════
@app.put(
    "/products/{product_id}",
    response_model=schemas.ProductResponse,
    tags=["Products"],
)
def update_product(
    product_id: int,
    payload: schemas.ProductUpdate,   # all fields are Optional → partial update OK
    db: Session = Depends(get_db),
):
    """
    Update an existing product (partial updates supported).

    Steps:
    1. Fetch the existing product from PostgreSQL (404 if not found).
    2. Apply only the fields the client actually sent (skip None values).
    3. Commit the change to PostgreSQL.
    4. Re-index the updated product in Elasticsearch.
    5. Return the updated product.
    """
    # Step 1 — Fetch existing record
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Step 2 — Apply only the fields that were actually provided in the request.
    # model_dump(exclude_unset=True) returns a dict containing ONLY the fields
    # the client explicitly included — fields they omitted are excluded entirely.
    # Without exclude_unset=True, every Optional field defaults to None and we'd
    # accidentally overwrite existing values with None.
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(product, field, value)   # dynamically set the attribute on the ORM object

    # Step 3 — Persist
    db.commit()
    db.refresh(product)

    # Step 4 — Re-sync Elasticsearch.
    # We build the full document from the refreshed ORM object so ES has the
    # complete, up-to-date state (not just the changed fields).
    elastic.index_product(
        product_id=product.id,
        product_data={
            "name":           product.name,
            "category":       product.category,
            "price":          product.price,
            "description":    product.description,
            "stock_quantity": product.stock_quantity,
        },
    )

    return product


# ═════════════════════════════════════════════════════════════════════════════
#  DELETE /products/{id}  — Delete a product
# ═════════════════════════════════════════════════════════════════════════════
@app.delete(
    "/products/{product_id}",
    status_code=204,     # HTTP 204 No Content — success, but no body returned
    tags=["Products"],
)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
):
    """
    Delete a product from both PostgreSQL and Elasticsearch.

    Steps:
    1. Verify the product exists (404 if not).
    2. Remove from PostgreSQL.
    3. Remove from Elasticsearch (elastic.py handles the NotFoundError case).

    HTTP 204 means "deleted successfully" — the response has no body,
    so we don't return anything.
    """
    # Step 1
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Step 2 — Remove from PostgreSQL
    db.delete(product)
    db.commit()

    # Step 3 — Remove from Elasticsearch
    elastic.delete_product_from_es(product_id)

    # No return value for 204 responses


# ─────────────────────────────────────────────────────────────────────────────
# Run directly with:  python main.py
# Or via uvicorn:     uvicorn main:app --reload --port 8001
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
