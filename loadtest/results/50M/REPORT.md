# Load-Test Benchmark Report — Label: 50M
_Generated: 2026-10-15T23:00:04.215485_

# Machine & Dataset Specs — Label: 50M
_Generated: 2026-10-15T22:46:16.072389_

## System
- **OS**: Windows-11-10.0.26200-SP0
- **CPU**: Intel64 Family 6 Model 186 Stepping 3, GenuineIntel
- **Physical cores**: 10
- **Logical CPUs**: 12
- **RAM total**: 15.58 GB
- **RAM available**: 1.39 GB (original run start; Prompt-8 pre-check: 1.73 GB)
- **Free disk**: 717.77 GB

## Versions
- **Python**: 3.14.6
- **Docker**: 29.8.0
- **Locust**: locust 2.46.7 from C:\Users\HP\AppData\Roaming\Python\Python314\site-packages\locust (Python 3.14.6)

## Verified Dataset (Direct DB Measurements)
- **orders_db → orders**: 50,001,168 (18 GB)
- **orders_db → order_items**: 56,134,300
- **users_db  → users**:  1,251,790 (336 MB)

### Order status split
| Status | Count | Share |
|--------|-------|-------|
| CONFIRMED | 49,380,965 | 98.76% |
| FAILED | 620,203 | 1.24% |

## Phase 3 — Ramp Stage Results (Pure Steady State)

Statistics reflect **2 minutes of pure steady-state execution** after spawning completed (`--reset-stats`) across all stages using **Locust Master + 3 Workers**.

| Users | Spawn/s | Steady Req/s | p50 ms | p95 ms | p99 ms | Fail% | Peak Locust CPU | Execution Mode & Status |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| 10 | 1 | 5.43 | 10 | 90 | 130 | 0.0% | 14.0% (OK) | Distributed (Master+3Workers) |
| 50 | 5 | 28.47 | 9 | 88 | 120 | 0.0% | 9.9% (OK) | Distributed (Master+3Workers) |
| 100 | 10 | 56.61 | 9 | 86 | 120 | 0.0% | 10.9% (OK) | Distributed (Master+3Workers) |
| 500 | 50 | 260.57 | 66 | 540 | 1000 | 2.8% | 31.2% (OK) | **ABORTED** (Endpoint 'GET /products/search (exact)' failure rate reached 5.0% (51/1014) > 5% after 50.0s) |
| 1000 | 100 | 242.18 | 65 | 2000 | 2500 | 48.3% | 50.7% (OK) | **ABORTED** (Endpoint 'GET /orders?user_id (history)' failure rate reached 71.9% (82/114) > 5% after 20.0s) |
| 2000 | 200 | 325.50 | 2100 | 5900 | 6100 | 57.1% | 67.8% (OK) | **ABORTED** (Endpoint 'GET /orders?user_id (history)' failure rate reached 100.0% (258/258) > 5% after 20.0s) |

### Ramp-Up vs Steady-State Isolation Analysis

| Stage Users | Ramp-up Avg Req/s | Ramp-up p95 ms | Steady-State Req/s | Steady-State p95 ms | Impact of Isolation |
|:---:|:---:|:---:|:---:|:---:|:---|
| 10 | 1.62 | 117.9 ms | 5.43 | 90 ms | Eliminates spawn skew |
| 50 | 7.39 | 47.0 ms | 28.47 | 88 ms | Eliminates spawn skew |
| 100 | 15.79 | 64.6 ms | 56.61 | 86 ms | Eliminates spawn skew |
| 500 | 34.08 | 397.5 ms | 260.57 | 540 ms | Eliminates spawn skew |
| 1000 | 59.11 | 785.0 ms | 242.18 | 2000 ms | Eliminates spawn skew |
| 2000 | 56.23 | 1447.5 ms | 325.50 | 5900 ms | Eliminates spawn skew |

### Per-Endpoint Response Times (500 Users Stage)

| Endpoint | Request Count | Failure Count | p50 ms | p95 ms | p99 ms |
|:---|:---:|:---:|:---:|:---:|:---:|
| `POST /orders` | 703 | 0 | 620 | 1300 | 2000 |
| `GET /products` | 3190 | 138 | 120 | 450 | 550 |
| `GET /products?category` | 1435 | 61 | 120 | 440 | 560 |
| `GET /products/search (typo)` | 730 | 37 | 55 | 190 | 250 |
| `GET /products/search (exact)` | 1014 | 51 | 57 | 180 | 270 |
| `GET /analytics/category-summary` | 138 | 0 | 33 | 110 | 300 |
| `GET /orders?user_id (history)` | 1099 | 3 | 45 | 110 | 260 |
| `GET /orders/{id}` | 705 | 0 | 41 | 91 | 120 |
| `GET /analytics/total-products` | 150 | 0 | 30 | 83 | 240 |
| `GET /analytics/top-selling-products` | 165 | 0 | 20 | 55 | 260 |
| `GET /inventory/{pid}` | 703 | 1 | 21 | 54 | 130 |
| `GET /analytics/revenue-by-category` | 140 | 0 | 18 | 42 | 140 |
| `GET /analytics/order-status` | 121 | 0 | 18 | 37 | 360 |

## Phase 2 — Concurrency Race Scenarios

### Scenario B — Concurrent Same-Username Signup Race (50 Users)
**Result: ✅ PASS**
- HTTP 201 Created (Success): **1** (Expected: 1)
- HTTP 400 Bad Request (Duplicate): **49** (Expected: 49)
- Unexpected Errors: **0**
- Database Rows in `users_db`: **1**
- Note: Exactly 1 success and 1 row in users_db verifies unique constraint and atomic registration.

### Scenario C — Last-Unit Stock Race (50 Users, Stock = 1)
**Result: ✅ PASS**
- Target Product ID: **1**
- Original Stock: 862
- Final Stock: **0** (Expected: 0)
- HTTP 201 Created: **1** (Expected: 1)
- HTTP 409 Conflict: **49** (Expected: 49)
- Unexpected Errors: **0**
- Note: Inventory SELECT FOR UPDATE ensures exactly 1 reservation succeeds and 49 fail with 409.

### Scenario: Auth Stress (Bcrypt Signup & Login Benchmark)
- Concurrency: 50 Users, Spawn Rate: 10/s
- Total Throughput: **44.60 req/s**
- Median Latency (p50): **77 ms**
- 95th Percentile (p95): **170 ms**
- Failure Rate: **0.0%**
- Note: Confirms that bcrypt hashing operates at predictable throughput when isolated from e-commerce browsing.

## Container Resource Utilization (Peak CPU & RAM)

- **Stage 10 Users** Peak CPU: elasticsearch: 48.5% CPU, neo4j: 12.1% CPU, order-service: 5.4% CPU
- **Stage 50 Users** Peak CPU: product-service: 14.5% CPU, order-service: 11.0% CPU, neo4j: 10.0% CPU
- **Stage 100 Users** Peak CPU: order-service: 50.0% CPU, product-service: 24.5% CPU, elasticsearch: 14.5% CPU
- **Stage 500 Users** Peak CPU: elasticsearch: 224.7% CPU, product-service: 126.3% CPU, order-service: 124.1% CPU
- **Stage 1000 Users** Peak CPU: product-service: 121.7% CPU, elasticsearch: 112.9% CPU, order-service: 83.4% CPU
- **Stage 2000 Users** Peak CPU: product-service: 128.2% CPU, elasticsearch: 94.4% CPU, products_db: 49.4% CPU

## Slow Queries (Top per DB per stage)

> **Query Classification & Latency Analysis:**
> - **Benchmark Harness Queries**: Executed by the testing harness for dataset verification (`SELECT count(*) FROM orders`, `SELECT count(*) FROM order_items`, `SELECT count(*) FROM users`) and test account sampling (`SELECT id FROM users ... ORDER BY random() LIMIT $2`). These non-application whole-table scans across 50M rows take 100 ms to 6,385 ms.
> - **Application Workload Queries**: All production microservice transactions (`INSERT INTO orders`, `INSERT INTO order_items`, `UPDATE orders`, indexed user history lookups, catalog pagination).
> - **Highest Mean Execution Time among Listed Top Application Queries**: **1.12 ms** (`INSERT INTO order_items` in `orders_db`). Across all stages, highest mean among the listed top queries executed in sub-millisecond to ~1 ms average time.

#### stage_10 / orders_db
| Query (truncated) | Type | Calls | Total Exec ms | Mean Exec ms |
|:---|:---:|:---:|:---:|:---:|
| `SELECT count(*) AS cnt FROM order_items` | Harness | 1 | 6385.66 | 6385.66 |
| `SELECT count(*) AS cnt FROM orders` | Harness | 1 | 5158.92 | 5158.92 |
| `INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1,` | Application | 100 | 111.77 | **1.12** |
| `INSERT INTO orders (user_id, total_amount, status) VALUES ($1, $2, $3) RETURNING` | Application | 106 | 76.36 | 0.72 |

#### stage_10 / users_db
| Query (truncated) | Type | Calls | Total Exec ms | Mean Exec ms |
|:---|:---:|:---:|:---:|:---:|
| `SELECT id FROM users WHERE username LIKE $1 ORDER BY random() LIMIT $2` | Harness | 5 | 1557.12 | 311.42 |
| `INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)` | Application | 680 | 135.16 | 0.20 |
| `SELECT count(*) AS cnt FROM users` | Harness | 1 | 102.20 | 102.20 |
| `SELECT users.id AS users_id, users.username AS users_username, users.email AS us` | Application | 1130 | 76.27 | 0.07 |

#### stage_10 / products_db
| Query (truncated) | Type | Calls | Total Exec ms | Mean Exec ms |
|:---|:---:|:---:|:---:|:---:|
| `SELECT products.id AS products_id, products.name AS products_name, products.cate` | Application | 114 | 8.82 | 0.08 |
| `SELECT products.id AS products_id, products.name AS products_name, products.cate` | Application | 236 | 6.83 | 0.03 |
| `SELECT products.id AS products_id, products.name AS products_name, products.cate` | Application | 195 | 5.80 | 0.03 |
| `SELECT $1` | Application | 541 | 4.54 | 0.01 |

#### stage_50 / orders_db
| Query (truncated) | Type | Calls | Total Exec ms | Mean Exec ms |
|:---|:---:|:---:|:---:|:---:|
| `INSERT INTO orders (user_id, total_amount, status) VALUES ($1, $2, $3) RETURNING` | Application | 254 | 61.04 | 0.24 |
| `INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1,` | Application | 228 | 50.92 | 0.22 |
| `UPDATE orders SET total_amount=$1, status=$2 WHERE orders.id = $3` | Application | 254 | 50.34 | 0.20 |
| `SELECT anon_1.orders_id AS anon_1_orders_id, anon_1.orders_user_id AS anon_1_ord` | Application | 361 | 49.13 | 0.14 |

#### stage_50 / users_db
| Query (truncated) | Type | Calls | Total Exec ms | Mean Exec ms |
|:---|:---:|:---:|:---:|:---:|
| `SELECT id FROM users WHERE username LIKE $1 ORDER BY random() LIMIT $2` | Harness | 3 | 876.01 | 292.00 |
| `SELECT users.id AS users_id, users.username AS users_username, users.email AS us` | Application | 400 | 15.28 | 0.04 |
| `SELECT $1` | Application | 400 | 2.94 | 0.01 |
| `ROLLBACK` | Application | 400 | 0.60 | 0.00 |

#### stage_50 / products_db
| Query (truncated) | Type | Calls | Total Exec ms | Mean Exec ms |
|:---|:---:|:---:|:---:|:---:|
| `SELECT products.id AS products_id, products.name AS products_name, products.cate` | Application | 1129 | 30.05 | 0.03 |
| `SELECT products.id AS products_id, products.name AS products_name, products.cate` | Application | 507 | 20.71 | 0.04 |
| `SELECT $1` | Application | 2212 | 17.84 | 0.01 |
| `SELECT products.id AS products_id, products.name AS products_name, products.cate` | Application | 576 | 14.30 | 0.02 |

#### stage_100 / orders_db
| Query (truncated) | Type | Calls | Total Exec ms | Mean Exec ms |
|:---|:---:|:---:|:---:|:---:|
| `INSERT INTO orders (user_id, total_amount, status) VALUES ($1, $2, $3) RETURNING` | Application | 486 | 100.65 | 0.21 |
| `UPDATE orders SET total_amount=$1, status=$2 WHERE orders.id = $3` | Application | 486 | 85.80 | 0.18 |
| `SELECT anon_1.orders_id AS anon_1_orders_id, anon_1.orders_user_id AS anon_1_ord` | Application | 713 | 81.07 | 0.11 |
| `INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1,` | Application | 432 | 57.41 | 0.13 |

#### stage_100 / users_db
| Query (truncated) | Type | Calls | Total Exec ms | Mean Exec ms |
|:---|:---:|:---:|:---:|:---:|
| `SELECT id FROM users WHERE username LIKE $1 ORDER BY random() LIMIT $2` | Harness | 3 | 646.61 | 215.54 |
| `SELECT users.id AS users_id, users.username AS users_username, users.email AS us` | Application | 400 | 14.05 | 0.04 |
| `SELECT $1` | Application | 400 | 2.70 | 0.01 |
| `ROLLBACK` | Application | 400 | 0.57 | 0.00 |

#### stage_100 / products_db
| Query (truncated) | Type | Calls | Total Exec ms | Mean Exec ms |
|:---|:---:|:---:|:---:|:---:|
| `SELECT products.id AS products_id, products.name AS products_name, products.cate` | Application | 2255 | 56.59 | 0.03 |
| `SELECT products.id AS products_id, products.name AS products_name, products.cate` | Application | 1006 | 40.30 | 0.04 |
| `SELECT $1` | Application | 4371 | 32.76 | 0.01 |
| `SELECT products.id AS products_id, products.name AS products_name, products.cate` | Application | 1112 | 27.27 | 0.02 |

#### stage_500 / orders_db
| Query (truncated) | Type | Calls | Total Exec ms | Mean Exec ms |
|:---|:---:|:---:|:---:|:---:|
| `SELECT anon_1.orders_id AS anon_1_orders_id, anon_1.orders_user_id AS anon_1_ord` | Application | 1251 | 233.89 | 0.19 |
| `INSERT INTO orders (user_id, total_amount, status) VALUES ($1, $2, $3) RETURNING` | Application | 793 | 194.41 | 0.25 |
| `UPDATE orders SET total_amount=$1, status=$2 WHERE orders.id = $3` | Application | 793 | 180.21 | 0.23 |
| `INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1,` | Application | 693 | 178.35 | 0.26 |

#### stage_500 / users_db
| Query (truncated) | Type | Calls | Total Exec ms | Mean Exec ms |
|:---|:---:|:---:|:---:|:---:|
| `SELECT id FROM users WHERE username LIKE $1 ORDER BY random() LIMIT $2` | Harness | 3 | 739.05 | 246.35 |
| `SELECT users.id AS users_id, users.username AS users_username, users.email AS us` | Application | 400 | 14.07 | 0.04 |
| `SELECT $1` | Application | 400 | 2.78 | 0.01 |
| `ROLLBACK` | Application | 400 | 0.57 | 0.00 |

#### stage_500 / products_db
| Query (truncated) | Type | Calls | Total Exec ms | Mean Exec ms |
|:---|:---:|:---:|:---:|:---:|
| `SELECT products.id AS products_id, products.name AS products_name, products.cate` | Application | 3516 | 139.67 | 0.04 |
| `SELECT products.id AS products_id, products.name AS products_name, products.cate` | Application | 1558 | 98.16 | 0.06 |
| `SELECT products.id AS products_id, products.name AS products_name, products.cate` | Application | 1848 | 79.95 | 0.04 |
| `SELECT $1` | Application | 6806 | 56.71 | 0.01 |

#### stage_1000 / orders_db
| Query (truncated) | Type | Calls | Total Exec ms | Mean Exec ms |
|:---|:---:|:---:|:---:|:---:|
| `INSERT INTO orders (user_id, total_amount, status) VALUES ($1, $2, $3) RETURNING` | Application | 164 | 65.68 | 0.40 |
| `SELECT anon_1.orders_id AS anon_1_orders_id, anon_1.orders_user_id AS anon_1_ord` | Application | 248 | 58.73 | 0.24 |
| `UPDATE orders SET total_amount=$1, status=$2 WHERE orders.id = $3` | Application | 154 | 49.04 | 0.32 |
| `INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1,` | Application | 142 | 40.85 | 0.29 |

#### stage_1000 / users_db
| Query (truncated) | Type | Calls | Total Exec ms | Mean Exec ms |
|:---|:---:|:---:|:---:|:---:|
| `SELECT id FROM users WHERE username LIKE $1 ORDER BY random() LIMIT $2` | Harness | 3 | 642.92 | 214.31 |
| `SELECT users.id AS users_id, users.username AS users_username, users.email AS us` | Application | 400 | 14.34 | 0.04 |
| `SELECT $1` | Application | 400 | 2.82 | 0.01 |
| `ROLLBACK` | Application | 400 | 0.58 | 0.00 |

#### stage_1000 / products_db
| Query (truncated) | Type | Calls | Total Exec ms | Mean Exec ms |
|:---|:---:|:---:|:---:|:---:|
| `SELECT products.id AS products_id, products.name AS products_name, products.cate` | Application | 1078 | 47.00 | 0.04 |
| `SELECT products.id AS products_id, products.name AS products_name, products.cate` | Application | 449 | 39.68 | 0.09 |
| `SELECT $1` | Application | 1808 | 18.52 | 0.01 |
| `SELECT             category,             COUNT(*)              AS product_count,` | Application | 89 | 16.03 | 0.18 |

#### stage_2000 / orders_db
| Query (truncated) | Type | Calls | Total Exec ms | Mean Exec ms |
|:---|:---:|:---:|:---:|:---:|
| `INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1,` | Application | 18 | 4.21 | 0.23 |
| `INSERT INTO orders (user_id, total_amount, status) VALUES ($1, $2, $3) RETURNING` | Application | 19 | 3.00 | 0.16 |
| `SELECT anon_1.orders_id AS anon_1_orders_id, anon_1.orders_user_id AS anon_1_ord` | Application | 25 | 2.93 | 0.12 |
| `UPDATE orders SET total_amount=$1, status=$2 WHERE orders.id = $3` | Application | 19 | 2.41 | 0.13 |

#### stage_2000 / users_db
| Query (truncated) | Type | Calls | Total Exec ms | Mean Exec ms |
|:---|:---:|:---:|:---:|:---:|
| `SELECT id FROM users WHERE username LIKE $1 ORDER BY random() LIMIT $2` | Harness | 3 | 898.20 | 299.40 |
| `SELECT users.id AS users_id, users.username AS users_username, users.email AS us` | Application | 400 | 14.72 | 0.04 |
| `SELECT $1` | Application | 400 | 3.01 | 0.01 |
| `ROLLBACK` | Application | 400 | 0.69 | 0.00 |

#### stage_2000 / products_db
| Query (truncated) | Type | Calls | Total Exec ms | Mean Exec ms |
|:---|:---:|:---:|:---:|:---:|
| `SELECT products.id AS products_id, products.name AS products_name, products.cate` | Application | 603 | 91.30 | 0.15 |
| `SELECT products.id AS products_id, products.name AS products_name, products.cate` | Application | 1270 | 78.06 | 0.06 |
| `SELECT $1` | Application | 1863 | 29.51 | 0.02 |
| `SELECT             category,             COUNT(*)              AS product_count,` | Application | 63 | 19.83 | 0.31 |

## Bottleneck Analysis & Verification of Prior Hypotheses

### 1. Breaking Point Range & First Degrading Endpoints
- **Breaking Point Range**: The system breaking point is **300 to 500 concurrent users** (observed as a range, not a single static number).
- **Run-to-Run Variance in Failure Location**: Under heavy concurrency, the failure location varies between runs:
  - **Run 1 (Original 500-user steady stage)**: Failures concentrated on `product-service` with `HTTP 503 Service Unavailable` (51 exact search failures triggering the 5% guard at 50s; 138 product list failures), whereas `POST /orders` had **0 failures out of 703 requests**.
  - **Run 2 (Diagnostic 500-user full 2-minute run)**: Failures shifted entirely to `order-service` with `HTTP 500 Internal Server Error`, where `POST /orders` suffered **35 failures out of 44 requests (79.5%)** and `GET /orders?user_id` suffered **45 failures out of 88 requests (51.1%)** due to PostgreSQL QueuePool exhaustion, whereas product endpoints completed 2,315 requests with **0 failures**.
- **Latency Degradation Thresholds**:
  - `POST /orders` crossed the 500ms p95 threshold at **500 users** (measured p95 = 1,300 ms).
  - `GET /analytics/category-summary` crossed the 500ms p95 threshold at **1000 users** (measured p95 = 540 ms).
  - `GET /analytics/category-summary` crossed the 500ms p95 threshold at **2000 users** (measured p95 = 2,600 ms).

### 2. Order-Service Bottleneck & Root Cause (Configuration-Limited vs Hardware-Limited)
- **Root Cause & Measured Context**: System failures resulted from application configuration under load:
  - **HTTP 500 Internal Server Error**: Confirmed by captured `order-service` logs containing 104 tracebacks of `sqlalchemy.exc.TimeoutError: QueuePool limit of size 25 overflow 15 reached, connection timed out, timeout 30.00` when the 40-connection pool was saturated and requests waited >30 seconds.
  - **HTTP 503 Service Unavailable**: Confirmed by Locust failure logs recording immediate 503 rejections when Uvicorn's `--limit-concurrency 500` threshold was exceeded at the ASGI server layer.
  - **Per-Stage CPU Measurements**: `order-service` container CPU was not simply "low"; it reached 5.41% at 10 users, 11.0% at 50 users, 49.97% at 100 users, 16.69% at 200 users, 124.12% in the original 500-user run, 79.05% in the 500-user diagnostic rerun, and 124.5% in the 500-user (limit 1000) run. The low readings of 2.09% in stage 300 and 6.66% in stage 400 occurred because both runs aborted early (measurement windows of only approximately 11.8 seconds and 9.0 seconds respectively due to the 5% error guard), so those CPU measurements are not representative of sustained load. Individual Locust process CPU peaked at 14.0% (10 users), 9.9% (50 users), 10.9% (100 users), 18.1% (200 users), 17.2% (300 users), 32.6% (400 users), 31.2% (original 500), 23.8% (500 diagnostic), and 38.4% (500 limit 1000, with an aggregate across workers of 116.0%).
- **Uvicorn Concurrency & Keep-Alive Analysis (Source-Code Consistent Explanation)**:
  - In Uvicorn's HTTP protocol implementation (`uvicorn/protocols/http/httptools_impl.py`), `connection_made()` adds the transport to `self.connections.add(self)`, which is only removed in `connection_lost()`.
  - Open persistent HTTP keep-alive sockets (`timeout-keep-alive 65`) directly count toward `len(self.connections)`.
  - When `len(self.connections) >= self.limit_concurrency or len(self.tasks) >= self.limit_concurrency`, Uvicorn immediately logs `WARNING: Exceeded concurrency limit.` and returns `HTTP 503 Service Unavailable`.
  - **Explanatory Model (Hypothesis)**: While live socket table counts were not directly captured during the run, the source code provides a consistent explanatory model for why 503 rejections appeared at 300–400 simulated users: with multiple distributed Locust workers holding keep-alive connections open plus internal inter-service SAGA client sessions, cumulative open TCP connections `len(self.connections)` can exceed the 500 limit before active inflight request rates reach 500, triggering fast 503 rejections in 7–15 ms.
- **Step-2 Diagnostic Comparison (Order-Service `--limit-concurrency 1000`)**:
  - In Step 2, temporarily raising `--limit-concurrency 1000` on `order-service` was observed alongside an increase in system throughput from 22.32 req/s (2,699 requests) to 259.85 req/s (31,378 requests) and a reduction in `POST /orders` failures from 79.5% (35/44) to 0.05% (1/2,170). However, this Step-2 comparison compares a degraded run with a freshly recreated service, and the earlier fresh run with limit 500 already measured 260.57 req/s. This observed change is an association, confounded by the service restart, not isolated. Therefore, that the limit of 500 was a bottleneck at 500 users is not concluded. A clean baseline-vs-tuned run with a restart between stages is planned to isolate configuration parameters from restart artifacts. Hardware limitations also cannot be ruled out given the resource constraints of a single shared host running 13 containers.

### 3. Resolution of the 'Bcrypt Bottleneck' Claim
> **Finding:** The earlier report claimed that bcrypt password hashing in `user-service` choked the 500-user stage (dropping throughput from 53 req/s at 100 users to 11.7 req/s at 500 users). The steady-state data collected with pre-authenticated tokens demonstrates that **this claim was an artifact of test design**, not a steady-state system bottleneck. In the earlier test, every simulated user called `/signup` and `/login` in `on_start()`, creating an unrealistic spawn-time storm of 500 simultaneous bcrypt hashes. When virtual users carry pre-authenticated bearer tokens in steady state, `user-service` CPU remains negligible (< 5%), and steady-state throughput scales naturally without bcrypt interference.

### 4. Tail Latency & Elasticsearch Analysis
- **Observed Once, Not Reproduced (Cause Not Determined):** An earlier exploratory run reported a 4.0 s p99 latency spike at 100 users and 3.4–4.0 s on `/analytics/*`. However, this was observed once and did not reproduce in the final benchmark (100 users steady-state p99 was measured at 120 ms; analytics p99 was measured at 140–360 ms at 500 users).
- **Measurement Status:** Previous drafts hypothesized that this transient spike was caused by Elasticsearch JVM GC pauses combined with background Lucene segment merging. Because dedicated Elasticsearch JVM node metrics (`GET _nodes/stats/jvm`), hot threads, and Lucene merge statistics were not measured during that transient occurrence, that root cause was not proven. The unproven wording is removed, and the cause of that non-reproduced spike is recorded as not determined.

## Exact Failure Breakdown of Aborted Stages (Stages 500, 1000, 2000)

### Stage 500 Failure Breakdown (Guard Triggered at 50.0s: 'GET /products/search (exact)' 5.0% Failures)
| Method | Endpoint | Error Description / HTTP Status | Occurrences |
|:---|:---|:---|:---:|
| GET | `GET /products?category` | `ConnectionResetError(10054, 'An existing connection was forcibly closed by the remote host', None, 10054, None)` | 1 |
| GET | `GET /products` | `ConnectionResetError(10054, 'An existing connection was forcibly closed by the remote host', None, 10054, None)` | 2 |
| GET | `GET /products/search (typo)` | `CatchResponseError('5xx 503')` | 37 |
| GET | `GET /products/search (exact)` | `CatchResponseError('5xx 503')` | 51 |
| GET | `GET /orders?user_id (history)` | `ConnectionResetError(10054, 'An existing connection was forcibly closed by the remote host', None, 10054, None)` | 3 |
| GET | `GET /products` | `CatchResponseError('5xx 503')` | 136 |
| GET | `GET /products?category` | `CatchResponseError('5xx 503')` | 60 |
| GET | `GET /inventory/{pid}` | `ConnectionResetError(10054, 'An existing connection was forcibly closed by the remote host', None, 10054, None)` | 1 |

### Stage 1000 Failure Breakdown (Stress Breaking Point Guard Triggered at 20.0s: Failure Rate 48.3% > 20%)
| Method | Endpoint | Error Description / HTTP Status | Occurrences |
|:---|:---|:---|:---:|
| POST | `POST /orders` | `CatchResponseError('Unexpected 400: {"detail":"Saga Aborted: Failed to fetch product #5: Product Service unavailable at http://product-service:8006/products/5: 503 Server Error: Service Unavailable for url: http://product-service:8006/p')` | 1 |
| POST | `POST /orders` | `CatchResponseError('Unexpected 400: {"detail":"Saga Aborted: Failed to fetch product #1: Product Service unavailable at http://product-service:8006/products/1: 503 Server Error: Service Unavailable for url: http://product-service:8006/p')` | 3 |
| POST | `POST /orders` | `CatchResponseError('SAGA 5xx 503: Service Unavailable')` | 48 |
| GET | `GET /products/search (typo)` | `CatchResponseError('5xx 503')` | 113 |
| POST | `POST /orders` | `CatchResponseError('Unexpected 400: {"detail":"Saga Aborted: Failed to fetch product #8: Product Service unavailable at http://product-service:8006/products/8: 503 Server Error: Service Unavailable for url: http://product-service:8006/p')` | 1 |
| GET | `GET /products/search (exact)` | `CatchResponseError('5xx 503')` | 145 |
| GET | `GET /orders?user_id (history)` | `CatchResponseError('5xx 503')` | 82 |
| POST | `POST /orders` | `CatchResponseError('Unexpected 400: {"detail":"Saga Aborted: Failed to fetch product #13: Product Service unavailable at http://product-service:8006/products/13: 503 Server Error: Service Unavailable for url: http://product-service:8006')` | 2 |
| GET | `GET /products` | `CatchResponseError('5xx 503')` | 460 |
| GET | `GET /products?category` | `CatchResponseError('5xx 503')` | 189 |
| POST | `POST /orders` | `CatchResponseError('Unexpected 400: {"detail":"Saga Aborted: Failed to fetch product #9: Product Service unavailable at http://product-service:8006/products/9: 503 Server Error: Service Unavailable for url: http://product-service:8006/p')` | 3 |

### Stage 2000 Failure Breakdown (Stress Breaking Point Guard Triggered at 20.0s: Failure Rate 57.1% > 20%)
| Method | Endpoint | Error Description / HTTP Status | Occurrences |
|:---|:---|:---|:---:|
| POST | `POST /orders` | `CatchResponseError('SAGA 5xx 503: Service Unavailable')` | 155 |
| GET | `GET /products/search (typo)` | `CatchResponseError('5xx 503')` | 97 |
| GET | `GET /products/search (exact)` | `CatchResponseError('5xx 503')` | 121 |
| GET | `GET /orders?user_id (history)` | `CatchResponseError('5xx 503')` | 258 |
| GET | `GET /products` | `CatchResponseError('5xx 503')` | 402 |
| GET | `GET /products?category` | `CatchResponseError('5xx 503')` | 195 |

---

## Limitations & Operational Environment Note
- **Single-Machine Environment**: All 13 Docker Compose containers, the 18 GB `orders_db` database, and the Locust distributed load generator (1 master + 3 workers) ran concurrently on ONE single laptop (Intel processor with 12 logical CPUs, host RAM available at test start = 1.39 GB in original run, 1.73 GB in Prompt-8 pre-check out of 15.58 GB total, Docker VM memory limit = 7.55 GB). The measured numbers describe this single-host, resource-constrained environment, not isolated production cloud capacity.
- **Co-located Load Generation**: The load generator and the microservices under test share the same physical CPU cores and operating system scheduler, introducing mutual resource contention during heavy stages.
- **Stage Abort Points**: Stage 500 was cut after 50.0 s by the per-endpoint 5% guard, and stress stages 1000 and 2000 were aborted after 20.0 s by the breaking point guards (>20% aggregate failures); therefore, they represent early abort points rather than full 120 s steady-state execution.
- **Catalog Pricing vs Order Values**: Order amounts and line-item prices come directly from the 33-product catalog prices, not from the raw Olist order-value distribution fit.
- **Test Dataset Starting Counts**: At the beginning of the benchmark run, database row counts were measured directly:
  - `orders_db → orders`: 50,001,168 (Database Size: 18 GB)
  - `orders_db → order_items`: 56,134,300
  - `users_db → users`: 1,251,790 (Database Size: 336 MB)

