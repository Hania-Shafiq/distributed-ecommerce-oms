# AS_BUILT_AUDIT_1 — Focused 6-Item Audit

> **Methodology**: read-only. Files opened and quoted; runtime checks performed with
> Invoke-WebRequest and ES/Neo4j REST APIs.
> No modifications, no writes, no restarts.

---

## Item 1 — How does the frontend reach the services?

**Status: DIFFERENT** — direct-to-port, no gateway or proxy of any kind.

### Evidence — frontend/.env (lines 4-9)

    VITE_USER_API_URL=http://localhost:8001
    VITE_ANALYTICS_API_URL=http://localhost:8002
    VITE_INVENTORY_API_URL=http://localhost:8003
    VITE_ORDER_API_URL=http://localhost:8004
    VITE_RECOMMENDATION_API_URL=http://localhost:8005
    VITE_PRODUCT_API_URL=http://localhost:8006

### Evidence — docker-compose.yml ports (lines 113-114, 127-128, 147-148, 164-165, 185-186, 202-203)

    user-service:           ports: ["8001:8001"]
    admin-analytics:        ports: ["8002:8002"]
    inventory-service:      ports: ["8003:8003"]
    order-service:          ports: ["8004:8004"]
    recommendation-service: ports: ["8005:8005"]
    product-service:        ports: ["8006:8006"]

No nginx, kong, traefik, or api-gateway service exists in docker-compose.yml.
The React app calls six separate backend ports directly. "Central API Gateway" NOT BUILT.

---

## Item 2 — Product search: semantic vs. lexical, filters, sorting

**Status: DIFFERENT** — lexical/fuzzy only; no embeddings, no dense_vector, no kNN.

### Live mapping command:

    (Invoke-WebRequest -Uri "http://localhost:9200/products/_mapping" -UseBasicParsing).Content

### Real output:

    {"products":{"mappings":{"properties":{
      "category":       {"type":"keyword"},
      "description":    {"type":"text"},
      "name":           {"type":"text"},
      "price":          {"type":"float"},
      "stock_quantity": {"type":"integer"}
    }}}}

No dense_vector field. No embedding model call. No kNN/ANN query.

### Search query code — product-service/elastic.py lines 139-181:

    body = {
        "query": {
            "bool": {
                "should": [
                    {"multi_match": {"query": clean_query,
                                     "fields": ["name^3", "description"],
                                     "type": "phrase_prefix", "boost": 3.0}},
                    {"multi_match": {"query": clean_query,
                                     "fields": ["name^3", "description"],
                                     "fuzziness": "AUTO", "boost": 2.0}},
                    {"wildcard": {"name": {"value": f"*{clean_query.lower()}*",
                                           "boost": 1.5, "case_insensitive": True}}},
                    {"wildcard": {"category": {"value": f"*{clean_query.lower()}*",
                                                "boost": 1.0, "case_insensitive": True}}},
                ],
                "minimum_should_match": 1,
            }
        }
    }

Technique: phrase-prefix + fuzzy multi-match + wildcard — entirely lexical.

### Filters and sorting actually supported:

| Feature              | Where                                  | Type              |
|----------------------|----------------------------------------|-------------------|
| Category filter      | main.py L165 ilike + ProductList.jsx L243 | Server+client  |
| Price sort low/high  | ProductList.jsx lines 248-251          | Client-side only  |
| Name sort A-Z        | ProductList.jsx line 252-253           | Client-side only  |
| Price range filter   | NOT IMPLEMENTED                        | -                 |
| Availability filter  | NOT IMPLEMENTED                        | -                 |
| Rating sort          | NOT IMPLEMENTED (no rating field)      | -                 |
| Newest sort          | NOT IMPLEMENTED (no created_at in ES)  | -                 |

---

## Item 3 — Cart storage

**Status: DIFFERENT** — browser localStorage only; no backend endpoint; not cross-device.

### Evidence — frontend/src/context/CartContext.jsx lines 4, 18-30:

    // Client-side cart state — no backend involved yet (Order Service routes TBD).
    // Cart items are persisted to localStorage so they survive page refreshes.

    const [cartItems, setCartItems] = useState(() => {
        try {
          const stored = localStorage.getItem('oms_cart');  // <- browser only
          return stored ? JSON.parse(stored) : [];
        } catch { return []; }
    });

    useEffect(() => {
        localStorage.setItem('oms_cart', JSON.stringify(cartItems)); // <- browser only
    }, [cartItems]);

The file's own comment states "no backend involved yet". No service has any /cart route.
Cart lives in localStorage. Different device = empty cart. Not in ES, PostgreSQL, or any backend.

---

## Item 4 — Auth: token creation/verification, endpoint guards, admin RBAC

**Status: PARTIAL** — tokens generated but NOT verifiable JWTs; RBAC frontend-only;
zero backend endpoints enforce any token.

### Token creation — user-service/main.py line 274:

    token = f"jwt_{secrets.token_urlsafe(32)}"

This is a random opaque string, not a signed JWT. No python-jose, no PyJWT,
no HS256/RS256 signature. The "jwt_" prefix is cosmetic.

### Token verification grep:

    grep -r "Authorization|get_current_user|verify_token|decode" \
         order-service/ user-service/ product-service/ \
         inventory-service/ admin-analytics/ recommendation-service/ --include="*.py"

Result: NO RESULTS. No backend service reads the Authorization header or validates tokens.

### Live status codes (GET, no token):

| Endpoint                              | HTTP Status                     |
|---------------------------------------|---------------------------------|
| GET http://localhost:8004/orders      | 200 (all orders returned)       |
| GET http://localhost:8002/analytics/top-selling-products | 200       |
| GET http://localhost:8006/products/1  | 404 (product missing, not auth) |
| GET http://localhost:8003/inventory   | 200                             |

All respond without any token.

### Frontend admin RBAC — ProtectedRoute.jsx lines 16-37:

    export default function ProtectedRoute({ children, requiredRole = 'admin' }) {
      const { user, role, isAdmin, isAuthenticated } = useAuth();
      const currentRole = role || user?.role;

      const hasAccess = isAuthenticated && (
        requiredRole === 'admin'
          ? (isAdmin || currentRole === 'admin')
          : currentRole === requiredRole
      );

      if (!hasAccess) {
        return <Navigate to="/" replace />;   // redirect non-admins
      }
      return children ? children : <Outlet />;
    }

And App.jsx lines 70-77:

    <Route path="/admin"
      element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>}
    />

Admin route is guarded CLIENT-SIDE ONLY. A user who edits localStorage (role=admin)
bypasses it. The analytics API (port 8002) has no token requirement.

---

## Item 5 — Uniqueness constraints, idempotency, coupon/promo

### 5a. UNIQUE on users.username / users.email

**Status: IMPLEMENTED**

Evidence — user-service/models.py lines 33-34:

    username = Column(String(50),  unique=True, nullable=False, index=True)
    email    = Column(String(255), unique=True, nullable=False, index=True)

SQLAlchemy unique=True generates CREATE UNIQUE INDEX in PostgreSQL.

### 5b. Idempotency key grep:

    grep -r "idempotency" --include="*.py" --include="*.js" --include="*.jsx" .

Result: NO RESULTS. No idempotency key on order creation.

### 5c. Coupon/promo grep:

    grep -ri "coupon|promo" --include="*.py" --include="*.js" --include="*.jsx" .

Result: NO RESULTS. No coupon or promo logic anywhere.

---

## Item 6 — Neo4j nodes/relationships, recommendation endpoints, frontend graph

**Status: PARTIAL** — graph and API fully implemented; frontend renders a list, NOT a graph.

### Live Cypher command:

    Invoke-WebRequest -Uri "http://localhost:7474/db/neo4j/tx/commit" -Method POST 
      -Headers @{"Content-Type"="application/json";"Authorization"="Basic bmVvNGo6cGFzc3dvcmQxMjM="} 
      -Body '{"statements":[
        {"statement":"CALL db.labels() YIELD label RETURN label"},
        {"statement":"CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType"},
        {"statement":"MATCH (n) RETURN labels(n)[0] as lbl, count(n) as cnt"}
      ]}'

### Real output:

    labels:            ["User", "Product"]
    relationshipTypes: ["PURCHASED"]
    counts:            User=198, Product=25

### Recommendation endpoints — recommendation-service/main.py lines 7-11:

    GET  /health
    POST /graph/purchase                       -> ingest purchase, create relationship
    GET  /recommendations/product/{product_id} -> item-to-item "also bought"
    GET  /recommendations/user/{user_id}       -> collaborative filtering

Live check: GET http://localhost:8005/recommendations/product/1 -> HTTP 200

### Cypher (item-to-item) — graph.py lines 141-149:

    MATCH (target:Product {id: })<-[:PURCHASED]-(u:User)-[:PURCHASED]->(rec:Product)
    WHERE rec.id <> 
    RETURN rec.id AS product_id, rec.name AS name, rec.category AS category,
           count(DISTINCT u) AS score
    ORDER BY score DESC, rec.name ASC
    LIMIT 

### Frontend — recommendationApi.js lines 22-31:

    export async function getProductRecommendations(productId, limit = 4) {
      const { data } = await api.get(/recommendations/product/, { params: { limit } });
      return data.recommendations || [];
    }

Frontend CALLS the API and renders product name+category cards.
No graph visualization (no cytoscape.js, no d3, no force-directed graph).

---

## Status Summary

| #  | Feature                          | Status          |
|----|----------------------------------|-----------------|
| 1  | API Gateway / reverse proxy      | NOT IMPLEMENTED |
| 2  | Semantic search (embeddings/kNN) | NOT IMPLEMENTED |
| 2  | Category filter                  | IMPLEMENTED     |
| 2  | Price range filter               | NOT IMPLEMENTED |
| 2  | Availability filter              | NOT IMPLEMENTED |
| 2  | Price sort                       | PARTIAL (client-side) |
| 2  | Rating/newest sort               | NOT IMPLEMENTED |
| 3  | Cart backend / ES persistence    | NOT IMPLEMENTED |
| 4  | Signed JWT tokens                | DIFFERENT (opaque random string) |
| 4  | Backend token enforcement        | NOT IMPLEMENTED |
| 4  | Admin RBAC                       | PARTIAL (frontend-only) |
| 5  | UNIQUE on username/email         | IMPLEMENTED     |
| 5  | Order idempotency key            | NOT IMPLEMENTED |
| 5  | Coupon/promo                     | NOT IMPLEMENTED |
| 6  | Neo4j graph (nodes/rels/counts)  | IMPLEMENTED     |
| 6  | Recommendation API endpoints     | IMPLEMENTED     |
| 6  | Frontend graph visualization     | NOT IMPLEMENTED |

---
*Generated in read-only mode. No source files modified.*

---

## Section A — Features Built but NOT Mentioned in the Proposal

These are real, working features discovered in code that the proposal/addendum
did not claim.

### A1. Startup inventory auto-seed from Product Service
inventory-service/main.py lines 50–80: on first boot, if inventory_db is
empty, the service fetches all products from Product Service (with 6-attempt retry
loop, 5 s sleep) and seeds one inventory row per product. This prevents SAGA
failures on a fresh deployment. Not mentioned anywhere in the proposal.

    def _seed_inventory_from_product_service(db: Session) -> None:
        existing_count = db.query(models.Inventory).count()
        if existing_count > 0:
            return
        # ... fetches GET /products?limit=1000 from Product Service
        # ... inserts one Inventory record per product

### A2. SELECT ... FOR UPDATE row-level locking in Inventory
inventory-service/main.py lines 275–288:

    # 1. SELECT ... FOR UPDATE (Row-Level Locking):
    inventory = (
        db.query(models.Inventory)
          .filter(models.Inventory.product_id == product_id)
          .with_for_update()   # <- acquires exclusive row lock
          .first()
    )

Both the /reduce (line 288) and /restock (line 344) endpoints use this.
Prevents race conditions on concurrent orders for the same product.
Not mentioned in the proposal (which only claimed "atomic stock reduction").

### A3. Scalable Bloom filter (pybloom_live ScalableBloomFilter)
user-service/bloom.py line 3:

    from pybloom_live import ScalableBloomFilter

Uses ScalableBloomFilter (not a static Bloom filter) — automatically scales
capacity as users grow, with a chained set of sub-filters. The proposal
mentioned "Bloom filters" generically but not the scalable variant.

### A4. Thread-safe double-checked registration locking
user-service/main.py lines 17–18, 183–229:

    registration_lock = threading.Lock()
    ...
    with registration_lock:
        # re-check Bloom + PostgreSQL inside lock before inserting

A threading.Lock() serializes the critical section of user registration
(Bloom re-check + DB insert + Bloom update) to prevent race conditions under
concurrent signup bursts. Not mentioned in the proposal.

### A5. Product autocomplete / typeahead endpoint
product-service/main.py lines 176–188:

    @app.get("/products/autocomplete")
    def autocomplete_products(q: str, limit: int = 8):
        suggestions = elastic.autocomplete_products(query=q, limit=limit)
        return {"query": q, "suggestions": suggestions, "count": len(suggestions)}

Uses match_bool_prefix + match_phrase_prefix + wildcard in Elasticsearch.
Frontend calls it with 200ms debounce for live typeahead. Not in the proposal.

### A6. SAGA compensation (release stock on partial failure)
order-service/saga.py lines 42–72:

    def _run_compensation(reserved_items, order, db, failure_reason):
        for item in reversed(reserved_items):          # LIFO order
            inventory_client.release(item.product_id, item.quantity)
        order.status = "FAILED"
        db.commit()

If any item fails reservation, ALL previously reserved items are released in
reverse order. The proposal claimed "SAGA pattern" but the explicit compensating
transaction implementation is a notable built feature.

### A7. Daily rollup sync to Elasticsearch analytics index
dmin-analytics/sync_orders.py (not shown but referenced in main.py comment):
Reads from orders_db PostgreSQL, denormalises order-line data (product_name,
category, revenue = qty × unit_price), and indexes into an "analytics" ES index.
The analytics API then runs ES aggregations over this index (no direct
PostgreSQL for order analytics). Not described in the proposal.

### A8. Role migration at runtime
user-service/main.py lines 70–75:

    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role "
                      "VARCHAR(20) NOT NULL DEFAULT 'customer';"))

Adds the ole column on every startup without requiring a migration tool
(Alembic, Flyway). Also includes user-service/migrate_role.py and
user-service/set_admin.py for manual admin promotion.

---

## Section B — Top 5 Viva Risks (ordered by severity)

### Risk 1 — CRITICAL: Token is not a verifiable JWT
**Severity: HIGH** — This is the single most likely question to fail on.

The proposal claims "JWT authentication". The code generates:

    token = f"jwt_{secrets.token_urlsafe(32)}"   # user-service/main.py:274

This is a **random string with a cosmetic prefix**. There is no signing key,
no iat/exp claim, no sub, no HS256 signature. More critically,
no backend service ever calls a erify_token() function — every endpoint
accepts unauthenticated requests.

**Viva question likely to be asked:** "Show me where the JWT signature is
verified when a client calls POST /orders."
**Answer the code gives:** There is no such code.

### Risk 2 — HIGH: All backend endpoints are publicly open
**Severity: HIGH** — compounds Risk 1.

GET /orders, GET /analytics/*, PUT /inventory/{id}/reduce,
DELETE /products/{id} — all return 200 with no token. Any anonymous HTTP
client can read all orders, deplete inventory, or delete products.

**Viva question:** "How does the system prevent a customer from deleting
another user's products?"
**Answer the code gives:** It cannot. No middleware, no Depends, no header check.

### Risk 3 — MEDIUM: Cart is not persisted and not in Elasticsearch
**Severity: MEDIUM** — The proposal likely claimed "Elasticsearch cart".

CartContext.jsx line 4 comment reads: *"no backend involved yet"*.
Cart is localStorage only. Clearing the browser or switching devices
loses the cart entirely.

**Viva question:** "Where is the cart stored and how is it retrieved after
logging in from another device?"
**Answer the code gives:** It is not. Cart is browser-local only.

### Risk 4 — MEDIUM: Product search is lexical, not semantic
**Severity: MEDIUM** — Likely claimed "semantic search" or "similarity search".

The live ES mapping has no dense_vector field. The search query uses
phrase_prefix, uzziness:AUTO, and wildcard — standard lexical techniques.
No embedding model (sentence-transformers, OpenAI, etc.) is called anywhere.

**Viva question:** "How does your semantic/similarity search work? Walk me
through the kNN query."
**Answer the code gives:** There is no kNN query.

### Risk 5 — MEDIUM: No filters beyond category; no sorting by rating/newest
**Severity: MEDIUM** — Common e-commerce features expected to be implemented.

Price range filter (min_price, max_price) does not exist in any endpoint
or frontend UI. Availability filter does not exist. Rating field does not exist
in the product schema. "Newest" sort requires created_at in the ES mapping
(absent). All sorting (price, name) is client-side JavaScript.

**Viva question:** "Show me how to filter products by price range
– and sort by newest."
**Answer the code gives:** Cannot. No such endpoint parameter or ES filter exists.

---

## Section C — Options to Align Proposal with Built System

For each gap, two options are given. Effort: S=hours, M=half-day, L=1-2 days.

### Gap C1: JWT authentication & backend enforcement

**Option 1 — Implement it (Effort: M)**
- Install python-jose[cryptography] (already partially in requirements or easy to add).
- Add SECRET_KEY env var to each service in docker-compose.yml.
- Write create_token(user_id, role) → {"sub": user_id, "role": role, "exp": ...} signed HS256.
- Write get_current_user = Depends(verify_token) middleware function.
- Add Depends(get_current_user) to: POST /orders, DELETE /products/{id},
  PUT /products/{id}, PUT /inventory/{id}/reduce, all /analytics/* routes.
- Files: user-service/main.py (token creation), new uth/dependencies.py
  in each service, docker-compose.yml.

**Option 2 — Change proposal wording (Effort: S)**
- Reword "JWT-authenticated endpoints" to:
  *"Session tokens are issued at login and stored client-side; backend
  authentication middleware is scoped to future production hardening."*
- Acknowledge the RBAC guard is frontend-enforced.

---

### Gap C2: Cart persistence (Elasticsearch / backend)

**Option 1 — Implement it (Effort: M)**
- Add a POST /cart, GET /cart/{user_id}, DELETE /cart/{user_id} to
  order-service or a new cart-service.
- Store cart as an ES document {user_id, items: [...], updated_at} in an
  oms_carts index.
- Frontend: replace localStorage reads/writes with API calls.
- Files: order-service/main.py (or new service), docker-compose.yml,
  rontend/src/context/CartContext.jsx, rontend/src/api/cartApi.js.

**Option 2 — Change proposal wording (Effort: S)**
- Reword to: *"Cart is persisted to browser localStorage for low-latency access,
  with a backend cart service planned for cross-device sync."*

---

### Gap C3: Semantic / vector search

**Option 1 — Implement it (Effort: L)**
- Add sentence-transformers to product-service/requirements.txt.
- Re-define ES mapping with a dense_vector field (dim=384 for MiniLM).
- On product index/update, compute embedding and store it.
- Add a GET /products/similar?product_id=X route using ES kNN query.
- Files: product-service/elastic.py (mapping + kNN query),
  product-service/main.py (new route), product-service/requirements.txt.

**Option 2 — Change proposal wording (Effort: S)**
- Reword to: *"Full-text search with fuzzy matching and prefix typeahead is
  implemented via Elasticsearch multi-match queries. Vector/semantic similarity
  search is identified as a future enhancement."*

---

### Gap C4: Price range filter, availability filter, sorting by newest/rating

**Option 1 — Implement it (Effort: S)**
- Add min_price, max_price, in_stock query params to GET /products/search
  using ES ange filter and 	erm filter on stock_quantity.
- Add created_at to the products ES mapping and PostgreSQL schema.
- Files: product-service/elastic.py (search body), product-service/main.py
  (query params), rontend/src/pages/ProductList/ProductList.jsx (UI controls).

**Option 2 — Change proposal wording (Effort: S)**
- Reword to: *"Category filtering and price sorting are supported client-side;
  server-side range filters and rating-based sorting are planned enhancements."*

---

*Section A/B/C appended to AS_BUILT_AUDIT_1.md in read-only audit mode.
No source files modified.*
