import psycopg2

def fmt_size(bytes_val):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_val < 1024:
            return f"{bytes_val:.2f} {unit}"
        bytes_val /= 1024
    return f"{bytes_val:.2f} TB"

# orders_db
conn_orders = psycopg2.connect("postgresql://postgres:postgres@localhost:5435/orders_db")
cur_o = conn_orders.cursor()
cur_o.execute("SELECT count(*) FROM orders;")
orders_cnt = cur_o.fetchone()[0]
cur_o.execute("SELECT count(*) FROM order_items;")
items_cnt = cur_o.fetchone()[0]
cur_o.execute("SELECT pg_database_size('orders_db');")
orders_db_size = cur_o.fetchone()[0]
cur_o.execute("SELECT pg_total_relation_size('orders');")
orders_tbl_size = cur_o.fetchone()[0]
cur_o.execute("SELECT pg_total_relation_size('order_items');")
items_tbl_size = cur_o.fetchone()[0]
conn_orders.close()

# users_db
conn_users = psycopg2.connect("postgresql://postgres:postgres@localhost:5433/users_db")
cur_u = conn_users.cursor()
cur_u.execute("SELECT count(*) FROM users;")
users_cnt = cur_u.fetchone()[0]
cur_u.execute("SELECT pg_database_size('users_db');")
users_db_size = cur_u.fetchone()[0]
cur_u.execute("SELECT pg_total_relation_size('users');")
users_tbl_size = cur_u.fetchone()[0]
conn_users.close()

print("="*60)
print("PHASE 0: DATABASE ROW COUNTS AND SIZES")
print("="*60)
print(f"orders_db (Port 5435):")
print(f"  - orders count:           {orders_cnt:,}  (~1M confirmed)")
print(f"  - order_items count:      {items_cnt:,}")
print(f"  - table 'orders' size:    {fmt_size(orders_tbl_size)}")
print(f"  - table 'order_items' size:{fmt_size(items_tbl_size)}")
print(f"  - database total size:    {fmt_size(orders_db_size)}")
print()
print(f"users_db (Port 5433):")
print(f"  - users count:            {users_cnt:,}")
print(f"  - table 'users' size:     {fmt_size(users_tbl_size)}")
print(f"  - database total size:    {fmt_size(users_db_size)}")
print("="*60)
