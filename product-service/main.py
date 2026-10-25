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

import os
import time
import json
import random
import urllib.request
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc

# Internal modules
import models
import schemas
import elastic
from database import engine, get_db, SessionLocal
from auth import require_admin

INVENTORY_SERVICE_URL = os.getenv("INVENTORY_SERVICE_URL", "http://inventory-service:8003").rstrip("/")
INTERNAL_SERVICE_KEY = os.getenv("INTERNAL_SERVICE_KEY", "")


class LiveInventoryCache:
    """In-memory cache for live stock from inventory-service (5-second TTL)."""
    def __init__(self, ttl: float = 5.0):
        self.ttl = ttl
        self.stock_map = {}
        self.last_fetch = 0.0

    def invalidate(self):
        """Invalidate cache so next request fetches fresh data from inventory-service."""
        self.last_fetch = 0.0
        self.stock_map = {}

    def get_stock_map(self) -> dict[int, int]:
        now = time.time()
        if self.stock_map and (now - self.last_fetch < self.ttl):
            return self.stock_map
        try:
            req = urllib.request.Request(f"{INVENTORY_SERVICE_URL}/inventory?limit=1000")
            with urllib.request.urlopen(req, timeout=5) as resp:
                items = json.loads(resp.read().decode())
                self.stock_map = {item["product_id"]: item["stock_quantity"] for item in items}
                self.last_fetch = now
        except Exception as e:
            print(f"[InventoryCache] Warning: could not refresh live inventory: {e}")
            if not self.stock_map:
                return {}
        return self.stock_map


inventory_cache = LiveInventoryCache(ttl=5.0)


def create_inventory_record(product_id: int, stock_quantity: int) -> bool:
    """
    Calls inventory-service to create the authoritative stock record for a product.
    Retries up to 3 times with exponential backoff.
    Returns True on success, False on failure.
    """
    url = f"{INVENTORY_SERVICE_URL}/inventory"
    payload = json.dumps({"product_id": product_id, "stock_quantity": stock_quantity}).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-Service-Key": INTERNAL_SERVICE_KEY,
    }
    for attempt in range(1, 4):
        try:
            req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status in (200, 201):
                    return True
        except Exception as e:
            print(f"[InventorySync] Attempt {attempt} failed to create inventory for product #{product_id}: {e}")
            time.sleep(0.3 * attempt)
    return False


def set_inventory_stock_remote(product_id: int, stock_quantity: int) -> bool:
    """
    Calls inventory-service PUT /inventory/{product_id}/set to calibrate stock.
    Retries up to 3 times with exponential backoff.
    Returns True on success, False on failure.
    """
    url = f"{INVENTORY_SERVICE_URL}/inventory/{product_id}/set"
    payload = json.dumps({"stock_quantity": stock_quantity}).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-Service-Key": INTERNAL_SERVICE_KEY,
    }
    for attempt in range(1, 4):
        try:
            req = urllib.request.Request(url, data=payload, headers=headers, method="PUT")
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status in (200, 201):
                    return True
        except Exception as e:
            print(f"[InventorySync] Attempt {attempt} failed to set inventory stock for product #{product_id}: {e}")
            time.sleep(0.3 * attempt)
    return False


def backfill_seed_products():
    """
    Backfills the 33 seed products with deterministic values:
    fixed random seed, ratings 3.0-5.0, created_at spread over the last 12 months.
    """
    db = SessionLocal()
    try:
        products = db.query(models.Product).order_by(models.Product.id.asc()).all()
        needs_backfill = any(p.rating is None for p in products)
        if needs_backfill:
            rng = random.Random(42)
            base_time = datetime(2026, 10, 1, 12, 0, 0, tzinfo=timezone.utc)
            for idx, p in enumerate(products):
                # Deterministic rating between 3.0 and 5.0, 1 decimal place
                p.rating = round(rng.uniform(3.0, 5.0), 1)
                # created_at spread over the last 12 months (5 to 365 days ago)
                days_ago = rng.uniform(5, 365)
                p.created_at = base_time - timedelta(days=days_ago)
            db.commit()
            print(f"[DB] Backfilled {len(products)} products with deterministic ratings & timestamps.")
    except Exception as e:
        print(f"[DB] Backfill notice: {e}")
        db.rollback()
    finally:
        db.close()


# ── App lifespan (startup / shutdown) ─────────────────────────────────────────
# The @asynccontextmanager lifespan hook replaces the deprecated @app.on_event
# pattern.  Everything BEFORE `yield` runs at startup; everything AFTER runs at
# shutdown (useful for closing connections, etc.).
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── STARTUP ──────────────────────────────────────────────────────────────
    # 1. Create all tables defined in our ORM models if they don't yet exist.
    models.Base.metadata.create_all(bind=engine)
    # Add image_url, rating, and created_at columns if the table already existed without them
    with engine.begin() as conn:
        conn.exec_driver_sql("ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);")
        conn.exec_driver_sql("ALTER TABLE products ADD COLUMN IF NOT EXISTS rating FLOAT;")
        conn.exec_driver_sql("ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();")
        conn.exec_driver_sql("ALTER TABLE products ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;")
    print("[DB] Tables created / verified with image_url, rating, created_at, is_archived.")

    # 2. Deterministic backfill for seed products
    backfill_seed_products()

    # 3. Update Elasticsearch mapping and reindex products
    elastic.update_mapping_and_reindex()
    print("[ES] Mapping and reindexing complete.")

    yield   # ← the app runs here (serves requests)

    # ── SHUTDOWN ─────────────────────────────────────────────────────────────
    print("[App] Shutting down.")


# ── FastAPI application instance ──────────────────────────────────────────────
app = FastAPI(
    title="Product Service",
    description="Manages products in PostgreSQL and indexes them in Elasticsearch for search.",
    version="1.0.0",
    lifespan=lifespan,   # register our startup/shutdown hook
)

# ── CORS middleware ───────────────────────────────────────────────────────────
# WHY THIS IS NEEDED:
# Browsers enforce the Same-Origin Policy: a page on localhost:5173 (React)
# cannot read responses from localhost:8001 (FastAPI) unless the server
# explicitly allows it via Access-Control-Allow-Origin headers.
# Without this middleware every API call from the frontend silently fails
# with a "Network Error" (the request is blocked before the response body
# is even read by JavaScript).
#
# allow_origins=["*"] permits all origins — fine for development.
cors_origins_env = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:8000,http://127.0.0.1:5173,http://127.0.0.1:8000,http://localhost,http://127.0.0.1")
cors_origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip() and origin.strip() != "*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],          # GET, POST, PUT, DELETE, OPTIONS, etc.
    allow_headers=["*"],          # Content-Type, Authorization, etc.
)


# ═════════════════════════════════════════════════════════════════════════════
#  GET /health  — Service health check
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/health", tags=["Health"])
def health_check():
    """Liveness probe for Product Service."""
    return {"status": "healthy", "service": "product-service"}


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
    _admin: dict = Depends(require_admin),
):
    """
    Create a new product with dual persistence and inventory synchronization.

    Steps:
    1. Save product to PostgreSQL (products_db).
    2. Synchronize initial stock with inventory-service (inventory_db).
       If inventory-service fails, trigger compensating rollback to prevent divergence.
    3. Index the product into Elasticsearch and immediately refresh the index.
    4. Invalidate local inventory cache and return the saved product.
    """
    product_dict = payload.model_dump()
    stock_qty = product_dict.get("stock_quantity", 0)

    # Step 1 — Persist to PostgreSQL
    new_product = models.Product(**product_dict)
    new_product.is_archived = False
    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    # Step 2 — Synchronize with inventory-service (authoritative stock source)
    inv_ok = create_inventory_record(new_product.id, stock_qty)
    if not inv_ok:
        # SAGA Compensation: rollback product record so we don't have orphan products without inventory
        print(f"[CreateProduct] SAGA compensation: deleting product #{new_product.id} due to inventory failure")
        db.delete(new_product)
        db.commit()
        raise HTTPException(
            status_code=502,
            detail="Failed to initialize stock record in inventory-service. Product creation rolled back to preserve consistency.",
        )

    # Step 3 — Mirror to Elasticsearch with embeddings
    doc_data = payload.model_dump()
    doc_data["is_archived"] = False
    doc_data["rating"] = new_product.rating
    doc_data["created_at"] = new_product.created_at.isoformat() if new_product.created_at else None
    elastic.index_product(
        product_id=new_product.id,
        product_data=doc_data,
    )
    elastic.refresh_index()

    # Step 4 — Invalidate cache so catalog refreshes reflect changes immediately
    inventory_cache.invalidate()

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
    skip:             int = Query(default=0,   ge=0,   description="Number of records to skip (pagination offset)"),
    limit:            int = Query(default=100, ge=1, le=1000, description="Max records to return"),
    category:         Optional[str] = Query(default=None, description="Optional category filter (e.g. 'Electronics')"),
    min_price:        Optional[float] = Query(default=None, ge=0, description="Minimum price filter"),
    max_price:        Optional[float] = Query(default=None, ge=0, description="Maximum price filter"),
    in_stock:         Optional[bool] = Query(default=None, description="If true, only returns items currently in stock in inventory-service"),
    sort:             Optional[str] = Query(default=None, description="Sort order: price_asc | price_desc | rating_desc | newest | name"),
    include_archived: bool = Query(default=False, description="If true, includes archived products (for admin view)"),
    archived_only:    bool = Query(default=False, description="If true, returns only archived products (for admin view)"),
    db: Session = Depends(get_db),
):
    """
    Return a paginated list of products from PostgreSQL with server-side filtering, sorting,
    and authoritative stock counts from inventory-service.
    """
    query = db.query(models.Product)

    if archived_only:
        query = query.filter(models.Product.is_archived.is_(True))
    elif not include_archived:
        query = query.filter(models.Product.is_archived.is_(False))

    if category and category.strip() and category.strip().lower() != "all":
        query = query.filter(models.Product.category.ilike(category.strip()))

    if min_price is not None:
        query = query.filter(models.Product.price >= min_price)

    if max_price is not None:
        query = query.filter(models.Product.price <= max_price)

    stock_map = inventory_cache.get_stock_map()
    if in_stock is True:
        in_stock_ids = [pid for pid, qty in stock_map.items() if qty > 0]
        query = query.filter(models.Product.id.in_(in_stock_ids))

    if sort == "price_asc":
        query = query.order_by(models.Product.price.asc(), models.Product.id.asc())
    elif sort == "price_desc":
        query = query.order_by(models.Product.price.desc(), models.Product.id.asc())
    elif sort == "rating_desc":
        query = query.order_by(models.Product.rating.desc().nullslast(), models.Product.id.asc())
    elif sort == "newest":
        query = query.order_by(models.Product.created_at.desc(), models.Product.id.asc())
    elif sort == "name":
        query = query.order_by(models.Product.name.asc(), models.Product.id.asc())
    else:
        query = query.order_by(models.Product.id.asc())

    products = query.offset(skip).limit(limit).all()

    # Ensure authoritative stock counts from inventory-service are reflected
    for p in products:
        if p.id in stock_map:
            p.stock_quantity = stock_map[p.id]

    return products


# ═════════════════════════════════════════════════════════════════════════════
#  GET /products/autocomplete  — Autocomplete / typeahead suggestions via Elasticsearch
#  ⚠ IMPORTANT: Must come BEFORE GET /products/{product_id}.
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/products/autocomplete",
    tags=["Products"],
)
def autocomplete_products(
    q: str = Query(..., min_length=1, description="Search prefix or query for product suggestions"),
    limit: int = Query(default=8, ge=1, le=20, description="Max suggestions to return"),
):
    """
    Search-as-you-type autocomplete returning matching product-name suggestions from Elasticsearch.
    """
    suggestions = elastic.autocomplete_products(query=q, limit=limit)
    return {"query": q, "suggestions": suggestions, "count": len(suggestions)}


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
    q:            str = Query(..., min_length=1, description="Search query string"),
    autocomplete: bool = Query(default=False, description="If true, return autocomplete suggestions"),
    mode:         str = Query(default="hybrid", description="Search mode: lexical | semantic | hybrid (default hybrid)"),
    category:     Optional[str] = Query(default=None, description="Optional category filter"),
    min_price:    Optional[float] = Query(default=None, ge=0, description="Minimum price filter"),
    max_price:    Optional[float] = Query(default=None, ge=0, description="Maximum price filter"),
    in_stock:     Optional[bool] = Query(default=None, description="If true, only returns items currently in stock in inventory-service"),
    sort:         Optional[str] = Query(default=None, description="Sort order: price_asc | price_desc | rating_desc | newest | name"),
    skip:         int = Query(default=0, ge=0, description="Number of records to skip (pagination offset)"),
    limit:        int = Query(default=100, ge=1, le=1000, description="Max records to return"),
):
    """
    Full-text and semantic search across product catalog using Elasticsearch,
    supporting lexical, semantic (kNN), and hybrid modes.
    """
    if autocomplete:
        suggestions = elastic.autocomplete_products(query=q, limit=limit if limit <= 20 else 8)
        return {"query": q, "suggestions": suggestions, "count": len(suggestions)}

    in_stock_ids = None
    if in_stock is True:
        stock_map = inventory_cache.get_stock_map()
        in_stock_ids = [pid for pid, qty in stock_map.items() if qty > 0]

    results = elastic.search_products(
        query=q,
        mode=mode,
        category=category,
        min_price=min_price,
        max_price=max_price,
        in_stock_ids=in_stock_ids,
        sort=sort,
        skip=skip,
        limit=limit,
    )

    if in_stock is True:
        stock_map = inventory_cache.get_stock_map()
        results = [r for r in results if stock_map.get(r["id"], 0) > 0]

    return {"query": q, "mode": mode, "results": results, "count": len(results)}


# ═════════════════════════════════════════════════════════════════════════════
#  GET /products/similar/{product_id}  — kNN vector similarity recommendations
#  ⚠ IMPORTANT: Must come BEFORE GET /products/{product_id}.
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/products/similar/{product_id}",
    tags=["Products"],
)
def get_similar_products(
    product_id: int,
    limit: int = Query(default=5, ge=1, le=20, description="Max similar products to return"),
):
    """
    Returns top similar products using kNN on the stored embedding vector, excluding itself.
    """
    similar = elastic.get_similar_products(product_id=product_id, limit=limit)
    if similar is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"product_id": product_id, "similar_products": similar, "count": len(similar)}


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
    Reflects live authoritative stock quantity from inventory-service.
    Returns 404 if no product with that id exists.
    """
    product = db.query(models.Product).filter(models.Product.id == product_id).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Reflect authoritative live stock from inventory-service
    stock_map = inventory_cache.get_stock_map()
    if product.id in stock_map:
        product.stock_quantity = stock_map[product.id]

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
    payload: schemas.ProductUpdate,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """
    Update an existing product (partial updates supported).

    Steps:
    1. Fetch existing product from PostgreSQL (404 if not found).
    2. If stock_quantity is modified, calibrate inventory-service first to keep
       inventory-service as the authoritative source. If inventory-service fails,
       abort the update to prevent divergence.
    3. Apply all other fields to PostgreSQL.
    4. Re-index the updated product in Elasticsearch and refresh index.
    5. Invalidate local inventory cache and return updated product.
    """
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    updates = payload.model_dump(exclude_unset=True)

    # If stock_quantity is being updated, synchronize with inventory-service (authoritative source)
    if "stock_quantity" in updates and updates["stock_quantity"] is not None:
        target_stock = int(updates["stock_quantity"])
        inv_ok = set_inventory_stock_remote(product_id, target_stock)
        if not inv_ok:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to calibrate stock in inventory-service for product #{product_id}. Update rejected to preserve inventory consistency.",
            )

    for field, value in updates.items():
        setattr(product, field, value)

    db.commit()
    db.refresh(product)

    # Re-sync Elasticsearch
    elastic.index_product(
        product_id=product.id,
        product_data={
            "name":           product.name,
            "category":       product.category,
            "price":          float(product.price),
            "description":    product.description,
            "stock_quantity": product.stock_quantity,
            "image_url":      product.image_url,
            "rating":         product.rating,
            "created_at":     product.created_at.isoformat() if product.created_at else None,
            "is_archived":    bool(product.is_archived),
        },
    )
    elastic.refresh_index()

    inventory_cache.invalidate()

    return product


# ═════════════════════════════════════════════════════════════════════════════
#  DELETE /products/{id}  — Safe Archive a product
# ═════════════════════════════════════════════════════════════════════════════
@app.delete(
    "/products/{product_id}",
    tags=["Products"],
)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """
    Safely archives a product rather than permanently deleting it.
    Preserves historical order manifests, analytics rollups, and referential integrity.
    Archived products are hidden from public catalog and cannot be purchased.
    """
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.is_archived = True
    db.commit()
    db.refresh(product)

    elastic.index_product(
        product_id=product.id,
        product_data={
            "name":           product.name,
            "category":       product.category,
            "price":          float(product.price),
            "description":    product.description,
            "stock_quantity": product.stock_quantity,
            "image_url":      product.image_url,
            "rating":         product.rating,
            "created_at":     product.created_at.isoformat() if product.created_at else None,
            "is_archived":    True,
        },
    )
    elastic.refresh_index()
    inventory_cache.invalidate()

    return {
        "status": "archived",
        "product_id": product_id,
        "is_archived": True,
        "message": f"Product #{product_id} ('{product.name}') has been archived safely. Historical order references preserved.",
    }


# ═════════════════════════════════════════════════════════════════════════════
#  PUT /products/{id}/restore  — Restore an archived product
# ═════════════════════════════════════════════════════════════════════════════
@app.put(
    "/products/{product_id}/restore",
    response_model=schemas.ProductResponse,
    tags=["Products"],
)
def restore_product(
    product_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """
    Restores an archived product back to active status in catalog and search.
    """
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.is_archived = False
    db.commit()
    db.refresh(product)

    elastic.index_product(
        product_id=product.id,
        product_data={
            "name":           product.name,
            "category":       product.category,
            "price":          float(product.price),
            "description":    product.description,
            "stock_quantity": product.stock_quantity,
            "image_url":      product.image_url,
            "rating":         product.rating,
            "created_at":     product.created_at.isoformat() if product.created_at else None,
            "is_archived":    False,
        },
    )
    elastic.refresh_index()
    inventory_cache.invalidate()

    stock_map = inventory_cache.get_stock_map()
    if product.id in stock_map:
        product.stock_quantity = stock_map[product.id]

    return product


# ─────────────────────────────────────────────────────────────────────────────
# Run directly with:  python main.py
# Or via uvicorn:     uvicorn main:app --reload --port 8006
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8006, reload=True)
