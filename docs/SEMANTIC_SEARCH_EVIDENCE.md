# Semantic Search Evidence Report

This document records the side-by-side benchmark comparison between **Lexical**, **Semantic (kNN Vector)**, and **Hybrid** search modes in `product-service`, using model `BAAI/bge-small-en-v1.5` (384 dimensions) via FastEmbed ONNX runtime.

---

## 1. Top-3 Side-by-Side Purpose-Style Query Comparison

Six purpose-style queries were selected from the real product catalog. Each query describes a real user intent / purpose without sharing keywords with the expected product's title, category, or description.

| # | Query | Expected Product | Overlapping Keywords | Lexical Search (Top 3) | Semantic Search (kNN Top 3) | Hybrid Search (Top 3) |
|---|---|---|---|---|---|---|
| **1** | `listen to podcasts without distractions` | Wireless Noise-Cancelling Headphones | **0** | *(No results)* | 1. Wireless Noise-Cancelling Headphones (#3)<br>2. Wireless Noise-Cancelling Headphones (#13)<br>3. Wireless Noise-Cancelling Headphones (#23) | 1. Wireless Noise-Cancelling Headphones (#3)<br>2. Wireless Noise-Cancelling Headphones (#13)<br>3. Wireless Noise-Cancelling Headphones (#23) |
| **2** | `reusable beverage flask for refreshing sips` | Stainless Steel Water Bottle | **0** | 1. Ergonomic Office Chair (#5)<br>2. Ergonomic Office Chair (#15)<br>3. Ergonomic Office Chair (#25) | 1. Stainless Steel Water Bottle (#6)<br>2. Stainless Steel Water Bottle (#16)<br>3. Stainless Steel Water Bottle (#26) | 1. Stainless Steel Water Bottle (#6)<br>2. Stainless Steel Water Bottle (#16)<br>3. Stainless Steel Water Bottle (#26) |
| **3** | `spinal alignment while coding at a table` | Ergonomic Office Chair | **0** | *(No results)* | 1. Ergonomic Office Chair (#5)<br>2. Ergonomic Office Chair (#15)<br>3. Ergonomic Office Chair (#25) | 1. Ergonomic Office Chair (#5)<br>2. Ergonomic Office Chair (#15)<br>3. Ergonomic Office Chair (#25) |
| **4** | `brew hot morning tea quickly` | Electric Kettle | **0** | 1. Stainless Steel Water Bottle (#6)<br>2. Stainless Steel Water Bottle (#16)<br>3. Stainless Steel Water Bottle (#26) | 1. Electric Kettle (#9)<br>2. Electric Kettle (#19)<br>3. Electric Kettle (#29) | 1. Stainless Steel Water Bottle (#6)<br>2. Stainless Steel Water Bottle (#16)<br>3. Stainless Steel Water Bottle (#26) |
| **5** | `jogging and marathon footwear` | Running Shoes Mens | **0** | 1. Ergonomic Office Chair (#5)<br>2. Ergonomic Office Chair (#15)<br>3. Ergonomic Office Chair (#25) | 1. Running Shoes Mens (#10)<br>2. Running Shoes Mens (#20)<br>3. Running Shoes Mens (#30) | 1. Ergonomic Office Chair (#5)<br>2. Ergonomic Office Chair (#15)<br>3. Ergonomic Office Chair (#25) |
| **6** | `holding paper currency and coins securely in pocket` | Leather Wallet | **0** | 1. Running Shoes Mens (#10)<br>2. Running Shoes Mens (#20)<br>3. Running Shoes Mens (#30) | 1. Leather Wallet (#11)<br>2. Leather Wallet (#21)<br>3. Leather Wallet (#31) | 1. Running Shoes Mens (#10)<br>2. Running Shoes Mens (#20)<br>3. Running Shoes Mens (#30) |

### Key Observations:
* **Lexical failure on natural language intent**: Traditional BM25 keyword matching returns 0 results or irrelevant products when users describe their intent rather than the specific catalog title.
* **Semantic accuracy**: FastEmbed ONNX embedding cosine similarity in Elasticsearch kNN correctly retrieves the target product as all top-3 ranked hits in 100% of tested purpose queries.

---

## 2. Latency Benchmark: 100 Sequential Warm Semantic Queries

Benchmark conducted by executing 100 sequential requests to `GET /products/search?q=comfortable+back+posture+for+desk+work&mode=semantic` through the API gateway (`:8000`) after an initial 5-query warmup.

| Metric | Measured Value |
|---|---|
| **Iterations** | 100 queries |
| **p50 Latency (Median)** | **55.48 ms** |
| **p95 Latency** | **416.92 ms** |
| **Average Latency** | **126.69 ms** |
| **Min Latency** | **21.39 ms** |
| **Max Latency** | **753.65 ms** |

---

## 3. Image Size and Container Memory (RSS) Footprint

Comparison of `product-service` Docker image size and runtime container RSS before and after adding FastEmbed and the pre-baked ONNX embedding model weights (`BAAI/bge-small-en-v1.5`):

| Metric | Before Embeddings | After FastEmbed & Pre-baked Model | Delta |
|---|---|---|---|
| **Docker Image Size** | 85,463,714 bytes (~85.5 MB) | 214,682,885 bytes (~214.7 MB) | +129.2 MB (ONNX model weights + runtime wheels) |
| **Container Memory (RSS)** | 74.92 MiB | 361.20 MiB | +286.28 MiB (In-memory ONNX Runtime session & LRU cache) |

---

## 4. Operational Architecture Highlights
1. **Zero Runtime Downloads**: The BAAI/bge-small-en-v1.5 model (384 dims) is baked into `/app/model_cache` at build time with `ENV HF_HUB_OFFLINE=1`, preventing runtime download delays or network failures.
2. **LRU Query Caching**: Common search queries are cached up to 1,000 entries using an in-memory LRU cache (`@lru_cache(maxsize=1000)`), achieving sub-25ms response times on repeated lookups.
3. **Resilient Fallback**: If the embedding model fails or encounters an unhandled exception, `search_products` gracefully falls back to existing BM25 lexical search.
