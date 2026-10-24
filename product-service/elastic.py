# elastic.py
# ─────────────────────────────────────────────────────────────────────────────
# Centralises all Elasticsearch logic:
#   • Client creation (reads ES URL from .env)
#   • Index bootstrap (creates the "products" index if it doesn't exist)
#   • Dense vector embedding support (384 dims, cosine similarity)
#   • index_product()  — upsert a product document into ES with embedding
#   • delete_product() — remove a product document from ES
#   • search_products() — lexical, semantic (kNN), or hybrid search
#   • get_similar_products() — kNN vector similarity search excluding self
# ─────────────────────────────────────────────────────────────────────────────

import os
import logging
from dotenv import load_dotenv
from elasticsearch import Elasticsearch, NotFoundError

# Internal embeddings helper
from embeddings import (
    get_query_embedding,
    compute_text_embedding,
    build_product_embedding_text,
)

logger = logging.getLogger("product_service.elastic")

# Load .env so ELASTICSEARCH_URL is available via os.getenv
load_dotenv()

# ── Constants ─────────────────────────────────────────────────────────────────
INDEX_NAME = "products"
ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://localhost:9200")
KNN_K = int(os.getenv("KNN_K", "20"))
KNN_SIMILARITY_THRESHOLD = float(os.getenv("KNN_SIMILARITY_THRESHOLD", "0.52"))

# ── Search Relevance & kNN Knobs ──────────────────────────────────────────────
SEARCH_KNN_K = int(os.getenv("SEARCH_KNN_K", "50"))
SEARCH_KNN_CANDIDATES = int(os.getenv("SEARCH_KNN_CANDIDATES", "100"))
SEARCH_MIN_SIMILARITY = float(os.getenv("SEARCH_MIN_SIMILARITY", "0.54"))

# ── Client singleton ──────────────────────────────────────────────────────────
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
    Creates the 'products' ES index with explicit mapping including dense_vector embedding.
    """
    if es_client.indices.exists(index=INDEX_NAME):
        return

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
                "is_archived":    {"type": "boolean"},
                # ML Dense Vector Embedding (384 dims, BAAI/bge-small-en-v1.5)
                "embedding": {
                    "type": "dense_vector",
                    "dims": 384,
                    "index": True,
                    "similarity": "cosine",
                },
            }
        }
    }
    es_client.indices.create(index=INDEX_NAME, body=mapping)
    print(f"[ES] Created index '{INDEX_NAME}' with dense_vector embedding mapping.")


def update_mapping_and_reindex() -> None:
    """
    Ensures 'rating', 'created_at', and 'embedding' exist in mapping,
    and reindexes all products from PostgreSQL into Elasticsearch with embeddings.
    """
    create_index_if_not_exists()
    try:
        es_client.indices.put_mapping(
            index=INDEX_NAME,
            body={
                "properties": {
                    "rating":      {"type": "float"},
                    "created_at":  {"type": "date"},
                    "is_archived": {"type": "boolean"},
                    "embedding": {
                        "type": "dense_vector",
                        "dims": 384,
                        "index": True,
                        "similarity": "cosine",
                    },
                }
            },
        )
        print("[ES] Verified / updated mapping with dense_vector embedding.")
    except Exception as e:
        print(f"[ES] Notice on put_mapping: {e}")

    # Reindex all products from database with vector embeddings
    try:
        from database import SessionLocal
        import models
        db = SessionLocal()
        try:
            products = db.query(models.Product).all()
            texts = [build_product_embedding_text(p.name, p.category, p.description) for p in products]
            from embeddings import compute_batch_embeddings
            batch_embeddings = compute_batch_embeddings(texts)

            for idx, p in enumerate(products):
                emb = batch_embeddings[idx] if idx < len(batch_embeddings) else None
                doc = {
                    "name":           p.name,
                    "category":       p.category,
                    "price":          float(p.price),
                    "description":    p.description,
                    "stock_quantity": p.stock_quantity,
                    "image_url":      p.image_url,
                    "rating":         float(p.rating) if p.rating is not None else None,
                    "created_at":     p.created_at.isoformat() if p.created_at else None,
                    "is_archived":    bool(getattr(p, "is_archived", False)),
                }
                if emb:
                    doc["embedding"] = emb
                index_product(p.id, doc)
            es_client.indices.refresh(index=INDEX_NAME)
            print(f"[ES] Successfully reindexed {len(products)} products with vector embeddings into '{INDEX_NAME}'.", flush=True)
        finally:
            db.close()
    except Exception as e:
        print(f"[ES] Failed to reindex products: {e}", flush=True)


# ── Upsert a product document ─────────────────────────────────────────────────
def index_product(product_id: int, product_data: dict) -> None:
    """
    Index (insert or update) a single product document in Elasticsearch.
    Automatically computes vector embedding if not already provided.
    """
    doc = dict(product_data)
    doc["is_archived"] = bool(doc.get("is_archived", False))
    if "embedding" not in doc or not doc["embedding"]:
        text = build_product_embedding_text(
            doc.get("name", ""),
            doc.get("category", ""),
            doc.get("description", ""),
        )
        emb = compute_text_embedding(text)
        if emb:
            doc["embedding"] = emb

    es_client.index(
        index=INDEX_NAME,
        id=str(product_id),
        document=doc,
    )


def refresh_index() -> None:
    """
    Explicitly refreshes the Elasticsearch index so newly indexed/updated
    documents are immediately visible in search and autocomplete queries.
    """
    try:
        es_client.indices.refresh(index=INDEX_NAME)
    except Exception as e:
        logger.warning(f"[ES] Failed to refresh index: {e}")


# ── Delete a product document ─────────────────────────────────────────────────
def delete_product_from_es(product_id: int) -> None:
    """
    Remove a product document from Elasticsearch when it's deleted from the DB.
    """
    try:
        es_client.delete(index=INDEX_NAME, id=str(product_id))
    except NotFoundError:
        pass


# ── Full-text, Semantic, and Hybrid Search ────────────────────────────────────
def search_products(
    query: str,
    mode: str = "hybrid",
    category: str = None,
    min_price: float = None,
    max_price: float = None,
    in_stock_ids: list[int] = None,
    sort: str = None,
    skip: int = 0,
    limit: int = 100,
) -> list[dict]:
    """
    Search products using lexical, semantic, or hybrid mode.
    - lexical: BM25 text match + phrase prefix + fuzzy
    - semantic: kNN search using query vector embeddings
    - hybrid: combines ES query + knn in ONE search request (scores summed, no RRF)
    Falls back to lexical search if semantic model fails.
    """
    clean_query = query.strip()
    if not clean_query:
        return []

    filters = []
    if category and category.strip() and category.strip().lower() != "all":
        filters.append({"term": {"category": {"value": category.strip(), "case_insensitive": True}}})

    price_range = {}
    if min_price is not None:
        price_range["gte"] = float(min_price)
    if max_price is not None:
        price_range["lte"] = float(max_price)
    if price_range:
        filters.append({"range": {"price": price_range}})

    if in_stock_ids is not None:
        if in_stock_ids:
            filters.append({"terms": {"_id": [str(pid) for pid in in_stock_ids]}})
        else:
            filters.append({"range": {"stock_quantity": {"gt": 0}}})

    # Filter out archived / discontinued products from customer search
    filters.append({"term": {"is_archived": False}})

    # Base lexical bool clause
    bool_clause = {
        "should": [
            {
                "match_phrase": {
                    "name": {
                        "query": clean_query,
                        "boost": 10.0,
                    }
                }
            },
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

    if filters:
        bool_clause["filter"] = filters

    search_mode = (mode or "hybrid").strip().lower()
    if search_mode not in ("lexical", "semantic", "hybrid"):
        search_mode = "hybrid"

    query_vector = None
    if search_mode in ("semantic", "hybrid"):
        try:
            query_vector = get_query_embedding(clean_query)
        except Exception as e:
            logger.warning(f"[Search] Could not generate query embedding: {e}")
            query_vector = None

        # Fallback to lexical if model fails
        if not query_vector:
            logger.info(f"[Search] Model unavailable or empty vector for '{clean_query}'. Falling back to lexical mode.")
            search_mode = "lexical"

    body = {
        "from": max(0, int(skip)),
        "size": max(1, int(limit)),
    }

    if search_mode == "lexical":
        body["query"] = {"bool": bool_clause}

    elif search_mode == "semantic":
        effective_k = int(os.getenv("SEARCH_KNN_K", os.getenv("KNN_K", str(KNN_K))))
        effective_candidates = int(os.getenv("SEARCH_KNN_CANDIDATES", str(max(50, effective_k * 5))))
        effective_min_sim = float(os.getenv("SEARCH_MIN_SIMILARITY", os.getenv("KNN_SIMILARITY_THRESHOLD", str(KNN_SIMILARITY_THRESHOLD))))

        knn_clause = {
            "field": "embedding",
            "query_vector": query_vector,
            "k": effective_k,
            "num_candidates": effective_candidates,
            "similarity": effective_min_sim,
        }
        if filters:
            knn_clause["filter"] = filters
        body["knn"] = knn_clause

    elif search_mode == "hybrid":
        # Hybrid search: ES knn + query in ONE search request (scores are summed)
        effective_k = int(os.getenv("SEARCH_KNN_K", os.getenv("KNN_K", str(KNN_K))))
        effective_candidates = int(os.getenv("SEARCH_KNN_CANDIDATES", str(max(50, effective_k * 5))))
        effective_min_sim = float(os.getenv("SEARCH_MIN_SIMILARITY", os.getenv("KNN_SIMILARITY_THRESHOLD", str(KNN_SIMILARITY_THRESHOLD))))

        knn_clause = {
            "field": "embedding",
            "query_vector": query_vector,
            "k": effective_k,
            "num_candidates": effective_candidates,
            "similarity": effective_min_sim,
        }
        if filters:
            knn_clause["filter"] = filters

        body["query"] = {"bool": bool_clause}
        body["knn"] = knn_clause

    # Apply sorting
    if sort == "price_asc":
        body["sort"] = [{"price": "asc"}]
    elif sort == "price_desc":
        body["sort"] = [{"price": "desc"}]
    elif sort == "rating_desc":
        body["sort"] = [{"rating": {"order": "desc", "missing": "_last"}}]
    elif sort == "newest":
        body["sort"] = [{"created_at": {"order": "desc", "missing": "_last"}}]

    response = es_client.search(index=INDEX_NAME, body=body)

    results = []
    for hit in response["hits"]["hits"]:
        doc = hit["_source"]
        doc["id"] = int(hit["_id"])
        # Remove raw dense vector from response payload to keep payload clean
        doc.pop("embedding", None)
        results.append(doc)

    if sort == "name":
        results.sort(key=lambda x: (x.get("name") or "").lower())

    return results


# ── Similar Products via kNN ──────────────────────────────────────────────────
def get_similar_products(product_id: int, limit: int = 5) -> list[dict]:
    """
    Finds top similar products using kNN vector search on the stored product embedding,
    strictly excluding the product itself.
    """
    try:
        product_doc = es_client.get(index=INDEX_NAME, id=str(product_id))
    except NotFoundError:
        return None

    source = product_doc.get("_source", {})
    query_vector = source.get("embedding")

    if not query_vector:
        text = build_product_embedding_text(
            source.get("name", ""),
            source.get("category", ""),
            source.get("description", ""),
        )
        query_vector = compute_text_embedding(text)
        if query_vector:
            # Save it back to ES document
            source["embedding"] = query_vector
            index_product(product_id, source)

    if not query_vector:
        return []

    k_val = limit + 1
    knn_clause = {
        "field": "embedding",
        "query_vector": query_vector,
        "k": k_val,
        "num_candidates": max(50, k_val * 10),
        "filter": {
            "bool": {
                "must_not": [
                    {"term": {"_id": str(product_id)}}
                ]
            }
        }
    }

    response = es_client.search(
        index=INDEX_NAME,
        body={
            "size": limit,
            "knn": knn_clause,
        }
    )

    results = []
    for hit in response["hits"]["hits"]:
        hit_id = int(hit["_id"])
        if hit_id == product_id:
            continue
        doc = hit["_source"]
        doc["id"] = hit_id
        doc.pop("embedding", None)
        results.append(doc)
        if len(results) >= limit:
            break

    return results


# ── Search autocomplete / typeahead ───────────────────────────────────────────
def autocomplete_products(query: str, limit: int = 8) -> list[str]:
    """
    Search-as-you-type autocomplete suggestions for product names using Elasticsearch.
    """
    clean_query = query.strip()
    if not clean_query:
        return []

    body = {
        "size": limit * 3,
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
                "filter": [
                    {"term": {"is_archived": False}}
                ],
                "minimum_should_match": 1,
            }
        },
    }

    response = es_client.search(index=INDEX_NAME, body=body)

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
