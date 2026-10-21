# elastic.py
# ─────────────────────────────────────────────────────────────────────────────
# Centralises all Elasticsearch logic for the Admin Analytics Service.
#
#   • es_client            — singleton Elasticsearch client
#   • ORDERS_DAILY_INDEX   — index name constant ("orders_daily")
#   • ANALYTICS_INDEX      — alias/index constant ("analytics" -> "orders_daily")
#   • create_analytics_index_if_not_exists()
#                          — idempotent index + mapping + alias bootstrap
# ─────────────────────────────────────────────────────────────────────────────

import os
from dotenv import load_dotenv
from elasticsearch import Elasticsearch

load_dotenv()

# ── Constants ─────────────────────────────────────────────────────────────────
ORDERS_DAILY_INDEX = "orders_daily"
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
    Creates or updates the 'orders_daily' Elasticsearch index with explicit
    daily rollup field mapping and ensures the 'analytics' alias points to it.
    """
    mapping = {
        "mappings": {
            "properties": {
                "record_type":   {"type": "keyword"},  # 'order_summary', 'product_rollup', or 'sync_metadata'
                "order_date":    {"type": "date", "format": "yyyy-MM-dd||strict_date_optional_time||epoch_millis"},
                "created_at":    {"type": "date"},
                "weekday":       {"type": "keyword"},
                "day_of_week":   {"type": "integer"},
                "status":        {"type": "keyword"},
                "product_id":    {"type": "keyword"},
                "product_name": {
                    "type": "text",
                    "fields": {"keyword": {"type": "keyword"}},
                },
                "category":      {"type": "keyword"},
                "units_sold":    {"type": "integer"},
                "quantity":      {"type": "integer"},
                "revenue":       {"type": "float"},
                "total_revenue": {"type": "float"},
                "order_count":   {"type": "integer"},
                "last_sync_time":{"type": "date"},
            }
        },
        "settings": {
            "number_of_shards": 1,
            "number_of_replicas": 0,
        },
    }

    # Ensure orders_daily index exists
    if not es_client.indices.exists(index=ORDERS_DAILY_INDEX):
        # If legacy 'analytics' exists as a concrete index, remove or handle
        if es_client.indices.exists(index=ANALYTICS_INDEX):
            alias_check = es_client.indices.get_alias(index=ANALYTICS_INDEX)
            # If it's a concrete index without aliases
            if ANALYTICS_INDEX in alias_check and not alias_check[ANALYTICS_INDEX].get("aliases"):
                count = es_client.count(index=ANALYTICS_INDEX)["count"]
                if count == 0:
                    es_client.indices.delete(index=ANALYTICS_INDEX)
        
        es_client.indices.create(index=ORDERS_DAILY_INDEX, body=mapping)
        print(f"[ES] Created index '{ORDERS_DAILY_INDEX}' with daily rollup mapping ✓")
    else:
        try:
            es_client.indices.put_mapping(index=ORDERS_DAILY_INDEX, body=mapping["mappings"])
        except Exception:
            pass

    # Ensure 'analytics' alias points to 'orders_daily'
    try:
        alias_exists = es_client.indices.exists_alias(name=ANALYTICS_INDEX, index=ORDERS_DAILY_INDEX)
        if not alias_exists:
            # Check if concrete index exists with this name
            if es_client.indices.exists(index=ANALYTICS_INDEX):
                c = es_client.count(index=ANALYTICS_INDEX)["count"]
                if c == 0:
                    es_client.indices.delete(index=ANALYTICS_INDEX)
                    es_client.indices.put_alias(index=ORDERS_DAILY_INDEX, name=ANALYTICS_INDEX)
            else:
                es_client.indices.put_alias(index=ORDERS_DAILY_INDEX, name=ANALYTICS_INDEX)
            print(f"[ES] Configured alias '{ANALYTICS_INDEX}' -> '{ORDERS_DAILY_INDEX}' ✓")
    except Exception as exc:
        print(f"[ES] Note configuring alias: {exc}")
