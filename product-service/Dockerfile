# ─────────────────────────────────────────────────────────────────────────────
# Dockerfile — product-service
# ─────────────────────────────────────────────────────────────────────────────
# Build context: ./product-service   (set in docker-compose.yml)
# Final image runs: uvicorn main:app --host 0.0.0.0 --port 8001
# ─────────────────────────────────────────────────────────────────────────────


# ── Stage: base image ─────────────────────────────────────────────────────────
# python:3.11-slim is the official Python image built on Debian Bookworm with
# only the minimal packages needed to run Python.
#   • "slim" saves ~600 MB vs the full image (no build tools, docs, test suites)
#   • We pin to 3.11 (not 3.12) because it is the LTS-stable version most
#     compatible with the pinned dependency versions in requirements.txt
FROM python:3.11-slim


# ── Working directory ─────────────────────────────────────────────────────────
# All subsequent COPY / RUN / CMD instructions operate relative to this path
# inside the container.  /app is a Docker convention for application code.
WORKDIR /app


# ── Install system dependencies ───────────────────────────────────────────────
# psycopg2-binary ships a pre-compiled C extension; it needs libpq (the
# PostgreSQL client library) to be present at runtime even in the slim image.
# --no-install-recommends keeps the layer thin by skipping optional packages.
# Combining apt-get update + install in one RUN layer avoids the Docker cache
# serving a stale package list on a later rebuild.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*
#   ↑ rm cleans the apt cache so it doesn't bloat the image layer


# ── Install Python dependencies ───────────────────────────────────────────────
# We COPY requirements.txt first (before the rest of the source code) so that
# Docker can cache this layer independently.
#
# How Docker layer caching works here:
#   • If requirements.txt hasn't changed → Docker reuses the cached pip install
#     layer and skips re-downloading all packages (saves 30-60 s per rebuild).
#   • If any .py file changes → only the COPY . . layer is invalidated, and
#     the pip layer stays cached.
#
# This is the single most important Dockerfile performance trick for Python.
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt
#   --no-cache-dir: pip won't save downloaded wheels to ~/.cache/pip inside the
#   image, keeping the layer smaller (we never need to re-use the cache inside
#   a container — we just rebuild the image).


# ── Copy application source code ──────────────────────────────────────────────
# Copies everything from ./product-service (the build context) into /app.
# This is intentionally AFTER the pip install step for the caching reason above.
COPY . .


# ── Document the exposed port ─────────────────────────────────────────────────
# EXPOSE is documentation only — it does NOT publish the port to the host.
# The actual port binding happens in docker-compose.yml via "ports:".
# We expose 8001 to match the uvicorn command below.
EXPOSE 8001


# ── Default command ───────────────────────────────────────────────────────────
# CMD runs when the container starts.  We use the list ("exec") form so that
# uvicorn is PID 1 (not wrapped in a shell), which means Docker signals like
# SIGTERM reach it directly and trigger a graceful shutdown.
#
# --host 0.0.0.0  → listen on ALL network interfaces inside the container.
#   Without this, uvicorn defaults to 127.0.0.1 (loopback only) and Docker's
#   port forwarding can't reach it — the service would appear to be running
#   but every request would time out.
# --port 8001     → matches the EXPOSE above and the compose port mapping.
# Note: --reload is intentionally omitted for container use; file watching is
#   a development convenience that wastes CPU in production containers.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
