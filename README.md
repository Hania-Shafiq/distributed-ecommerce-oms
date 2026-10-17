# 🛒 Distributed E-Commerce OMS

A distributed Order Management System built with 6 FastAPI microservices, an Nginx API Gateway, 4 PostgreSQL databases, Elasticsearch, Neo4j, and a React frontend.

---

## 🏗️ Architecture Overview

The platform uses a decoupled microservices architecture coordinated through a central API Gateway:
- **API Gateway (Nginx, port 8000)**: Unified reverse proxy for all frontend requests, routing by path prefix (`/signup`, `/login`, `/users`, `/products`, `/orders`, `/inventory`, `/analytics`, `/recommendations`, `/graph`) without path rewriting while maintaining direct internal communication.
- **Microservices (FastAPI)**:
  - **User Service (Port 8001)**: User registration, Bloom filter-accelerated uniqueness checks, and authentication.
  - **Admin Analytics (Port 8002)**: Real-time and batch analytics powered by **Elasticsearch daily rollups** (fed from `orders_db` via `sync_orders.py`) and cached upstream HTTP calls to `product-service` and `inventory-service` (no direct `products_db` queries).
  - **Inventory Service (Port 8003)**: Atomic stock reservations, row-level locking (`SELECT ... FOR UPDATE`), and anti-overselling controls.
  - **Order Service (Port 8004)**: Distributed SAGA orchestrator with compensating transactions and header-based **Order Idempotency** (`Idempotency-Key` header with partial unique index protection).
  - **Recommendation Service (Port 8005)**: Neo4j graph database storing product nodes and customer co-purchase relationships.
  - **Product Service (Port 8006)**: Catalogue management with PostgreSQL, server-side filtering (category, price range, live stock check), sorting, and Elasticsearch fuzzy full-text search.
- **Data Stores**:
  - PostgreSQL 16 (4 isolated databases: `users_db` on 5433, `products_db` on 5434, `orders_db` on 5435, `inventory_db` on 5436).
  - Elasticsearch 8.13 (`products` full-text index and `analytics` daily order rollups).
  - Neo4j 5 (graph co-purchase recommendations on ports 7474 / 7687).
  - *Storage Note*: **DuckDB, Redis, and MongoDB are not used** in this architecture. All caching, rollups, and graph traversals are fulfilled using in-memory TTL caches, PostgreSQL, Elasticsearch, and Neo4j.
- **Authentication & Verification Helpers (`auth.py`)**:
  - Each microservice runs in its own isolated Docker build context (`./user-service`, `./product-service`, `./order-service`, `./inventory-service`, `./admin-analytics`, `./recommendation-service`), so one identical copy of `auth.py` is maintained per service rather than relying on shared volume mounts or fragile path references.
  - Helpers provide `get_current_user` (Bearer JWT validation, raising 401 on missing/invalid/expired tokens), `require_admin` (raising 403 unless role is 'admin'), and `require_service_key` (verifying `X-Service-Key` against `INTERNAL_SERVICE_KEY` using constant-time `hmac.compare_digest`).

---

## 📋 Prerequisites

Make sure you have these installed before starting:

| Tool | Version | Download |
|------|---------|----------|
| Docker Desktop | Latest | https://www.docker.com/products/docker-desktop |
| Python | 3.11+ | https://www.python.org/downloads |
| Node.js | 18+ | https://nodejs.org |
| Git | Any | https://git-scm.com |

---

## 🚀 Quick Start (Docker Compose)

Start the entire distributed system (databases, Elasticsearch, Neo4j, gateway, and all 6 microservices):

```bash
docker compose up -d --build
```

Then start the frontend locally:
```bash
cd frontend
npm install
npm run dev
```

### Seed Data
The database comes seeded with demo products:
> **Note on Seed Data**: Product ratings (3.0–5.0) and `created_at` timestamps (spread over the past 12 months) are seeded demo values generated deterministically with a fixed random seed.

---

## 🌐 Access Points & Ports

| Component | URL | Port |
|-----------|-----|------|
| **API Gateway (Nginx)** | http://localhost:8000 | 8000 |
| **React Frontend** | http://localhost:5173 | 5173 |
| **User Service** | http://localhost:8001/docs | 8001 |
| **Admin Analytics Service** | http://localhost:8002/docs | 8002 |
| **Inventory Service** | http://localhost:8003/docs | 8003 |
| **Order Service (SAGA)** | http://localhost:8004/docs | 8004 |
| **Recommendation Service** | http://localhost:8005/docs | 8005 |
| **Product Service** | http://localhost:8006/docs | 8006 |
| **Elasticsearch** | http://localhost:9200 | 9200 |
| **Neo4j Browser** | http://localhost:7474 | 7474 |

---

## 📁 Project Structure

```
distributed-ecommerce-oms/
├── gateway/                  # Nginx API Gateway (reverse proxy on port 8000)
├── user-service/             # FastAPI — user auth and registration (Port 8001)
├── admin-analytics/          # FastAPI — analytics via Elasticsearch rollups (Port 8002)
├── inventory-service/        # FastAPI — live stock management & row-locking (Port 8003)
├── order-service/            # FastAPI — SAGA orchestrator with order idempotency (Port 8004)
├── recommendation-service/   # FastAPI — Neo4j graph co-purchases (Port 8005)
├── product-service/          # FastAPI — catalogue CRUD + Elasticsearch search (Port 8006)
├── frontend/                 # React 18 + Vite frontend (Port 5173)
├── db/                       # Database initialization and idempotency SQL scripts
├── docker-compose.yml        # Docker Compose manifest for all containers
├── requirements.txt          # Monorepo consolidated Python dependencies
└── README.md
```

---

## 🧪 Testing

Run the automated alpha test suite across all services:
```bash
python tests/alpha_test.py
```
This suite validates end-to-end user registration, search, cart management, SAGA order placement, stock compensation, row-locking race conditions, Elasticsearch analytics rollups, and concurrent order idempotency.
