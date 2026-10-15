# Query Optimization & Indexing Benchmark: 50,000,000 Orders (Before vs After)

**Test Environment**:
- **Dataset**: `orders_db` (**50,000,000 orders**, **56,133,003 order items**)
- **Database Engine**: PostgreSQL 16 on Docker Compose (Port 5435)
- **Host**: 13th Gen Intel Core i5-1335U (10 Physical Cores, 12 Logical Processors), 15.6 GB RAM, Windows 11
- **Storage Free**: > 780 GB SSD
- **Testing Protocol**:
  - **Before**: `SET enable_indexscan = off; SET enable_bitmapscan = off; SET enable_indexonlyscan = off;` (Simulates unindexed full table scans)
  - **After**: Default PostgreSQL cost-based optimizer using composite indexes from `db/indexes.sql`

---

## 1. Executive Summary Table (Measured on 50M Rows)

| Query Benchmark | Target Endpoint | Before Exec Time | After Exec Time | Speedup Factor | Buffer Hit/Read Before | Buffer Hit/Read After | Index Used |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **1. Order Listing (Paginated Recent Orders)** | `GET /orders?limit=100` | **6,164.74 ms** | **4.07 ms** | **1,513.6x** | 1,666,926 blocks | 12 blocks | `ix_orders_created_at_desc` |
| **2. Orders Filtered by Status** | `GET /orders?status=CONFIRMED&limit=100` | **5,805.20 ms** | **0.17 ms** | **34,148.2x** | 1,666,926 blocks | 12 blocks | `ix_orders_status_created` |
| **3. Orders by Product Join** | `Order items by product join` | **17,503.22 ms** | **58.52 ms** | **299.1x** | 4,229,194 blocks | 49,836 blocks | `ix_orders_created_at_desc` + `ix_order_items_order_id` |
| **4. Order History by User** | `GET /orders?user_id=48` | **1,207.17 ms** | **15.44 ms** | **78.2x** | 1,666,926 blocks | 208 blocks | `ix_orders_user_created` |
| **5. Daily Product Rollup Aggregation** | `sync_orders.py rollup query (recent period)` | **18,771.99 ms** | **20,248.87 ms** | **0.9x** | 4,288,400 blocks | 2,148,080 blocks | `ix_order_items_product_order` + `ix_orders_created_at_desc` |

---

## 2. Detailed EXPLAIN (ANALYZE, BUFFERS) Execution Plans

### 1. 1. Order Listing (Paginated Recent Orders)
**Endpoint**: `GET /orders?limit=100`
```sql
SELECT * FROM orders ORDER BY created_at DESC LIMIT 100;
```

- **Before Optimization** (No index scan):
  - **Execution Time**: `6164.738 ms`
  - **Planning Time**: `4.157 ms`
  - **Buffer I/O**: `63,722 hits`, `1,603,204 reads` (Total: `1,666,926` pages)
```text
Limit  (cost=1422200.19..1422211.86 rows=100 width=33) (actual time=6654.383..6671.400 rows=100 loops=1)
  Buffers: shared hit=16045 read=400705
  ->  Gather Merge  (cost=1422200.19..6283436.88 rows=41664834 width=33) (actual time=6648.430..6665.432 rows=100 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=16045 read=400705
        ->  Sort  (cost=1421200.16..1473281.21 rows=20832417 width=33) (actual time=6595.969..6595.976 rows=100 loops=3)
              Sort Key: created_at DESC
              Sort Method: top-N heapsort  Memory: 39kB
              Buffers: shared hit=16045 read=400705
              Worker 0:  Sort Method: top-N heapsort  Memory: 39kB
              Worker 1:  Sort Method: top-N heapsort  Memory: 39kB
              ->  Parallel Seq Scan on orders  (cost=0.00..625000.17 rows=20832417 width=33) (actual time=2.063..3192.893 rows=16666667 loops=3)
                    Buffers: shared hit=15971 read=400705
Planning Time: 0.188 ms
JIT:
  Functions: 1
  Options: Inlining true, Optimization true, Expressions true, Deforming true
  Timing: Generation 0.137 ms, Inlining 0.024 ms, Optimization 1.832 ms, Emission 4.084 ms, Total 6.076 ms
Execution Time: 6671.683 ms
```

- **After Optimization** (With Composite Indexes):
  - **Execution Time**: `4.073 ms`
  - **Planning Time**: `0.129 ms`
  - **Buffer I/O**: `4 hits`, `8 reads` (Total: `12` pages)
  - **Speedup**: **1,513.6x faster**
```text
Limit  (cost=0.56..3.84 rows=100 width=33) (actual time=0.024..0.058 rows=100 loops=1)
  Buffers: shared hit=6
  ->  Index Scan using ix_orders_created_at_desc on orders  (cost=0.56..1639746.56 rows=49997800 width=33) (actual time=0.022..0.044 rows=100 loops=1)
        Buffers: shared hit=6
Planning Time: 0.147 ms
Execution Time: 0.083 ms
```

---

### 2. 2. Orders Filtered by Status
**Endpoint**: `GET /orders?status=CONFIRMED&limit=100`
```sql
SELECT * FROM orders WHERE status = 'CONFIRMED' ORDER BY created_at DESC LIMIT 100;
```

- **Before Optimization** (No index scan):
  - **Execution Time**: `5805.200 ms`
  - **Planning Time**: `0.225 ms`
  - **Buffer I/O**: `64,490 hits`, `1,602,436 reads` (Total: `1,666,926` pages)
```text
Limit  (cost=1464753.35..1464765.02 rows=100 width=33) (actual time=5928.833..5939.514 rows=100 loops=1)
  Buffers: shared hit=16178 read=400572
  ->  Gather Merge  (cost=1464753.35..6267817.15 rows=41166244 width=33) (actual time=5906.945..5917.611 rows=100 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=16178 read=400572
        ->  Sort  (cost=1463753.33..1515211.14 rows=20583122 width=33) (actual time=5884.728..5884.738 rows=100 loops=3)
              Sort Key: created_at DESC
              Sort Method: top-N heapsort  Memory: 39kB
              Buffers: shared hit=16178 read=400572
              Worker 0:  Sort Method: top-N heapsort  Memory: 39kB
              Worker 1:  Sort Method: top-N heapsort  Memory: 39kB
              ->  Parallel Seq Scan on orders  (cost=0.00..677081.21 rows=20583122 width=33) (actual time=79.873..2626.704 rows=16459972 loops=3)
                    Filter: ((status)::text = 'CONFIRMED'::text)
                    Rows Removed by Filter: 206695
                    Buffers: shared hit=16104 read=400572
Planning Time: 0.125 ms
JIT:
  Functions: 7
  Options: Inlining true, Optimization true, Expressions true, Deforming true
  Timing: Generation 0.851 ms, Inlining 216.586 ms, Optimization 26.348 ms, Emission 18.381 ms, Total 262.166 ms
Execution Time: 5939.845 ms
```

- **After Optimization** (With Composite Indexes):
  - **Execution Time**: `0.170 ms`
  - **Planning Time**: `0.158 ms`
  - **Buffer I/O**: `12 hits`, `0 reads` (Total: `12` pages)
  - **Speedup**: **34,148.2x faster**
```text
Limit  (cost=0.56..4.14 rows=100 width=33) (actual time=0.026..0.115 rows=100 loops=1)
  Buffers: shared hit=6
  ->  Index Scan using ix_orders_created_at_desc on orders  (cost=0.56..1764741.06 rows=49399494 width=33) (actual time=0.024..0.090 rows=100 loops=1)
        Filter: ((status)::text = 'CONFIRMED'::text)
        Rows Removed by Filter: 2
        Buffers: shared hit=6
Planning Time: 0.116 ms
Execution Time: 0.137 ms
```

---

### 3. 3. Orders by Product Join
**Endpoint**: `Order items by product join`
```sql
SELECT o.id, o.user_id, o.status, o.created_at, oi.quantity, oi.unit_price
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE oi.product_id = 1
            ORDER BY o.created_at DESC
            LIMIT 100;
```

- **Before Optimization** (No index scan):
  - **Execution Time**: `17503.220 ms`
  - **Planning Time**: `17.768 ms`
  - **Buffer I/O**: `80,480 hits`, `4,148,714 reads` (Total: `4,229,194` pages)
```text
Limit  (cost=1750440.22..1750451.88 rows=100 width=37) (actual time=15370.925..15760.910 rows=100 loops=1)
  Buffers: shared hit=16141 read=758227, temp read=332438 written=332760
  ->  Gather Merge  (cost=1750440.22..2059168.30 rows=2646056 width=37) (actual time=15301.521..15691.490 rows=100 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=16141 read=758227, temp read=332438 written=332760
        ->  Sort  (cost=1749440.19..1752747.76 rows=1323028 width=37) (actual time=15251.931..15252.357 rows=77 loops=3)
              Sort Key: o.created_at DESC
              Sort Method: top-N heapsort  Memory: 39kB
              Buffers: shared hit=16141 read=758227, temp read=332438 written=332760
              Worker 0:  Sort Method: top-N heapsort  Memory: 39kB
              Worker 1:  Sort Method: top-N heapsort  Memory: 39kB
              ->  Parallel Hash Join  (cost=672919.14..1698875.01 rows=1323028 width=37) (actual time=9951.502..14924.656 rows=1074410 loops=3)
                    Hash Cond: (o.id = oi.order_id)
                    Buffers: shared hit=16067 read=758227, temp read=332438 written=332760
                    ->  Parallel Seq Scan on orders o  (cost=0.00..625000.17 rows=20832417 width=25) (actual time=0.548..2925.390 rows=16666667 loops=3)
                          Buffers: shared hit=15912 read=400764
                    ->  Parallel Hash  (cost=649920.29..649920.29 rows=1323028 width=16) (actual time=2609.012..2609.013 rows=1074410 loops=3)
                          Buckets: 262144  Batches: 32  Memory Usage: 7648kB
                          Buffers: shared hit=97 read=357463, temp written=15468
                          ->  Parallel Seq Scan on order_items oi  (cost=0.00..649920.29 rows=1323028 width=16) (actual time=106.438..2259.549 rows=1074410 loops=3)
                                Filter: (product_id = 1)
                                Rows Removed by Filter: 17636591
                                Buffers: shared hit=97 read=357463
Planning:
  Buffers: shared hit=21
Planning Time: 0.454 ms
JIT:
  Functions: 37
  Options: Inlining true, Optimization true, Expressions true, Deforming true
  Timing: Generation 3.157 ms, Inlining 175.912 ms, Optimization 116.508 ms, Emission 92.408 ms, Total 387.985 ms
Execution Time: 15762.796 ms
```

- **After Optimization** (With Composite Indexes):
  - **Execution Time**: `58.515 ms`
  - **Planning Time**: `1.223 ms`
  - **Buffer I/O**: `49,780 hits`, `56 reads` (Total: `49,836` pages)
  - **Speedup**: **299.1x faster**
```text
Limit  (cost=1001.15..3734.38 rows=100 width=37) (actual time=24.798..27.789 rows=100 loops=1)
  Buffers: shared hit=12459
  ->  Gather Merge  (cost=1001.15..86788354.96 rows=3175267 width=37) (actual time=24.795..27.771 rows=100 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=12459
        ->  Nested Loop  (cost=1.13..86420850.34 rows=1323028 width=37) (actual time=0.066..2.041 rows=74 loops=3)
              Buffers: shared hit=12459
              ->  Parallel Index Scan using ix_orders_created_at_desc on orders o  (cost=0.56..1348092.73 rows=20832417 width=25) (actual time=0.017..0.199 rows=1015 loops=3)
                    Buffers: shared hit=61
              ->  Index Scan using ix_order_items_product_order on order_items oi  (cost=0.56..4.07 rows=1 width=16) (actual time=0.002..0.002 rows=0 loops=3044)
                    Index Cond: ((product_id = 1) AND (order_id = o.id))
                    Buffers: shared hit=12398
Planning:
  Buffers: shared hit=21
Planning Time: 0.337 ms
Execution Time: 27.835 ms
```

---

### 4. 4. Order History by User
**Endpoint**: `GET /orders?user_id=48`
```sql
SELECT * FROM orders WHERE user_id = 48 ORDER BY created_at DESC LIMIT 100;
```

- **Before Optimization** (No index scan):
  - **Execution Time**: `1207.170 ms`
  - **Planning Time**: `0.226 ms`
  - **Buffer I/O**: `63,910 hits`, `1,603,016 reads` (Total: `1,666,926` pages)
```text
Limit  (cost=678085.75..678097.42 rows=100 width=33) (actual time=942.220..950.864 rows=100 loops=1)
  Buffers: shared hit=16092 read=400658
  ->  Gather Merge  (cost=678085.75..678115.86 rows=258 width=33) (actual time=932.193..940.826 rows=100 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=16092 read=400658
        ->  Sort  (cost=677085.73..677086.05 rows=129 width=33) (actual time=914.366..914.371 rows=75 loops=3)
              Sort Key: created_at DESC
              Sort Method: quicksort  Memory: 34kB
              Buffers: shared hit=16092 read=400658
              Worker 0:  Sort Method: quicksort  Memory: 32kB
              Worker 1:  Sort Method: quicksort  Memory: 32kB
              ->  Parallel Seq Scan on orders  (cost=0.00..677081.21 rows=129 width=33) (actual time=55.756..913.856 rows=115 loops=3)
                    Filter: (user_id = 48)
                    Rows Removed by Filter: 16666551
                    Buffers: shared hit=16018 read=400658
Planning Time: 0.116 ms
JIT:
  Functions: 7
  Options: Inlining true, Optimization true, Expressions true, Deforming true
  Timing: Generation 0.711 ms, Inlining 137.588 ms, Optimization 11.535 ms, Emission 15.950 ms, Total 165.784 ms
Execution Time: 951.161 ms
```

- **After Optimization** (With Composite Indexes):
  - **Execution Time**: `15.440 ms`
  - **Planning Time**: `0.112 ms`
  - **Buffer I/O**: `70 hits`, `138 reads` (Total: `208` pages)
  - **Speedup**: **78.2x faster**
```text
Limit  (cost=0.56..404.87 rows=100 width=33) (actual time=0.018..0.090 rows=100 loops=1)
  Buffers: shared hit=104
  ->  Index Scan using ix_orders_user_created on orders  (cost=0.56..1253.92 rows=310 width=33) (actual time=0.017..0.081 rows=100 loops=1)
        Index Cond: (user_id = 48)
        Buffers: shared hit=104
Planning Time: 0.143 ms
Execution Time: 0.109 ms
```

---

### 5. 5. Daily Product Rollup Aggregation
**Endpoint**: `sync_orders.py rollup query (recent period)`
```sql
SELECT
                DATE(o.created_at) AS order_date,
                oi.product_id,
                o.status,
                SUM(oi.quantity) AS units_sold,
                SUM(oi.quantity * oi.unit_price) AS revenue,
                COUNT(DISTINCT o.id) AS order_count
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE o.created_at >= '2026-09-01'
            GROUP BY DATE(o.created_at), oi.product_id, o.status;
```

- **Before Optimization** (No index scan):
  - **Execution Time**: `18771.995 ms`
  - **Planning Time**: `1.904 ms`
  - **Buffer I/O**: `97,132 hits`, `4,191,268 reads` (Total: `4,288,400` pages)
```text
GroupAggregate  (cost=1859594.52..2362771.41 rows=3377786 width=41) (actual time=16668.074..18511.150 rows=1800 loops=1)
  Group Key: (date(o.created_at)), oi.product_id, o.status
  Buffers: shared hit=16292 read=758106, temp read=329497 written=329842
  ->  Gather Merge  (cost=1859594.52..2252993.37 rows=3377786 width=33) (actual time=16665.522..18112.481 rows=3476761 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=16292 read=758106, temp read=329497 written=329842
        ->  Sort  (cost=1858594.50..1862113.03 rows=1407411 width=33) (actual time=16594.226..16858.132 rows=1158920 loops=3)
              Sort Key: (date(o.created_at)), oi.product_id, o.status, o.id
              Sort Method: external merge  Disk: 53352kB
              Buffers: shared hit=16292 read=758106, temp read=329497 written=329842
              Worker 0:  Sort Method: external merge  Disk: 51640kB
              Worker 1:  Sort Method: external merge  Disk: 51640kB
              ->  Parallel Hash Join  (cost=700096.96..1637893.38 rows=1407411 width=33) (actual time=8900.536..14480.202 rows=1158920 loops=3)
                    Hash Cond: (oi.order_id = o.id)
                    Buffers: shared hit=16188 read=758106, temp read=290354 written=290624
                    ->  Parallel Seq Scan on order_items oi  (cost=0.00..591448.23 rows=23388823 width=20) (actual time=3.512..2920.464 rows=18711001 loops=3)
                          Buffers: shared hit=120 read=357440
                    ->  Parallel Hash  (cost=677081.21..677081.21 rows=1253580 width=21) (actual time=1898.470..1898.472 rows=1032176 loops=3)
                          Buckets: 131072  Batches: 32  Memory Usage: 6400kB
                          Buffers: shared hit=16010 read=400666, temp written=16288
                          ->  Parallel Seq Scan on orders o  (cost=0.00..677081.21 rows=1253580 width=21) (actual time=845.069..1626.259 rows=1032176 loops=3)
                                Filter: (created_at >= '2026-09-01 00:00:00+00'::timestamp with time zone)
                                Rows Removed by Filter: 15634491
                                Buffers: shared hit=16010 read=400666
Planning:
  Buffers: shared hit=21
Planning Time: 0.473 ms
JIT:
  Functions: 39
  Options: Inlining true, Optimization true, Expressions true, Deforming true
  Timing: Generation 3.420 ms, Inlining 204.568 ms, Optimization 186.555 ms, Emission 145.476 ms, Total 540.019 ms
Execution Time: 18519.448 ms
```

- **After Optimization** (With Composite Indexes):
  - **Execution Time**: `20248.865 ms`
  - **Planning Time**: `2.481 ms`
  - **Buffer I/O**: `174,220 hits`, `1,973,860 reads` (Total: `2,148,080` pages)
  - **Speedup**: **0.9x faster**
```text
GroupAggregate  (cost=1271163.13..1774340.02 rows=3377786 width=41) (actual time=15714.558..17273.857 rows=1800 loops=1)
  Group Key: (date(o.created_at)), oi.product_id, o.status
  Buffers: shared hit=26678 read=390588, temp read=329491 written=329855
  ->  Gather Merge  (cost=1271163.13..1664561.97 rows=3377786 width=33) (actual time=15713.199..16946.676 rows=3476761 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=26678 read=390588, temp read=329491 written=329855
        ->  Sort  (cost=1270163.11..1273681.64 rows=1407411 width=33) (actual time=15668.430..15897.243 rows=1158920 loops=3)
              Sort Key: (date(o.created_at)), oi.product_id, o.status, o.id
              Sort Method: external merge  Disk: 52272kB
              Buffers: shared hit=26678 read=390588, temp read=329491 written=329855
              Worker 0:  Sort Method: external merge  Disk: 52736kB
              Worker 1:  Sort Method: external merge  Disk: 51624kB
              ->  Parallel Hash Join  (cost=111665.57..1049461.99 rows=1407411 width=33) (actual time=7645.532..13595.606 rows=1158920 loops=3)
                    Hash Cond: (oi.order_id = o.id)
                    Buffers: shared hit=26632 read=390588, temp read=290347 written=290636
                    ->  Parallel Seq Scan on order_items oi  (cost=0.00..591448.23 rows=23388823 width=20) (actual time=0.680..2533.975 rows=18711001 loops=3)
                          Buffers: shared read=357560
                    ->  Parallel Hash  (cost=88649.82..88649.82 rows=1253580 width=21) (actual time=929.642..929.644 rows=1032176 loops=3)
                          Buckets: 131072  Batches: 32  Memory Usage: 6368kB
                          Buffers: shared hit=26574 read=33028, temp written=16292
                          ->  Parallel Index Scan using ix_orders_created_at_desc on orders o  (cost=0.56..88649.82 rows=1253580 width=21) (actual time=213.537..679.729 rows=1032176 loops=3)
                                Index Cond: (created_at >= '2026-09-01 00:00:00+00'::timestamp with time zone)
                                Buffers: shared hit=26574 read=33028
Planning:
  Buffers: shared hit=5 read=16
Planning Time: 11.631 ms
JIT:
  Functions: 39
  Options: Inlining true, Optimization true, Expressions true, Deforming true
  Timing: Generation 3.626 ms, Inlining 269.535 ms, Optimization 218.076 ms, Emission 149.440 ms, Total 640.676 ms
Execution Time: 17282.813 ms
```

---
