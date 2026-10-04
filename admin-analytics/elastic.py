# elastic.py
# ─────────────────────────────────────────────────────────────────────────────
# Centralises all Elasticsearch logic for the Admin Analytics Service.
#
#   • es_client            — singleton Elasticsearch client
#   • ANALYTICS_INDEX      — index name constant ("analytics")
#   • create_analytics_index_if_not_exists()
#                          — idempotent index + mapping bootstrap
#
# Index design notes
# ──────────────────
# The "analytics" index stores one document per order-item (i.e. one doc per
# product line within an order).  This de-normalised shape lets Elasticsearch
# run aggregations (sum of quantity, sum of revenue, status counts) without
# any JOINs — perfect for a read-only analytics store.
#
# Document shape (flattened order-item):
#   order_id    keyword   — parent order identifier
#   product_id  keyword   — product reference
#   product_name text/kw  — for display in dashboard tooltips
#   category    keyword   — for "revenue by category" aggregation
#   quantity    integer   — units sold in this line
#   unit_price  float     — per-unit price at time of order
#   revenue     float     — quantity × unit_price (pre-computed for fast aggs)
#   status      keyword   — order status: PENDING | CONFIRMED | FAILED
#   user_id     keyword   — customer reference
#   created_at  date      — order creation timestamp (ISO-8601)
# ─────────────────────────────────────────────────────────────────────────────

import os
from dotenv import load_dotenv
from elasticsearch import Elasticsearch

load_dotenv()

# ── Constants ─────────────────────────────────────────────────────────────────
ANALYTICS_INDEX = "analytics"
ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://localhost:9200")


# ── Client singleton ──────────────────────────────────────────────────────────
# One client instance with an internal connection pool — no new TCP handshake
# per request.  verify_certs/ssl_show_warn are False because our docker-compose
# sets xpack.security.enabled=false (no TLS).
es_client = Elasticsearch(
    ELASTICSEARCH_URL,
    verify_certs=False,
    ssl_show_warn=False,
)


# ── Index bootstrap ───────────────────────────────────────────────────────────
def create_analytics_index_if_not_exists() -> None:
    """
    Creates the 'analytics' Elasticsearch index with an explicit field mapping.

    Called once at app startup (from main.py lifespan).  The call is idempotent:
    if the index already exists we return immediately without destroying any data.

    Why explicit mapping (not dynamic)?
    ────────────────────────────────────
    Dynamic mapping guesses field types from the first document indexed.
    If 'unit_price' arrives as "free" before a numeric value, ES maps it as text
    and numeric aggregations break.  Explicit mapping prevents this.

    Field type rationale:
    ─────────────────────
    keyword  → exact-match filtering, terms aggregations (status, category, …)
    text     → full-text search (product_name descriptions)
    float    → numeric aggregations (sum/avg of revenue, unit_price)
    integer  → numeric aggregations (sum of quantity)
    date     → date-histogram aggregations, range filters
    """
    if es_client.indices.exists(index=ANALYTICS_INDEX):
        return  # already bootstrapped — nothing to do

    mapping = {
        "mappings": {
            "properties": {
                # ── Order-level fields ──────────────────────────────────────
                "order_id":     {"type": "keyword"},   # exact match / filter
                "status":       {"type": "keyword"},   # PENDING|CONFIRMED|FAILED
                "user_id":      {"type": "keyword"},
                "created_at":   {"type": "date"},      # ISO-8601 datetime

                # ── Product-level fields ────────────────────────────────────
                "product_id":   {"type": "keyword"},
                "product_name": {
                    "type": "text",
                    # keyword sub-field for exact aggregation on product names
                    "fields": {"keyword": {"type": "keyword"}},
                },
                "category":     {"type": "keyword"},   # terms agg for revenue by category

                # ── Numeric metrics ─────────────────────────────────────────
                "quantity":     {"type": "integer"},   # sum → top-selling products
                "unit_price":   {"type": "float"},
                "revenue":      {"type": "float"},     # quantity × unit_price (pre-computed)
            }
        },
        "settings": {
            # Single shard is fine for an embedded analytics store.
            # Avoids cross-shard overhead on small datasets.
            "number_of_shards": 1,
            "number_of_replicas": 0,
        },
    }

    es_client.indices.create(index=ANALYTICS_INDEX, body=mapping)
    print(f"[ES] Created index '{ANALYTICS_INDEX}' with analytics mapping ✓")
