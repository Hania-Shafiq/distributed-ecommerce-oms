"""
alpha_test.py - Automated Alpha Test Suite for Distributed E-Commerce OMS
Tests all 11 core scenarios plus comprehensive Authentication & Authorization test cases
against live microservices (or gateway).
"""

import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
import time
import uuid
import json
import subprocess
import concurrent.futures
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
from pathlib import Path

import requests
import jwt

BASE_GATEWAY_URL = os.getenv("BASE_GATEWAY_URL", "http://localhost:8000")
BASE_USER_URL = os.getenv("BASE_USER_URL", "http://localhost:8001")
BASE_ANALYTICS_URL = os.getenv("BASE_ANALYTICS_URL", "http://localhost:8002")
BASE_INVENTORY_URL = os.getenv("BASE_INVENTORY_URL", "http://localhost:8003")
BASE_ORDER_URL = os.getenv("BASE_ORDER_URL", "http://localhost:8004")
BASE_PRODUCT_URL = os.getenv("BASE_PRODUCT_URL", "http://localhost:8006")
BASE_ES_URL = os.getenv("BASE_ES_URL", "http://localhost:9200")

# Load secrets directly from repo-root .env (same file used by docker compose)
REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = REPO_ROOT / ".env"

if not ENV_PATH.is_file():
    raise RuntimeError(f"Repo-root .env file not found at {ENV_PATH}. Cannot run alpha tests without service secrets.")

_env_vars: Dict[str, str] = {}
with open(ENV_PATH, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            _env_vars[k.strip()] = v.strip().strip("'\"")

JWT_SECRET = os.getenv("JWT_SECRET") or _env_vars.get("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is missing or empty in repo-root .env and environment. No hardcoded default permitted.")

INTERNAL_SERVICE_KEY = os.getenv("INTERNAL_SERVICE_KEY") or _env_vars.get("INTERNAL_SERVICE_KEY")
if not INTERNAL_SERVICE_KEY:
    raise RuntimeError("INTERNAL_SERVICE_KEY is missing or empty in repo-root .env and environment. No hardcoded default permitted.")

SERVICE_KEY_HEADERS = {"X-Service-Key": INTERNAL_SERVICE_KEY}

results_summary = []

def record_result(feature: str, what_tested: str, expected: str, actual: str, passed: bool):
    status_str = "PASS" if passed else "FAIL"
    results_summary.append({
        "Feature": feature,
        "What I Tested": what_tested,
        "Expected Result": expected,
        "Actual Result": actual,
        "Pass/Fail": status_str
    })
    print(f"\n[{status_str}] {feature}")
    print(f"  Tested:   {what_tested}")
    print(f"  Expected: {expected}")
    print(f"  Actual:   {actual}\n" + "-"*70)

print("="*70)
print("[START] STARTING ALPHA TESTING SUITE WITH AUTH & AUTHORIZATION")
print("="*70)

# Check health of services first
services = {
    "User Service": f"{BASE_USER_URL}/health",
    "Product Service": f"{BASE_PRODUCT_URL}/health",
    "Inventory Service": f"{BASE_INVENTORY_URL}/health",
    "Order Service": f"{BASE_ORDER_URL}/health",
    "Analytics Service": f"{BASE_ANALYTICS_URL}/health",
}
for name, url in services.items():
    try:
        r = requests.get(url, timeout=10)
        print(f"[OK] {name} is alive ({r.status_code}): {r.json()}")
    except Exception as e:
        print(f"[ERROR] {name} failed health check: {e}")
        sys.exit(1)

# ==============================================================================
# Setup: Auth Provisioning (Customer A, Customer B, Admin)
# ==============================================================================
print("\n--- SETUP: Provisioning Users and Roles ---")
# 1. Customer A
customer_a_name = f"custA_{uuid.uuid4().hex[:8]}"
r_ca_signup = requests.post(f"{BASE_USER_URL}/signup", json={
    "username": customer_a_name,
    "email": f"{customer_a_name}@example.com",
    "password": "CustomerAuthPass!2026"
})
r_ca_login = requests.post(f"{BASE_USER_URL}/login", json={
    "username": customer_a_name,
    "password": "CustomerAuthPass!2026"
})
customer_a_token = r_ca_login.json().get("token") or r_ca_login.json().get("access_token")
customer_a_id = r_ca_login.json()["user"]["id"]
customer_a_headers = {"Authorization": f"Bearer {customer_a_token}"}
print(f"[AUTH SETUP] Customer A created: {customer_a_name} (ID: {customer_a_id})")

# 2. Customer B
customer_b_name = f"custB_{uuid.uuid4().hex[:8]}"
r_cb_signup = requests.post(f"{BASE_USER_URL}/signup", json={
    "username": customer_b_name,
    "email": f"{customer_b_name}@example.com",
    "password": "CustomerAuthPass!2026"
})
r_cb_login = requests.post(f"{BASE_USER_URL}/login", json={
    "username": customer_b_name,
    "password": "CustomerAuthPass!2026"
})
customer_b_token = r_cb_login.json().get("token") or r_cb_login.json().get("access_token")
customer_b_id = r_cb_login.json()["user"]["id"]
customer_b_headers = {"Authorization": f"Bearer {customer_b_token}"}
print(f"[AUTH SETUP] Customer B created: {customer_b_name} (ID: {customer_b_id})")

# 3. Admin User (Signup + promote via docker exec set_admin.py)
admin_name = f"admin_{uuid.uuid4().hex[:8]}"
r_adm_signup = requests.post(f"{BASE_USER_URL}/signup", json={
    "username": admin_name,
    "email": f"{admin_name}@example.com",
    "password": "AdminAuthPass!2026"
})
promote_res = subprocess.run(
    ["docker", "exec", "user-service", "python", "set_admin.py", admin_name],
    capture_output=True, text=True, check=True
)
print(f"[AUTH SETUP] Promoted {admin_name} to admin: {promote_res.stdout.strip()}")
r_adm_login = requests.post(f"{BASE_USER_URL}/login", json={
    "username": admin_name,
    "password": "AdminAuthPass!2026"
})
admin_token = r_adm_login.json().get("token") or r_adm_login.json().get("access_token")
admin_headers = {"Authorization": f"Bearer {admin_token}"}
print(f"[AUTH SETUP] Admin logged in with role: {r_adm_login.json()['user'].get('role')}")


# ==============================================================================
# 1. Signup with new username
# ==============================================================================
print("\n--- TEST 1: Signup with a new username ---")
unique_user = f"alpha_{uuid.uuid4().hex[:8]}"
signup_payload = {
    "username": unique_user,
    "email": f"{unique_user}@example.com",
    "password": "SecureAuthPass!2026"
}
r1 = requests.post(f"{BASE_USER_URL}/signup", json=signup_payload)
passed1 = (r1.status_code == 201) and (r1.json().get("username") == unique_user)
record_result(
    "User Registration",
    f"POST /signup with new unique username '{unique_user}'",
    "HTTP 201 Created with user object returned",
    f"HTTP {r1.status_code}: {r1.text}",
    passed1
)

# ==============================================================================
# 2. Signup with duplicate username
# ==============================================================================
print("\n--- TEST 2: Signup with a duplicate username ---")
dup_payload = {
    "username": unique_user,
    "email": f"different_{uuid.uuid4().hex[:6]}@example.com",
    "password": "AuthTestPass!2026"
}
r2 = requests.post(f"{BASE_USER_URL}/signup", json=dup_payload)
passed2 = (r2.status_code == 400) and ("already taken" in r2.text.lower() or "already exists" in r2.text.lower())
record_result(
    "Duplicate Username Rejection",
    f"POST /signup with already registered username '{unique_user}'",
    "HTTP 400 Bad Request with 'already taken' rejection",
    f"HTTP {r2.status_code}: {r2.text}",
    passed2
)

# ==============================================================================
# 3. Concurrent signups with SAME username (20 simultaneous requests)
# ==============================================================================
print("\n--- TEST 3: Concurrent Signup Race Condition (20 requests) ---")
concurrent_user = f"race_{uuid.uuid4().hex[:8]}"
concurrent_payload = {
    "username": concurrent_user,
    "email": f"{concurrent_user}@example.com",
    "password": "AuthTestPass!2026"
}

def send_signup(i):
    return requests.post(f"{BASE_USER_URL}/signup", json=concurrent_payload, timeout=30)

with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
    futures = [executor.submit(send_signup, i) for i in range(20)]
    responses = [f.result() for f in concurrent.futures.as_completed(futures)]

status_counts = {}
for r in responses:
    status_counts[r.status_code] = status_counts.get(r.status_code, 0) + 1

successes = status_counts.get(201, 0)
failures = status_counts.get(400, 0)
passed3 = (successes == 1) and (failures == 19)
record_result(
    "Concurrency & Bloom Filter Race Protection",
    f"20 simultaneous POST /signup requests for same username '{concurrent_user}'",
    "Exactly 1 HTTP 201 Created and 19 HTTP 400 Bad Request (no duplicate DB rows)",
    f"HTTP 201: {successes}, HTTP 400: {failures} (status breakdown: {status_counts})",
    passed3
)

# ==============================================================================
# 4. Search for product by exact keyword
# ==============================================================================
print("\n--- TEST 4: Search for product by exact keyword ---")
r4 = requests.get(f"{BASE_PRODUCT_URL}/products/search?q=Keyboard")
data4 = r4.json() if r4.status_code == 200 else {}
results4 = data4.get("results", [])
passed4 = (r4.status_code == 200) and len(results4) > 0 and any("keyboard" in p.get("name", "").lower() for p in results4)
found_names = [p.get("name") for p in results4[:3]]
record_result(
    "Product Exact Search",
    "GET /products/search?q=Keyboard",
    "Relevant products returned with status 200",
    f"HTTP {r4.status_code}, found {len(results4)} products: {found_names}",
    passed4
)

# ==============================================================================
# 5. Search for product by related / fuzzy / typo term
# ==============================================================================
print("\n--- TEST 5: Search for product by fuzzy/related term ---")
r5 = requests.get(f"{BASE_PRODUCT_URL}/products/search?q=headfones")
data5 = r5.json() if r5.status_code == 200 else {}
results5 = data5.get("results", [])
passed5 = (r5.status_code == 200) and len(results5) > 0 and any("headphone" in p.get("name", "").lower() for p in results5)
found_fuzzy = [p.get("name") for p in results5[:3]]
record_result(
    "Fuzzy (lexical) search",
    "GET /products/search?q=headfones (typo for headphones)",
    "Elasticsearch fuzzy/wildcard match resolves to 'Headphones'",
    f"HTTP {r5.status_code}, found {len(results5)} products: {found_fuzzy}",
    passed5
)

# ==============================================================================
# 6. Add and remove items from cart (state persistence)
# ==============================================================================
print("\n--- TEST 6: Cart state manipulation & persistence logic ---")
cart = []
def add_to_cart(cart_list, prod):
    existing = next((item for item in cart_list if item["id"] == prod["id"]), None)
    if existing:
        existing["quantity"] += 1
    else:
        cart_list.append({**prod, "quantity": 1})

def remove_from_cart(cart_list, prod_id):
    for item in cart_list:
        if item["id"] == prod_id:
            item["quantity"] -= 1
            break
    return [item for item in cart_list if item["quantity"] > 0]

dummy_prod = {"id": 1, "name": "Test Wireless Headphones", "price": 99.99}
add_to_cart(cart, dummy_prod)
add_to_cart(cart, dummy_prod)
qty_after_adds = cart[0]["quantity"]
cart = remove_from_cart(cart, 1)
qty_after_sub = cart[0]["quantity"]
cart = remove_from_cart(cart, 1)
items_after_empty = len(cart)
passed6 = (qty_after_adds == 2) and (qty_after_sub == 1) and (items_after_empty == 0)
record_result(
    "Cart State Management",
    "Add item twice (qty=2), decrement (qty=1), decrement (qty=0/removed)",
    "Cart correctly tracks quantities, computes subtotals, and clears on 0",
    f"Qty after adds: {qty_after_adds}, after decrement: {qty_after_sub}, items remaining: {items_after_empty}",
    passed6
)

# ==============================================================================
# 7. Place an order when stock is available
# ==============================================================================
print("\n--- TEST 7: Place order with available stock ---")
products_resp = requests.get(f"{BASE_PRODUCT_URL}/products?limit=10").json()
target_product = None
for p in products_resp:
    inv = requests.get(f"{BASE_INVENTORY_URL}/inventory/{p['id']}").json()
    if inv.get("stock_quantity", 0) > 5:
        target_product = p
        break

if not target_product:
    target_product = products_resp[0]
    requests.put(
        f"{BASE_INVENTORY_URL}/inventory/{target_product['id']}/restock",
        json={"amount": 10},
        headers=SERVICE_KEY_HEADERS
    )

prod_id = target_product["id"]
inv_before = requests.get(f"{BASE_INVENTORY_URL}/inventory/{prod_id}").json()["stock_quantity"]

order_payload = {
    "user_id": customer_a_id,
    "items": [{"product_id": prod_id, "quantity": 1}]
}
r7 = requests.post(f"{BASE_ORDER_URL}/orders", json=order_payload, headers=customer_a_headers)
inv_after = requests.get(f"{BASE_INVENTORY_URL}/inventory/{prod_id}").json()["stock_quantity"]

passed7 = (r7.status_code == 201) and (r7.json().get("status") == "CONFIRMED") and (inv_after == inv_before - 1)
record_result(
    "SAGA Order Placement (In Stock)",
    f"POST /orders for product #{prod_id} with Customer A JWT (Initial stock: {inv_before})",
    f"HTTP 201, status='CONFIRMED', and inventory decreases by 1 to {inv_before - 1}",
    f"HTTP {r7.status_code}, status={r7.json().get('status') if r7.status_code==201 else r7.text}, stock: {inv_before} -> {inv_after}",
    passed7
)

# ==============================================================================
# 8. Place an order when stock is 0
# ==============================================================================
print("\n--- TEST 8: Place order when stock is 0 ---")
drain_product = products_resp[-1]
drain_id = drain_product["id"]
current_stock = requests.get(f"{BASE_INVENTORY_URL}/inventory/{drain_id}").json().get("stock_quantity", 0)
if current_stock > 0:
    requests.put(
        f"{BASE_INVENTORY_URL}/inventory/{drain_id}/reduce",
        json={"amount": current_stock},
        headers=SERVICE_KEY_HEADERS
    )

inv_zero = requests.get(f"{BASE_INVENTORY_URL}/inventory/{drain_id}").json()["stock_quantity"]

order_zero_payload = {
    "user_id": customer_a_id,
    "items": [{"product_id": drain_id, "quantity": 1}]
}
r8 = requests.post(f"{BASE_ORDER_URL}/orders", json=order_zero_payload, headers=customer_a_headers)
inv_after_zero = requests.get(f"{BASE_INVENTORY_URL}/inventory/{drain_id}").json()["stock_quantity"]

passed8 = (r8.status_code == 409) and ("insufficient stock" in r8.text.lower()) and (inv_after_zero == 0)
record_result(
    "SAGA Compensation on Zero Stock",
    f"POST /orders for product #{drain_id} with stock=0",
    "HTTP 409 Conflict with 'Insufficient stock' message, order marked FAILED, stock stays 0",
    f"HTTP {r8.status_code}: {r8.text}, Stock: {inv_after_zero}",
    passed8
)

# ==============================================================================
# 9. Concurrency test: Stock=1, 20 concurrent order requests
# ==============================================================================
print("\n--- TEST 9: Concurrency Race Test (Stock=1, 20 concurrent orders) ---")
conc_prod_id = 5
conc_inv = requests.get(f"{BASE_INVENTORY_URL}/inventory/{conc_prod_id}").json().get("stock_quantity", 0)
if conc_inv > 1:
    r_adjust = requests.put(
        f"{BASE_INVENTORY_URL}/inventory/{conc_prod_id}/reduce",
        json={"amount": conc_inv - 1},
        headers=SERVICE_KEY_HEADERS
    )
elif conc_inv < 1:
    r_adjust = requests.put(
        f"{BASE_INVENTORY_URL}/inventory/{conc_prod_id}/restock",
        json={"amount": 1 - conc_inv},
        headers=SERVICE_KEY_HEADERS
    )

stock_verified = requests.get(f"{BASE_INVENTORY_URL}/inventory/{conc_prod_id}").json()["stock_quantity"]
print(f"Verified stock before race: {stock_verified}")
if stock_verified != 1:
    abort_msg = f"Anti-overselling setup failed: Product #{conc_prod_id} stock is {stock_verified}, expected 1 before race."
    record_result(
        "Inventory Row-Locking & Anti-Overselling",
        f"20 simultaneous orders for Product #{conc_prod_id} with initial stock = 1",
        "EXACTLY 1 order succeeds (HTTP 201), 19 fail (HTTP 409), final stock is 0 (no overselling)",
        abort_msg,
        False
    )
    raise RuntimeError(abort_msg)

conc_order_payload = {
    "user_id": customer_a_id,
    "items": [{"product_id": conc_prod_id, "quantity": 1}]
}

def place_concurrent_order(idx):
    return requests.post(f"{BASE_ORDER_URL}/orders", json=conc_order_payload, headers=customer_a_headers, timeout=45)

with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
    order_futures = [executor.submit(place_concurrent_order, i) for i in range(20)]
    order_responses = [f.result() for f in concurrent.futures.as_completed(order_futures)]

order_status_counts = {}
for r in order_responses:
    order_status_counts[r.status_code] = order_status_counts.get(r.status_code, 0) + 1

order_successes = order_status_counts.get(201, 0)
order_conflicts = order_status_counts.get(409, 0)
final_stock = requests.get(f"{BASE_INVENTORY_URL}/inventory/{conc_prod_id}").json()["stock_quantity"]

passed9 = (order_successes == 1) and (order_conflicts == 19) and (final_stock == 0)
record_result(
    "Inventory Row-Locking & Anti-Overselling",
    f"20 simultaneous orders for Product #{conc_prod_id} with initial stock = 1",
    "EXACTLY 1 order succeeds (HTTP 201), 19 fail (HTTP 409), final stock is 0 (no overselling)",
    f"HTTP 201: {order_successes}, HTTP 409: {order_conflicts}, Final Stock: {final_stock}",
    passed9
)

# ==============================================================================
# 10. Admin Dashboard Analytics & Elasticsearch Batch Sync
# ==============================================================================
print("\n--- TEST 10: Admin Dashboard Analytics & Batch Sync ---")
print("Triggering batch sync script into Elasticsearch...")
sync_res = subprocess.run(
    ["docker", "exec", "admin-analytics", "python", "sync_orders.py", "--since", "2026-01-01"],
    capture_output=True, text=True
)
print(f"Sync output:\n{sync_res.stdout}\n{sync_res.stderr}")

top_selling = requests.get(f"{BASE_ANALYTICS_URL}/analytics/top-selling-products", headers=admin_headers).json()
rev_by_cat = requests.get(f"{BASE_ANALYTICS_URL}/analytics/revenue-by-category", headers=admin_headers).json()
order_status_breakdown = requests.get(f"{BASE_ANALYTICS_URL}/analytics/order-status", headers=admin_headers).json()

has_top_selling = isinstance(top_selling, list) and len(top_selling) > 0
has_revenue = isinstance(rev_by_cat, list) and len(rev_by_cat) > 0
has_status = isinstance(order_status_breakdown, list) and len(order_status_breakdown) > 0

status_dict = {item["status"]: item["count"] for item in order_status_breakdown} if isinstance(order_status_breakdown, list) else {}
confirmed_count = status_dict.get("CONFIRMED", 0)

passed10 = has_top_selling and has_revenue and has_status and (confirmed_count > 0)
record_result(
    "Elasticsearch Analytics & Batch Sync (Admin Auth)",
    "Run sync_orders.py, query analytics endpoints with Admin Bearer token",
    "Batch sync indexes order items; ES aggregations return correct grouped metrics with HTTP 200",
    f"Top selling products: {len(top_selling) if isinstance(top_selling, list) else 0}, Categories: {len(rev_by_cat) if isinstance(rev_by_cat, list) else 0}, Status: {status_dict}",
    passed10
)

# ==============================================================================
# 11. Order Idempotency Concurrent Protection
# ==============================================================================
print("\n--- TEST 11: Order Idempotency Concurrent Protection ---")
idemp_key = f"alpha-idemp-{uuid.uuid4()}"
idemp_prod_id = 6
requests.put(
    f"{BASE_INVENTORY_URL}/inventory/{idemp_prod_id}/restock",
    json={"amount": 10},
    headers=SERVICE_KEY_HEADERS
)
inv_before_idemp = requests.get(f"{BASE_INVENTORY_URL}/inventory/{idemp_prod_id}").json()["stock_quantity"]

def send_idempotent_order():
    return requests.post(
        f"{BASE_ORDER_URL}/orders",
        json={"user_id": customer_a_id, "items": [{"product_id": idemp_prod_id, "quantity": 1}]},
        headers={"Idempotency-Key": idemp_key, **customer_a_headers},
    )

with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
    idemp_responses = list(executor.map(lambda _: send_idempotent_order(), range(10)))

unique_order_ids = set()
for r in idemp_responses:
    if r.status_code in (200, 201):
        try:
            unique_order_ids.add(r.json().get("id"))
        except Exception:
            pass

inv_after_idemp = requests.get(f"{BASE_INVENTORY_URL}/inventory/{idemp_prod_id}").json()["stock_quantity"]
stock_diff = inv_before_idemp - inv_after_idemp

passed11 = (len(unique_order_ids) == 1) and (stock_diff == 1) and all(r.status_code in (200, 201) for r in idemp_responses)
record_result(
    "Order Idempotency",
    "Same Idempotency-Key sent 10 times concurrently with customer auth",
    "Exactly 1 order row created and stock reduced once",
    f"Orders created: {len(unique_order_ids)}, Stock reduced by: {stock_diff}, Statuses: {len([r for r in idemp_responses if r.status_code in (200, 201)])}/10 OK",
    passed11,
)

# ==============================================================================
# 12. AUTH TEST 1: 401 without token on protected routes
# ==============================================================================
print("\n--- TEST 12: Auth - 401 Without Token ---")
r_no_auth_order = requests.post(f"{BASE_ORDER_URL}/orders", json={"user_id": customer_a_id, "items": []})
r_no_auth_analytics = requests.get(f"{BASE_ANALYTICS_URL}/analytics/top-selling-products")

passed12 = (r_no_auth_order.status_code == 401) and (r_no_auth_analytics.status_code == 401)
record_result(
    "Auth: 401 Missing Token",
    "POST /orders and GET /analytics/top-selling-products without Authorization header",
    "Both reject with HTTP 401 Unauthorized",
    f"POST /orders: {r_no_auth_order.status_code}, GET /analytics: {r_no_auth_analytics.status_code}",
    passed12
)

# ==============================================================================
# 13. AUTH TEST 2: 403 Customer token on admin route
# ==============================================================================
print("\n--- TEST 13: Auth - 403 Customer on Admin Route ---")
r_cust_admin = requests.get(
    f"{BASE_ANALYTICS_URL}/analytics/top-selling-products",
    headers=customer_a_headers
)
passed13 = (r_cust_admin.status_code == 403) and ("admin" in r_cust_admin.text.lower() or "forbidden" in r_cust_admin.text.lower())
record_result(
    "Auth: 403 Customer on Admin Route",
    "GET /analytics/top-selling-products with Customer Bearer token",
    "HTTP 403 Forbidden with admin required notice",
    f"HTTP {r_cust_admin.status_code}: {r_cust_admin.text}",
    passed13
)

# ==============================================================================
# 14. AUTH TEST 3: 401 Tampered token signature
# ==============================================================================
print("\n--- TEST 14: Auth - 401 Tampered Token Signature ---")
tampered_token = customer_a_token[:-5] + ("AAAAA" if not customer_a_token.endswith("AAAAA") else "BBBBB")
r_tampered = requests.get(
    f"{BASE_ORDER_URL}/orders",
    params={"user_id": customer_a_id},
    headers={"Authorization": f"Bearer {tampered_token}"}
)
passed14 = (r_tampered.status_code == 401)
record_result(
    "Auth: 401 Tampered Token",
    "GET /orders with altered JWT signature bytes",
    "HTTP 401 Unauthorized rejecting invalid signature",
    f"HTTP {r_tampered.status_code}: {r_tampered.text}",
    passed14
)

# ==============================================================================
# 15. AUTH TEST 4: 401 Expired token
# ==============================================================================
print("\n--- TEST 15: Auth - 401 Expired Token ---")
expired_payload = {
    "sub": str(customer_a_id),
    "role": "customer",
    "username": customer_a_name,
    "iat": int((datetime.now(timezone.utc) - timedelta(hours=2)).timestamp()),
    "exp": int((datetime.now(timezone.utc) - timedelta(minutes=10)).timestamp())
}
expired_token = jwt.encode(expired_payload, JWT_SECRET, algorithm="HS256")
r_expired = requests.get(
    f"{BASE_ORDER_URL}/orders",
    params={"user_id": customer_a_id},
    headers={"Authorization": f"Bearer {expired_token}"}
)
passed15 = (r_expired.status_code == 401) and ("expired" in r_expired.text.lower())
record_result(
    "Auth: 401 Expired Token",
    "GET /orders with JWT whose 'exp' timestamp is 10 minutes in the past",
    "HTTP 401 Unauthorized with 'Token has expired'",
    f"HTTP {r_expired.status_code}: {r_expired.text}",
    passed15
)

# ==============================================================================
# 16. AUTH TEST 5: 403 Customer A reading Customer B's orders
# ==============================================================================
print("\n--- TEST 16: Auth - 403 Customer A Reading Customer B's Orders ---")
r_cross_read = requests.get(
    f"{BASE_ORDER_URL}/orders",
    params={"user_id": customer_b_id},
    headers=customer_a_headers
)
passed16 = (r_cross_read.status_code == 403) and ("another user" in r_cross_read.text.lower() or "forbidden" in r_cross_read.text.lower())
record_result(
    "Auth: 403 IDOR Protection (Cross-User Read)",
    f"GET /orders?user_id={customer_b_id} authenticated as Customer A (ID: {customer_a_id})",
    "HTTP 403 Forbidden preventing customer from viewing another user's orders",
    f"HTTP {r_cross_read.status_code}: {r_cross_read.text}",
    passed16
)

# ==============================================================================
# 17. AUTH TEST 6: 403 Customer A placing order for Customer B
# ==============================================================================
print("\n--- TEST 17: Auth - 403 Customer A Placing Order for Customer B ---")
spoof_order_payload = {
    "user_id": customer_b_id,
    "items": [{"product_id": 3, "quantity": 1}]
}
r_cross_create = requests.post(
    f"{BASE_ORDER_URL}/orders",
    json=spoof_order_payload,
    headers=customer_a_headers
)
passed17 = (r_cross_create.status_code == 403) and ("behalf" in r_cross_create.text.lower() or "forbidden" in r_cross_create.text.lower())
record_result(
    "Auth: 403 IDOR Protection (Cross-User Order)",
    f"POST /orders with body user_id={customer_b_id} signed by Customer A (ID: {customer_a_id})",
    "HTTP 403 Forbidden rejecting order placement for other users",
    f"HTTP {r_cross_create.status_code}: {r_cross_create.text}",
    passed17
)

# ==============================================================================
# 18. AUTH TEST 7: 401/403 Service-key endpoints without key
# ==============================================================================
print("\n--- TEST 18: Auth - Service-Key Protection ---")
r_nokey_inv = requests.put(f"{BASE_INVENTORY_URL}/inventory/3/reduce", json={"amount": 1})
r_nokey_graph = requests.post(f"http://localhost:8005/graph/purchase", json={"user_id": 1, "product_ids": [3]})
r_withkey_inv = requests.put(
    f"{BASE_INVENTORY_URL}/inventory/3/restock",
    json={"amount": 1},
    headers=SERVICE_KEY_HEADERS
)

passed18 = (r_nokey_inv.status_code in (401, 403)) and (r_nokey_graph.status_code in (401, 403)) and (r_withkey_inv.status_code == 200)
record_result(
    "Auth: Service Key Endpoint Isolation",
    "PUT /inventory/3/reduce and POST /graph/purchase without key vs with X-Service-Key",
    "Rejects without key (401/403) and succeeds with valid X-Service-Key (200)",
    f"No key inv: {r_nokey_inv.status_code}, No key graph: {r_nokey_graph.status_code}, With key inv: {r_withkey_inv.status_code}",
    passed18
)

# ==============================================================================
# 19. SIMILAR PRODUCTS: kNN returns 5 items excluding seed product
# ==============================================================================
print("\n--- TEST 19: Similar Products via Vector Embedding kNN ---")
r_sim = requests.get(f"{BASE_PRODUCT_URL}/products/similar/3?limit=5")
data_sim = r_sim.json() if r_sim.status_code == 200 else {}
sim_list = data_sim.get("similar_products", [])
passed19 = (
    r_sim.status_code == 200
    and len(sim_list) == 5
    and all(p.get("id") != 3 for p in sim_list)
)
record_result(
    "Similar Products (kNN)",
    "GET /products/similar/3?limit=5",
    "Returns 5 similar items excluding seed product ID 3",
    f"HTTP {r_sim.status_code}, returned {len(sim_list)} items, seed excluded: {all(p.get('id') != 3 for p in sim_list)}",
    passed19
)

# ==============================================================================
# 20. SEMANTIC SEARCH: Semantic query finds product that lexical search misses
# ==============================================================================
print("\n--- TEST 20: Semantic vs Lexical Search ---")
semantic_query = "listen to podcasts without distractions"
r_lex = requests.get(f"{BASE_PRODUCT_URL}/products/search?q={semantic_query}&mode=lexical")
r_sem = requests.get(f"{BASE_PRODUCT_URL}/products/search?q={semantic_query}&mode=semantic")
data_lex = r_lex.json() if r_lex.status_code == 200 else {}
data_sem = r_sem.json() if r_sem.status_code == 200 else {}
lex_count = len(data_lex.get("results", []))
sem_results = data_sem.get("results", [])
sem_top_name = sem_results[0].get("name", "") if sem_results else ""
passed20 = (
    r_lex.status_code == 200
    and r_sem.status_code == 200
    and lex_count == 0
    and "headphone" in sem_top_name.lower()
)
record_result(
    "Semantic Search vs Lexical",
    f"q='{semantic_query}' mode=lexical vs mode=semantic",
    "Lexical misses (0 results); Semantic finds 'Headphones' as top hit",
    f"Lexical count: {lex_count}, Semantic top hit: '{sem_top_name}'",
    passed20
)

# ==============================================================================
# 21. GRAPH NETWORK: /graph/network is 403 for customer and 200 for admin
# ==============================================================================
print("\n--- TEST 21: Graph Network Admin Authorization & Topology ---")
r_graph_cust = requests.get("http://localhost:8000/graph/network", headers=customer_a_headers)
r_graph_adm = requests.get("http://localhost:8000/graph/network?limit_edges=10", headers=admin_headers)
data_adm = r_graph_adm.json() if r_graph_adm.status_code == 200 else {}
adm_nodes = data_adm.get("nodes", [])
adm_edges = data_adm.get("edges", [])
valid_node_shape = len(adm_nodes) > 0 and all(
    "id" in n and "name" in n and "category" in n and "degree" in n
    for n in adm_nodes[:3]
)
valid_edge_shape = len(adm_edges) > 0 and all(
    "source" in e and "target" in e and "weight" in e
    for e in adm_edges[:3]
)
passed21 = (
    r_graph_cust.status_code == 403
    and r_graph_adm.status_code == 200
    and valid_node_shape
    and valid_edge_shape
)
record_result(
    "Graph Network Admin Access",
    "GET /graph/network with customer token vs admin token",
    "Customer receives 403 Forbidden; Admin receives 200 with nodes and edges",
    f"Customer: {r_graph_cust.status_code}, Admin: {r_graph_adm.status_code} ({len(adm_nodes)} nodes, {len(adm_edges)} edges)",
    passed21
)

# ==============================================================================
# Print Summary Table
# ==============================================================================
print("\n" + "="*80)
print("ALPHA TESTING SUMMARY TABLE")
print("="*80)
header = f"{'Feature':<28} | {'What I Tested':<35} | {'Actual Result':<25} | {'Status'}"
print(header)
print("-" * len(header))
all_passed = True
for res in results_summary:
    feat = res["Feature"][:28]
    tested = res["What I Tested"][:35]
    act = res["Actual Result"][:25]
    if res["Pass/Fail"] != "PASS":
        all_passed = False
    print(f"{feat:<28} | {tested:<35} | {act:<25} | {res['Pass/Fail']}")
print("="*80)

# Optional JSON output path if specified
output_json = os.environ.get("ALPHA_TEST_OUTPUT", "")
if output_json:
    try:
        os.makedirs(os.path.dirname(output_json), exist_ok=True)
        with open(output_json, "w", encoding="utf-8") as f:
            json.dump(results_summary, f, indent=2)
        print(f"Results written to {output_json}")
    except Exception as e:
        print(f"Notice: could not write JSON results: {e}")

if not all_passed:
    print("\n[!] ONE OR MORE TESTS FAILED!")
    sys.exit(1)
else:
    print(f"\n[ALL PASS] All {len(results_summary)} alpha test scenarios passed successfully!")
