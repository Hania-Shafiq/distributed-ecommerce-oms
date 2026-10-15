"""
loadtest/preauth_pool.py
─────────────────────────────────────────────────────────────────────────────
Pre-authenticates a pool of ~200 test accounts and caches their JWT tokens
to disk (loadtest/cached_auth_tokens.json).

Virtual users in RampUser and LastUnitUser pick from this cached pool upon
spawning, completely eliminating the login/signup storm and bcrypt hashing
during ramp-up.
─────────────────────────────────────────────────────────────────────────────
"""

import json
import os
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import requests

POOL_FILE = Path(__file__).resolve().parent / "cached_auth_tokens.json"
BASE_IP = os.getenv("BASE_IP", "localhost")
USER_SVC = f"http://{BASE_IP}:8001"
DEFAULT_POOL_SIZE = 200


def create_or_login_account(idx: int) -> dict | None:
    username = f"preauth_usr_{idx:03d}"
    email = f"{username}@example.com"
    password = "PreAuthPass123!"

    session = requests.Session()
    # Try signup first
    try:
        su = session.post(
            f"{USER_SVC}/signup",
            json={"username": username, "email": email, "password": password},
            timeout=15,
        )
    except Exception as e:
        su = None

    # Then login
    try:
        li = session.post(
            f"{USER_SVC}/login",
            json={"username": username, "password": password},
            timeout=15,
        )
        if li.status_code == 200:
            data = li.json()
            user_id = data.get("user", {}).get("id")
            token = data.get("token")
            if user_id and token:
                return {
                    "username": username,
                    "user_id": user_id,
                    "token": token,
                    "headers": {"Authorization": f"Bearer {token}"},
                }
    except Exception as e:
        pass
    return None


def init_preauth_pool(target_size: int = DEFAULT_POOL_SIZE, force_refresh: bool = False) -> list[dict]:
    """
    Ensure the pre-authenticated account pool exists with at least target_size accounts.
    Returns the list of account dictionaries.
    """
    if not force_refresh and POOL_FILE.exists():
        try:
            with open(POOL_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list) and len(data) >= target_size:
                print(f"[PreAuth Pool] Loaded {len(data)} cached pre-authenticated accounts from {POOL_FILE.name}.")
                return data
        except Exception as e:
            print(f"[PreAuth Pool] Error reading cache ({e}); regenerating pool...")

    print(f"[PreAuth Pool] Generating {target_size} pre-authenticated accounts in user-service...")
    t0 = time.time()
    accounts = []

    # Use 4 parallel worker threads to create and login accounts
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(create_or_login_account, i) for i in range(target_size)]
        for f in as_completed(futures):
            res = f.result()
            if res:
                accounts.append(res)

    print(f"[PreAuth Pool] Successfully generated {len(accounts)} authenticated accounts in {time.time()-t0:.2f}s.")

    POOL_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(POOL_FILE, "w", encoding="utf-8") as f:
        json.dump(accounts, f, indent=2)

    return accounts


_cached_pool = None

def get_preauth_pool(target_size: int = DEFAULT_POOL_SIZE) -> list[dict]:
    global _cached_pool
    if _cached_pool is None:
        _cached_pool = init_preauth_pool(target_size)
    return _cached_pool


if __name__ == "__main__":
    pool = init_preauth_pool(200, force_refresh=False)
    print(f"Pool size: {len(pool)}. Sample user: {pool[0] if pool else 'None'}")
