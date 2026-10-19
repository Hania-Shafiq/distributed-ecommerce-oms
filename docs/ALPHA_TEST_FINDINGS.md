# Alpha Test Suite Findings & Audit Report

**Date:** 2026-10-19  
**Reference Commit:** `7c16eda7859a2e8d6091455990638540e80c7a07`  
**Test Suite:** `tests/alpha_test.py` (21 scenarios)  
**Final Outcome:** 21 PASS / 0 FAIL (100% passing)  
**Genuine Product Bugs Found:** None (0)

---

## 1. Executive Summary

An audit of the three failures observed during initial runs of `tests/alpha_test.py` on this host was conducted:
1. `Inventory Row-Locking & Anti-Overselling` (Test 9)
2. `Auth: 401 Expired Token` (Test 15)
3. `Auth: Service Key Endpoint Isolation` (Test 18)

All three failures were investigated with live HTTP request traces and container logs. **None of the failures was caused by a service code defect.** Each failure was caused by a configuration mismatch in the test harness: `tests/alpha_test.py` previously used hard-coded fallback development strings for `JWT_SECRET` and `INTERNAL_SERVICE_KEY` when no environment variables were exported in the host shell, whereas the running Docker containers loaded strong generated secrets from the repository-root `.env` file.

Following the update to `tests/alpha_test.py` to source secrets directly from the repository-root `.env` file (with strict validation and no hard-coded defaults), all 21 test scenarios passed cleanly.

---

## 2. Detailed Findings by Scenario

### Scenario 1: Inventory Row-Locking & Anti-Overselling (Test 9)

* **Observed Failure:**
  * Expected: Exactly 1 order succeeds (HTTP 201), 19 fail (HTTP 409 Conflict), final stock = 0.
  * Observed: HTTP 201: 0, HTTP 409: 20, Final Stock: 0.

* **Investigation & Measured Evidence:**
  * In the pre-race setup, the test attempted to initialize Product #5 stock to 1 via:
    `PUT http://localhost:8003/inventory/5/restock` with header `X-Service-Key`.
  * Because `INTERNAL_SERVICE_KEY` was using the hardcoded default string (`"internal_service_mesh_key_secret_ecommerce_2026_dev"`), `inventory-service` rejected the restock request:
    * HTTP Status: `403 Forbidden`
    * Response Body: `{"detail":"Invalid service key"}`
  * The restock call failed silently in the previous script implementation, leaving Product #5 at stock 0 (`Verified stock before race: 0`).
  * When 20 concurrent order saga requests were dispatched to `POST http://localhost:8004/orders`, `order-service` attempted to decrement inventory via:
    `PUT http://inventory-service:8003/inventory/5/reduce`
  * With stock at 0, all 20 saga attempts encountered insufficient stock and returned HTTP 409 Conflict:
    `INFO: 172.18.0.14:56814 - "PUT /inventory/5/reduce HTTP/1.1" 409 Conflict` (20 occurrences)
  * Since initial stock was 0, zero orders could succeed.

* **Root Cause:**
  * Test harness credential mismatch on `INTERNAL_SERVICE_KEY`. Not a product bug.

* **Resolution & Verification:**
  * `tests/alpha_test.py` now loads `INTERNAL_SERVICE_KEY` directly from repo-root `.env` and validates that `Verified stock before race` equals 1, aborting with a clear error if setup fails.
  * Measured result with `.env` key:
    * Restock setup: `HTTP 200 OK`
    * Verified stock before race: `1`
    * Race result: `HTTP 201: 1, HTTP 409: 19, Final Stock: 0`
    * Status: **PASS**

---

### Scenario 2: Auth - 401 Expired Token (Test 15)

* **Observed Failure:**
  * Expected: HTTP 401 Unauthorized with `'Token has expired'`.
  * Observed: HTTP 401 Unauthorized with `{"detail":"Invalid token or signature"}`.

* **Investigation & Measured Evidence:**
  * The test synthesized an expired JWT locally:
    `expired_token = jwt.encode(expired_payload, JWT_SECRET, algorithm="HS256")`
  * Because `JWT_SECRET` was the hardcoded fallback string, the signature was calculated with a secret that did not match the container's `.env` secret.
  * When sent to `GET http://localhost:8004/orders`, `order-service` verified the signature before checking the expiration claims. Because the signature was invalid, `jwt.decode` raised `InvalidSignatureError` / caught generic token error, returning:
    * HTTP Status: `401 Unauthorized`
    * Response Body: `{"detail":"Invalid token or signature"}`
  * When encoded using the real `JWT_SECRET` from `.env`, `order-service` successfully verifies the signature and validates claims, correctly identifying token expiration:
    * HTTP Status: `401 Unauthorized`
    * Response Body: `{"detail":"Token has expired"}`

* **Root Cause:**
  * Test harness credential mismatch on `JWT_SECRET`. Not a product bug.

* **Resolution & Verification:**
  * `tests/alpha_test.py` now loads `JWT_SECRET` directly from repo-root `.env`.
  * Status: **PASS**

---

### Scenario 3: Auth - Service Key Endpoint Isolation (Test 18)

* **Observed Failure:**
  * Expected: Endpoint rejects requests without service key (401/403) and accepts requests with valid service key (HTTP 200).
  * Observed: No key requests rejected (401), but authorized request `PUT /inventory/3/restock` failed.

* **Investigation & Measured Evidence:**
  * The authorized verification step dispatched:
    `PUT http://localhost:8003/inventory/3/restock` with `headers={"X-Service-Key": INTERNAL_SERVICE_KEY}`.
  * Because the hardcoded key was sent, `inventory-service` returned:
    * HTTP Status: `403 Forbidden`
    * Response Body: `{"detail":"Invalid service key"}`
  * When dispatched with the real `INTERNAL_SERVICE_KEY` from `.env`:
    * HTTP Status: `200 OK`
    * Response Body: `{"product_id":3,"stock_quantity":1,"id":4,...}`

* **Root Cause:**
  * Test harness credential mismatch on `INTERNAL_SERVICE_KEY`. Not a product bug.

* **Resolution & Verification:**
  * `tests/alpha_test.py` now loads `INTERNAL_SERVICE_KEY` from repo-root `.env`.
  * Status: **PASS**

---

## 3. Product Search Behavior Observations

Gateway search query execution against `http://localhost:8000/products/search?q=Keyboard`:

* **`mode=lexical` (`GET /products/search?q=Keyboard&mode=lexical`):**
  * Status: `200 OK`
  * Total items returned: `2`
  * First 3 items:
    1. `ID 2`: Mechanical Gaming Keyboard
    2. `ID 12`: Mechanical Gaming Keyboard
    3. *(None - only 2 items returned)*
  * Evaluation: Both returned items are keyboards.

* **Default mode (hybrid) (`GET /products/search?q=Keyboard`):**
  * Status: `200 OK`
  * Total items returned: `20`
  * First 3 items:
    1. `ID 2`: Mechanical Gaming Keyboard
    2. `ID 12`: Mechanical Gaming Keyboard
    3. `ID 3`: Ergonomic Office Chair
  * Evaluation: The first 2 items are keyboards; the 3rd item is an office chair. Under hybrid search (lexical + kNN dense vector search), dense embeddings retrieve semantically associated workstation/electronics items to fill the result set.

---

## 4. Final Suite Summary

```
================================================================================
ALPHA TESTING SUMMARY TABLE
================================================================================
Feature                      | What I Tested                       | Actual Result             | Status
-------------------------------------------------------------------------------------------------------
User Registration            | POST /signup with new unique userna | HTTP 201: {"username":"al | PASS
Duplicate Username Rejection | POST /signup with already registere | HTTP 400: {"detail":"User | PASS
Concurrency & Bloom Filter R | 20 simultaneous POST /signup reques | HTTP 201: 1, HTTP 400: 19 | PASS
Product Exact Search         | GET /products/search?q=Keyboard     | HTTP 200, found 20 produc | PASS
Fuzzy (lexical) search       | GET /products/search?q=headfones (t | HTTP 200, found 20 produc | PASS
Cart State Management        | Add item twice (qty=2), decrement ( | Qty after adds: 2, after  | PASS
SAGA Order Placement (In Sto | POST /orders for product #2 with Cu | HTTP 201, status=CONFIRME | PASS
SAGA Compensation on Zero St | POST /orders for product #10 with s | HTTP 409: {"detail":"Saga | PASS
Inventory Row-Locking & Anti | 20 simultaneous orders for Product  | HTTP 201: 1, HTTP 409: 19 | PASS
Elasticsearch Analytics & Ba | Run sync_orders.py, query analytics | Top selling products: 10, | PASS
Order Idempotency            | Same Idempotency-Key sent 10 times  | Orders created: 1, Stock  | PASS
Auth: 401 Missing Token      | POST /orders and GET /analytics/top | POST /orders: 401, GET /a | PASS
Auth: 403 Customer on Admin  | GET /analytics/top-selling-products | HTTP 403: {"detail":"Admi | PASS
Auth: 401 Tampered Token     | GET /orders with altered JWT signat | HTTP 401: {"detail":"Inva | PASS
Auth: 401 Expired Token      | GET /orders with JWT whose 'exp' ti | HTTP 401: {"detail":"Toke | PASS
Auth: 403 IDOR Protection (C | GET /orders?user_id=1252558 authent | HTTP 403: {"detail":"Forb | PASS
Auth: 403 IDOR Protection (C | POST /orders with body user_id=1252 | HTTP 403: {"detail":"Forb | PASS
Auth: Service Key Endpoint I | PUT /inventory/3/reduce and POST /g | No key inv: 401, No key g | PASS
Similar Products (kNN)       | GET /products/similar/3?limit=5     | HTTP 200, returned 5 item | PASS
Semantic Search vs Lexical   | q='listen to podcasts without distr | Lexical count: 0, Semanti | PASS
Graph Network Admin Access   | GET /graph/network with customer to | Customer: 403, Admin: 200 | PASS
================================================================================
```

Total scenarios: **21**  
Total passed: **21** (100%)  
Total failed: **0**
