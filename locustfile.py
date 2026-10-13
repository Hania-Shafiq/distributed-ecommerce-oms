"""
locustfile.py
─────────────────────────────────────────────────────────────────────────────
Distributed E-Commerce Order Management System (OMS) Load Testing Suite
Target: AWS EC2 Deployment
Base IP: 13.63.0.139

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

USER_SVC = f"http://{BASE_IP}:8001"
ANALYTICS_SVC = f"http://{BASE_IP}:8002"
INVENTORY_SVC = f"http://{BASE_IP}:8003"
ORDER_SVC = f"http://{BASE_IP}:8004"
RECOMMENDATION_SVC = f"http://{BASE_IP}:8005"
PRODUCT_SVC = f"http://{BASE_IP}:8006"

# Shared search terms for Elasticsearch search / autocomplete testing
SEARCH_TERMS = ["chair", "keyboard", "mouse", "desk", "headphone", "monitor", "gaming", "laptop", "office"]


# ═════════════════════════════════════════════════════════════════════════════
# 1. BrowsingUser (Weight: 6) — High Volume Read-Only Traffic (~60% of users)
# ═════════════════════════════════════════════════════════════════════════════
class BrowsingUser(HttpUser):
    """
    Simulates anonymous shoppers browsing products, viewing details,
    searching via Elasticsearch, and viewing recommendations from Neo4j.
    """
    weight = 6
    wait_time = between(1, 3)

    def on_start(self):
        """Seed a local cache of product IDs by fetching the initial catalog."""
        self.cached_product_ids = [1, 2, 3]  # Safe fallbacks
        try:
            res = self.client.get(
                f"{PRODUCT_SVC}/products?skip=0&limit=50",
                name="GET /products (seed)",
            )
            if res.status_code == 200:
                products = res.json()
                if isinstance(products, list) and len(products) > 0:
                    self.cached_product_ids = [p["id"] for p in products if "id" in p]
        except Exception:
            pass

    @task(5)
    def list_products(self):
        """Fetch paginated product list with variable skip/limit."""
        skip = random.choice([0, 10, 20])
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
        """View product details by primary key."""
        pid = random.choice(self.cached_product_ids)
        with self.client.get(
            f"{PRODUCT_SVC}/products/{pid}",
            name="GET /products/{id}",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            elif resp.status_code == 404:
                # 404 is an expected HTTP result if product does not exist, not a system failure
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
                resp.failure(f"ES search error {resp.status_code} for query '{query}': {resp.text}")

    @task(2)
    def view_product_recommendations(self):
        """Query Neo4j graph recommendations for co-purchased items."""
        pid = random.choice(self.cached_product_ids)
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


# ═════════════════════════════════════════════════════════════════════════════
# 2. AuthUser (Weight: 3) — Authenticated User (~30% of users)
# ═════════════════════════════════════════════════════════════════════════════
class AuthUser(HttpUser):
    """
    Signs up a unique user on startup, logs in, caches JWT token,
    and performs authenticated user operations and personal queries.
    """
    weight = 3
    wait_time = between(1, 3)

    def on_start(self):
        """
        Register a unique loadtest user and log in.
        Note: Username must be 3-20 chars alphanumeric/underscore per schemas.py.
        Password must be >= 8 chars with uppercase, lowercase, and digit.
        """
        suffix = uuid.uuid4().hex[:10]
        self.username = f"loadtest_{suffix}"  # 9 + 10 = 19 chars (<= 20)
        self.email = f"{self.username}@loadtest.com"
        self.password = "LoadTest2026!"
        self.token = None
        self.user_id = None
        self.auth_headers = {}
        self.cached_product_ids = [1, 2]

        # 1. Sign up
        signup_payload = {
            "username": self.username,
            "email": self.email,
            "password": self.password,
        }
        with self.client.post(
            f"{USER_SVC}/signup",
            json=signup_payload,
            name="POST /signup",
            catch_response=True,
        ) as signup_res:
            if signup_res.status_code == 201:
                signup_res.success()
            elif signup_res.status_code == 400:
                # Username or email collision / Bloom check triggered
                signup_res.success()
            elif signup_res.status_code >= 500:
                signup_res.failure(f"Signup failed with {signup_res.status_code}: {signup_res.text}")

        # 2. Log in
        login_payload = {
            "username": self.username,
            "password": self.password,
        }
        with self.client.post(
            f"{USER_SVC}/login",
            json=login_payload,
            name="POST /login",
            catch_response=True,
        ) as login_res:
            if login_res.status_code == 200:
                data = login_res.json()
                self.token = data.get("token")
                user_obj = data.get("user", {})
                self.user_id = user_obj.get("id")
                if self.token:
                    self.auth_headers = {"Authorization": f"Bearer {self.token}"}
                login_res.success()
            elif login_res.status_code >= 500:
                login_res.failure(f"Login 5xx error: {login_res.status_code}")
            else:
                login_res.failure(f"Login failed ({login_res.status_code}): {login_res.text}")

    @task(3)
    def view_order_history(self):
        """Query user's order history."""
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
                resp.failure(f"User recommendations error {resp.status_code}: {resp.text}")

    @task(3)
    def browse_catalog(self):
        """Authenticated browsing of products."""
        with self.client.get(
            f"{PRODUCT_SVC}/products?limit=20",
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
    Logs in, browses catalog, places order via SAGA Orchestrator,
    verifies order details, and checks inventory level.
    """
    weight = 1
    wait_time = between(1, 3)

    def on_start(self):
        """Sign up and log in a dedicated buyer account."""
        suffix = uuid.uuid4().hex[:10]
        self.username = f"loadtest_{suffix}"
        self.email = f"{self.username}@loadtest.com"
        self.password = "LoadTest2026!"
        self.token = None
        self.user_id = None
        self.auth_headers = {}
        self.cached_product_ids = [1, 2]
        self.latest_order_id = None
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
                data = login_res.json()
                self.token = data.get("token")
                self.user_id = data.get("user", {}).get("id")
                if self.token:
                    self.auth_headers = {"Authorization": f"Bearer {self.token}"}
                login_res.success()
            else:
                login_res.failure(f"Shopper login failed ({login_res.status_code})")

        # 3. Fetch real products to purchase
        try:
            p_res = self.client.get(f"{PRODUCT_SVC}/products?limit=50", name="GET /products (seed)")
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
        1. Selects an existing product ID dynamically.
        2. Sends POST /orders (invoking SAGA transaction across Product + Inventory).
        3. If order succeeds (201) or returns 409 (Out of Stock), handled cleanly.
        4. Verifies the order status via GET /orders/{order_id}.
        5. Verifies stock level via GET /inventory/{product_id}.
        """
        if not self.user_id:
            return

        product_id = random.choice(self.cached_product_ids)
        order_payload = {
            "user_id": self.user_id,
            "items": [
                {
                    "product_id": product_id,
                    "quantity": 1,
                }
            ],
        }

        # Step 1: POST /orders
        with self.client.post(
            f"{ORDER_SVC}/orders",
            json=order_payload,
            headers=self.auth_headers,
            name="POST /orders",
            catch_response=True,
        ) as order_res:
            if order_res.status_code == 201:
                order_data = order_res.json()
                self.latest_order_id = order_data.get("id")
                self.last_ordered_product_id = product_id
                order_res.success()
            elif order_res.status_code == 409:
                # 409 is a valid business logic rejection from SAGA when stock is depleted under load
                order_res.success()
            elif order_res.status_code >= 500:
                order_res.failure(f"SAGA 5xx server error {order_res.status_code}: {order_res.text}")
            else:
                order_res.failure(f"Unexpected order failure ({order_res.status_code}): {order_res.text}")

        # Step 2: GET /orders/{order_id} (if order was created)
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
                    get_order_res.failure(f"Order fetch failed with {get_order_res.status_code}")

        # Step 3: GET /inventory/{product_id}
        target_pid = self.last_ordered_product_id or product_id
        with self.client.get(
            f"{INVENTORY_SVC}/inventory/{target_pid}",
            name="GET /inventory/{product_id}",
            catch_response=True,
        ) as inv_res:
            if inv_res.status_code in [200, 404]:
                inv_res.success()
            elif inv_res.status_code >= 500:
                inv_res.failure(f"Inventory fetch 5xx error: {inv_res.status_code}")
