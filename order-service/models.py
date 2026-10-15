# models.py
# ─────────────────────────────────────────────────────────────────────────────
# SQLAlchemy ORM models for the Order Service.
# Defines the 'orders' and 'order_items' tables with relational integrity.
# ─────────────────────────────────────────────────────────────────────────────

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import relationship
from database import Base


class Order(Base):
    """
    ORM model representing a customer order in the distributed system.
    Tracks state through the SAGA orchestration lifecycle:
      - PENDING   : Transaction initiated, awaiting microservice validation & reservations
      - CONFIRMED : All downstream steps succeeded, transaction finalized
      - FAILED    : Failure occurred, compensation completed (rolled back)
    """
    __tablename__ = "orders"
    __table_args__ = (
        Index("ix_orders_user_created", "user_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    total_amount = Column(Float, nullable=False, default=0.0)
    status = Column(String(20), nullable=False, default="PENDING", index=True)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # 1-to-many relationship with OrderItem
    items = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
        lazy="joined",  # Eager-load items when querying orders
    )


class OrderItem(Base):
    """
    ORM model representing individual line items within an order.
    """
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False, default=0.0)

    # Relationship back to parent Order
    order = relationship("Order", back_populates="items")
