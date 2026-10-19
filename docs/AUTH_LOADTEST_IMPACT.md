# Authentication & Authorization: Load Test Impact & Breakage Report

**Document**: `docs/AUTH_LOADTEST_IMPACT.md`  
**Date**: October 17, 2026  
**Branch**: `feature/as-built-fixes`  
**Subject**: Analysis of real JWT authentication & RBAC impact on Locust load tests, pre-auth caching, and orchestrator scripts.

---

## 1. Executive Summary

With the introduction of cryptographic token issuing (PyJWT HS256), stateless token verification (`auth.py`), strict Role-Based Access Control (RBAC), and internal service-to-service mesh isolation (`X-Service-Key`), previously unauthenticated load test scenarios will encounter significant breaking changes.

Previously:
- `user-service/login` issued an opaque random string (`"jwt_" + token_urlsafe`).
- Downstream microservices accepted requests without verifying signatures, expirations, or caller identity (`sub`).
- Customers could query any user's order history, place orders on behalf of any `user_id`, and execute administrative Elasticsearch aggregations without authorization.

Under the new authentication & authorization policy, unauthenticated or cross-tenant requests return **HTTP 401 Unauthorized** or **HTTP 403 Forbidden**. This document provides an itemized impact analysis across all load testing components, specific file and line citations, and actionable migration steps.

---

## 2. Itemized Breakage Matrix

| Component | Target File & Lines | Previous Behavior | New Behavior | Impact & Failure Mode |
| :--- | :--- | :--- | :--- | :--- |
| **Pre-Auth Token Cache** | `loadtest/preauth_pool.py`<br>`loadtest/cached_auth_tokens.json` | Cached opaque strings (`"jwt_..."`) | Microservices strictly parse & verify PyJWT HS256 signatures with `JWT_SECRET` | **Total Failure (401)**: All virtual users using stale tokens fail with HTTP 401 `Invalid token or signature`. |
| **Smoke Test (Analytics)** | `locustfile.py:507-511`<br>(`SmokeUser.test_all_endpoints`) | Anonymous `GET /analytics/*` returned HTTP 200 | Admin authorization required via `require_admin` | **Regression (401)**: `SmokeUser` calls 4 analytics endpoints without headers, failing Phase 1 smoke test. |
| **Smoke Test (Orders)** | `locustfile.py:481-487`<br>(`SmokeUser.test_all_endpoints`) | Fallback to `uid = _real_user_ids[0]` or `1` | Strict IDOR check: `str(order.user_id) == str(caller_sub)` | **Regression (403)**: If `self.user_id` is mismatched with token `sub`, order creation fails with HTTP 403. |
| **Read-Heavy User (Orders)** | `locustfile.py:359-370`<br>(`ReadHeavyUser.order_history`) | Anonymous `GET /orders?user_id={uid}` returned HTTP 200 | Customer token required matching `user_id` query param | **Regression (401)**: `ReadHeavyUser` sends no auth headers, returning 100% HTTP 401 errors. |
| **Read-Heavy User (Analytics)** | `locustfile.py:371-406`<br>(`ReadHeavyUser.admin_analytics_*`) | Anonymous calls to `/analytics/revenue-by-category`, etc. returned HTTP 200 | Admin token required via `require_admin` | **Regression (401)**: 3 analytics tasks called without auth headers fail with HTTP 401. |
| **Ramp User (Analytics)** | `locustfile.py:742-751`<br>(`RampUser.analytics`) | Anonymous calls to `/analytics/*` with weight 2 returned HTTP 200 | Restricted to role `admin` | **Regression (401)**: `RampUser` (customer tokens) calls `/analytics/*` without admin role, failing with HTTP 401/403. |
| **Scenario C (Last Unit)** | `locustfile.py:621-625`<br>(`LastUnitUser.on_start`) | Fallback to `_get_random_user_id()` | Payload `user_id` must strictly match JWT `sub` claim | **Regression (403)**: If account pool falls back to random user ID, order placement fails with HTTP 403 Forbidden. |
| **Orchestrator DB Seed** | `loadtest/run_loadtest.py:386-390` | Directly updates `inventory_db` via SQL connection | Allowed, but any API-level restock via gateway requires `X-Service-Key` | **Notice**: Direct DB access unaffected, but automated REST-based health checks must use service headers. |

---

## 3. Deep-Dive by Load Test Scenario

### 3.1 `SmokeUser` (`locustfile.py:432-515`)
- **Root Cause**: `SmokeUser` logs in as a regular customer account created dynamically during `on_start()`. At lines 507–511, it invokes:
  ```python
  self.client.get(f"{ANALYTICS_SVC}/analytics/revenue-by-category")
  self.client.get(f"{ANALYTICS_SVC}/analytics/top-selling-products")
  self.client.get(f"{ANALYTICS_SVC}/analytics/order-status")
  self.client.get(f"{ANALYTICS_SVC}/analytics/total-products")
  ```
  None of these calls pass an `Authorization` header.
- **Expected Status**: Previously `200 OK`.
- **Actual Status**: `401 Unauthorized` (`detail: Authentication required`).
- **Remediation**:
  1. Authenticate an administrative account (`admin` role) or promote smoke user using `user-service/set_admin.py`.
  2. Pass `headers={"Authorization": f"Bearer {admin_token}"}` to all analytics requests.

### 3.2 `ReadHeavyUser` (`locustfile.py:315-420`)
- **Root Cause**:
  1. Line 360 calls `_get_random_user_id()` and queries `GET /orders?user_id={uid}` anonymously. Returns `401 Unauthorized`.
  2. Lines 371–406 simulate customer traffic running admin analytics tasks with weights 1 each without auth headers. Returns `401 Unauthorized`.
- **Architectural Conflict**: Real e-commerce customers browsing products do not query back-office Elasticsearch rollups. Analytics tasks should be completely decoupled from customer read personas.
- **Remediation**:
  1. Remove `admin_analytics_*` tasks from `ReadHeavyUser`.
  2. Create a dedicated `AdminDashboardUser` class that logs in as an admin and polls `/analytics/*`.
  3. Ensure `order_history` fetches orders for the authenticated user only (`params={"user_id": self.user_id}`).

### 3.3 `RampUser` (`locustfile.py:663-780`)
- **Root Cause**:
  `RampUser` pulls test accounts from `loadtest/cached_auth_tokens.json`.
  1. If `cached_auth_tokens.json` was generated prior to signed JWTs, all tokens are rejected with `401 Unauthorized`.
  2. At lines 742–750, `RampUser` invokes `@task(2) def analytics(self):` without headers. Even if headers are passed, customer role tokens receive `403 Forbidden` (`detail: Admin access required`).
- **Remediation**:
  1. Re-run `python loadtest/preauth_pool.py` to regenerate `cached_auth_tokens.json` with valid HS256 JWT tokens.
  2. Deprecate `@task(2) def analytics` within `RampUser`, or configure it to use a dedicated admin token pool.

### 3.4 `LastUnitUser` (Scenario C: `locustfile.py:597-657`)
- **Root Cause**:
  Line 622 has fallback logic: `self.user_id = account.get("user_id") or _get_random_user_id()`.
  If the account pool is empty or malformed and falls back to a random user ID while using another account's token, `order-service` raises:
  `HTTP 403 Forbidden: {"detail": "Forbidden: Cannot place order for another user"}`
- **Remediation**:
  Enforce strict 1-to-1 binding: `self.user_id = int(account["user_id"])` and `self.token = account["token"]`.

---

## 4. Migration & Resolution Playbook

To ensure the load test suite executes seamlessly with 0 auth errors while retaining full cryptographic verification:

### Step 1: Invalidate and Re-Generate Auth Token Cache
```bash
# Delete legacy tokens
rm loadtest/cached_auth_tokens.json

# Regenerate fresh signed PyJWT tokens with real user accounts
python loadtest/preauth_pool.py
```

### Step 2: Provision Dedicated Admin Token Pool
Create an admin user and export their Bearer token for load testing:
```bash
# 1. Signup admin account
curl -s -X POST http://localhost:8000/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"loadtest_admin","email":"loadtest_admin@example.com","password":"AdminLoadtestPass!"}'

# 2. Elevate role to admin in user_db
docker exec user-service python set_admin.py loadtest_admin

# 3. Log in to obtain signed admin JWT
curl -s -X POST http://localhost:8000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"loadtest_admin","password":"AdminLoadtestPass!"}'
```

### Step 3: Decouple Admin Analytics from Customer Virtual Users
Refactor `locustfile.py`:
- Move `/analytics/*` tasks into an `AdminVirtualUser(HttpUser)` class.
- Pass `Authorization: Bearer <admin_token>` for all analytical queries.
- Ensure all `POST /orders` payloads pass `user_id` identical to the JWT `sub` claim.

---

## 5. Conclusion

Implementing cryptographic token signing and role enforcement successfully closes all privilege escalation vulnerabilities and IDOR vectors in the Distributed OMS. By updating `loadtest/cached_auth_tokens.json` and attaching proper authentication headers to Locust tasks, the OMS performance benchmarks will accurately reflect real-world authenticated production traffic.
