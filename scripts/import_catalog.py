#!/usr/bin/env python3
"""
scripts/import_catalog.py
─────────────────────────────────────────────────────────────────────────────
Imports products from data/catalog/catalog_seed.csv into Distributed OMS.

Features:
1. Logs in through the gateway (http://localhost:8000) as admin using
   ADMIN_USERNAME and ADMIN_PASSWORD from .env.
2. Idempotent: checks existing products and skips any names that already exist.
3. Preserves ids 1-33 untouched.
4. Two-phase create: POST /products then POST /inventory.
   If POST /inventory fails, rolls back by calling DELETE /products/{id}.
5. Keeps total catalog size under 600 (analytics caches read limit=1000).
6. Displays post-import counts across products_db, inventory_db, and Elasticsearch.
─────────────────────────────────────────────────────────────────────────────
"""

import os
import sys
import csv
import json
from pathlib import Path
import requests
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"
CATALOG_SEED_CSV = BASE_DIR / "data" / "catalog" / "catalog_seed.csv"

# Load environment
load_dotenv(ENV_PATH)
GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8000").rstrip("/")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

if not ADMIN_USERNAME or not ADMIN_PASSWORD:
    print("ERROR: ADMIN_USERNAME and ADMIN_PASSWORD must be set in .env", file=sys.stderr)
    sys.exit(1)

def get_admin_token() -> str:
    print(f"[Auth] Logging in via gateway ({GATEWAY_URL}/login) as '{ADMIN_USERNAME}'...")
    login_url = f"{GATEWAY_URL}/login"
    payload = {"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
    resp = requests.post(login_url, json=payload, timeout=10)
    if resp.status_code != 200:
        print(f"[Auth] Login failed ({resp.status_code}): {resp.text}", file=sys.stderr)
        sys.exit(1)
    data = resp.json()
    token = data.get("token")
    if not token:
        print(f"[Auth] No token returned in login response: {data}", file=sys.stderr)
        sys.exit(1)
    print(f"[Auth] Login successful. Role: {data.get('user', {}).get('role')}")
    return token

def get_existing_products(token: str) -> list[dict]:
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{GATEWAY_URL}/products?limit=1000"
    resp = requests.get(url, headers=headers, timeout=15)
    if resp.status_code != 200:
        print(f"[Catalog] Failed to fetch existing products: {resp.status_code} {resp.text}", file=sys.stderr)
        sys.exit(1)
    return resp.json()

def import_catalog():
    if not CATALOG_SEED_CSV.exists():
        print(f"ERROR: {CATALOG_SEED_CSV} does not exist. Run scripts/build_catalog_seed.py first.", file=sys.stderr)
        sys.exit(1)

    token = get_admin_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    existing_products = get_existing_products(token)
    existing_count = len(existing_products)
    existing_names = {p["name"].strip().lower() for p in existing_products}
    existing_ids = {p["id"] for p in existing_products}

    print(f"[Catalog] Current catalog has {existing_count} products.")
    print(f"[Catalog] Seed products 1-33 present: {len([i for i in existing_ids if i <= 33])} records. These will NOT be modified.")

    if existing_count >= 600:
        print(f"[Catalog] Total catalog already at {existing_count} (>= 600 limit). Aborting import.")
        sys.exit(0)

    # Read catalog seed CSV
    with open(CATALOG_SEED_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        seed_rows = list(reader)

    print(f"[Catalog] Read {len(seed_rows)} rows from {CATALOG_SEED_CSV}.")

    created_count = 0
    skipped_count = 0
    failed_count = 0

    for idx, row in enumerate(seed_rows, start=1):
        if existing_count + created_count >= 580:
            print(f"[Catalog] Safety limit reached ({existing_count + created_count} products). Stopping import under 600 limit.")
            break

        name = row["name"].strip()
        if name.lower() in existing_names:
            skipped_count += 1
            continue

        category = row["category"].strip()
        price = float(row["price"])
        stock = int(row["stock_quantity"])
        description = row["description"].strip()
        rating = float(row["rating"]) if row.get("rating") else None

        prod_payload = {
            "name": name,
            "category": category,
            "price": price,
            "description": description,
            "stock_quantity": stock,
            "rating": rating,
        }

        # Step 1: POST /products
        prod_resp = requests.post(f"{GATEWAY_URL}/products", json=prod_payload, headers=headers, timeout=10)
        if prod_resp.status_code != 201:
            print(f"[Error] Failed to create product '{name}': {prod_resp.status_code} {prod_resp.text}")
            failed_count += 1
            continue

        created_prod = prod_resp.json()
        product_id = created_prod["id"]

        # Step 2: POST /inventory
        inv_payload = {
            "product_id": product_id,
            "stock_quantity": stock,
        }
        inv_resp = requests.post(f"{GATEWAY_URL}/inventory", json=inv_payload, headers=headers, timeout=10)
        if inv_resp.status_code != 201:
            print(f"[Error] Failed to create inventory for product id {product_id}. Rolling back product deletion...")
            del_resp = requests.delete(f"{GATEWAY_URL}/products/{product_id}", headers=headers, timeout=10)
            print(f"[Rollback] Product {product_id} delete status: {del_resp.status_code}")
            failed_count += 1
            continue

        created_count += 1
        existing_names.add(name.lower())

        if created_count % 50 == 0:
            print(f"  Imported {created_count} products so far...")

    print("\n" + "=" * 60)
    print("IMPORT SUMMARY:")
    print("=" * 60)
    print(f"  Successfully imported: {created_count}")
    print(f"  Skipped (already exists): {skipped_count}")
    print(f"  Failed: {failed_count}")
    print(f"  Total catalog size now: {existing_count + created_count}")
    print("=" * 60)

    # Show verified counts across all systems
    print("\n[Verification] Querying counts from products_db, inventory_db, and Elasticsearch...")
    show_counts()

def show_counts():
    import subprocess
    # products_db count
    try:
        p_res = subprocess.run(
            ["docker", "exec", "products_db", "psql", "-U", "postgres", "-d", "products_db", "-t", "-c", "SELECT count(*) FROM products;"],
            capture_output=True, text=True, check=True
        )
        products_count = p_res.stdout.strip()
    except Exception as e:
        products_count = f"Error: {e}"

    # inventory_db count
    try:
        i_res = subprocess.run(
            ["docker", "exec", "inventory_db", "psql", "-U", "postgres", "-d", "inventory_db", "-t", "-c", "SELECT count(*) FROM inventory;"],
            capture_output=True, text=True, check=True
        )
        inventory_count = i_res.stdout.strip()
    except Exception as e:
        inventory_count = f"Error: {e}"

    # Elasticsearch count
    try:
        es_res = requests.get("http://localhost:9200/products/_count", timeout=5)
        if es_res.status_code == 200:
            es_count = str(es_res.json().get("count"))
        else:
            es_count = f"HTTP {es_res.status_code}"
    except Exception as e:
        es_count = f"Error: {e}"

    print(f"  • products_db:   {products_count} records")
    print(f"  • inventory_db:  {inventory_count} records")
    print(f"  • Elasticsearch: {es_count} documents")

if __name__ == "__main__":
    import_catalog()
