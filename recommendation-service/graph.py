# graph.py
# ─────────────────────────────────────────────────────────────────────────────
# Neo4j Graph Database Driver & Cypher Recommendation Engine.
#
# =============================================================================
# WHY A GRAPH DATABASE (NEO4J) IS SUPERIOR TO RELATIONAL SQL FOR RECOMMENDATIONS
# =============================================================================
# 1. Relational SQL Approach (Multi-Table JOINs):
#    To answer "Customers who bought X also bought Y" in SQL, the database must
#    join the `order_items` table with itself multiple times:
#      SELECT o2.product_id, COUNT(*)
#      FROM order_items o1
#      JOIN order_items o2 ON o1.order_id = o2.order_id
#      WHERE o1.product_id = :id
#      GROUP BY o2.product_id;
#    In a table with 50M rows, each JOIN involves index lookups or large hash
#    joins ($O(N \log N)$ or disk scans). As graph depth increases (e.g. 2, 3, or
#    4 hops: friends-of-friends, cross-category recommendations), SQL query times
#    grow exponentially and frequently timeout.
#
# 2. Graph Database (Index-Free Adjacency):
#    Neo4j does not use index lookups to find connected entities at query time.
#    Instead, every node holds direct physical pointers in memory to its connected
#    relationships. Traversing from Product → User → Other Products takes $O(k)$
#    time (proportional only to the number of direct connections of those specific
#    nodes), completely independent of the total size of the database!
# ─────────────────────────────────────────────────────────────────────────────

import os
import logging
from typing import List, Dict, Any, Optional
from neo4j import GraphDatabase, Driver
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("recommendation_service.graph")

# ── Connection Configuration ─────────────────────────────────────────────────
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "")


class Neo4jService:
    """Manages the Neo4j driver connection and Cypher query execution."""

    def __init__(self, uri: str, user: str, password: str):
        self._driver: Driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        """Cleanly close the driver pool on application shutdown."""
        if self._driver:
            self._driver.close()

    def check_connection(self) -> bool:
        """Verifies database connectivity with a lightweight probe."""
        with self._driver.session() as session:
            result = session.run("RETURN 1 AS ping")
            record = result.single()
            return record is not None and record["ping"] == 1

    def init_constraints(self):
        """
        Creates uniqueness constraints on User.id and Product.id at startup.
        Ensures idempotent MERGE operations and builds B-Tree indexes for O(1) entry lookups.
        """
        constraints = [
            # Ensure User IDs are unique across all User nodes
            "CREATE CONSTRAINT IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE;",
            # Ensure Product IDs are unique across all Product nodes
            "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Product) REQUIRE p.id IS UNIQUE;",
        ]
        with self._driver.session() as session:
            for constraint_query in constraints:
                session.run(constraint_query)
        logger.info("[Neo4j] Uniqueness constraints verified on User.id and Product.id.")

    # ═════════════════════════════════════════════════════════════════════════
    #  CYPHER QUERY: RECORD PURCHASE (GRAPH UPSERT)
    # ═════════════════════════════════════════════════════════════════════════
    def record_purchase(
        self,
        user_id: int,
        product_id: int,
        product_name: str,
        category: str,
    ) -> Dict[str, Any]:
        """
        Idempotently inserts or updates User and Product nodes and creates the
        PURCHASED relationship between them.

        Cypher Explanation:
        1. MERGE (u:User {id: $user_id}): Looks up existing user; creates if missing.
        2. MERGE (p:Product {id: $product_id}): Looks up product; creates if missing.
        3. ON CREATE / ON MATCH: Keeps product name and category up to date.
        4. MERGE (u)-[r:PURCHASED]->(p): Establishes relationship without creating duplicates.
        """
        cypher = """
        MERGE (u:User {id: $user_id})
        MERGE (p:Product {id: $product_id})
          ON CREATE SET p.name = $product_name, p.category = $category
          ON MATCH  SET p.name = $product_name, p.category = $category
        MERGE (u)-[r:PURCHASED]->(p)
          ON CREATE SET r.at = datetime()
        RETURN u.id AS user_id, p.id AS product_id, p.name AS product_name
        """
        with self._driver.session() as session:
            result = session.run(
                cypher,
                user_id=user_id,
                product_id=product_id,
                product_name=product_name,
                category=category,
            )
            record = result.single()
            return dict(record) if record else {}

    # ═════════════════════════════════════════════════════════════════════════
    #  CYPHER QUERY: "CUSTOMERS WHO BOUGHT THIS ALSO BOUGHT" (ITEM-TO-ITEM)
    # ═════════════════════════════════════════════════════════════════════════
    def get_product_recommendations(
        self,
        product_id: int,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Recommends products frequently co-purchased with a given product.

        Cypher Explanation:
        1. MATCH (target:Product {id: $product_id})<-[:PURCHASED]-(u:User)-[:PURCHASED]->(rec:Product)
           Traverses from the target product backwards to all users who bought it,
           and then forward along all their other PURCHASED edges to discover recommended products.
        2. WHERE rec.id <> $product_id
           Filters out the seed product itself so we don't recommend what they are already looking at.
        3. RETURN rec.id, rec.name, rec.category, count(DISTINCT u) AS score
           Aggregates how many unique co-purchasing customers bought this other product.
        4. ORDER BY score DESC, rec.name ASC
           Ranks the most frequently co-purchased products first.
        """
        cypher = """
        MATCH (target:Product {id: $product_id})<-[:PURCHASED]-(u:User)-[:PURCHASED]->(rec:Product)
        WHERE rec.id <> $product_id
        RETURN rec.id AS product_id,
               rec.name AS name,
               rec.category AS category,
               count(DISTINCT u) AS score
        ORDER BY score DESC, rec.name ASC
        LIMIT $limit
        """
        with self._driver.session() as session:
            result = session.run(cypher, product_id=product_id, limit=limit)
            return [dict(record) for record in result]

    # ═════════════════════════════════════════════════════════════════════════
    #  CYPHER QUERY: COLLABORATIVE FILTERING (USER-TO-USER)
    # ═════════════════════════════════════════════════════════════════════════
    def get_user_recommendations(
        self,
        user_id: int,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Recommends products bought by similar users (peers with overlapping purchases)
        that the target user hasn't bought yet.

        Cypher Explanation:
        1. MATCH (target:User {id: $user_id})-[:PURCHASED]->(common:Product)<-[:PURCHASED]-(peer:User)-[:PURCHASED]->(rec:Product)
           - Finds products already bought by target user (`common`).
           - Discovers other `peer` users who bought those same products.
           - Traverses from those peers to what ELSE they bought (`rec`).
        2. WHERE target <> peer
           Prevents matching the user against themselves.
        3. AND NOT (target)-[:PURCHASED]->(rec)
           CRITICAL: Guarantees we only recommend novel items the user has not yet purchased!
        4. RETURN rec.id, rec.name, rec.category, count(DISTINCT peer) AS score
           Counts the number of distinct peers endorsing this product.
        5. ORDER BY score DESC
           Highest overlap score appears first.
        """
        cypher = """
        MATCH (target:User {id: $user_id})-[:PURCHASED]->(common:Product)<-[:PURCHASED]-(peer:User)-[:PURCHASED]->(rec:Product)
        WHERE target <> peer
          AND NOT (target)-[:PURCHASED]->(rec)
        RETURN rec.id AS product_id,
               rec.name AS name,
               rec.category AS category,
               count(DISTINCT peer) AS score
        ORDER BY score DESC, rec.name ASC
        LIMIT $limit
        """
        with self._driver.session() as session:
            result = session.run(cypher, user_id=user_id, limit=limit)
            return [dict(record) for record in result]

    # ═════════════════════════════════════════════════════════════════════════
    #  CYPHER QUERY: PRODUCT CO-PURCHASE NETWORK GRAPH (ADMIN ONLY)
    # ═════════════════════════════════════════════════════════════════════════
    def get_network_graph(
        self,
        limit_edges: int = 150,
    ) -> Dict[str, Any]:
        """
        Returns co-purchase network topology with nodes and edges.
        Weight = number of distinct users who bought both products.
        Uses BOUGHT_WITH edges when present, else falls back to PURCHASED edges (read-only Cypher).
        """
        with self._driver.session() as session:
            # Check if any BOUGHT_WITH relationships exist
            check_res = session.run("MATCH ()-[r:BOUGHT_WITH]->() RETURN count(r) AS cnt").single()
            has_bought_with = check_res and check_res["cnt"] > 0

            if has_bought_with:
                cypher = """
                MATCH (a:Product)-[r:BOUGHT_WITH]-(b:Product)
                WHERE a.id < b.id
                RETURN a.id AS source,
                       a.name AS source_name,
                       a.category AS source_cat,
                       b.id AS target,
                       b.name AS target_name,
                       b.category AS target_cat,
                       r.weight AS weight
                ORDER BY r.weight DESC, a.id ASC, b.id ASC
                LIMIT $limit_edges
                """
                records = list(session.run(cypher, limit_edges=limit_edges))
            else:
                # Read-only Cypher fallback traversing PURCHASED edges
                cypher = """
                MATCH (u:User)-[:PURCHASED]->(a:Product)
                MATCH (u)-[:PURCHASED]->(b:Product)
                WHERE a.id < b.id
                WITH a, b, count(DISTINCT u) AS weight
                WHERE weight > 0
                RETURN a.id AS source,
                       a.name AS source_name,
                       a.category AS source_cat,
                       b.id AS target,
                       b.name AS target_name,
                       b.category AS target_cat,
                       weight
                ORDER BY weight DESC, a.id ASC, b.id ASC
                LIMIT $limit_edges
                """
                records = list(session.run(cypher, limit_edges=limit_edges))

            edges = []
            degrees: Dict[int, int] = {}
            nodes_dict: Dict[int, Dict[str, Any]] = {}

            # Populate all catalog Product nodes in Neo4j
            all_prods = session.run("MATCH (p:Product) RETURN p.id AS id, p.name AS name, p.category AS category")
            for p in all_prods:
                pid = int(p["id"])
                nodes_dict[pid] = {
                    "id": pid,
                    "name": p["name"] or f"Product #{pid}",
                    "category": p["category"] or "General",
                }

            for rec in records:
                s = int(rec["source"])
                t = int(rec["target"])
                w = int(rec["weight"])

                edges.append({
                    "source": s,
                    "target": t,
                    "weight": w,
                })
                degrees[s] = degrees.get(s, 0) + 1
                degrees[t] = degrees.get(t, 0) + 1

                if s not in nodes_dict:
                    nodes_dict[s] = {
                        "id": s,
                        "name": rec["source_name"] or f"Product #{s}",
                        "category": rec["source_cat"] or "General",
                    }
                if t not in nodes_dict:
                    nodes_dict[t] = {
                        "id": t,
                        "name": rec["target_name"] or f"Product #{t}",
                        "category": rec["target_cat"] or "General",
                    }

            nodes = [
                {
                    "id": n["id"],
                    "name": n["name"],
                    "category": n["category"],
                    "degree": degrees.get(n["id"], 0),
                }
                for n in nodes_dict.values()
            ]
            nodes.sort(key=lambda x: (-x["degree"], x["id"]))

            return {
                "nodes": nodes,
                "edges": edges,
            }


# Global singleton Neo4j instance
neo4j_service = Neo4jService(
    uri=NEO4J_URI,
    user=NEO4J_USER,
    password=NEO4J_PASSWORD,
)
