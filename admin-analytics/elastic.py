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
# The "analytics" index stores daily rollup documents:
#   (day x product x category x status: units, revenue, order_count)
#
# This compressed rollup structure enables fast analytics queries on massive
# order volumes without requiring Elasticsearch to store tens of millions of
# raw line items.
# ─────────────────────────────────────────────────────────────────────────────

import os
from dotenv import load_dotenv
from elasticsearch import Elasticsearch

load_dotenv()

# ── Constants ─────────────────────────────────────────────────────────────────
ANALYTICS_INDEX = "analytics"
ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://localhost:9200")


# ── Client singleton ──────────────────────────────────────────────────────────
es_client = Elasticsearch(
    ELASTICSEARCH_URL,
    request_timeout=60,
    verify_certs=False,
    ssl_show_warn=False,
)


# ── Index bootstrap ───────────────────────────────────────────────────────────
def create_analytics_index_if_not_exists() -> None:
    """
    Creates or updates the 'analytics' Elasticsearch index with explicit rollup field mapping.
    Called once at app startup (from main.py lifespan).
    """
    mapping = {
        "mappings": {
            "properties": {
                "order_date":   {"type": "date"},
                "created_at":   {"type": "date"},
                "status":       {"type": "keyword"},
                "product_id":   {"type": "keyword"},
                "product_name": {
                    "type": "text",
                    "fields": {"keyword": {"type": "keyword"}},
                },
                "category":     {"type": "keyword"},
                "units_sold":   {"type": "integer"},
                "quantity":     {"type": "integer"},
                "revenue":      {"type": "float"},
                "order_count":  {"type": "integer"},
            }
        },
        "settings": {
            "number_of_shards": 1,
            "number_of_replicas": 0,
        },
    }

    if es_client.indices.exists(index=ANALYTICS_INDEX):
        try:
            es_client.indices.put_mapping(index=ANALYTICS_INDEX, body=mapping["mappings"])
        except Exception:
            pass
        return

    es_client.indices.create(index=ANALYTICS_INDEX, body=mapping)
    print(f"[ES] Created index '{ANALYTICS_INDEX}' with daily rollup mapping ✓")
