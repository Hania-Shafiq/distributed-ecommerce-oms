# database.py
# ─────────────────────────────────────────────────────────────────────────────
# Connection bootstrap for the Admin Analytics Service.
#
# Previously this file managed a DuckDB connection + postgres_scanner extension.
# It has been replaced with Elasticsearch as the analytics store.
#
# What this file now does:
#   • Exports `es_client`  from elastic.py so main.py has a single import point.
#   • Re-exports LOW_STOCK_THRESHOLD from env (kept for backward compatibility
#     with docker-compose.yml environment variables).
# ─────────────────────────────────────────────────────────────────────────────

import os
from dotenv import load_dotenv

load_dotenv()

# Kept for docker-compose / .env backward compatibility.
# Used by the /analytics/low-stock endpoint (still queries products_db directly).
LOW_STOCK_THRESHOLD = int(os.getenv("LOW_STOCK_THRESHOLD", "10"))

# Re-export the ES client so main.py can do:
#   from database import es_client
from elastic import es_client, create_analytics_index_if_not_exists  # noqa: F401
