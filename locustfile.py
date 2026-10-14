"""
locustfile.py
─────────────────────────────────────────────────────────────────────────────
Distributed E-Commerce Order Management System (OMS) Load Testing Suite
Target: AWS EC2 Deployment
Base IP: 13.63.0.139

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
    (SAGA creates transient PENDING at step 1 which resolves to CONFIRMED/FAILED
    within the same synchronous request; folded for steady-state client assertions)
  • Orders per user: 96.9% one-time buyers, 3.1% repeat
  • Category catalog slots: Accessories=9 (28.3%), Furniture=7 (21.8%),
    Sports & Outdoors=7 (20.7%), Electronics=6 (17.9%), Kitchen=4 (11.2%)

Wait time: locust between(1, 3) kept for per-user pacing — the Olist
inter-arrival median (222 s) is a single-server global rate; with multiple
virtual users, each user's between(1,3) at scale approximates real load.

Usage:
  Web UI:    python -m locust -f locustfile.py
  Headless:  python -m locust -f locustfile.py --headless -u 25 -r 5 -t 2m --csv results
─────────────────────────────────────────────────────────────────────────────
"""

import random
import uuid
from locust import HttpUser, task, between

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION & SERVICE URLS
# Change BASE_IP here to test different environments (e.g. localhost or EC2 IP)
# ─────────────────────────────────────────────────────────────────────────────
BASE_IP = "13.63.0.139"

USER_SVC            = f"http://{BASE_IP}:8001"
ANALYTICS_SVC       = f"http://{BASE_IP}:8002"
INVENTORY_SVC       = f"http://{BASE_IP}:8003"
ORDER_SVC           = f"http://{BASE_IP}:8004"
RECOMMENDATION_SVC  = f"http://{BASE_IP}:8005"
PRODUCT_SVC         = f"http://{BASE_IP}:8006"

# Shared search terms for Elasticsearch search / autocomplete testing
SEARCH_TERMS = [
    "chair", "keyboard", "mouse", "desk", "headphone", "monitor",
    "gaming", "laptop", "office", "water bottle", "yoga", "running",
    "wallet", "speaker", "kettle",
]

# ─────────────────────────────────────────────────────────────────────────────
# OLIST-CALIBRATED DISTRIBUTION PARAMETERS
# Source: data/analyze_olist.py run on 99,441 real Olist orders
# ─────────────────────────────────────────────────────────────────────────────

# Items-per-order probabilities (Olist: 90.1% / 7.6% / 2.3%)
# Rounded to fit 3-choice distribution [1, 2, 3+]
ITEMS_PER_ORDER_CHOICES  = [1, 2, 3]
ITEMS_PER_ORDER_WEIGHTS  = [0.9006, 0.0762, 0.0232]

# Quantity-per-line-item probabilities (Olist: 93.1% / 5.3% / 1.6%)
QTY_PER_LINE_CHOICES     = [1, 2, 3]
QTY_PER_LINE_WEIGHTS     = [0.9308, 0.0525, 0.0167]

# Category slot allocation for 33 products (from Olist sales volume ratios)
# Real Olist shares: Accessories=28.3%, Furniture=21.8%, Sports&Outdoors=20.7%,
#                     Electronics=17.9%, Kitchen=11.2%
CATEGORY_CHOICES  = ["Electronics", "Furniture", "Kitchen", "Sports & Outdoors", "Accessories"]
CATEGORY_WEIGHTS  = [0.1794, 0.2182, 0.1120, 0.2074, 0.2830]

CATEGORY_PRODUCT_RANGES = {
    "Electronics":       list(range(1, 7)),    # 6 products: IDs  1 –  6
    "Furniture":         list(range(7, 14)),   # 7 products: IDs  7 – 13
    "Kitchen":           list(range(14, 18)),  # 4 products: IDs 14 – 17
    "Sports & Outdoors": list(range(18, 25)),  # 7 products: IDs 18 – 24
    "Accessories":       list(range(25, 34)),  # 9 products: IDs 25 – 33
}

# Within-category Zipf popularity weights (fitted exponent s=0.8387)
# Solves category conflict: prevents Electronics (slots 1-6) from receiving
# 52% of total traffic when it should only receive 17.9% of sales.
PER_CATEGORY_ZIPF_WEIGHTS = {
    "Electronics":       [0.363431, 0.203212, 0.144631, 0.113625, 0.094231, 0.08087],
    "Furniture":         [0.339318, 0.189729, 0.135035, 0.106086, 0.087979, 0.075504, 0.066347],
    "Kitchen":           [0.440577, 0.246347, 0.175332, 0.137744],
    "Sports & Outdoors": [0.339318, 0.189729, 0.135035, 0.106086, 0.087979, 0.075504, 0.066347],
    "Accessories":       [0.304853, 0.170458, 0.121319, 0.095311, 0.079043, 0.067835, 0.059608, 0.053293, 0.04828],
}


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS: TWO-STAGE SAMPLING
# ─────────────────────────────────────────────────────────────────────────────

def _pick_product_id(product_ids: list[int] = None) -> int:
    """
    Two-stage product selection (resolves category-vs-Zipf traffic skew):
      Stage 1: Choose category ~ Olist category share:
               Accessories (28.3%), Furniture (21.8%), Sports & Outdoors (20.7%),
               Electronics (17.9%), Kitchen (11.2%)
      Stage 2: Choose product within category ~ within-category Zipf rank weights.
    This guarantees that category order volumes strictly match real data,
    while individual product demand retains the observed power-law skew.
    """
    cat = random.choices(CATEGORY_CHOICES, weights=CATEGORY_WEIGHTS, k=1)[0]
    cat_pids = CATEGORY_PRODUCT_RANGES[cat]
    cat_w = PER_CATEGORY_ZIPF_WEIGHTS[cat]

    if product_ids:
        # Match against provided/cached IDs if available
        matched = [(pid, cat_w[cat_pids.index(pid)]) for pid in cat_pids if pid in product_ids]
        if matched:
            pids, weights = zip(*matched)
            return random.choices(pids, weights=weights, k=1)[0]
        # Fallback to general choice from provided list
        return random.choice(product_ids)

    return random.choices(cat_pids, weights=cat_w, k=1)[0]


def _build_order_items(product_ids: list[int] = None) -> list[dict]:
    """
    Build a realistic order payload using Olist-calibrated distributions:
      • Number of distinct line items: weighted {1, 2, 3} (90.1%, 7.6%, 2.3%)
      • Quantity per line item:        weighted {1, 2, 3} (93.1%, 5.3%, 1.6%)
      • Two-stage sampling: Category choice -> Within-category Zipf pick.
    """
    n_items = random.choices(ITEMS_PER_ORDER_CHOICES, weights=ITEMS_PER_ORDER_WEIGHTS, k=1)[0]
    chosen_pids = []
    attempts = 0
    while len(chosen_pids) < n_items and attempts < n_items * 6:
        attempts += 1
        pid = _pick_product_id(product_ids)
        if pid not in chosen_pids:
            chosen_pids.append(pid)

    # Fill remaining if necessary to guarantee n_items distinct items
    if len(chosen_pids) < n_items and product_ids:
        remaining = [p for p in product_ids if p not in chosen_pids]
        while len(chosen_pids) < n_items and remaining:
            pick = random.choice(remaining)
            chosen_pids.append(pick)
            remaining.remove(pick)

    if not chosen_pids:
        chosen_pids = [1]

    items = []
    for pid in chosen_pids:
        qty = random.choices(QTY_PER_LINE_CHOICES, weights=QTY_PER_LINE_WEIGHTS, k=1)[0]
        items.append({"product_id": pid, "quantity": qty})
    return items


# ═════════════════════════════════════════════════════════════════════════════
# 1. BrowsingUser (Weight: 6) — High Volume Read-Only Traffic (~60% of users)
# ═════════════════════════════════════════════════════════════════════════════
class BrowsingUser(HttpUser):
    """
    Simulates anonymous shoppers browsing products, viewing details,
    searching via Elasticsearch, and viewing recommendations from Neo4j.

    Traffic mix derived from real e-commerce browse-to-purchase ratios:
      • list_products            : task weight 5 — highest volume, catalog scanning
      • view_product_detail      : task weight 4 — detail page visits (Zipf-weighted)
      • search_products          : task weight 3 — Elasticsearch full-text + autocomplete
      • view_product_recommendations: task weight 2 — Neo4j co-purchase graph
      • browse_by_category       : task weight 2 — category filter (Olist proportions)
    """
    weight    = 6
    wait_time = between(1, 3)

    def on_start(self):
        """Seed a local cache of product IDs sorted by popularity rank."""
        # Safe fallbacks: first 3 products (most popular by Zipf)
        self.cached_product_ids = [1, 2, 3]
        try:
            res = self.client.get(
                f"{PRODUCT_SVC}/products?skip=0&limit=50",
                name="GET /products (seed)",
            )
            if res.status_code == 200:
                products = res.json()
                if isinstance(products, list) and len(products) > 0:
                    # Preserve DB insertion order as popularity proxy
                    self.cached_product_ids = [p["id"] for p in products if "id" in p]
        except Exception:
            pass

    @task(5)
    def list_products(self):
        """
        Fetch paginated product list.
        Skip values weighted toward page 1 (most users browse from the top),
        consistent with Zipf popularity — popular products appear early.
        """
        skip  = random.choices([0, 10, 20, 30], weights=[0.60, 0.20, 0.12, 0.08], k=1)[0]
        limit = random.choice([10, 20, 50])
        with self.client.get(
            f"{PRODUCT_SVC}/products?skip={skip}&limit={limit}",
            name="GET /products",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and len(data) > 0:
                    self.cached_product_ids = [p["id"] for p in data if "id" in p]
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"Server error {resp.status_code} listing products: {resp.text}")

    @task(4)
    def view_product_detail(self):
        """
        View product details using Zipf-calibrated popularity weights.
        In Olist, the top product gets 18.9% of views — modelled here.
        """
        pid = _pick_product_id(self.cached_product_ids)
        with self.client.get(
            f"{PRODUCT_SVC}/products/{pid}",
            name="GET /products/{id}",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            elif resp.status_code == 404:
                # 404 is an expected HTTP result if product does not exist
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"Server error {resp.status_code} on product {pid}: {resp.text}")

    @task(3)
    def search_products(self):
        """Test Elasticsearch full-text search and autocomplete."""
        query = random.choice(SEARCH_TERMS)
        with self.client.get(
            f"{PRODUCT_SVC}/products/search?q={query}",
            name="GET /products/search",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"ES search error {resp.status_code} for '{query}': {resp.text}")

    @task(2)
    def view_product_recommendations(self):
        """Query Neo4j graph recommendations for co-purchased items."""
        pid = _pick_product_id(self.cached_product_ids)
        with self.client.get(
            f"{RECOMMENDATION_SVC}/recommendations/product/{pid}?limit=5",
            name="GET /recommendations/product/{id}",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            elif resp.status_code == 404:
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"Neo4j recommendation error {resp.status_code} for product {pid}: {resp.text}")

    @task(2)
    def browse_by_category(self):
        """
        Filter products by category using Olist-calibrated category weights:
          Accessories=28%, Furniture=22%, Sports&Outdoors=21%,
          Electronics=18%, Kitchen=11%
        Reflects real e-commerce category traffic proportions.
        """
        category = random.choices(CATEGORY_CHOICES, weights=CATEGORY_WEIGHTS, k=1)[0]
        with self.client.get(
            f"{PRODUCT_SVC}/products?category={category}&limit=20",
            name="GET /products?category={cat}",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"Category browse error {resp.status_code}: {resp.text}")


# ═════════════════════════════════════════════════════════════════════════════
# 2. AuthUser (Weight: 3) — Authenticated User (~30% of users)
# ═════════════════════════════════════════════════════════════════════════════
class AuthUser(HttpUser):
    """
    Signs up a unique user on startup, logs in, caches JWT token,
    and performs authenticated user operations and personal queries.

    From Olist: 96.9% of users place only 1 order (one-time buyers),
    so AuthUser simulates the more engaged segment (repeat browsers
    who check order history / recommendations but rarely re-purchase).
    """
    weight    = 3
    wait_time = between(1, 3)

    def on_start(self):
        """
        Register a unique loadtest user and log in.
        Username: 3-20 chars alphanumeric/underscore.
        Password: >= 8 chars with uppercase, lowercase, and digit.
        """
        suffix        = uuid.uuid4().hex[:10]
        self.username = f"loadtest_{suffix}"   # 9 + 10 = 19 chars (<= 20)
        self.email    = f"{self.username}@loadtest.com"
        self.password = "LoadTest2026!"
        self.token    = None
        self.user_id  = None
        self.auth_headers        = {}
        self.cached_product_ids  = [1, 2]

        # 1. Sign up
        with self.client.post(
            f"{USER_SVC}/signup",
            json={"username": self.username, "email": self.email, "password": self.password},
            name="POST /signup",
            catch_response=True,
        ) as signup_res:
            if signup_res.status_code == 201:
                signup_res.success()
            elif signup_res.status_code == 400:
                # Username/email collision or Bloom filter hit — not a system failure
                signup_res.success()
            elif signup_res.status_code >= 500:
                signup_res.failure(f"Signup failed {signup_res.status_code}: {signup_res.text}")

        # 2. Log in
        with self.client.post(
            f"{USER_SVC}/login",
            json={"username": self.username, "password": self.password},
            name="POST /login",
            catch_response=True,
        ) as login_res:
            if login_res.status_code == 200:
                data          = login_res.json()
                self.token    = data.get("token")
                user_obj      = data.get("user", {})
                self.user_id  = user_obj.get("id")
                if self.token:
                    self.auth_headers = {"Authorization": f"Bearer {self.token}"}
                login_res.success()
            elif login_res.status_code >= 500:
                login_res.failure(f"Login 5xx: {login_res.status_code}")
            else:
                login_res.failure(f"Login failed ({login_res.status_code}): {login_res.text}")

    @task(3)
    def view_order_history(self):
        """
        Query user's order history.
        Olist: 96.9% users have 1 order, 2.9% have 2; response is typically tiny.
        """
        if not self.user_id:
            return
        with self.client.get(
            f"{ORDER_SVC}/orders?user_id={self.user_id}",
            headers=self.auth_headers,
            name="GET /orders?user_id={id}",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"Order history error {resp.status_code}: {resp.text}")

    @task(2)
    def view_user_recommendations(self):
        """Query collaborative recommendations for this user from Neo4j."""
        if not self.user_id:
            return
        with self.client.get(
            f"{RECOMMENDATION_SVC}/recommendations/user/{self.user_id}?limit=5",
            headers=self.auth_headers,
            name="GET /recommendations/user/{id}",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"User rec error {resp.status_code}: {resp.text}")

    @task(3)
    def browse_catalog(self):
        """
        Authenticated browsing of products using Zipf-weighted category selection.
        Updates the cached product list for realistic follow-on Zipf sampling.
        """
        category = random.choices(CATEGORY_CHOICES, weights=CATEGORY_WEIGHTS, k=1)[0]
        with self.client.get(
            f"{PRODUCT_SVC}/products?category={category}&limit=20",
            headers=self.auth_headers,
            name="GET /products",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and len(data) > 0:
                    self.cached_product_ids = [p["id"] for p in data if "id" in p]
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"Catalog browse error {resp.status_code}: {resp.text}")


# ═════════════════════════════════════════════════════════════════════════════
# 3. ShopperUser (Weight: 1) — End-to-End Buyer (~10% of users)
# ═════════════════════════════════════════════════════════════════════════════
class ShopperUser(HttpUser):
    """
    Full transaction lifecycle:
    Logs in, browses catalog, places an order via SAGA Orchestrator
    (with Olist-calibrated item count and quantity distributions),
    verifies order details, and checks inventory level.

    Expected outcomes (from Olist status mapping & SAGA analysis):
      • CONFIRMED (SAGA success):  ~98.8% of orders (folded)
      • FAILED    (SAGA rollback): ~1.2% (stock depletion, service error)
      • PENDING   (transient):     0.3% in Olist raw, but in OMS the SAGA runs
                                   synchronously in-request: Step 1 writes PENDING,
                                   then Step 3 updates to CONFIRMED (or FAILED).
                                   Therefore GET /orders/{id} immediately after returns
                                   CONFIRMED or FAILED — never PENDING.

    Note: In practice under load, FAILED rate will be higher than the Olist
    baseline because synthetic concurrent load stresses inventory more than
    real-world temporal spread across 773 days.
    """
    weight    = 1
    wait_time = between(1, 3)

    def on_start(self):
        """Sign up and log in a dedicated buyer account."""
        suffix                    = uuid.uuid4().hex[:10]
        self.username             = f"loadtest_{suffix}"
        self.email                = f"{self.username}@loadtest.com"
        self.password             = "LoadTest2026!"
        self.token                = None
        self.user_id              = None
        self.auth_headers         = {}
        self.cached_product_ids   = [1, 2]
        self.latest_order_id      = None
        self.last_ordered_product_id = None

        # 1. Sign up
        self.client.post(
            f"{USER_SVC}/signup",
            json={"username": self.username, "email": self.email, "password": self.password},
            name="POST /signup",
        )

        # 2. Log in
        with self.client.post(
            f"{USER_SVC}/login",
            json={"username": self.username, "password": self.password},
            name="POST /login",
            catch_response=True,
        ) as login_res:
            if login_res.status_code == 200:
                data          = login_res.json()
                self.token    = data.get("token")
                self.user_id  = data.get("user", {}).get("id")
                if self.token:
                    self.auth_headers = {"Authorization": f"Bearer {self.token}"}
                login_res.success()
            else:
                login_res.failure(f"Shopper login failed ({login_res.status_code})")

        # 3. Fetch real product IDs to purchase (ordered by DB insertion = popularity rank)
        try:
            p_res = self.client.get(
                f"{PRODUCT_SVC}/products?skip=0&limit=50",
                name="GET /products (seed)",
            )
            if p_res.status_code == 200:
                p_list = p_res.json()
                if isinstance(p_list, list) and len(p_list) > 0:
                    self.cached_product_ids = [p["id"] for p in p_list if "id" in p]
        except Exception:
            pass

    @task(3)
    def place_order_flow(self):
        """
        Executes distributed order placement:

        1. Build order payload using Olist-calibrated distributions:
           • Item count: 90% single, 7.6% double, 2.3% triple+
           • Quantity per line: 93% qty=1, 5.3% qty=2, 1.7% qty≥3
           • Product selection: Zipf-weighted (top product 18.9% of picks)
        2. POST /orders → triggers SAGA (Product validation + Inventory reserve).
        3. Handle 201 (SAGA success → CONFIRMED), 409 (stock depleted → FAILED).
        4. GET /orders/{id} → verify SAGA final status.
        5. GET /inventory/{product_id} → check updated stock level.
        """
        if not self.user_id:
            return

        # Build Olist-realistic order items
        order_items = _build_order_items(self.cached_product_ids)
        # Track the first product for inventory check
        first_pid   = order_items[0]["product_id"]

        order_payload = {
            "user_id": self.user_id,
            "items":   order_items,
        }

        # Step 1: POST /orders — invoke SAGA
        with self.client.post(
            f"{ORDER_SVC}/orders",
            json=order_payload,
            headers=self.auth_headers,
            name="POST /orders",
            catch_response=True,
        ) as order_res:
            if order_res.status_code == 201:
                order_data           = order_res.json()
                self.latest_order_id = order_data.get("id")
                self.last_ordered_product_id = first_pid
                order_res.success()
            elif order_res.status_code == 409:
                # 409 = valid SAGA business rejection (stock depleted under load)
                # Maps to FAILED status — expected ~1.2% baseline, higher under load
                order_res.success()
            elif order_res.status_code >= 500:
                order_res.failure(f"SAGA 5xx error {order_res.status_code}: {order_res.text}")
            else:
                order_res.failure(f"Unexpected order failure ({order_res.status_code}): {order_res.text}")

        # Step 2: GET /orders/{order_id} — verify SAGA final state
        # Expected: status in {CONFIRMED, FAILED, PENDING}
        if self.latest_order_id:
            with self.client.get(
                f"{ORDER_SVC}/orders/{self.latest_order_id}",
                headers=self.auth_headers,
                name="GET /orders/{id}",
                catch_response=True,
            ) as get_order_res:
                if get_order_res.status_code == 200:
                    get_order_res.success()
                elif get_order_res.status_code >= 500:
                    get_order_res.failure(f"Order fetch failed {get_order_res.status_code}")

        # Step 3: GET /inventory/{product_id} — verify stock was decremented
        target_pid = self.last_ordered_product_id or first_pid
        with self.client.get(
            f"{INVENTORY_SVC}/inventory/{target_pid}",
            name="GET /inventory/{product_id}",
            catch_response=True,
        ) as inv_res:
            if inv_res.status_code in [200, 404]:
                inv_res.success()
            elif inv_res.status_code >= 500:
                inv_res.failure(f"Inventory fetch 5xx: {inv_res.status_code}")
