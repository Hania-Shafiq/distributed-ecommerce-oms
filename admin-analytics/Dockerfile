# ─────────────────────────────────────────────────────────────────────────────
# Dockerfile — admin-analytics
# ─────────────────────────────────────────────────────────────────────────────
# Build context: ./admin-analytics   (set in docker-compose.yml)
# Final image runs: uvicorn main:app --host 0.0.0.0 --port 8002
# ─────────────────────────────────────────────────────────────────────────────


# ── Stage: base image ─────────────────────────────────────────────────────────
# Same reasoning as product-service: python:3.11-slim is lightweight and
# compatible with the pinned dependency versions in requirements.txt.
FROM python:3.11-slim


# ── Working directory ─────────────────────────────────────────────────────────
WORKDIR /app


# ── Install system dependencies ───────────────────────────────────────────────
# DuckDB's postgres extension connects to PostgreSQL over the network using
# libpq under the hood — the same C client library that psycopg2 uses.
# We need libpq-dev so that DuckDB can resolve the libpq shared library at
# runtime when it loads the 'postgres' extension.
#
# gcc is required because DuckDB may need to compile a small C shim when
# installing extensions in some 1.x builds on slim images.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libpq-dev \
        gcc \
    && rm -rf /var/lib/apt/lists/*


# ── Install Python dependencies ───────────────────────────────────────────────
# Copy requirements.txt first to exploit Docker's layer cache:
#   → If requirements.txt is unchanged, Docker skips the pip install entirely.
#   → Only a change to .py files triggers an image rebuild from the COPY . step.
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt


# ── Copy application source code ──────────────────────────────────────────────
COPY . .


# ── Document the exposed port ─────────────────────────────────────────────────
# admin-analytics runs on 8002 to avoid clashing with product-service (8001).
EXPOSE 8002


# ── Default command ───────────────────────────────────────────────────────────
# Exec form (list) so uvicorn is PID 1 and receives Docker signals directly.
# --host 0.0.0.0 is mandatory — without it uvicorn binds to 127.0.0.1 only
# and Docker's port forwarding cannot reach the process.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]
