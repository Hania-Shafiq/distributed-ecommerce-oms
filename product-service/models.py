# models.py
# ─────────────────────────────────────────────────────────────────────────────
# Defines the SQLAlchemy ORM model for the "products" table.
# An ORM model is a Python class where each class attribute maps to a column
# in the database table.  SQLAlchemy handles the SQL generation for us.
# ─────────────────────────────────────────────────────────────────────────────

from sqlalchemy import Column, Integer, String, Float, Text
from database import Base   # Base from database.py tracks all models


class Product(Base):
    """
    ORM model → maps to the 'products' table in PostgreSQL.

    When main.py calls Base.metadata.create_all(engine) at startup,
    SQLAlchemy reads this class and issues a CREATE TABLE IF NOT EXISTS
    statement — so we never have to write raw DDL SQL ourselves.
    """

    # __tablename__ tells SQLAlchemy which DB table this class represents.
    # If the table doesn't exist, create_all() will create it with this name.
    __tablename__ = "products"

    # ── Primary key ───────────────────────────────────────────────────────────
    # Integer + primary_key=True → PostgreSQL uses a SERIAL / auto-increment
    # column by default.  index=True adds a B-tree index for fast lookups by id.
    id = Column(Integer, primary_key=True, index=True)

    # ── Required text fields ──────────────────────────────────────────────────
    # String(255) → VARCHAR(255).  nullable=False enforces NOT NULL at DB level
    # so invalid data can't sneak in via direct SQL.
    # index=True on name speeds up ORDER BY name or WHERE name = '...' queries.
    name     = Column(String(255), nullable=False, index=True)
    category = Column(String(100), nullable=False)

    # ── Price ─────────────────────────────────────────────────────────────────
    # Float maps to DOUBLE PRECISION in PostgreSQL.
    # For production money handling, consider using Numeric(10, 2) instead
    # to avoid floating-point rounding issues (e.g. 9.99 stored as 9.9900001).
    price = Column(Float, nullable=False)

    # ── Long-form text ────────────────────────────────────────────────────────
    # Text → unlimited-length text column.  nullable=True (default) because
    # a product description is optional — some quick listings may not have one.
    description = Column(Text, nullable=True)

    # ── Stock quantity ────────────────────────────────────────────────────────
    # default=0 means: if the caller doesn't supply a value, Python sets it to
    # 0 *before* the INSERT.  This is different from server_default which would
    # be a SQL default — Python-side default is safer in ORM usage.
    stock_quantity = Column(Integer, nullable=False, default=0)

    # ── Image URL ─────────────────────────────────────────────────────────────
    # Optional image link for frontend display. nullable=True allows products
    # without custom images to use frontend fallback placeholders.
    image_url = Column(String(500), nullable=True)
