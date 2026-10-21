"""
search_relevance_test.py - Automated Search Relevance & Precision Test Suite
Tests gateway search endpoints (http://localhost:8000/products/search)
to verify kNN thresholding, fuzzy lexical matching, and semantic query capabilities.
"""

import os
import sys
import requests

BASE_GATEWAY_URL = os.getenv("BASE_GATEWAY_URL", "http://localhost:8000")

def run_tests():
    print("=" * 70)
    print("SEARCH RELEVANCE AUTOMATED VERIFICATION SUITE")
    print(f"Target Gateway: {BASE_GATEWAY_URL}")
    print("=" * 70)

    # 0. Measure total catalog size
    r_catalog = requests.get(f"{BASE_GATEWAY_URL}/products", timeout=10)
    assert r_catalog.status_code == 200, f"Failed to fetch catalog: {r_catalog.status_code}"
    catalog_items = r_catalog.json()
    catalog_size = len(catalog_items)
    print(f"[INFO] Current Catalog Size: {catalog_size} products\n")

    test_results = []

    # --------------------------------------------------------------------------
    # Assertion (a): q=Keyboard returns fewer items than catalog size, first is keyboard
    # --------------------------------------------------------------------------
    print("--- TEST A: q=Keyboard relevance & catalog saturation check ---")
    r_a = requests.get(f"{BASE_GATEWAY_URL}/products/search?q=Keyboard", timeout=10)
    assert r_a.status_code == 200, f"Search failed: {r_a.status_code}"
    data_a = r_a.json()
    items_a = data_a.get("results", [])
    count_a = len(items_a)
    first_a = items_a[0]["name"] if items_a else "None"
    passed_a = (count_a < catalog_size) and ("keyboard" in first_a.lower())
    print(f"  Count: {count_a} (Catalog: {catalog_size}) | First Result: '{first_a}'")
    assert count_a < catalog_size, f"Expected < {catalog_size} items, got {count_a}"
    assert "keyboard" in first_a.lower(), f"Expected first result to be a keyboard, got '{first_a}'"
    test_results.append(("Assertion (a): q=Keyboard filtered & top is keyboard", f"{count_a} items (< {catalog_size}), Top: {first_a}", "PASS"))

    # --------------------------------------------------------------------------
    # Assertion (b): q=zzzxqv returns 0 or at most 1 item
    # --------------------------------------------------------------------------
    print("\n--- TEST B: q=zzzxqv nonsense query noise rejection ---")
    r_b = requests.get(f"{BASE_GATEWAY_URL}/products/search?q=zzzxqv", timeout=10)
    assert r_b.status_code == 200, f"Search failed: {r_b.status_code}"
    data_b = r_b.json()
    items_b = data_b.get("results", [])
    count_b = len(items_b)
    print(f"  Count: {count_b} | Items: {[i['name'] for i in items_b]}")
    assert count_b <= 1, f"Expected <= 1 items for nonsense query, got {count_b}"
    test_results.append(("Assertion (b): q=zzzxqv noise suppression", f"{count_b} items (<= 1)", "PASS"))

    # --------------------------------------------------------------------------
    # Assertion (c): q=headfones still returns at least one headphones product
    # --------------------------------------------------------------------------
    print("\n--- TEST C: q=headfones fuzzy lexical matching check ---")
    r_c = requests.get(f"{BASE_GATEWAY_URL}/products/search?q=headfones", timeout=10)
    assert r_c.status_code == 200, f"Search failed: {r_c.status_code}"
    data_c = r_c.json()
    items_c = data_c.get("results", [])
    count_c = len(items_c)
    has_headphones = any("headphone" in i["name"].lower() for i in items_c)
    top_c = items_c[0]["name"] if items_c else "None"
    print(f"  Count: {count_c} | Top Result: '{top_c}' | Contains headphones: {has_headphones}")
    assert count_c >= 1, f"Expected >= 1 item, got {count_c}"
    assert has_headphones, f"Expected at least one headphone product in results: {[i['name'] for i in items_c]}"
    test_results.append(("Assertion (c): q=headfones fuzzy lexical match", f"{count_c} items, Has headphones: {has_headphones}", "PASS"))

    # --------------------------------------------------------------------------
    # Assertion (d): Natural language query in hybrid mode
    # --------------------------------------------------------------------------
    print("\n--- TEST D: Natural language query 'listen to podcasts without distractions' ---")
    nl_query = "listen to podcasts without distractions"
    r_d = requests.get(f"{BASE_GATEWAY_URL}/products/search?q={requests.utils.quote(nl_query)}&mode=hybrid", timeout=10)
    assert r_d.status_code == 200, f"Search failed: {r_d.status_code}"
    data_d = r_d.json()
    items_d = data_d.get("results", [])
    count_d = len(items_d)
    top_d = items_d[0]["name"] if items_d else "None"
    print(f"  Count: {count_d} | Top Result: '{top_d}'")
    assert count_d >= 1, f"Expected >= 1 result for natural language query, got {count_d}"
    assert "headphone" in top_d.lower(), f"Expected top result to be headphones, got '{top_d}'"
    test_results.append(("Assertion (d): NL query semantic match", f"{count_d} items, Top: {top_d}", "PASS"))

    # --------------------------------------------------------------------------
    # Summary Table
    # --------------------------------------------------------------------------
    print("\n" + "=" * 80)
    print(f"{'Assertion':<45} | {'Measured Result':<25} | {'Status'}")
    print("-" * 80)
    for name, res, status in test_results:
        print(f"{name:<45} | {res:<25} | {status}")
    print("=" * 80)
    print(f"[ALL PASS] All {len(test_results)} search relevance assertions passed successfully!\n")

if __name__ == "__main__":
    run_tests()
