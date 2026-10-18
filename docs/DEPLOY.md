# Production Deployment Guide: Distributed E-Commerce OMS

This guide details the step-by-step procedure to deploy the Distributed E-Commerce Order Management System (OMS) on a fresh Linux server (e.g., Ubuntu 22.04 / 24.04 LTS).

---

## 1. System Requirements & Hardware Sizing

The distributed stack consists of 13 Docker containers:
- **6 FastAPI microservices** (User, Product, Order SAGA Orchestrator, Inventory, Admin Analytics, Recommendation)
- **4 Dedicated PostgreSQL 16 databases** (`users_db`, `products_db`, `orders_db`, `inventory_db`)
- **Elasticsearch 8.13** (Full-text search, semantic vector kNN search, and analytical aggregations)
- **Neo4j 5 Community** (Graph database for real-time recommendations and co-purchase topology)
- **Nginx API Gateway** (Port 8000)
- **React Frontend** (Production Nginx SPA on Port 5173 / 80)

### Minimum Hardware
- **CPU**: 4 vCPUs
- **RAM**: Minimum **8 GB RAM** (Recommended **16 GB+** for production with 50M+ rows and vector embeddings)
- **Storage**: Minimum 50 GB SSD (NVMe recommended)

### Verify Available Memory
Before starting deployment, confirm memory sizing on the host:
```bash
free -h
```
Ensure swap space (at least 4 GB) is configured if running on an 8 GB host:
```bash
sudo swapon --show
```

---

## 2. Firewall & Security Group Rules

Strict port exposure must be enforced at the cloud security group / host firewall level (`ufw` or AWS/GCP Security Groups):

| Port | Protocol | Source / Access | Purpose |
| :--- | :--- | :--- | :--- |
| **22** | TCP | `YOUR_ADMIN_IP/32` (Restricted) | Secure Shell (SSH) access |
| **8000** | TCP | `0.0.0.0/0` (Public) | Nginx API Gateway |
| **5173** (or **80**) | TCP | `0.0.0.0/0` (Public) | React Frontend Production SPA |

> [!WARNING]
> **NEVER open ports 8001–8006, 5433–5436, 9200, 7474, or 7687 to the internet.**
> In `docker-compose.yml`, all database, search, graph, and microservice ports are strictly bound to `127.0.0.1` (loopback) to prevent unauthorized public access.

Example Ubuntu UFW configuration:
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow proto tcp from <YOUR_IP> to any port 22
sudo ufw allow 8000/tcp
sudo ufw allow 5173/tcp
sudo ufw enable
```

---

## 3. Install Docker Engine & Docker Compose v2

On a clean Ubuntu server:

```bash
# 1. Update package index and install prerequisites
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# 2. Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# 3. Set up the Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 4. Install Docker Engine and Compose Plugin
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 5. Allow non-root user execution (optional, relogin required)
sudo usermod -aG docker $USER
```

Verify installation:
```bash
docker --version
docker compose version
```

---

## 4. Clone Repository & Configure Environment Secrets

Clone the repository to your application directory:
```bash
git clone <repository_url> distributed-ecommerce-oms
cd distributed-ecommerce-oms
```

### Generate Cryptographically Secure Secrets
Generate unique 256-bit hexadecimal secrets for `JWT_SECRET` and `INTERNAL_SERVICE_KEY`:
```bash
python3 -c "import secrets; print('JWT_SECRET=' + secrets.token_hex(32))"
python3 -c "import secrets; print('INTERNAL_SERVICE_KEY=' + secrets.token_hex(32))"
```

### Create `.env` from Template
Copy the environment template:
```bash
cp .env.example .env
```
Edit `.env` and fill in:
- Strong passwords for `USERS_DB_PASSWORD`, `PRODUCTS_DB_PASSWORD`, `ORDERS_DB_PASSWORD`, `INVENTORY_DB_PASSWORD`, and `NEO4J_PASSWORD`.
- The generated `JWT_SECRET` and `INTERNAL_SERVICE_KEY`.
- Correct `CORS_ORIGINS` (e.g., `http://<your-server-ip>:5173,http://<your-domain>,http://localhost:5173`).
- Set `VITE_API_URL=http://<your-server-ip>:8000` (or your domain).

---

## 5. Build & Launch the Complete Stack

Start all 13 services with Docker Compose:
```bash
docker compose up -d --build
```

Verify that all containers are running and dependencies have satisfied their healthchecks:
```bash
docker compose ps
```
All four Postgres databases (`users_db`, `products_db`, `orders_db`, `inventory_db`), `elasticsearch`, and `neo4j` will report `(healthy)`.

---

## 6. Performance Indexing for Large Databases (Scale Optimization)

If deploying with an existing or large database dataset (~50M+ rows), apply the composite performance indexes and idempotency partial unique index to `orders_db`:

```bash
# 1. Apply partial unique index for concurrent order idempotency
docker exec -i orders_db psql -U postgres -d orders_db < db/idempotency.sql

# 2. Apply compound indexes for user orders, status aggregations, and line item joins
docker exec -i orders_db psql -U postgres -d orders_db < db/indexes.sql
```

Verify indexes in PostgreSQL:
```bash
docker exec -it orders_db psql -U postgres -d orders_db -c "\di"
```

---

## 7. Provision the Initial Administrator Account

Create your primary admin account:

1. **Sign up** as a normal user through the API Gateway:
```bash
curl -X POST http://localhost:8000/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "sysadmin",
    "email": "admin@yourdomain.com",
    "password": "YourStrongPassword123!"
  }'
```

2. **Elevate** the user role to `admin` using the one-off administrative script:
```bash
docker exec user-service python set_admin.py sysadmin
```

Expected output:
```text
[+] Success: User 'sysadmin' (ID: 1) role updated to 'admin'.
```

Now `sysadmin` can log in at `http://<server-ip>:5173` or authenticate via `POST http://<server-ip>:8000/login` to access the Admin Analytics dashboard and Graph Network visualization.

---

## 8. Verification & Health Probes

Run verification checks:
```bash
# Gateway Health
curl http://localhost:8000/health

# Frontend SPA
curl -I http://localhost:5173/

# Run complete automated Alpha test suite (21 scenarios)
python3 tests/alpha_test.py
```
All 21 automated integration scenarios must report `[PASS]`.
