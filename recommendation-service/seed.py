# seed.py
# ─────────────────────────────────────────────────────────────────────────────
# Seed script for the Neo4j Recommendation Service.
# Populates the graph with realistic dummy dataset:
#   • 8 Users
#   • 10 Products (across Electronics, Books, Home, Fitness)
#   • 26 Purchases showing natural clusters of interest
#
# Run directly: python seed.py
# ─────────────────────────────────────────────────────────────────────────────

import sys
import logging
from graph import neo4j_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seed")

# ── Product Catalog ──────────────────────────────────────────────────────────
PRODUCTS = {
    1: {"name": "Mechanical Keyboard", "category": "Electronics"},
    2: {"name": "Wireless Ergonomic Mouse", "category": "Electronics"},
    3: {"name": "4K Ultra-HD Monitor", "category": "Electronics"},
    4: {"name": "Noise-Cancelling Headphones", "category": "Electronics"},
    5: {"name": "Clean Code by Robert C. Martin", "category": "Books"},
    6: {"name": "Designing Data-Intensive Applications", "category": "Books"},
    7: {"name": "Refactoring by Martin Fowler", "category": "Books"},
    8: {"name": "Ergonomic Office Chair", "category": "Home"},
    9: {"name": "Anti-Fatigue Standing Desk Mat", "category": "Home"},
    10: {"name": "Smart Hydration Water Bottle", "category": "Fitness"},
}

# ── Purchase Patterns (User ID → List of Product IDs) ────────────────────────
# Structured to produce rich collaborative recommendation signals:
# - Users 1, 2, 3: Heavy Tech/Developer cluster
# - Users 2, 5, 6: Software Engineering Book lovers
# - Users 4, 7, 8: Home Office & Wellness setup
PURCHASE_DATA = [
    # User 1: Dev setup
    (1, 1), (1, 2), (1, 3), (1, 4),
    # User 2: Dev & Tech Books
    (2, 1), (2, 2), (2, 5), (2, 6),
    # User 3: Programmer Workstation
    (3, 1), (3, 3), (3, 6), (3, 7),
    # User 4: Home Office & Audio
    (4, 2), (4, 4), (4, 8), (4, 9),
    # User 5: Reading & Tech Books
    (5, 5), (5, 6), (5, 7), (5, 1),
    # User 6: Tech Books & Audio
    (6, 5), (6, 6), (6, 4),
    # User 7: Home Office & Fitness
    (7, 8), (7, 9), (7, 10), (7, 2),
    # User 8: Ergonomics & Desk
    (8, 8), (8, 9), (8, 10),
]


def seed_database():
    """Populates Neo4j with constraints and seed data."""
    logger.info("Initializing Neo4j graph constraints...")
    try:
        neo4j_service.init_constraints()
    except Exception as e:
        logger.error(f"Failed to connect to Neo4j. Is Docker running? Error: {e}")
        sys.exit(1)

    logger.info(f"Seeding {len(PURCHASE_DATA)} purchases across {len(PRODUCTS)} products...")
    for user_id, product_id in PURCHASE_DATA:
        product = PRODUCTS[product_id]
        neo4j_service.record_purchase(
            user_id=user_id,
            product_id=product_id,
            product_name=product["name"],
            category=product["category"],
        )
        logger.info(f"✓ Recorded: User #{user_id} -> PURCHASED -> '{product['name']}' (#{product_id})")

    logger.info("=" * 60)
    logger.info("🎉 Database successfully seeded with 8 users, 10 products, and 26 relationships!")
    logger.info("=" * 60)


if __name__ == "__main__":
    seed_database()
    neo4j_service.close()
