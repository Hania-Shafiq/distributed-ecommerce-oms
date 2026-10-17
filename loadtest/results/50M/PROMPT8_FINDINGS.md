# Prompt 8 Findings: Concurrency Diagnostics, Breaking Point & Bottleneck Evidence
_Generated: 2026-10-17_
_Environment: Windows 11, Intel Core i7 (10 physical / 12 logical cores), 15.58 GB RAM, Docker Compose Monorepo_

---

## 1. Step 1: Microservice Uvicorn & DB Pool Configurations

Every service in the Distributed E-Commerce OMS repository was inspected across `docker-compose.yml`, Dockerfiles, and `database.py`:

| Service | Config Source | Uvicorn Command | Workers | Concurrency Limit | Database Pool Settings |
|:---|:---|:---|:---:|:---:|:---|
| **`user-service`** | `docker-compose.yml` / `database.py` | `uvicorn main:app --host 0.0.0.0 --port 8001 --timeout-keep-alive 65 --limit-concurrency 500` | 1 | 500 | SQLAlchemy `pool_size=25, max_overflow=15` (max 40 connections), `pool_pre_ping=True` |
| **`order-service`** | `docker-compose.yml` / `database.py` | `uvicorn main:app --host 0.0.0.0 --port 8004 --timeout-keep-alive 65 --limit-concurrency 500` | 1 | 500 | SQLAlchemy `pool_size=25, max_overflow=15` (max 40 connections), `pool_pre_ping=True` |
| **`product-service`** | `docker-compose.yml` / `database.py` | `uvicorn main:app --host 0.0.0.0 --port 8006 --timeout-keep-alive 65 --limit-concurrency 500` | 1 | 500 | SQLAlchemy `pool_size=25, max_overflow=15` (max 40 connections), `pool_pre_ping=True` |
| **`inventory-service`** | `Dockerfile` / `database.py` | `uvicorn main:app --host 0.0.0.0 --port 8003` (default CMD) | 1 | None (unlimited) | SQLAlchemy `pool_size=25, max_overflow=15` (max 40 connections), `pool_pre_ping=True` |
| **`admin-analytics`** | `Dockerfile` / `database.py` | `uvicorn main:app --host 0.0.0.0 --port 8002` (default CMD) | 1 | None (unlimited) | Elasticsearch Urllib3 Connection Pool |
| **`recommendation-service`** | `Dockerfile` | `uvicorn main:app --host 0.0.0.0 --port 8005` (default CMD) | 1 | None (unlimited) | Neo4j Python Driver Internal Pool |

---

## 2. Step 1: 503 & 500 Root Cause Diagnosis (Full 2-Minute 500-User Diagnostic Run)

### Benchmark Settings
- **Users**: 500 | **Spawn rate**: 50/s (10s ramp) | **Steady duration**: 120s pure steady state (`--reset-stats` after spawn)
- **Mode**: Locust Master + 3 Workers
- **Guard Configuration**: Per-endpoint 5% abort guard **DISABLED**; global >20% abort rule active.
- **Pre-Auth Pool**: Refreshed 200 accounts in `user-service` before stage start.

### Measured Results (Initial 500-User Stage with `--limit-concurrency 500`)
- **Total Requests**: 2,699
- **Total Failures**: 85 (Aggregate failure rate: **3.15%**)
- **Throughput**: 22.32 req/s
- **Latency**: p50 = 43 ms | p95 = 4,700 ms | p99 = 90,000 ms

#### Per-Endpoint Breakdown
| Endpoint | Requests | Failures | Failure % | p50 ms | p95 ms | Error Status Recorded |
|:---|:---:|:---:|:---:|:---:|:---:|:---|
| `GET /products` | 1,216 | 0 | 0.0% | 33 | 2,600 | None |
| `GET /products?category` | 482 | 0 | 0.0% | 25 | 2,600 | None |
| `GET /products/search (exact)` | 366 | 0 | 0.0% | 42 | 2,100 | None |
| `GET /products/search (typo)` | 251 | 0 | 0.0% | 65 | 2,300 | None |
| `GET /analytics/*` (5 endpoints) | 214 | 0 | 0.0% | 29–47 | 180–280 | None |
| `GET /inventory/{pid}` | 9 | 0 | 0.0% | 30 | 200 | None |
| `POST /orders` | 44 | 35 | **79.5%** | 61,000 | 90,000 | `SAGA 5xx 500: Internal Server Error` |
| `GET /orders?user_id (history)` | 88 | 45 | **51.1%** | 62,000 | 93,000 | `HTTP 500: Internal Server Error` |
| `GET /orders/{id}` | 9 | 5 | **55.6%** | 62,000 | 90,000 | `HTTP 500: Internal Server Error` |

### Log Lines as Evidence
Captured Docker logs of `order-service` contained 104 tracebacks with the exact root cause:
```text
sqlalchemy.exc.TimeoutError: QueuePool limit of size 25 overflow 15 reached, connection timed out, timeout 30.00
(Background on this error at: https://sqlalche.me/e/20/3o7r)
ERROR:    Exception in ASGI application
Traceback (most recent call last):
  File "/usr/local/lib/python3.11/site-packages/uvicorn/protocols/http/httptools_impl.py", line 411, in run_asgi
    result = await app(scope, receive, send)
  ...
  File "/app/main.py", line 110, in create_order
    return execute_order_saga(payload, db)
  File "/app/saga.py", line 102, in execute_order_saga
    db.commit()
  ...
  File "/usr/local/lib/python3.11/site-packages/sqlalchemy/pool/impl.py", line 168, in _do_get
    raise exc.TimeoutError(...)
```

### Analysis of the Earlier 100% Failure
- In earlier runs, `POST /orders` and `GET /orders?user_id` failed with **100% failure rate at ~20 ms median latency**.
- **Evidence Comparison**:
  1. When DB connection pool is exhausted, requests wait the full `timeout=30.00` seconds before throwing `TimeoutError` and returning HTTP 500 (median latency ~61,000 ms).
  2. Immediate failure in ~20 ms cannot be caused by pool timeout.
  3. However, when Uvicorn's `--limit-concurrency 500` is reached (or when auth tokens are rejected / unverified), requests are rejected immediately at the gateway layer within **7–15 ms** with `503 Service Unavailable` or `401 Unauthorized`.
  4. **Conclusion**: Attributing the earlier 100% fast failure (~20 ms) strictly to DB pool exhaustion is disproven by latency measurements. It is a **hypothesis** that the fast failure was caused by auth token expiry / worker token path mismatch, while Uvicorn concurrency drops can also produce fast (<20 ms) 503 rejections when saturated.

---

## 3. Step 2: Concurrency Experiment (Raising `--limit-concurrency 1000`)

### Hypothesis & Experiment Setup
To determine whether `order-service` was **configuration-limited** or **hardware-limited**, `--limit-concurrency` in `docker-compose.yml` was temporarily increased from **500** to **1000** for `order-service`:
```yaml
# docker-compose.yml (temporary experiment)
command: uvicorn main:app --host 0.0.0.0 --port 8004 --timeout-keep-alive 65 --limit-concurrency 1000
```
`order-service` was recreated (`docker compose up -d order-service`) and the identical 500-user 2-minute stage was re-run.

### Measured Before vs. After Results

| Metric | Before (`--limit-concurrency 500`) | After (`--limit-concurrency 1000`) | Impact / Variance |
|:---|:---:|:---:|:---|
| **System Throughput** | 22.32 req/s | **259.85 req/s** | **+1,164% throughput increase** |
| **Total Requests Processed** | 2,699 | **31,378** | +1,062% more traffic handled |
| **Aggregate p50 Latency** | 43 ms | **51 ms** | Predictable interactive response |
| **Aggregate p95 Latency** | 4,700 ms | **800 ms** | **-83.0% latency reduction** |
| **`POST /orders` Requests** | 44 | **2,170** | Almost 50x more order flows completed |
| **`POST /orders` Failure %** | **79.5%** (35 failures) | **0.05%** (1 failure / 2,170) | **Virtually eliminated failures** |
| **`POST /orders` p50 Latency** | 61,000 ms | **790 ms** | Fast SAGA distributed execution |
| **`GET /orders?user_id` Reqs** | 88 | **3,242** | 36x more history queries completed |
| **`GET /orders?user_id` Fail%**| **51.1%** (45 failures) | **0.00%** (0 failures / 3,242) | **Zero failures** |
| **`GET /orders?user_id` p95** | 93,000 ms | **410 ms** | Fast indexed history response |
| **`GET /orders/{id}` Fail %** | **55.6%** (5 failures) | **0.00%** (0 failures / 2,003) | **Zero failures** |

### Shift of Bottleneck
With `order-service` unconstrained, total system throughput climbed to **~260 req/s**. At this elevated throughput:
- `product-service` (which still had `--limit-concurrency 500`) encountered concurrency drops:
  - `GET /products`: 772 failures / 9,799 (7.9%), error: `HTTP 503: Service Unavailable`
  - `GET /products?category`: 346 failures / 4,305 (8.0%), error: `HTTP 503: Service Unavailable`
  - `GET /products/search`: 454 failures / 5,652 (8.0%), error: `HTTP 503: Service Unavailable`
- The single failure on `POST /orders` was an upstream 503 from `product-service`:
  `Unexpected 400: {"detail":"Saga Aborted: Failed to fetch product #7: Product Service unavailable at http://product-service:8006/products/7: 503 Server Error"}`.

### Conclusion & Label
**Result Label: "Configuration-limited vs hardware-limited"**  
The drastic reduction in `order-service` failures from 79.5% to 0.05% and the throughput surge from 22 req/s to 260 req/s demonstrates that `order-service` was **configuration-limited** by Uvicorn's connection concurrency ceiling. When connections queue during SAGA inter-service calls, Uvicorn's concurrency limiter artificially dropped or stalled incoming connections before hardware capacity (CPU/RAM) was saturated.

### Reversion & Verification
`docker-compose.yml` was immediately restored:
```bash
git restore docker-compose.yml
docker compose up -d order-service
git diff docker-compose.yml
# (empty output — verified zero residual changes)
```

---

## 4. Step 3: Breaking Point Determination (Stages 200, 300, 400 Users)

All three intermediate stages were executed using Locust Master + 3 Workers with 120s steady state target and standard abort rules:

| Users | Spawn/s | Actual Duration | Steady Req/s | Requests | Failures | Fail % | p50 ms | p95 ms | p99 ms | Status & Abort Reason |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| **200** | 20 | 136.1s | 8.46 | 546 | 0 | **0.00%** | 9 | 100 | 170 | **PASSED** (Full 120s steady state without failures) |
| **300** | 30 | 24.1s | 42.19 | 499 | 17 | **3.41%** | 9 | 120 | 150 | **ABORTED** (Endpoint 'GET /orders?user_id' reached 100% fail [11/11] > 5% after 24s) |
| **400** | 40 | 20.2s | 150.79 | 1,358 | 223 | **16.42%** | 19 | 240 | 410 | **ABORTED** (Endpoint 'GET /orders?user_id' reached 100% fail [122/122] > 5% after 20s) |

### First Stage Exceeding Breaking Criteria
- **Breaking Point**: **Stage 300 Users** (Failures: **3.41%** > 1.0%).
- **Responsible Container**: **`order-service`**
- **Responsible Endpoints**:
  1. `GET /orders?user_id (history)`: 11 / 11 failures (**100.0% failure rate**), error: `HTTP 503: Service Unavailable` in **7–15 ms**.
  2. `POST /orders`: 6 / 6 failures (**100.0% failure rate**), error: `SAGA 5xx 503: Service Unavailable` in **8 ms**.
- **Other Containers**:
  - `product-service`: 388 requests, **0 failures (0.0%)**, Peak CPU: 28.1%
  - `admin-analytics`: 49 requests, **0 failures (0.0%)**, Peak CPU: 3.1%
  - `elasticsearch`: Peak CPU: 22.9%

### Log Evidence of 503 at Breaking Point
```text
WARNING:  Exceeded concurrency limit.
INFO:     172.18.0.1:44186 - "POST /orders HTTP/1.1" 503 Service Unavailable
WARNING:  Exceeded concurrency limit.
INFO:     172.18.0.1:44216 - "GET /orders?user_id=1250467&skip=0&limit=20 HTTP/1.1" 503 Service Unavailable
```
Uvicorn's `--limit-concurrency 500` triggers fast rejection (HTTP 503) on `order-service` starting at 300 users when SAGA orchestrations and history lookups accumulate active socket connections.
