# sync_orders.py
# ─────────────────────────────────────────────────────────────────────────────
# Daily Rollup Sync: PostgreSQL (orders_db + products_db) → Elasticsearch "orders_daily"
# ─────────────────────────────────────────────────────────────────────────────
#
# Purpose
# ───────
# Replaces full raw line-item indexing with pre-aggregated daily rollups:
#   1. Order daily summary: (day x status: order_count, total_revenue, weekday)
#      Enables 100% exact match for /analytics/order-status, /analytics/overview,
#      /analytics/revenue-trend, and /analytics/orders-by-weekday.
#   2. Product daily rollup: (day x product x category x status: units, revenue)
#      Enables lightning-fast /analytics/top-selling-products and
#      /analytics/revenue-by-category aggregations without runtime joins.
#
# Usage
# ─────
#   python sync_orders.py                     # sync all rollups
#   python sync_orders.py --since 2024-01-01  # sync rollups since date
#   python sync_orders.py --batch-size 1000   # override bulk chunk size
# ─────────────────────────────────────────────────────────────────────────────

import os
import time
import json
import argparse
import logging
from datetime import datetime, timezone
from pathlib import Path
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
ORDERS_DAILY_INDEX = "orders_daily"
ANALYTICS_INDEX   = "analytics"
DEFAULT_BATCH     = 1000   # documents per ES bulk request
SYNC_STATUS_FILE  = Path(__file__).resolve().parent / "sync_status.json"


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


def ensure_orders_daily_index(es: Elasticsearch) -> None:
    """
    Create or update the 'orders_daily' Elasticsearch index with rollup mapping
    and configure 'analytics' alias pointing to it.
    """
    mapping = {
        "properties": {
            "record_type":    {"type": "keyword"},
            "order_date":     {"type": "date", "format": "yyyy-MM-dd||strict_date_optional_time||epoch_millis"},
            "created_at":     {"type": "date"},
            "weekday":        {"type": "keyword"},
            "day_of_week":    {"type": "integer"},
            "status":         {"type": "keyword"},
            "product_id":     {"type": "keyword"},
            "product_name": {
                "type": "text",
                "fields": {"keyword": {"type": "keyword"}},
            },
            "category":       {"type": "keyword"},
            "units_sold":     {"type": "integer"},
            "quantity":       {"type": "integer"},
            "revenue":        {"type": "float"},
            "total_revenue":  {"type": "float"},
            "order_count":    {"type": "integer"},
            "last_sync_time": {"type": "date"},
        }
    }

    if not es.indices.exists(index=ORDERS_DAILY_INDEX):
        if es.indices.exists(index=ANALYTICS_INDEX):
            try:
                c = es.count(index=ANALYTICS_INDEX)["count"]
                if c == 0:
                    es.indices.delete(index=ANALYTICS_INDEX)
            except Exception:
                pass

        body = {
            "mappings": mapping,
            "settings": {"number_of_shards": 1, "number_of_replicas": 0},
        }
        es.indices.create(index=ORDERS_DAILY_INDEX, body=body)
        log.info(f"[ES] Created index '{ORDERS_DAILY_INDEX}' with daily rollup mapping.")
    else:
        es.indices.put_mapping(index=ORDERS_DAILY_INDEX, body=mapping)
        log.info(f"[ES] Verified mapping for index '{ORDERS_DAILY_INDEX}'.")

    try:
        if not es.indices.exists_alias(name=ANALYTICS_INDEX, index=ORDERS_DAILY_INDEX):
            if es.indices.exists(index=ANALYTICS_INDEX):
                c = es.count(index=ANALYTICS_INDEX)["count"]
                if c == 0:
                    es.indices.delete(index=ANALYTICS_INDEX)
                    es.indices.put_alias(index=ORDERS_DAILY_INDEX, name=ANALYTICS_INDEX)
            else:
                es.indices.put_alias(index=ORDERS_DAILY_INDEX, name=ANALYTICS_INDEX)
            log.info(f"[ES] Alias '{ANALYTICS_INDEX}' -> '{ORDERS_DAILY_INDEX}' verified.")
    except Exception as exc:
        log.warning(f"[ES] Alias notice: {exc}")


def generate_rollup_documents(
    orders_conn,
    product_map: dict,
    since: datetime | None,
) -> Iterator[dict]:
    """
    Generates two classes of rollup documents for complete analytics coverage:
      1. 'order_summary': Exactly mirrors PostgreSQL orders table (count, revenue by day & status)
      2. 'product_rollup': Category and item sales (quantity, revenue by day, product & status)
    """
    with orders_conn.cursor() as cur:
        # ── 1. Order-Level Daily Summaries ────────────────────────────────────
        t0 = time.time()
        log.info("[PostgreSQL] Aggregating daily order counts and revenue...")
        sql_orders = """
            SELECT
                DATE(created_at) AS order_date,
                status,
                COUNT(*) AS order_count,
                ROUND(SUM(total_amount)::numeric, 2) AS total_revenue
            FROM orders
        """
        params_orders = []
        if since:
            sql_orders += " WHERE created_at >= %s"
            params_orders.append(since)
        sql_orders += " GROUP BY DATE(created_at), status ORDER BY order_date ASC;"

        cur.execute(sql_orders, params_orders)
        order_rows = cur.fetchall()
        log.info(f"[PostgreSQL] Order summaries generated: {len(order_rows)} rows in {time.time() - t0:.2f}s.")

        for row in order_rows:
            order_date_str = str(row["order_date"])
            order_dt = row["order_date"]
            weekday = order_dt.strftime("%A")
            day_of_week = order_dt.isoweekday()
            cnt = int(row["order_count"] or 0)
            rev = round(float(row["total_revenue"] or 0.0), 2)

            yield {
                "_index": ORDERS_DAILY_INDEX,
                "_id": f"order_{order_date_str}_{row['status']}",
                "_source": {
                    "record_type": "order_summary",
                    "order_date": order_date_str,
                    "created_at": f"{order_date_str}T00:00:00Z",
                    "weekday": weekday,
                    "day_of_week": day_of_week,
                    "status": row["status"],
                    "order_count": cnt,
                    "total_revenue": rev,
                    "revenue": rev,
                },
            }

        # ── 2. Product-Level Daily Rollups ────────────────────────────────────
        t1 = time.time()
        log.info("[PostgreSQL] Aggregating product daily rollups across order items...")
        sql_items = """
            SELECT
                DATE(o.created_at) AS order_date,
                oi.product_id,
                o.status,
                SUM(oi.quantity) AS units_sold,
                ROUND(SUM(oi.quantity * oi.unit_price)::numeric, 2) AS revenue,
                COUNT(DISTINCT o.id) AS order_count
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
        """
        params_items = []
        if since:
            sql_items += " WHERE o.created_at >= %s"
            params_items.append(since)
        sql_items += " GROUP BY DATE(o.created_at), oi.product_id, o.status ORDER BY order_date ASC;"

        cur.execute(sql_items, params_items)
        log.info(f"[PostgreSQL] Product rollups query executed in {time.time() - t1:.2f}s.")

        for row in cur:
            order_date_str = str(row["order_date"])
            order_dt = row["order_date"]
            weekday = order_dt.strftime("%A")
            day_of_week = order_dt.isoweekday()
            pid = row["product_id"]
            p_info = product_map.get(
                pid,
                {"name": f"Product #{pid}", "category": "Uncategorized"},
            )
            units = int(row["units_sold"] or 0)
            rev   = round(float(row["revenue"] or 0.0), 2)
            cnt   = int(row["order_count"] or 0)

            yield {
                "_index": ORDERS_DAILY_INDEX,
                "_id": f"prod_{order_date_str}_{pid}_{row['status']}",
                "_source": {
                    "record_type": "product_rollup",
                    "order_date": order_date_str,
                    "created_at": f"{order_date_str}T00:00:00Z",
                    "weekday": weekday,
                    "day_of_week": day_of_week,
                    "product_id": str(pid),
                    "product_name": p_info["name"],
                    "category": p_info["category"],
                    "status": row["status"],
                    "units_sold": units,
                    "quantity": units,
                    "revenue": rev,
                    "total_revenue": rev,
                    "order_count": cnt,
                },
            }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Sync daily order rollups from PostgreSQL to Elasticsearch 'orders_daily' index."
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
    es = Elasticsearch(ELASTICSEARCH_URL, request_timeout=60, verify_certs=False, ssl_show_warn=False)
    if not es.ping():
        log.error("Cannot reach Elasticsearch at %s — aborting.", ELASTICSEARCH_URL)
        return

    # ── Bootstrap index ────────────────────────────────────────────────────────
    ensure_orders_daily_index(es)

    # ── Load product metadata ──────────────────────────────────────────────────
    log.info("Loading product catalogue from products_db…")
    product_map = fetch_product_map(products_conn)
    log.info(f"  → {len(product_map)} products loaded.")

    # ── Bulk index ─────────────────────────────────────────────────────────────
    log.info("Starting rollup sync into ES index '%s'…", ORDERS_DAILY_INDEX)

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
    es.indices.refresh(index=ORDERS_DAILY_INDEX)
    final_count = es.count(index=ORDERS_DAILY_INDEX)["count"]

    # Save last successful sync time to Elasticsearch and metadata file
    sync_iso_time = datetime.now(timezone.utc).isoformat()
    sync_meta = {
        "record_type": "sync_metadata",
        "last_sync_time": sync_iso_time,
        "status": "SUCCESS",
        "total_documents": final_count,
        "indexed_batch": total_indexed,
    }
    try:
        es.index(index=ORDERS_DAILY_INDEX, id="_last_sync_metadata", body=sync_meta)
        es.indices.refresh(index=ORDERS_DAILY_INDEX)
        log.info(f"[ES] Recorded last successful sync timestamp: {sync_iso_time}")
    except Exception as exc:
        log.warning(f"Could not record sync metadata in ES: {exc}")

    try:
        with open(SYNC_STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump(sync_meta, f, indent=2)
    except Exception as exc:
        log.warning(f"Could not write local sync status file: {exc}")

    log.info(
        "Sync complete. ✓ %d documents indexed  ✗ %d errors. Total docs in '%s': %d",
        total_indexed,
        total_errors,
        ORDERS_DAILY_INDEX,
        final_count,
    )

    # ── Cleanup ────────────────────────────────────────────────────────────────
    orders_conn.close()
    products_conn.close()


if __name__ == "__main__":
    main()
