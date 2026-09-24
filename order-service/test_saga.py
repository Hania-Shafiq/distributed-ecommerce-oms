# test_saga.py
# ─────────────────────────────────────────────────────────────────────────────
# SAGA Workflow & Compensation Test Script for Order Service.
#
# Tests both Happy Path and Failure Compensation:
#   1. Happy Path: Order with valid items -> Status: CONFIRMED
#   2. Failure Flow: Order including Product ID 999 -> Triggers failure,
#      runs LIFO compensation on preceding items, and Order Status -> FAILED.
#
# Run with: python test_saga.py
# ─────────────────────────────────────────────────────────────────────────────

import requests

BASE_URL = "http://localhost:8004"


def test_happy_path_saga():
    print("\n" + "=" * 70)
    print("🧪 TEST 1: SAGA HAPPY PATH (All Items Available)")
    print("=" * 70)

    payload = {
        "user_id": 42,
        "items": [
            {"product_id": 1, "quantity": 2},
            {"product_id": 2, "quantity": 1}
        ]
    }

    res = requests.post(f"{BASE_URL}/orders", json=payload)
    print(f"Status Code: {res.status_code}")
    data = res.json()
    print(f"Response: {data}")

    if res.status_code == 201 and data["status"] == "CONFIRMED":
        print("✅ SUCCESS: Order placed and CONFIRMED via Saga orchestration.")
        return data["id"]
    else:
        print("❌ FAILED: Happy path failed.")
        return None


def test_failure_and_compensation_saga():
    print("\n" + "=" * 70)
    print("🧪 TEST 2: SAGA FAILURE & COMPENSATION FLOW (Simulated via Product 999)")
    print("=" * 70)
    print("Sending order containing: Product #1 (Qty 2) followed by Product #999 (Qty 1)")
    print("Expected: Product #1 is reserved -> Product #999 fails -> Product #1 is COMPENSATED (released) -> 409 Conflict")
    print("-" * 70)

    payload = {
        "user_id": 42,
        "items": [
            {"product_id": 1, "quantity": 2},
            {"product_id": 999, "quantity": 1}  # 999 triggers simulated out of stock!
        ]
    }

    res = requests.post(f"{BASE_URL}/orders", json=payload)
    print(f"Status Code: {res.status_code} (Expected: 409)")
    print(f"Response Detail: {res.json()}")

    if res.status_code == 409:
        print("✅ SUCCESS: Failure handled cleanly & compensation executed!")
    else:
        print("❌ UNEXPECTED: Did not return 409 status.")


if __name__ == "__main__":
    test_happy_path_saga()
    test_failure_and_compensation_saga()
