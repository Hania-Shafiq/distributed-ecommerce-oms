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
    request_timeout=30,
    max_retries=3,
    retry_on_timeout=True,
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


# ── Full-text & prefix search ──────────────────────────────────────────────────
def search_products(query: str) -> list[dict]:
    """
    Search the 'products' index for documents matching `query` across
    name, category, and description fields.

    Uses a bool/should query combining:
    1. Fuzzy full-text search (handles typos like 'laptpo' -> 'laptop')
    2. Phrase prefix matching (handles live typing like 'ch' -> 'chair')
    3. Substring wildcard matching (handles partial tokens)
    """
    clean_query = query.strip()
    if not clean_query:
        return []

    body = {
        "query": {
            "bool": {
                "should": [
                    {
                        "multi_match": {
                            "query": clean_query,
                            "fields": ["name^3", "description"],
                            "type": "phrase_prefix",
                            "boost": 3.0,
                        }
                    },
                    {
                        "multi_match": {
                            "query": clean_query,
                            "fields": ["name^3", "description"],
                            "fuzziness": "AUTO",
                            "boost": 2.0,
                        }
                    },
                    {
                        "wildcard": {
                            "name": {
                                "value": f"*{clean_query.lower()}*",
                                "boost": 1.5,
                                "case_insensitive": True,
                            }
                        }
                    },
                    {
                        "wildcard": {
                            "category": {
                                "value": f"*{clean_query.lower()}*",
                                "boost": 1.0,
                                "case_insensitive": True,
                            }
                        }
                    },
                ],
                "minimum_should_match": 1,
            }
        }
    }

    response = es_client.search(
        index=INDEX_NAME,
        body=body,
    )

    results = []
    for hit in response["hits"]["hits"]:
        doc = hit["_source"]
        doc["id"] = int(hit["_id"])   # re-attach the id (stored as ES _id)
        results.append(doc)

    return results


# ── Search autocomplete / typeahead ───────────────────────────────────────────
def autocomplete_products(query: str, limit: int = 8) -> list[str]:
    """
    Search-as-you-type autocomplete suggestions for product names using Elasticsearch.

    Uses a bool/should query combining:
    1. match_bool_prefix: analyzes prefix of the last term, ideal for typeahead
    2. match_phrase_prefix: matches word sequence prefixes
    3. wildcard: substring prefix fallback (case-insensitive)

    Returns a deduplicated list of matching product names.
    """
    clean_query = query.strip()
    if not clean_query:
        return []

    body = {
        "size": limit * 3,  # fetch extra hits to account for deduplication
        "_source": ["name"],
        "query": {
            "bool": {
                "should": [
                    {
                        "match_bool_prefix": {
                            "name": {
                                "query": clean_query,
                                "boost": 4.0,
                            }
                        }
                    },
                    {
                        "match_phrase_prefix": {
                            "name": {
                                "query": clean_query,
                                "boost": 3.0,
                            }
                        }
                    },
                    {
                        "wildcard": {
                            "name": {
                                "value": f"*{clean_query.lower()}*",
                                "case_insensitive": True,
                                "boost": 1.5,
                            }
                        }
                    },
                ],
                "minimum_should_match": 1,
            }
        },
    }

    response = es_client.search(
        index=INDEX_NAME,
        body=body,
    )

    seen = set()
    suggestions = []
    for hit in response["hits"]["hits"]:
        name = hit["_source"].get("name")
        if name and name not in seen:
            seen.add(name)
            suggestions.append(name)
            if len(suggestions) >= limit:
                break

    return suggestions

