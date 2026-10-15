# 50,000,000 Orders Benchmark & Sizing Run Report

- **Run Label:** `50M`
- **Execution Date:** October 15, 2026
- **Architecture:** Distributed E-Commerce OMS (FastAPI Microservices, 4 PostgreSQL 16 DBs, Elasticsearch 8.13, Neo4j, Docker Compose)
- **Host Specs:** Windows 11 Home, 13th Gen Intel Core i5-1335U (10 Physical Cores, 12 Logical Processors), 15.6 GB RAM, 786.96 GB free disk on Drive C:

---

## 1. Measured Machine Specifications

| Parameter | Measured Specification |
| :--- | :--- |
| **Operating System** | Windows 11 Home (10.0.26200-SP0) |
| **CPU Model** | 13th Gen Intel(R) Core(TM) i5-1335U @ 1.30 GHz (Up to 4.60 GHz) |
| **CPU Topology** | 10 Physical Cores (2 P-Cores, 8 E-Cores), 12 Logical Processors |
| **Host Total RAM** | 15.58 GB (Docker WSL2 MemTotal: 7.55 GB) |
| **Free Storage Space (C:)** | 786.96 GB (Total: 952.78 GB, SSD) |
| **Database Engines** | PostgreSQL 16 (4 isolated containers: orders_db, users_db, products_db, inventory_db) |
| **Search Engine** | Elasticsearch 8.13.0 |

---

## 2. Ingestion & Scale Benchmark (True 50,000,000 Order Load)

All metrics below are **directly measured from PostgreSQL and the generator execution logs**; zero estimates or extrapolations.

| Metric | Measured Value | Unit / Method |
| :--- | :---: | :--- |
| **Total Ingested Orders** | **50,000,000** | `SELECT count(*) FROM orders;` |
| **Total Ingested Order Items** | **56,133,003** | `SELECT count(*) FROM order_items;` |
| **Total Synthetic Users** | **1,250,000** | `SELECT count(*) FROM users WHERE username LIKE 'syn_%';` |
| **Total Users in users_db** | **1,250,372** | Including seed and ramp test users |
| **Mean Order Items / Order** | **1.1227** | Ratio: items / orders (Target: 1.1417) |
| **COPY Ingestion Throughput** | **70,362 orders/sec** | Measured across all 100 chunks (`78,992 items/sec`) |
| **COPY Ingestion Duration** | **710.61 seconds** | ~11.84 minutes |
| **Index Rebuild & ANALYZE Duration**| **645.08 seconds** | ~10.75 minutes (All base + composite indexes) |
| **Total End-to-End Execution Time**| **1,633.10 seconds** | **27.22 minutes** (Prep + User COPY + Order COPY + Indexes + ANALYZE) |

---

## 3. Storage Footprint & Database Sizing

Measured via `pg_relation_size()`, `pg_indexes_size()`, `pg_total_relation_size()`, and `pg_database_size()`.

### A. Table and Index Sizing (`orders_db`)

| Relation / Object Name | Object Type | Measured Size (MB) | Measured Size (GB) | Description |
| :--- | :---: | :---: | :---: | :--- |
| **`orders`** | Table Heap | 3,255 MB | 3.18 GB | Base 50M order records |
| **`order_items`** | Table Heap | 2,793 MB | 2.73 GB | Base 56.13M line item records |
| **`ix_orders_user_created`** | B-tree Index | 1,504 MB | 1.47 GB | `(user_id, created_at DESC)` composite |
| **`ix_orders_status_created`** | B-tree Index | 1,460 MB | 1.43 GB | `(status, created_at DESC)` composite |
| **`ix_order_items_id`** | B-tree Index | 1,202 MB | 1.17 GB | Primary lookup / scan accelerator |
| **`order_items_pkey`** | B-tree Index | 1,202 MB | 1.17 GB | Primary key on `order_items(id)` |
| **`ix_order_items_product_order`** | B-tree Index | 1,200 MB | 1.17 GB | `(product_id, order_id)` composite |
| **`ix_order_items_order_id`** | B-tree Index | 1,167 MB | 1.14 GB | Foreign key join accelerator on `order_id` |
| **`ix_orders_id`** | B-tree Index | 1,071 MB | 1.05 GB | ID index |
| **`orders_pkey`** | B-tree Index | 1,071 MB | 1.05 GB | Primary key on `orders(id)` |
| **`ix_orders_created_at_desc`** | B-tree Index | 924 MB | 0.90 GB | `(created_at DESC)` pagination accelerator |
| **`ix_order_items_product_id`** | B-tree Index | 371 MB | 0.36 GB | Product filtering index |
| **`ix_orders_user_id`** | B-tree Index | 357 MB | 0.35 GB | Single-column user index |
| **`ix_orders_status`** | B-tree Index | 336 MB | 0.33 GB | Status index |
| **Total `orders` Table + Indexes** | **Combined** | **9,979 MB** | **9.75 GB** | Table: 3.25 GB, Indexes: 6.57 GB |
| **Total `order_items` Table + Indexes**| **Combined** | **7,937 MB** | **7.75 GB** | Table: 2.73 GB, Indexes: 5.02 GB |
| **Combined Orders + Items Footprint** | **All Relations**| **17,916.41 MB** | **17.50 GB** | All heap tables + 12 indexes |
| **Total `orders_db` Disk Size** | **Database** | **18 GB** | **18.00 GB** | Full PostgreSQL cluster database size |
| **Total `users_db` Disk Size** | **Database** | **336 MB** | **0.33 GB** | 1,250,372 synthetic user accounts |

---

## 4. Goodness-of-Fit & Statistical Verification Tables

### A. Order Status Split

```text
Target: CONFIRMED 98.76%, FAILED 1.24%
```

| Order Status | Order Count | Measured Share | Target Share | Delta | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **`CONFIRMED`** | 49,379,915 | **98.76%** | 98.76% | **0.00%** | **PASS** |
| **`FAILED`** | 620,085 | **1.24%** | 1.24% | **0.00%** | **PASS** |
| **Total** | **50,000,000** | **100.00%** | 100.00% | — | **PASS** |

### B. Category Share Distribution

Two-stage sampling calibrated against Olist empirical distributions:

| Category | Order Items Count | Measured Share | Target Share | Delta | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Accessories** | 15,890,751 | **28.31%** | 28.30% | +0.01% | **PASS** |
| **Furniture** | 12,246,929 | **21.82%** | 21.82% | 0.00% | **PASS** |
| **Sports & Outdoors** | 11,643,363 | **20.74%** | 20.74% | 0.00% | **PASS** |
| **Electronics** | 10,068,976 | **17.94%** | 17.94% | 0.00% | **PASS** |
| **Kitchen** | 6,282,984 | **11.20%** | 11.20% | 0.00% | **PASS** |
| **Total** | **56,133,003** | **100.00%** | 100.00% | — | **PASS** |

### C. Orders Per User Distribution (Truncated Lognormal Model)

```text
Model: Lognormal(mu=1.0, sigma=1.7) truncated with hard cap at 2,000 orders
Target: Mean ~40.0, small median, heavy right tail, max <= 2,000, top 1% share <= 50%
```

| Metric | Measured Value | Verification Criteria | Status |
| :--- | :---: | :---: | :---: |
| **Users with Orders** | **1,250,000** | Target: $N/40 = 1,250,000$ | **PASS** |
| **Mean Orders / User** | **40.00** | Target: ~40.00 | **PASS** |
| **Median Orders / User**| **9.0** | Small typical buyer median | **PASS** |
| **90th Percentile ($p_{90}$)** | **86.0** | Heavy tail | **PASS** |
| **99th Percentile ($p_{99}$)** | **503.0** | Long right tail | **PASS** |
| **Maximum Orders / User**| **2,000** | **Hard cap $\le 2,000$** | **PASS** |
| **Top 1% User Count** | **12,500 users** | Top 1% of user population | **PASS** |
| **Top 1% Orders Volume**| **11,844,446 orders**| — | — |
| **Top 1% Volume Share** | **23.69%** | **Threshold $\le 50.0\%$** | **PASS** |

### D. Date Range & Temporal Profile

- **Arrival Profile Window:** October 15, 2024 to October 15, 2026 (730 days / 24 months)
- **Minimum Timestamp:** `2024-10-15 14:51:14+00:00`
- **Maximum Timestamp:** `2026-10-15 14:51:09+00:00`
- **Diurnal / Weekly Modulations:** Preserved across 24h diurnal curve and 7-day weekday cycles.

---

## 5. Microservice Lifecycle & Scalability Measurements

### A. User Service Startup & Bloom Filter Footprint (~1.25M Users)

Measured directly from container startup lifespan and `docker stats` after hydration:

| Parameter | Measured Value | Details / Verification Source |
| :--- | :---: | :--- |
| **Users Hydrated** | **1,250,374 users** | Both `username` and `email` loaded (2,500,748 keys) |
| **Bloom Filter Hydration Time** | **85.52 seconds** | `15:43:10.348` to `15:44:35.863` in service startup logs |
| **Total Container Ready Time** | **85.68 seconds** | Full database migration + Bloom synchronization |
| **Container RSS Memory** | **150.7 MiB** | Measured via `docker stats user-service` |
| **Memory Allocation Share** | **1.95%** | Out of 7.55 GB WSL2 Docker limit |
| **Idle CPU Utilization** | **0.38%** | Steady-state post-startup |
| **Health Check Response** | `HTTP 200 OK` | `{"status":"healthy","service":"user-service"}` |

### B. Admin Analytics Rollup Sync Performance (50M Dataset)

| Metric | Measured Value | Notes |
| :--- | :---: | :--- |
| **GROUP BY Aggregation Duration** | **90.96 seconds** | Aggregated across 56.13M item records |
| **Rollup Documents Generated** | **29,239 docs** | Grouped by `(date, product_id, category, status)` |
| **Bulk Indexing Errors** | **0 errors** | 100% idempotent upsert into ES index `analytics` |
| **Elasticsearch Index Size** | **4.2 MB** | Compared to >15 GB if raw 50M orders were indexed |
| **Storage Reduction Ratio** | **> 3,500x** | Massive index compaction for real-time dashboard |

---

## 6. End-to-End Alpha Test Suite Verification

All 10 live integration test scenarios in `tests/alpha_test.py` executed against live services:

| Scenario / Feature | Test Vector | Expected Result | Measured Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **1. User Registration** | `POST /signup` with new unique user | HTTP 201 Created | HTTP 201 Created | **PASS** |
| **2. Duplicate Username** | `POST /signup` with duplicate username | HTTP 400 Bad Request | HTTP 400 Bad Request | **PASS** |
| **3. Concurrency / Bloom** | 20 parallel signup race condition | Exactly 1 success, 19 rejected | HTTP 201: 1, HTTP 400: 19 | **PASS** |
| **4. Exact Product Search** | `GET /products/search?q=Keyboard` | HTTP 200 with matching items | HTTP 200 (2 items found) | **PASS** |
| **5. Fuzzy / Typo Search** | `GET /products/search?q=headfones` | HTTP 200 resolving Headphones | HTTP 200 (2 items found) | **PASS** |
| **6. Cart Management** | Add item x2, decrement, clear | Proper quantity tracking | Qty 2 -> 1 -> 0 cleared | **PASS** |
| **7. SAGA Order Placement** | `POST /orders` (Product #1 in stock) | HTTP 201, status CONFIRMED | HTTP 201, stock 11 -> 10 | **PASS** |
| **8. SAGA Compensation** | `POST /orders` (Product #10 stock=0) | HTTP 409 Conflict, FAILED | HTTP 409, Saga compensated | **PASS** |
| **9. Row-Locking Race** | 20 parallel orders for Stock = 1 | Exactly 1 order wins, 19 fail | HTTP 201: 1, HTTP 409: 19 | **PASS** |
| **10. Analytics Batch Sync** | Run `sync_orders.py` & query ES | 29,239 docs, fast dashboard | 29,239 docs, 0 errors | **PASS** |

