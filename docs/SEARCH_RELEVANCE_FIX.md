# Search Relevance & Precision Engineering Fix

**Date:** 2026-10-19  
**Branch:** `feature/search-relevance`  
**Target Service:** `product-service` (Elasticsearch 8.13 kNN vector integration)

---

## 1. Problem Statement

Prior to this fix, querying `GET /products/search?q=Keyboard` (or any other query) in default (`hybrid`) mode returned the **entire product catalog** (all 20 items in Elasticsearch).

### Root Cause
In Elasticsearch, hybrid search combines a lexical BM25 query with a kNN dense vector query in a single request:
```json
{
  "query": { "bool": { ... } },
  "knn": {
    "field": "embedding",
    "query_vector": [ ... ],
    "k": 100,
    "num_candidates": 200
  }
}
```
Standard kNN nearest-neighbor search calculates distance across all indexed vector embeddings and unconditionally returns the top $k$ closest items. When $k \ge N$ (where $N=20$ is the catalog size), kNN retrieves every single document in the index regardless of how semantically distant it is from the query. The hybrid search then sums the BM25 score with the kNN score, resulting in every catalog item being included in the search results. Nonsense inputs (e.g. `zzzxqv`, `asdfgh`) also returned the entire catalog.

---

## 2. Before vs. After Measurement Tables

All measurements were taken live through the API Gateway (`http://localhost:8000/products/search`) across all 8 benchmark queries in `lexical`, `semantic`, and `default` (hybrid) modes.

### 2.1 Before Fix (Unfiltered kNN, $k=100$)

| Query | Mode | Count | Top 5 Products Returned with ES Score |
| :--- | :--- | :--- | :--- |
| `Keyboard` | `lexical` | 2 | 1. Mechanical Gaming Keyboard (34.2611)<br>2. Mechanical Gaming Keyboard (34.2611) |
| `Keyboard` | `semantic` | 20 | 1. Mechanical Gaming Keyboard (0.8588)<br>2. Mechanical Gaming Keyboard (0.8588)<br>3. Ergonomic Office Chair (0.7787)<br>4. Ergonomic Office Chair (0.7787)<br>5. Portable Bluetooth Speaker (0.7683) |
| `Keyboard` | `default` | 20 | 1. Mechanical Gaming Keyboard (35.1199)<br>2. Mechanical Gaming Keyboard (35.1199)<br>3. Ergonomic Office Chair (0.7787)<br>4. Ergonomic Office Chair (0.7787)<br>5. Portable Bluetooth Speaker (0.7683) |
| `headfones` | `lexical` | 2 | 1. Wireless Noise-Cancelling Headphones (9.0102)<br>2. Wireless Noise-Cancelling Headphones (9.0102) |
| `headfones` | `semantic` | 20 | 1. Wireless Noise-Cancelling Headphones (0.7962)<br>2. Wireless Noise-Cancelling Headphones (0.7962)<br>3. Portable Bluetooth Speaker (0.7711)<br>4. Portable Bluetooth Speaker (0.7711)<br>5. Mechanical Gaming Keyboard (0.7662) |
| `headfones` | `default` | 20 | 1. Wireless Noise-Cancelling Headphones (9.8065)<br>2. Wireless Noise-Cancelling Headphones (9.8065)<br>3. Portable Bluetooth Speaker (0.7711)<br>4. Portable Bluetooth Speaker (0.7711)<br>5. Mechanical Gaming Keyboard (0.7662) |
| `mouse` | `lexical` | 0 | *(No matches)* |
| `mouse` | `semantic` | 20 | 1. Mechanical Gaming Keyboard (0.7914)<br>2. Mechanical Gaming Keyboard (0.7914)<br>3. Ergonomic Office Chair (0.7507)<br>4. Ergonomic Office Chair (0.7507)<br>5. 4K USB-C Monitor 27 inch (0.7489) |
| `mouse` | `default` | 20 | 1. Mechanical Gaming Keyboard (0.7914)<br>2. Mechanical Gaming Keyboard (0.7914)<br>3. Ergonomic Office Chair (0.7507)<br>4. Ergonomic Office Chair (0.7507)<br>5. 4K USB-C Monitor 27 inch (0.7489) |
| `chair` | `lexical` | 2 | 1. Ergonomic Office Chair (34.2611)<br>2. Ergonomic Office Chair (34.2611) |
| `chair` | `semantic` | 20 | 1. Ergonomic Office Chair (0.8629)<br>2. Ergonomic Office Chair (0.8629)<br>3. Yoga Mat (0.7562)<br>4. Yoga Mat (0.7562)<br>5. Running Shoes Mens (0.7370) |
| `chair` | `default` | 20 | 1. Ergonomic Office Chair (35.1240)<br>2. Ergonomic Office Chair (35.1240)<br>3. Yoga Mat (0.7562)<br>4. Yoga Mat (0.7562)<br>5. Running Shoes Mens (0.7370) |
| `podcast` | `lexical` | 0 | *(No matches)* |
| `podcast` | `semantic` | 20 | 1. Wireless Noise-Cancelling Headphones (0.7263)<br>2. Wireless Noise-Cancelling Headphones (0.7263)<br>3. Portable Bluetooth Speaker (0.7192)<br>4. Portable Bluetooth Speaker (0.7192)<br>5. Mechanical Gaming Keyboard (0.7184) |
| `podcast` | `default` | 20 | 1. Wireless Noise-Cancelling Headphones (0.7263)<br>2. Wireless Noise-Cancelling Headphones (0.7263)<br>3. Portable Bluetooth Speaker (0.7192)<br>4. Portable Bluetooth Speaker (0.7192)<br>5. Mechanical Gaming Keyboard (0.7184) |
| `laptop stand` | `lexical` | 0 | *(No matches)* |
| `laptop stand` | `semantic` | 20 | 1. 4K USB-C Monitor 27 inch (0.8076)<br>2. 4K USB-C Monitor 27 inch (0.8076)<br>3. Ergonomic Office Chair (0.8051)<br>4. Ergonomic Office Chair (0.8051)<br>5. Mechanical Gaming Keyboard (0.7992) |
| `laptop stand` | `default` | 20 | 1. 4K USB-C Monitor 27 inch (0.8076)<br>2. 4K USB-C Monitor 27 inch (0.8076)<br>3. Ergonomic Office Chair (0.8051)<br>4. Ergonomic Office Chair (0.8051)<br>5. Mechanical Gaming Keyboard (0.7992) |
| `zzzxqv` | `lexical` | 0 | *(No matches)* |
| `zzzxqv` | `semantic` | 20 | 1. Mechanical Gaming Keyboard (0.7534)<br>2. Mechanical Gaming Keyboard (0.7534)<br>3. Portable Bluetooth Speaker (0.7491)<br>4. Portable Bluetooth Speaker (0.7491)<br>5. Wireless Noise-Cancelling Headphones (0.7453) |
| `zzzxqv` | `default` | 20 | 1. Mechanical Gaming Keyboard (0.7534)<br>2. Mechanical Gaming Keyboard (0.7534)<br>3. Portable Bluetooth Speaker (0.7491)<br>4. Portable Bluetooth Speaker (0.7491)<br>5. Wireless Noise-Cancelling Headphones (0.7453) |
| `asdfgh` | `lexical` | 0 | *(No matches)* |
| `asdfgh` | `semantic` | 20 | 1. Running Shoes Mens (0.7563)<br>2. Running Shoes Mens (0.7563)<br>3. 4K USB-C Monitor 27 inch (0.7561)<br>4. 4K USB-C Monitor 27 inch (0.7561)<br>5. Mechanical Gaming Keyboard (0.7520) |
| `asdfgh` | `default` | 20 | 1. Running Shoes Mens (0.7563)<br>2. Running Shoes Mens (0.7563)<br>3. 4K USB-C Monitor 27 inch (0.7561)<br>4. 4K USB-C Monitor 27 inch (0.7561)<br>5. Mechanical Gaming Keyboard (0.7520) |

---

### 2.2 After Fix (`SEARCH_MIN_SIMILARITY=0.54`, $k=50$, candidates$=100$)

| Query | Mode | Count | Top Products Returned with ES Score |
| :--- | :--- | :--- | :--- |
| `Keyboard` | `lexical` | 2 | 1. Mechanical Gaming Keyboard (35.3909)<br>2. Mechanical Gaming Keyboard (35.3909) |
| `Keyboard` | `semantic` | 4 | 1. Mechanical Gaming Keyboard (0.8588)<br>2. Mechanical Gaming Keyboard (0.8588)<br>3. Ergonomic Office Chair (0.7787)<br>4. Ergonomic Office Chair (0.7787) |
| `Keyboard` | `default` | 4 | 1. Mechanical Gaming Keyboard (36.2496)<br>2. Mechanical Gaming Keyboard (36.2496)<br>3. Ergonomic Office Chair (0.7787)<br>4. Ergonomic Office Chair (0.7787) |
| `headfones` | `lexical` | 2 | 1. Wireless Noise-Cancelling Headphones (9.3078)<br>2. Wireless Noise-Cancelling Headphones (9.3078) |
| `headfones` | `semantic` | 4 | 1. Wireless Noise-Cancelling Headphones (0.7962)<br>2. Wireless Noise-Cancelling Headphones (0.7962)<br>3. Portable Bluetooth Speaker (0.7711)<br>4. Portable Bluetooth Speaker (0.7711) |
| `headfones` | `default` | 4 | 1. Wireless Noise-Cancelling Headphones (10.1040)<br>2. Wireless Noise-Cancelling Headphones (10.1040)<br>3. Portable Bluetooth Speaker (0.7711)<br>4. Portable Bluetooth Speaker (0.7711) |
| `mouse` | `lexical` | 0 | *(No matches)* |
| `mouse` | `semantic` | 2 | 1. Mechanical Gaming Keyboard (0.7914)<br>2. Mechanical Gaming Keyboard (0.7914) |
| `mouse` | `default` | 2 | 1. Mechanical Gaming Keyboard (0.7914)<br>2. Mechanical Gaming Keyboard (0.7914) |
| `chair` | `lexical` | 2 | 1. Ergonomic Office Chair (35.3909)<br>2. Ergonomic Office Chair (35.3909) |
| `chair` | `semantic` | 2 | 1. Ergonomic Office Chair (0.8629)<br>2. Ergonomic Office Chair (0.8629) |
| `chair` | `default` | 2 | 1. Ergonomic Office Chair (36.2537)<br>2. Ergonomic Office Chair (36.2537) |
| `podcast` | `lexical` | 0 | *(No matches)* |
| `podcast` | `semantic` | 0 | *(No matches - noise filtered)* |
| `podcast` | `default` | 0 | *(No matches - noise filtered)* |
| `laptop stand` | `lexical` | 0 | *(No matches)* |
| `laptop stand` | `semantic` | 8 | 1. 4K USB-C Monitor 27 inch (0.8076)<br>2. 4K USB-C Monitor 27 inch (0.8076)<br>3. Ergonomic Office Chair (0.8051)<br>4. Ergonomic Office Chair (0.8051)<br>5. Mechanical Gaming Keyboard (0.7992) |
| `laptop stand` | `default` | 8 | 1. 4K USB-C Monitor 27 inch (0.8076)<br>2. 4K USB-C Monitor 27 inch (0.8076)<br>3. Ergonomic Office Chair (0.8051)<br>4. Ergonomic Office Chair (0.8051)<br>5. Mechanical Gaming Keyboard (0.7992) |
| `zzzxqv` | `lexical` | 0 | *(No matches)* |
| `zzzxqv` | `semantic` | 0 | *(No matches - complete noise rejection)* |
| `zzzxqv` | `default` | 0 | *(No matches - complete noise rejection)* |
| `asdfgh` | `lexical` | 0 | *(No matches)* |
| `asdfgh` | `semantic` | 0 | *(No matches - complete noise rejection)* |
| `asdfgh` | `default` | 0 | *(No matches - complete noise rejection)* |

---

## 3. Threshold Choice & Mathematical Evidence

### 3.1 Cosine Similarity vs. Elasticsearch `_score`
The index mapping defines the dense vector space with cosine similarity:
`"embedding": {"type": "dense_vector", "dims": 384, "similarity": "cosine"}`.

In Elasticsearch, the normalized `_score` for cosine similarity is computed as:
$$\text{\_score} = \frac{1 + \text{cosine\_similarity}}{2}$$
$$\text{cosine\_similarity} = 2 \times \text{\_score} - 1$$

When using the `similarity` filter parameter inside the Elasticsearch `knn` clause (`knn.similarity`), Elasticsearch filters on the **raw metric value** ($\text{cosine\_similarity} \in [-1, 1]$).

### 3.2 Evidence Across Benchmark Queries

| Query | Product Name | Relevance Classification | ES `_score` | Cosine Similarity |
| :--- | :--- | :--- | :--- | :--- |
| **`Keyboard`** | Mechanical Gaming Keyboard | **Clearly Relevant** | 0.8588 | **0.7175** |
| | Ergonomic Office Chair | Borderline / Peripheral | 0.7787 | 0.5573 |
| | Portable Bluetooth Speaker | Clearly Irrelevant | 0.7683 | 0.5366 |
| | Running Shoes Mens | Clearly Irrelevant | 0.7291 | 0.4582 |
| **`chair`** | Ergonomic Office Chair | **Clearly Relevant** | 0.8629 | **0.7258** |
| | Yoga Mat | Clearly Irrelevant | 0.7562 | 0.5124 |
| | Running Shoes Mens | Clearly Irrelevant | 0.7370 | 0.4739 |
| **`headfones`** | Wireless Noise-Cancelling Headphones | **Clearly Relevant** | 0.7962 | **0.5925** |
| | Portable Bluetooth Speaker | Clearly Irrelevant | 0.7711 | 0.5423 |
| | Yoga Mat | Clearly Irrelevant | 0.7289 | 0.4578 |
| **`zzzxqv` (gibberish)** | Mechanical Gaming Keyboard | **Pure Noise** | 0.7534 | **0.5067** |
| | Portable Bluetooth Speaker | Pure Noise | 0.7491 | 0.4983 |
| **`asdfgh` (gibberish)** | Running Shoes Mens | **Pure Noise** | 0.7563 | **0.5126** |
| | 4K USB-C Monitor 27 inch | Pure Noise | 0.7561 | 0.5121 |
| **`listen to podcasts...`** | Wireless Noise-Cancelling Headphones | **Target Semantic Match** | 0.7731 | **0.5462** |
| | Ergonomic Office Chair | Irrelevant | 0.7411 | 0.4822 |

### 3.3 Score Overlap & Trade-off Analysis
* **Noise Floor:** Pure nonsense strings (`zzzxqv` and `asdfgh`) peak at cosine similarity $\approx 0.5126$ (ES `_score` $0.7563$). Any threshold above $0.52$ completely eliminates nonsense queries.
* **Semantic Target Floor:** The natural-language query *"listen to podcasts without distractions"* matches *Wireless Noise-Cancelling Headphones* at cosine similarity $0.5462$ (ES `_score` $0.7731$).
* **Score Inversion / Overlap:** *Ergonomic Office Chair* has a cosine similarity of $0.5573$ to `Keyboard`. This occurs because FastEmbed `bge-small-en-v1.5` embeds both keyboards and office chairs in close proximity within the computer/office desk semantic cluster.
  * Setting threshold $> 0.55$ (e.g. $0.56$) removes the office chair from `Keyboard` (yielding exactly 2 results), but **drops** *"listen to podcasts without distractions"* to 0 results.
  * Setting threshold at **`0.54`** preserves semantic natural language queries (headphones score $0.5462 > 0.54$), eliminates all pure noise ($0.5126 < 0.54$), drops catalog saturation from 20 to 4 for `Keyboard` (with keyboards ranked at the top), and drops `chair` to exactly 2 results.

Therefore, **`SEARCH_MIN_SIMILARITY = 0.54`** represents the optimal compromise balancing noise suppression with semantic recall.

---

## 4. Environment Variables

The parameters are exposed as environment variables with sensible defaults:

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `SEARCH_KNN_K` | `50` | Maximum number of nearest vector neighbors to consider |
| `SEARCH_KNN_CANDIDATES` | `100` | Number of candidate vectors evaluated per shard before picking top $k$ |
| `SEARCH_MIN_SIMILARITY` | `0.54` | Minimum cosine similarity cutoff applied to the Elasticsearch `knn` block |

These variables are defined in:
* `product-service/elastic.py` (runtime fallback defaults)
* `docker-compose.yml` (container environment pass-through)
* `.env.example` (template documentation, no secrets)

---

## 5. Limitations

1. **Small Catalog Scale:**
   The threshold ($0.54$) was calibrated against a 20-product catalog. As the catalog expands to hundreds or thousands of products, vector density will increase, requiring periodic recalibration of `SEARCH_MIN_SIMILARITY`.
2. **Duplicate Product Seed Entries:**
   In the active database, the 10 catalog items are duplicated across IDs 1–10 and 11–20:
   * IDs `1` and `11`: *Wireless Noise-Cancelling Headphones*
   * IDs `2` and `12`: *Mechanical Gaming Keyboard*
   * IDs `3` and `13`: *Ergonomic Office Chair*
   * IDs `4` and `14`: *Stainless Steel Water Bottle*
   * IDs `5` and `15`: *Yoga Mat*
   * IDs `6` and `16`: *4K USB-C Monitor 27 inch*
   * IDs `7` and `17`: *Electric Kettle*
   * IDs `8` and `18`: *Running Shoes Mens*
   * IDs `9` and `19`: *Leather Wallet*
   * IDs `10` and `20`: *Portable Bluetooth Speaker*
   These duplicate records exist in the current database volume; they were detected and verified, but intentionally preserved without modification as instructed.
