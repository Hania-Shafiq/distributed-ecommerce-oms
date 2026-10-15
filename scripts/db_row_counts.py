import psycopg2

databases = [
    ("users_db", 5433),
    ("products_db", 5434),
    ("orders_db", 5435),
    ("inventory_db", 5436)
]

print("=" * 50)
print("DATABASE ROW COUNTS")
print("=" * 50)

for db_name, port in databases:
    try:
        conn = psycopg2.connect(
            host="localhost",
            port=port,
            user="postgres",
            password="postgres",
            dbname=db_name
        )
        cur = conn.cursor()
        cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'")
        tables = [r[0] for r in cur.fetchall()]
        print(f"Database: {db_name} (Port {port})")
        for table in sorted(tables):
            cur.execute(f"SELECT count(*) FROM {table}")
            cnt = cur.fetchone()[0]
            print(f"  - Table '{table}': {cnt} row(s)")
        conn.close()
    except Exception as e:
        print(f"Database: {db_name} (Port {port}) -> Error: {e}")

print("=" * 50)
