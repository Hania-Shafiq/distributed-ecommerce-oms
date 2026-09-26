# seed_data.py
# ─────────────────────────────────────────────────────────────────────────────
# Standalone script that POSTs sample products to the running Product Service.
#
# Prerequisites:
#   • Product Service must be running:  uvicorn main:app --reload --port 8001
#   • 'requests' library must be installed:  pip install requests
#
# Usage:
#   python seed_data.py
# ─────────────────────────────────────────────────────────────────────────────

import requests
import json

BASE_URL = "http://localhost:8006"   # Product Service port
PRODUCTS_ENDPOINT = f"{BASE_URL}/products"

# ── Sample product data ───────────────────────────────────────────────────────
# Each dict matches the ProductCreate schema (name, category, price,
# description, stock_quantity).  'description' is optional.
SAMPLE_PRODUCTS = [
    {
        "name": "Wireless Noise-Cancelling Headphones",
        "category": "Electronics",
        "price": 249.99,
        "description": "Over-ear Bluetooth headphones with 30-hour battery life and active noise cancellation.",
        "stock_quantity": 120,
    },
    {
        "name": "Mechanical Gaming Keyboard",
        "category": "Electronics",
        "price": 89.95,
        "description": "TKL layout with Cherry MX Red switches, RGB backlighting, and USB-C connection.",
        "stock_quantity": 75,
    },
    {
        "name": "Ergonomic Office Chair",
        "category": "Furniture",
        "price": 399.00,
        "description": "Adjustable lumbar support, mesh back, and armrests. Suitable for long work sessions.",
        "stock_quantity": 30,
    },
    {
        "name": "Stainless Steel Water Bottle",
        "category": "Kitchen",
        "price": 29.99,
        "description": "Double-wall insulated, keeps drinks cold 24 h or hot 12 h. BPA-free, 1-litre capacity.",
        "stock_quantity": 200,
    },
    {
        "name": "Yoga Mat",
        "category": "Sports & Outdoors",
        "price": 45.00,
        "description": "6mm thick non-slip TPE mat with carry strap. Suitable for all yoga and pilates styles.",
        "stock_quantity": 150,
    },
    {
        "name": "4K USB-C Monitor 27 inch",
        "category": "Electronics",
        "price": 549.00,
        "description": "IPS panel, 60 Hz refresh rate, USB-C Power Delivery 90 W, HDMI 2.1 and DisplayPort 1.4.",
        "stock_quantity": 45,
    },
    {
        "name": "Electric Kettle",
        "category": "Kitchen",
        "price": 34.99,
        "description": "1.7-litre capacity, 1500 W rapid boil, auto shut-off and boil-dry protection.",
        "stock_quantity": 180,
    },
    {
        "name": "Running Shoes Mens",
        "category": "Sports & Outdoors",
        "price": 119.00,
        "description": "Lightweight mesh upper with responsive foam midsole. Available in sizes 7-13 US.",
        "stock_quantity": 95,
    },
    {
        "name": "Leather Wallet",
        "category": "Accessories",
        "price": 49.99,
        "description": "Slim bi-fold wallet with RFID blocking, 6 card slots, and full-grain leather finish.",
        "stock_quantity": 300,
    },
    {
        "name": "Portable Bluetooth Speaker",
        "category": "Electronics",
        "price": 79.99,
        "description": "IPX7 waterproof, 360-degree sound, 12-hour playtime, USB-C rechargeable.",
        "stock_quantity": 60,
    },
]


# ── Core seed function ────────────────────────────────────────────────────────
def seed():
    """
    POST each product in SAMPLE_PRODUCTS to the Product Service REST API.
    Prints a success or failure line for every product so progress is visible.
    """
    print("=" * 60)
    print(f"  Seeding {len(SAMPLE_PRODUCTS)} products -> {PRODUCTS_ENDPOINT}")
    print("=" * 60)

    success_count = 0
    failure_count = 0

    for product in SAMPLE_PRODUCTS:
        try:
            response = requests.post(
                PRODUCTS_ENDPOINT,
                json=product,         # automatically sets Content-Type: application/json
                timeout=10,           # don't hang forever if the server is down
            )

            if response.status_code == 201:
                created = response.json()
                print(f"  [OK]  id={created['id']:>3}  {created['name']}")
                success_count += 1
            else:
                # Server responded but with an error status (e.g., 422 validation error)
                print(f"  [ERR] {product['name']!r}  ->  HTTP {response.status_code}: {response.text}")
                failure_count += 1

        except requests.exceptions.ConnectionError:
            print(
                f"\n  [FATAL] Cannot connect to {PRODUCTS_ENDPOINT}.\n"
                f"  Make sure the Product Service is running:\n"
                f"    uvicorn main:app --reload --port 8001\n"
            )
            return   # no point continuing if the server is unreachable

        except requests.exceptions.Timeout:
            print(f"  [TIMEOUT] Request timed out for {product['name']!r}. Skipping.")
            failure_count += 1

    # ── Summary ───────────────────────────────────────────────────────────────
    print("-" * 60)
    print(f"  Done. {success_count} seeded successfully, {failure_count} failed.")
    print("=" * 60)


# ── Entry point ───────────────────────────────────────────────────────────────
# This guard ensures seed() is only called when the script is run directly
# (python seed_data.py) and NOT when it is imported as a module by another file.
if __name__ == "__main__":
    seed()
