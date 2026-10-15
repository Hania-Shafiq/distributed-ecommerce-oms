import psycopg2

def inspect_db(name, port, db):
    conn = psycopg2.connect(host='localhost', port=port, user='postgres', password='postgres', dbname=db)
    cur = conn.cursor()
    print(f'=== {name} ({db}) ===')
    cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'")
    tables = [r[0] for r in cur.fetchall()]
    for t in tables:
        cur.execute(f"SELECT count(*) FROM {t}")
        cnt = cur.fetchone()[0]
        cur.execute(f"SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='{t}'")
        indexes = cur.fetchall()
        print(f'  Table {t}: {cnt} rows')
        for idx in indexes:
            print(f'    Index: {idx[0]} -> {idx[1]}')
        cur.execute(f"""
            SELECT conname, contype, pg_get_constraintdef(c.oid)
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            WHERE t.relname = '{t}'
        """)
        constraints = cur.fetchall()
        for con in constraints:
            print(f'    Constraint: {con[0]} ({con[1]}) -> {con[2]}')
        cur.execute(f"""
            SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public'
        """)
        seqs = [s[0] for s in cur.fetchall()]
        print(f'    Sequences in DB: {seqs}')
    conn.close()

inspect_db('users', 5433, 'users_db')
inspect_db('products', 5434, 'products_db')
inspect_db('orders', 5435, 'orders_db')
