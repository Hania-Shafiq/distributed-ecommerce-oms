# test_concurrency.py
# ─────────────────────────────────────────────────────────────────────────────
# Concurrency & Race Condition Verification Script for Inventory Service.
#
# Proves that `SELECT ... FOR UPDATE` (Row-Level Locking) + DB Check Constraint
# completely prevents overselling / double-spending under heavy concurrent load.
#
# Test Scenario:
#   • Initial Stock: 10 units for Product #101
#   • Concurrent Buyers: 30 threads attempting to purchase 1 unit simultaneously
#   • Expected Result: Exactly 10 succeed (HTTP 200), exactly 20 rejected (HTTP 409)
#   • Final Stock: EXACTLY 0 (Never negative!)
#
# Run with: python test_concurrency.py
# ─────────────────────────────────────────────────────────────────────────────

import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_URL = "http://localhost:8003"
TEST_PRODUCT_ID = 101
INITIAL_STOCK = 10
TOTAL_CONCURRENT_REQUESTS = 30


def setup_inventory():
    """Initializes or resets test product inventory to INITIAL_STOCK."""
    print("=" * 70)
    print("🛠️  SETTING UP TEST INVENTORY...")
    print("=" * 70)

    # Check if product already exists
    res = requests.get(f"{BASE_URL}/inventory/{TEST_PRODUCT_ID}")
    if res.status_code == 200:
        current_stock = res.json()["stock_quantity"]
        diff = INITIAL_STOCK - current_stock
        if diff > 0:
            requests.put(f"{BASE_URL}/inventory/{TEST_PRODUCT_ID}/restock", json={"amount": diff})
        elif diff < 0:
            requests.put(f"{BASE_URL}/inventory/{TEST_PRODUCT_ID}/reduce", json={"amount": abs(diff)})
    else:
        # Create fresh
        create_res = requests.post(
            f"{BASE_URL}/inventory",
            json={"product_id": TEST_PRODUCT_ID, "stock_quantity": INITIAL_STOCK}
        )
        if create_res.status_code not in (201, 409):
            print(f"❌ Failed to initialize inventory: {create_res.text}")
            return False

    verify_res = requests.get(f"{BASE_URL}/inventory/{TEST_PRODUCT_ID}")
    stock = verify_res.json()["stock_quantity"]
    print(f"✓ Inventory ready: Product #{TEST_PRODUCT_ID} has initial stock = {stock} units.")
    return True


def attempt_purchase(buyer_id: int):
    """Simulates a buyer trying to purchase 1 unit."""
    url = f"{BASE_URL}/inventory/{TEST_PRODUCT_ID}/reduce"
    try:
        response = requests.put(url, json={"amount": 1}, timeout=5.0)
        return buyer_id, response.status_code, response.json()
    except Exception as e:
        return buyer_id, 500, {"error": str(e)}


def run_concurrency_test():
    """Fires 30 simultaneous requests using ThreadPoolExecutor."""
    print("\n" + "=" * 70)
    print(f"⚡ FIRING {TOTAL_CONCURRENT_REQUESTS} SIMULTANEOUS REDUCTION REQUESTS...")
    print(f"   (Available stock: {INITIAL_STOCK} units)")
    print("=" * 70)

    success_count = 0
    conflict_count = 0
    other_errors = 0

    start_time = time.time()

    with ThreadPoolExecutor(max_workers=TOTAL_CONCURRENT_REQUESTS) as executor:
        futures = [executor.submit(attempt_purchase, i + 1) for i in range(TOTAL_CONCURRENT_REQUESTS)]

        for future in as_completed(futures):
            buyer_id, status_code, body = future.result()
            if status_code == 200:
                success_count += 1
                print(f"  [Buyer {buyer_id:02d}] ✅ 200 OK — Stock reserved! Remaining: {body.get('stock_quantity')}")
            elif status_code == 409:
                conflict_count += 1
                print(f"  [Buyer {buyer_id:02d}] 🛑 409 Conflict — Rejected (Out of Stock)")
            else:
                other_errors += 1
                print(f"  [Buyer {buyer_id:02d}] ❌ Error {status_code} — {body}")

    duration = time.time() - start_time

    # Verify final stock in DB
    final_res = requests.get(f"{BASE_URL}/inventory/{TEST_PRODUCT_ID}")
    final_stock = final_res.json()["stock_quantity"]

    print("\n" + "=" * 70)
    print("📊 CONCURRENCY TEST REPORT & DEMO PROOF")
    print("=" * 70)
    print(f"⏱️  Duration:              {duration:.3f} seconds")
    print(f"🎯 Total Requests:         {TOTAL_CONCURRENT_REQUESTS}")
    print(f"✅ Successful Purchases:   {success_count} (Expected: {INITIAL_STOCK})")
    print(f"🛑 Safely Rejected (409):  {conflict_count} (Expected: {TOTAL_CONCURRENT_REQUESTS - INITIAL_STOCK})")
    print(f"⚠️  Other Errors:          {other_errors}")
    print(f"📦 Final Remaining Stock:  {final_stock} units (Expected: 0)")
    print("-" * 70)

    # Final verdict
    if success_count == INITIAL_STOCK and conflict_count == (TOTAL_CONCURRENT_REQUESTS - INITIAL_STOCK) and final_stock == 0:
        print("🏆 VERDICT: PERFECT PASS! 0% OVERSELLING DETECTED.")
        print("   Row-level locking (`SELECT ... FOR UPDATE`) successfully serialized all concurrent requests.")
    else:
        print("❌ VERDICT: TEST FAILED. Race condition detected!")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    if setup_inventory():
        run_concurrency_test()
