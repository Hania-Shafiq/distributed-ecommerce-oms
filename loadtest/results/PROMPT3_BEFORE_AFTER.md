# Query Optimization & Indexing Benchmark: Before vs After

**Test Environment**:
- **Dataset**: `orders_db` (1,000,000 orders, 1,122,589 order items)
- **Database Engine**: PostgreSQL 16 on Docker (Port 5435)
- **Host**: Intel Core i5-1335U (10 Cores, 12 Threads), 16 GB RAM, Windows 11
- **Disk Free Space**: 794 GB

---

## 1. Executive Performance Summary

| Query Description | Target Endpoint | Before Execution Time | After Execution Time | Speedup Factor | Buffer / I/O Reduction | Index Used |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Order Listing** | `GET /orders?limit=100` | **145.27 ms** | **0.61 ms** | **238x faster** | 8,466 blocks $\to$ 5 blocks | `ix_orders_created_at_desc` |
| **Orders by Status** | `GET /orders?status=CONFIRMED&limit=100` | **162.71 ms** | **0.055 ms** | **2,958x faster** | 8,466 blocks $\to$ 5 blocks | `ix_orders_status_created` / `ix_orders_created_at_desc` |
| **Orders by Product (Join)** | Order items by product join | **185.25 ms** | **9.15 ms** | **20.2x faster** | Hash Join $\to$ Index Nested Loop | `ix_order_items_order_id`, `ix_orders_created_at_desc` |
| **Order History by User** | `GET /orders?user_id=42` | **1.18 ms** | **0.19 ms** | **6.2x faster** | Sort eliminated | `ix_orders_user_created` |
| **Daily Product Rollup** | `sync_orders.py` aggregation | **2,125.52 ms** | **1,791.48 ms** | **1.19x faster** | Improved scan & join | Memory optimized |

---

## 2. Detailed Query Analysis & Plans

### 1. Order Listing (`GET /orders?limit=100`)
```sql
SELECT * FROM orders ORDER BY created_at DESC LIMIT 100;
```
- **Before**: Full table Parallel Sequential Scan over 1,000,000 rows across 2 parallel workers, followed by Gather Merge and Top-N heapsort. Read 8,466 shared memory/disk buffer pages.
  - *Execution Time*: **145.270 ms**
- **After**: Direct forward Index Scan along `ix_orders_created_at_desc` terminating immediately after reading the first 100 rows. Read only 5 buffer pages.
  - *Execution Time*: **0.610 ms** (238x speedup)

### 2. Orders Filtered by Status (`GET /orders?status=CONFIRMED&limit=100`)
```sql
SELECT * FROM orders WHERE status = 'CONFIRMED' ORDER BY created_at DESC LIMIT 100;
```
- **Before**: Parallel Sequential Scan over 1,000,000 rows filtering on `status = 'CONFIRMED'` + Top-N sort.
  - *Execution Time*: **162.708 ms**
- **After**: Index Scan utilizing `ix_orders_created_at_desc` / `ix_orders_status_created` delivering matching sorted rows directly.
  - *Execution Time*: **0.055 ms** (2,958x speedup)

### 3. Orders by Product Join
```sql
SELECT o.id, o.user_id, o.status, o.created_at, oi.quantity, oi.unit_price
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE oi.product_id = 1
ORDER BY o.created_at DESC
LIMIT 100;
```
- **Before**: Parallel Bitmap Heap Scan on `order_items` followed by Parallel Hash Join with Sequential Scan on `orders` and external Top-N sort.
  - *Execution Time*: **185.251 ms**
- **After**: Indexed Nested Loop join utilizing `ix_orders_created_at_desc` and `ix_order_items_order_id`.
  - *Execution Time*: **9.148 ms** (20.2x speedup)

### 4. Order History by User (`GET /orders?user_id=42`)
```sql
SELECT * FROM orders WHERE user_id = 42 ORDER BY created_at DESC LIMIT 100;
```
- **Before**: Single-column index scan on `ix_orders_user_id` followed by in-memory `quicksort` on `created_at DESC`.
  - *Execution Time*: **1.175 ms**
- **After**: Index scan with `ix_orders_user_created` scanning directly in sorted order.
  - *Execution Time*: **0.187 ms** (6.2x speedup)

---

## 3. Database Indexes Added (`db/indexes.sql`)

```sql
CREATE INDEX IF NOT EXISTS ix_orders_user_created
ON orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_orders_created_at_desc
ON orders (created_at DESC);

CREATE INDEX IF NOT EXISTS ix_orders_status_created
ON orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_order_items_order_id
ON order_items (order_id);

CREATE INDEX IF NOT EXISTS ix_order_items_product_order
ON order_items (product_id, order_id);
```

---

## 4. Elasticsearch Rollup Architecture

- **Previous Architecture**: Individual line items synced into Elasticsearch (`~1.12M` docs per 1M orders, projected to `~56M` docs for 50M orders).
- **New Architecture**: Pre-aggregated daily rollup documents `(day x product x category x status: units, revenue, order_count)`.
- **Result**:
  - Total Documents in Elasticsearch: **21,877 documents** (instead of 1.12M+)
  - Total Index Size: **~4.8 MB** (drastically reduced from hundreds of MBs/GBs)
  - Aggregation Query Latency: **< 15 ms**
  - Idempotent: Re-running `sync_orders.py` updates matching `_id` keys (`{order_date}_{product_id}_{status}`) without any duplicate rows.
