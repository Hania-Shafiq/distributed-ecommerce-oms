# sync_orders.py
# ─────────────────────────────────────────────────────────────────────────────
# Batch sync: PostgreSQL (orders_db + products_db)  →  Elasticsearch "analytics"
# ─────────────────────────────────────────────────────────────────────────────
#
# Purpose
# ───────
# Replaces the old DuckDB-based analytics feed.  This script reads every order
# and its line-items from the orders_db PostgreSQL database, enriches each
# line-item with the product's category (fetched from products_db), and bulk-
# indexes the resulting documents into the Elasticsearch "analytics" index.
#
# Document shape indexed (one doc per order-item):
#   _id          → "{order_id}-{order_item_id}"  (stable, idempotent upsert key)
#   order_id     → str(order.id)
#   status       → order.status  (PENDING | CONFIRMED | FAILED)
#   user_id      → str(order.user_id)
#   created_at   → order.created_at.isoformat()
#   product_id   → str(item.product_id)
#   product_name → str from products_db lookup (or "Unknown")
#   category     → str from products_db lookup (or "Uncategorized")
#   quantity     → item.quantity
#   unit_price   → item.unit_price
#   revenue      → item.quantity * item.unit_price   (pre-computed for fast aggs)
#
# Usage
# ─────
#   python sync_orders.py                # sync all orders
#   python sync_orders.py --since 2024-01-01   # sync orders created after date
#   python sync_orders.py --batch-size 500     # override bulk chunk size
#
# Run this as a cron job (e.g. every 5 minutes) or trigger it on demand.
# It is safe to re-run: documents are upserted (not duplicated) because we use
# the stable compound key as the ES document _id.
#
# Environment variables (read from .env or real env):
#   ORDERS_DB_URL    — DSN for orders_db PostgreSQL
#   PRODUCTS_DB_URL  — DSN for products_db PostgreSQL
#   ELASTICSEARCH_URL — ES cluster URL (default http://localhost:9200)
# ─────────────────────────────────────────────────────────────────────────────

import os
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
ORDERS_DB_URL    = os.getenv("ORDERS_DB_URL",    "postgresql://postgres:postgres@localhost:5435/orders_db")
PRODUCTS_DB_URL  = os.getenv("PRODUCTS_DB_URL",  "postgresql://postgres:postgres@localhost:5434/products_db")
ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://localhost:9200")
ANALYTICS_INDEX  = "analytics"
DEFAULT_BATCH    = 250   # documents per ES bulk request


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_pg_connection(dsn: str):
    """Return a psycopg2 connection with DictCursor factory."""
    return psycopg2.connect(dsn, cursor_factory=psycopg2.extras.RealDictCursor)


def fetch_product_map(products_conn) -> dict:
    """
    Fetch all products from products_db and return a dict keyed by product_id.

    Shape: { product_id(int): {"name": str, "category": str} }

    Why load everything up-front?
    ──────────────────────────────
    Each order-item needs a product lookup.  Doing one SELECT per item would
    create N+1 query problems for large datasets.  Loading the full map once
    (products table is typically small — < 100 k rows) is far more efficient.
    """
    with products_conn.cursor() as cur:
        cur.execute("SELECT id, name, category FROM products;")
        rows = cur.fetchall()

    return {
        row["id"]: {"name": row["name"], "category": row["category"]}
        for row in rows
    }


def generate_documents(
    orders_conn,
    product_map: dict,
    since: datetime | None,
) -> Iterator[dict]:
    """
    Generator that yields one Elasticsearch action dict per order-item.

    Using a generator (not list) means we stream rows from PostgreSQL and yield
    them directly to helpers.bulk without loading everything into memory at once.
    This makes the sync memory-efficient even for millions of order-items.

    Action dict format required by helpers.bulk:
      _index  → target index
      _id     → document _id (stable key prevents duplicates on re-run)
      _source → the document body

    Why compound _id = "{order_id}-{item_id}"?
    ────────────────────────────────────────────
    • order_id alone is not unique (one order has multiple items).
    • item_id alone is not guaranteed unique across re-syncs if the DB is
      re-seeded.
    • The compound key is globally unique and stable.
    """
    sql = """
        SELECT
            o.id           AS order_id,
            o.user_id,
            o.status,
            o.created_at,
            oi.id          AS item_id,
            oi.product_id,
            oi.quantity,
            oi.unit_price
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
    """
    params = []
    if since:
        sql += " WHERE o.created_at >= %s"
        params.append(since)
    sql += " ORDER BY o.created_at DESC;"

    with orders_conn.cursor(name="sync_cursor") as cur:  # server-side cursor
        cur.execute(sql, params)

        for row in cur:
            product_info = product_map.get(
                row["product_id"],
                {"name": "Unknown", "category": "Uncategorized"},
            )
            qty      = row["quantity"]    or 0
            price    = row["unit_price"]  or 0.0
            revenue  = round(qty * price, 2)

            created_at = row["created_at"]
            if isinstance(created_at, datetime):
                # Ensure UTC-aware ISO-8601 — ES date field expects this format.
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
                created_at = created_at.isoformat()

            doc = {
                # Order-level
                "order_id":   str(row["order_id"]),
                "user_id":    str(row["user_id"]),
                "status":     row["status"],
                "created_at": created_at,
                # Product-level
                "product_id":   str(row["product_id"]),
                "product_name": product_info["name"],
                "category":     product_info["category"],
                # Metrics
                "quantity":   qty,
                "unit_price": price,
                "revenue":    revenue,
            }

            yield {
                "_index": ANALYTICS_INDEX,
                "_id":    f"{row['order_id']}-{row['item_id']}",
                "_source": doc,
            }


def ensure_analytics_index(es: Elasticsearch) -> None:
    """
    Create the 'analytics' index with explicit mapping if it doesn't exist.
    Mirrors create_analytics_index_if_not_exists() from elastic.py so the sync
    script is self-contained and can be run independently of the API service.
    """
    if es.indices.exists(index=ANALYTICS_INDEX):
        return

    mapping = {
        "mappings": {
            "properties": {
                "order_id":     {"type": "keyword"},
                "status":       {"type": "keyword"},
                "user_id":      {"type": "keyword"},
                "created_at":   {"type": "date"},
                "product_id":   {"type": "keyword"},
                "product_name": {
                    "type": "text",
                    "fields": {"keyword": {"type": "keyword"}},
                },
                "category":     {"type": "keyword"},
                "quantity":     {"type": "integer"},
                "unit_price":   {"type": "float"},
                "revenue":      {"type": "float"},
            }
        },
        "settings": {"number_of_shards": 1, "number_of_replicas": 0},
    }
    es.indices.create(index=ANALYTICS_INDEX, body=mapping)
    log.info(f"[ES] Created index '{ANALYTICS_INDEX}'")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Sync orders from PostgreSQL to Elasticsearch 'analytics' index."
    )
    parser.add_argument(
        "--since",
        metavar="YYYY-MM-DD",
        help="Only sync orders created on or after this date (ISO format). "
             "Omit to sync all orders.",
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
        log.info(f"Syncing orders created since: {since.isoformat()}")
    else:
        log.info("Syncing ALL orders (no --since filter).")

    # ── Connect ───────────────────────────────────────────────────────────────
    log.info("Connecting to PostgreSQL databases…")
    orders_conn   = get_pg_connection(ORDERS_DB_URL)
    products_conn = get_pg_connection(PRODUCTS_DB_URL)

    log.info("Connecting to Elasticsearch…")
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
    log.info("Starting bulk sync into ES index '%s'…", ANALYTICS_INDEX)

    total_indexed = 0
    total_errors  = 0

    # helpers.bulk streams the generator in chunks of `chunk_size`.
    # raise_on_error=False → we collect errors instead of raising immediately.
    success, errors = bulk(
        es,
        generate_documents(orders_conn, product_map, since),
        chunk_size=args.batch_size,
        raise_on_error=False,
    )
    total_indexed += success
    total_errors  += len(errors) if errors else 0

    if errors:
        for err in errors:
            log.warning("Bulk error: %s", err)

    log.info(
        "Sync complete. ✓ %d documents indexed  ✗ %d errors.",
        total_indexed,
        total_errors,
    )

    # ── Cleanup ────────────────────────────────────────────────────────────────
    orders_conn.close()
    products_conn.close()


if __name__ == "__main__":
    main()
