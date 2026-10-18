# Order Service Database Connection Holding Finding

**Date**: October 18, 2026  
**Subject**: Analysis of SQLAlchemy Session & Connection Lifecycle During Distributed SAGA Execution  
**Scope**: Code audit (`order-service/main.py`, `order-service/saga.py`, `order-service/database.py`) and empirical PostgreSQL `pg_stat_activity` measurement during 100-user 1-minute load test.

---

## 1. Executive Summary

**Finding**: **YES**, an active SQLAlchemy database session and a physical PostgreSQL connection from the connection pool are **held continuously** across all outbound HTTP calls made by the Order Service SAGA orchestrator.

Specifically:
1. An initial database transaction is opened to create the order record.
2. Immediate invocation of `db.refresh(new_order)` executes a `SELECT`, placing the PostgreSQL backend into `state = 'idle in transaction'`.
3. Outbound synchronous HTTP calls to `product-service` (price verification) and `inventory-service` (stock reservation) occur while this transaction and connection remain held.
4. After committing the order, another `db.refresh(new_order)` re-enters `idle in transaction` while downstream auxiliary HTTP notifications are dispatched to `recommendation-service` (with up to 2.0s timeouts).
5. The connection is released back to the pool only when the FastAPI route generator reaches `finally: db.close()`.

---

## 2. File:Line Code Evidence

### A. Session Injection and Lifecycle Scope
- **[`order-service/database.py:41-46`](../order-service/database.py#L41-L46)**:
  ```python
  def get_db():
      db = SessionLocal()
      try:
          yield db
      finally:
          db.close()
  ```
  The session `db` is injected into the route handler via FastAPI dependency injection `Depends(get_db)`. It remains open for the entire duration of the request handling.

- **[`order-service/main.py:103-108, 138`](../order-service/main.py#L103-L138)**:
  ```python
  def create_order(
      payload: schemas.OrderCreate,
      idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
      db: Session = Depends(get_db),
      current_user: dict = Depends(get_current_user),
  ):
      ...
      return execute_order_saga(payload, db, idempotency_key=...)
  ```
  The single session `db` is passed directly into `execute_order_saga()`.

### B. Transaction Initiation and Re-Entering "Idle in Transaction"
- **[`order-service/saga.py:104-108`](../order-service/saga.py#L104-L108)**:
  ```python
  db.add(new_order)
  try:
      db.commit()
      db.refresh(new_order)
      logger.info(f"📝 [SAGA STEP 1] Created Order #{new_order.id} in DB with status 'PENDING'.")
  ```
  - `db.commit()` commits the insertion of the pending order.
  - `db.refresh(new_order)` immediately issues:
    `SELECT orders.id, ... FROM orders WHERE orders.id = %(id)s;`
  - In SQLAlchemy with `autocommit=False` (default DBAPI behaviour), issuing a `SELECT` statement implicitly starts a **new transaction block** on that checked-out connection.
  - Because no commit or rollback immediately follows `db.refresh()`, the connection sits in PostgreSQL in state:
    `state = 'idle in transaction'`.

### C. Synchronous Outbound HTTP Calls While Connection is Held
- **[`order-service/saga.py:127-176`](../order-service/saga.py#L127-L176)**:
  ```python
  for item_data in payload.items:
      # 2a. Fetch product price from Product Service
      product_info = product_client.get_product(item_data.product_id)  # Line 130: HTTP GET :8006
      ...
      db.add(order_item)                                                # Line 150: Session mutation
      ...
      # 2b. Forward Action: Reserve Stock from Inventory Service
      reservation_ok = inventory_client.reserve(item_data.product_id, item_data.quantity) # Line 156: HTTP PUT :8003
  ```
  - **Line 130**: `product_client.get_product()` issues a synchronous network HTTP GET request. The DB connection is checked out and `idle in transaction`.
  - **Line 150**: `order_item` is added to the session identity map.
  - **Line 156**: `inventory_client.reserve()` issues a synchronous network HTTP PUT request to reserve inventory. The connection remains held across this round-trip network I/O.

### D. Second Transaction Block During Recommendation Events
- **[`order-service/saga.py:178-181`](../order-service/saga.py#L178-L181)**:
  ```python
  new_order.total_amount = round(total_order_amount, 2)
  new_order.status = "CONFIRMED"
  db.commit()
  db.refresh(new_order)  # Line 181: Executes SELECT, opening a NEW transaction block!
  ```
- **[`order-service/saga.py:198, 203-245`](../order-service/saga.py#L198-L245)**:
  ```python
  _send_recommendation_events(new_order, payload.user_id, reserved_items)  # Line 198
  ```
  - **Line 221**: `product_client.get_product()` (synchronous HTTP GET).
  - **Line 237**: `requests.post(endpoint, json=payload, headers=headers, timeout=2.0)` issues an HTTP POST to `recommendation-service:8005` with a 2.0-second timeout!
  - During these network calls, the DB session has not exited; the connection is still checked out from the pool in `idle in transaction` until `create_order` returns at line 200 and FastAPI triggers `db.close()`.

---

## 3. Empirical PostgreSQL Activity During 100-User 1-Minute Run

*(Note: The 100-user table below is from a separate earlier exploratory test, not the 50M final benchmark which evaluated stages from 10 to 1000 users.)*

A 100-concurrent-user load test was executed against the API Gateway (`http://localhost:8000`) exercising the Order Service SAGA under `RampUser` workload for 60 seconds. Concurrently, `pg_stat_activity` on `orders_db` was continuously sampled:

```sql
SELECT 
    count(1) FILTER (WHERE state = 'idle in transaction') AS idle_in_tx,
    count(1) FILTER (WHERE state = 'active') AS active,
    count(1) AS total_connections
FROM pg_stat_activity 
WHERE datname = 'orders_db' AND pid != pg_backend_pid();
```

### Measured Results:
| Metric | Value Measured |
| :--- | :--- |
| **Test Duration** | 60 seconds |
| **Concurrent Virtual Users** | 100 users (spawn rate 20/s) |
| **Total Connection Pool Count** | `max = 20`, `avg = 20.00` |
| **Active DB Query Executions** | `max = 0 - 1` (sub-millisecond indexed SQL execution) |
| **"Idle in transaction" Rows** | Discrete polling (500ms): `0` avg; Instantaneous micro-sampling: transient spikes matching SAGA outbound network duration (10–35 ms per order) |

### Analysis of the Measurement:
1. **Connection Pool Utilization**: Under 100 users with baseline pool size 25, the connection pool was steadily utilized at 20 persistent connections.
2. **Transient vs Persistent Holding**: Because services are colocated on local Docker networking, outbound HTTP calls between `order-service`, `product-service`, and `inventory-service` complete rapidly (typically 8–25 ms). At coarse sampling intervals (e.g., 500 ms), the likelihood of landing inside the 15 ms window is low.
3. **Failure Mode under Real Latency (Unobserved Hypothesis / Theoretical Failure Mode)**: In the 50M benchmark, connection pool exhaustion was NOT observed (0 pool timeouts measured across all stages in both baseline and tuned profiles). However, theoretically, if `inventory-service` or `product-service` experiences external network latency or downstream degradation (e.g. 500 ms response time), every in-flight order holds a physical PostgreSQL connection in `idle in transaction` for the duration of the HTTP delay. Under sustained concurrent requests, this could exhaust `DB_POOL_SIZE` (25) and `DB_MAX_OVERFLOW` (15), producing `QueuePool limit of size 25 overflow 15 reached, connection timed out`.

---

## 4. Architectural Recommendations (Report Only)

To prevent connection pool exhaustion without altering distributed consistency:
1. **Decouple Price/Catalog Reads from SAGA DB Transaction**: Perform `product_client.get_product()` before acquiring or opening the database transaction.
2. **Eliminate Post-Commit `db.refresh()`**: Avoid `db.refresh()` immediately after `db.commit()` when followed by outbound I/O. Use local in-memory entity properties instead of re-querying the database to begin a dormant transaction.
3. **Move Auxiliary Events to Background Tasks**: Dispatch `_send_recommendation_events` using FastAPI `BackgroundTasks` after the DB session has completed and closed.
