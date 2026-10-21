"""
scripts/reproduce_search_relevance.py
Reproduction script for search relevance issue across 8 queries.
"""
import os
import sys
from elasticsearch import Elasticsearch
import elastic
from embeddings import get_query_embedding

INDEX_NAME = "products"
es = Elasticsearch(os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200"))

queries = [
    # 4 keyword queries present in the catalog
    ("keyword", "Keyboard"),
    ("keyword", "Yoga Mat"),
    ("keyword", "Monitor"),
    ("keyword", "Leather Wallet"),
    # 2 typos
    ("typo", "headfones"),
    ("typo", "keybaord"),
    # 2 purpose-style
    ("purpose", "listen to podcasts without distractions"),
    ("purpose", "reusable beverage flask for refreshing sips"),
]

def run_es_query(query_str, mode):
    clean_query = query_str.strip()
    bool_clause = {
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

    body = {"size": 100}
    if mode == "lexical":
        body["query"] = {"bool": bool_clause}
    elif mode == "semantic":
        q_vec = get_query_embedding(clean_query)
        body["knn"] = {
            "field": "embedding",
            "query_vector": q_vec,
            "k": 100,
            "num_candidates": 200,
        }
    elif mode == "hybrid":
        q_vec = get_query_embedding(clean_query)
        body["query"] = {"bool": bool_clause}
        body["knn"] = {
            "field": "embedding",
            "query_vector": q_vec,
            "k": 100,
            "num_candidates": 200,
        }

    res = es.search(index=INDEX_NAME, body=body)
    hits = res["hits"]["hits"]
    return hits

def main():
    cat_count = es.count(index=INDEX_NAME)["count"]
    print("=" * 80)
    print(f"CATALOG SIZE N = {cat_count}")
    print("=" * 80)

    for q_type, q in queries:
        print(f"\nQuery: '{q}' (Type: {q_type})")
        print("-" * 75)
        for mode in ["lexical", "semantic", "hybrid"]:
            hits = run_es_query(q, mode)
            count = len(hits)
            print(f"  Mode: {mode:<8} | Total Results: {count}")
            top5 = hits[:5]
            for rank, hit in enumerate(top5, 1):
                name = hit["_source"].get("name", "")
                score = hit["_score"]
                # If semantic, calculate cosine similarity = 2 * score - 1
                cos_str = ""
                if mode == "semantic":
                    cos = 2.0 * score - 1.0
                    cos_str = f" (cosine: {cos:.4f})"
                print(f"    {rank}. {name:<42} | score: {score:.4f}{cos_str}")

if __name__ == "__main__":
    main()
