# main.py
# ─────────────────────────────────────────────────────────────────────────────
# Admin Analytics Service — FastAPI entry point.
#
# All endpoints are read-only analytical queries.  They use DuckDB's
# postgres_scanner to query the products_db PostgreSQL database directly.
#
# Endpoints:
#   GET /analytics/total-products    → count of all products
#   GET /analytics/category-summary  → count + avg price per category
#   GET /analytics/low-stock         → products below stock threshold
#   GET /analytics/price-range       → min / max / avg price globally
#   GET /health                      → liveness check (also tests DB connectivity)
# ─────────────────────────────────────────────────────────────────────────────

from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

from database import get_duckdb_connection, LOW_STOCK_THRESHOLD


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic response models
# Defining explicit response shapes:
#   • Makes FastAPI auto-generate accurate OpenAPI / Swagger docs
#   • Validates that our SQL results match the expected structure
#   • Documents intent clearly for anyone reading the code
# ─────────────────────────────────────────────────────────────────────────────

class TotalProductsResponse(BaseModel):
    total_products: int


class CategorySummaryItem(BaseModel):
    category:      str
    product_count: int
    average_price: float


class LowStockItem(BaseModel):
    id:             int
    name:           str
    category:       str
    stock_quantity: int
    price:          float


class PriceRangeResponse(BaseModel):
    min_price: float
    max_price: float
    avg_price: float


# ─────────────────────────────────────────────────────────────────────────────
# App lifespan — verify DB connectivity at startup
# ─────────────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: perform a lightweight connectivity check against PostgreSQL
    via DuckDB so we surface misconfigurations immediately (bad DSN, PG not
    running) rather than on the first real request.
    """
    try:
        con = get_duckdb_connection()
        # Simple query — asks DuckDB to list tables in the attached PG database.
        # If this succeeds, both DuckDB and the PG connection are healthy.
        con.execute("SHOW TABLES FROM pg_products;").fetchall()
        con.close()
        print("[Startup] DuckDB ↔ PostgreSQL connection verified ✓")
    except Exception as e:
        # Log the error but don't crash — the service can still start and
        # return 503 errors per-request if the DB comes up later.
        print(f"[Startup] WARNING: Could not connect to PostgreSQL: {e}")

    yield   # app runs here

    print("[Shutdown] Admin Analytics Service stopped.")


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI app
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Admin Analytics Service",
    description=(
        "Read-only analytical API powered by DuckDB's postgres_scanner. "
        "Queries product data from PostgreSQL without data migration."
    ),
    version="1.0.0",
    lifespan=lifespan,
)


# ─────────────────────────────────────────────────────────────────────────────
# Helper — run a query and handle connection errors uniformly
# ─────────────────────────────────────────────────────────────────────────────
def run_query(sql: str, params: list = None):
    """
    Opens a DuckDB connection, executes `sql`, returns all rows as a list of
    dicts (column_name → value), then closes the connection.

    Wraps all exceptions in an HTTPException 503 so callers get a clear,
    structured error response instead of a raw Python traceback.

    Why return list-of-dicts instead of raw tuples?
    • Tuples require callers to know column positions by index — fragile.
    • Dicts are self-documenting and map cleanly to Pydantic models.
    """
    try:
        con = get_duckdb_connection()

        result = con.execute(sql, params or [])

        # fetchdf() returns a pandas DataFrame — convenient, but adds a heavy
        # dependency.  Instead we use description + fetchall() for a zero-extra-
        # dependency approach:
        #   result.description → list of (col_name, ...) tuples
        #   result.fetchall()  → list of row tuples
        columns = [desc[0] for desc in result.description]
        rows    = result.fetchall()
        con.close()

        # Zip column names with each row's values → list of dicts
        return [dict(zip(columns, row)) for row in rows]

    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Analytics query failed: {str(e)}",
        )


# ═════════════════════════════════════════════════════════════════════════════
#  GET /health  — Liveness + DB connectivity check
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/health", tags=["Health"])
def health_check():
    """
    Confirms the service is alive and can reach PostgreSQL via DuckDB.
    Useful for Docker health checks and load-balancer probes.
    """
    try:
        con = get_duckdb_connection()
        # COUNT(*) on products is a trivial but real query — proves the full
        # DuckDB → postgres_scanner → PG pipeline is working end-to-end.
        count = con.execute(
            "SELECT COUNT(*) FROM pg_products.products;"
        ).fetchone()[0]
        con.close()
        return {"status": "healthy", "products_in_db": count}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Unhealthy: {str(e)}")


# ═════════════════════════════════════════════════════════════════════════════
#  GET /analytics/total-products
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/analytics/total-products",
    response_model=TotalProductsResponse,
    tags=["Analytics"],
)
def total_products():
    """
    Returns the total count of all products in the database.

    DuckDB advantage here:
    ─────────────────────
    COUNT(*) is a perfect candidate for DuckDB's columnar execution:
    • DuckDB doesn't even need to read column data — it can count row groups
      directly from metadata in many file formats.
    • Over postgres_scanner it fetches only the minimal data needed to count.
    • On Postgres directly, the same COUNT(*) requires a full sequential scan
      (unless there's a live tuple count in pg_class, which is approximate).
    """
    sql = """
        -- Count every row in the products table.
        -- pg_products is the alias we gave the ATTACH'd PostgreSQL database.
        -- Using the schema-qualified name (pg_products.products) avoids any
        -- ambiguity if DuckDB has its own local tables with the same name.
        SELECT COUNT(*) AS total_products
        FROM   pg_products.products;
    """
    rows = run_query(sql)
    # rows[0] is the single result row dict: {"total_products": 42}
    return rows[0]


# ═════════════════════════════════════════════════════════════════════════════
#  GET /analytics/category-summary
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/analytics/category-summary",
    response_model=List[CategorySummaryItem],
    tags=["Analytics"],
)
def category_summary():
    """
    Returns the number of products and average price for each category,
    sorted by product count descending (busiest category first).

    DuckDB advantage here:
    ─────────────────────
    GROUP BY + AVG is exactly the kind of aggregation DuckDB shines at:
    • DuckDB uses vectorised (SIMD) execution — it processes 1024+ values
      at once instead of row-by-row like traditional engines.
    • For large product catalogues (millions of rows), this is significantly
      faster than running the same GROUP BY on Postgres because DuckDB only
      fetches the 'category' and 'price' columns (projection pushdown) rather
      than every column of every row.
    • Result: the heavy computation happens in-process (no extra network
      round-trips for intermediate aggregation data).
    """
    sql = """
        SELECT
            category,                              -- group key
            COUNT(*)         AS product_count,     -- number of products in category
            ROUND(AVG(price), 2) AS average_price  -- average price, 2 decimal places
        FROM  pg_products.products
        GROUP BY category
        ORDER BY product_count DESC;               -- most popular categories first
    """
    return run_query(sql)


# ═════════════════════════════════════════════════════════════════════════════
#  GET /analytics/low-stock
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/analytics/low-stock",
    response_model=List[LowStockItem],
    tags=["Analytics"],
)
def low_stock(
    threshold: int = Query(
        default=LOW_STOCK_THRESHOLD,   # reads from .env, so it's configurable
        ge=0,
        description="Products with stock_quantity strictly below this number are returned.",
    ),
):
    """
    Returns all products whose stock_quantity is below the given threshold.

    The threshold defaults to LOW_STOCK_THRESHOLD from .env (default: 10),
    but can be overridden per-request via ?threshold=N — useful for the
    frontend to dynamically adjust the alert level.

    DuckDB advantage here:
    ─────────────────────
    While this query is simple (WHERE filter), DuckDB can push the predicate
    down to Postgres via postgres_scanner so only matching rows cross the wire
    — equivalent to running the filter in PG directly, but the response
    flows into DuckDB's execution pipeline for any further operations you
    might layer on top (e.g., joining with local DuckDB data).
    """
    sql = """
        SELECT
            id,
            name,
            category,
            stock_quantity,
            price
        FROM  pg_products.products
        WHERE stock_quantity < ?          -- ? is DuckDB's positional parameter placeholder
        ORDER BY stock_quantity ASC;      -- lowest stock first = highest urgency first
    """
    # Passing threshold as a parameter (not f-string interpolation) prevents
    # SQL injection, even though this is an internal analytics service.
    return run_query(sql, params=[threshold])


# ═════════════════════════════════════════════════════════════════════════════
#  GET /analytics/price-range
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/analytics/price-range",
    response_model=PriceRangeResponse,
    tags=["Analytics"],
)
def price_range():
    """
    Returns the minimum, maximum, and average price across all products.

    DuckDB advantage here:
    ─────────────────────
    MIN / MAX / AVG are single-pass aggregations — DuckDB computes all three
    in one scan of the 'price' column.  Because DuckDB is column-oriented, it
    reads ONLY the price column from PostgreSQL (not name, description, etc.),
    which minimises network transfer and disk I/O proportionally to the number
    of columns in the table.

    On a wide table (e.g. 20+ columns) this difference is dramatic:
      Postgres direct: reads all 20+ columns per row across the network
      DuckDB via scanner: reads only the 1 column it needs
    """
    sql = """
        SELECT
            ROUND(MIN(price), 2) AS min_price,   -- cheapest product
            ROUND(MAX(price), 2) AS max_price,   -- most expensive product
            ROUND(AVG(price), 2) AS avg_price    -- mean price across all products
        FROM pg_products.products;
    """
    rows = run_query(sql)
    return rows[0]


# ─────────────────────────────────────────────────────────────────────────────
# Run directly with:  python main.py
# Or via uvicorn:     uvicorn main:app --reload --port 8002
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)
