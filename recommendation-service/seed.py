# seed.py
# ─────────────────────────────────────────────────────────────────────────────
# Seed script for the Neo4j Recommendation Service.
# Aligned with product-service catalog (IDs 1-10).
# ─────────────────────────────────────────────────────────────────────────────

import sys
import logging
from graph import neo4j_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seed")

# ── Matching Product Catalog (from product-service) ──────────────────────────
PRODUCTS = {
    1: {"name": "Wireless Noise-Cancelling Headphones", "category": "Electronics"},
    2: {"name": "Mechanical Gaming Keyboard", "category": "Electronics"},
    3: {"name": "Ergonomic Office Chair", "category": "Furniture"},
    4: {"name": "Stainless Steel Water Bottle", "category": "Kitchen"},
    5: {"name": "Yoga Mat", "category": "Sports & Outdoors"},
    6: {"name": "4K USB-C Monitor 27 inch", "category": "Electronics"},
    7: {"name": "Electric Kettle", "category": "Kitchen"},
    8: {"name": "Running Shoes Mens", "category": "Sports & Outdoors"},
    9: {"name": "Leather Wallet", "category": "Accessories"},
    10: {"name": "Portable Bluetooth Speaker", "category": "Electronics"},
}

# ── Purchase Patterns (User ID → List of Product IDs) ────────────────────────
PURCHASE_DATA = [
    # User 1: Audio & Desk setup
    (1, 1), (1, 2), (1, 6), (1, 10),
    # User 2: Gaming & Workspace setup
    (2, 2), (2, 6), (2, 3), (2, 1),
    # User 3: Ergonomics & Office
    (3, 3), (3, 2), (3, 6), (3, 4),
    # User 4: Home & Kitchen
    (4, 4), (4, 7), (4, 3), (4, 9),
    # User 5: Fitness & Outdoors
    (5, 5), (5, 8), (5, 4), (5, 10),
    # User 6: Active Lifestyle & Audio
    (6, 1), (6, 5), (6, 8), (6, 10),
    # User 7: Daily Essentials
    (7, 9), (7, 4), (7, 1), (7, 2),
    # User 8: Full Workstation
    (8, 2), (8, 3), (8, 6), (8, 1),
]


def seed_database():
    """Populates Neo4j with constraints and seed data."""
    logger.info("Initializing Neo4j graph constraints...")
    try:
        neo4j_service.init_constraints()
    except Exception as e:
        logger.error(f"Failed to connect to Neo4j. Error: {e}")
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

    logger.info("=" * 60)
    logger.info("🎉 Database successfully seeded with rich co-purchases!")
    logger.info("=" * 60)


if __name__ == "__main__":
    seed_database()
    neo4j_service.close()
