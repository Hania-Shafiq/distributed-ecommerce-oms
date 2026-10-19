# Search Relevance & Precision Engineering Fix

**Date:** 2026-10-19  
**Branch:** `feature/search-relevance`  
**Target Service:** `product-service` (Elasticsearch 8.13 kNN vector integration)

---

## 1. Problem Overview & Root Cause Analysis

### Background
Following the introduction of vector embeddings and hybrid search in `product-service`, queries such as `GET /products/search?q=Keyboard` returned every item in the catalog (all 35 products on the test stack), including completely irrelevant items such as Yoga Mats, Running Shoes, and Leather Wallets.

### Root Cause
In `product-service/elastic.py` (lines 276 & 288):
1. Both `semantic` and `hybrid` search modes hardcoded `k: 100` and `num_candidates: 200` without any similarity cutoff:
   ```python
   knn_clause = {
       "field": "embedding",
       "query_vector": query_vector,
       "k": 100,
       "num_candidates": 200,
   }
   ```
2. Because the catalog size ($N = 35$) was smaller than $k = 100$, Elasticsearch's approximate kNN algorithm unconditionally returned all $N$ items in the catalog sorted by cosine similarity, regardless of how low the similarity was.
3. In `hybrid` search mode, Elasticsearch executes both the `query` (lexical bool clause) and the `knn` clause within a single search request and sums their scores. Because the kNN clause returned every document in the index, the combined result set included the entire catalog.
4. Furthermore, exact title matches did not have dedicated phrase boosting over semantic scores, risking sub-optimal ranking.

---

## 2. Mathematical Foundation & Score Relations

### Cosine Similarity vs. Elasticsearch `_score`
The index mapping defines the dense vector space with cosine similarity:
`"embedding": {"type": "dense_vector", "dims": 384, "similarity": "cosine"}`.

In Elasticsearch, the normalized `_score` for cosine similarity is computed as:
$$\text{\_score} = \frac{1 + \text{cosine\_similarity}}{2}$$
$$\text{cosine\_similarity} = 2 \times \text{\_score} - 1$$

When using the `similarity` filter parameter inside the Elasticsearch `knn` clause (`knn.similarity`), Elasticsearch filters on the **raw metric value** ($\text{cosine\_similarity} \in [-1, 1]$).

---

## 3. Empirical Cosine Similarity Evidence & Threshold Selection

Measurements were conducted across the catalog using `BAAI/bge-small-en-v1.5` embeddings (384 dimensions, cosine metric).

### Relevant Matches vs Irrelevant Matches

| Query | Target Product | Relevance Classification | ES `_score` | Cosine Similarity |
| :--- | :--- | :--- | :---: | :---: |
| `4K USB-C Monitor 27 inch` | 4K USB-C Monitor 27 inch | **Clearly Relevant (Exact)** | 0.9384 | **0.8768** |
| `Yoga Mat` | Yoga Mat | **Clearly Relevant (Exact)** | 0.8963 | **0.7926** |
| `Leather Wallet` | Leather Wallet | **Clearly Relevant (Exact)** | 0.8884 | **0.7768** |
| `Keyboard` | Mechanical Gaming Keyboard | **Clearly Relevant (Exact)** | 0.8588 | **0.7175** |
| `keybaord` | Mechanical Gaming Keyboard | **Clearly Relevant (Typo)** | 0.8265 | **0.6530** |
| `reusable beverage flask...` | Stainless Steel Water Bottle | **Clearly Relevant (Purpose)** | 0.8228 | **0.6456** |
| `headfones` | Wireless Noise-Cancelling Headphones | **Clearly Relevant (Typo)** | 0.7962 | **0.5925** |
| `listen to podcasts without distractions` | Wireless Noise-Cancelling Headphones | **Target Semantic Match (Purpose)** | 0.7731 | **0.5462** |
| `Keyboard` | Laptop Stand | Borderline / Peripheral | 0.8119 | 0.6239 |
| `Keyboard` | Ergonomic Office Chair | Borderline / Peripheral | 0.7759 | 0.5518 |
| `listen to podcasts without distractions` | Electric Kettle | Irrelevant | 0.7337 | **0.4673** |
| `listen to podcasts without distractions` | Men's Running Shoes | Irrelevant | 0.7206 | **0.4412** |
| `Keyboard` | Leather Wallet | Irrelevant | 0.7207 | **0.4414** |
| `Keyboard` | Stainless Steel Water Bottle | Irrelevant | 0.7051 | **0.4101** |
| `zzzxqv` (Gibberish) | Stainless Steel Water Bottle | Pure Noise | 0.7534 | **0.5067** |
| `zzzxqv` (Gibberish) | Leather Wallet | Pure Noise | 0.7360 | **0.4721** |

### Threshold Selection
- The lowest relevant match is the abstract purpose query `"listen to podcasts without distractions"` yielding **0.5462** similarity to `Wireless Noise-Cancelling Headphones`.
- Irrelevant products for purpose queries score **$\le 0.4673$**.
- General catalog products against nonsense queries score **$\le 0.5067$** (with the bulk below $0.49$).
- **Selected Threshold**: `0.52` (with env-driven flexibility via `KNN_SIMILARITY_THRESHOLD` / `SEARCH_MIN_SIMILARITY`).
  - Preserves legitimate semantic purpose queries (similarity $\ge 0.5462$).
  - Drops irrelevant catalog items (similarity $< 0.52$).
  - Filters out noise/nonsense queries from standard catalog products.

---

## 4. Before vs After Results (8 Queries + Nonsense)

Catalog size: $N = 35$ products.

| Query Type | Query | Before (Lex / Sem / Hyb) | After (Lex / Sem / Hyb) | Top Hit Ranked #1 |
|---|---|:---:|:---:|---|
| **Keyword** | `Keyboard` | 3 / 35 / 35 | **3 / 14 / 14** | Mechanical Gaming Keyboard |
| **Keyword** | `Yoga Mat` | 3 / 35 / 35 | **3 / 16 / 16** | Yoga Mat |
| **Keyword** | `Monitor` | 3 / 35 / 35 | **3 / 14 / 14** | 4K USB-C Monitor 27 inch |
| **Keyword** | `Leather Wallet` | 6 / 35 / 35 | **6 / 17 / 20** | Leather Wallet |
| **Typo** | `headfones` | 3 / 35 / 35 | **3 / 18 / 18** | Wireless Noise-Cancelling Headphones |
| **Typo** | `keybaord` | 3 / 35 / 35 | **3 / 16 / 16** | Mechanical Gaming Keyboard |
| **Purpose** | `listen to podcasts without distractions` | 0 / 35 / 35 | **0 / 3 / 3** | Wireless Noise-Cancelling Headphones |
| **Purpose** | `reusable beverage flask for refreshing sips` | 12 / 35 / 35 | **12 / 20 / 28** | Stainless Steel Water Bottle |
| **Nonsense** | `zzzxqv` | 0 / 35 / 35 | **0 / 2 / 2** | Only 2 synthetic noise fixtures; 0 standard catalog |

---

## 5. Implementation Details

1. **Exact-Name Match Boosting**:
   Added a boosted `match_phrase` clause on `name` (`boost: 10.0`) in the Elasticsearch `bool` query. This ensures exact name matches receive a strong BM25 boost, guaranteeing they rank above pure semantic hits.
2. **Elasticsearch 8.13 kNN Similarity Threshold**:
   Applied `"similarity": KNN_SIMILARITY_THRESHOLD` and `"k": KNN_K` inside `knn_clause` for both semantic and hybrid modes. Pure semantic hits are only retained if their cosine similarity meets or exceeds this threshold.
3. **Lexical Hits Preserved**:
   Because Elasticsearch hybrid search evaluates the `query` (lexical bool) and `knn` clauses jointly, any document matching the lexical criteria is preserved regardless of its vector distance.
4. **Environment-Driven Configuration**:
   - `KNN_K` / `SEARCH_KNN_K` (default: `20`)
   - `KNN_SIMILARITY_THRESHOLD` / `SEARCH_MIN_SIMILARITY` (default: `0.52`)
   Configured and documented in `docker-compose.yml`, `product-service/elastic.py`, and `.env.example`.
5. **Preserved Features**:
   - **Filters**: Category (`case_insensitive: True`), price range (`min_price`, `max_price`), and `in_stock` (using live inventory ID filter) are applied to both the lexical `bool` clause and the kNN clause.
   - **Pagination**: Added `skip` and `limit` mapped to Elasticsearch `"from"` and `"size"`.
   - **Typeahead**: Autocomplete suggestions via `autocomplete_products()` preserved.
   - **Fallback**: Graceful fallback from semantic/hybrid to lexical search if the embedding model is unavailable or encounters errors.

---

## 6. Catalog Growth Note: Re-evaluating Threshold at ~400 Products

> [!WARNING]
> **Threshold Sensitivity at Scale**
> The current threshold was calibrated for a catalog of $N = 35$ items with diverse category distributions.
>
> When the catalog expands to approximately **400 products**:
> 1. **Vector Density Increase**: With more products in the embedding space, the density of items in popular categories (e.g., Electronics, Apparel) will increase. Cosine similarity between slightly related or tangent products may drift higher (into the $0.50$–$0.55$ range).
> 2. **Re-calibration Required**: The similarity threshold must be re-evaluated against empirical measurements once the catalog reaches ~400 products. The optimal threshold is expected to shift upwards (likely to **$0.55$ – $0.60$**) to maintain precision without hurting recall for purpose queries.
> 3. **Reranking / RRF Option**: At $\ge 400$ products, incorporating Reciprocal Rank Fusion (RRF) or cross-encoder re-ranking for the top 50 candidates should be considered.
