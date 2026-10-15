# seed_data.py
# ─────────────────────────────────────────────────────────────────────────────
# Standalone script that loads products from products_seed.csv and POSTs (or
# updates) them via the running Product Service.
#
# Prerequisites:
#   • Product Service must be running on port 8006 (docker compose or uvicorn)
#   • 'requests' library must be installed:  pip install requests
#
# Usage:
#   python seed_data.py
#   python seed_data.py path/to/custom.csv
#
# CSV columns (image_url is optional — omit or leave blank for bulk loads):
#   name, category, price, description, stock_quantity [, image_url]
# ─────────────────────────────────────────────────────────────────────────────

import csv
import sys
from pathlib import Path

import requests

BASE_URL = "http://localhost:8006"   # Product Service port
PRODUCTS_ENDPOINT = f"{BASE_URL}/products"
DEFAULT_CSV = Path(__file__).with_name("products_seed.csv")

# Fields accepted by ProductCreate / ProductUpdate. Extra CSV columns are ignored.
PRODUCT_FIELDS = ("name", "category", "price", "description", "stock_quantity", "image_url")


def _parse_row(row: dict) -> dict | None:
    """
    Convert a CSV row dict into a product payload.
    Returns None for blank/invalid rows.
    image_url may be missing or empty — left as None (bulk-load safe).
    """
    name = (row.get("name") or "").strip()
    if not name:
        return None

    try:
        price = float(row.get("price") or 0)
        stock = int(float(row.get("stock_quantity") or 0))
    except (TypeError, ValueError):
        print(f"  [SKIP] Invalid price/stock for {name!r}")
        return None

    if price <= 0:
        print(f"  [SKIP] price must be > 0 for {name!r}")
        return None

    image_url = (row.get("image_url") or "").strip() or None

    return {
        "name": name,
        "category": (row.get("category") or "General").strip() or "General",
        "price": price,
        "description": (row.get("description") or "").strip() or None,
        "stock_quantity": max(0, stock),
        "image_url": image_url,
    }


def load_products_from_csv(csv_path: Path) -> list[dict]:
    """Read products from CSV. Works with or without an image_url column."""
    if not csv_path.is_file():
        raise FileNotFoundError(f"Seed CSV not found: {csv_path}")

    products = []
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames or "name" not in reader.fieldnames:
            raise ValueError("CSV must include a 'name' column header")

        for row in reader:
            parsed = _parse_row(row)
            if parsed:
                products.append(parsed)

    return products


def _existing_by_name() -> dict[str, dict]:
    """Fetch current catalog and index by exact product name."""
    try:
        response = requests.get(PRODUCTS_ENDPOINT, params={"limit": 1000}, timeout=15)
        response.raise_for_status()
        return {p["name"]: p for p in response.json()}
    except requests.exceptions.RequestException:
        return {}


def seed(csv_path: Path | None = None):
    """
    Upsert each product from the CSV into the Product Service:
      • If a product with the same name already exists → PUT (updates image_url etc.)
      • Otherwise → POST create
    """
    path = csv_path or DEFAULT_CSV
    products = load_products_from_csv(path)

    print("=" * 60)
    print(f"  Seeding {len(products)} products from {path.name}")
    print(f"  -> {PRODUCTS_ENDPOINT}")
    print("=" * 60)

    if not products:
        print("  No products found in CSV. Nothing to do.")
        return

    existing = _existing_by_name()
    success_count = 0
    failure_count = 0

    for product in products:
        try:
            match = existing.get(product["name"])
            if match:
                response = requests.put(
                    f"{PRODUCTS_ENDPOINT}/{match['id']}",
                    json=product,
                    timeout=10,
                )
                ok_status = 200
                action = "UPD"
            else:
                response = requests.post(
                    PRODUCTS_ENDPOINT,
                    json=product,
                    timeout=10,
                )
                ok_status = 201
                action = "NEW"

            if response.status_code == ok_status:
                created = response.json()
                img = created.get("image_url") or "(none)"
                print(f"  [{action}] id={created['id']:>3}  {created['name']}  img={img}")
                success_count += 1
            else:
                print(
                    f"  [ERR] {product['name']!r}  ->  "
                    f"HTTP {response.status_code}: {response.text}"
                )
                failure_count += 1

        except requests.exceptions.ConnectionError:
            print(
                f"\n  [FATAL] Cannot connect to {PRODUCTS_ENDPOINT}.\n"
                f"  Make sure the Product Service is running:\n"
                f"    docker compose up -d product-service\n"
                f"    # or: uvicorn main:app --reload --port 8006\n"
            )
            return

        except requests.exceptions.Timeout:
            print(f"  [TIMEOUT] Request timed out for {product['name']!r}. Skipping.")
            failure_count += 1

    print("-" * 60)
    print(f"  Done. {success_count} seeded successfully, {failure_count} failed.")
    print("=" * 60)


if __name__ == "__main__":
    custom = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    seed(custom)
