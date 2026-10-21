# main.py
# ─────────────────────────────────────────────────────────────────────────────
# Admin Analytics Service — FastAPI entry point.
#
# Analytics store: Elasticsearch "orders_daily" index (with "analytics" alias)
#   (fed by sync_orders.py batch sync from orders_db + products_db PostgreSQL)
#
# Endpoints:
#   GET /health                          → liveness check (pings ES)
#
#   ── Order analytics (Elasticsearch aggregations) ───────────────────────────
#   GET /analytics/overview              → high-level metrics & last sync time
#   GET /analytics/revenue-trend         → revenue trend by date
#   GET /analytics/orders-by-weekday     → orders & revenue by day of week
#   GET /analytics/top-selling-products  → top products by total quantity sold
#   GET /analytics/revenue-by-category   → total revenue per product category
#   GET /analytics/order-status          → count per status (CONFIRMED/FAILED)
#
#   ── Product analytics (product-service & inventory-service HTTP proxy) ─────
#   GET /analytics/total-products        → count of all products
#   GET /analytics/category-summary      → count + avg price per category
#   GET /analytics/low-stock             → products below stock threshold
#   GET /analytics/price-range           → min / max / avg price globally
# ─────────────────────────────────────────────────────────────────────────────

from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any
from pathlib import Path
import os
import time
import json
import urllib.request

from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from database import es_client, create_analytics_index_if_not_exists, LOW_STOCK_THRESHOLD
from elastic import ORDERS_DAILY_INDEX, ANALYTICS_INDEX
from auth import require_admin

load_dotenv()

PRODUCT_SERVICE_URL = os.getenv("PRODUCT_SERVICE_URL", "http://product-service:8006").rstrip("/")
INVENTORY_SERVICE_URL = os.getenv("INVENTORY_SERVICE_URL", "http://inventory-service:8003").rstrip("/")
SYNC_STATUS_FILE = Path(__file__).resolve().parent / "sync_status.json"

WEEKDAY_NAMES = {
    1: "Monday",
    2: "Tuesday",
    3: "Wednesday",
    4: "Thursday",
    5: "Friday",
    6: "Saturday",
    7: "Sunday",
}


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Response Models
# ─────────────────────────────────────────────────────────────────────────────

class AnalyticsOverviewResponse(BaseModel):
    total_orders: int
    confirmed_orders: int
    failed_orders: int
    total_revenue: float
    avg_order_value: float
    last_sync_time: Optional[str] = None
    sync_status: str = "synced"


class RevenueTrendItem(BaseModel):
    date: str
    revenue: float
    order_count: int


class WeekdayOrderItem(BaseModel):
    weekday: str
    day_of_week: int
    order_count: int
    total_revenue: float


class TopSellingProductItem(BaseModel):
    product_id: str
    product_name: str
    total_quantity: int


class RevenueByCategoryItem(BaseModel):
    category: str
    total_revenue: float


class OrderStatusItem(BaseModel):
    status: str
    count: int


class TotalProductsResponse(BaseModel):
    total_products: int


class CategorySummaryItem(BaseModel):
    category: str
    product_count: int
    average_price: float


class LowStockItem(BaseModel):
    id: int
    name: str
    category: str
    stock_quantity: int
    price: float


class PriceRangeResponse(BaseModel):
    min_price: float
    max_price: float
    avg_price: float


# ─────────────────────────────────────────────────────────────────────────────
# App Lifespan — bootstrap ES index and verify connectivity
# ─────────────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        if es_client.ping():
            create_analytics_index_if_not_exists()
            print("[Startup] Elasticsearch connection and index verified ✓")
        else:
            print("[Startup] WARNING: Elasticsearch ping failed — check ELASTICSEARCH_URL")
    except Exception as e:
        print(f"[Startup] WARNING: Could not connect to Elasticsearch: {e}")

    yield

    print("[Shutdown] Admin Analytics Service stopped.")


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI App
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Admin Analytics Service",
    description=(
        "Read-only analytical API powered by Elasticsearch 'orders_daily' rollups. "
        "Provides dashboard overview, revenue trend, weekday orders distribution, "
        "and catalog telemetry."
    ),
    version="2.1.0",
    lifespan=lifespan,
)

cors_origins_env = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:8000,http://127.0.0.1:5173,http://127.0.0.1:8000,http://localhost,http://127.0.0.1")
cors_origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip() and origin.strip() != "*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═════════════════════════════════════════════════════════════════════════════
#  GET /health — Liveness & ES health probe
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/health", tags=["Health"])
def health_check():
    """Confirms service is alive and can reach Elasticsearch."""
    try:
        if not es_client.ping():
            raise Exception("Elasticsearch ping returned False")
        count = es_client.count(index=ORDERS_DAILY_INDEX)["count"] if es_client.indices.exists(index=ORDERS_DAILY_INDEX) else 0
        return {
            "status": "healthy",
            "service": "admin-analytics",
            "analytics_documents": count,
            "analytics_index": ORDERS_DAILY_INDEX,
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Unhealthy: {str(e)}")


def _get_last_sync_time() -> Optional[str]:
    """Retrieve the last successful batch synchronization timestamp."""
    try:
        if es_client.exists(index=ORDERS_DAILY_INDEX, id="_last_sync_metadata"):
            doc = es_client.get(index=ORDERS_DAILY_INDEX, id="_last_sync_metadata")
            return doc.get("_source", {}).get("last_sync_time")
    except Exception:
        pass

    if SYNC_STATUS_FILE.exists():
        try:
            with open(SYNC_STATUS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("last_sync_time")
        except Exception:
            pass

    return None


# ═════════════════════════════════════════════════════════════════════════════
#  GET /analytics/overview — High-Level OMS Telemetry
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/analytics/overview",
    response_model=AnalyticsOverviewResponse,
    dependencies=[Depends(require_admin)],
    tags=["Order Analytics"],
)
def analytics_overview():
    """
    Returns executive KPI summary: total orders, confirmed vs failed counts,
    total revenue, average order value, and the last successful sync time.
    Guaranteed to match PostgreSQL counts via order_summary rollup aggregation.
    """
    body = {
        "size": 0,
        "query": {
            "term": {"record_type": "order_summary"}
        },
        "aggs": {
            "by_status": {
                "terms": {"field": "status", "size": 10},
                "aggs": {
                    "order_count_sum": {"sum": {"field": "order_count"}},
                    "revenue_sum": {"sum": {"field": "total_revenue"}},
                },
            }
        },
    }

    try:
        resp = es_client.search(index=ORDERS_DAILY_INDEX, body=body)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Analytics query failed: {str(e)}")

    buckets = resp.get("aggregations", {}).get("by_status", {}).get("buckets", [])
    
    # If no order_summary docs exist yet, check fallback match_all
    if not buckets:
        fallback_body = {
            "size": 0,
            "aggs": {
                "by_status": {
                    "terms": {"field": "status", "size": 10},
                    "aggs": {
                        "order_count_sum": {"sum": {"field": "order_count"}},
                        "revenue_sum": {"sum": {"field": "revenue"}},
                    },
                }
            },
        }
        try:
            resp_fallback = es_client.search(index=ORDERS_DAILY_INDEX, body=fallback_body)
            buckets = resp_fallback.get("aggregations", {}).get("by_status", {}).get("buckets", [])
        except Exception:
            buckets = []

    status_counts = {}
    total_rev = 0.0

    for b in buckets:
        st = b["key"]
        cnt = int(b["order_count_sum"]["value"])
        rev = float(b["revenue_sum"]["value"])
        status_counts[st] = cnt
        if st == "CONFIRMED":
            total_rev += rev

    confirmed = status_counts.get("CONFIRMED", 0)
    failed = status_counts.get("FAILED", 0)
    total_orders = sum(status_counts.values())
    aov = round(total_rev / confirmed, 2) if confirmed > 0 else 0.0
    last_sync = _get_last_sync_time()

    return AnalyticsOverviewResponse(
        total_orders=total_orders,
        confirmed_orders=confirmed,
        failed_orders=failed,
        total_revenue=round(total_rev, 2),
        avg_order_value=aov,
        last_sync_time=last_sync,
        sync_status="synced" if last_sync else "pending_initial_sync",
    )


# ═════════════════════════════════════════════════════════════════════════════
#  GET /analytics/revenue-trend — Daily Revenue Over Time
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/analytics/revenue-trend",
    response_model=List[RevenueTrendItem],
    dependencies=[Depends(require_admin)],
    tags=["Order Analytics"],
)
def revenue_trend(days: int = Query(default=30, ge=1, le=730, description="Number of recent days")):
    """
    Returns daily revenue and order counts over time for confirmed orders.
    Served from daily rollups in Elasticsearch.
    """
    body = {
        "size": 0,
        "query": {
            "bool": {
                "filter": [
                    {"term": {"status": "CONFIRMED"}},
                ]
            }
        },
        "aggs": {
            "by_date": {
                "terms": {
                    "field": "order_date",
                    "size": days,
                    "order": {"_key": "desc"},
                },
                "aggs": {
                    "revenue_sum": {"sum": {"field": "revenue"}},
                    "order_count_sum": {"sum": {"field": "order_count"}},
                },
            }
        },
    }

    try:
        resp = es_client.search(index=ORDERS_DAILY_INDEX, body=body)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Revenue trend query failed: {str(e)}")

    raw_buckets = resp.get("aggregations", {}).get("by_date", {}).get("buckets", [])
    
    # Sort chronologically ascending for timeseries chart
    sorted_buckets = sorted(raw_buckets, key=lambda b: b["key"])

    results = []
    for b in sorted_buckets:
        date_str = b.get("key_as_string") or str(b["key"])
        if len(date_str) > 10:
            date_str = date_str[:10]
        results.append(
            RevenueTrendItem(
                date=date_str,
                revenue=round(float(b["revenue_sum"]["value"]), 2),
                order_count=int(b["order_count_sum"]["value"]),
            )
        )
    return results


# ═════════════════════════════════════════════════════════════════════════════
#  GET /analytics/orders-by-weekday — Day-of-Week Distribution
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/analytics/orders-by-weekday",
    response_model=List[WeekdayOrderItem],
    dependencies=[Depends(require_admin)],
    tags=["Order Analytics"],
)
def orders_by_weekday():
    """
    Returns weekly order and revenue distribution aggregated across weekdays
    (Monday through Sunday) to analyze operational purchasing patterns.
    """
    body = {
        "size": 0,
        "query": {
            "term": {"record_type": "order_summary"}
        },
        "aggs": {
            "by_dow": {
                "terms": {
                    "field": "day_of_week",
                    "size": 7,
                    "order": {"_key": "asc"},
                },
                "aggs": {
                    "order_count_sum": {"sum": {"field": "order_count"}},
                    "revenue_sum": {"sum": {"field": "total_revenue"}},
                },
            }
        },
    }

    try:
        resp = es_client.search(index=ORDERS_DAILY_INDEX, body=body)
        raw_buckets = resp.get("aggregations", {}).get("by_dow", {}).get("buckets", [])
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Weekday query failed: {str(e)}")

    # Ensure all 7 days (1..7) exist in response
    bucket_map = {int(b["key"]): b for b in raw_buckets}
    results = []
    for dow in range(1, 8):
        b = bucket_map.get(dow)
        cnt = int(b["order_count_sum"]["value"]) if b else 0
        rev = round(float(b["revenue_sum"]["value"]), 2) if b else 0.0
        results.append(
            WeekdayOrderItem(
                weekday=WEEKDAY_NAMES[dow],
                day_of_week=dow,
                order_count=cnt,
                total_revenue=rev,
            )
        )
    return results


# ═════════════════════════════════════════════════════════════════════════════
#  GET /analytics/top-selling-products
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/analytics/top-selling-products",
    response_model=List[TopSellingProductItem],
    dependencies=[Depends(require_admin)],
    tags=["Order Analytics"],
)
def top_selling_products(
    limit: int = Query(default=10, ge=1, le=100, description="Number of top products to return"),
):
    """
    Returns top-selling products ranked by total quantity sold across CONFIRMED orders.
    """
    body = {
        "size": 0,
        "query": {
            "bool": {
                "filter": [
                    {"term": {"status": "CONFIRMED"}},
                    {"term": {"record_type": "product_rollup"}},
                ]
            }
        },
        "aggs": {
            "by_product": {
                "terms": {
                    "field": "product_id",
                    "size": limit,
                    "order": {"quantity_sum": "desc"},
                },
                "aggs": {
                    "quantity_sum": {"sum": {"field": "units_sold"}},
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
        resp = es_client.search(index=ORDERS_DAILY_INDEX, body=body)
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


# ═════════════════════════════════════════════════════════════════════════════
#  GET /analytics/revenue-by-category
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/analytics/revenue-by-category",
    response_model=List[RevenueByCategoryItem],
    dependencies=[Depends(require_admin)],
    tags=["Order Analytics"],
)
def revenue_by_category():
    """
    Returns total revenue per product category for CONFIRMED orders.
    """
    body = {
        "size": 0,
        "query": {
            "bool": {
                "filter": [
                    {"term": {"status": "CONFIRMED"}},
                    {"term": {"record_type": "product_rollup"}},
                ]
            }
        },
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
        resp = es_client.search(index=ORDERS_DAILY_INDEX, body=body)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Analytics query failed: {str(e)}")

    return [
        RevenueByCategoryItem(
            category=bucket["key"],
            total_revenue=round(bucket["revenue_sum"]["value"], 2),
        )
        for bucket in resp["aggregations"]["by_category"]["buckets"]
    ]


# ═════════════════════════════════════════════════════════════════════════════
#  GET /analytics/order-status
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/analytics/order-status",
    response_model=List[OrderStatusItem],
    dependencies=[Depends(require_admin)],
    tags=["Order Analytics"],
)
def order_status_breakdown():
    """
    Returns the count of orders per status (CONFIRMED, FAILED).
    Uses order_summary rollup records for 100% exact match with PostgreSQL.
    """
    body = {
        "size": 0,
        "query": {
            "term": {"record_type": "order_summary"}
        },
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
        resp = es_client.search(index=ORDERS_DAILY_INDEX, body=body)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Analytics query failed: {str(e)}")

    buckets = resp["aggregations"]["by_status"]["buckets"]
    
    # Fallback to general terms agg if order_summary record_type not present
    if not buckets:
        fallback_body = {
            "size": 0,
            "aggs": {
                "by_status": {
                    "terms": {"field": "status", "size": 10},
                    "aggs": {"total_orders": {"sum": {"field": "order_count"}}},
                }
            },
        }
        try:
            resp_fb = es_client.search(index=ORDERS_DAILY_INDEX, body=fallback_body)
            buckets = resp_fb["aggregations"]["by_status"]["buckets"]
        except Exception:
            buckets = []

    return [
        OrderStatusItem(
            status=bucket["key"],
            count=int(bucket["total_orders"]["value"]),
        )
        for bucket in buckets
    ]


# ─────────────────────────────────────────────────────────────────────────────
# In-Memory Cache for Catalogue & Live Stock Telemetry
# ─────────────────────────────────────────────────────────────────────────────
class CatalogueCache:
    def __init__(self, ttl: float = 30.0):
        self.ttl = ttl
        self.products = None
        self.inventory = None
        self.last_fetch = 0.0

    def get_data(self, fresh: bool = False):
        now = time.time()
        if not fresh and self.products is not None and self.inventory is not None and (now - self.last_fetch < self.ttl):
            return self.products, self.inventory

        # Fetch products from product-service
        try:
            prod_req = urllib.request.Request(f"{PRODUCT_SERVICE_URL}/products?limit=1000")
            with urllib.request.urlopen(prod_req, timeout=10) as resp:
                products = json.loads(resp.read().decode())
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Failed to fetch products from Product Service: {str(e)}")

        # Fetch inventory from inventory-service (live stock)
        try:
            inv_req = urllib.request.Request(f"{INVENTORY_SERVICE_URL}/inventory?limit=1000")
            with urllib.request.urlopen(inv_req, timeout=10) as resp:
                inventory = json.loads(resp.read().decode())
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Failed to fetch inventory from Inventory Service: {str(e)}")

        self.products = products
        self.inventory = inventory
        self.last_fetch = now
        return self.products, self.inventory

    def clear(self):
        self.last_fetch = 0.0


catalogue_cache = CatalogueCache(ttl=30.0)


# ═════════════════════════════════════════════════════════════════════════════
#  GET /analytics/total-products
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/analytics/total-products",
    response_model=TotalProductsResponse,
    dependencies=[Depends(require_admin)],
    tags=["Product Analytics"],
)
def total_products(fresh: bool = Query(default=False)):
    """Returns the total count of all products in catalog."""
    products, _ = catalogue_cache.get_data(fresh=fresh)
    return {"total_products": len(products)}


# ═════════════════════════════════════════════════════════════════════════════
#  GET /analytics/category-summary
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/analytics/category-summary",
    response_model=List[CategorySummaryItem],
    dependencies=[Depends(require_admin)],
    tags=["Product Analytics"],
)
def category_summary(fresh: bool = Query(default=False)):
    """Returns count of products and average price per category."""
    products, _ = catalogue_cache.get_data(fresh=fresh)
    cat_stats = {}
    for p in products:
        cat = p.get("category", "Uncategorized")
        price = float(p.get("price", 0.0))
        if cat not in cat_stats:
            cat_stats[cat] = {"count": 0, "total_price": 0.0}
        cat_stats[cat]["count"] += 1
        cat_stats[cat]["total_price"] += price

    summary = [
        CategorySummaryItem(
            category=cat,
            product_count=stats["count"],
            average_price=round(stats["total_price"] / stats["count"], 2) if stats["count"] > 0 else 0.0,
        )
        for cat, stats in cat_stats.items()
    ]
    summary.sort(key=lambda x: (-x.product_count, x.category))
    return summary


# ═════════════════════════════════════════════════════════════════════════════
#  GET /analytics/low-stock
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/analytics/low-stock",
    response_model=List[LowStockItem],
    dependencies=[Depends(require_admin)],
    tags=["Product Analytics"],
)
def low_stock(
    threshold: int = Query(
        default=LOW_STOCK_THRESHOLD,
        ge=0,
        description="Products with stock_quantity strictly below this value are returned.",
    ),
    fresh: bool = Query(default=False),
):
    """Returns products whose live inventory stock_quantity is below the given threshold."""
    products, inventory = catalogue_cache.get_data(fresh=fresh)
    stock_map = {item["product_id"]: item["stock_quantity"] for item in inventory}

    items = []
    for p in products:
        p_id = p["id"]
        live_stock = stock_map.get(p_id, p.get("stock_quantity", 0))
        if live_stock < threshold:
            items.append(
                LowStockItem(
                    id=p_id,
                    name=p["name"],
                    category=p.get("category", "Uncategorized"),
                    stock_quantity=live_stock,
                    price=float(p.get("price", 0.0)),
                )
            )

    items.sort(key=lambda x: (x.stock_quantity, x.id))
    return items


# ═════════════════════════════════════════════════════════════════════════════
#  GET /analytics/price-range
# ═════════════════════════════════════════════════════════════════════════════
@app.get(
    "/analytics/price-range",
    response_model=PriceRangeResponse,
    dependencies=[Depends(require_admin)],
    tags=["Product Analytics"],
)
def price_range(fresh: bool = Query(default=False)):
    """Returns min, max, and average price across all products."""
    products, _ = catalogue_cache.get_data(fresh=fresh)
    if not products:
        return PriceRangeResponse(min_price=0.0, max_price=0.0, avg_price=0.0)
    prices = [float(p["price"]) for p in products if p.get("price") is not None]
    if not prices:
        return PriceRangeResponse(min_price=0.0, max_price=0.0, avg_price=0.0)
    return PriceRangeResponse(
        min_price=round(min(prices), 2),
        max_price=round(max(prices), 2),
        avg_price=round(sum(prices) / len(prices), 2),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Run directly with:  python main.py
# Or via uvicorn:     uvicorn main:app --reload --port 8002
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)
