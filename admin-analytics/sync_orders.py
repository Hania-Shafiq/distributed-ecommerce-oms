# sync_orders.py
# ─────────────────────────────────────────────────────────────────────────────
# Daily Rollup Sync: PostgreSQL (orders_db + products_db) → Elasticsearch "analytics"
# ─────────────────────────────────────────────────────────────────────────────
#
# Purpose
# ───────
# Replaces full raw line-item indexing with pre-aggregated daily rollups:
#   (day x product x category x status: units, revenue, order_count)
#
# This compresses ~50M+ raw rows into ~20,000 compact rollup documents in ES,
# drastically reducing Elasticsearch cluster memory, disk overhead, and query latency
# while keeping analytical dashboards lightning-fast.
#
# Document shape indexed (one doc per day x product x status):
#   _id          → "{order_date}_{product_id}_{status}" (idempotent upsert key)
#   order_date   → "YYYY-MM-DD"
#   created_at   → "YYYY-MM-DDT00:00:00Z" (ISO-8601 for range queries)
#   status       → PENDING | CONFIRMED | FAILED
#   product_id   → str(product_id)
#   product_name → str from products_db catalogue
#   category     → str from products_db catalogue
#   units_sold   → total quantity sold (integer)
#   quantity     → alias for units_sold (backwards compatibility)
#   revenue      → sum of (quantity * unit_price) (float)
#   order_count  → distinct order count in this bucket (integer)
#
# Usage
# ─────
#   python sync_orders.py                     # sync all rollups
#   python sync_orders.py --since 2024-01-01  # sync rollups since date
#   python sync_orders.py --batch-size 1000   # override bulk chunk size
# ─────────────────────────────────────────────────────────────────────────────

import os
import time
import argparse
import logging
from datetime import datetime, timezone
from typing import Iterator

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk

# ── Bootstrap ─────────────────────────────────────────────────────────────────
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("sync_orders")

# ── Config ────────────────────────────────────────────────────────────────────
ORDERS_DB_URL     = os.getenv("ORDERS_DB_URL",     "postgresql://postgres:postgres@localhost:5435/orders_db")
PRODUCTS_DB_URL   = os.getenv("PRODUCTS_DB_URL",   "postgresql://postgres:postgres@localhost:5434/products_db")
ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://localhost:9200")
ANALYTICS_INDEX   = "analytics"
DEFAULT_BATCH     = 1000   # documents per ES bulk request


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_pg_connection(dsn: str):
    """Return a psycopg2 connection with DictCursor factory."""
    return psycopg2.connect(dsn, cursor_factory=psycopg2.extras.RealDictCursor)


def fetch_product_map(products_conn) -> dict:
    """
    Fetch product catalogue from products_db and return a dict keyed by product_id.
    Shape: { product_id(int): {"name": str, "category": str} }
    """
    with products_conn.cursor() as cur:
        cur.execute("SELECT id, name, category FROM products;")
        rows = cur.fetchall()

    return {
        row["id"]: {"name": row["name"], "category": row["category"]}
        for row in rows
    }


def ensure_analytics_index(es: Elasticsearch) -> None:
    """
    Create or update the 'analytics' Elasticsearch index with rollup mapping.
    """
    mapping = {
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
    }

    if not es.indices.exists(index=ANALYTICS_INDEX):
        body = {
            "mappings": mapping,
            "settings": {"number_of_shards": 1, "number_of_replicas": 0},
        }
        es.indices.create(index=ANALYTICS_INDEX, body=body)
        log.info(f"[ES] Created index '{ANALYTICS_INDEX}' with daily rollup mapping.")
    else:
        es.indices.put_mapping(index=ANALYTICS_INDEX, body=mapping)
        log.info(f"[ES] Verified mapping for index '{ANALYTICS_INDEX}'.")


def generate_rollup_documents(
    orders_conn,
    product_map: dict,
    since: datetime | None,
) -> Iterator[dict]:
    """
    Executes SQL GROUP BY on orders_db (day x product x status), enriches with
    product metadata, and yields idempotent bulk action dicts.
    """
    sql = """
        SELECT
            DATE(o.created_at) AS order_date,
            oi.product_id,
            o.status,
            SUM(oi.quantity) AS units_sold,
            SUM(oi.quantity * oi.unit_price) AS revenue,
            COUNT(DISTINCT o.id) AS order_count
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
    """
    params = []
    if since:
        sql += " WHERE o.created_at >= %s"
        params.append(since)
    sql += " GROUP BY DATE(o.created_at), oi.product_id, o.status ORDER BY order_date ASC;"

    with orders_conn.cursor() as cur:
        t0_query = time.time()
        log.info("[PostgreSQL] Executing daily rollup GROUP BY query across 50M orders and 56M items...")
        cur.execute(sql, params)
        query_dur = time.time() - t0_query
        log.info(f"[PostgreSQL] GROUP BY query finished in {query_dur:.2f}s.")

        for row in cur:
            order_date_str = str(row["order_date"])
            pid = row["product_id"]
            p_info = product_map.get(
                pid,
                {"name": f"Product #{pid}", "category": "Uncategorized"},
            )
            units = int(row["units_sold"] or 0)
            rev   = round(float(row["revenue"] or 0.0), 2)
            cnt   = int(row["order_count"] or 0)

            doc = {
                "order_date":   order_date_str,
                "created_at":   f"{order_date_str}T00:00:00Z",
                "product_id":   str(pid),
                "product_name": p_info["name"],
                "category":     p_info["category"],
                "status":       row["status"],
                "units_sold":   units,
                "quantity":     units,
                "revenue":      rev,
                "order_count":  cnt,
            }

            yield {
                "_index": ANALYTICS_INDEX,
                "_id":    f"{order_date_str}_{pid}_{row['status']}",
                "_source": doc,
            }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Sync daily order rollups from PostgreSQL to Elasticsearch 'analytics' index."
    )
    parser.add_argument(
        "--since",
        metavar="YYYY-MM-DD",
        help="Only sync rollups for orders on or after this date (ISO format).",
        default=None,
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH,
        help=f"Number of documents per Elasticsearch bulk request (default: {DEFAULT_BATCH}).",
    )
    args = parser.parse_args()

    since = None
    if args.since:
        since = datetime.fromisoformat(args.since).replace(tzinfo=timezone.utc)
        log.info(f"Syncing rollups since: {since.isoformat()}")
    else:
        log.info("Syncing ALL order rollups (no --since filter).")

    # ── Connect ───────────────────────────────────────────────────────────────
    log.info("Connecting to PostgreSQL databases…")
    orders_conn   = get_pg_connection(ORDERS_DB_URL)
    products_conn = get_pg_connection(PRODUCTS_DB_URL)

    log.info("Connecting to Elasticsearch at %s…", ELASTICSEARCH_URL)
    es = Elasticsearch(ELASTICSEARCH_URL, verify_certs=False, ssl_show_warn=False)
    if not es.ping():
        log.error("Cannot reach Elasticsearch at %s — aborting.", ELASTICSEARCH_URL)
        return

    # ── Bootstrap index ────────────────────────────────────────────────────────
    ensure_analytics_index(es)

    # ── Load product metadata ──────────────────────────────────────────────────
    log.info("Loading product catalogue from products_db…")
    product_map = fetch_product_map(products_conn)
    log.info(f"  → {len(product_map)} products loaded.")

    # ── Bulk index ─────────────────────────────────────────────────────────────
    log.info("Starting rollup sync into ES index '%s'…", ANALYTICS_INDEX)

    success, errors = bulk(
        es,
        generate_rollup_documents(orders_conn, product_map, since),
        chunk_size=args.batch_size,
        raise_on_error=False,
    )
    total_indexed = success
    total_errors  = len(errors) if errors else 0

    if errors:
        for err in errors[:5]:
            log.warning("Bulk error sample: %s", err)

    # Refresh index so document count is immediately accurate
    es.indices.refresh(index=ANALYTICS_INDEX)
    final_count = es.count(index=ANALYTICS_INDEX)["count"]

    log.info(
        "Sync complete. ✓ %d documents indexed  ✗ %d errors. Total docs in '%s': %d",
        total_indexed,
        total_errors,
        ANALYTICS_INDEX,
        final_count,
    )

    # ── Cleanup ────────────────────────────────────────────────────────────────
    orders_conn.close()
    products_conn.close()


if __name__ == "__main__":
    main()
