# 🛒 Distributed E-Commerce OMS

A distributed Order Management System built with FastAPI microservices, PostgreSQL, Elasticsearch, and a React frontend.

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

## 🚀 Quick Start

### 1. Clone the repo
```bash
git clone <your-repo-url>
cd distributed-ecommerce-oms
```

### 2. Start the databases (Docker)
```bash
docker compose up -d products_db elasticsearch
```
> This starts PostgreSQL (port 5434) and Elasticsearch (port 9200).
> Wait ~10 seconds for them to be ready.

### 3. Start Product Service
```bash
# Open a new terminal
cd product-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

### 4. Start Admin Analytics Service
```bash
# Open another terminal
cd admin-analytics
pip install -r requirements.txt
uvicorn main:app --reload --port 8002
```

### 5. Seed sample products (first time only)
```bash
# In the product-service folder
pip install requests
python seed_data.py
```
> **Note on Seed Data**: Product ratings (3.0–5.0) and `created_at` timestamps (spread over the past 12 months) are seeded demo values generated deterministically with a fixed random seed.


### 6. Start the Frontend
```bash
# Open another terminal
cd frontend
npm install
npm run dev
```

---

## 🌐 Access the App

| Service | URL |
|---------|-----|
| **React Frontend** | http://localhost:5173 |
| **Product Service API docs** | http://localhost:8001/docs |
| **Admin Analytics API docs** | http://localhost:8002/docs |
| **Elasticsearch** | http://localhost:9200 |

---

## 🐳 Run Everything with Docker (Alternative)

If you don't want to run Python services manually:

```bash
docker compose up -d --build
```

Then open the frontend separately:
```bash
cd frontend
npm install
npm run dev
```

---

## 📁 Project Structure

```
distributed-ecommerce-oms/
├── product-service/      # FastAPI — product CRUD + Elasticsearch search
├── admin-analytics/      # FastAPI — DuckDB analytics dashboard
├── frontend/             # React + Vite + Tailwind frontend
├── docker-compose.yml    # All infrastructure + app containers
└── README.md
```

---

## ⚙️ Environment Variables

Each service reads its config from a `.env` file in its folder.
These are pre-configured for local development — **no changes needed to get started**.

| File | Key variable |
|------|-------------|
| `product-service/.env` | `DATABASE_URL`, `ELASTICSEARCH_URL` |
| `admin-analytics/.env` | `PRODUCTS_DB_URL` |
| `frontend/.env` | `VITE_PRODUCT_API_URL`, `VITE_ANALYTICS_API_URL` |

---

## ❓ Troubleshooting

**Products page shows "Network Error"**
→ Make sure product-service is running on port 8001 and no Docker container is also claiming that port. Run `docker compose ps` to check.

**"0 products found"**
→ Run `python seed_data.py` from inside the `product-service` folder.

**Port already in use**
→ Run `docker compose stop` to free all ports, then restart services manually.
