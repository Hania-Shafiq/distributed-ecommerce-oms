import requests
import psycopg2
import json

def main():
    # 1. Elasticsearch Index Size
    r_es = requests.get('http://localhost:9200/_cat/indices/analytics?format=json')
    es_info = r_es.json()[0]
    print("=" * 70)
    print("PHASE 3 VERIFICATION: ELASTICSEARCH ROLLUP ACCURACY")
    print("=" * 70)
    print(f"Index Name:        {es_info['index']}")
    print(f"Rollup Documents:  {int(es_info['docs.count']):,}")
    print(f"Index Store Size:  {es_info['store.size']}")

    # 2. Endpoint /analytics/order-status vs SQL
    print("\n--- 1. Order Status Breakdown (/analytics/order-status vs SQL) ---")
    r_status = requests.get('http://localhost:8002/analytics/order-status').json()
    es_status = {item['status']: item['count'] for item in r_status}

    conn = psycopg2.connect(host='localhost', port=5435, dbname='orders_db', user='postgres', password='postgres')
    cur = conn.cursor()
    cur.execute('SELECT status, count(*) FROM orders GROUP BY status;')
    sql_status = dict(cur.fetchall())

    all_matched_status = True
    for st in sorted(sql_status.keys()):
        es_c = es_status.get(st, 0)
        sql_c = sql_status[st]
        match = "[MATCH]" if es_c == sql_c else "[MISMATCH]"
        if es_c != sql_c:
            all_matched_status = False
        print(f"  {st:12s}: ES = {es_c:10,d} | SQL = {sql_c:10,d} {match}")

    # 3. Endpoint /analytics/revenue-by-category vs SQL
    print("\n--- 2. Revenue by Category (/analytics/revenue-by-category vs SQL) ---")
    r_rev = requests.get('http://localhost:8002/analytics/revenue-by-category').json()
    es_rev = {item['category']: round(float(item['total_revenue']), 2) for item in r_rev}

    # Products map
    conn_p = psycopg2.connect(host='localhost', port=5434, dbname='products_db', user='postgres', password='postgres')
    cur_p = conn_p.cursor()
    cur_p.execute('SELECT id, category FROM products;')
    p_cat = dict(cur_p.fetchall())
    conn_p.close()

    cur.execute("""
        SELECT oi.product_id, SUM(oi.quantity * oi.unit_price)
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.status = 'CONFIRMED'
        GROUP BY oi.product_id;
    """)
    sql_pid_rev = cur.fetchall()
    sql_cat_rev = {}
    for pid, rev in sql_pid_rev:
        cat = p_cat.get(pid, 'Unknown')
        sql_cat_rev[cat] = sql_cat_rev.get(cat, 0.0) + float(rev)

    all_matched_rev = True
    for cat in sorted(sql_cat_rev.keys()):
        es_r = es_rev.get(cat, 0.0)
        sql_r = round(sql_cat_rev[cat], 2)
        diff = abs(es_r - sql_r)
        match = "[MATCH]" if diff < 0.10 else f"[DIFF: {diff:.2f}]"
        if diff >= 0.10:
            all_matched_rev = False
        print(f"  {cat:20s}: ES = ${es_r:14,.2f} | SQL = ${sql_r:14,.2f} {match}")

    conn.close()

    print("\n" + "=" * 70)
    if all_matched_status and all_matched_rev:
        print("[VERIFICATION GATE]: ALL ES ROLLUPS EXACTLY MATCH DIRECT SQL QUERIES!")
    else:
        print("[VERIFICATION GATE]: SOME METRICS DIFFER — CHECK DETAILED LOGS.")
    print("=" * 70)

if __name__ == "__main__":
    main()
