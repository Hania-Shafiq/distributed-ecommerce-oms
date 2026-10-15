# main.py
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Admin Analytics Service â€” FastAPI entry point.
#
# Analytics store: Elasticsearch "analytics" index
#   (fed by sync_orders.py batch sync from orders_db + products_db PostgreSQL)
#
# Endpoints:
#   GET /health                          â†’ liveness check (pings ES)
#
#   â”€â”€ Order analytics (Elasticsearch aggregations) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
#   GET /analytics/top-selling-products  â†’ top products by total quantity sold
#   GET /analytics/revenue-by-category   â†’ total revenue per product category
#   GET /analytics/order-status          â†’ count per status (PENDING/CONFIRMED/FAILED)
#
#   â”€â”€ Product analytics (direct PostgreSQL query via psycopg2) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
#   GET /analytics/total-products        â†’ count of all products
#   GET /analytics/category-summary      â†’ count + avg price per category
#   GET /analytics/low-stock             â†’ products below stock threshold
#   GET /analytics/price-range           â†’ min / max / avg price globally
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

from contextlib import asynccontextmanager
from typing import List
import os

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from database import es_client, create_analytics_index_if_not_exists, LOW_STOCK_THRESHOLD
from elastic import ANALYTICS_INDEX

load_dotenv()

# Products DB DSN â€” used only for the product-catalogue endpoints
PRODUCTS_DB_URL = os.getenv(
    "PRODUCTS_DB_URL",
    "postgresql://postgres:postgres@localhost:5434/products_db",
)


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Pydantic response models
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class TopSellingProductItem(BaseModel):
    product_id:   str
    product_name: str
    total_quantity: int


class RevenueByCategoryItem(BaseModel):
    category:      str
    total_revenue: float


class OrderStatusItem(BaseModel):
    status: str
    count:  int


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


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# App lifespan â€” verify ES connectivity and bootstrap index
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: ping Elasticsearch and create the 'analytics' index if missing.
    We do this at startup so misconfigurations (wrong ES URL, ES down) surface
    immediately rather than on the first real request.
    """
    try:
        if es_client.ping():
            create_analytics_index_if_not_exists()
            print("[Startup] Elasticsearch connection verified âœ“")
        else:
            print("[Startup] WARNING: Elasticsearch ping failed â€” check ELASTICSEARCH_URL")
    except Exception as e:
        print(f"[Startup] WARNING: Could not connect to Elasticsearch: {e}")

    yield  # app runs here

    print("[Shutdown] Admin Analytics Service stopped.")


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# FastAPI app
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app = FastAPI(
    title="Admin Analytics Service",
    description=(
        "Read-only analytical API powered by Elasticsearch aggregations. "
        "Order analytics are served from the 'analytics' ES index (fed by "
        "sync_orders.py). Product catalogue analytics query products_db directly."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Helper â€” direct psycopg2 connection to products_db
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def get_products_conn():
    """
    Returns a psycopg2 connection to products_db (used by product-catalogue
    endpoints).  psycopg2 is lightweight, already installed as an indirect dep
    via sync_orders.py, and perfectly adequate for the simple SELECT queries in
    this service (no ORM overhead needed for read-only analytics).
    """
    return psycopg2.connect(
        PRODUCTS_DB_URL,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  GET /health  â€” Liveness + connectivity check
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
@app.get("/health", tags=["Health"])
def health_check():
    """
    Confirms the service is alive and can reach Elasticsearch.
    Returns the document count in the 'analytics' index as a sanity signal.
    """
    try:
        if not es_client.ping():
            raise Exception("Elasticsearch ping returned False")
        count = es_client.count(index=ANALYTICS_INDEX)["count"]
        return {
            "status": "healthy",
            "analytics_documents": count,
            "analytics_store": "elasticsearch",
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Unhealthy: {str(e)}")


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  GET /analytics/top-selling-products
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
@app.get(
    "/analytics/top-selling-products",
    response_model=List[TopSellingProductItem],
    tags=["Order Analytics"],
)
def top_selling_products(
    limit: int = Query(default=10, ge=1, le=100, description="Number of top products to return"),
):
    """
    Returns the top-selling products ranked by total quantity sold across all
    CONFIRMED orders.

    Elasticsearch aggregation used:
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    1. Filter: only CONFIRMED orders (status = "CONFIRMED")
    2. Terms agg on product_id   â†’ groups docs by product
    3. Sub-agg: top_hits on product_name â†’ retrieves the name for display
    4. Sub-agg: sum of quantity  â†’ total units sold per product
    5. bucket_sort: sort buckets by quantity_sum descending, take top `limit`

    Why ES instead of SQL?
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ES runs all aggregations in a single scan of the pre-indexed analytics data.
    No JOIN back to the products table is needed because product_name is
    already denormalised into the analytics index by sync_orders.py.
    """
    body = {
        "size": 0,  # we only want aggregation results, not raw hits
        "query": {
            "term": {"status": "CONFIRMED"}
        },
        "aggs": {
            "by_product": {
                "terms": {
                    "field": "product_id",
                    "size": limit,
                    "order": {"quantity_sum": "desc"},
                },
                "aggs": {
                    # Sum of quantity sold per product
                    "quantity_sum": {"sum": {"field": "quantity"}},
                    # Grab one hit to extract product_name
                    "product_info": {
                        "top_hits": {
                            "size": 1,
                            "_source": ["product_name"],
                        }
                    },
                },
            }
        },
    }

    try:
        resp = es_client.search(index=ANALYTICS_INDEX, body=body)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Analytics query failed: {str(e)}")

    results = []
    for bucket in resp["aggregations"]["by_product"]["buckets"]:
        hits = bucket["product_info"]["hits"]["hits"]
        name = hits[0]["_source"].get("product_name", "Unknown") if hits else "Unknown"
        results.append(TopSellingProductItem(
            product_id=bucket["key"],
            product_name=name,
            total_quantity=int(bucket["quantity_sum"]["value"]),
        ))
    return results


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  GET /analytics/revenue-by-category
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
@app.get(
    "/analytics/revenue-by-category",
    response_model=List[RevenueByCategoryItem],
    tags=["Order Analytics"],
)
def revenue_by_category():
    """
    Returns total revenue (sum of quantity Ã— unit_price) per product category,
    sorted by revenue descending, across all CONFIRMED orders.

    Elasticsearch aggregation:
    â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    1. Filter: status = "CONFIRMED"
    2. Terms agg on category (keyword field)
    3. Sub-agg: sum of the pre-computed `revenue` field

    The `revenue` field (quantity Ã— unit_price) is stored in each document by
    sync_orders.py so ES can sum it cheaply without any per-document arithmetic.
    """
    body = {
        "size": 0,
        "query": {"term": {"status": "CONFIRMED"}},
        "aggs": {
            "by_category": {
                "terms": {
                    "field": "category",
                    "size": 100,
                    "order": {"revenue_sum": "desc"},
                },
                "aggs": {
                    "revenue_sum": {"sum": {"field": "revenue"}},
                },
            }
        },
    }

    try:
        resp = es_client.search(index=ANALYTICS_INDEX, body=body)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Analytics query failed: {str(e)}")

    return [
        RevenueByCategoryItem(
            category=bucket["key"],
            total_revenue=round(bucket["revenue_sum"]["value"], 2),
        )
        for bucket in resp["aggregations"]["by_category"]["buckets"]
    ]


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  GET /analytics/order-status
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
@app.get(
    "/analytics/order-status",
    response_model=List[OrderStatusItem],
    tags=["Order Analytics"],
)
def order_status_breakdown():
    """
    Returns the count of orders per status (PENDING, CONFIRMED, FAILED).
    Aggregates the pre-computed `order_count` field from the daily rollup documents.
    """
    body = {
        "size": 0,
        "aggs": {
            "by_status": {
                "terms": {
                    "field": "status",
                    "size": 10,
                },
                "aggs": {
                    "total_orders": {
                        "sum": {
                            "field": "order_count",
                        }
                    }
                },
            }
        },
    }

    try:
        resp = es_client.search(index=ANALYTICS_INDEX, body=body)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Analytics query failed: {str(e)}")

    return [
        OrderStatusItem(
            status=bucket["key"],
            count=int(bucket["total_orders"]["value"]),
        )
        for bucket in resp["aggregations"]["by_status"]["buckets"]
    ]


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Helper â€” run a raw SQL query against products_db
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def run_products_query(sql: str, params: list = None) -> list[dict]:
    """
    Execute a SELECT against products_db and return results as list-of-dicts.
    Used by the product-catalogue analytics endpoints below.
    Wraps all DB errors in HTTPException 503.
    """
    try:
        conn = get_products_conn()
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            rows = cur.fetchall()
        conn.close()
        return [dict(row) for row in rows]
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Product DB query failed: {str(e)}")


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  GET /analytics/total-products
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
@app.get(
    "/analytics/total-products",
    response_model=TotalProductsResponse,
    tags=["Product Analytics"],
)
def total_products():
    """Returns the total count of all products in products_db."""
    rows = run_products_query("SELECT COUNT(*) AS total_products FROM products;")
    return rows[0]


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  GET /analytics/category-summary
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
@app.get(
    "/analytics/category-summary",
    response_model=List[CategorySummaryItem],
    tags=["Product Analytics"],
)
def category_summary():
    """Returns count of products and average price per category."""
    sql = """
        SELECT
            category,
            COUNT(*)              AS product_count,
            ROUND(AVG(price)::numeric, 2) AS average_price
        FROM  products
        GROUP BY category
        ORDER BY product_count DESC;
    """
    return run_products_query(sql)


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  GET /analytics/low-stock
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
@app.get(
    "/analytics/low-stock",
    response_model=List[LowStockItem],
    tags=["Product Analytics"],
)
def low_stock(
    threshold: int = Query(
        default=LOW_STOCK_THRESHOLD,
        ge=0,
        description="Products with stock_quantity strictly below this value are returned.",
    ),
):
    """Returns products whose stock_quantity is below the given threshold."""
    sql = """
        SELECT id, name, category, stock_quantity, price
        FROM  products
        WHERE stock_quantity < %s
        ORDER BY stock_quantity ASC;
    """
    return run_products_query(sql, params=[threshold])


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  GET /analytics/price-range
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
@app.get(
    "/analytics/price-range",
    response_model=PriceRangeResponse,
    tags=["Product Analytics"],
)
def price_range():
    """Returns min, max, and average price across all products."""
    sql = """
        SELECT
            ROUND(MIN(price)::numeric, 2) AS min_price,
            ROUND(MAX(price)::numeric, 2) AS max_price,
            ROUND(AVG(price)::numeric, 2) AS avg_price
        FROM products;
    """
    rows = run_products_query(sql)
    return rows[0]


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Run directly with:  python main.py
# Or via uvicorn:     uvicorn main:app --reload --port 8002
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)

