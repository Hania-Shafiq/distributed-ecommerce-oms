import psycopg2
import json
import time
from pathlib import Path

QUERIES = [
    {
        "name": "1. Order Listing (Paginated Recent Orders)",
        "endpoint": "GET /orders?limit=100",
        "sql": "SELECT * FROM orders ORDER BY created_at DESC LIMIT 100;",
    },
    {
        "name": "2. Orders Filtered by Status",
        "endpoint": "GET /orders?status=CONFIRMED&limit=100",
        "sql": "SELECT * FROM orders WHERE status = 'CONFIRMED' ORDER BY created_at DESC LIMIT 100;",
    },
    {
        "name": "3. Orders by Product Join",
        "endpoint": "Order items by product join",
        "sql": """
            SELECT o.id, o.user_id, o.status, o.created_at, oi.quantity, oi.unit_price
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE oi.product_id = 1
            ORDER BY o.created_at DESC
            LIMIT 100;
        """,
    },
    {
        "name": "4. Order History by User",
        "endpoint": "GET /orders?user_id=48",
        "sql": "SELECT * FROM orders WHERE user_id = 48 ORDER BY created_at DESC LIMIT 100;",
    },
    {
        "name": "5. Daily Product Rollup Aggregation",
        "endpoint": "sync_orders.py rollup query (recent period)",
        "sql": """
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
        """,
    },
]

def run_explain(cur, sql, is_before):
    if is_before:
        cur.execute("SET enable_indexscan = off;")
        cur.execute("SET enable_bitmapscan = off;")
        cur.execute("SET enable_indexonlyscan = off;")
    else:
        cur.execute("SET enable_indexscan = on;")
        cur.execute("SET enable_bitmapscan = on;")
        cur.execute("SET enable_indexonlyscan = on;")

    explain_sql = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {sql}"
    cur.execute(explain_sql)
    plan_json = cur.fetchone()[0]

    # Also get text format for detailed plan listing
    cur.execute(f"EXPLAIN (ANALYZE, BUFFERS) {sql}")
    plan_text = "\n".join(r[0] for r in cur.fetchall())

    plan_root = plan_json[0]["Plan"]
    exec_time = plan_json[0]["Execution Time"]
    plan_time = plan_json[0]["Planning Time"]

    # Recursively collect buffers
    def get_buffers(node):
        hits = node.get("Shared Hit Blocks", 0)
        reads = node.get("Shared Read Blocks", 0)
        dirtied = node.get("Shared Dirtied Blocks", 0)
        written = node.get("Shared Written Blocks", 0)
        for child in node.get("Plans", []):
            ch, cr, cd, cw = get_buffers(child)
            hits += ch
            reads += cr
            dirtied += cd
            written += cw
        return hits, reads, dirtied, written

    hits, reads, _, _ = get_buffers(plan_root)

    return {
        "exec_time_ms": exec_time,
        "plan_time_ms": plan_time,
        "shared_hit_blocks": hits,
        "shared_read_blocks": reads,
        "total_buffer_blocks": hits + reads,
        "plan_text": plan_text,
    }

def main():
    print("=" * 70)
    print("EXPLAIN (ANALYZE, BUFFERS) BENCHMARK ON 50,000,000 ORDERS DATABASE")
    print("=" * 70)

    conn = psycopg2.connect(host='localhost', port=5435, dbname='orders_db', user='postgres', password='postgres')
    conn.autocommit = True
    cur = conn.cursor()

    results = []

    for idx, q in enumerate(QUERIES, 1):
        print(f"\n[{idx}/5] Benchmarking Query: {q['name']}...")
        print(f"  Running 'BEFORE' (enable_indexscan=off, enable_bitmapscan=off)...")
        before_res = run_explain(cur, q["sql"], is_before=True)
        print(f"    Execution Time: {before_res['exec_time_ms']:.2f} ms | Buffers: {before_res['total_buffer_blocks']:,} blocks")

        print(f"  Running 'AFTER' (default planner)...")
        after_res = run_explain(cur, q["sql"], is_before=False)
        print(f"    Execution Time: {after_res['exec_time_ms']:.2f} ms | Buffers: {after_res['total_buffer_blocks']:,} blocks")

        speedup = before_res["exec_time_ms"] / after_res["exec_time_ms"] if after_res["exec_time_ms"] > 0 else 1.0
        print(f"  Speedup Factor: {speedup:.1f}x")

        results.append({
            "query": q,
            "before": before_res,
            "after": after_res,
            "speedup": speedup,
        })

    conn.close()

    # Generate Markdown Report
    out_path = Path("loadtest/results/PROMPT3_BEFORE_AFTER_50M.md")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    md = []
    md.append("# Query Optimization & Indexing Benchmark: 50,000,000 Orders (Before vs After)")
    md.append("")
    md.append("**Test Environment**:")
    md.append("- **Dataset**: `orders_db` (**50,000,000 orders**, **56,133,003 order items**)")
    md.append("- **Database Engine**: PostgreSQL 16 on Docker Compose (Port 5435)")
    md.append("- **Host**: 13th Gen Intel Core i5-1335U (10 Physical Cores, 12 Logical Processors), 15.6 GB RAM, Windows 11")
    md.append("- **Storage Free**: > 780 GB SSD")
    md.append("- **Testing Protocol**:")
    md.append("  - **Before**: `SET enable_indexscan = off; SET enable_bitmapscan = off; SET enable_indexonlyscan = off;` (Simulates unindexed full table scans)")
    md.append("  - **After**: Default PostgreSQL cost-based optimizer using composite indexes from `db/indexes.sql`")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## 1. Executive Summary Table (Measured on 50M Rows)")
    md.append("")
    md.append("| Query Benchmark | Target Endpoint | Before Exec Time | After Exec Time | Speedup Factor | Buffer Hit/Read Before | Buffer Hit/Read After | Index Used |")
    md.append("| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |")

    index_names = [
        "`ix_orders_created_at_desc`",
        "`ix_orders_status_created`",
        "`ix_orders_created_at_desc` + `ix_order_items_order_id`",
        "`ix_orders_user_created`",
        "`ix_order_items_product_order` + `ix_orders_created_at_desc`",
    ]

    for idx, r in enumerate(results):
        q = r["query"]
        b = r["before"]
        a = r["after"]
        spd = f"{r['speedup']:,.1f}x"
        idx_name = index_names[idx]
        b_bufs = f"{b['total_buffer_blocks']:,} blocks"
        a_bufs = f"{a['total_buffer_blocks']:,} blocks"
        b_time = f"{b['exec_time_ms']:,.2f} ms"
        a_time = f"{a['exec_time_ms']:,.2f} ms"
        md.append(f"| **{q['name']}** | `{q['endpoint']}` | **{b_time}** | **{a_time}** | **{spd}** | {b_bufs} | {a_bufs} | {idx_name} |")

    md.append("")
    md.append("---")
    md.append("")
    md.append("## 2. Detailed EXPLAIN (ANALYZE, BUFFERS) Execution Plans")
    md.append("")

    for idx, r in enumerate(results, 1):
        q = r["query"]
        b = r["before"]
        a = r["after"]
        md.append(f"### {idx}. {q['name']}")
        md.append(f"**Endpoint**: `{q['endpoint']}`")
        md.append("```sql")
        md.append(q["sql"].strip())
        md.append("```")
        md.append("")
        md.append(f"- **Before Optimization** (No index scan):")
        md.append(f"  - **Execution Time**: `{b['exec_time_ms']:.3f} ms`")
        md.append(f"  - **Planning Time**: `{b['plan_time_ms']:.3f} ms`")
        md.append(f"  - **Buffer I/O**: `{b['shared_hit_blocks']:,} hits`, `{b['shared_read_blocks']:,} reads` (Total: `{b['total_buffer_blocks']:,}` pages)")
        md.append("```text")
        md.append(b["plan_text"])
        md.append("```")
        md.append("")
        md.append(f"- **After Optimization** (With Composite Indexes):")
        md.append(f"  - **Execution Time**: `{a['exec_time_ms']:.3f} ms`")
        md.append(f"  - **Planning Time**: `{a['plan_time_ms']:.3f} ms`")
        md.append(f"  - **Buffer I/O**: `{a['shared_hit_blocks']:,} hits`, `{a['shared_read_blocks']:,} reads` (Total: `{a['total_buffer_blocks']:,}` pages)")
        md.append(f"  - **Speedup**: **{r['speedup']:,.1f}x faster**")
        md.append("```text")
        md.append(a["plan_text"])
        md.append("```")
        md.append("")
        md.append("---")
        md.append("")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md))

    print(f"\n[OK] Benchmark completed and report written to: {out_path}")

if __name__ == "__main__":
    main()
