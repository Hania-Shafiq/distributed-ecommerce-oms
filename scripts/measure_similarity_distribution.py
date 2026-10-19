"""
scripts/measure_similarity_distribution.py
Measures cosine similarity and ES score for relevant vs irrelevant hits.
"""
from elasticsearch import Elasticsearch
from embeddings import get_query_embedding

es = Elasticsearch("http://elasticsearch:9200")

test_queries = [
    ("Keyboard", "Mechanical Gaming Keyboard"),
    ("Yoga Mat", "Yoga Mat"),
    ("4K USB-C Monitor 27 inch", "4K USB-C Monitor 27 inch"),
    ("Leather Wallet", "Leather Wallet"),
    ("listen to podcasts without distractions", "Wireless Noise-Cancelling Headphones"),
    ("reusable beverage flask for refreshing sips", "Stainless Steel Water Bottle"),
    ("zzzxqv", "(nonsense/irrelevant)"),
]

for q, target in test_queries:
    q_vec = get_query_embedding(q)
    res = es.search(
        index="products",
        body={
            "knn": {
                "field": "embedding",
                "query_vector": q_vec,
                "k": 35,
                "num_candidates": 100,
            },
            "size": 35,
        },
    )
    hits = res["hits"]["hits"]
    print(f"\n================ Query: '{q}' (Target: {target}) ================")
    print(f"Total kNN hits returned: {len(hits)}")
    for rank, h in enumerate(hits, 1):
        name = h["_source"]["name"]
        cat = h["_source"]["category"]
        es_score = h["_score"]
        cosine = 2.0 * es_score - 1.0
        # Print top 6, rank 10, and bottom 3
        if rank <= 6 or rank == 10 or rank >= 33:
            marker = " *** RELEVANT" if target.lower() in name.lower() else ""
            print(f"  #{rank:2d} | {name:<38} [{cat:<15}] | ES _score: {es_score:.4f} | cosine: {cosine:.4f}{marker}")
