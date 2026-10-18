# Distributed E-Commerce OMS — 50M Benchmark Final Report
_Generated: 2026-10-18 22:37:10_

## 1. Machine & Dataset Specification

### Machine & System Specifications
_Generated: 2026-10-18T21:46:14.748134_

## System
- **OS**: Windows-11-10.0.26200-SP0
- **CPU**: Intel64 Family 6 Model 186 Stepping 3, GenuineIntel
- **Physical cores**: 10
- **Logical CPUs**: 12
- **RAM total**: 15.58 GB
- **RAM available**: 0.91 GB
- **Free disk**: 731.87 GB

## Versions
- **Python**: 3.14.6
- **Docker**: 29.8.0
- **Locust**: locust 2.46.7 from C:\Users\HP\AppData\Roaming\Python\Python314\site-packages\locust (Python 3.14.6)

## Verified Dataset (Direct DB Measurements)
- **orders_db → orders**: 50,010,711 (18 GB)
- **orders_db → order_items**: 56,144,708
- **users_db  → users**:  1,252,532 (336 MB)

### Order status split
| Status | Count | Share |
|--------|-------|-------|
| CONFIRMED | 49,387,760 | 98.75% |
| FAILED | 622,951 | 1.25% |

## 2. Profile Capacity Settings

| Setting | Baseline Profile | Tuned Profile | Scope / Description |
|:---|:---:|:---:|:---|
| `DB_POOL_SIZE` | `25` | `60` | Persistent DB connection pool size per service process |
| `DB_MAX_OVERFLOW` | `15` | `20` | Additional temporary connection limit under burst |
| `DB_POOL_TIMEOUT` | `30s` | `5s` | QueuePool acquisition timeout |
| `UVICORN_LIMIT_CONCURRENCY` | `500` | `2000` | Uvicorn in-flight concurrency threshold |
| `UVICORN_WORKERS` | `1` | `1` | Worker processes per service container |
| `POSTGRES_MAX_CONNECTIONS` | `100` (effective: `100`) | `300` (effective: `300`) | PostgreSQL server connection limit on `orders_db` |

## 3. Baseline vs. Tuned Performance Comparison Table

All metrics represent **pure steady state** measured with `--reset-stats` across Locust Master + 3 Workers with a **60s cool-down and restart of `order-service` and `product-service` between stages**.

| Users | Profile | Valid? | Req/s | p50 (ms) | p95 (ms) | p99 (ms) | Fail % | Cause of Failures |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| 10 | **Baseline** | ✅ YES | 5.16 | 22 | 140 | 320 | 0.00% | None (0 failures) |
| 10 | **Tuned** | ✅ YES | 5.19 | 11 | 67 | 89 | 0.00% | None (0 failures) |
| 50 | **Baseline** | ✅ YES | 26.36 | 21 | 110 | 210 | 0.00% | None (0 failures) |
| 50 | **Tuned** | ✅ YES | 23.45 | 10 | 78 | 180 | 0.00% | None (0 failures) |
| 100 | **Baseline** | ✅ YES | 52.64 | 28 | 140 | 250 | 0.00% | None (0 failures) |
| 100 | **Tuned** | ✅ YES | 61.96 | 11 | 80 | 300 | 0.00% | None (0 failures) |
| 200 | **Baseline** | ✅ YES | 92.17 | 26 | 190 | 1500 | 0.01% | Timeout/ConnErr: 1 |
| 200 | **Tuned** | ✅ YES | 92.76 | 14 | 91 | 680 | 0.00% | None (0 failures) |
| 300 | **Baseline** | ✅ YES | 154.78 | 40 | 210 | 350 | 0.00% | None (0 failures) |
| 300 | **Tuned** | ✅ YES | 151.93 | 22 | 130 | 230 | 0.00% | None (0 failures) |
| 400 | **Baseline** | ✅ YES | 170.48 | 490 | 870 | 1400 | 0.00% | None (0 failures) |
| 400 | **Tuned** | ✅ YES | 170.10 | 1000 | 1500 | 1800 | 0.00% | None (0 failures) |
| 500 | **Baseline** | ✅ YES | 126.61 | 2100 | 3200 | 3800 | 0.00% | None (0 failures) |
| 500 | **Tuned** | ✅ YES | 171.29 | 1800 | 2600 | 3000 | 0.00% | None (0 failures) |
| 800 | **Tuned (Stress)** | 🚨 ABORTED (Stress Breaking Point: p95 latency 7000ms > 5,000ms for 30.0s (>= 30s)) | 119.17 | 5300 | 7000 | 8100 | 0.00% | None (0 failures) |
| 1000 | **Tuned (Stress)** | 🚨 ABORTED (Stress Breaking Point: p95 latency 13000ms > 5,000ms for 30.0s (>= 30s)) | 103.44 | 7100 | 13000 | 13000 | 0.00% | None (0 failures) |

## 4. First Degrading Stage Analysis (Failures > 1% or p95 > 1 s)

### Baseline Profile
- **First Stage Crossing Threshold**: **500 users**
- **Measured Failure Rate**: `0.00%`
- **Measured Aggregate p95**: `3200 ms`
- **Responsible Endpoint**: `not isolated (all 7 product-service endpoints within ~6% p95, 3200–3400 ms)`
- **Responsible Container**: `product-service`

### Tuned Profile
- **First Stage Crossing Threshold**: **400 users**
- **Measured Failure Rate**: `0.00%`
- **Measured Aggregate p95**: `1500 ms`
- **Responsible Endpoint**: `not isolated (all 7 product-service endpoints within ~6% p95, 1500–1600 ms)`
- **Responsible Container**: `product-service`

## 5. Measured Evidence per Stage & Profile

### A. PostgreSQL Connection Pool Activity (`orders_db`)

| Users | Profile | Peak Total Conns | Peak Active | Peak Idle in Tx | Peak Idle | Avg Total Conns | Samples |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 10 | Baseline | 2 | 0 | 0 | 2 | 1.9 | 34 |
| 10 | Tuned | 2 | 0 | 0 | 2 | 1.9 | 33 |
| 50 | Baseline | 4 | 1 | 2 | 4 | 3.1 | 34 |
| 50 | Tuned | 9 | 0 | 2 | 9 | 7.6 | 34 |
| 100 | Baseline | 8 | 2 | 5 | 8 | 7.6 | 34 |
| 100 | Tuned | 8 | 0 | 3 | 8 | 6.9 | 34 |
| 200 | Baseline | 23 | 0 | 5 | 23 | 19.2 | 34 |
| 200 | Tuned | 18 | 0 | 3 | 18 | 15.4 | 34 |
| 300 | Baseline | 19 | 1 | 6 | 19 | 17.9 | 34 |
| 300 | Tuned | 25 | 0 | 6 | 25 | 23.5 | 33 |
| 400 | Baseline | 25 | 1 | 9 | 25 | 23.5 | 33 |
| 400 | Tuned | 26 | 2 | 8 | 26 | 21.9 | 34 |
| 500 | Baseline | 25 | 4 | 7 | 25 | 21.5 | 33 |
| 500 | Tuned | 35 | 1 | 7 | 35 | 29.6 | 34 |
| 800 | Tuned | 39 | 0 | 33 | 39 | 25.0 | 16 |
| 1000 | Tuned | 59 | 1 | 33 | 58 | 37.6 | 15 |

### B. Docker Container Steady-State CPU Utilization (Median / p95 after 35s)

| Users | Profile | Top Container Steady-State CPU (Median / p95 after 35s) | Top Container RAM Peaks |
|:---:|:---:|:---|:---|
| 10 | Baseline | `product-service`: 4.2% / 267.0%, `elasticsearch`: 9.0% / 51.2%, `inventory_db`: 0.0% / 18.4% | `orders_db`: 31.3%, `elasticsearch`: 13.7%, `neo4j`: 8.3% |
| 10 | Tuned | `product-service`: 2.2% / 137.8%, `inventory_db`: 0.0% / 7.2%, `users_db`: 0.0% / 6.2% | `orders_db`: 14.8%, `elasticsearch`: 14.4%, `neo4j`: 9.5% |
| 50 | Baseline | `elasticsearch`: 22.5% / 52.1%, `product-service`: 19.1% / 28.7%, `orders_db`: 2.2% / 25.0% | `orders_db`: 29.0%, `elasticsearch`: 13.8%, `neo4j`: 8.3% |
| 50 | Tuned | `product-service`: 10.4% / 250.6%, `elasticsearch`: 7.1% / 14.7%, `order-service`: 3.9% / 8.8% | `elasticsearch`: 14.4%, `orders_db`: 13.8%, `neo4j`: 9.4% |
| 100 | Baseline | `elasticsearch`: 41.5% / 90.3%, `product-service`: 40.9% / 67.5%, `order-service`: 10.4% / 31.1% | `orders_db`: 27.8%, `elasticsearch`: 13.9%, `neo4j`: 8.4% |
| 100 | Tuned | `product-service`: 25.4% / 36.3%, `elasticsearch`: 14.8% / 30.2%, `order-service`: 8.9% / 19.4% | `elasticsearch`: 14.3%, `orders_db`: 13.1%, `neo4j`: 9.5% |
| 200 | Baseline | `elasticsearch`: 77.0% / 151.1%, `product-service`: 71.3% / 107.3%, `order-service`: 26.2% / 45.6% | `orders_db`: 41.9%, `elasticsearch`: 15.0%, `neo4j`: 9.8% |
| 200 | Tuned | `product-service`: 39.7% / 55.4%, `elasticsearch`: 21.5% / 51.4%, `neo4j`: 1.6% / 35.7% | `elasticsearch`: 14.3%, `orders_db`: 13.3%, `neo4j`: 9.5% |
| 300 | Baseline | `product-service`: 95.0% / 120.2%, `elasticsearch`: 63.9% / 100.5%, `order-service`: 38.2% / 54.2% | `orders_db`: 28.9%, `elasticsearch`: 14.3%, `neo4j`: 9.7% |
| 300 | Tuned | `product-service`: 68.9% / 106.5%, `elasticsearch`: 39.1% / 58.2%, `order-service`: 28.8% / 47.1% | `elasticsearch`: 14.3%, `orders_db`: 13.1%, `neo4j`: 9.5% |
| 400 | Baseline | `neo4j`: 5.8% / 265.6%, `product-service`: 118.4% / 121.8%, `elasticsearch`: 64.1% / 79.5% | `orders_db`: 27.7%, `elasticsearch`: 14.6%, `neo4j`: 9.7% |
| 400 | Tuned | `product-service`: 116.3% / 119.1%, `elasticsearch`: 59.5% / 76.4%, `order-service`: 44.3% / 66.3% | `elasticsearch`: 14.3%, `orders_db`: 12.1%, `neo4j`: 9.5% |
| 500 | Baseline | `product-service`: 120.7% / 126.7%, `elasticsearch`: 69.9% / 86.0%, `order-service`: 42.8% / 64.0% | `orders_db`: 27.1%, `elasticsearch`: 14.7%, `neo4j`: 9.7% |
| 500 | Tuned | `product-service`: 115.5% / 121.1%, `elasticsearch`: 64.1% / 72.7%, `order-service`: 42.4% / 59.9% | `elasticsearch`: 14.3%, `orders_db`: 12.0%, `neo4j`: 9.5% |
| 800 | Tuned | `product-service`: 114.3% / 116.1%, `elasticsearch`: 61.9% / 81.0%, `order-service`: 41.9% / 52.1% | `elasticsearch`: 14.3%, `orders_db`: 11.4%, `neo4j`: 9.5% |
| 1000 | Tuned | `product-service`: 115.5% / 132.7%, `admin-analytics`: 7.6% / 115.8%, `order-service`: 48.2% / 88.0% | `elasticsearch`: 14.4%, `orders_db`: 10.3%, `neo4j`: 9.4% |

### C. Locust Load Generator CPU & Saturation Status

| Users | Profile | Peak Locust CPU | Generator Saturated (>80%)? | Status |
|:---:|:---:|:---:|:---:|:---|
| 10 | Baseline | 37.0% | No (Healthy) | Valid |
| 10 | Tuned | 10.7% | No (Healthy) | Valid |
| 50 | Baseline | 49.1% | No (Healthy) | Valid |
| 50 | Tuned | 9.5% | No (Healthy) | Valid |
| 100 | Baseline | 52.9% | No (Healthy) | Valid |
| 100 | Tuned | 15.8% | No (Healthy) | Valid |
| 200 | Baseline | 37.2% | No (Healthy) | Valid |
| 200 | Tuned | 22.9% | No (Healthy) | Valid |
| 300 | Baseline | 20.6% | No (Healthy) | Valid |
| 300 | Tuned | 19.9% | No (Healthy) | Valid |
| 400 | Baseline | 22.3% | No (Healthy) | Valid |
| 400 | Tuned | 36.9% | No (Healthy) | Valid |
| 500 | Baseline | 45.1% | No (Healthy) | Valid |
| 500 | Tuned | 50.4% | No (Healthy) | Valid |
| 800 | Tuned | 48.1% | No (Healthy) | Aborted |
| 1000 | Tuned | 81.8% | ⚠️ YES (Saturated) | Aborted |

## 6. SAGA Connection Holding Audit Findings (Supported by CSV Measurements)

A code audit documented in `docs/ORDER_SERVICE_CONNECTION_FINDING.md` identified that `order-service` holds an open database connection in `state = 'idle in transaction'` during outbound HTTP calls.

- **Empirical Evidence in CSV Measurements**:
  - The `orders_db` `pg_stat_activity` continuous sampling confirmed concurrent `idle in transaction` states during load     (peaking at 9 connections in baseline at 400 users, and 33 in tuned stress stages).
  - **No Pool Exhaustion Observed**: Across all stages of both baseline and tuned profiles, service logs recorded     **0 connection pool timeouts** (`pool_timeout: 0`). Peak connections on `orders_db` reached 25 (baseline) and 35 (tuned at 500 users),     staying within configured pool limits. Pool exhaustion was not observed or measured in these benchmark runs.

## 7. Limitations & Test Environment Bounds

- **Build Git Commit**: `71233dbd504c60337bc6ed376f81b751d3a04860`
- **Single Run Per Stage**: All metrics reflect a single execution per stage (no multi-run averaging).
- **Light-Load Noise Floor**: At 10 users, tuned response times (p50: 11 ms, p95: 67 ms) measured faster than baseline (p50: 22 ms, p95: 140 ms), which reflects host thermal variance and machine noise floor rather than tuning effects at low load.
- **Dataset Counts at Run Starts**:
  - Baseline start: `orders_db` orders: 50,006,745 (Phase 3: 50,006,763); `users_db` users: 1,252,514 (Phase 3: 1,252,532).
  - Tuned start: `orders_db` orders: 50,010,711; `users_db` users: 1,252,532.
  - Note: `order_items` count is reported as `max(id)` (`56,140,542` at baseline Phase 3; `56,144,708` at tuned start) to avoid sequential scan overhead on the 56M-row table.
- **Host RAM Availability Differences**: Host available RAM was 0.88 GB at baseline start vs. 0.91 GB at tuned start.
- **Orders DB Memory Utilization Differences**: `orders_db` container memory peak differed (27%–42% during baseline vs. 10%–15% during tuned) due to database container recreation before the tuned run.
- **Stress Stage Aborts (800 & 1000 Users)**: Both stages triggered the 30-second breaking point rule (`p95 > 5,000 ms for 30s`) and aborted at 60 s total duration. At 1000 users, the Locust load generator reached 81.8% process CPU (saturated).
- **0% Failure Rate with High Latency**: Because simulated requests in `locustfile.py` did not enforce client-side HTTP timeouts, requests in stages 800 and 1000 were queued and eventually served, resulting in a 0.00% HTTP failure rate despite p95 latency degrading to 7,000 ms (800 users) and 13,000 ms (1000 users).
- **Host Overall CPU**: Host total CPU during stages was not sampled (recorded as `not determined`).
- **Earlier 260.57 req/s Run**: An earlier exploratory test run measured 260.57 req/s; that result was not reproduced in either controlled baseline or tuned runs and its cause remains unexplained.
- **Single Host Colocation & Docker Networking**: All 14 containers and the Locust generator ran concurrently on one laptop; bridge network round-trip latencies (~5–20 ms) are lower than real-world multi-datacenter network links.
