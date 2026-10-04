# ─────────────────────────────────────────────────────────────────────────────
# Dockerfile — admin-analytics
# ─────────────────────────────────────────────────────────────────────────────
# Build context: ./admin-analytics   (set in docker-compose.yml)
# Final image runs: uvicorn main:app --host 0.0.0.0 --port 8002
#
# Analytics store change: DuckDB → Elasticsearch
#   • DuckDB required libpq-dev + gcc at build time (for postgres extension).
#   • Elasticsearch client (Python) + psycopg2-binary are pure-Python / bundled:
#     no extra system packages needed — the image is leaner as a result.
# ─────────────────────────────────────────────────────────────────────────────


# ── Stage: base image ─────────────────────────────────────────────────────────
FROM python:3.11-slim


# ── Working directory ─────────────────────────────────────────────────────────
WORKDIR /app


# ── Install Python dependencies ───────────────────────────────────────────────
# Copy requirements.txt first to exploit Docker's layer cache:
#   → If requirements.txt is unchanged, Docker skips the pip install entirely.
#   → Only a change to .py files triggers an image rebuild from the COPY . step.
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt


# ── Copy application source code ──────────────────────────────────────────────
COPY . .


# ── Document the exposed port ─────────────────────────────────────────────────
EXPOSE 8002


# ── Default command ───────────────────────────────────────────────────────────
# Exec form (list) so uvicorn is PID 1 and receives Docker signals directly.
# --host 0.0.0.0 is mandatory — without it uvicorn binds to 127.0.0.1 only
# and Docker's port forwarding cannot reach the process.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]

