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

POOL_FILE = Path(os.getenv("PREAUTH_POOL_FILE", str(Path(__file__).resolve().parent / "cached_auth_tokens.json"))).resolve()
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


_cached_pool = None

def init_preauth_pool(target_size: int = DEFAULT_POOL_SIZE, force_refresh: bool = False) -> list[dict]:
    """
    Ensure the pre-authenticated account pool exists with at least target_size accounts.
    Returns the list of account dictionaries.
    """
    global _cached_pool
    if not force_refresh and POOL_FILE.exists():
        try:
            with open(POOL_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list) and len(data) >= target_size:
                print(f"[PreAuth Pool] Loaded {len(data)} cached pre-authenticated accounts from {POOL_FILE}.")
                _cached_pool = data
                return data
        except Exception as e:
            print(f"[PreAuth Pool] Error reading cache ({e}); regenerating pool...")

    print(f"[PreAuth Pool] Generating {target_size} pre-authenticated accounts in user-service...")
    t0 = time.time()
    accounts = []

    # Use 8 parallel worker threads to create and login accounts fast
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(create_or_login_account, i) for i in range(target_size)]
        for f in as_completed(futures):
            res = f.result()
            if res:
                accounts.append(res)

    print(f"[PreAuth Pool] Successfully generated {len(accounts)} authenticated accounts in {time.time()-t0:.2f}s.")

    POOL_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(POOL_FILE, "w", encoding="utf-8") as f:
        json.dump(accounts, f, indent=2)

    _cached_pool = accounts
    return accounts


def get_preauth_pool(target_size: int = DEFAULT_POOL_SIZE) -> list[dict]:
    global _cached_pool
    if _cached_pool is None:
        if POOL_FILE.exists():
            try:
                with open(POOL_FILE, "r", encoding="utf-8") as f:
                    _cached_pool = json.load(f)
            except Exception:
                pass
        if _cached_pool is None or len(_cached_pool) < target_size:
            _cached_pool = init_preauth_pool(target_size, force_refresh=False)
    return _cached_pool


if __name__ == "__main__":
    pool = init_preauth_pool(200, force_refresh=False)
    print(f"Pool size: {len(pool)}. Sample user: {pool[0] if pool else 'None'}")

