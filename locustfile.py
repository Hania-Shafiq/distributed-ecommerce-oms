"""
locustfile.py
─────────────────────────────────────────────────────────────────────────────
Distributed E-Commerce Order Management System (OMS) Load Testing Suite

Distribution parameters calibrated from the Olist Brazilian E-Commerce
dataset (99,441 real orders) — see data/fit_and_validate.py and
data/fit_report.json for methodology and goodness-of-fit validation.

Key real-data findings applied:
  • Product selection: Two-stage sampling (Category chosen by Olist proportions,
    then product chosen by within-category Zipf rank s=0.8387). Resolves
    the category volume vs popularity skew conflict.
  • Distinct products in Olist: 32,951 verified (corrected from previous claim of 73,178).
  • Items per order: 90.1% single-item, 7.6% two-item, 2.3% three+
  • Quantity per line: 93.1% qty=1, 5.3% qty=2, 1.6% qty≥3
  • Order status (mapped & folded): CONFIRMED=98.8%, FAILED=1.2%
  • Orders per user: 96.9% one-time buyers, 3.1% repeat
  • Category catalog slots: Accessories=9 (28.3%), Furniture=7 (21.8%),
    Sports & Outdoors=7 (20.7%), Electronics=6 (17.9%), Kitchen=4 (11.2%)

User classes (select by class name, not tags):
  ReadHeavyUser  → Scenario A: read-heavy mix
  SignupRaceUser → Scenario B: concurrent same-username signup race
  LastUnitUser   → Scenario C: last-unit stock race
  RampUser       → Scenario D: read-heavy + ~10% real order flows

Usage:
  Smoke:    python -m locust -f locustfile.py --headless -u 1 -r 1 -t 30s --class-picker ReadHeavyUser
  Ramp:     python -m locust -f locustfile.py --headless -u 100 -r 10 -t 2m ReadHeavyUser
  Scenario B/C: managed by run_loadtest.py
─────────────────────────────────────────────────────────────────────────────
"""

import sys
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import json
import os
import random
import threading
import time
import uuid
from pathlib import Path

import psycopg2
import psycopg2.extras
from locust import HttpUser, task, between, constant, events

try:
    from loadtest.preauth_pool import get_preauth_pool
except ImportError:
    try:
        from preauth_pool import get_preauth_pool
    except ImportError:
        def get_preauth_pool(target_size=200):
            p_file = Path(os.getenv("PREAUTH_POOL_FILE", "loadtest/cached_auth_tokens.json")).resolve()
            if p_file.exists():
                try:
                    with open(p_file, "r", encoding="utf-8") as f:
                        return json.load(f)
                except Exception:
                    pass
            return []

# ─────────────────────────────────────────────────────────────────────────────
# SERVICE URLS  (override BASE_IP via env var)
# ─────────────────────────────────────────────────────────────────────────────
BASE_IP = os.getenv("BASE_IP", "localhost")

USER_SVC           = f"http://{BASE_IP}:8001"
ANALYTICS_SVC      = f"http://{BASE_IP}:8002"
INVENTORY_SVC      = f"http://{BASE_IP}:8003"
ORDER_SVC          = f"http://{BASE_IP}:8004"
RECOMMENDATION_SVC = f"http://{BASE_IP}:8005"
PRODUCT_SVC        = f"http://{BASE_IP}:8006"

# ─────────────────────────────────────────────────────────────────────────────
# DB CONFIG (used only at worker startup to seed real IDs)
# ─────────────────────────────────────────────────────────────────────────────
PRODUCTS_DSN = {
    "host": BASE_IP, "port": 5434,
    "dbname": "products_db", "user": "postgres", "password": "postgres",
}
USERS_DSN = {
    "host": BASE_IP, "port": 5433,
    "dbname": "users_db", "user": "postgres", "password": "postgres",
}
ORDERS_DSN = {
    "host": BASE_IP, "port": 5435,
    "dbname": "orders_db", "user": "postgres", "password": "postgres",
}
INVENTORY_DSN = {
    "host": BASE_IP, "port": 5436,
    "dbname": "inventory_db", "user": "postgres", "password": "postgres",
}

# ─────────────────────────────────────────────────────────────────────────────
# OLIST-CALIBRATED DISTRIBUTION PARAMETERS
# ─────────────────────────────────────────────────────────────────────────────
ITEMS_PER_ORDER_CHOICES = [1, 2, 3]
ITEMS_PER_ORDER_WEIGHTS = [0.9006, 0.0762, 0.0232]

QTY_PER_LINE_CHOICES = [1, 2, 3]
QTY_PER_LINE_WEIGHTS = [0.9308, 0.0525, 0.0167]

CATEGORY_CHOICES = ["Electronics", "Furniture", "Kitchen", "Sports & Outdoors", "Accessories"]
CATEGORY_WEIGHTS = [0.1794, 0.2182, 0.1120, 0.2074, 0.2830]

CATEGORY_PRODUCT_RANGES = {
    "Electronics":       list(range(1, 7)),
    "Furniture":         list(range(7, 14)),
    "Kitchen":           list(range(14, 18)),
    "Sports & Outdoors": list(range(18, 25)),
    "Accessories":       list(range(25, 34)),
}

PER_CATEGORY_ZIPF_WEIGHTS = {
    "Electronics":       [0.363431, 0.203212, 0.144631, 0.113625, 0.094231, 0.08087],
    "Furniture":         [0.339318, 0.189729, 0.135035, 0.106086, 0.087979, 0.075504, 0.066347],
    "Kitchen":           [0.440577, 0.246347, 0.175332, 0.137744],
    "Sports & Outdoors": [0.339318, 0.189729, 0.135035, 0.106086, 0.087979, 0.075504, 0.066347],
    "Accessories":       [0.304853, 0.170458, 0.121319, 0.095311, 0.079043, 0.067835, 0.059608, 0.053293, 0.04828],
}

SEARCH_TERMS_EXACT = [
    "chair", "keyboard", "mouse", "desk", "headphone", "monitor",
    "gaming", "laptop", "water bottle", "yoga", "running",
    "wallet", "speaker", "kettle",
]
SEARCH_TERMS_TYPO = [
    "chiar", "keybord", "mous", "deks", "headphon", "moniitor",
    "gmaing", "latop", "waetr btotle", "yogaa", "runnig",
    "wallte", "speker", "ketttle",
]

# ─────────────────────────────────────────────────────────────────────────────
# GLOBAL SHARED STATE — seeded once from real DB at startup
# ─────────────────────────────────────────────────────────────────────────────
_seed_lock = threading.Lock()
_seed_done = False

# Real product IDs from products_db, keyed by category
_real_product_ids_by_cat: dict[str, list[int]] = {}
_all_real_product_ids: list[int] = []

# Sample of real user IDs from users_db (syn_ users)
_real_user_ids: list[int] = []

# Test accounts (created via signup API with known password) for auth tasks
_test_accounts: list[dict] = []   # [{"username": .., "password": .., "user_id": ..}]
_accounts_lock = threading.Lock()

# Outcome counters for scenarios B and C
_b_counters: dict = {"success": 0, "duplicate": 0, "other": 0}
_b_lock = threading.Lock()
_c_counters: dict = {"success": 0, "failure": 0, "other": 0}
_c_lock = threading.Lock()

# Where to write outcome JSON (set by quitting event listener)
_outcome_dir: str = os.getenv("LOCUST_OUTCOME_DIR", "loadtest/results/50M")


def _db_seed():
    """Fetch real product IDs and a sample of real user IDs from the DBs."""
    global _seed_done, _real_product_ids_by_cat, _all_real_product_ids, _real_user_ids

    with _seed_lock:
        if _seed_done:
            return
        try:
            # Products
            conn = psycopg2.connect(**PRODUCTS_DSN, cursor_factory=psycopg2.extras.RealDictCursor)
            with conn.cursor() as cur:
                cur.execute("SELECT id, category FROM products ORDER BY id;")
                rows = cur.fetchall()
            conn.close()

            for row in rows:
                cat = row["category"]
                pid = row["id"]
                _real_product_ids_by_cat.setdefault(cat, []).append(pid)
                _all_real_product_ids.append(pid)

        except Exception as e:
            print(f"[SEED] Products DB error: {e}. Using fallback IDs 1-33.")
            for cat, pids in CATEGORY_PRODUCT_RANGES.items():
                _real_product_ids_by_cat[cat] = list(pids)
            _all_real_product_ids = list(range(1, 34))

        try:
            # Users — sample up to 5000 syn_ users for order-history tasks
            conn = psycopg2.connect(**USERS_DSN, cursor_factory=psycopg2.extras.RealDictCursor)
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM users WHERE username LIKE 'syn_%' "
                    "ORDER BY random() LIMIT 5000;"
                )
                rows = cur.fetchall()
            conn.close()
            _real_user_ids = [r["id"] for r in rows]
        except Exception as e:
            print(f"[SEED] Users DB error: {e}. User IDs will be empty.")
            _real_user_ids = []

        _seed_done = True
        print(f"[SEED] Products: {len(_all_real_product_ids)} ids across {len(_real_product_ids_by_cat)} categories.")
        print(f"[SEED] Users sample: {len(_real_user_ids)} ids.")


def _pick_product_id() -> int:
    """Two-stage Olist-calibrated product selection."""
    cat = random.choices(CATEGORY_CHOICES, weights=CATEGORY_WEIGHTS, k=1)[0]
    cat_pids = _real_product_ids_by_cat.get(cat) or CATEGORY_PRODUCT_RANGES[cat]
    cat_w = PER_CATEGORY_ZIPF_WEIGHTS[cat]
    n = min(len(cat_pids), len(cat_w))
    return random.choices(cat_pids[:n], weights=cat_w[:n], k=1)[0]


def _build_order_items() -> list[dict]:
    """Build a realistic order payload using Olist-calibrated distributions."""
    n_items = random.choices(ITEMS_PER_ORDER_CHOICES, weights=ITEMS_PER_ORDER_WEIGHTS, k=1)[0]
    chosen = []
    attempts = 0
    while len(chosen) < n_items and attempts < n_items * 6:
        attempts += 1
        pid = _pick_product_id()
        if pid not in chosen:
            chosen.append(pid)
    if not chosen:
        chosen = [_all_real_product_ids[0] if _all_real_product_ids else 1]
    return [
        {"product_id": pid, "quantity": random.choices(QTY_PER_LINE_CHOICES, weights=QTY_PER_LINE_WEIGHTS, k=1)[0]}
        for pid in chosen
    ]


def _get_random_user_id() -> int:
    if _real_user_ids:
        return random.choice(_real_user_ids)
    return random.randint(1, 25000)


def _get_test_account() -> dict | None:
    with _accounts_lock:
        if _test_accounts:
            return random.choice(_test_accounts)
    return None


def _get_preauth_user() -> dict:
    """Return a pre-authenticated account from the pool (200 cached accounts)."""
    pool = get_preauth_pool(200)
    if pool:
        return random.choice(pool)
    uid = _get_random_user_id()
    return {"user_id": uid, "username": f"user_{uid}", "token": "", "headers": {}}


# ─────────────────────────────────────────────────────────────────────────────
# QUITTING LISTENER — write outcome JSON for B & C
# ─────────────────────────────────────────────────────────────────────────────
@events.quitting.add_listener
def _on_quit(environment, **kwargs):
    out_dir = Path(_outcome_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    b_file = out_dir / "scenario_B_counters.json"
    c_file = out_dir / "scenario_C_counters.json"

    with open(b_file, "w") as f:
        json.dump(_b_counters, f, indent=2)
    with open(c_file, "w") as f:
        json.dump(_c_counters, f, indent=2)

    print(f"[QUIT] B counters written to {b_file}")
    print(f"[QUIT] C counters written to {c_file}")


# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO A — ReadHeavyUser
# Read-heavy mix: search (exact + typo), category browse, order history, analytics
# ─────────────────────────────────────────────────────────────────────────────
class ReadHeavyUser(HttpUser):
    """
    Scenario A: Read-heavy mix.
    Tasks: product search (exact + typo), browse by category,
           paginated order history (real syn_ user IDs), admin analytics.
    """
    wait_time = between(1, 3)
    host = PRODUCT_SVC   # default; tasks use explicit base URLs

    def on_start(self):
        _db_seed()
        self.cached_product_ids = list(_all_real_product_ids) or [1, 2, 3]

    @task(5)
    def list_products(self):
        skip  = random.choices([0, 10, 20, 30], weights=[0.60, 0.20, 0.12, 0.08], k=1)[0]
        limit = random.choice([10, 20, 50])
        with self.client.get(
            f"{PRODUCT_SVC}/products?skip={skip}&limit={limit}",
            name="GET /products",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and data:
                    self.cached_product_ids = [p["id"] for p in data if "id" in p]
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"5xx {resp.status_code}")

    @task(3)
    def search_exact(self):
        q = random.choice(SEARCH_TERMS_EXACT)
        with self.client.get(
            f"{PRODUCT_SVC}/products/search?q={q}",
            name="GET /products/search (exact)",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"5xx {resp.status_code}")

    @task(2)
    def search_typo(self):
        q = random.choice(SEARCH_TERMS_TYPO)
        with self.client.get(
            f"{PRODUCT_SVC}/products/search?q={q}",
            name="GET /products/search (typo)",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"5xx {resp.status_code}")

    @task(3)
    def browse_by_category(self):
        cat = random.choices(CATEGORY_CHOICES, weights=CATEGORY_WEIGHTS, k=1)[0]
        with self.client.get(
            f"{PRODUCT_SVC}/products?category={cat}&limit=20",
            name="GET /products?category",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"5xx {resp.status_code}")

    @task(2)
    def order_history(self):
        uid = _get_random_user_id()
        with self.client.get(
            f"{ORDER_SVC}/orders?user_id={uid}&skip=0&limit=20",
            name="GET /orders?user_id (history)",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"5xx {resp.status_code}")

    @task(1)
    def admin_analytics_revenue(self):
        with self.client.get(
            f"{ANALYTICS_SVC}/analytics/revenue-by-category",
            name="GET /analytics/revenue-by-category",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 503):
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"5xx {resp.status_code}")

    @task(1)
    def admin_analytics_top_selling(self):
        with self.client.get(
            f"{ANALYTICS_SVC}/analytics/top-selling-products",
            name="GET /analytics/top-selling-products",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 503):
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"5xx {resp.status_code}")

    @task(1)
    def admin_analytics_status(self):
        with self.client.get(
            f"{ANALYTICS_SVC}/analytics/order-status",
            name="GET /analytics/order-status",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 503):
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"5xx {resp.status_code}")

    @task(1)
    def view_recommendations(self):
        pid = _pick_product_id()
        with self.client.get(
            f"{RECOMMENDATION_SVC}/recommendations/product/{pid}?limit=5",
            name="GET /recommendations/product/{id}",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 404):
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"5xx {resp.status_code}")


# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO B — SignupRaceUser
# All 50 users send POST /signup with the SAME username simultaneously.
# Expected: exactly 1 success (201), 49 duplicates (400), 1 row in DB.
# ─────────────────────────────────────────────────────────────────────────────
_b_race_username: str = ""
_b_race_email: str = ""
# ─────────────────────────────────────────────────────────────────────────────
# PHASE 1 — SmokeUser
# Exercises EVERY endpoint to verify functionality and status codes (200/201/204).
# ─────────────────────────────────────────────────────────────────────────────
class SmokeUser(HttpUser):
    """
    Phase 1 Smoke Test: Exercises EVERY endpoint once sequentially.
    Verifies 200/201/204 responses, no 404/500 errors.
    """
    wait_time = between(0.5, 1.5)
    host = PRODUCT_SVC

    def on_start(self):
        _db_seed()
        self.user_id = None
        self.auth_headers = {}
        self.created_order_id = None

    @task(1)
    def test_all_endpoints(self):
        pid = _all_real_product_ids[0] if _all_real_product_ids else 3

        # 1. Product catalogue
        self.client.get(f"{PRODUCT_SVC}/products", name="GET /products")
        self.client.get(f"{PRODUCT_SVC}/products/{pid}", name="GET /products/{id}")
        self.client.get(f"{PRODUCT_SVC}/products/search?q=chair", name="GET /products/search")
        self.client.get(f"{PRODUCT_SVC}/products?category=Electronics", name="GET /products?category")

        # 2. User Service
        sfx = uuid.uuid4().hex[:8]
        u_name = f"smoke_{sfx}"
        u_email = f"{u_name}@test.com"
        u_pass = "SmokePass123!"

        s_resp = self.client.post(
            f"{USER_SVC}/signup",
            json={"username": u_name, "email": u_email, "password": u_pass},
            name="POST /signup",
        )
        if s_resp.status_code == 201:
            l_resp = self.client.post(
                f"{USER_SVC}/login",
                json={"username": u_name, "password": u_pass},
                name="POST /login",
            )
            if l_resp.status_code == 200:
                data = l_resp.json()
                self.user_id = data.get("user", {}).get("id")
                tok = data.get("token")
                if tok:
                    self.auth_headers = {"Authorization": f"Bearer {tok}"}

        # 3. Order Service
        uid = self.user_id or (_real_user_ids[0] if _real_user_ids else 1)
        o_resp = self.client.post(
            f"{ORDER_SVC}/orders",
            json={"user_id": uid, "items": [{"product_id": pid, "quantity": 1}]},
            headers=self.auth_headers,
            name="POST /orders",
        )
        if o_resp.status_code == 201:
            self.created_order_id = o_resp.json().get("id")

        if self.created_order_id:
            self.client.get(
                f"{ORDER_SVC}/orders/{self.created_order_id}",
                headers=self.auth_headers,
                name="GET /orders/{id}",
            )
        self.client.get(
            f"{ORDER_SVC}/orders?user_id={uid}&limit=10",
            headers=self.auth_headers,
            name="GET /orders?user_id",
        )

        # 4. Inventory Service
        self.client.get(f"{INVENTORY_SVC}/inventory/{pid}", name="GET /inventory/{pid}")

        # 5. Admin Analytics
        self.client.get(f"{ANALYTICS_SVC}/analytics/revenue-by-category", name="GET /analytics/revenue-by-category")
        self.client.get(f"{ANALYTICS_SVC}/analytics/top-selling-products", name="GET /analytics/top-selling-products")
        self.client.get(f"{ANALYTICS_SVC}/analytics/order-status", name="GET /analytics/order-status")
        self.client.get(f"{ANALYTICS_SVC}/analytics/total-products", name="GET /analytics/total-products")

        # 6. Recommendation Service
        self.client.get(f"{RECOMMENDATION_SVC}/recommendations/product/{pid}?limit=5", name="GET /recommendations/product/{id}")


# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO B — SignupRaceUser
# All 50 users send POST /signup with the SAME username simultaneously.
# Expected: exactly 1 success (201), 49 duplicates (400), 1 row in DB.
# ─────────────────────────────────────────────────────────────────────────────
_b_race_username: str = ""
_b_race_email: str = ""
_b_initialized = False
_b_init_lock = threading.Lock()


class SignupRaceUser(HttpUser):
    """
    Scenario B: Concurrent same-username signup race.
    All instances share one username generated once at the start.
    Outcome counters (success/duplicate/other) are written to JSON on quit.
    """
    wait_time = constant(0)
    host = USER_SVC

    def on_start(self):
        global _b_race_username, _b_race_email, _b_initialized
        self.attempted = False
        with _b_init_lock:
            if not _b_initialized:
                suffix = uuid.uuid4().hex[:8]
                _b_race_username = f"race_{suffix}"
                _b_race_email = f"{_b_race_username}@loadtest.com"
                _b_initialized = True
                try:
                    p = Path(_outcome_dir) / "scenario_B_username.txt"
                    p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_text(_b_race_username)
                except Exception:
                    pass

    @task
    def attempt_signup(self):
        if self.attempted:
            time.sleep(1)
            return
        self.attempted = True

        payload = {
            "username": _b_race_username,
            "email": _b_race_email,
            "password": "LoadTest2026!",
        }
        with self.client.post(
            f"{USER_SVC}/signup",
            json=payload,
            name="POST /signup (race)",
            catch_response=True,
        ) as resp:
            if resp.status_code == 201:
                with _b_lock:
                    _b_counters["success"] += 1
                resp.success()
            elif resp.status_code == 400:
                with _b_lock:
                    _b_counters["duplicate"] += 1
                resp.success()  # expected outcome, not a Locust failure
            else:
                with _b_lock:
                    _b_counters["other"] += 1
                resp.failure(f"Unexpected {resp.status_code}: {resp.text[:200]}")


# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO C — LastUnitUser
# Stock is set to 1 by run_loadtest.py before this class runs.
# All 50 users try to order the same product.
# Expected: 1 success (201), 49 failures (409), final stock 0.
# ─────────────────────────────────────────────────────────────────────────────
_c_product_id: int = 0
_c_user_ids: list[int] = []
_c_tokens: list[str] = []
_c_setup_done = False
_c_setup_lock = threading.Lock()


class LastUnitUser(HttpUser):
    """
    Scenario C: Last-unit stock race.
    Uses real test accounts with known tokens. Orders the product whose
    stock was set to 1 by the orchestrator before this run.
    """
    wait_time = constant(0)
    host = ORDER_SVC

    def on_start(self):
        global _c_product_id, _c_setup_done
        self.attempted = False
        _db_seed()

        with _c_setup_lock:
            if not _c_setup_done:
                marker = Path(_outcome_dir) / "scenario_C_product_id.txt"
                if marker.exists():
                    _c_product_id = int(marker.read_text().strip())
                else:
                    _c_product_id = _all_real_product_ids[0] if _all_real_product_ids else 3
                _c_setup_done = True

        # Use pre-authenticated account pool to avoid bcrypt storm
        account = _get_preauth_user()
        self.user_id = account.get("user_id") or _get_random_user_id()
        self.token = account.get("token")
        self.auth_headers = dict(account.get("headers", {}))

    @task
    def attempt_order(self):
        if not self.user_id or self.attempted:
            time.sleep(1)
            return
        self.attempted = True

        payload = {
            "user_id": self.user_id,
            "items": [{"product_id": _c_product_id, "quantity": 1}],
        }
        with self.client.post(
            f"{ORDER_SVC}/orders",
            json=payload,
            headers=self.auth_headers,
            name="POST /orders (last-unit race)",
            catch_response=True,
        ) as resp:
            if resp.status_code == 201:
                with _c_lock:
                    _c_counters["success"] += 1
                resp.success()
            elif resp.status_code in (409, 400):
                with _c_lock:
                    _c_counters["failure"] += 1
                resp.success()  # expected stock-depleted outcome
            else:
                with _c_lock:
                    _c_counters["other"] += 1
                resp.failure(f"Unexpected {resp.status_code}: {resp.text[:200]}")


# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO D — RampUser
# Read-heavy (90%) + real order placement (10%)
# Creates real test accounts via signup API on startup.
# ─────────────────────────────────────────────────────────────────────────────
class RampUser(HttpUser):
    """
    Scenario D: Ramp — read-heavy mix + ~10% real order placement flow.
    Signs up as a real test account; uses JWT token for authenticated routes.
    """
    wait_time = between(1, 3)
    host = PRODUCT_SVC

    def on_start(self):
        _db_seed()
        self.cached_product_ids = list(_all_real_product_ids) or list(range(1, 34))
        # Use pre-authenticated account pool to eliminate spawn-time login storms and bcrypt skew
        account = _get_preauth_user()
        self.user_id = account.get("user_id") or _get_random_user_id()
        self.username = account.get("username", f"ramp_{self.user_id}")
        self.token = account.get("token")
        self.auth_headers = dict(account.get("headers", {}))

    # ── Read tasks (weight 9 each) ─────────────────────────────────────────
    @task(9)
    def list_products(self):
        skip  = random.choices([0, 10, 20, 30], weights=[0.60, 0.20, 0.12, 0.08], k=1)[0]
        limit = random.choice([10, 20, 50])
        with self.client.get(
            f"{PRODUCT_SVC}/products?skip={skip}&limit={limit}",
            name="GET /products",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and data:
                    self.cached_product_ids = [p["id"] for p in data if "id" in p]
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"5xx {resp.status_code}")

    @task(5)
    def search_products(self):
        use_typo = random.random() < 0.4
        q = random.choice(SEARCH_TERMS_TYPO if use_typo else SEARCH_TERMS_EXACT)
        label = "typo" if use_typo else "exact"
        with self.client.get(
            f"{PRODUCT_SVC}/products/search?q={q}",
            name=f"GET /products/search ({label})",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"5xx {resp.status_code}")

    @task(4)
    def browse_by_category(self):
        cat = random.choices(CATEGORY_CHOICES, weights=CATEGORY_WEIGHTS, k=1)[0]
        with self.client.get(
            f"{PRODUCT_SVC}/products?category={cat}&limit=20",
            name="GET /products?category",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"5xx {resp.status_code}")

    @task(3)
    def order_history(self):
        uid = self.user_id or _get_random_user_id()
        with self.client.get(
            f"{ORDER_SVC}/orders?user_id={uid}&skip=0&limit=20",
            headers=self.auth_headers,
            name="GET /orders?user_id (history)",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"5xx {resp.status_code}")

    @task(2)
    def analytics(self):
        endpoint = random.choice([
            "/analytics/revenue-by-category",
            "/analytics/top-selling-products",
            "/analytics/order-status",
            "/analytics/total-products",
            "/analytics/category-summary",
        ])
        with self.client.get(
            f"{ANALYTICS_SVC}{endpoint}",
            name=f"GET {endpoint}",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 503):
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"5xx {resp.status_code}")

    # ── Order placement task (~10% of total weight) ────────────────────────
    @task(2)
    def place_order(self):
        if not self.user_id:
            return

        order_items = _build_order_items()
        first_pid = order_items[0]["product_id"]

        with self.client.post(
            f"{ORDER_SVC}/orders",
            json={"user_id": self.user_id, "items": order_items},
            headers=self.auth_headers,
            name="POST /orders",
            catch_response=True,
        ) as resp:
            if resp.status_code == 201:
                order_id = resp.json().get("id")
                resp.success()
                # Follow-up: verify order status
                if order_id:
                    with self.client.get(
                        f"{ORDER_SVC}/orders/{order_id}",
                        headers=self.auth_headers,
                        name="GET /orders/{id}",
                        catch_response=True,
                    ) as gr:
                        if gr.status_code == 200:
                            gr.success()
                        elif gr.status_code >= 500:
                            gr.failure(f"5xx {gr.status_code}")
                # Follow-up: check inventory
                with self.client.get(
                    f"{INVENTORY_SVC}/inventory/{first_pid}",
                    name="GET /inventory/{pid}",
                    catch_response=True,
                ) as ir:
                    if ir.status_code in (200, 404):
                        ir.success()
                    elif ir.status_code >= 500:
                        ir.failure(f"5xx {ir.status_code}")
            elif resp.status_code == 409:
                resp.success()  # expected stock-depleted SAGA rollback
            elif resp.status_code >= 500:
                resp.failure(f"SAGA 5xx {resp.status_code}: {resp.text[:200]}")
            else:
                resp.failure(f"Unexpected {resp.status_code}: {resp.text[:200]}")


# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO: AuthStressUser
# Tests login / signup load as a separate, clearly named scenario ("auth stress")
# ─────────────────────────────────────────────────────────────────────────────
class AuthStressUser(HttpUser):
    """
    Scenario: Auth Stress.
    Evaluates user-service registration (bcrypt hash) and login (bcrypt verify)
    under concurrent load. Kept strictly isolated from e-commerce browsing & checkout
    to prevent bcrypt hashing storms from skewing steady-state ramp measurements.
    """
    wait_time = between(1, 3)
    host = USER_SVC

    @task(1)
    def register_and_login(self):
        sfx = uuid.uuid4().hex[:8]
        username = f"stress_{sfx}"
        email = f"{username}@example.com"
        password = "AuthStressPass123!"

        with self.client.post(
            f"{USER_SVC}/signup",
            json={"username": username, "email": email, "password": password},
            name="POST /signup (auth-stress)",
            catch_response=True,
        ) as s_resp:
            if s_resp.status_code == 201:
                s_resp.success()
                with self.client.post(
                    f"{USER_SVC}/login",
                    json={"username": username, "password": password},
                    name="POST /login (auth-stress)",
                    catch_response=True,
                ) as l_resp:
                    if l_resp.status_code == 200:
                        l_resp.success()
                    elif l_resp.status_code >= 500:
                        l_resp.failure(f"5xx: {l_resp.status_code}")
            elif s_resp.status_code >= 500:
                s_resp.failure(f"5xx: {s_resp.status_code}")

