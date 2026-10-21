# Website Data Visibility & Endpoint Guide

This document details how backend data is exposed to the frontend, the permission boundaries between customers and administrators, and known system operational characteristics.

---

## 1. Demo Accounts

For testing and demonstrating order history and customer-specific views, pre-existing accounts with order records are documented in:
👉 [DEMO_ACCOUNTS.md](DEMO_ACCOUNTS.md)

Summary of active customer accounts with existing orders:
- **User ID 11** (`custA_6021775e`): 23 orders (multi-page history)
- **User ID 10** (`uniba1`): 6 orders
- **User ID 9** (`testuserk`): 1 order

---

## 2. Endpoints Exposing Data on Frontend

All frontend requests route through the Nginx API Gateway at `http://localhost:8000`:

| Frontend View / Component | HTTP Method & Route | Upstream Service | Data Exposed |
|---------------------------|----------------------|------------------|--------------|
| **Product Catalog** (`/`) | `GET /products` | `product-service:8006` | Paginated product list, titles, prices, descriptions, categories |
| **Product Search** | `GET /products/search?q={query}` | `product-service:8006` | Elasticsearch / database matched catalog items |
| **Recommendations** | `GET /recommendations/{id}` | `recommendation-service:8005` | Neo4j graph recommendations & "also bought" items |
| **Customer Orders** (`/orders`) | `GET /orders?user_id={id}&skip={offset}&limit={limit}` | `order-service:8004` | Order timeline, line items, item price, order status, totals |
| **Admin Analytics: Overview** | `GET /analytics/overview` | `admin-analytics:8002` | KPI metrics (total orders, confirmed, failed, total revenue, AOV, sync status) |
| **Admin Analytics: Revenue Trend** | `GET /analytics/revenue-trend?days={n}` | `admin-analytics:8002` | Daily aggregated revenue & order volume |
| **Admin Analytics: Weekday Distribution** | `GET /analytics/orders-by-weekday` | `admin-analytics:8002` | Order volume and revenue grouped by day of the week |
| **Admin Analytics: Top Products & Categories** | `GET /analytics/top-selling-products`<br>`GET /analytics/revenue-by-category` | `admin-analytics:8002` | Aggregated sales volume by item and category |
| **Admin Catalog Metrics** | `GET /analytics/total-products`<br>`GET /analytics/category-summary`<br>`GET /analytics/low-stock` | `admin-analytics:8002` | Inventory stock alerts, category averages, product count |
| **Admin Orders Ledger** (`/admin`) | `GET /orders?created_from=...&created_to=...&status=...&skip=...&limit=...` | `order-service:8004` | Filtered, store-wide order records across all customers |

---

## 3. Customer vs Admin Visibility & Authorization Boundaries

The platform enforces strict role-based access control (RBAC) across all endpoints:

### Customer Visibility (`role: customer`)
- **Own Order Records Only**: A customer can only query orders matching their authenticated `sub` ID (`user_id == caller_sub`).
- **Enforced Isolation**: Attempting to query another user's `user_id` or specific `order_id` belonging to someone else triggers `HTTP 403 Forbidden` (`detail: "Forbidden: Cannot access orders of another user"`).
- **Restricted Filters**: Customers cannot use administrative query parameters (`status`, `created_from`, `created_to`). Supplying any of these filters triggers `HTTP 403 Forbidden`.
- **Public Catalog**: Can freely browse catalog products, categories, inventory availability, and graph recommendations.

### Admin Visibility (`role: admin`)
- **Store-Wide Orders**: Can inspect orders across all users or filter by any specific `user_id` or `order_id`.
- **Multi-Field Filtering**: Full access to filter by `status` (CONFIRMED, FAILED, PENDING), and date ranges (`created_from`, `created_to`).
- **Store Analytics**: Exclusive access to `/analytics/*` Elasticsearch rollups, revenue metrics, weekday patterns, and catalog health alerts.

---

## 4. Known Limitations & Operational Notes

1. **Elasticsearch Rollup Sync Requirement**:
   - The `/analytics/*` order endpoints query the `orders_daily` index in Elasticsearch rather than scanning live transactional tables in `orders_db`.
   - New orders placed in PostgreSQL are not indexed in real-time into Elasticsearch rollups.
   - To refresh the admin KPI cards, revenue charts, and weekday patterns, run the sync job:
     ```bash
     docker compose exec admin-analytics python sync_orders.py
     ```
   - The `/analytics/overview` endpoint exposes `last_sync_time` and `sync_status` to indicate rollup freshness.

2. **Date Range Constraints**:
   - The date filters (`created_from`, `created_to`) on `GET /orders` match against order timestamps in UTC (`created_at`).
   - If querying historical ranges with no placed orders (e.g. `2024-01-01` to `2024-12-31`), the endpoint correctly returns an empty array (`[]`) with `HTTP 200 OK`.

3. **Authentication Token Lifecycle**:
   - All protected endpoints (`/orders`, `/analytics/*`) require a valid JWT passed in `Authorization: Bearer <token>`.
   - Missing tokens return `HTTP 401 Unauthorized` (`detail: "Missing Authorization header"`).
   - Expired tokens return `HTTP 401 Unauthorized` (`detail: "Token has expired"`).
