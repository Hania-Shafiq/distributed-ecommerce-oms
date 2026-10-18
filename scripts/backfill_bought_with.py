# scripts/backfill_bought_with.py
# ─────────────────────────────────────────────────────────────────────────────
# Batch Backfill: PostgreSQL (orders_db) → Neo4j BOUGHT_WITH Graph Relationships
# ─────────────────────────────────────────────────────────────────────────────
#
# Purpose
# ───────
# Computes pairwise co-purchase frequencies across all confirmed/completed orders
# in PostgreSQL (orders_db) by performing an order_items self-join (product_id a < b)
# grouped by product pair, counting distinct purchasing user IDs as edge weight.
#
# Then idempotently merges:
#   (:Product {id: a})-[:BOUGHT_WITH {weight}]->(:Product {id: b})
# into Neo4j.
#
# Why a Batch Export?
# ───────────────────
# Real-time event ingestion (/graph/purchase) is called item-by-item during the
# order saga checkout flow. The order service sends individual line item events
# without packaging all sibling product IDs of the order in a single payload.
# Performing real-time combinatorial pair generation inside the transactional
# checkout path introduces latency and race conditions. A batch backfill computes
# exact distinct user co-purchase weights across historical orders with zero
# impact on checkout SLAs.
#
# Usage
# ─────
#   python scripts/backfill_bought_with.py
#   python scripts/backfill_bought_with.py --batch-size 200
#   python scripts/backfill_bought_with.py --dry-run
# ─────────────────────────────────────────────────────────────────────────────

import os
import sys
import argparse
import logging
from typing import Dict, List, Tuple, Any

import psycopg2
from dotenv import load_dotenv
from neo4j import GraphDatabase

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("backfill_bought_with")

# ── Config ────────────────────────────────────────────────────────────────────
ORDERS_DB_URL   = os.getenv("ORDERS_DB_URL",   "postgresql://postgres:postgres@localhost:5435/orders_db")
PRODUCTS_DB_URL = os.getenv("PRODUCTS_DB_URL", "postgresql://postgres:postgres@localhost:5434/products_db")
NEO4J_URI       = os.getenv("NEO4J_URI",       "bolt://localhost:7687")
NEO4J_USER      = os.getenv("NEO4J_USER",      "neo4j")
NEO4J_PASSWORD  = os.getenv("NEO4J_PASSWORD",  "")


def fetch_product_metadata(products_url: str) -> Dict[int, Dict[str, str]]:
    """
    Fetch all active product names and categories from products_db.
    Used to populate node properties for any catalog products missing in Neo4j.
    """
    log.info("Connecting to products_db to fetch catalog metadata...")
    meta: Dict[int, Dict[str, str]] = {}
    try:
        conn = psycopg2.connect(products_url)
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, category FROM products")
            for pid, name, cat in cur.fetchall():
                meta[int(pid)] = {"name": name or f"Product #{pid}", "category": cat or "General"}
        conn.close()
        log.info("Loaded metadata for %d catalog products.", len(meta))
    except Exception as exc:
        log.warning("Could not fetch products_db metadata (%s). Will use fallback names.", exc)
    return meta


def query_copurchase_pairs(orders_url: str) -> List[Tuple[int, int, int]]:
    """
    Executes SQL self-join on order_items grouped by product pair (a < b)
    to compute number of distinct users who bought both products.
    """
    log.info("Querying co-purchased pairs from orders_db...")
    sql = """
    SELECT 
        oi1.product_id AS prod_a,
        oi2.product_id AS prod_b,
        COUNT(DISTINCT o.user_id) AS weight
    FROM order_items oi1
    JOIN order_items oi2 
      ON oi1.order_id = oi2.order_id 
     AND oi1.product_id < oi2.product_id
    JOIN orders o 
      ON oi1.order_id = o.id
    GROUP BY oi1.product_id, oi2.product_id
    ORDER BY weight DESC;
    """
    conn = psycopg2.connect(orders_url)
    with conn.cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall()
    conn.close()
    pairs = [(int(r[0]), int(r[1]), int(r[2])) for r in rows]
    log.info("Found %d distinct co-purchased product pairs in orders_db.", len(pairs))
    return pairs


def backfill_neo4j(
    pairs: List[Tuple[int, int, int]],
    metadata: Dict[int, Dict[str, str]],
    neo4j_uri: str,
    neo4j_user: str,
    neo4j_pass: str,
    batch_size: int = 200,
    dry_run: bool = False,
) -> int:
    """
    Idempotently merges BOUGHT_WITH relationships with computed weights into Neo4j.
    """
    if dry_run:
        log.info("[DRY RUN] Skipping Neo4j write. Top 5 pairs:")
        for a, b, w in pairs[:5]:
            log.info("  (:Product %d)-[:BOUGHT_WITH {weight: %d}]-(:Product %d)", a, w, b)
        return len(pairs)

    log.info("Connecting to Neo4j (%s)...", neo4j_uri)
    driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_pass))

    # Prepare batches
    batches: List[List[Dict[str, Any]]] = []
    current_batch: List[Dict[str, Any]] = []

    for a, b, weight in pairs:
        meta_a = metadata.get(a, {"name": f"Product #{a}", "category": "General"})
        meta_b = metadata.get(b, {"name": f"Product #{b}", "category": "General"})
        current_batch.append({
            "prod_a": a,
            "name_a": meta_a["name"],
            "cat_a": meta_a["category"],
            "prod_b": b,
            "name_b": meta_b["name"],
            "cat_b": meta_b["category"],
            "weight": weight,
        })
        if len(current_batch) >= batch_size:
            batches.append(current_batch)
            current_batch = []
    if current_batch:
        batches.append(current_batch)

    cypher_unwind = """
    UNWIND $batch AS row
    MERGE (a:Product {id: row.prod_a})
      ON CREATE SET a.name = row.name_a, a.category = row.cat_a
    MERGE (b:Product {id: row.prod_b})
      ON CREATE SET b.name = row.name_b, b.category = row.cat_b
    MERGE (a)-[r:BOUGHT_WITH]->(b)
    SET r.weight = row.weight
    """

    total_merged = 0
    with driver.session() as session:
        for i, batch in enumerate(batches, 1):
            session.run(cypher_unwind, batch=batch)
            total_merged += len(batch)
            log.info("Batch %d/%d: merged %d edges (cumulative: %d).", i, len(batches), len(batch), total_merged)

    driver.close()
    log.info("✓ Successfully backfilled %d BOUGHT_WITH edges into Neo4j.", total_merged)
    return total_merged


def main():
    parser = argparse.ArgumentParser(description="Backfill BOUGHT_WITH relationships from orders_db into Neo4j")
    parser.add_argument("--batch-size", type=int, default=200, help="Batch size for Neo4j UNWIND writes")
    parser.add_argument("--dry-run", action="store_true", help="Print summary without modifying Neo4j")
    args = parser.parse_args()

    meta = fetch_product_metadata(PRODUCTS_DB_URL)
    pairs = query_copurchase_pairs(ORDERS_DB_URL)
    if not pairs:
        log.warning("No co-purchased product pairs found in orders_db.")
        return

    backfill_neo4j(
        pairs=pairs,
        metadata=meta,
        neo4j_uri=NEO4J_URI,
        neo4j_user=NEO4J_USER,
        neo4j_pass=NEO4J_PASSWORD,
        batch_size=args.batch_size,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
