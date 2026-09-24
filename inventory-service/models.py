# models.py
# ─────────────────────────────────────────────────────────────────────────────
# Defines the SQLAlchemy ORM model for the "inventory" table.
# An ORM model is a Python class where each class attribute maps to a column
# in the database table. SQLAlchemy handles the SQL generation for us.
# ─────────────────────────────────────────────────────────────────────────────

from sqlalchemy import Column, Integer, DateTime, CheckConstraint, func
from database import Base   # Base from database.py tracks all models


class Inventory(Base):
    """
    ORM model → maps to the 'inventory' table in PostgreSQL.

    When main.py calls Base.metadata.create_all(engine) at startup,
    SQLAlchemy reads this class and issues a CREATE TABLE IF NOT EXISTS
    statement — so we never have to write raw DDL SQL ourselves.
    """

    # __tablename__ tells SQLAlchemy which DB table this class represents.
    __tablename__ = "inventory"

    # ── Table Constraints ─────────────────────────────────────────────────────
    # Database-level CHECK constraint: guarantees at the engine level that stock
    # can never drop below 0 under any circumstance (concurrency safety net).
    __table_args__ = (
        CheckConstraint("stock_quantity >= 0", name="check_stock_quantity_non_negative"),
    )

    # ── Primary key ───────────────────────────────────────────────────────────
    # Integer + primary_key=True → PostgreSQL uses a SERIAL / auto-increment
    # column by default. index=True adds a B-tree index for fast lookups by id.
    id = Column(Integer, primary_key=True, index=True)

    # ── Product Reference ─────────────────────────────────────────────────────
    # product_id is UNIQUE because each product has exactly one inventory entry.
    # index=True ensures O(log N) lookup speed when querying / updating by product_id.
    product_id = Column(Integer, unique=True, index=True, nullable=False)

    # ── Stock quantity ────────────────────────────────────────────────────────
    # default=0 sets initial value if omitted.
    # nullable=False enforces that quantity must be present.
    stock_quantity = Column(Integer, nullable=False, default=0)

    # ── Timestamp ─────────────────────────────────────────────────────────────
    # server_default=func.now() sets the creation timestamp on PostgreSQL.
    # onupdate=func.now() automatically updates the timestamp on every record modification.
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
