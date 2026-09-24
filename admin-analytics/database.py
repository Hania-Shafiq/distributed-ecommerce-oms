# database.py
# ─────────────────────────────────────────────────────────────────────────────
# Manages the DuckDB connection and its live attachment to PostgreSQL.
#
# Architecture note — why DuckDB + postgres_scanner?
# ─────────────────────────────────────────────────────────────────────────────
# Option A  — Query PostgreSQL directly (psycopg2 / SQLAlchemy):
#   Good for transactional (OLTP) work: single-row lookups, inserts, updates.
#   Slower for analytics because Postgres is row-oriented:
#     • To compute AVG(price) it must read every row from disk, including columns
#       you don't need (name, description, etc.).
#     • Every aggregation travels over the network as raw row data.
#
# Option B  — DuckDB with postgres_scanner (what we use here):
#   DuckDB is column-oriented (OLAP-optimised):
#     • It fetches ONLY the columns it needs from PG (projection pushdown).
#     • Aggregations (SUM, AVG, COUNT, GROUP BY) run inside DuckDB's vectorised
#       execution engine — very fast even on millions of rows.
#     • No data migration needed — DuckDB reads PG tables live.
#   Perfect for read-heavy analytics dashboards like this one.
# ─────────────────────────────────────────────────────────────────────────────

import os
import duckdb
from dotenv import load_dotenv

# Load .env so os.getenv picks up our variables
load_dotenv()

# Pull the PostgreSQL DSN from the environment
PRODUCTS_DB_URL = os.getenv(
    "PRODUCTS_DB_URL",
    "postgresql://postgres:postgres@localhost:5434/products_db",
)

# Pull the low-stock threshold (cast to int; default 10)
LOW_STOCK_THRESHOLD = int(os.getenv("LOW_STOCK_THRESHOLD", "10"))


def get_duckdb_connection() -> duckdb.DuckDBPyConnection:
    """
    Create a fresh in-memory DuckDB connection with the PostgreSQL scanner
    extension loaded and products_db attached.

    Why in-memory (not a file)?
    ─────────────────────────────
    We're not storing data in DuckDB — it's purely a query engine here.
    Using an in-memory instance means:
      • No disk I/O overhead for DuckDB itself.
      • No stale cache to worry about — every call queries PostgreSQL live.
      • Each request gets its own isolated connection (thread-safe by default).

    Why not a global singleton connection?
    ───────────────────────────────────────
    DuckDB connections are NOT thread-safe for concurrent writes.
    For read-only analytics with concurrent FastAPI requests (which run in
    a thread pool), creating a lightweight connection per-request is safer
    and avoids race conditions.  Each connection is cheap — no network
    round-trip since DuckDB itself is in-process.

    DuckDB versioning note (important):
    ─────────────────────────────────────
    In DuckDB ≥ 1.0, the postgres_scanner is a first-class extension bundled
    with the package.  The ATTACH syntax uses TYPE postgres (not POSTGRES_SCANNER).
    This file targets DuckDB ≥ 1.0 (requirements.txt pins duckdb>=1.0.0).

    Steps performed:
    1. Open an in-memory DuckDB session.
    2. Install + load the 'postgres' extension (the new name in 1.x for what
       was called 'postgres_scanner' in 0.x).
    3. ATTACH the PostgreSQL database — after this, DuckDB can query PG tables
       using standard SQL as if they were local DuckDB tables under the alias
       'pg_products'.
    """
    # Step 1 — Open a fresh in-memory DuckDB connection
    con = duckdb.connect(database=":memory:")

    # Step 2 — Load the postgres extension.
    # In DuckDB 1.x the extension is named 'postgres' (not 'postgres_scanner').
    # INSTALL is idempotent — it downloads once and caches; safe to call always.
    con.execute("INSTALL postgres;")
    con.execute("LOAD postgres;")

    # Step 3 — Attach the PostgreSQL database.
    # Syntax: ATTACH '<dsn>' AS <alias> (TYPE POSTGRES, READ_ONLY)
    # After ATTACH, all PG tables are accessible as: alias.table_name
    # READ_ONLY ensures DuckDB will never attempt any writes to PostgreSQL.
    con.execute(f"""
        ATTACH '{PRODUCTS_DB_URL}'
        AS pg_products (TYPE POSTGRES, READ_ONLY);
    """)

    return con
