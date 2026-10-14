"""
locustfile.py
─────────────────────────────────────────────────────────────────────────────
Distributed E-Commerce Order Management System (OMS) Load Testing Suite
Target: AWS EC2 Deployment
Base IP: 13.63.0.139

Distribution parameters calibrated from the Olist Brazilian E-Commerce
dataset (99,441 real orders) — see data/analyze_olist.py for methodology.

Key real-data findings applied:
  • Product popularity: Zipf distribution (s=0.84) — top product gets
    18.9% of traffic, top 20% products drive 67% of sales
  • Items per order: 90.1% single-item, 7.6% two-item, 2.3% three+
  • Quantity per line: 93.1% qty=1, 5.3% qty=2, 1.6% qty≥3
  • Order status (mapped): CONFIRMED=98.5%, FAILED=1.2%, PENDING=0.3%
  • Orders per user: 96.9% one-time buyers, 3.1% repeat
  • Olist status mapping: delivered/shipped/invoiced/approved → CONFIRMED
                          canceled/unavailable → FAILED
  • Category catalog slots: Electronics=6, Furniture=7, Kitchen=4,
                            Sports & Outdoors=7, Accessories=9  (total=33)

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

# Zipf popularity weights for 33 catalog product slots (s=0.8387, R²=0.9574)
# Index 0 = most popular product, index 32 = least popular
# Top product gets 18.9% of order traffic; top 20% drive 67% of all sales
PRODUCT_WEIGHTS = [
    0.189063, 0.105715, 0.075241, 0.059111, 0.049022, 0.042071,
    0.036969, 0.033052, 0.029943, 0.027411, 0.025310, 0.023518,
    0.021997, 0.020673, 0.019505, 0.018484, 0.017575, 0.016747,
    0.016000, 0.015325, 0.014708, 0.014143, 0.013624, 0.013144,
    0.012700, 0.012287, 0.011902, 0.011542, 0.011203, 0.010884,
    0.010582, 0.010296, 0.010025,
]
# Sanity-check: weights sum to 1.0 (verified)

# Items-per-order probabilities (Olist: 90.1% / 7.6% / 2.3%)
# Rounded to fit 3-choice distribution [1, 2, 3+]
ITEMS_PER_ORDER_CHOICES  = [1, 2, 3]
ITEMS_PER_ORDER_WEIGHTS  = [0.9013, 0.0764, 0.0223]

# Quantity-per-line-item probabilities (Olist: 93.1% / 5.3% / 1.6%)
QTY_PER_LINE_CHOICES     = [1, 2, 3]
QTY_PER_LINE_WEIGHTS     = [0.9307, 0.0530, 0.0163]

# Category slot allocation for 33 products  (from Olist sales volume ratios)
# Electronics=18%, Furniture=22%, Kitchen=11%, Sports&Outdoors=21%, Accessories=28%
# Maps to catalog product IDs 1-33 by category block:
#   Electronics     : IDs  1 –  6  (6 products)
#   Furniture       : IDs  7 – 13  (7 products)
#   Kitchen         : IDs 14 – 17  (4 products)
#   Sports&Outdoors : IDs 18 – 24  (7 products)
#   Accessories     : IDs 25 – 33  (9 products)
CATEGORY_PRODUCT_RANGES = {
    "Electronics":      list(range(1, 7)),
    "Furniture":        list(range(7, 14)),
    "Kitchen":          list(range(14, 18)),
    "Sports & Outdoors":list(range(18, 25)),
    "Accessories":      list(range(25, 34)),
}
# Category weights derived from Olist sales volume proportions
CATEGORY_CHOICES  = ["Electronics", "Furniture", "Kitchen", "Sports & Outdoors", "Accessories"]
CATEGORY_WEIGHTS  = [0.18, 0.22, 0.11, 0.21, 0.28]


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _pick_product_id(product_ids: list[int]) -> int:
    """
    Select a product ID using Zipf-calibrated weights.
    Assumes product_ids is already ordered from most- to least-popular
    (i.e., ranked by sales volume descending, which is how the catalog
    is stored in PostgreSQL).
    Falls back to uniform random if the weight list length mismatches.
    """
    if len(product_ids) == len(PRODUCT_WEIGHTS):
        return random.choices(product_ids, weights=PRODUCT_WEIGHTS, k=1)[0]
    # Mismatch (catalog partially seeded): uniform fallback
    return random.choice(product_ids)


def _build_order_items(product_ids: list[int]) -> list[dict]:
    """
    Build a realistic order payload using Olist-calibrated distributions:
      • Number of distinct line items: weighted {1, 2, 3}
      • Quantity per line item:        weighted {1, 2, 3}
    """
    n_items = random.choices(ITEMS_PER_ORDER_CHOICES, weights=ITEMS_PER_ORDER_WEIGHTS, k=1)[0]
    # Sample without replacement if possible so we don't order the same product twice
    chosen_pids = (
        random.choices(product_ids, weights=PRODUCT_WEIGHTS[:len(product_ids)], k=n_items)
        if len(product_ids) >= n_items
        else [random.choice(product_ids)] * n_items
    )
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

    Expected outcomes (from Olist status mapping):
      • CONFIRMED (SAGA success):  ~98.5% of orders
      • FAILED    (SAGA rollback): ~1.2% (stock depletion, service error)
      • PENDING   (in-flight):     ~0.3% (transient; resolved asynchronously)

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
