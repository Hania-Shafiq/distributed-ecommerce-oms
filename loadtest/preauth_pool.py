"""
loadtest/preauth_pool.py
─────────────────────────────────────────────────────────────────────────────
Pre-authenticates a pool of ~200 test customer accounts and one dedicated admin
account, caching their JWT tokens to disk (loadtest/.tokens.json).

Refreshes tokens whenever their expiration has less than 30 minutes remaining.
Never commits or prints secret tokens.

Routes all authentication requests through the API Gateway (default: http://localhost:8000).
─────────────────────────────────────────────────────────────────────────────
"""

import base64
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import requests

POOL_FILE = Path(os.getenv("PREAUTH_POOL_FILE", str(Path(__file__).resolve().parent / ".tokens.json"))).resolve()
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000").rstrip("/")
DEFAULT_POOL_SIZE = 200

# 30 minutes in seconds
REFRESH_THRESHOLD_SECONDS = 1800


def get_token_exp(token: str) -> float:
    """Extract exp timestamp from JWT payload without verifying secret."""
    if not token or not isinstance(token, str):
        return 0.0
    try:
        parts = token.split(".")
        if len(parts) >= 2:
            payload_b64 = parts[1]
            payload_b64 += "=" * (-len(payload_b64) % 4)
            payload = json.loads(base64.urlsafe_b64decode(payload_b64))
            return float(payload.get("exp", 0.0))
    except Exception:
        pass
    return 0.0


def is_token_valid_and_fresh(token: str) -> bool:
    """Returns True if token has at least 30 minutes before expiration."""
    exp = get_token_exp(token)
    if exp <= 0.0:
        return False
    return (exp - time.time()) > REFRESH_THRESHOLD_SECONDS


def create_or_login_customer(idx: int) -> dict | None:
    username = f"preauth_usr_{idx:03d}"
    email = f"{username}@example.com"
    password = "PreAuthPass123!"

    session = requests.Session()
    # 1. Try signup
    try:
        session.post(
            f"{BASE_URL}/signup",
            json={"username": username, "email": email, "password": password},
            timeout=10,
        )
    except Exception:
        pass

    # 2. Login to obtain fresh signed JWT
    try:
        resp = session.post(
            f"{BASE_URL}/login",
            json={"username": username, "password": password},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            user_id = data.get("user", {}).get("id")
            token = data.get("token")
            if user_id and token:
                return {
                    "username": username,
                    "user_id": user_id,
                    "token": token,
                    "headers": {"Authorization": f"Bearer {token}"},
                    "exp": get_token_exp(token),
                }
    except Exception:
        pass
    return None


def setup_or_login_admin() -> dict | None:
    username = "loadtest_admin"
    email = "loadtest_admin@example.com"
    password = "AdminLoadtestPass123!"

    session = requests.Session()
    # 1. Try signup
    try:
        session.post(
            f"{BASE_URL}/signup",
            json={"username": username, "email": email, "password": password},
            timeout=10,
        )
    except Exception:
        pass

    # 2. Promote to admin role via set_admin.py in user-service container
    try:
        subprocess.run(
            ["docker", "exec", "user-service", "python", "set_admin.py", username],
            capture_output=True,
            timeout=10,
        )
    except Exception:
        # Fallback to direct DB update if docker exec fails
        try:
            import psycopg2
            base_ip = os.getenv("BASE_IP", "localhost")
            conn = psycopg2.connect(host=base_ip, port=5433, dbname="users_db", user="postgres", password="postgres")
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute("UPDATE users SET role = 'admin' WHERE username = %s;", [username])
            conn.close()
        except Exception:
            pass

    # 3. Login to obtain signed JWT with role=admin
    try:
        resp = session.post(
            f"{BASE_URL}/login",
            json={"username": username, "password": password},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            user_id = data.get("user", {}).get("id")
            token = data.get("token")
            if user_id and token:
                return {
                    "username": username,
                    "user_id": user_id,
                    "token": token,
                    "headers": {"Authorization": f"Bearer {token}"},
                    "exp": get_token_exp(token),
                    "role": "admin",
                }
    except Exception:
        pass
    return None


_cached_data = None


def init_preauth_pool(target_size: int = DEFAULT_POOL_SIZE, force_refresh: bool = False) -> list[dict]:
    """
    Ensures pre-authenticated customer and admin accounts are ready with fresh JWT tokens.
    Saves state to loadtest/.tokens.json.
    Returns list of customer account dicts.
    """
    global _cached_data

    existing_customers = []
    admin_account = None

    if not force_refresh and POOL_FILE.exists():
        try:
            with open(POOL_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
            if isinstance(saved, dict):
                raw_customers = saved.get("customers", [])
                raw_admin = saved.get("admin")
                # Check freshness
                fresh_customers = [c for c in raw_customers if is_token_valid_and_fresh(c.get("token", ""))]
                if len(fresh_customers) >= target_size and raw_admin and is_token_valid_and_fresh(raw_admin.get("token", "")):
                    print(f"[PreAuth Pool] Loaded {len(fresh_customers)} fresh accounts from {POOL_FILE.name}.")
                    _cached_data = saved
                    return fresh_customers
                existing_customers = fresh_customers
                if raw_admin and is_token_valid_and_fresh(raw_admin.get("token", "")):
                    admin_account = raw_admin
            elif isinstance(saved, list):
                fresh_customers = [c for c in saved if is_token_valid_and_fresh(c.get("token", ""))]
                if len(fresh_customers) >= target_size:
                    existing_customers = fresh_customers
        except Exception as e:
            print(f"[PreAuth Pool] Cache read error ({e}); regenerating pool...")

    print(f"[PreAuth Pool] Initializing/refreshing tokens via {BASE_URL}...")
    t0 = time.time()

    # 1. Admin account
    if not admin_account:
        admin_account = setup_or_login_admin()

    # 2. Customers
    customers_map = {c["username"]: c for c in existing_customers}
    needed = []
    for i in range(target_size):
        uname = f"preauth_usr_{i:03d}"
        if uname not in customers_map or not is_token_valid_and_fresh(customers_map[uname].get("token", "")):
            needed.append(i)

    if needed:
        print(f"[PreAuth Pool] Fetching fresh tokens for {len(needed)} customer accounts...")
        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = [executor.submit(create_or_login_customer, idx) for idx in needed]
            for f in as_completed(futures):
                res = f.result()
                if res:
                    customers_map[res["username"]] = res

    all_customers = list(customers_map.values())
    print(f"[PreAuth Pool] Successfully initialized {len(all_customers)} customer accounts and admin in {time.time()-t0:.2f}s.")

    pool_data = {
        "admin": admin_account,
        "customers": all_customers,
    }

    POOL_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(POOL_FILE, "w", encoding="utf-8") as f:
        json.dump(pool_data, f, indent=2)

    _cached_data = pool_data
    return all_customers


def get_preauth_pool(target_size: int = DEFAULT_POOL_SIZE) -> list[dict]:
    """Returns list of customer account dicts."""
    global _cached_data
    if _cached_data is None:
        if POOL_FILE.exists():
            try:
                with open(POOL_FILE, "r", encoding="utf-8") as f:
                    _cached_data = json.load(f)
            except Exception:
                pass

    if _cached_data and isinstance(_cached_data, dict):
        custs = _cached_data.get("customers", [])
        if len(custs) >= target_size and all(is_token_valid_and_fresh(c.get("token", "")) for c in custs[:10]):
            return custs

    return init_preauth_pool(target_size=target_size, force_refresh=False)


def get_admin_account() -> dict | None:
    """Returns the admin account dict."""
    global _cached_data
    if _cached_data and isinstance(_cached_data, dict) and _cached_data.get("admin"):
        adm = _cached_data["admin"]
        if is_token_valid_and_fresh(adm.get("token", "")):
            return adm
    init_preauth_pool(force_refresh=False)
    if _cached_data and isinstance(_cached_data, dict):
        return _cached_data.get("admin")
    return None


def get_admin_headers() -> dict:
    adm = get_admin_account()
    if adm and "headers" in adm:
        return dict(adm["headers"])
    if adm and "token" in adm:
        return {"Authorization": f"Bearer {adm['token']}"}
    return {}


if __name__ == "__main__":
    customers = init_preauth_pool(200, force_refresh=False)
    admin = get_admin_account()
    print(f"Customer pool size: {len(customers)} accounts.")
    print(f"Admin configured: {admin is not None} (User ID: {admin.get('user_id') if admin else 'N/A'})")
