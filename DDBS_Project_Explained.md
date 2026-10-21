# Distributed Database Systems (DDBS) — Comprehensive Technical Reference & Viva Defense Manual

**Project**: Distributed E-Commerce Order Management System (OMS)  
**Author / Defending Student**: Uniba Muzammil  
**Document Classification**: Comprehensive Architecture, Distributed Systems Analysis & Viva Preparation  
**Target Repository**: `distributed-ecommerce-oms`  
**Last Verified State**: October 2026 (Monorepo, 6 Microservices, API Gateway, React UI, 4 PostgreSQL Databases, Elasticsearch, Neo4j, 50M Ingested Orders)

---

## Table of Contents

1. [Project Overview & Objectives](#1-project-overview--objectives)
2. [Original Requirements & Project Evolution](#2-original-requirements--project-evolution)
3. [Complete Architecture & Component Interactions](#3-complete-architecture--component-interactions)
4. [Repository Structure & Execution Flow](#4-repository-structure--execution-flow)
5. [Detailed Service-by-Service Implementation](#5-detailed-service-by-service-implementation)
   - 5.1 API Gateway (`gateway`)
   - 5.2 User Service (`user-service`)
   - 5.3 Product Service (`product-service`)
   - 5.4 Inventory Service (`inventory-service`)
   - 5.5 Order Service (`order-service`)
   - 5.6 Recommendation Service (`recommendation-service`)
   - 5.7 Admin Analytics Service (`admin-analytics`)
   - 5.8 React Frontend Client (`frontend`)
6. [Database Schemas, Queries, Indexes & Data Ownership](#6-database-schemas-queries-indexes--data-ownership)
7. [Distributed Database Concepts & Their Actual Implementation](#7-distributed-database-concepts--their-actual-implementation)
   - 7.1 CAP & PACELC Trade-off Realities
   - 7.2 Distributed SAGA Orchestration vs. 2-Phase Commit (2PC)
   - 7.3 Concurrency Control & Anti-Overselling (Pessimistic Row Locking)
   - 7.4 Space-Efficient Probabilistic Indexing (In-Memory Scalable Bloom Filters)
   - 7.5 Idempotency Key Semantics in Distributed Execution
   - 7.6 Polyglot Persistence & Data Isolation
   - 7.7 Vector Space Modeling & Dense Embeddings
   - 7.8 Graph Traversal & Collaborative Filtering
8. [API & Frontend-to-Backend Request Flows](#8-api--frontend-to-backend-request-flows)
9. [Authentication, Authorization & Security Architecture](#9-authentication-authorization--security-architecture)
10. [Data Generation, Statistical Modelling & Catalog Expansion](#10-data-generation-statistical-modelling--catalog-expansion)
11. [Search, Recommendations & Analytics Implementations](#11-search-recommendations--analytics-implementations)
12. [Performance Evaluation, 50M Benchmark & Load Testing](#12-performance-evaluation-50m-benchmark--load-testing)
13. [Testing, Audits & Implementation Verification Status](#13-testing-audits--implementation-verification-status)
14. [Setup, Execution & Troubleshooting Guide](#14-setup-execution--troubleshooting-guide)
15. [Bugs, Limitations, Incomplete Features & Architectural Risks](#15-bugs-limitations-incomplete-features--architectural-risks)
16. [Comprehensive Viva Questions & Answers (40 Questions)](#16-comprehensive-viva-questions--answers-40-questions)
17. [Glossary & Viva Defense Checklist](#17-glossary--viva-defense-checklist)

---

# 1. Project Overview & Objectives

### 1.1 What is this Project?
The **Distributed E-Commerce Order Management System (OMS)** is a cloud-native, microservice-based e-commerce platform engineered specifically to demonstrate core theoretical and practical principles of **Distributed Database Systems (DDBS)**.

Unlike traditional monolithic web applications that rely on a single, shared relational database where cross-table foreign keys and local ACID transactions guarantee consistency, this system enforces a **Database-per-Service** pattern. Each microservice completely encapsulates its own domain model and storage engine. The application coordinates state across isolated network nodes using distributed transaction patterns, probabilistic data structures, vector embeddings, and graph traversal.

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                                REACT FRONTEND (:5173)                             │
└─────────────────────────────────────────┬─────────────────────────────────────────┘
                                          │ HTTP Requests
                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                             NGINX API GATEWAY (:8000)                             │
└────┬────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────┘
     │            │             │             │             │             │
     ▼            ▼             ▼             ▼             ▼             ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐
│   USER   │ │ PRODUCT  │ │INVENTORY │ │  ORDER   │ │RECOMMEND.│ │ ADMIN-ANALYTICS  │
│ SERVICE  │ │ SERVICE  │ │ SERVICE  │ │ SERVICE  │ │ SERVICE  │ │     SERVICE      │
│  (:8001) │ │  (:8006) │ │  (:8003) │ │  (:8004) │ │  (:8005) │ │     (:8002)      │
└────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘
     │            │            │            │            │                │
     ▼            ▼            ▼            ▼            ▼                ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        ┌─────────┐
│ users_db │ │products_ │ │inventory │ │orders_db │ │  neo4j   │        │elastic- │
│(Postgres)│ │    db    │ │   _db    │(Postgres)│ │ (Graph   │        │ search  │
│          │ │(Postgres)│ │(Postgres)│ │          │ │  Bolt)   │        │(Cluster)│
└──────────┘ └────┬─────┘ └──────────┘ └──────────┘ └──────────┘        └─────────┘
                  │
                  ▼
          ┌───────────────┐
          │ elasticsearch │ (Search Index + Dense Vectors)
          └───────────────┘
```

### 1.2 Core Pedagogical & Engineering Objectives
1. **Enforce Absolute Data Isolation**: Prove that microservices can run with zero shared database tables, preventing tight coupling and schema lock-in.
2. **Execute Distributed Transactions without 2-Phase Commit (2PC)**: Solve the multi-database atomicity challenge using an **Orchestrator-based SAGA** pattern with explicit, automated **Compensating Transactions** (LIFO rollback).
3. **Prevent Concurrency Anomalies (Anti-Overselling)**: Guarantee zero negative inventory balances under extreme concurrent contention using database-level row locks (`SELECT ... FOR UPDATE`).
4. **Shield Relational Backends via Probabilistic Data Structures**: Deploy an in-memory **Scalable Bloom Filter** to intercept user uniqueness checks in sub-microsecond time, reducing database read load by over 99%.
5. **Implement Polyglot Persistence**: Match specific access patterns to the optimal database paradigm:
   - **PostgreSQL 16**: Relational ACID storage for transactional state (users, catalog, inventory, orders).
   - **Elasticsearch 8.13**: Full-text BM25 search, dense vector embeddings (kNN similarity), and fast real-time analytics aggregations.
   - **Neo4j 5**: Graph database tracking customer co-purchase topologies and personalized collaborative filtering.
   - **Bloom Filter (RAM)**: Space-efficient set membership testing.
6. **Benchmark at Scale (50,000,000 Records)**: Measure empirical query plans, B-tree index efficiency, and storage footprints on a dataset of 50 million orders and 56 million order items generated using statistical models fitted to real-world e-commerce data (Olist and UCI).

---

# 2. Original Requirements & Project Evolution

Understanding how the codebase evolved is essential for defending it during a viva examination, especially because examiners often ask why certain files exist or why earlier architecture reports note discrepancies that have since been resolved.

### 2.1 Project Milestones & Evolution Matrix

| Milestone / Component | Initial Prototype (Baseline) | intermediate Audit State (`AS_BUILT_AUDIT_1 & 2`) | Final Production State (Current Branch) |
|---|---|---|---|
| **API Entry Point** | Frontend called microservice ports directly (`:8001`–`:8006`). No gateway. | Discovered in Audit 1: Frontend config bypassed any gateway; each container opened ports to the host. | **Nginx Reverse Proxy Gateway (`:8000`)** deployed. Unified routing, CORS headers, Docker embedded DNS resolution. |
| **Catalog Scale & Source** | 10 static dummy products in `product-service/products_seed.csv`. | 33 products used during pilot testing and load test calibration. | **408 real products** parsed from UCI Online Retail II dataset (`online_retail_II.xlsx`). Median pricing ($1 GBP = 1.3 USD), 5 canonical categories. |
| **Product Search** | Elasticsearch BM25 phrase-prefix and wildcard matching only (pure lexical). | Lexical fuzzy search (`fuzziness: AUTO`). No embeddings or vector search. | **Tri-Mode Search Engine**: Lexical (BM25), Semantic (FastEmbed ONNX 384-dim kNN dense vector), and Hybrid score fusion. |
| **Order Scale** | Empty database; manual orders created via UI. | Pilot generation of 1,000,000 orders (`PILOT_REPORT.md`). | **50,000,000 orders** and 56.1M items ingested into `orders_db` using bulk `COPY` protocol at >70,000 orders/sec. |
| **Idempotency** | Orders endpoint was non-idempotent; network retries duplicated orders. | Basic retry logic; race conditions possible on rapid clicks. | **Database-backed Idempotency Key**: Unique index on `orders.idempotency_key`, polling wait for pending transactions, deduplication. |
| **Admin UI & Analytics** | Static analytics dashboard reading `products_db` directly via psycopg2. | Audit 2 identified that low-stock queries read un-deducted catalog stock rather than live inventory. | **Live Microservice Integration**: Admin dashboard queries `admin-analytics`, which caches live stock via HTTP from `inventory-service`. Interactive force-directed Cytoscape graph (`AdminGraph`). |

### 2.2 Reconciling Historical Audit Documents
In the `docs/` folder, two documents (`AS_BUILT_AUDIT_1.md` and `AS_BUILT_AUDIT_2.md`) were written during a mid-project audit to point out architectural gaps. In your viva, **you must explain that these audit reports represent historical snapshots**:
- *Audit 1 finding*: "No API Gateway exists." -> **Resolved**: An Nginx container was added to `docker-compose.yml` (`gateway/nginx.conf`), and frontend environment variables were repointed to port 8000.
- *Audit 1 finding*: "Search is lexical only; no dense vectors." -> **Resolved**: FastEmbed ONNX runtime was embedded into `product-service`, mapping updated with 384-dimensional `dense_vector`, and semantic search implemented.
- *Audit 2 finding*: "Analytics reads products_db directly, bypassing inventory." -> **Resolved**: `CatalogueCache` was refactored in `admin-analytics/main.py` to query `http://product-service:8006/products?limit=1000` and `http://inventory-service:8003/inventory?limit=1000`.

---

# 3. Complete Architecture & Component Interactions

### 3.1 Global System Topology

```
                       ┌─────────────────────────┐
                       │  Browser Client (React) │
                       └────────────┬────────────┘
                                    │ HTTP :8000
                                    ▼
                       ┌─────────────────────────┐
                       │   Nginx API Gateway     │
                       │     (Port :8000)        │
                       └────────────┬────────────┘
         ┌──────────────┬───────────┼───────────┬──────────────┬──────────────┐
         │ /signup      │ /products │ /inventory│ /orders      │ /graph       │ /analytics
         ▼              ▼           ▼           ▼              ▼              ▼
  ┌─────────────┐┌─────────────┐┌─────────┐┌─────────────┐┌─────────────┐┌─────────────┐
  │User Service ││Product Svc  ││Inventory││Order Service││Recommend Svc││Admin-Analyt.│
  │ (:8001)     ││ (:8006)     ││ (:8003) ││ (:8004)     ││ (:8005)     ││ (:8002)     │
  └──────┬──────┘└──────┬──────┘└────┬────┘└──────┬──────┘└──────┬──────┘└──────┬──────┘
         │              │            │            │              │              │
         │ SQLAlchemy   │ SQLAlchemy │ SQLAlchemy │ SQLAlchemy   │ Neo4j Driver │ Direct / ES
         ▼              ▼            ▼            ▼              ▼              ▼
  ┌─────────────┐┌─────────────┐┌─────────┐┌─────────────┐┌─────────────┐┌─────────────┐
  │  users_db   ││ products_db ││inventory││  orders_db  ││ Neo4j Graph ││Elasticsearch│
  │ (Postgres   ││  (Postgres  ││   _db   ││  (Postgres  ││  (Bolt 7687)││ (HTTP 9200) │
  │  Port 5433) ││  Port 5434) ││(Postgres││  Port 5435) ││             ││             │
  └─────────────┘└──────┬──────┘│Port 5436│└─────────────┘└─────────────┘└─────────────┘
                        │       └─────────┘
                        ▼
                 ┌─────────────┐
                 │Elasticsearch│
                 │ (Index:     │
                 │ 'products') │
                 └─────────────┘
```

### 3.2 Inter-Service Communication Matrix

| Source Service | Target Component | Protocol | Endpoint / Query | Purpose | Error Behavior |
|---|---|:---:|---|---|---|
| **Gateway** | Microservices | HTTP/1.1 | `http://<service-name>:<port>/...` | Reverse proxy & URI routing | Returns 502/504 if upstream down |
| **Order Service** | Product Service | HTTP/1.1 | `GET /products/{id}` | Price validation & product check | Triggers SAGA compensation; aborts order |
| **Order Service** | Inventory Service | HTTP/1.1 | `PUT /inventory/{id}/reduce` | Atomic stock reservation | Triggers SAGA compensation (LIFO); returns 409 |
| **Order Service** | Inventory Service | HTTP/1.1 | `PUT /inventory/{id}/restock` | SAGA compensation rollback | Logs critical error if rollback fails |
| **Order Service** | Recommendation | HTTP/1.1 | `POST /graph/purchase` | Asynchronous graph update | **Fire-and-forget** (2s timeout); does not fail order |
| **Admin Analytics**| Product Service | HTTP/1.1 | `GET /products?limit=1000` | Fetch catalog metadata | Caches for 30s; falls back to stale cache |
| **Admin Analytics**| Inventory Service| HTTP/1.1 | `GET /inventory?limit=1000` | Fetch live stock quantities | Caches for 30s; falls back to stale cache |
| **Admin Analytics**| Elasticsearch | HTTP/1.1 | `POST /analytics/_search` | Order aggregation rollups | Returns 503 if Elasticsearch unreachable |
| **Product Service**| Elasticsearch | HTTP/1.1 | `POST /products/_doc/{id}` | Dual-write index synchronization | Logs error; database write remains committed |

---

# 4. Repository Structure & Execution Flow

```
distributed-ecommerce-oms/
├── admin-analytics/         # Analytical service (Elasticsearch aggregations + catalog stats)
│   ├── auth.py              # JWT admin role enforcement
│   ├── database.py          # ES client initialization
│   ├── elastic.py           # Analytics aggregation query definitions
│   └── main.py              # FastAPI endpoints (/analytics/*)
├── data/                    # Datasets, distribution fits, and catalog assets
│   ├── catalog/             # Cleaned catalog seeds (catalog_seed.csv, category_map.csv)
│   ├── fit_report/          # Empirical distribution plots from Olist fit
│   ├── real/uci/            # Raw dataset directory (.gitignored)
│   ├── analyze_olist.py     # Initial distribution derivation script
│   ├── fit_and_validate.py  # Statistical validation (Kolmogorov-Smirnov, Chi-Square)
│   └── fit_report.json      # Master parameter report (Zipf s, Lognormal mu/sigma)
├── datagen/                 # High-scale synthetic order generator
│   ├── generate_orders.py   # Bulk COPY order generation engine (50M records)
│   └── RUN_REPORT.md        # Empirical run report of 50M generation
├── docs/                    # Architectural audits, benchmarks, and evaluation reports
│   ├── AS_BUILT_AUDIT_1.md  # Historical audit: initial gateway & search findings
│   ├── AS_BUILT_AUDIT_2.md  # Historical audit: admin features & database probe
│   ├── CATALOG_EXPANSION.md # Verification of 408-item UCI expansion
│   ├── ORDER_SERVICE_CONNECTION_FINDING.md # DB connection holding audit
│   └── SEARCH_EVAL.md       # 5-dimension evaluation of search modes
├── frontend/                # React single-page application (SPA)
│   ├── src/
│   │   ├── api/             # API client modules (productApi, orderApi, etc.)
│   │   ├── components/      # UI components (ProductCard, Navbar, Footer)
│   │   ├── context/         # React Context (CartContext, AuthContext)
│   │   ├── pages/           # Page routes (Home, ProductList, Cart, Orders, AdminDashboard, AdminGraph)
│   │   └── index.css        # Tailwind CSS and design tokens
│   └── Dockerfile           # Multi-stage production Nginx frontend container
├── gateway/                 # API Gateway
│   └── nginx.conf           # Nginx reverse proxy configuration & upstream mapping
├── inventory-service/       # Inventory microservice
│   ├── database.py          # SQLAlchemy engine & sessionmaker for inventory_db
│   ├── models.py            # Inventory ORM entity with CHECK(stock_quantity >= 0)
│   ├── schemas.py           # Pydantic request/response schemas
│   └── main.py              # Stock deduction, restock, SELECT FOR UPDATE
├── loadtest/                # Locust distributed load-testing framework
│   ├── results/             # Empirical benchmark CSVs, logs, and reports
│   │   └── 50M/REPORT.md    # 50M baseline load-test report (10 to 2000 users)
│   ├── locustfile.py        # Realistic user traffic simulation matching Olist shares
│   └── run_loadtest.py      # Automated benchmark orchestration runner
├── order-service/           # Order management & SAGA orchestrator
│   ├── clients.py           # HTTP clients for Product, Inventory, and Recommendation
│   ├── database.py          # Database setup for orders_db (Port 5435)
│   ├── models.py            # Order and OrderItem SQLAlchemy models
│   ├── saga.py              # SAGA Orchestration engine and compensating rollback logic
│   └── main.py              # Order placement, listing, idempotency handling
├── product-service/         # Product catalog & search engine
│   ├── database.py          # Database setup for products_db (Port 5434)
│   ├── elastic.py           # Elasticsearch client, index mapping, tri-mode search
│   ├── embeddings.py        # FastEmbed ONNX 384-dimensional vector embedding generator
│   ├── models.py            # Product ORM model
│   └── main.py              # Product CRUD, kNN vector search, similar items
├── recommendation-service/  # Graph database recommendation engine
│   ├── database.py          # Neo4j Bolt driver wrapper & Cypher queries
│   └── main.py              # Co-purchase ingestion, collaborative filtering endpoints
├── user-service/            # Authentication & user profile microservice
│   ├── auth.py              # Bcrypt password hashing & JWT token issuance/verification
│   ├── bloom.py             # ScalableBloomFilter in-memory implementation
│   ├── database.py          # Database setup for users_db (Port 5433)
│   ├── models.py            # User ORM model
│   └── main.py              # User signup, login, Bloom filter hydration
├── docker-compose.yml       # Master 13-container deployment configuration
└── README.md                # Project documentation overview
```

---

# 5. Detailed Service-by-Service Implementation

### 5.1 API Gateway (`gateway`)
- **Role**: Single reverse proxy entry point for all frontend traffic.
- **Why Needed**: Solves Cross-Origin Resource Sharing (CORS) complexity, conceals internal service topology and port numbers, and allows dynamic Docker DNS resolution.
- **Implementation**: Nginx 1.25 Alpine running inside container `gateway` listening on port 8000 (`gateway/nginx.conf`).
- **Internal Mechanism**:
  Uses Docker's internal DNS resolver (`resolver 127.0.0.11 valid=10s ipv6=off;`) with dynamic proxy variable assignment (e.g. `set $user_upstream "http://user-service:8001"; proxy_pass $user_upstream;`). This prevents Nginx from crashing if an upstream microservice container restarts and acquires a new IP address.
- **Routing Rules**:
  - `/signup`, `/login`, `/users` $\rightarrow$ `user-service:8001`
  - `/products` $\rightarrow$ `product-service:8006`
  - `/orders`, `/cart` $\rightarrow$ `order-service:8004`
  - `/inventory` $\rightarrow$ `inventory-service:8003`
  - `/analytics` $\rightarrow$ `admin-analytics:8002`
  - `/graph`, `/recommendations` $\rightarrow$ `recommendation-service:8005`
- **Limitations**: Single-instance Nginx; no dynamic rate limiting or API token validation at the gateway level (authentication is delegated downstream to services).

---

### 5.2 User Service (`user-service`)
- **Role**: Identity provider, user registration, authentication, and role authorization.
- **Primary Source Files**: `user-service/main.py`, `user-service/bloom.py`, `user-service/auth.py`, `user-service/models.py`.
- **Database Used**: `users_db` (PostgreSQL 16 on port 5433).
- **Step-by-Step Execution (`POST /signup`)**:
  1. Client sends `{ "username": "alice", "email": "alice@example.com", "password": "secretpassword" }`.
  2. **Tier 1 (In-Memory Bloom Check)**:
     `user_bloom_filter.check_username("alice")` and `user_bloom_filter.check_email(...)` run in RAM (`user-service/bloom.py`).
     - If Bloom filter returns `False`: The username is **guaranteed 100% unique** (zero false negatives). The code skips any database `SELECT` query!
     - If Bloom filter returns `True`: There is a potential match or a 0.1% false positive. The service executes `SELECT id FROM users WHERE username = 'alice'` to disambiguate.
  3. **Tier 2 (Password Hashing)**:
     `auth.get_password_hash(password)` executes `bcrypt.hashpw(..., bcrypt.gensalt(rounds=12))`.
  4. **Tier 3 (Relational Persistence & Concurrency Lock)**:
     Acquires `registration_lock` (`threading.Lock()`), checks DB uniqueness, writes `User` record to `users_db`, commits transaction.
  5. **Tier 4 (Bloom Filter Update)**:
     Adds `"user:alice"` and `"email:alice@example.com"` to the in-memory Bloom filter.
- **Step-by-Step Execution (`POST /login`)**:
  1. Queries user by username from `users_db`.
  2. Verifies password using `bcrypt.checkpw()`.
  3. Returns signed JWT containing claims: `{ "sub": user.id, "username": user.username, "role": user.role, "exp": ... }`.
- **Distributed Database Concepts**: Probabilistic data structures, defense-in-depth concurrency locking, cryptographic identity propagation.
- **Failure Scenarios**: If container restarts, Bloom filter is re-hydrated from PostgreSQL during application lifespan startup (`main.py:lifespan`).

---

### 5.3 Product Service (`product-service`)
- **Role**: Manages catalog metadata, price points, and multi-modal product search.
- **Primary Source Files**: `product-service/main.py`, `product-service/elastic.py`, `product-service/embeddings.py`, `product-service/models.py`.
- **Databases Used**: `products_db` (PostgreSQL 16 on port 5434) + Elasticsearch 8.13.0 (port 9200, index `products`).
- **Internal Search Pipeline (`GET /products/search?q={query}&mode={lexical|semantic|hybrid}`)**:
  1. **Lexical Mode**:
     Executes an Elasticsearch BM25 query with:
     - `phrase_prefix` boost on `name^3`
     - Fuzzy match on `description` (`fuzziness: "AUTO"`)
     - Wildcard prefix matches for typing responsiveness.
  2. **Semantic Mode**:
     - Computes a 384-dimensional dense vector for the search query using the FastEmbed ONNX runtime (`BAAI/bge-small-en-v1.5`) in `embeddings.py`. Query vectors are LRU-cached (maxsize 1,000).
     - Issues an Elasticsearch kNN vector search against the `embedding` field using cosine similarity:
       ```json
       "knn": {
         "field": "embedding",
         "query_vector": [... 384 floats ...],
         "k": 50,
         "num_candidates": 100
       }
       ```
  3. **Hybrid Mode**:
     Combines BM25 lexical text queries and kNN dense vector queries in a single Elasticsearch request. Scores are normalized and summed, ensuring exact SKU/name matches rank top while conceptual intent queries return semantically relevant items.
- **Similar Products (`GET /products/similar/{id}`)**:
  Retrieves the product's pre-computed embedding vector from Elasticsearch, executes kNN search across all catalog vectors, and excludes the target product ID.
- **Dual-Write Architecture**:
  On `POST /products` or `PUT /products/{id}`, the record is written to PostgreSQL first, then synchronously indexed into Elasticsearch. If Elasticsearch fails, the database write remains valid, but a warning is logged (eventual consistency lag).

---

### 5.4 Inventory Service (`inventory-service`)
- **Role**: Authoritative ledger of product physical stock quantities.
- **Primary Source Files**: `inventory-service/main.py`, `inventory-service/models.py`.
- **Database Used**: `inventory_db` (PostgreSQL 16 on port 5436).
- **How Anti-Overselling Works (`PUT /inventory/{product_id}/reduce`)**:
  ```python
  inventory_item = (
      db.query(models.Inventory)
      .filter(models.Inventory.product_id == product_id)
      .with_for_update()  # <-- Issues: SELECT ... FOR UPDATE
      .first()
  )
  if inventory_item.stock_quantity < adjustment.amount:
      raise HTTPException(status_code=409, detail="Insufficient stock")
  inventory_item.stock_quantity -= adjustment.amount
  db.commit()
  ```
- **Why `SELECT ... FOR UPDATE`?**:
  In PostgreSQL's default `READ COMMITTED` isolation level, two concurrent transactions could read `stock = 1`, both see sufficient stock, deduct 1, and write `stock = 0`, selling 2 items when only 1 existed! `with_for_update()` forces Transaction B to block at the database engine level until Transaction A commits. When Transaction B unblocks, it reads the updated row (`stock = 0`), fails the sufficiency check, and returns HTTP 409 Conflict.
- **Database-Level Failsafe**:
  The PostgreSQL schema includes an explicit CHECK constraint:
  ```sql
  CONSTRAINT check_stock_non_negative CHECK (stock_quantity >= 0);
  ```
  Even if application code suffered a bug, PostgreSQL physically aborts any transaction attempting to push stock below zero.

---

### 5.5 Order Service (`order-service`)
- **Role**: Order lifecycle manager and **SAGA Distributed Transaction Orchestrator**.
- **Primary Source Files**: `order-service/main.py`, `order-service/saga.py`, `order-service/clients.py`, `order-service/models.py`.
- **Database Used**: `orders_db` (PostgreSQL 16 on port 5435).
- **The SAGA Orchestration Workflow (`saga.py:execute_order_saga`)**:
  ```
  Step 1: Persist Order in orders_db (status = 'PENDING')
          │
          ▼
  Step 2: Loop through requested items
          ├─► 2a. Call Product Service (GET /products/{id}) -> Verify Price
          └─► 2b. Call Inventory Service (PUT /inventory/{id}/reduce) -> Reserve Stock
          │
          ├─────────────────────────────────────────────────┐
          │ (If ANY item fails: out of stock, network error)│
          ▼                                                 ▼
     [ALL SUCCEED]                                     [ANY FAILS]
          │                                                 │
  Step 3: Update Order in orders_db               Step 3 (Compensating SAGA):
          Set status = 'CONFIRMED'                Loop reserved items in REVERSE (LIFO):
          Commit transaction                      Call Inventory (PUT /inventory/{id}/restock)
          │                                       Update Order in orders_db:
          ▼                                       Set status = 'FAILED', Commit
  Step 4: Dispatch Event to Neo4j                 Return HTTP 409 Conflict
          (POST /graph/purchase, fire-and-forget)
  ```
- **Compensating Transaction Architecture**:
  The orchestrator maintains an in-memory list `reserved_items`. If Item 3 of 4 fails due to stock exhaustion, `_run_compensation()` traverses `reversed(reserved_items)` and invokes `inventory_client.release()`, executing compensating transactions to restore inventory before marking the order `FAILED`.
- **Idempotency Guarantee**:
  - Accepts `Idempotency-Key: <UUID>` header.
  - Queries `orders` table for existing key. If found in `CONFIRMED` or `FAILED` state, returns the cached order immediately without calling downstream services.
  - If a concurrent duplicate request arrives while the first is `PENDING`, it polls until the first transaction resolves, preventing duplicate charges.

---

### 5.6 Recommendation Service (`recommendation-service`)
- **Role**: Real-time collaborative filtering and knowledge graph topology visualization.
- **Primary Source Files**: `recommendation-service/main.py`, `recommendation-service/database.py`.
- **Database Used**: Neo4j 5-community (ports 7474 HTTP, 7687 Bolt protocol).
- **Graph Schema**:
  - Nodes: `(:User {id})`, `(:Product {id, name, category})`, `(:Category {name})`
  - Relationships: `(:User)-[:PURCHASED]->(:Product)`, `(:Product)-[:BELONGS_TO]->(:Category)`
- **Key Cypher Queries**:
  - *Item-to-Item Co-Purchase Recommendation (`/recommendations/product/{id}`)*:
    ```cypher
    MATCH (p:Product {id: $product_id})<-[:PURCHASED]-(u:User)-[:PURCHASED]->(rec:Product)
    WHERE rec.id <> $product_id
    RETURN rec.id AS product_id, rec.name AS name, rec.category AS category, count(DISTINCT u) AS score
    ORDER BY score DESC LIMIT $limit
    ```
    *Meaning*: "Find all users who bought product $X$. Find what other products those users bought. Rank those products by the count of distinct users who bought both."
  - *Network Graph Export (`/graph/network`)*:
    Traverses co-purchased product pairs and calculates edge weight ($W = \text{number of shared buyers}$), returning node-link JSON for Cytoscape.js rendering in `AdminGraph.jsx`.

---

### 5.7 Admin Analytics Service (`admin-analytics`)
- **Role**: Store management analytics and operational intelligence.
- **Primary Source Files**: `admin-analytics/main.py`, `admin-analytics/elastic.py`.
- **Databases Queried**: Elasticsearch (index `analytics`), with live HTTP calls to `product-service` and `inventory-service`.
- **Key Analytics Endpoints**:
  - `GET /analytics/top-selling-products`: Elasticsearch terms aggregation on `order_items.product_id` summing quantity.
  - `GET /analytics/revenue-by-category`: Elasticsearch aggregation grouping line items by product category.
  - `GET /analytics/low-stock`: Reads live stock from `inventory-service` and filters products below threshold (default: 10 units).
- **CatalogueCache Pattern**:
  Maintains an in-memory 30-second TTL cache for catalog metadata and inventory summaries. Under high concurrency, analytics queries do not slam upstream transactional databases.

---

### 5.8 React Frontend Client (`frontend`)
- **Role**: User-facing single-page application.
- **Technology Stack**: React 18, Vite, Tailwind CSS, Lucide React icons, Cytoscape.js.
- **State & Communication**:
  - Centralized Axios client (`frontend/src/api/client.js`) with request interceptors injecting JWT Bearer tokens and generating unique UUID v4 `Idempotency-Key` headers on order submissions.
  - `CartContext.jsx`: Client-side persistent cart state.
  - `ProductList.jsx`: Search toolbar, smart search mode toggle, category filter pills, price sliders, and windowed **Load More pagination** (rendering 24 products per chunk to prevent DOM memory bloat with 408 products).
  - `AdminGraph.jsx`: Interactive force-directed knowledge graph rendered via Cytoscape with zoom, drag, and node-inspector panes.

---

# 6. Database Schemas, Queries, Indexes & Data Ownership

### 6.1 Database Ownership Matrix

| Database Engine | Port (Host / Int) | Service Owner | Primary Tables / Indexes | Sizing / Scale |
|---|:---:|---|---|---|
| **PostgreSQL (`users_db`)** | `5433:5432` | `user-service` | `users`<br>Indexes: `users_pkey`, `ix_users_username`, `ix_users_email` | 1,250,372 rows (336 MB) |
| **PostgreSQL (`products_db`)** | `5434:5432` | `product-service` | `products`<br>Indexes: `products_pkey`, `ix_products_name` | 408 rows (< 1 MB) |
| **PostgreSQL (`inventory_db`)** | `5436:5432` | `inventory-service` | `inventory`<br>Indexes: `inventory_pkey`, `ix_inventory_product_id` | 408 rows (< 1 MB) |
| **PostgreSQL (`orders_db`)** | `5435:5432` | `order-service` | `orders`, `order_items`<br>Indexes: 13 B-tree indexes (composite & single) | 50,001,168 orders (18 GB) |
| **Elasticsearch** | `9200:9200` | Multi-service | Indices: `products` (408 docs), `analytics` | ~512 MB heap |
| **Neo4j Graph** | `7474 / 7687` | `recommendation-service` | Nodes: `User`, `Product`<br>Edges: `PURCHASED`, `BELONGS_TO` | Graph database storage |

### 6.2 Deep Dive into Schema Definitions

#### A. `orders_db` Schema & Composite Indexing Strategy
```sql
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    total_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    idempotency_key VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DOUBLE PRECISION NOT NULL DEFAULT 0.0
);

-- Crucial High-Scale Indexes in orders_db:
CREATE INDEX ix_orders_user_created ON orders (user_id, created_at DESC);
CREATE INDEX ix_orders_status_created ON orders (status, created_at DESC);
CREATE INDEX ix_order_items_product_order ON order_items (product_id, order_id);
CREATE UNIQUE INDEX ix_orders_idempotency_key ON orders (idempotency_key) WHERE idempotency_key IS NOT NULL;
```

#### Why Composite Index `(user_id, created_at DESC)` is Critical:
When querying customer order history (`GET /orders?user_id=123`):
- Without the index: PostgreSQL performs a **Sequential Scan** across all 50,000,000 rows (taking over 15 seconds, maxing out disk I/O).
- With `(user_id, created_at DESC)`: PostgreSQL performs an **Index Scan**, locating the user's records in the B-tree leaf nodes and reading them already sorted in reverse chronological order in **under 0.1 milliseconds**!

#### B. `inventory_db` Schema
```sql
CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL UNIQUE,
    stock_quantity INTEGER NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT check_stock_non_negative CHECK (stock_quantity >= 0)
);

CREATE INDEX ix_inventory_product_id ON inventory (product_id);
```

#### C. Elasticsearch Mapping (`products` index)
```json
{
  "mappings": {
    "properties": {
      "id":             { "type": "integer" },
      "name":           { "type": "text", "analyzer": "standard" },
      "category":       { "type": "keyword" },
      "price":          { "type": "float" },
      "description":    { "type": "text" },
      "stock_quantity": { "type": "integer" },
      "rating":         { "type": "float" },
      "created_at":     { "type": "date" },
      "embedding": {
        "type": "dense_vector",
        "dims": 384,
        "index": true,
        "similarity": "cosine"
      }
    }
  }
}
```

---

# 7. Distributed Database Concepts & Their Actual Implementation

This section links academic DDBS syllabus concepts directly to your working source code.

### 7.1 CAP & PACELC Theorems
- **CAP Classification**:
  - The transactional core (**Order Service & Inventory Service**) operates as a **CP system** (Consistency & Partition Tolerance). In the event of a network partition between Order Service and Inventory Service, order checkout **fails fast** (returns HTTP 503/409). It refuses to guess inventory balances, strictly sacrificing Availability to preserve Consistency.
  - The auxiliary systems (**Recommendation Service & Admin Analytics**) operate as an **AP system** (Availability & Partition Tolerance). If Neo4j or Elasticsearch is temporarily isolated, product browsing and checkout continue unaffected.
- **PACELC Classification**:
  - **PC/EC** on inventory: If Partition $\rightarrow$ Consistency; Else $\rightarrow$ Consistency over Latency.
  - **PA/EL** on recommendations: If Partition $\rightarrow$ Availability; Else $\rightarrow$ Latency over Consistency (stale recommendations are accepted to keep responses fast).

### 7.2 Distributed SAGA Orchestration vs. 2-Phase Commit (2PC)
- **Why 2PC was Rejected**:
  Two-Phase Commit requires all participating database managers (PostgreSQL instances) to support XA transactions and hold row/table locks across both the `PREPARE` and `COMMIT` phases over the network. In an e-commerce microservices environment, if network latency spikes or a coordinator crashes during phase 1, database connections and locks are held indefinitely, leading to cascading system-wide deadlocks and throughput collapse.
- **The Implemented Saga Solution**:
  Implemented as an **Orchestrator** inside `order-service/saga.py`.
  - Local transactions are committed immediately in each service.
  - If a subsequent step fails, consistency is restored via compensating transactions.
  - Provides **Eventual Consistency** without holding distributed locks.

### 7.3 Concurrency Control & Anti-Overselling
- Demonstrates **Pessimistic Concurrency Control (PCC)**.
- Implemented in `inventory-service/main.py` via `with_for_update()`.
- Verified in `loadtest/results/50M/REPORT.md`: When 50 concurrent requests raced to purchase a product with `stock = 1`, exactly 1 request succeeded (HTTP 201) and 49 received HTTP 409 Conflict. Final stock was verified at 0 with zero overselling.

### 7.4 Space-Efficient Probabilistic Indexing (Bloom Filter)
- Demonstrates space-efficient approximate membership query (AMQ).
- Implemented in `user-service/bloom.py` using `ScalableBloomFilter` (`pybloom_live`) with error rate $p = 0.001$ ($0.1\%$).
- Mathematical guarantee: **Zero false negatives**. If $x \notin S$, the filter returns `False` with 100% certainty.
- Relational load reduction: For high-volume user signups, 99.9% of unique registration attempts never hit `users_db` for pre-checking.

### 7.5 Idempotency Key Semantics
- Solves the distributed network problem: *"Did the server fail before processing the request, or did the network fail while returning the response?"*
- Client generates a UUID v4 before dispatching `POST /orders`.
- The orchestrator records `idempotency_key` in `orders_db` under a unique constraint. Retried requests return the original order response without creating duplicate database rows or charging inventory twice.

---

# 8. API & Frontend-to-Backend Request Flows

### 8.1 Complete API Route Inventory

| Service | Method | Route | Auth / Headers | Purpose |
|---|:---:|---|---|---|
| **Gateway** | `GET` | `/health` | Open | Reverse proxy health probe |
| **User** | `POST` | `/signup` | Open | Register new customer account |
| **User** | `POST` | `/login` | Open | Authenticate credentials; return JWT |
| **User** | `GET` | `/users/me` | Bearer JWT | Retrieve authenticated user profile |
| **Product** | `GET` | `/products` | Open | Paginated product listing with filters |
| **Product** | `GET` | `/products/{id}` | Open | Retrieve single product details |
| **Product** | `GET` | `/products/search` | Open | Tri-mode search (lexical, semantic, hybrid) |
| **Product** | `GET` | `/products/similar/{id}` | Open | Vector kNN similar product recommendations |
| **Inventory** | `GET` | `/inventory/{product_id}`| Open | Check stock level for single product |
| **Inventory** | `PUT` | `/inventory/{id}/reduce` | `X-Service-Key` or Admin | Atomic row-locked stock deduction |
| **Inventory** | `PUT` | `/inventory/{id}/restock`| `X-Service-Key` or Admin | Atomic stock replenishment / compensation |
| **Order** | `POST` | `/orders` | Bearer JWT + `Idempotency-Key` | Initiate distributed SAGA order checkout |
| **Order** | `GET` | `/orders` | Bearer JWT | List order history (self or admin) |
| **Order** | `GET` | `/orders/{id}` | Bearer JWT | Fetch specific order details (IDOR checked) |
| **Recommend** | `POST` | `/graph/purchase` | `X-Service-Key` | Record co-purchase edge in Neo4j |
| **Recommend** | `GET` | `/recommendations/product/{id}`| Open | Collaborative filtering recommendations |
| **Recommend** | `GET` | `/graph/network` | Bearer JWT (Admin only) | Cytoscape force-directed graph topology |
| **Analytics** | `GET` | `/analytics/total-products` | Bearer JWT (Admin only) | Total catalog count via cache |
| **Analytics** | `GET` | `/analytics/low-stock` | Bearer JWT (Admin only) | Real-time stock shortage alert list |
| **Analytics** | `GET` | `/analytics/top-selling-products`| Bearer JWT (Admin only) | ES aggregation of top sold items |

### 8.2 End-to-End Trace: Order Placement SAGA (Happy vs. Failure Path)

```
[Customer Browser]           [Gateway]         [Order Service]      [Product Svc]     [Inventory Svc]   [Recommendation]
        │                        │                    │                   │                  │                 │
        │ POST /orders (JWT, Key)│                    │                   │                  │                 │
        ├───────────────────────►│ POST /orders       │                   │                  │                 │
        │                        ├───────────────────►│                   │                  │                 │
        │                        │                    │ 1. DB: PENDING    │                  │                 │
        │                        │                    ├──────────────┐    │                  │                 │
        │                        │                    │              ▼    │                  │                 │
        │                        │                    │ 2. GET /products/{id}                │                 │
        │                        │                    ├──────────────────►│                  │                 │
        │                        │                    │◄──────────────────┤                  │                 │
        │                        │                    │                   │                  │                 │
        │                        │                    │ 3. PUT /inventory/{id}/reduce        │                 │
        │                        │                    ├─────────────────────────────────────►│                 │
        │                        │                    │                                      │ SELECT FOR UPDATE
        │                        │                    │                                      │ stock -= qty    │
        │                        │                    │◄─────────────────────────────────────┤                 │
        │                        │                    │    (200 OK: Stock reserved)          │                 │
        │                        │                    │                                      │                 │
        │                        │                    │ 4. DB: CONFIRMED                     │                 │
        │                        │                    ├──────────────┐                       │                 │
        │                        │                    │              ▼                       │                 │
        │                        │                    │ 5. POST /graph/purchase (Fire-and-forget)              │
        │                        │                    ├───────────────────────────────────────────────────────►│
        │                        │ 201 Created (Order)│                                                        │
        │◄───────────────────────┴────────────────────┤                                                        │
        │                                             │                                                        │
════════╪═════════════════════════════════════════════╪════════════════════════════════════════════════════════╪════════
        │                       FAILURE PATH (Item 2 Out of Stock)                                             │
        │                                             │                                                        │
        │                        │                    │ 3b. PUT /inventory/{id2}/reduce                        │
        │                        │                    ├─────────────────────────────────────►│                 │
        │                        │                    │                                      │ stock < qty     │
        │                        │                    │◄─────────────────────────────────────┤                 │
        │                        │                    │    (409 Conflict: Insufficient)      │                 │
        │                        │                    │                                                        │
        │                        │                    │ 4. [COMPENSATION] PUT /inventory/{id1}/restock         │
        │                        │                    ├─────────────────────────────────────►│                 │
        │                        │                    │                                      │ stock += qty    │
        │                        │                    │◄─────────────────────────────────────┤ (200 Restocked) │
        │                        │                    │                                                        │
        │                        │                    │ 5. DB: FAILED                                          │
        │                        │                    ├──────────────┐                                         │
        │                        │                    │              ▼                                         │
        │                        │ 409 Conflict       │                                                        │
        │◄───────────────────────┴────────────────────┤                                                        │
```

---

# 9. Authentication, Authorization & Security Architecture

### 9.1 JWT Token Architecture
- **Signature Algorithm**: HMAC-SHA256 (`HS256`).
- **Key Storage**: Read at container runtime from environment variable `JWT_SECRET`.
- **Payload Claims**:
  ```json
  {
    "sub": "42",
    "username": "customer_john",
    "role": "customer",
    "exp": 1792684800,
    "iat": 1729526400
  }
  ```

### 9.2 Authorization Gates
1. **Admin Only**:
   Endpoints decorated with `Depends(require_admin)` inspect the decoded JWT claim `role == "admin"`. If false, raises HTTP 403 Forbidden.
2. **Insecure Direct Object Reference (IDOR) Protection**:
   In `order-service/main.py`:
   ```python
   is_admin = current_user.get("role") == "admin"
   caller_sub = current_user.get("sub")
   if not is_admin and str(order.user_id) != str(caller_sub):
       raise HTTPException(status_code=403, detail="Forbidden: Cannot view another user's order")
   ```
   Customers cannot query or create orders on behalf of other user IDs.
3. **Internal Service Mesh Key**:
   Sensitive internal endpoints (`PUT /inventory/{id}/reduce`, `POST /graph/purchase`) require the header:
   ```http
   X-Service-Key: <INTERNAL_SERVICE_KEY>
   ```
   Direct external browser requests attempting to deduct stock without going through the SAGA orchestrator are rejected with HTTP 401 Unauthorized.

---

# 10. Data Generation, Statistical Modelling & Catalog Expansion

### 10.1 Real Dataset Statistical Calibration (Olist)
To ensure benchmarking reflected real-world customer behavior rather than artificial uniform random data, the engine was calibrated against the **Brazilian E-Commerce Olist dataset** (99,441 real orders) in `data/analyze_olist.py` and `data/fit_and_validate.py`:

```
┌──────────────────────────┬─────────────────────────────┬────────────────────────────────────────────────────────┐
│ Dimension                │ Fitted Model                │ Parameters & Mathematical Expression                   │
├──────────────────────────┼─────────────────────────────┼────────────────────────────────────────────────────────┤
│ Order Total Value        │ Lognormal Distribution      │ μ = 4.693, σ = 0.8097, KS-statistic = 0.02619         │
│ Items per Order          │ Empirical Multimodal Weight │ 1 Item: 90.06%, 2 Items: 7.62%, 3+ Items: 2.32%        │
│ Quantity per Line Item   │ Empirical Multimodal Weight │ 1 Qty: 93.08%, 2 Qty: 5.25%, 3+ Qty: 1.67%             │
│ Product Popularity       │ Zipf Power-Law              │ s = 0.8387, R² = 0.9574 in log-log space               │
│ Order Arrival Seasonality│ Non-homogeneous Poisson     │ λ_base = 1.346 orders/s modulated by 24h diurnal curve│
└──────────────────────────┴─────────────────────────────┴────────────────────────────────────────────────────────┘
```

### 10.2 The 50,000,000 Order Ingestion Run
- **Script**: `datagen/generate_orders.py`.
- **Method**: Generates data in memory in 100 chunks of 500,000 orders and pipes it into PostgreSQL using the **`COPY FROM STDIN` binary/text protocol**, bypassing individual `INSERT` SQL statement overhead.
- **Measured Ingestion Performance**:
  - Ingestion throughput: **70,362 orders/second** (78,992 order items/second).
  - Total elapsed time: **1,633.10 seconds** (~27.2 minutes end-to-end for 50M orders).
  - Post-load index generation and `ANALYZE` completed in 10.7 minutes.

### 10.3 Catalog Expansion (UCI Online Retail II)
- **Script**: `scripts/build_catalog_seed.py`.
- Sourced real transaction item descriptions from UCI Online Retail II (`online_retail_II.xlsx`).
- Filtered non-product codes (postage, bank fees, damages, tests).
- Classified into 5 canonical categories:
  - Accessories (110 items)
  - Kitchen (105 items)
  - Furniture (75 items)
  - Sports & Outdoors (65 items)
  - Electronics (45 items)
  - **Total**: 400 imported items + 8 baseline = **408 products**.
- Pricing calculated as the median unit price in GBP converted at fixed 1 GBP = 1.30 USD.

---

# 11. Search, Recommendations & Analytics Implementations

### 11.1 Tri-Mode Search Engine Comparison

| Dimension | Lexical Search (BM25) | Semantic Search (Vector kNN) | Hybrid Search (Score Fusion) |
|---|---|---|---|
| **Underlying Tech** | Inverted index, TF-IDF / BM25 term weighting | FastEmbed ONNX (`bge-small-en-v1.5`), 384-dim dense vectors, Cosine kNN | Combination of BM25 clause and dense vector kNN clause |
| **Exact SKU/Title Recall**| **100.0%** (Winner) | 100.0% | **100.0%** |
| **Typo Resilience** | 100.0% (via `fuzziness: AUTO`) | 100.0% (via subword BPE tokenization) | **100.0%** (Most resilient) |
| **Intent / Purpose Queries**| **50.0%** (Fails on vocabulary mismatch) | **75.0%** (Discovers teaware, tools, totes) | **58.3%** |
| **p50 Latency (Warm)** | **131.5 ms** (Fastest) | 160.1 ms | 241.5 ms |
| **p95 Latency (Warm)** | **210.3 ms** | 210.9 ms | 336.3 ms |

### 11.2 Real-World Semantic Retrieval Evidence
Query: *"something to keep tea warm"*
- **Lexical BM25**: Returns travel card wallets and mugs containing the word "tea" or "warm", failing to understand the functional concept.
- **Semantic Vector**: Returns `Hot Water Bottle Tea And Sympathy`, `Red Retrospot Traditional Teapot`, and `Electric Kettle` despite zero exact word overlap for "something" or "keep".

---

# 12. Performance Evaluation, 50M Benchmark & Load Testing

### 12.1 Measured Steady-State Throughput (Locust Distributed Master + 3 Workers)

```
Users:   10 users  ──────►  5.43 req/s  (p50: 10ms,  p95: 90ms)   [0.0% fail]
Users:   50 users  ──────► 28.47 req/s  (p50: 9ms,   p95: 88ms)   [0.0% fail]
Users:  100 users  ──────► 56.61 req/s  (p50: 9ms,   p95: 86ms)   [0.0% fail]
Users:  500 users  ──────► 260.57 req/s (p50: 66ms,  p95: 540ms)  [2.8% fail - threshold trip]
Users: 1000 users  ──────► 242.18 req/s (p50: 65ms,  p95: 2000ms) [48.3% fail - conn pool bottleneck]
```

### 12.2 Critical Bottleneck Discovery: Database Connection Holding Across Network I/O
Documented in `docs/ORDER_SERVICE_CONNECTION_FINDING.md`:
- **The Issue**: In `order-service/saga.py`, `Depends(get_db)` opens a database session before executing the route.
- Step 1 inserts the order and immediately calls `db.refresh(new_order)`. In SQLAlchemy, issuing a `SELECT` statement implicitly opens a transaction block, putting the PostgreSQL connection into `state = 'idle in transaction'`.
- While holding this active connection, `saga.py` makes **outbound synchronous HTTP network calls** to `product-service` and `inventory-service`.
- **Under Concurrency > 500 Users**:
  The database connection pool (`DB_POOL_SIZE=25`, `DB_MAX_OVERFLOW=15`, total 40 slots) is quickly exhausted by threads waiting on network I/O. New incoming requests block waiting for a connection, time out after 30 seconds, and throw HTTP 500/503 errors.
- **Viva Defense Point**: This is a classic distributed systems anti-pattern. The solution is to release the DB connection before making outbound HTTP calls, or adopt asynchronous event-driven choreography.

---

# 13. Testing, Audits & Implementation Verification Status

### 13.1 Feature Verification Classification Matrix

| Feature / Subsystem | Status | Verification Evidence / Method |
|---|:---:|---|
| **Nginx API Gateway Routing** | **BUILT AND VERIFIED** | Tested via live HTTP probes on port 8000 across all 6 service routes. |
| **In-Memory Bloom Filter Pre-check** | **BUILT AND VERIFIED** | `tests/alpha_test.py` Scenario 3: 20 simultaneous duplicate signups result in exactly 1 DB insertion and 19 fast rejections. |
| **Bcrypt Auth & JWT RBAC** | **BUILT AND VERIFIED** | `tests/alpha_test.py` Scenarios 1, 2, 12, 13, 14, 15: Token tampering, expiration, and role restrictions verified. |
| **IDOR Protection** | **BUILT AND VERIFIED** | `tests/alpha_test.py` Scenarios 16 & 17: Cross-user order read and create attempts rejected with 403 Forbidden. |
| **Anti-Overselling Concurrency** | **BUILT AND VERIFIED** | `loadtest/results/50M/REPORT.md` Phase 2: 50 concurrent orders on 1 stock unit result in 1 success, 49 conflicts, 0 oversell. |
| **SAGA Orchestrator & Rollback** | **BUILT AND VERIFIED** | `tests/alpha_test.py` Scenario 8: Out of stock triggers reverse LIFO compensation; order marked FAILED. |
| **Order Idempotency** | **BUILT AND VERIFIED** | `tests/alpha_test.py` Scenario 11: 10 concurrent requests with same key produce exactly 1 order row in `orders_db`. |
| **Tri-Mode Elasticsearch Search** | **BUILT AND VERIFIED** | `docs/SEARCH_EVAL.md` and live probes: BM25, kNN vector cosine, and hybrid modes active. |
| **Catalog Expansion (408 Items)** | **BUILT AND VERIFIED** | `products_db`, `inventory_db`, and Elasticsearch all match verified count of exactly 408 documents. |
| **Neo4j Co-Purchase Recommendations** | **BUILT AND VERIFIED** | `recommendation-service` health check passes; collaborative filtering Cypher queries return live pairs. |
| **50M Ingested Orders** | **BUILT AND VERIFIED** | Direct PostgreSQL `SELECT count(*) FROM orders;` confirms 50,001,168 records occupying 18 GB on disk. |
| **Admin Force-Directed Graph UI** | **BUILT AND VERIFIED** | Frontend `AdminGraph.jsx` actively renders Cytoscape canvas with live Neo4j node/edge counts. |
| **Change Data Capture (CDC / Kafka)**| **NOT BUILT / PLANNED** | Database sync to Elasticsearch relies on batch script `sync_orders.py`, not real-time Debezium/Kafka CDC. |
| **Distributed 2-Phase Commit (2PC)** | **NOT BUILT (REJECTED)**| Deliberately replaced by the SAGA pattern to prevent distributed locking. |
| **Frontend Product CRUD UI** | **NOT BUILT / PLANNED** | Backend endpoints exist (`POST/PUT/DELETE /products`), but no frontend admin forms are built for them. |

---

# 14. Setup, Execution & Troubleshooting Guide

### 14.1 Environment Configuration (Safe Template)
Variables are configured in `.env` (never commit production secrets):

```bash
# Gateway & URLs
GATEWAY_URL=http://localhost:8000
VITE_API_URL=http://localhost:8000

# Database Credentials
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
USERS_DB_NAME=users_db
PRODUCTS_DB_NAME=products_db
ORDERS_DB_NAME=orders_db
INVENTORY_DB_NAME=inventory_db

# Connection Pool Tuning
DB_POOL_SIZE=25
DB_MAX_OVERFLOW=15
DB_POOL_TIMEOUT=30
POSTGRES_MAX_CONNECTIONS=100

# Security Tokens
JWT_SECRET=super_secret_jwt_signing_key_ecommerce_2026_dev
INTERNAL_SERVICE_KEY=internal_service_mesh_key_secret_ecommerce_2026_dev

# Neo4j Graph
NEO4J_USER=neo4j
NEO4J_PASSWORD=secret_password_here
```

### 14.2 Startup Commands
```bash
# 1. Start all 13 Docker containers
docker compose up -d --build

# 2. Check cluster status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 3. Verify database row counts
python scripts/db_row_counts.py

# 4. Run automated 21-scenario Alpha Test suite
python tests/alpha_test.py
```

### 14.3 Common Troubleshooting Issues
1. **Elasticsearch Unhealthy on Startup**:
   Elasticsearch 8 requires minimum 512MB RAM and takes 30–45s to initialize on cold boot. Wait for health check before starting downstream services.
2. **Neo4j Authentication Error**:
   Ensure `NEO4J_AUTH` format in `docker-compose.yml` matches `neo4j/${NEO4J_PASSWORD}`.
3. **Database Connection Pool Exhaustion (503 / Timeout)**:
   Increase `DB_POOL_SIZE` and `POSTGRES_MAX_CONNECTIONS` or run Locust tests below the 500 concurrent user threshold.

---

# 15. Bugs, Limitations, Incomplete Features & Architectural Risks

During your viva, **pointing out your own system's limitations demonstrates high senior engineering maturity**:

1. **Connection Holding Anti-Pattern in SAGA**:
   As detailed in Section 12.2, holding a database connection during outbound synchronous HTTP calls causes pool exhaustion under high concurrency.
2. **Dual-Write Vulnerability (Elasticsearch Sync)**:
   When a product is updated in `product-service`, it writes to PostgreSQL and then issues an HTTP call to Elasticsearch. If the process crashes between these two lines, the search index becomes stale.
   *Industry Fix*: Use **Change Data Capture (CDC)** with Debezium and Apache Kafka to tail PostgreSQL WAL (Write-Ahead Logs) asynchronously into Elasticsearch.
3. **In-Memory Bloom Filter Replication Drift**:
   The Bloom filter runs in the RAM of the single `user-service` Python process. If `user-service` is scaled horizontally to 5 container replicas, their in-memory filters will drift out of sync unless backed by a shared Redis Bloom filter.
4. **Fire-and-Forget Recommendation Loss**:
   The SAGA orchestrator dispatches purchase events to Neo4j with a 2-second timeout without a durable message queue (RabbitMQ/Kafka). If `recommendation-service` is temporarily down, the event is permanently lost, causing slight graph drift.
5. **No Frontend UI for Product Creation**:
   The backend supports full product CRUD, but the admin frontend currently provides only read-only analytics and graph inspection.

---

# 16. Comprehensive Viva Questions & Answers (40 Questions)

### Category A: Architecture & Distributed Systems (Q1–Q10)

#### Q1: Why did you choose a microservices architecture instead of a monolith?
**Answer**: To enforce independent scalability, fault domain isolation, and polyglot persistence. The Order Service handles write-heavy transactions, Elasticsearch handles read-heavy vector searches, and Neo4j handles recursive graph traversals. In a monolith, a long-running graph recommendation query could exhaust relational database connections and block checkout.

#### Q2: What is the Database-per-Service pattern and what problems does it introduce?
**Answer**: It means each microservice completely owns its database schema and storage engine; no other service may directly query its tables. It introduces the loss of local ACID transactions, inability to perform cross-table SQL `JOIN`s, and the challenge of maintaining eventual consistency across network boundaries.

#### Q3: Why is 2-Phase Commit (2PC) considered an anti-pattern in modern cloud architectures?
**Answer**: 2PC is a blocking protocol. During Phase 1 (Prepare), participants acquire database row and table locks and hold them until Phase 2 (Commit) completes. Over high-latency or unreliable networks, if a participant or the coordinator crashes, locks are held indefinitely, causing cascading resource starvation across the entire cluster.

#### Q4: How does your SAGA pattern differ from 2PC?
**Answer**: SAGA executes a sequence of independent **local ACID transactions**. Each service commits its changes immediately without holding distributed locks. If a subsequent step fails, the orchestrator triggers **compensating transactions** (forward rollback) to reverse earlier effects, trading immediate consistency for high availability and throughput.

#### Q5: Is your SAGA orchestration-based or choreography-based? Why?
**Answer**: It is **orchestration-based**, implemented in `order-service/saga.py`. Orchestration was chosen because order placement has a strict, sequential workflow (verify price $\rightarrow$ reserve stock $\rightarrow$ confirm order) that requires centralized monitoring, unified idempotency tracking, and clear rollback error reporting to the user.

#### Q6: Explain CAP theorem in the context of your system.
**Answer**: On the order placement path, the system is **CP** (Consistency & Partition Tolerance). If the network between Order Service and Inventory Service breaks, checkout fails fast rather than guessing stock. On the recommendation path, the system is **AP** (Availability & Partition Tolerance); recommendations gracefully degrade or return empty lists if Neo4j is disconnected.

#### Q7: What is the role of the Nginx API Gateway?
**Answer**: It acts as the single reverse proxy ingress point (`:8000`). It routes client requests to internal Docker containers, handles CORS preflight requests, prevents client-side port proliferation, and uses Docker DNS (`127.0.0.11`) to dynamically adapt to container restarts.

#### Q8: How does your architecture handle service discovery?
**Answer**: Through Docker Compose's built-in DNS service discovery. Each container registers its service name (`user-service`, `inventory-service`, etc.) on the internal Docker bridge network (`distributed-ecommerce-oms_default`), allowing services to reach each other via hostname.

#### Q9: What happens if the Recommendation Service is completely down when an order is placed?
**Answer**: The order **succeeds without error**. In `order-service/saga.py`, the recommendation notification is wrapped in a strict `try/except` block with a 2.0-second timeout. Core financial and inventory transactions are already committed; auxiliary graph updates are non-blocking.

#### Q10: How do you prevent cascading failures across microservices?
**Answer**: Through network timeouts on all inter-service HTTP clients (typically 2 to 10 seconds), decoupled database connection pools per container, and fire-and-forget patterns for non-critical auxiliary services.

---

### Category B: Concurrency, Transactions & Consistency (Q11–Q20)

#### Q11: How do you prevent overselling when multiple users buy the last item simultaneously?
**Answer**: In `inventory-service/main.py`, the stock deduction route uses `with_for_update()` to issue a SQL `SELECT ... FOR UPDATE` statement. This places an exclusive row-level lock on that product's inventory record. Concurrent requests queue up; only the first acquires the lock, sees `stock = 1`, and reduces it to 0. Subsequent requests read `stock = 0`, fail the check, and receive HTTP 409 Conflict.

#### Q12: What PostgreSQL transaction isolation level is used, and is it sufficient?
**Answer**: PostgreSQL defaults to `READ COMMITTED`. Under normal `SELECT` queries, `READ COMMITTED` suffers from race conditions. However, because we combine it with explicit pessimistic locking (`SELECT ... FOR UPDATE`), transactions are serialized at the row level, preventing race conditions without the serialization failure aborts of `SERIALIZABLE` mode.

#### Q13: What is the purpose of the PostgreSQL CHECK constraint in `inventory_db`?
**Answer**: It is a database-level safety invariant: `CONSTRAINT check_stock_non_negative CHECK (stock_quantity >= 0)`. Even if an application bug bypassed the python check, the PostgreSQL storage engine would reject the `UPDATE` with an integrity constraint violation.

#### Q14: How does your system achieve idempotency during order placement?
**Answer**: Clients supply a unique UUID `Idempotency-Key` header. The Order Service persists this key under a unique index in `orders_db`. If network packet retransmission resends the same request, the server detects the existing key and returns the cached result without re-executing stock deductions.

#### Q15: What happens if two identical idempotent requests arrive simultaneously at the exact same millisecond?
**Answer**: Both attempt to insert the order record. One succeeds; the second trips the PostgreSQL unique index constraint on `idempotency_key`. The second transaction catches the integrity violation, enters a short polling retry loop (`time.sleep(0.1)`), and waits for the winning transaction to reach `CONFIRMED` before returning its response.

#### Q16: How does SAGA compensation work if the Order Service crashes halfway through rollback?
**Answer**: In this synchronous implementation, a crash during rollback leaves the order in `PENDING` state and some stock un-restocked. In production, an **Outbox Pattern** or a durable transactional log (like temporal.io or Kafka) is required to resume pending compensations upon server reboot.

#### Q17: In what order are compensating transactions executed, and why?
**Answer**: In **reverse order (LIFO - Last In, First Out)** of the original successful actions. This mirrors the undo stack in database transaction recovery, releasing the most recently reserved resources first.

#### Q18: What is the "Connection Holding" bottleneck discovered in Order Service?
**Answer**: As audited in `docs/ORDER_SERVICE_CONNECTION_FINDING.md`, FastAPI's `get_db` dependency injects a database session that remains checked out while the orchestrator performs synchronous outbound HTTP calls to Product and Inventory services. Under high concurrency (>500 users), connection pool slots are starved while waiting on network round-trips.

#### Q19: How should the Connection Holding bottleneck be fixed?
**Answer**: By decoupling database operations: check out a connection to insert `PENDING`, immediately commit and close the session, perform outbound HTTP network calls, and only check out a second short-lived connection to finalize the status to `CONFIRMED`.

#### Q20: What is the difference between pessimistic locking and optimistic concurrency control (OCC)?
**Answer**: Pessimistic locking (`SELECT FOR UPDATE`) locks the row immediately, preventing conflicts at the cost of waiting. Optimistic locking adds a `version_id` column; transactions read without locking and fail at commit time if `version_id` changed. Pessimistic was chosen here because under high-contention flash sales, OCC causes massive transaction abort and retry storms.

---

### Category C: Data Structures, Search & Databases (Q21–Q30)

#### Q21: What is a Bloom filter and why is it used in User Service?
**Answer**: A Bloom filter is a space-efficient probabilistic data structure that tests whether an element is a member of a set. It returns either *"Possibly in set"* or *"Definitely not in set"*. It is used to pre-check username and email uniqueness in sub-microsecond time in RAM before querying PostgreSQL.

#### Q22: Can a Bloom filter produce false negatives?
**Answer**: **No**. A Bloom filter has a mathematical guarantee of zero false negatives. If it returns `False`, the username is 100% guaranteed not to exist in the database.

#### Q23: What happens when the Bloom filter returns `True`?
**Answer**: Because a Bloom filter can have false positives (set to 0.1% here), returning `True` means the username *might* exist. The service executes a targeted SQL query in `users_db` to confirm whether it is a real duplicate or a false positive.

#### Q24: How is the Bloom filter initialized when the application starts?
**Answer**: During FastAPI's startup lifespan hook (`user-service/main.py`), `user_bloom_filter.load_from_db(db)` queries all existing usernames and emails from PostgreSQL and hydrates the in-memory bit array.

#### Q25: Explain the difference between BM25 lexical search and dense vector semantic search.
**Answer**: BM25 searches for exact keyword token overlap using Term Frequency and Inverse Document Frequency. Dense vector search embeds text into a continuous 384-dimensional mathematical space where semantic concepts (e.g., "warm tea" and "teapot") are located close together based on cosine distance, regardless of exact keyword matching.

#### Q26: What embedding model is used in Product Service?
**Answer**: `BAAI/bge-small-en-v1.5`, executed using the **FastEmbed ONNX runtime** in Python without PyTorch dependencies. It outputs 384-dimensional dense vectors.

#### Q27: How does Hybrid Search combine lexical and semantic scores?
**Answer**: It executes an Elasticsearch query containing both a BM25 `multi_match` clause and a kNN `dense_vector` clause. The scores from both queries are normalized and combined, giving users exact keyword accuracy for SKU searches alongside semantic understanding for descriptive queries.

#### Q28: What is Neo4j and why is it preferred over PostgreSQL for recommendations?
**Answer**: Neo4j is a native graph database using index-free adjacency. To find *"Customers who bought this also bought"* in PostgreSQL requires multi-table self-joins on a 56-million row table, which degrades exponentially with depth. In Neo4j, traversing `(:User)-[:PURCHASED]->(:Product)` edges is a pointer-hopping operation proportional only to the subgraph size.

#### Q29: What is Cytoscape.js and how is it used in the Admin dashboard?
**Answer**: Cytoscape.js is a client-side graph theory and visualization library. It renders an interactive force-directed graph (`cose` layout) in `AdminGraph.jsx`, where node size represents graph degree and edge thickness represents co-purchase frequency.

#### Q30: How is the catalog synchronized to Elasticsearch?
**Answer**: Via dual-writes inside `product-service/main.py`. When a product is created or updated in PostgreSQL, `elastic.index_product()` immediately upserts the JSON document and embedding vector into Elasticsearch index `products`.

---

### Category D: Performance, Sizing & Scaling (Q31–Q40)

#### Q31: How did you generate 50,000,000 orders in under 30 minutes?
**Answer**: By using the PostgreSQL `COPY` protocol in `datagen/generate_orders.py`. Standard SQL `INSERT` statements incur parsing, planning, and transaction logging overhead per row. `COPY` streams raw pre-formatted tabular data directly into the database heap pages, achieving over 70,000 orders/second.

#### Q32: Why did you drop indexes before bulk loading and rebuild them afterward?
**Answer**: Inserting into a table with active B-tree indexes forces PostgreSQL to re-balance the tree nodes for every inserted row, causing massive random disk I/O. Dropping indexes allows sequential heap page writing; rebuilding indexes afterward sorts the data in memory (`maintenance_work_mem`) and builds the B-tree sequentially in a single pass.

#### Q33: What is the physical storage size of your 50,000,000 orders database?
**Answer**: Directly measured in `orders_db`:
- `orders` table heap: **3.18 GB** (3,255 MB)
- `order_items` table heap: **2.73 GB** (2,793 MB)
- Total table heap: ~5.91 GB
- 13 B-tree indexes: **11.59 GB**
- Total database footprint: **18.00 GB**.

#### Q34: Why do the indexes consume more disk space than the actual data tables?
**Answer**: The tables have 13 active indexes, including multiple composite indexes (`ix_orders_user_created`, `ix_order_items_product_order`). Each index maintains its own B-tree leaf pages and internal navigation pages containing duplicate indexed key columns and tuple pointers (`ItemPointerData`).

#### Q35: How does the composite index `(user_id, created_at DESC)` work internally?
**Answer**: The B-tree is sorted first by `user_id`. Within each identical `user_id`, the entries are sorted by `created_at` in descending order. When filtering by `user_id`, PostgreSQL performs an index seek directly to that user's subtree and reads down the leaf nodes, satisfying both the filter and the sort without an in-memory `QuickSort`.

#### Q36: What is the Zipf power-law distribution in e-commerce?
**Answer**: It states that product popularity follows an inverse power law: the $k$-th most popular product receives traffic proportional to $1/k^s$. Calibrated from Olist data, $s = 0.8387$, meaning a tiny fraction of top products account for the vast majority of all purchases.

#### Q37: What is Locust and how was your load test configured?
**Answer**: Locust is an open-source distributed load-testing tool. We ran a **distributed architecture with 1 Master and 3 Worker processes** on Python to bypass the Global Interpreter Lock (GIL), ramping from 10 to 2,000 concurrent simulated users.

#### Q38: Why were load-test stages aborted at 500, 1000, and 2000 users?
**Answer**: The test runner had strict automated SLO threshold guards: if any individual endpoint's failure rate exceeded 5% over a 20-second steady-state window, the stage aborted. At 500+ users, database connection pool exhaustion triggered HTTP 500 errors, cleanly tripping the safety abort.

#### Q39: What is the difference between steady-state metrics and ramp-up metrics in load testing?
**Answer**: Ramp-up metrics include the transient period while new user threads are spawning and initializing connections. Steady-state metrics reflect performance after user concurrency stabilizes (using `--reset-stats`), isolating pure system throughput from client-side spawn skew.

#### Q40: If you had 6 more months to work on this system, what would be your top priority?
**Answer**: Migrating the SAGA orchestrator from synchronous HTTP to **event-driven choreography using Apache Kafka**. Services would publish events (`OrderCreated`, `InventoryReserved`) to partitioned Kafka topics, completely eliminating HTTP timeouts, connection holding bottlenecks, and temporal coupling.

---

# 17. Glossary & Viva Defense Checklist

### 17.1 Technical Glossary

- **ACID**: Atomicity, Consistency, Isolation, Durability — the standard transactional guarantees of a local relational database.
- **Bloom Filter**: A space-efficient probabilistic data structure used to test set membership with zero false negatives.
- **Compensating Transaction**: An operation that reverses the business effect of a previously committed local transaction in a SAGA.
- **Dense Vector**: An array of continuous floating-point numbers representing semantic text meaning in embedding space.
- **Eventual Consistency**: A consistency model where all replicas or services eventually converge to the same state given no new updates.
- **Idempotency**: The property where an operation can be applied multiple times without changing the result beyond the initial application.
- **kNN (k-Nearest Neighbors)**: Vector search algorithm that finds the $k$ closest vectors to a query vector based on distance metrics (e.g. Cosine).
- **LIFO (Last In, First Out)**: The execution order used for compensating transactions during SAGA rollback.
- **Microservices**: Architectural style structuring an application as a collection of small, loosely coupled, independently deployable services.
- **Index-Free Adjacency**: Graph database design where each node acts as a micro-index pointing directly to its neighboring nodes.
- **Pessimistic Locking**: A concurrency control mechanism where resources are locked exclusively at read time (`SELECT ... FOR UPDATE`) to prevent conflicts.
- **Polyglot Persistence**: The practice of using different database technologies to satisfy distinct data storage and query requirements.
- **SAGA**: A sequence of local transactions coordinated across distributed services to achieve business atomicity without distributed locks.
- **Two-Phase Commit (2PC)**: A distributed blocking consensus algorithm guaranteeing atomic commits across multiple databases.
- **Zipf's Law**: A discrete power-law probability distribution where item frequency is inversely proportional to its rank.

---

### 17.2 Final Viva Defense Checklist (What to Emphasize vs. What to Avoid)

#### ✅ DO EMPHASIZE:
1. **Explain the "Why", not just the "What"**: Don't just say *"we used SAGA"*; explain that *2PC causes distributed blocking and cascading lock failures across microservices*.
2. **Emphasize Data Isolation**: Stress that services never share database tables or foreign keys; all cross-boundary interactions occur strictly via APIs.
3. **Highlight Real Data Calibration**: Mention that statistical models (Lognormal order values, Zipf popularity) were fitted to 99,441 real Olist orders, and catalog items were derived from UCI Online Retail II.
4. **Demonstrate Honesty on Bottlenecks**: Confidently explain the Order Service connection-holding finding (`ORDER_SERVICE_CONNECTION_FINDING.md`). Examiners love students who understand the limitations of their own code!
5. **Point to Concrete Code Locations**: Cite `saga.py` for SAGA, `inventory-service/main.py` for `SELECT FOR UPDATE`, and `bloom.py` for the Bloom filter.

#### ❌ DO NOT CLAIM (Common Pitfalls to Avoid):
1. **Do NOT claim you used 2-Phase Commit (2PC)**: You implemented a SAGA orchestrator.
2. **Do NOT claim the Bloom filter is 100% accurate**: A Bloom filter has a **0.1% false positive rate**; emphasize that it has **zero false negatives**.
3. **Do NOT claim database synchronization to Elasticsearch is real-time CDC**: Acknowledge that catalog updates use synchronous dual-write and historical orders use batch synchronization (`sync_orders.py`).
4. **Do NOT claim the system sustained 2,000 concurrent users without errors**: Be transparent that stages above 500 users experienced connection pool timeouts and aborted due to strict 5% error threshold guards.
5. **Do NOT claim that new products (IDs 11–408) appear in historical analytics**: Clarify that historical orders in `orders_db` belong to baseline seed items, and that running order generation on the expanded catalog was deliberately avoided to preserve benchmark baselines.
