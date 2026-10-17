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

### Conclusion & Bottleneck Characterization
- **Finding**: Measured failures were traced to specific application configurations under load:
  - **HTTP 500**: Confirmed by `order-service` logs with 104 tracebacks of `sqlalchemy.exc.TimeoutError: QueuePool limit of size 25 overflow 15 reached, connection timed out, timeout 30.00`.
  - **HTTP 503**: Confirmed by failure records showing fast 503 Service Unavailable responses triggered when Uvicorn exceeded `--limit-concurrency 500`.
  - **Per-Stage CPU Measurements**: Statements that `order-service` container CPU was simply "low" are not supported by the data. Container peak CPU reached 5.41% (10 users), 11.0% (50 users), 49.97% (100 users), 16.69% (200 users), 124.12% (original 500), 79.05% (500 diagnostic), and 124.5% (500 limit 1000). The low readings of 2.09% (stage 300) and 6.66% (stage 400) occurred because those stages aborted early after only ~11.8s and ~9.0s measurement windows respectively, so those readings are not representative of sustained execution. Individual Locust worker peak CPU was 14.0% (10 users), 9.9% (50 users), 10.9% (100 users), 18.1% (200 users), 17.2% (300 users), 32.6% (400 users), 31.2% (original 500), 23.8% (500 diagnostic), and 38.4% (500 limit 1000, with aggregate Locust CPU reaching 116.0%).
- **Evidence**: Raising `--limit-concurrency 1000` on `order-service` increased throughput from 22.32 req/s (2,699 requests) to 259.85 req/s (31,378 requests) and reduced `POST /orders` failures from 79.5% (35/44) to 0.05% (1/2,170). This experiment indicates that the concurrency limit of 500 was a bottleneck at 500 users; however, hardware limitations have not been ruled out.

### Reversion & Verification
`docker-compose.yml` was immediately restored:
```bash
git restore docker-compose.yml
docker compose up -d order-service
git diff docker-compose.yml
# (empty output — verified zero residual changes)
```

---

## 4. Step 3: Breaking Point Determination & Measurement Window Verification

### Measurement Window & Throughput Analysis
From the stats CSVs, the actual measurement window ($T_{\text{window}} = \frac{\text{Requests}}{\text{Requests/s}}$) and throughput behavior were verified across all intermediate and diagnostic stages:
- **100 Users (Original Reference)**: 6,919 requests / 56.61 req/s = **122.22s window** (Full steady state, expected scaling).
- **200 Users**: 546 requests / 8.46 req/s = **64.51s window**. Throughput collapsed to 8.46 req/s (drastically lower than 100 users at 56.61 req/s). In `stage_200_stats_history.csv`, requests stopped accumulating entirely at $t+76$s (546 requests), after which Locust CPU dropped to 0.0% and workers went idle. Because this throughput collapse cannot be explained by valid steady-state execution, this stage is marked **NOT RELIABLE**.
- **300 Users**: 499 requests / 42.19 req/s = **11.83s window**. Aborted at $t=24.1$s (only ~14s into steady state) due to `GET /orders?user_id` hitting 100% failure rate (11/11 fails), triggering the 5% per-endpoint guard.
- **400 Users**: 1,358 requests / 150.79 req/s = **9.01s window**. Aborted at $t=20.2$s (only ~10s into steady state) due to `GET /orders?user_id` hitting 100% failure rate (122/122 fails), triggering the 5% per-endpoint guard.
- **500 Users Rerun (Step 1 Diagnostic)**: 2,699 requests / 22.32 req/s = **120.91s window** (full 2 minutes). Throughput was 22.32 req/s vs 260.57 req/s in the earlier original run because virtual users were blocked waiting 60–90 seconds for PostgreSQL QueuePool timeouts on `order-service` (`sqlalchemy.exc.TimeoutError: QueuePool limit of size 25 overflow 15 reached`), preventing user loops from issuing new requests.

### Intermediate Stages Summary Table
| Users | Spawn/s | Wall Elapsed | Measured Window | Steady Req/s | Requests | Failures | Fail % | p50 ms | p95 ms | p99 ms | Status & Reliability |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| **200** | 20 | 136.1s | 64.5s | 8.46 | 546 | 0 | **0.00%** | 9 | 100 | 170 | **NOT RELIABLE** (Throughput collapsed; requests stalled at 546 at t+76s, leaving workers idle) |
| **300** | 30 | 24.1s | 11.8s | 42.19 | 499 | 17 | **3.41%** | 9 | 120 | 150 | **ABORTED** (Transient 11.8s window; GET /orders?user_id hit 100% fail [11/11] > 5% guard) |
| **400** | 40 | 20.2s | 9.0s | 150.79 | 1,358 | 223 | **16.42%** | 19 | 240 | 410 | **ABORTED** (Transient 9.0s window; GET /orders?user_id hit 100% fail [122/122] > 5% guard) |

### Breaking Point: Presented as a Range (300 to 500 Users)
The system breaking point is **300 to 500 concurrent users** (a range, not a single static number). Under high concurrency, failure locations vary between runs:
- **Run 1 (Original 500-user steady stage)**: Failures concentrated on `product-service` with `HTTP 503` (51 exact search failures triggering the 5% guard at 50s; 138 product list failures), while `POST /orders` had **0 failures out of 703 requests**.
- **Run 2 (Step 1 Diagnostic rerun)**: Failures shifted entirely to `order-service` with `HTTP 500`, where `POST /orders` suffered **35 failures out of 44 requests (79.5%)** due to PostgreSQL connection pool exhaustion, while product endpoints had **0 failures out of 2,315 requests**.

### Source-Code Analysis: Why 503 Appeared at 300–400 Users with `--limit-concurrency 500`
Reading the installed Uvicorn HTTP protocol source code (`uvicorn/protocols/http/httptools_impl.py` and `h11_impl.py`):
1. **Connection Tracking**:
   ```python
   def connection_made(self, transport: asyncio.Transport) -> None:
       self.connections.add(self)
   ```
   and is only discarded when the TCP socket closes:
   ```python
   def connection_lost(self, exc: Exception | None) -> None:
       self.connections.discard(self)
   ```
2. **Open Keep-Alive Sockets Count Directly Toward the Limit**:
   In `data_received()`:
   ```python
   # Handle 503 responses when 'limit_concurrency' is exceeded.
   if self.limit_concurrency is not None and (
       len(self.connections) >= self.limit_concurrency or len(self.tasks) >= self.limit_concurrency
   ):
       app = service_unavailable
       message = "Exceeded concurrency limit."
       self.logger.warning(message)
   ```
   **Source Confirmation**: Open HTTP keep-alive connections (`timeout-keep-alive 65`) **do count toward `len(self.connections)`**.
3. **Source-Code Consistent Explanatory Model (Hypothesis)**: While live TCP socket counts were not directly measured during the run, the source code provides a consistent explanatory model for why 503 errors appeared at 300–400 simulated users: with multiple distributed Locust worker processes holding persistent keep-alive connections open, combined with internal inter-service client sessions, cumulative open TCP connections `len(self.connections)` can exceed the 500 limit before active inflight request rates reach 500, triggering fast 503 rejections in 7–15 ms.
