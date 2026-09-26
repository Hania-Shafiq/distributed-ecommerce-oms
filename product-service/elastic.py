# elastic.py
# ─────────────────────────────────────────────────────────────────────────────
# Centralises all Elasticsearch logic:
#   • Client creation (reads ES URL from .env)
#   • Index bootstrap (creates the "products" index if it doesn't exist)
#   • index_product()  — upsert a product document into ES
#   • delete_product() — remove a product document from ES
#   • search_products() — full-text search across name + description
# ─────────────────────────────────────────────────────────────────────────────

import os
from dotenv import load_dotenv
from elasticsearch import Elasticsearch, NotFoundError

# Load .env so ELASTICSEARCH_URL is available via os.getenv
load_dotenv()

# ── Constants ─────────────────────────────────────────────────────────────────
# INDEX_NAME is the Elasticsearch index we'll use — think of it like a DB table.
# Defining it as a constant (not a magic string) means we only change it in one
# place if we ever rename the index.
INDEX_NAME = "products"

# Read the ES URL from the environment (set in .env or as a real env var).
ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://localhost:9200")


# ── Client singleton ──────────────────────────────────────────────────────────
# We create ONE client instance at module load time.  The Elasticsearch client
# manages an internal connection pool so reusing a single instance is efficient
# (no repeated TCP handshakes per request).
# verify_certs=False + ssl_show_warn=False → our docker-compose disables
# TLS (xpack.security.enabled=false), so we skip certificate validation.
es_client = Elasticsearch(
    ELASTICSEARCH_URL,
    verify_certs=False,
    ssl_show_warn=False,
)


# ── Index bootstrap ───────────────────────────────────────────────────────────
def create_index_if_not_exists() -> None:
    """
    Called once at app startup (from main.py lifespan).
    Creates the 'products' ES index with an explicit mapping so ES knows
    which fields to analyse as full text vs. keyword/numeric.

    Why explicit mapping?
    Without it, ES uses 'dynamic mapping' — it guesses types on first document.
    That can lead to 'price' being indexed as text if the first value is "free".
    Being explicit avoids surprises.
    """
    if es_client.indices.exists(index=INDEX_NAME):
        # Index already exists — nothing to do. This is idempotent:
        # safe to call on every restart without destroying data.
        return

    # Define the mapping: how each field is stored and analysed.
    mapping = {
        "mappings": {
            "properties": {
                # 'text' type → ES applies a language analyser (lowercasing,
                # stemming, stop-word removal) making it great for full-text search.
                "name":        {"type": "text"},
                "description": {"type": "text"},

                # 'keyword' type → stored as-is, used for exact match / aggregation.
                # e.g. filtering products WHERE category = 'Electronics'
                "category":    {"type": "keyword"},

                # Numeric types — stored efficiently for range queries / sorting.
                "price":          {"type": "float"},
                "stock_quantity": {"type": "integer"},

                # Image URL
                "image_url":      {"type": "keyword", "index": False},
            }
        }
    }
    es_client.indices.create(index=INDEX_NAME, body=mapping)
    print(f"[ES] Created index '{INDEX_NAME}'")


# ── Upsert a product document ─────────────────────────────────────────────────
def index_product(product_id: int, product_data: dict) -> None:
    """
    Index (insert or update) a single product document in Elasticsearch.

    We use `index()` (not `create()`):
    • `create()` fails if the doc already exists.
    • `index()` overwrites → works for both CREATE and UPDATE operations.
      This lets us call the same function from both the POST and PUT endpoints.

    Parameters
    ----------
    product_id   : The PostgreSQL row id — used as the ES document _id so the
                   two stores stay in sync (same id in both systems).
    product_data : A plain dict of the fields to store (from schemas.py).
    """
    es_client.index(
        index=INDEX_NAME,
        id=str(product_id),    # ES _id must be a string
        document=product_data,
    )


# ── Delete a product document ─────────────────────────────────────────────────
def delete_product_from_es(product_id: int) -> None:
    """
    Remove a product document from Elasticsearch when it's deleted from the DB.
    Wraps NotFoundError so the DELETE endpoint doesn't crash if ES is temporarily
    out of sync (e.g. ES was down when the product was originally indexed).
    """
    try:
        es_client.delete(index=INDEX_NAME, id=str(product_id))
    except NotFoundError:
        # Document wasn't in ES — not a problem, we were deleting it anyway.
        pass


# ── Full-text search ──────────────────────────────────────────────────────────
def search_products(query: str) -> list[dict]:
    """
    Search the 'products' index for documents matching `query` in either the
    'name' or 'description' fields.

    We use a multi_match query:
    • type="best_fields" → ES scores each field independently and takes the
      highest score.  Good when a query term is likely to appear in ONE field
      strongly (vs. cross_fields which treats all fields as one big field).
    • fuzziness="AUTO" → allows ~1-2 typo tolerance depending on word length.
      e.g. "laptpo" still matches "laptop".

    Returns a list of plain dicts (the _source of each hit), ready to be
    serialised by FastAPI.
    """
    response = es_client.search(
        index=INDEX_NAME,
        body={
            "query": {
                "multi_match": {
                    "query":     query,
                    "fields":    ["name", "description"],  # search both fields
                    "fuzziness": "AUTO",                   # typo-tolerant
                    "type":      "best_fields",
                }
            }
        },
    )

    # response["hits"]["hits"] is a list of hit objects, each containing:
    #   _id, _score, _source (the actual document fields)
    # We extract _source and add the ES document id back in so callers know
    # which product it is (mirrors the PostgreSQL id).
    results = []
    for hit in response["hits"]["hits"]:
        doc = hit["_source"]
        doc["id"] = int(hit["_id"])   # re-attach the id (stored as ES _id)
        results.append(doc)

    return results
