# AS_BUILT_AUDIT_2 — Deep Dive Audit

> **Methodology**: READ-ONLY audit. All source files inspected and quoted with exact line numbers. Live runtime probes executed against local database instances and containers using PostgreSQL, Elasticsearch, and Neo4j queries. No source files modified, no databases written to, no containers restarted.

---

## Item 1 — Admin Features: Endpoints and Frontend Pages

**Status: PARTIAL** — Backend endpoints exist for product CRUD and inventory restocking, plus a read-only analytics dashboard page. However, there are **no frontend pages or UI forms** for adding, editing, or deleting products, no UI for restocking inventory, and **no order management endpoints or pages** anywhere in the system.

### 1. Add / Update / Remove Product

#### Backend Endpoints — `product-service/main.py`
Three endpoints are implemented on `product-service` (port `8006`), but none have authentication or role checks (`@app.post`, `@app.put`, `@app.delete` are completely open):

- **Add Product (`POST /products`)** — [product-service/main.py:98-136](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/product-service/main.py#L98-L136)
```python
@app.post(
    "/products",
    response_model=schemas.ProductResponse,
    status_code=201,
    tags=["Products"],
)
def create_product(
    payload: schemas.ProductCreate,
    db: Session = Depends(get_db),
):
    new_product = models.Product(**payload.model_dump())
    db.add(new_product)
    db.commit()
    db.refresh(new_product)
    elastic.index_product(
        product_id=new_product.id,
        product_data=payload.model_dump(),
    )
    return new_product
```

- **Update Product (`PUT /products/{product_id}`)** — [product-service/main.py:250-303](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/product-service/main.py#L250-L303)
```python
@app.put(
    "/products/{product_id}",
    response_model=schemas.ProductResponse,
    tags=["Products"],
)
def update_product(
    product_id: int,
    payload: schemas.ProductUpdate,
    db: Session = Depends(get_db),
):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    elastic.index_product(
        product_id=product.id,
        product_data={ ... },
    )
    return product
```

- **Remove Product (`DELETE /products/{product_id}`)** — [product-service/main.py:309-342](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/product-service/main.py#L309-L342)
```python
@app.delete(
    "/products/{product_id}",
    status_code=204,
    tags=["Products"],
)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(product)
    db.commit()
    elastic.delete_product_from_es(product_id)
```

#### Frontend API Client — `frontend/src/api/productApi.js`
The JavaScript client wraps these calls in `frontend/src/api/productApi.js:88-108`:
```javascript
export async function createProduct(productData) {
  const { data } = await api.post('/products', productData);
  return data;
}

export async function updateProduct(id, productData) {
  const { data } = await api.put(`/products/${id}`, productData);
  return data;
}

export async function deleteProduct(id) {
  await api.delete(`/products/${id}`);
}
```

#### Frontend Pages
- **Result: NOT IMPLEMENTED**.
- Evidence: Grepping for `createProduct`, `updateProduct`, and `deleteProduct` across `frontend/src/` shows they are defined in `productApi.js` but **never imported or referenced anywhere in any component or page**:
```
> git grep "createProduct" frontend/src
frontend/src/api/productApi.js:export async function createProduct(productData) {
> git grep "updateProduct" frontend/src
frontend/src/api/productApi.js:export async function updateProduct(id, productData) {
> git grep "deleteProduct" frontend/src
frontend/src/api/productApi.js:export async function deleteProduct(id) {
```
There is no product creation form, edit modal, or delete button anywhere in the UI.

---

### 2. Manage Orders

#### Backend Endpoints — `order-service/main.py`
- Evidence: [order-service/main.py:76-166](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/order-service/main.py#L76-L166)
The Order Service exposes only three functional endpoints:
1. `GET /health` (Health probe)
2. `POST /orders` (Place order via SAGA orchestrator)
3. `GET /orders/{order_id}` (Fetch single order by ID)
4. `GET /orders` (List orders with optional `user_id` or `status` filters)

There are **zero endpoints** for:
- Updating order status (e.g., mark as shipped, delivered, cancelled)
- Cancelling an order
- Refunding an order
- Assigning delivery or managing fulfillment

#### Frontend Pages
- The only order-related frontend page is [frontend/src/pages/Orders/Orders.jsx](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/frontend/src/pages/Orders/Orders.jsx#L30-L50) (route `/orders`), which is a customer-facing personal order history page:
```javascript
// frontend/src/pages/Orders/Orders.jsx lines 37, 47
const userId = user?.id || user?.user_id || 1;
const orderList = await getMyOrders(userId);
```
- There is **no admin order management page** or UI controls to view all system orders or alter order statuses.

---

### 3. Manage Stock

#### Backend Endpoints — `inventory-service/main.py`
Endpoints are implemented on `inventory-service` (port `8003`):
- **Create Inventory Entry (`POST /inventory`)** — [inventory-service/main.py:163-206](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/inventory-service/main.py#L163-L206)
- **Get Product Stock (`GET /inventory/{product_id}`)** — [inventory-service/main.py:230-254](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/inventory-service/main.py#L230-L254)
- **List Inventory (`GET /inventory`)** — [inventory-service/main.py:212-225](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/inventory-service/main.py#L212-L225)
- **Atomically Reduce Stock (`PUT /inventory/{product_id}/reduce`)** — [inventory-service/main.py:260-321](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/inventory-service/main.py#L260-L321)
- **Atomically Restock (`PUT /inventory/{product_id}/restock`)** — [inventory-service/main.py:326-367](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/inventory-service/main.py#L326-L367)
```python
@app.put(
    "/inventory/{product_id}/restock",
    response_model=schemas.InventoryResponse,
    summary="Atomically restock / increase inventory",
    tags=["Inventory"],
)
def restock_inventory(
    product_id: int,
    adjustment: schemas.StockAdjustment,
    db: Session = Depends(get_db),
):
    inventory_item = (
        db.query(models.Inventory)
        .filter(models.Inventory.product_id == product_id)
        .with_for_update()
        .first()
    )
    if not inventory_item:
        raise HTTPException(status_code=404, detail=f"Inventory for product ID {product_id} not found.")
    inventory_item.stock_quantity += adjustment.amount
    db.commit()
    db.refresh(inventory_item)
    return inventory_item
```

#### Frontend API Client — `frontend/src/api/inventoryApi.js`
In `frontend/src/api/inventoryApi.js`, **only read functions are exposed** (`getInventoryStock` and `getAllInventory`). The `/restock` and `/reduce` endpoints are never defined in `inventoryApi.js`.

#### Frontend Pages
- **Result: NOT IMPLEMENTED**. There is no stock adjustment form, restocking UI, or inventory management view in the frontend.

---

### 4. Admin Dashboard

#### Backend Endpoints — `admin-analytics/main.py`
Endpoints are implemented on `admin-analytics` (port `8002`):
- `GET /health` ([admin-analytics/main.py:9](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/admin-analytics/main.py#L9))
- `GET /analytics/top-selling-products` (ES aggregation on `analytics` rollup index)
- `GET /analytics/revenue-by-category` (ES aggregation on `analytics` rollup index)
- `GET /analytics/order-status` (ES terms aggregation on `analytics` rollup index)
- `GET /analytics/total-products` (Direct PostgreSQL query against `products_db`)
- `GET /analytics/category-summary` (Direct PostgreSQL query against `products_db`)
- `GET /analytics/low-stock` (Direct PostgreSQL query against `products_db`)
- `GET /analytics/price-range` (Direct PostgreSQL query against `products_db`)

#### Frontend Page — `frontend/src/pages/AdminDashboard/AdminDashboard.jsx`
- Route: `/admin` in [frontend/src/App.jsx:71-77](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/frontend/src/App.jsx#L71-L77), guarded by `<ProtectedRoute requiredRole="admin">`.
- Code lines [AdminDashboard.jsx:111-129](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/frontend/src/pages/AdminDashboard/AdminDashboard.jsx#L111-L129):
```javascript
const [total, categories, lowStock, priceRange] = await Promise.all([
  getTotalProducts(),
  getCategorySummary(),
  getLowStock(),
  getPriceRange(),
]);
const [topProducts, revenueByCategory, orderStatus] = await Promise.allSettled([
  getTopSellingProducts(8),
  getRevenueByCategory(),
  getOrderStatus(),
]);
```
- UI contents: 4 KPI Tiles (Total Products, Avg Price, Lowest Price, Highest Price), Order Fulfillment Status pills (CONFIRMED, PENDING, FAILED), Top-Selling Products bar chart, Revenue by Category bar chart, Products by Category bar chart, and Inventory Stock Alerts panel.
- **Nature**: Strictly a **read-only analytical visualization dashboard**. No admin management actions (CRUD, status change, stock update) exist on this page.

---

## Item 2 — Live Stock ("Only N left" / Low-Stock Display)

**Status: IMPLEMENTED (with microservice proxying; does NOT read inventory_db directly)**

### 1. Components Displaying Live / Low Stock

#### Component A: ProductDetail — `frontend/src/pages/ProductDetail/ProductDetail.jsx`
- Location: [ProductDetail.jsx:42-56, 143-151](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/frontend/src/pages/ProductDetail/ProductDetail.jsx#L42-L56)
- Logic:
```javascript
// Lines 42-56: Fetch product details and live inventory in parallel
const [data, inv] = await Promise.all([
  getProductById(id),
  getInventoryStock(id).catch(() => null),
]);

const liveStock =
  inv !== null && inv !== undefined && inv.stock_quantity !== undefined
    ? inv.stock_quantity
    : data.stock_quantity;

setProduct({ ...data, stock_quantity: liveStock });

// Lines 143-151: Conditional badge rendering
{inStock ? (
  stock <= 5 ? (
    <span className="badge-status badge-status-warn">Only {stock} left</span>
  ) : (
    <span className="badge-status badge-status-ok">In Stock</span>
  )
) : (
  <span className="badge-status badge-status-err">Out of Stock</span>
)}
```

#### Component B: ProductCard — `frontend/src/components/ProductCard.jsx`
- Location: [ProductCard.jsx:29-37](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/frontend/src/components/ProductCard.jsx#L29-L37)
```javascript
{inStock ? (
  stock <= 5 ? (
    <span className="badge-status badge-status-warn">Only {stock} left</span>
  ) : (
    <span className="badge-status badge-status-ok">In Stock</span>
  )
) : (
  <span className="badge-status badge-status-err">Out of Stock</span>
)}
```
- Supplied by `ProductList.jsx` ([pages/ProductList/ProductList.jsx:126-144](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/frontend/src/pages/ProductList/ProductList.jsx#L126-L144)), which calls `getAllInventory()` and merges the live inventory stock quantity into the catalog list:
```javascript
const [data, inventoryList] = await Promise.all([
  getProducts(),
  getAllInventory().catch(() => []),
]);
const stockMap = {};
for (const inv of (inventoryList || [])) {
  stockMap[inv.product_id] = inv.stock_quantity;
}
const merged = (data || []).map(p => ({
  ...p,
  stock_quantity: p.id in stockMap ? stockMap[p.id] : p.stock_quantity,
}));
setProducts(merged);
```

#### Component C: AdminDashboard Low Stock Alerts — `frontend/src/pages/AdminDashboard/AdminDashboard.jsx`
- Location: [AdminDashboard.jsx:400-406](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/frontend/src/pages/AdminDashboard/AdminDashboard.jsx#L400-L406)
- Renders `{item.stock_quantity} left` from `GET /analytics/low-stock`.

### 2. Endpoints Called

1. `GET http://localhost:8003/inventory/{productId}` (via `getInventoryStock(id)` in `inventoryApi.js`)
2. `GET http://localhost:8003/inventory?limit=1000` (via `getAllInventory()` in `inventoryApi.js`)
3. `GET http://localhost:8002/analytics/low-stock` (via `getLowStock()` in `analyticsApi.js`)

### 3. Does it read `inventory_db` directly?

**NO**:
1. **Frontend**: The browser frontend **never** connects directly to PostgreSQL (browsers lack raw TCP PostgreSQL drivers). The frontend exclusively issues HTTP REST GET requests to the `inventory-service` (port `8003`).
2. **Backend Services**:
   - `inventory-service` queries `inventory_db` table `inventory` via SQLAlchemy (`models.Inventory.product_id == product_id`).
   - Notably, the Admin Analytics low stock endpoint (`GET /analytics/low-stock`) **does not read `inventory_db` at all**. It reads from `products_db.products` directly using psycopg2:
     ```python
     # admin-analytics/main.py:419-425
     sql = """
         SELECT id, name, category, stock_quantity, price
         FROM  products
         WHERE stock_quantity < %s
         ORDER BY stock_quantity ASC;
     """
     return run_products_query(sql, params=[threshold])
     ```
     Because order deductions update `inventory_db.inventory` and **never** update `products_db.products`, the admin analytics low-stock query reads the static seed stock rather than live transactional stock.

---

## Item 3 — Grep for duckdb, redis, mongo & Docker Images

### 1. Grep Searches

#### A. `duckdb`

##### Command:
```powershell
git grep -i "duckdb"
```

##### Output:
```
README.md:├── admin-analytics/      # FastAPI — DuckDB analytics dashboard
admin-analytics/Dockerfile:# Analytics store change: DuckDB → Elasticsearch
admin-analytics/Dockerfile:#   • DuckDB required libpq-dev + gcc at build time (for postgres extension).
admin-analytics/database.py:# Previously this file managed a DuckDB connection + postgres_scanner extension.
requirements.txt:duckdb>=1.0.0
```

##### Grep in `requirements*.txt` and `docker-compose.yml`:
```powershell
git grep -i "duckdb" -- "requirements*.txt" "*requirements*.txt" docker-compose.yml
```
Output:
```
requirements.txt:duckdb>=1.0.0
```
- In `admin-analytics/requirements.txt`: **0 matches** (not present).
- In `docker-compose.yml`: **0 matches** (not present).
- In code: **0 active runtime usages**. DuckDB was previously used with `postgres_scanner` and subsequently replaced by Elasticsearch. Only comments and an unremoved package in root `requirements.txt` remain.

#### B. `redis`

##### Command:
```powershell
git grep -i "redis"
```

##### Output:
*(Empty output — Exit code 1)*

- Matches across whole codebase: **0**
- Matches in `requirements*.txt`: **0**
- Matches in `docker-compose.yml`: **0**
- Result: **Redis is completely absent** from the repository.

#### C. `mongo`

##### Command:
```powershell
git grep -i "mongo"
```

##### Output:
*(Empty output — Exit code 1)*

- Matches across whole codebase: **0**
- Matches in `requirements*.txt`: **0**
- Matches in `docker-compose.yml`: **0**
- Result: **MongoDB is completely absent** from the repository.

---

### 2. Docker Images in `docker-compose.yml`

From [docker-compose.yml](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/docker-compose.yml):

| Service Name | Defined As / Image | Base Image (if built from Dockerfile) | Purpose |
|:---|:---|:---|:---|
| `users_db` | `image: postgres:16` | — | Users PostgreSQL database (port 5433:5432) |
| `products_db` | `image: postgres:16` | — | Products PostgreSQL database (port 5434:5432) |
| `orders_db` | `image: postgres:16` | — | Orders PostgreSQL database (port 5435:5432) |
| `inventory_db` | `image: postgres:16` | — | Inventory PostgreSQL database (port 5436:5432) |
| `elasticsearch` | `image: docker.elastic.co/elasticsearch/elasticsearch:8.13.0` | — | Search & Analytics engine (port 9200:9200) |
| `neo4j` | `image: neo4j:5-community` | — | Graph recommendation database (ports 7474, 7687) |
| `user-service` | `build: ./user-service` | `python:3.11-slim` | Auth & User Microservice (port 8001:8001) |
| `admin-analytics` | `build: ./admin-analytics` | `python:3.11-slim` | Analytics Aggregation API (port 8002:8002) |
| `inventory-service` | `build: ./inventory-service` | `python:3.11-slim` | Stock Tracking Microservice (port 8003:8003) |
| `order-service` | `build: ./order-service` | `python:3.11-slim` | SAGA Orchestration Microservice (port 8004:8004) |
| `recommendation-service` | `build: ./recommendation-service` | `python:3.11-slim` | Neo4j Cypher Microservice (port 8005:8005) |
| `product-service` | `build: ./product-service` | `python:3.11-slim` | Product Catalog Microservice (port 8006:8006) |
| `frontend` | `build: ./frontend` | `node:20-alpine` | React 18 / Vite Web Application (port 5173:5173) |

Total services in `docker-compose.yml`: **13** (6 pre-built public images + 7 locally built Dockerfile containers).

---

## Item 4 — Tables, Indexes, and Collections Actually Used by Each Service

Live database introspection command executed against all local services:
```
python scratch/inspect_all.py
curl -s http://localhost:9200/_cat/indices?v
python -c "Query Neo4j constraints and labels"
```

### 1. Cart
- **Tables**: **None**.
- **Indexes**: **None**.
- **Collections / Indices**: **None**.
- **Actual Storage**: Client-side browser storage only. Uses `window.localStorage` under key `'oms_cart'`.
- Code evidence: [frontend/src/context/CartContext.jsx:18-28](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/frontend/src/context/CartContext.jsx#L18-L28):
  ```javascript
  const stored = localStorage.getItem('oms_cart');
  ...
  localStorage.setItem('oms_cart', JSON.stringify(cartItems));
  ```

### 2. User Service
- **Database**: PostgreSQL (`users_db`, port 5433).
- **Table**: `users` (25,510 rows).
  - Columns: `id` (int PK), `username` (varchar 50), `email` (varchar 255), `password_hash` (varchar 255), `role` (varchar 20).
- **Indexes**:
  - `users_pkey`: `CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)`
  - `ix_users_username`: `CREATE UNIQUE INDEX ix_users_username ON public.users USING btree (username)`
  - `ix_users_email`: `CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email)`
  - `ix_users_id`: `CREATE INDEX ix_users_id ON public.users USING btree (id)`
- **In-Memory Structure**:
  - `pybloom_live.ScalableBloomFilter`: Hydrated with usernames and emails on startup to fast-reject duplicate registrations.

### 3. Product Service
- **Database**: PostgreSQL (`products_db`, port 5434).
- **Table**: `products` (33 rows).
  - Columns: `id` (int PK), `name` (varchar 255), `category` (varchar 100), `price` (double precision), `description` (text), `stock_quantity` (int), `image_url` (varchar 500).
- **PostgreSQL Indexes**:
  - `products_pkey`: `CREATE UNIQUE INDEX products_pkey ON public.products USING btree (id)`
  - `ix_products_id`: `CREATE INDEX ix_products_id ON public.products USING btree (id)`
  - `ix_products_name`: `CREATE INDEX ix_products_name ON public.products USING btree (name)`
- **Elasticsearch Index**:
  - Index name: `products`
  - Mapping:
    - `name`: `text` (analyzed for full-text search)
    - `description`: `text` (analyzed for full-text search)
    - `category`: `keyword` (exact filter)
    - `price`: `float`
    - `stock_quantity`: `integer`

### 4. Order Service
- **Database**: PostgreSQL (`orders_db`, port 5435).
- **Table 1**: `orders` (1,000,718 rows).
  - Columns: `id` (int PK), `user_id` (int), `total_amount` (double precision), `status` (varchar 20), `created_at` (timestamp with time zone).
- **Indexes on `orders`**:
  - `orders_pkey`: `CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id)`
  - `ix_orders_id`: `CREATE INDEX ix_orders_id ON public.orders USING btree (id)`
  - `ix_orders_user_id`: `CREATE INDEX ix_orders_user_id ON public.orders USING btree (user_id)`
  - `ix_orders_status`: `CREATE INDEX ix_orders_status ON public.orders USING btree (status)`
  - `ix_orders_user_created`: `CREATE INDEX ix_orders_user_created ON public.orders USING btree (user_id, created_at DESC)`
- **Table 2**: `order_items` (1,123,373 rows).
  - Columns: `id` (int PK), `order_id` (int FK -> orders.id ON DELETE CASCADE), `product_id` (int), `quantity` (int), `unit_price` (double precision).
- **Indexes on `order_items`**:
  - `order_items_pkey`: `CREATE UNIQUE INDEX order_items_pkey ON public.order_items USING btree (id)`
  - `ix_order_items_id`: `CREATE INDEX ix_order_items_id ON public.order_items USING btree (id)`
  - `ix_order_items_order_id`: `CREATE INDEX ix_order_items_order_id ON public.order_items USING btree (order_id)`
  - `ix_order_items_product_id`: `CREATE INDEX ix_order_items_product_id ON public.order_items USING btree (product_id)`

### 5. Inventory Service
- **Database**: PostgreSQL (`inventory_db`, port 5436).
- **Table**: `inventory` (33 rows).
  - Columns: `id` (int PK), `product_id` (int UNIQUE), `stock_quantity` (int, check >= 0), `updated_at` (timestamp with time zone).
- **Indexes**:
  - `inventory_pkey`: `CREATE UNIQUE INDEX inventory_pkey ON public.inventory USING btree (id)`
  - `ix_inventory_id`: `CREATE INDEX ix_inventory_id ON public.inventory USING btree (id)`
  - `ix_inventory_product_id`: `CREATE UNIQUE INDEX ix_inventory_product_id ON public.inventory USING btree (product_id)`
- **Constraint**: `CheckConstraint("stock_quantity >= 0", name="check_stock_quantity_non_negative")`

### 6. Recommendation Service
- **Database**: Neo4j Community 5 (`bolt://localhost:7687`, HTTP `7474`).
- **Graph Nodes**:
  - `(:User {id: int})`
  - `(:Product {id: int, name: str, category: str})`
- **Graph Relationships**:
  - `(:User)-[:PURCHASED {at: datetime}]->(:Product)`
- **Constraints / Schema Indexes**:
  - `constraint_74fad970`: `CREATE CONSTRAINT FOR (u:User) REQUIRE u.id IS UNIQUE`
  - `constraint_85a2f094`: `CREATE CONSTRAINT FOR (p:Product) REQUIRE p.id IS UNIQUE`

### 7. Admin Analytics Service
- **Primary Analytics Store**: Elasticsearch 8.13.0
  - Index name: `analytics` (312 rollup docs).
  - Properties: `order_date` (`date`), `created_at` (`date`), `status` (`keyword`), `product_id` (`keyword`), `product_name` (`text` + `keyword`), `category` (`keyword`), `units_sold` (`integer`), `quantity` (`integer`), `revenue` (`float`), `order_count` (`integer`).
- **PostgreSQL Databases Queried Directly**:
  - `products_db.products` (Queried directly for total products count, category summary averages, low stock list, and price range).
  - `orders_db.orders` & `orders_db.order_items` (Queried by `sync_orders.py` via `JOIN` to generate daily rollup aggregations).

---

## Status Table

| Item | Claim / Feature | Status | Actual Implementation in Code |
|:---|:---|:---|:---|
| **1.1** | Add / Update / Remove Product | **PARTIAL** | Backend routes `POST /products`, `PUT /products/{id}`, `DELETE /products/{id}` implemented on port 8006 and wrapped in `productApi.js`, but completely omitted from the frontend UI (no forms, modals, or pages). |
| **1.2** | Manage Orders | **NOT IMPLEMENTED** | No backend endpoints exist to update order status, cancel, or refund. Frontend only has customer-facing order history (`/orders`), no admin order management. |
| **1.3** | Manage Stock | **PARTIAL** | Backend routes `PUT /inventory/{id}/restock` and `reduce` implemented in `inventory-service`, but frontend API client only exposes read methods; no frontend UI for restocking exists. |
| **1.4** | Admin Dashboard | **IMPLEMENTED** | Route `/admin` guarded by role check, displays KPI tiles, fulfillment status, and Elasticsearch/PostgreSQL charts. Strictly read-only analytical view. |
| **2.1** | Live stock ("Only N left") display | **IMPLEMENTED** | Rendered in `ProductDetail.jsx` and `ProductCard.jsx` when `inStock && stock <= 5`. |
| **2.2** | Direct read of `inventory_db` by frontend | **NOT IMPLEMENTED (DIFFERENT)** | Frontend calls HTTP REST endpoints on `inventory-service` (`GET /inventory/{id}` and `GET /inventory`); it does not connect directly to `inventory_db`. Admin low-stock reads `products_db`, not `inventory_db`. |
| **3.1** | DuckDB in active system | **NOT IMPLEMENTED** | Zero active queries in code. DuckDB was replaced by Elasticsearch; only leftover comments and an unremoved line in root `requirements.txt` remain. |
| **3.2** | Redis in active system | **NOT IMPLEMENTED** | 0 occurrences across all files, requirements, and configs. |
| **3.3** | MongoDB in active system | **NOT IMPLEMENTED** | 0 occurrences across all files, requirements, and configs. |
| **3.4** | Docker Images listed | **IMPLEMENTED** | 13 containers verified: 4 PostgreSQL 16 DBs, Elasticsearch 8.13.0, Neo4j 5 Community, 6 Python 3.11-slim FastAPI microservices, and 1 Node 20-alpine React frontend. |
| **4.1** | Cart database persistence | **NOT IMPLEMENTED** | Zero tables, zero collections. Uses browser `window.localStorage` ('oms_cart') exclusively. |
| **4.2** | User Service schema | **IMPLEMENTED** | PostgreSQL `users` table (4 indexes) + in-memory Scalable Bloom filter. |
| **4.3** | Product Service schema | **IMPLEMENTED** | PostgreSQL `products` table (3 indexes) + Elasticsearch `products` index. |
| **4.4** | Order Service schema | **IMPLEMENTED** | PostgreSQL `orders` (5 indexes) + `order_items` (4 indexes). |
| **4.5** | Inventory Service schema | **IMPLEMENTED** | PostgreSQL `inventory` table (3 indexes, `stock_quantity >= 0` check constraint). |
| **4.6** | Recommendation Service schema | **IMPLEMENTED** | Neo4j Graph DB: `:User`, `:Product` nodes, `[:PURCHASED]` relationships, 2 uniqueness constraints. |
| **4.7** | Analytics Service schema | **IMPLEMENTED** | Elasticsearch `analytics` rollup index + direct read access to `products_db` and `orders_db`. |

---

## Built but Not in the Proposal

The following features were discovered directly in code and are fully functional, but represent architecture additions or design departures not typically detailed in high-level proposals:

1. **Two-Tier In-Memory Bloom Filter with Concurrency Double-Checked Locking**:
   - Location: [user-service/bloom.py](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/user-service/bloom.py) and [user-service/main.py:126-230](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/user-service/main.py#L126-L230).
   - Details: When users register, `user-service` performs zero-latency pre-checks against an in-memory `ScalableBloomFilter` loaded on startup from PostgreSQL. To prevent race conditions during concurrent registration attacks, it executes a Python `threading.Lock()` double-check before inserting into PostgreSQL and adding the key to the filter.

2. **Cross-Service Startup Auto-Seeder**:
   - Location: [inventory-service/main.py:50-108](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/inventory-service/main.py#L50-L108).
   - Details: `inventory-service` executes `_seed_inventory_from_product_service` on startup. If `inventory_db` is empty, it makes HTTP requests with exponential backoff to `product-service` (`GET /products?limit=1000`) and seeds initial inventory records automatically.

3. **Linear SAGA Compensating Transactions with In-Process Mock Fallback**:
   - Location: [order-service/saga.py](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/order-service/saga.py) and [order-service/clients.py](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/order-service/clients.py).
   - Details: `order-service` implements distributed rollback logic. If an order fails midway (e.g., product validation succeeds but inventory deduction fails for item 2), it issues HTTP `PUT /inventory/{product_id}/restock` compensating requests to undo earlier reservations. It also includes a `USE_MOCK` fallback switch to bypass downstream microservice calls during isolated unit tests.

4. **Daily Pre-Aggregated Rollup Compression Architecture in Elasticsearch**:
   - Location: [admin-analytics/sync_orders.py](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/admin-analytics/sync_orders.py).
   - Details: Rather than indexing 1,000,000+ raw orders directly into Elasticsearch, `sync_orders.py` executes SQL `GROUP BY DATE(created_at), product_id, status` to compress millions of rows into compact daily rollup documents in the `analytics` index.

5. **Runtime Database Schema Auto-Patching**:
   - Location: [product-service/main.py:43-44](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/product-service/main.py#L43-L44) and [user-service/main.py:71-73](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/user-service/main.py#L71-L73).
   - Details: During FastAPI startup lifespans, raw SQL migration commands (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) are executed to ensure `image_url` exists in `products` and `role` exists in `users` without requiring Alembic migrations to be run manually.

6. **Client-Side Distributed Inventory Reconciliation**:
   - Location: [frontend/src/pages/ProductList/ProductList.jsx:126-144](file:///c:/Users/PMLS/Desktop/distributed-ecommerce-oms/frontend/src/pages/ProductList/ProductList.jsx#L126-L144).
   - Details: Because `products_db.stock_quantity` is a static seed value that never updates upon order placement, the React frontend executes parallel requests to `product-service` and `inventory-service`, building a client-side dictionary to override stale catalog quantities with live `inventory_db` counts.
