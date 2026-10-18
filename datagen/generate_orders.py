#!/usr/bin/env python3
"""
generate_orders.py
──────────────────────────────────────────────────────────────────────────────
High-throughput synthetic order generation engine for Distributed OMS.
Direct bulk-loader into PostgreSQL using vectorized numpy + copy_expert.

Usage:
    python datagen/generate_orders.py 1000000
    python datagen/generate_orders.py --orders 1000000 --chunk-size 500000
──────────────────────────────────────────────────────────────────────────────
"""

import sys
import os
import io
import time
import json
import shutil
import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
FIT_REPORT_PATH = BASE_DIR / "data" / "fit_report.json"
DISTRIBUTIONS_PATH = BASE_DIR / "data" / "olist_distributions.json"
CHECKPOINT_PATH = Path(__file__).resolve().parent / ".checkpoint.json"

# ── DB Connections ────────────────────────────────────────────────────────────
DB_CONFIG = {
    "users":    {"host": "localhost", "port": 5433, "dbname": "users_db",    "user": "postgres", "password": "postgres"},
    "products": {"host": "localhost", "port": 5434, "dbname": "products_db", "user": "postgres", "password": "postgres"},
    "orders":   {"host": "localhost", "port": 5435, "dbname": "orders_db",   "user": "postgres", "password": "postgres"},
}

# Precomputed shared bcrypt hash for all synthetic accounts (cost=12)
SHARED_BCRYPT_HASH = "$2b$12$gdxb56PE57NCE0GiNngThOI7jyQqL086pAAauZj4mwoMBJ7xyt6sa"


def get_connection(db_key: str):
    cfg = DB_CONFIG[db_key]
    return psycopg2.connect(
        host=cfg["host"],
        port=cfg["port"],
        dbname=cfg["dbname"],
        user=cfg["user"],
        password=cfg["password"],
    )


def check_disk_space(n_orders: int):
    """
    Check free disk space and abort if estimated footprint > free space minus 5 GB.
    """
    total, used, free = shutil.disk_usage(str(BASE_DIR))
    free_gb = free / (1024 ** 3)

    # Footprint estimation:
    # orders: ~100 B/row, order_items: ~50 B/row (~1.14 items/order)
    # users: ~150 B/row (N/40 users), indexes + WAL + safety: ~120 B/order
    # Total ~ 350 bytes per order
    est_bytes = int(n_orders * 350 + (n_orders // 40) * 150)
    est_gb = est_bytes / (1024 ** 3)
    safety_margin_gb = 5.0
    required_gb = est_gb + safety_margin_gb

    print(f"\n[Disk Check] Total: {total/(1024**3):.2f} GB | Free: {free_gb:.2f} GB")
    print(f"[Disk Check] Estimated payload for {n_orders:,} orders: {est_gb:.2f} GB (Required with 5GB buffer: {required_gb:.2f} GB)")

    if free_gb < required_gb:
        raise RuntimeError(
            f"ABORT: Insufficient disk space! Free: {free_gb:.2f} GB, Required: {required_gb:.2f} GB "
            f"(Estimated footprint: {est_gb:.2f} GB + 5 GB safety margin)."
        )
    print("  [OK] Disk space check passed.\n")


def fetch_catalog_models():
    """
    Fetch real catalog from products_db and construct within-category Zipf weights.
    """
    print("[Catalog] Fetching products from products_db...")
    conn = get_connection("products")
    cur = conn.cursor()
    cur.execute("SELECT id, name, category, price FROM products ORDER BY id")
    rows = cur.fetchall()
    conn.close()

    if not rows:
        raise RuntimeError("No products found in products_db! Seed catalog first.")

    # Group by category
    categories_data = {}
    for pid, name, cat, price in rows:
        if cat not in categories_data:
            categories_data[cat] = {"pids": [], "prices": {}}
        categories_data[cat]["pids"].append(pid)
        categories_data[cat]["prices"][pid] = float(price)

    # Load category weights from fit_report
    with open(FIT_REPORT_PATH, "r", encoding="utf-8") as f:
        fit_report = json.load(f)

    target_cat_shares = fit_report["two_stage_sampling"]["category_shares"]
    ZIPF_S = fit_report["two_stage_sampling"]["zipf_s_used"]

    # Calculate within-category Zipf weights for each category's actual products
    category_models = {}
    ordered_categories = []
    category_weights = []

    for cat, share in target_cat_shares.items():
        if cat not in categories_data:
            continue
        pids = categories_data[cat]["pids"]
        k = len(pids)
        # Power-law weights
        ranks = np.arange(1, k + 1, dtype=float)
        w = ranks ** (-ZIPF_S)
        w = w / w.sum()

        ordered_categories.append(cat)
        category_weights.append(share)
        category_models[cat] = {
            "pids": np.array(pids, dtype=np.int32),
            "prices": categories_data[cat]["prices"],
            "weights": w,
        }

    category_weights = np.array(category_weights, dtype=float)
    category_weights /= category_weights.sum()

    print(f"  [OK] Loaded {len(rows)} products across {len(ordered_categories)} categories:")
    for cat in ordered_categories:
        print(f"    - {cat:18s}: {len(category_models[cat]['pids'])} products, share target: {target_cat_shares[cat]*100:.1f}%")

    return ordered_categories, category_weights, category_models, fit_report


def ensure_synthetic_users(target_users: int):
    """
    Ensure users_db contains at least target_users with username prefix 'syn_'.
    Uses bulk COPY for instantaneous insertion with one precomputed bcrypt hash.
    """
    print(f"\n[Users] Ensuring {target_users:,} synthetic users exist in users_db...")
    conn = get_connection("users")
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute("SELECT count(*) FROM users WHERE username LIKE 'syn_%'")
    existing_syn_count = cur.fetchone()[0]

    if existing_syn_count >= target_users:
        print(f"  [OK] Found {existing_syn_count:,} existing synthetic users. Skipping creation.")
        cur.execute(f"SELECT id FROM users WHERE username LIKE 'syn_%' ORDER BY id LIMIT {int(target_users)}")
        user_ids = [r[0] for r in cur.fetchall()]
        conn.close()
        return user_ids

    to_create = target_users - existing_syn_count
    print(f"  Existing synthetic users: {existing_syn_count:,}. Generating {to_create:,} new users...")

    # Fetch max id
    cur.execute("SELECT COALESCE(MAX(id), 0) FROM users")
    start_id = cur.fetchone()[0] + 1

    # Drop non-PK indexes for high-speed COPY
    print("  Dropping non-PK indexes on users table...")
    cur.execute("DROP INDEX IF EXISTS ix_users_username")
    cur.execute("DROP INDEX IF EXISTS ix_users_email")
    cur.execute("DROP INDEX IF EXISTS ix_users_id")
    conn.commit()

    t0 = time.time()
    buf = io.StringIO()
    for idx in range(existing_syn_count + 1, existing_syn_count + to_create + 1):
        uid = start_id + (idx - existing_syn_count - 1)
        username = f"syn_{idx:08d}"
        email = f"syn_{idx:08d}@synthetic.oms"
        # Columns: id, username, email, password_hash, role
        buf.write(f"{uid}\t{username}\t{email}\t{SHARED_BCRYPT_HASH}\tcustomer\n")

    buf.seek(0)
    cur.copy_expert("COPY users (id, username, email, password_hash, role) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t')", buf)
    conn.commit()
    dur = time.time() - t0
    print(f"  [OK] Loaded {to_create:,} users in {dur:.2f}s ({to_create/dur:,.0f} users/sec).")

    # Recreate indexes
    print("  Recreating non-PK indexes on users...")
    cur.execute("CREATE UNIQUE INDEX ix_users_username ON public.users USING btree (username)")
    cur.execute("CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email)")
    cur.execute("CREATE INDEX ix_users_id ON public.users USING btree (id)")
    cur.execute("SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users))")
    cur.execute("ANALYZE users")
    conn.commit()

    cur.execute(f"SELECT id FROM users WHERE username LIKE 'syn_%' ORDER BY id LIMIT {int(target_users)}")
    user_ids = [r[0] for r in cur.fetchall()]
    conn.close()
    return user_ids


def clear_existing_data():
    """
    Clears all existing orders and order_items from orders_db, resets sequence counters,
    and removes any existing checkpoint file so generation starts completely clean.
    """
    print("\n[Data Cleanup] Clearing existing orders and order_items from orders_db...")
    conn = get_connection("orders")
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("TRUNCATE TABLE order_items, orders RESTART IDENTITY CASCADE")
    print("  [OK] orders and order_items truncated and sequences restarted.")
    conn.close()

    if CHECKPOINT_PATH.exists():
        try:
            CHECKPOINT_PATH.unlink()
            print(f"  [OK] Removed existing checkpoint file: {CHECKPOINT_PATH}")
        except Exception as e:
            print(f"  [Warning] Failed to remove checkpoint: {e}")


def manage_orders_indexes(action: str):
    """
    Drop or recreate non-PK indexes and foreign key constraints on orders_db.
    """
    conn = get_connection("orders")
    conn.autocommit = True
    cur = conn.cursor()

    if action == "drop":
        print("\n[DB Optimizer] Dropping non-PK indexes and FK constraints on orders_db for fast COPY...")
        cur.execute("ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey")
        cur.execute("DROP INDEX IF EXISTS ix_orders_user_id")
        cur.execute("DROP INDEX IF EXISTS ix_orders_id")
        cur.execute("DROP INDEX IF EXISTS ix_orders_status")
        cur.execute("DROP INDEX IF EXISTS ix_order_items_product_id")
        cur.execute("DROP INDEX IF EXISTS ix_order_items_id")
        cur.execute("DROP INDEX IF EXISTS ix_orders_user_created")
        cur.execute("DROP INDEX IF EXISTS ix_orders_created_at_desc")
        cur.execute("DROP INDEX IF EXISTS ix_orders_status_created")
        cur.execute("DROP INDEX IF EXISTS ix_order_items_order_id")
        cur.execute("DROP INDEX IF EXISTS ix_order_items_product_order")
        print("  [OK] Non-PK indexes dropped.")

    elif action == "recreate":
        print("\n[DB Optimizer] Recreating non-PK indexes and FK constraints on orders_db...")
        t0 = time.time()
        print("  - Adding FK constraint order_items -> orders...")
        cur.execute("ALTER TABLE order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE")

        print("  - Building index ix_orders_user_id...")
        cur.execute("CREATE INDEX ix_orders_user_id ON public.orders USING btree (user_id)")

        print("  - Building index ix_orders_id...")
        cur.execute("CREATE INDEX ix_orders_id ON public.orders USING btree (id)")

        print("  - Building index ix_orders_status...")
        cur.execute("CREATE INDEX ix_orders_status ON public.orders USING btree (status)")

        print("  - Building index ix_order_items_product_id...")
        cur.execute("CREATE INDEX ix_order_items_product_id ON public.order_items USING btree (product_id)")

        print("  - Building index ix_order_items_id...")
        cur.execute("CREATE INDEX ix_order_items_id ON public.order_items USING btree (id)")

        print("  - Updating id sequences with setval...")
        cur.execute("SELECT setval('orders_id_seq', (SELECT COALESCE(MAX(id), 1) FROM orders))")
        cur.execute("SELECT setval('order_items_id_seq', (SELECT COALESCE(MAX(id), 1) FROM order_items))")

        indexes_sql_path = BASE_DIR / "db" / "indexes.sql"
        if indexes_sql_path.exists():
            print("  - Applying db/indexes.sql composite indexes...")
            with open(indexes_sql_path, "r", encoding="utf-8") as f:
                cur.execute(f.read())
            print("    [OK] Composite indexes created.")

        print("  - Running ANALYZE orders and order_items...")
        cur.execute("ANALYZE orders")
        cur.execute("ANALYZE order_items")

        dur = time.time() - t0
        print(f"  [OK] Index recreation and ANALYZE completed in {dur:.2f}s.")

    conn.close()


def generate_timestamps(n_orders: int, fit_report: dict):
    """
    Generate n_orders timestamps modulated by 24h diurnal and 7d weekday profiles,
    spanning the last 24 months (730 days) ending at current UTC time.
    """
    print(f"\n[Timestamps] Generating {n_orders:,} arrival timestamps modulated by real profiles...")
    t0 = time.time()

    hourly_profile = np.array(fit_report["arrival_profiles"]["hourly_profile"], dtype=float)
    hourly_profile /= hourly_profile.sum()

    weekday_profile = np.array(fit_report["arrival_profiles"]["weekday_profile"], dtype=float)
    weekday_profile /= weekday_profile.sum()

    end_dt = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(days=730)

    # Build 2D joint probability matrix of (day, hour)
    n_days = 730
    grid = np.zeros((n_days, 24), dtype=float)

    for d in range(n_days):
        day_date = start_dt + timedelta(days=d)
        dow = day_date.weekday()   # 0=Monday, 6=Sunday
        grid[d, :] = weekday_profile[dow] * hourly_profile

    grid_flat = grid.ravel()
    grid_flat /= grid_flat.sum()

    # Vectorized sample
    chosen_indices = np.random.choice(len(grid_flat), size=n_orders, p=grid_flat)
    sampled_days = chosen_indices // 24
    sampled_hours = chosen_indices % 24

    # Uniform intra-hour jitter
    sampled_minutes = np.random.randint(0, 60, size=n_orders)
    sampled_seconds = np.random.randint(0, 60, size=n_orders)

    # Compute epoch seconds
    base_epoch = int(start_dt.timestamp())
    epoch_offsets = (
        sampled_days.astype(np.int64) * 86400
        + sampled_hours.astype(np.int64) * 3600
        + sampled_minutes.astype(np.int64) * 60
        + sampled_seconds.astype(np.int64)
    )
    total_epoch = base_epoch + epoch_offsets

    # Sort timestamps chronologically so order IDs mirror arrival sequence
    total_epoch.sort()

    dur = time.time() - t0
    start_iso = pd.to_datetime(total_epoch[0], unit="s", utc=True)
    end_iso = pd.to_datetime(total_epoch[-1], unit="s", utc=True)
    print(f"  [OK] Generated {n_orders:,} timestamp epochs in {dur:.2f}s ({n_orders/dur:,.0f} ts/sec).")
    print(f"  Span: {start_iso} -> {end_iso}")
    return total_epoch


def allocate_user_orders(n_orders: int, user_ids: list, fit_report: dict, cap: int = 2000, mu: float = 1.0, sigma: float = 1.7):
    """
    Allocate N orders across users using a truncated lognormal distribution with a hard cap.
    - Mean: ~40 orders/user
    - Small median (~10)
    - Heavy right tail with hard cap at 2,000 orders per user
    - Top 1% of users hold < 50% of total volume (~23-25%)
    """
    u_count = len(user_ids)
    print(f"\n[User Allocation] Distributing {n_orders:,} orders across {u_count:,} users (Truncated Lognormal mu={mu}, sigma={sigma}, cap={cap})...")

    # Sample raw lognormal and clip to [1.0, cap]
    raw = np.random.lognormal(mu, sigma, size=u_count)
    clipped = np.clip(raw, 1.0, float(cap))
    proportions = clipped / clipped.sum()

    # Discrete order counts with min 1 and max cap
    order_counts = np.maximum(1, np.round(proportions * n_orders).astype(np.int64))
    order_counts = np.minimum(order_counts, cap)

    # Balance any residual diff strictly respecting the cap
    diff = n_orders - order_counts.sum()
    if diff > 0:
        eligible = np.where(order_counts < cap)[0]
        if len(eligible) > 0:
            weights = order_counts[eligible].astype(np.float64)
            w_sum = weights.sum()
            if w_sum > 0:
                weights /= w_sum
                add_counts = np.round(weights * diff).astype(np.int64)
                order_counts[eligible] += add_counts
                order_counts = np.minimum(order_counts, cap)
            diff2 = n_orders - order_counts.sum()
            if diff2 > 0:
                eligible2 = np.where(order_counts < cap)[0]
                order_counts[eligible2[:diff2]] += 1
            elif diff2 < 0:
                eligible2 = np.where(order_counts > 1)[0]
                order_counts[eligible2[:-diff2]] -= 1
    elif diff < 0:
        eligible = np.where(order_counts > 1)[0]
        order_counts[eligible[:-diff]] -= 1

    # Ensure exact sum matches n_orders
    actual_sum = order_counts.sum()
    if actual_sum != n_orders:
        gap = n_orders - actual_sum
        if gap > 0:
            eligible = np.where(order_counts < cap)[0]
            order_counts[eligible[:gap]] += 1
        else:
            eligible = np.where(order_counts > 1)[0]
            order_counts[eligible[:-gap]] -= 1

    top_1pct_n = max(1, int(u_count * 0.01))
    sorted_desc = np.sort(order_counts)[::-1]
    top_1pct_share = (sorted_desc[:top_1pct_n].sum() / n_orders) * 100.0

    print(f"  [OK] Allocated {len(order_counts):,} users for {order_counts.sum():,} orders.")
    print(f"  Mean: {order_counts.mean():.2f} (Target ~40.0) | Median: {np.median(order_counts):.1f}")
    print(f"  p90: {np.percentile(order_counts, 90):.1f} | p99: {np.percentile(order_counts, 99):.1f} | Max: {order_counts.max():,} (Cap: {cap})")
    print(f"  Top 1% ({top_1pct_n:,} users) Share: {top_1pct_share:.2f}% (Limit <= 50%)")

    # Flatten user assignment
    assigned_users = np.repeat(np.array(user_ids, dtype=np.int32), order_counts)
    np.random.shuffle(assigned_users)
    return assigned_users


def load_checkpoint():
    if CHECKPOINT_PATH.exists():
        try:
            with open(CHECKPOINT_PATH, "r") as f:
                return json.load(f)
        except Exception:
            return None
    return None


def save_checkpoint(state: dict):
    with open(CHECKPOINT_PATH, "w") as f:
        json.dump(state, f, indent=2)


def prevent_sleep():
    """Prevent Windows host from entering sleep state during bulk generation."""
    try:
        import ctypes
        ES_CONTINUOUS = 0x80000000
        ES_SYSTEM_REQUIRED = 0x00000001
        ES_AWAYMODE_REQUIRED = 0x00000040
        ctypes.windll.kernel32.SetThreadExecutionState(
            ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED
        )
        print("[OS Power] Sleep prevention enabled via SetThreadExecutionState.")
    except Exception as e:
        print(f"[OS Power] Note: Sleep prevention could not be set: {e}")


def run_bulk_load(n_orders: int, chunk_size: int = 500_000, clear: bool = False):
    """
    Main orchestrator for generating and bulk-loading synthetic data.
    """
    prevent_sleep()
    start_time = time.time()
    print("=" * 78)
    print(f"OMS SYNTHETIC DATA GENERATOR — N = {n_orders:,} ORDERS")
    print("=" * 78)

    if clear:
        clear_existing_data()

    check_disk_space(n_orders)

    # 1. Fetch catalog & models
    ordered_categories, cat_weights, cat_models, fit_report = fetch_catalog_models()

    # 2. Synthetic users (~ N / 40)
    target_users = max(100, n_orders // 40)
    user_ids = ensure_synthetic_users(target_users)

    # Check for existing checkpoint
    checkpoint = load_checkpoint()
    already_loaded = 0
    if checkpoint and checkpoint.get("target_n") == n_orders and not checkpoint.get("completed", False):
        already_loaded = checkpoint.get("orders_loaded", 0)
        print(f"\n[Checkpoint] Found existing checkpoint: {already_loaded:,} orders previously loaded.")

    if already_loaded >= n_orders:
        print("[Checkpoint] Target orders already fully loaded according to checkpoint.")
        verify_database(n_orders, cat_models, start_time)
        return

    # 3. Fetch starting IDs in orders_db
    conn = get_connection("orders")
    cur = conn.cursor()
    cur.execute("SELECT COALESCE(MAX(id), 0) FROM orders")
    current_order_id = cur.fetchone()[0]
    cur.execute("SELECT COALESCE(MAX(id), 0) FROM order_items")
    current_item_id = cur.fetchone()[0]
    conn.close()

    print(f"\n[Current DB State] orders max id: {current_order_id:,} | order_items max id: {current_item_id:,}")

    # 4. Generate user assignment & timestamps
    assigned_users = allocate_user_orders(n_orders, user_ids, fit_report)
    total_epochs = generate_timestamps(n_orders, fit_report)

    # 5. Model distributions
    # Items per order: [1, 2, 3] with weights [0.9006, 0.0762, 0.0232]
    items_per_order_choices = np.array([1, 2, 3], dtype=np.int32)
    items_per_order_weights = np.array([0.9006, 0.0762, 0.0232], dtype=float)
    items_per_order_weights /= items_per_order_weights.sum()

    # Quantity per line: [1, 2, 3] with weights [0.9308, 0.0525, 0.0167]
    qty_choices = np.array([1, 2, 3], dtype=np.int32)
    qty_weights = np.array([0.9308, 0.0525, 0.0167], dtype=float)
    qty_weights /= qty_weights.sum()

    # Status: CONFIRMED (0.9876), FAILED (0.0124)
    status_choices = ["CONFIRMED", "FAILED"]
    status_weights = np.array([0.9876, 0.0124], dtype=float)
    status_weights /= status_weights.sum()

    # 6. Drop non-PK indexes before bulk load
    manage_orders_indexes("drop")

    # 7. Chunked generation and COPY
    remaining_orders = n_orders - already_loaded
    chunks = int(np.ceil(remaining_orders / chunk_size))
    total_items_loaded = checkpoint.get("items_loaded", 0) if checkpoint else 0

    print(f"\n[Bulk Load] Beginning COPY loading in {chunks} chunk(s) of max {chunk_size:,} orders...")

    orders_conn = get_connection("orders")
    orders_conn.autocommit = False
    orders_cur = orders_conn.cursor()

    load_t0 = time.time()

    for chunk_idx in range(chunks):
        c_start = already_loaded + chunk_idx * chunk_size
        c_end = min(n_orders, c_start + chunk_size)
        c_len = c_end - c_start

        c_time0 = time.time()
        print(f"\n  Generating Chunk {chunk_idx + 1}/{chunks} (Orders {c_start + 1:,} to {c_end:,})...")

        # Vectorized draws for this chunk
        c_items_count = np.random.choice(items_per_order_choices, size=c_len, p=items_per_order_weights)
        c_statuses = np.random.choice(status_choices, size=c_len, p=status_weights)
        chunk_total_items = int(c_items_count.sum())

        # Vectorized line-item attributes
        all_chosen_cats = np.random.choice(len(ordered_categories), size=chunk_total_items, p=cat_weights)
        all_chosen_qtys = np.random.choice(qty_choices, size=chunk_total_items, p=qty_weights)

        # Pre-allocate product_id and price arrays
        chunk_pids = np.zeros(chunk_total_items, dtype=np.int32)
        chunk_prices = np.zeros(chunk_total_items, dtype=np.float32)

        for c_i, cat_name in enumerate(ordered_categories):
            idx_in_chunk = np.where(all_chosen_cats == c_i)[0]
            if len(idx_in_chunk) == 0:
                continue
            cat_model = cat_models[cat_name]
            chosen_sub_pids = np.random.choice(cat_model["pids"], size=len(idx_in_chunk), p=cat_model["weights"])
            chunk_pids[idx_in_chunk] = chosen_sub_pids
            # Map prices
            chunk_prices[idx_in_chunk] = [cat_model["prices"][pid] for pid in chosen_sub_pids]

        # Cumulative item offsets per order
        item_offsets = np.zeros(c_len + 1, dtype=np.int64)
        np.cumsum(c_items_count, out=item_offsets[1:])

        # Convert chunk timestamps to ISO strings
        chunk_timestamps = pd.to_datetime(total_epochs[c_start:c_end], unit="s", utc=True).astype(str).values

        # Buffers for COPY
        orders_buf = io.StringIO()
        items_buf = io.StringIO()

        for i in range(c_len):
            current_order_id += 1
            oid = current_order_id
            uid = int(assigned_users[c_start + i])
            st = c_statuses[i]
            ts = chunk_timestamps[i]

            s_idx = item_offsets[i]
            e_idx = item_offsets[i + 1]

            order_total = 0.0
            for j in range(s_idx, e_idx):
                current_item_id += 1
                q = int(all_chosen_qtys[j])
                p = float(chunk_prices[j])
                order_total += q * p
                items_buf.write(f"{current_item_id}\t{oid}\t{chunk_pids[j]}\t{q}\t{p:.2f}\n")

            orders_buf.write(f"{oid}\t{uid}\t{order_total:.2f}\t{st}\t{ts}\n")

        # COPY into orders
        orders_buf.seek(0)
        orders_cur.copy_expert("COPY orders (id, user_id, total_amount, status, created_at) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t')", orders_buf)

        # COPY into order_items
        items_buf.seek(0)
        orders_cur.copy_expert("COPY order_items (id, order_id, product_id, quantity, unit_price) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t')", items_buf)

        orders_conn.commit()

        total_items_loaded += chunk_total_items
        chunk_dur = time.time() - c_time0
        total_dur = time.time() - load_t0
        orders_so_far = c_end

        orders_rate = orders_so_far / total_dur
        items_rate = total_items_loaded / total_dur
        remaining_sec = (n_orders - orders_so_far) / orders_rate if orders_rate > 0 else 0

        print(f"  [Chunk {chunk_idx + 1} Done] Inserted {c_len:,} orders, {chunk_total_items:,} items in {chunk_dur:.2f}s.")
        print(f"  [Progress] {orders_so_far:,}/{n_orders:,} orders ({orders_so_far/n_orders*100:.1f}%) | "
              f"Rate: {orders_rate:,.0f} orders/s, {items_rate:,.0f} items/s | ETA: {remaining_sec:.1f}s")

        # Save checkpoint
        save_checkpoint({
            "target_n": n_orders,
            "orders_loaded": orders_so_far,
            "items_loaded": total_items_loaded,
            "last_order_id": current_order_id,
            "last_item_id": current_item_id,
            "completed": orders_so_far == n_orders,
        })

    orders_conn.close()

    # 8. Recreate indexes, foreign keys, set sequences, ANALYZE
    manage_orders_indexes("recreate")

    # Mark checkpoint complete
    save_checkpoint({
        "target_n": n_orders,
        "orders_loaded": n_orders,
        "items_loaded": total_items_loaded,
        "last_order_id": current_order_id,
        "last_item_id": current_item_id,
        "completed": True,
    })

    # 9. Final Verification & Extrapolation
    verify_database(n_orders, cat_models, start_time)


def verify_database(n_orders: int, cat_models: dict, start_time: float):
    """
    Run full verification checks against orders_db and extrapolate to 50M.
    """
    total_duration = time.time() - start_time
    print("\n" + "=" * 78)
    print("VERIFICATION & ACCURACY AUDIT")
    print("=" * 78)

    conn = get_connection("orders")
    cur = conn.cursor()

    # 1. Total row counts
    cur.execute("SELECT count(*) FROM orders")
    total_orders = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM order_items")
    total_items = cur.fetchone()[0]

    print(f"\n1. Row Counts:")
    print(f"   Total Orders in DB:      {total_orders:,}")
    print(f"   Total Order Items in DB: {total_items:,}")
    print(f"   Mean Items / Order:      {total_items / total_orders:.4f} (Fit report target: 1.1417)")

    # 2. Date Range
    cur.execute("SELECT MIN(created_at), MAX(created_at) FROM orders")
    min_date, max_date = cur.fetchone()
    print(f"\n2. Date Range:")
    print(f"   Min Timestamp: {min_date}")
    print(f"   Max Timestamp: {max_date}")

    # 3. Status Split
    cur.execute("SELECT status, count(*), round(count(*) * 100.0 / (SELECT count(*) FROM orders), 2) FROM orders GROUP BY status")
    status_rows = cur.fetchall()
    print(f"\n3. Status Split (Target: CONFIRMED 98.76%, FAILED 1.24%):")
    for st, cnt, pct in status_rows:
        print(f"   {st:12s}: {cnt:10,d} orders ({pct:5.2f}%)")

    # 4. Category Shares
    cur.execute("SELECT product_id, count(*) FROM order_items GROUP BY product_id")
    pid_counts = dict(cur.fetchall())

    cat_counts = {}
    for cat, model in cat_models.items():
        cat_counts[cat] = sum(pid_counts.get(pid, 0) for pid in model["pids"])

    print(f"\n4. Category Shares vs Fit Report Targets:")
    target_shares = {
        "Accessories": 28.30,
        "Furniture": 21.82,
        "Sports & Outdoors": 20.74,
        "Electronics": 17.94,
        "Kitchen": 11.20,
    }
    for cat, target_pct in target_shares.items():
        actual_pct = (cat_counts.get(cat, 0) / total_items) * 100
        delta = actual_pct - target_pct
        status_ok = "[OK]" if abs(delta) < 1.0 else "[CHECK]"
        print(f"   {cat:20s}: {actual_pct:5.2f}% (Target: {target_pct:5.2f}% | Delta: {delta:+5.2f}%) {status_ok}")

    # 5. Orders Per User Distribution
    cur.execute("""
        SELECT
            min(cnt),
            percentile_cont(0.50) WITHIN GROUP (ORDER BY cnt),
            percentile_cont(0.90) WITHIN GROUP (ORDER BY cnt),
            percentile_cont(0.99) WITHIN GROUP (ORDER BY cnt),
            max(cnt),
            avg(cnt),
            count(*)
        FROM (SELECT user_id, count(*) as cnt FROM orders GROUP BY user_id) u
    """)
    u_min, u_med, u_p90, u_p99, u_max, u_avg, u_total = cur.fetchone()

    top_1pct_limit = max(1, int(u_total * 0.01))
    cur.execute(f"""
        SELECT sum(cnt) FROM (
            SELECT count(*) as cnt FROM orders GROUP BY user_id ORDER BY cnt DESC LIMIT {top_1pct_limit}
        ) top_users
    """)
    top_1pct_orders = int(cur.fetchone()[0] or 0)
    top_1pct_share = (float(top_1pct_orders) / total_orders) * 100.0 if total_orders > 0 else 0.0

    print(f"\n5. Orders Per User Distribution (Target Mean: ~40.0):")
    print(f"   Users with orders: {u_total:,}")
    print(f"   Min:               {u_min}")
    print(f"   Median:            {u_med:.1f}")
    print(f"   p90:               {u_p90:.1f}")
    print(f"   p99:               {u_p99:.1f}")
    print(f"   Max:               {u_max}")
    print(f"   Mean:              {u_avg:.2f}")
    print(f"   Top 1% Users ({top_1pct_limit:,}): {top_1pct_orders:,} orders ({top_1pct_share:.2f}%)")

    # 6. Table & Index Sizes
    cur.execute("""
        SELECT
            relname,
            pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
            pg_size_pretty(pg_relation_size(c.oid)) as table_size,
            pg_size_pretty(pg_indexes_size(c.oid)) as index_size,
            pg_total_relation_size(c.oid) as total_bytes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND relname IN ('orders', 'order_items')
        ORDER BY relname
    """)
    size_rows = cur.fetchall()

    print(f"\n6. Storage Footprint (orders_db):")
    total_db_bytes = 0
    for relname, total_s, tbl_s, idx_s, raw_b in size_rows:
        total_db_bytes += raw_b
        print(f"   {relname:14s}: Total={total_s:10s} (Table={tbl_s:8s} | Indexes={idx_s:8s})")
    print(f"   Combined Footprint: {total_db_bytes / (1024**2):.2f} MB ({total_db_bytes / (1024**3):.3f} GB)")

    conn.close()

    # 7. Extrapolation to 50M Orders
    scale_factor = 50_000_000 / n_orders
    extrapolated_bytes = total_db_bytes * scale_factor
    extrapolated_gb = extrapolated_bytes / (1024 ** 3)
    extrapolated_sec = total_duration * scale_factor
    extrapolated_min = extrapolated_sec / 60

    print("\n" + "=" * 78)
    print("50,000,000 ORDERS SCALE-UP EXTRAPOLATION")
    print("=" * 78)
    print(f"  Benchmark Run:        {n_orders:,} orders in {total_duration:.2f}s ({n_orders/total_duration:,.0f} orders/s)")
    print(f"  Scale Factor:         {scale_factor:.1f}x")
    print(f"  Extrapolated Time:    {extrapolated_sec:.1f} seconds (~{extrapolated_min:.2f} minutes)")
    print(f"  Extrapolated Storage: {extrapolated_gb:.2f} GB (orders + order_items + indexes)")
    print(f"  Extrapolated Users:   1,250,000 users (~190 MB in users_db)")
    print("=" * 78 + "\n")


class TeeLogger:
    def __init__(self, log_path: Path):
        self.terminal = sys.stdout
        self.log_path = log_path
        self.log_file = open(log_path, "a", encoding="utf-8", buffering=1)

    def write(self, message):
        self.terminal.write(message)
        self.terminal.flush()
        try:
            self.log_file.write(message)
            self.log_file.flush()
        except Exception:
            pass

    def flush(self):
        self.terminal.flush()
        try:
            self.log_file.flush()
        except Exception:
            pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Synthetic Order Generator for Distributed OMS")
    parser.add_argument("orders", nargs="?", type=int, default=1_000_000, help="Number of orders to generate (default: 1,000,000)")
    parser.add_argument("--orders", "-n", dest="orders_opt", type=int, help="Alternative flag for order count")
    parser.add_argument("--chunk-size", "-c", type=int, default=500_000, help="Chunk size for COPY batching (default: 500,000)")
    parser.add_argument("--clear", action="store_true", help="Truncate orders and order_items tables before generating")
    parser.add_argument("--log-file", type=str, default="generate_orders_50M.log", help="Log file path in datagen/ directory")
    args = parser.parse_args()

    log_path = Path(__file__).resolve().parent / args.log_file
    if args.clear and log_path.exists():
        try:
            log_path.unlink()
        except Exception:
            pass
    sys.stdout = TeeLogger(log_path)

    n = args.orders_opt if args.orders_opt is not None else args.orders
    run_bulk_load(n, chunk_size=args.chunk_size, clear=args.clear)
