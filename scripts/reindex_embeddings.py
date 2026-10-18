# scripts/reindex_embeddings.py
# ─────────────────────────────────────────────────────────────────────────────
# Idempotent batch reindexing script:
# PostgreSQL (products_db) → Elasticsearch ("products" index with dense_vector embeddings)
#
# Generates 384-dimensional ONNX embeddings via FastEmbed (BAAI/bge-small-en-v1.5)
# for text = name + category + description.
#
# Usage:
#   python scripts/reindex_embeddings.py
# ─────────────────────────────────────────────────────────────────────────────

import os
import sys
import logging
from typing import List, Optional
import psycopg2
import psycopg2.extras
from elasticsearch import Elasticsearch

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("reindex_embeddings")

# Configuration
PRODUCTS_DB_URL = os.getenv("PRODUCTS_DB_URL", "postgresql://postgres:postgres@localhost:5434/products_db")
ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://localhost:9200")
INDEX_NAME = "products"
MODEL_NAME = "BAAI/bge-small-en-v1.5"
CACHE_DIR = os.getenv("FASTEMBED_CACHE_PATH", "./product-service/model_cache")


def get_embedding_model():
    """Initializes FastEmbed TextEmbedding model or delegates to container."""
    try:
        from fastembed import TextEmbedding
        log.info(f"Loading FastEmbed model '{MODEL_NAME}'...")
        return TextEmbedding(model_name=MODEL_NAME, cache_dir=CACHE_DIR)
    except ModuleNotFoundError:
        log.warning("FastEmbed not installed on host Python. Executing via product-service container...")
        import subprocess
        result = subprocess.run(["docker", "exec", "product-service", "python", "-c", "import elastic; elastic.update_mapping_and_reindex()"], capture_output=True, text=True)
        print(result.stdout)
        if result.stderr:
            print(result.stderr, file=sys.stderr)
        sys.exit(result.returncode)
    except Exception as exc:
        log.error(f"Failed to load FastEmbed model: {exc}")
        return None


def reindex_products():
    log.info(f"Connecting to Elasticsearch at {ELASTICSEARCH_URL}...")
    es = Elasticsearch(ELASTICSEARCH_URL, verify_certs=False, ssl_show_warn=False)

    if not es.ping():
        log.error("Cannot connect to Elasticsearch. Is it running?")
        sys.exit(1)

    # 1. Ensure Index and Mapping exist
    dense_vector_prop = {
        "type": "dense_vector",
        "dims": 384,
        "index": True,
        "similarity": "cosine",
    }

    if not es.indices.exists(index=INDEX_NAME):
        log.info(f"Creating index '{INDEX_NAME}' with dense_vector mapping...")
        mapping = {
            "mappings": {
                "properties": {
                    "name":           {"type": "text"},
                    "description":    {"type": "text"},
                    "category":       {"type": "keyword"},
                    "price":          {"type": "float"},
                    "stock_quantity": {"type": "integer"},
                    "rating":         {"type": "float"},
                    "created_at":     {"type": "date"},
                    "image_url":      {"type": "keyword", "index": False},
                    "embedding":      dense_vector_prop,
                }
            }
        }
        es.indices.create(index=INDEX_NAME, body=mapping)
    else:
        log.info(f"Index '{INDEX_NAME}' exists. Verifying/updating dense_vector mapping...")
        try:
            es.indices.put_mapping(
                index=INDEX_NAME,
                body={"properties": {"embedding": dense_vector_prop}},
            )
        except Exception as exc:
            log.warning(f"put_mapping notice: {exc}")

    # 2. Load model
    model = get_embedding_model()
    if not model:
        log.error("Cannot proceed without embedding model.")
        sys.exit(1)

    # 3. Connect to PostgreSQL
    log.info(f"Connecting to products_db at {PRODUCTS_DB_URL}...")
    conn = psycopg2.connect(PRODUCTS_DB_URL)
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    cursor.execute("""
        SELECT id, name, category, price, description, stock_quantity, rating, created_at, image_url
        FROM products
        ORDER BY id ASC;
    """)
    rows = cursor.fetchall()
    log.info(f"Loaded {len(rows)} products from PostgreSQL.")

    indexed_count = 0
    for row in rows:
        pid = row["id"]
        name = row["name"] or ""
        category = row["category"] or ""
        description = row["description"] or ""

        # text = name + category + description
        text_parts = [p.strip() for p in [name, category, description] if p.strip()]
        embedding_text = " ".join(text_parts)

        # Compute embedding
        embeddings = list(model.embed([embedding_text]))
        vector = [float(x) for x in embeddings[0]] if embeddings else None

        doc = {
            "name":           name,
            "category":       category,
            "price":          float(row["price"]) if row["price"] is not None else 0.0,
            "description":    description,
            "stock_quantity": int(row["stock_quantity"] or 0),
            "image_url":      row["image_url"],
            "rating":         float(row["rating"]) if row["rating"] is not None else None,
            "created_at":     row["created_at"].isoformat() if row["created_at"] else None,
        }
        if vector:
            doc["embedding"] = vector

        es.index(index=INDEX_NAME, id=str(pid), document=doc)
        indexed_count += 1

    es.indices.refresh(index=INDEX_NAME)
    conn.close()
    log.info(f"Successfully reindexed {indexed_count} products with embeddings into '{INDEX_NAME}'.")


if __name__ == "__main__":
    reindex_products()
