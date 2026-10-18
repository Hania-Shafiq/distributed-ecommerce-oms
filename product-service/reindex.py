# reindex.py
# ─────────────────────────────────────────────────────────────────────────────
# Standalone idempotent reindex script inside product-service.
# Reindexes all products from PostgreSQL into Elasticsearch with embeddings.
#
# Usage:
#   docker exec product-service python reindex.py
# ─────────────────────────────────────────────────────────────────────────────

import sys
import logging
from elastic import update_mapping_and_reindex

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

if __name__ == "__main__":
    print("[Reindex] Starting idempotent product reindexing with embeddings...")
    update_mapping_and_reindex()
    print("[Reindex] Reindexing completed successfully.")
