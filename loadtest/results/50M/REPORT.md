# Load-Test Report — Label: 50M
_Generated: 2026-10-15T16:51:13.187012_

# Machine & Dataset Specs — Label: 50M
_Generated: 2026-10-15T16:38:56.561740_

## System
- **OS**: Windows-11-10.0.26200-SP0
- **CPU**: Intel64 Family 6 Model 186 Stepping 3, GenuineIntel
- **Physical cores**: 10
- **Logical CPUs**: 12
- **RAM total**: 15.6 GB
- **RAM available**: 2.5 GB
- **Free disk**: 794.4 GB

## Versions
- **Python**: 3.14.6
- **Docker**: 29.8.0
- **Locust**: locust 2.46.7 from C:\Users\HP\OneDrive\Desktop\distributed-ecommerce-oms\.venv\Lib\site-packages\locust (Python 3.14.6)

## Dataset (read from DB at pre-check time)
- **orders_db → orders**: 1,000,022
- **users_db  → users**:  25,008

### Order status split
| Status | Count |
|--------|-------|
| CONFIRMED | 987,664 |
| FAILED | 12,358 |

## Phase 3 — Ramp Stage Results

| Users | Spawn/s | Req/s | p50 ms | p95 ms | p99 ms | Fail% | Locust CPU |
|-------|---------|-------|--------|--------|--------|-------|------------|
| 10 | 1 | 5.302046643083216 | 17 | 130 | 190 | 0.0% | OK |
| 50 | 5 | 26.60409530938341 | 20 | 150 | 230 | 0.0% | OK |
| 100 | 10 | 53.055312091336646 | 21 | 170 | 320 | 0.0% | OK |
| 500 | 50 | 11.730537507452887 | 16 | 1000 | 2300 | 0.5% | OK |

### Per-endpoint p95 (final stage — 500 users)

| Endpoint | Req Count | Fail Count | p95 ms | p99 ms |
|----------|-----------|------------|--------|--------|
| POST /signup (ramp-setup) | 76 | 7 | 32000 | 121000 |
| POST /login (ramp-setup) | 19 | 0 | 1900 | 1900 |
| GET /analytics/revenue-by-category | 20 | 0 | 200 | 200 |
| POST /orders | 92 | 0 | 160 | 380 |
| GET /products/search (typo) | 112 | 0 | 69 | 99 |
| GET /orders?user_id (history) | 160 | 0 | 57 | 190 |
| GET /analytics/category-summary | 10 | 0 | 46 | 46 |
| GET /analytics/total-products | 28 | 0 | 42 | 180 |
| GET /products/search (exact) | 157 | 0 | 37 | 120 |
| GET /products?category | 238 | 0 | 35 | 74 |
| GET /analytics/top-selling-products | 19 | 0 | 33 | 33 |
| GET /products | 459 | 0 | 33 | 92 |
| GET /analytics/order-status | 25 | 0 | 30 | 48 |
| GET /inventory/{pid} | 17 | 0 | 30 | 30 |
| GET /orders/{id} | 17 | 0 | 20 | 20 |

## Phase 2 — Scenario Results

### Scenario B — Concurrent signup race
**Result: ✅ PASS**
- Success (201): 1
- Duplicate (400): 49
- Other: 0
- Note: Exactly 1 success and 1 row in users_db verifies unique constraint and atomic registration.

### Scenario C — Last-unit stock race
**Result: ✅ PASS**
- Target product_id: 1
- Original stock: 69
- Final stock: 0
- Success (201): 1
- Failure (409): 49
- Other: 0
- Note: Inventory SELECT FOR UPDATE ensures exactly 1 reservation succeeds.

## Bottleneck Analysis (from measured data)

### Endpoint degradation
- `POST /login (ramp-setup)` crossed 500ms p95 at **500 users** (measured p95=1900ms)

### Container saturation
- **stage_10** (10 users) peak CPU: elasticsearch=385.3%, user-service=21.0%, neo4j=8.0%
- **stage_50** (50 users) peak CPU: user-service=158.6%, elasticsearch=73.9%, product-service=23.4%
- **stage_100** (100 users) peak CPU: user-service=353.3%, neo4j=56.3%, elasticsearch=51.0%
- **stage_500** (500 users) peak CPU: product-service=28.2%, elasticsearch=16.9%, user-service=14.2%

### Slow queries (top 5 per DB per stage)

#### stage_10 / orders_db
| query (truncated) | calls | total_exec_ms | mean_exec_ms |
|---|---|---|---|
| INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, | 106 | 102.76 | 0.97 |
| INSERT INTO orders (user_id, total_amount, status) VALUES ($1, $2, $3) RETURNING | 110 | 52.51 | 0.48 |
| SELECT orders.id, orders.user_id, orders.total_amount, orders.status, orders.cre | 220 | 27.21 | 0.12 |
| UPDATE orders SET status=$1 WHERE orders.id = $2 | 66 | 26.79 | 0.41 |
| UPDATE orders SET total_amount=$1, status=$2 WHERE orders.id = $3 | 44 | 11.49 | 0.26 |

#### stage_10 / users_db
| query (truncated) | calls | total_exec_ms | mean_exec_ms |
|---|---|---|---|
| SELECT id FROM users WHERE username LIKE $1 ORDER BY random() LIMIT $2 | 3 | 87.07 | 29.02 |
| INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) | 78 | 36.83 | 0.47 |
| SELECT users.id AS users_id, users.username AS users_username, users.email AS us | 126 | 9.32 | 0.07 |
| SELECT users.id, users.username, users.email, users.password_hash, users.role  F | 78 | 4.21 | 0.05 |
| SELECT $1 | 256 | 2.57 | 0.01 |

#### stage_10 / products_db
| query (truncated) | calls | total_exec_ms | mean_exec_ms |
|---|---|---|---|
| SELECT products.id AS products_id, products.name AS products_name, products.cate | 117 | 11.36 | 0.10 |
| SELECT products.id AS products_id, products.name AS products_name, products.cate | 209 | 9.29 | 0.04 |
| SELECT products.id AS products_id, products.name AS products_name, products.cate | 176 | 8.44 | 0.05 |
| SELECT $1 | 502 | 5.82 | 0.01 |
| BEGIN | 540 | 1.71 | 0.00 |

#### stage_50 / orders_db
| query (truncated) | calls | total_exec_ms | mean_exec_ms |
|---|---|---|---|
| INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, | 220 | 81.30 | 0.37 |
| INSERT INTO orders (user_id, total_amount, status) VALUES ($1, $2, $3) RETURNING | 228 | 48.45 | 0.21 |
| SELECT orders.id, orders.user_id, orders.total_amount, orders.status, orders.cre | 456 | 43.30 | 0.09 |
| SELECT anon_1.orders_id AS anon_1_orders_id, anon_1.orders_user_id AS anon_1_ord | 372 | 38.82 | 0.10 |
| UPDATE orders SET status=$1 WHERE orders.id = $2 | 111 | 28.56 | 0.26 |

#### stage_50 / users_db
| query (truncated) | calls | total_exec_ms | mean_exec_ms |
|---|---|---|---|
| SELECT id FROM users WHERE username LIKE $1 ORDER BY random() LIMIT $2 | 1 | 20.74 | 20.74 |
| INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) | 50 | 8.74 | 0.17 |
| SELECT users.id AS users_id, users.username AS users_username, users.email AS us | 52 | 3.31 | 0.06 |
| SELECT users.id, users.username, users.email, users.password_hash, users.role  F | 50 | 3.06 | 0.06 |
| SELECT $1 | 150 | 1.72 | 0.01 |

#### stage_50 / products_db
| query (truncated) | calls | total_exec_ms | mean_exec_ms |
|---|---|---|---|
| SELECT products.id AS products_id, products.name AS products_name, products.cate | 998 | 45.42 | 0.05 |
| SELECT products.id AS products_id, products.name AS products_name, products.cate | 468 | 36.42 | 0.08 |
| SELECT $1 | 1824 | 23.46 | 0.01 |
| SELECT products.id AS products_id, products.name AS products_name, products.cate | 358 | 16.80 | 0.05 |
| SELECT             category,             COUNT(*)              AS product_count, | 39 | 5.95 | 0.15 |

#### stage_100 / orders_db
| query (truncated) | calls | total_exec_ms | mean_exec_ms |
|---|---|---|---|
| INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, | 435 | 103.67 | 0.24 |
| INSERT INTO orders (user_id, total_amount, status) VALUES ($1, $2, $3) RETURNING | 454 | 94.69 | 0.21 |
| SELECT orders.id, orders.user_id, orders.total_amount, orders.status, orders.cre | 908 | 78.57 | 0.09 |
| SELECT anon_1.orders_id AS anon_1_orders_id, anon_1.orders_user_id AS anon_1_ord | 667 | 67.14 | 0.10 |
| UPDATE orders SET total_amount=$1, status=$2 WHERE orders.id = $3 | 222 | 56.14 | 0.25 |

#### stage_100 / users_db
| query (truncated) | calls | total_exec_ms | mean_exec_ms |
|---|---|---|---|
| INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) | 100 | 20.87 | 0.21 |
| SELECT id FROM users WHERE username LIKE $1 ORDER BY random() LIMIT $2 | 1 | 16.03 | 16.03 |
| SELECT users.id AS users_id, users.username AS users_username, users.email AS us | 100 | 6.06 | 0.06 |
| SELECT users.id, users.username, users.email, users.password_hash, users.role  F | 100 | 5.38 | 0.05 |
| SELECT $1 | 300 | 3.08 | 0.01 |

#### stage_100 / products_db
| query (truncated) | calls | total_exec_ms | mean_exec_ms |
|---|---|---|---|
| SELECT products.id AS products_id, products.name AS products_name, products.cate | 2043 | 94.92 | 0.05 |
| SELECT products.id AS products_id, products.name AS products_name, products.cate | 884 | 69.37 | 0.08 |
| SELECT $1 | 3620 | 43.33 | 0.01 |
| SELECT products.id AS products_id, products.name AS products_name, products.cate | 702 | 32.58 | 0.05 |
| SELECT             category,             COUNT(*)              AS product_count, | 80 | 14.02 | 0.18 |

#### stage_500 / orders_db
| query (truncated) | calls | total_exec_ms | mean_exec_ms |
|---|---|---|---|
| SELECT anon_1.orders_id AS anon_1_orders_id, anon_1.orders_user_id AS anon_1_ord | 160 | 617.14 | 3.86 |
| INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, | 90 | 19.85 | 0.22 |
| UPDATE orders SET status=$1 WHERE orders.id = $2 | 75 | 17.25 | 0.23 |
| INSERT INTO orders (user_id, total_amount, status) VALUES ($1, $2, $3) RETURNING | 92 | 17.23 | 0.19 |
| SELECT orders.id, orders.user_id, orders.total_amount, orders.status, orders.cre | 184 | 14.94 | 0.08 |

#### stage_500 / users_db
| query (truncated) | calls | total_exec_ms | mean_exec_ms |
|---|---|---|---|
| SELECT id FROM users WHERE username LIKE $1 ORDER BY random() LIMIT $2 | 1 | 37.70 | 37.70 |
| INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) | 100 | 29.65 | 0.30 |
| SELECT users.id, users.username, users.email, users.password_hash, users.role  F | 100 | 11.14 | 0.11 |
| SELECT $1 | 213 | 2.65 | 0.01 |
| SELECT users.id AS users_id, users.username AS users_username, users.email AS us | 28 | 1.63 | 0.06 |

#### stage_500 / products_db
| query (truncated) | calls | total_exec_ms | mean_exec_ms |
|---|---|---|---|
| SELECT products.id AS products_id, products.name AS products_name, products.cate | 459 | 20.56 | 0.04 |
| SELECT products.id AS products_id, products.name AS products_name, products.cate | 238 | 16.36 | 0.07 |
| SELECT $1 | 808 | 9.13 | 0.01 |
| SELECT products.id AS products_id, products.name AS products_name, products.cate | 111 | 5.04 | 0.05 |
| BEGIN | 848 | 2.41 | 0.00 |

### Suggestions (not implemented — bottlenecks only)
_(Based only on measured data above)_

No saturation or high-failure stages detected up to the measured scale.

## Plain-language summary

The load test ran 4 ramp stages (10→500 users) against the 50M dataset. At 500 users the system achieved 11.730537507452887 req/s with p50=16ms, p95=1000ms, p99=2300ms, and a failure rate of 0.5%. Scenario B (signup race) passed: 1 successful registration(s) out of 50 concurrent attempts. Scenario C (last-unit race) passed: 1 successful order(s) when stock was 1, final stock=0.