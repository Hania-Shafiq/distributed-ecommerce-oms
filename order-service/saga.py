# saga.py
# ─────────────────────────────────────────────────────────────────────────────
# SAGA ORCHESTRATOR FOR DISTRIBUTED ORDER CREATION
#
# =============================================================================
# WHAT IS THE SAGA PATTERN AND WHY DO WE NEED COMPENSATION?
# =============================================================================
# In a monolithic architecture with a single database, multi-step operations
# use standard ACID transactions (BEGIN ... COMMIT / ROLLBACK). If any operation
# fails, the database engine rolls back all changes in memory automatically.
#
# In a Distributed Microservices Architecture:
# 1. Database-per-Service:
#    - User Service has `users_db`
#    - Product Service has `products_db`
#    - Inventory Service has `inventory_db`
#    - Order Service has `orders_db`
# 2. No Distributed ACID Transactions:
#    PostgreSQL cannot natively coordinate a transaction spanning multiple
#    network-isolated databases across different servers. 2-Phase Commit (2PC)
#    is notoriously slow, blocking, and introduces single points of failure.
# 3. The SAGA Solution:
#    A Saga coordinates a series of local transactions. Each service executes
#    its own local transaction. If a downstream step fails (e.g. out of stock),
#    the Saga orchestrator triggers explicit COMPENSATING TRANSACTIONS
#    (e.g., releasing previously reserved stock) in reverse order to undo earlier
#    effects and preserve eventual consistency.
# ─────────────────────────────────────────────────────────────────────────────

import time
import logging
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

import models
import schemas
from clients import product_client, inventory_client

logger = logging.getLogger("order_service.saga")


def _run_compensation(
    reserved_items: List[models.OrderItem],
    order: models.Order,
    db: Session,
    failure_reason: str,
):
    """
    Executes compensating transactions in reverse order for all items
    that were successfully reserved before the failure occurred.
    """
    logger.warning("=" * 70)
    logger.warning(f"⚠️  [SAGA COMPENSATION INITIATED] Order #{order.id}")
    logger.warning(f"   Reason: {failure_reason}")
    logger.warning(f"   Compensating {len(reserved_items)} previously reserved item(s)...")
    logger.warning("=" * 70)

    # Roll back in reverse order (LIFO: Last In, First Out)
    for item in reversed(reserved_items):
        logger.info(f"🔄 [SAGA COMPENSATION] Releasing {item.quantity} units for product #{item.product_id}...")
        success = inventory_client.release(item.product_id, item.quantity)
        if success:
            logger.info(f"✓  [SAGA COMPENSATION] Successfully released product #{item.product_id}.")
        else:
            logger.error(f"❌ [SAGA COMPENSATION ERROR] Failed to release product #{item.product_id}!")

    # Mark the order as FAILED in PostgreSQL
    order.status = "FAILED"
    db.commit()
    db.refresh(order)
    logger.warning(f"🔒 [SAGA COMPLETE] Order #{order.id} status marked as 'FAILED'.")
    logger.warning("=" * 70)


def execute_order_saga(
    payload: schemas.OrderCreate,
    db: Session,
    idempotency_key: Optional[str] = None,
) -> models.Order:
    """
    Executes the SAGA Orchestration Workflow for placing an order:

    Step 1: Create Order record in orders_db with status 'PENDING' (and optional idempotency_key).
    Step 2: For each item:
            a) Fetch current price from ProductClient.
            b) Call InventoryClient.reserve() to deduct stock.
            c) Track successful reservations.
    Step 3: If all succeed -> Calculate total, set status 'CONFIRMED', commit.
    Step 4: If any step fails -> Run compensation on reserved items, mark 'FAILED',
            raise HTTP error with failure explanation.
    """
    logger.info("=" * 70)
    logger.info(f"🚀 [SAGA START] Processing Order for user #{payload.user_id} with {len(payload.items)} item(s) (key: {idempotency_key})...")
    logger.info("=" * 70)

    # ── STEP 1: Persist initial order in PENDING state ────────────────────────
    new_order = models.Order(
        user_id=payload.user_id,
        status="PENDING",
        total_amount=0.0,
        idempotency_key=idempotency_key,
    )
    db.add(new_order)
    try:
        db.commit()
        db.refresh(new_order)
        logger.info(f"📝 [SAGA STEP 1] Created Order #{new_order.id} in DB with status 'PENDING'.")
    except Exception as exc:
        db.rollback()
        if idempotency_key:
            logger.warning(f"⚠️ [IDEMPOTENCY CONFLICT] Key '{idempotency_key}' collision in DB: {exc}")
            for _ in range(50):
                time.sleep(0.1)
                existing = db.query(models.Order).filter(models.Order.idempotency_key == idempotency_key).first()
                if existing and existing.status in ("CONFIRMED", "FAILED"):
                    return existing
            existing = db.query(models.Order).filter(models.Order.idempotency_key == idempotency_key).first()
            if existing:
                return existing
        raise exc

    # ── STEP 2: Product Price Lookup & Inventory Reservation ──────────────────
    reserved_items: List[models.OrderItem] = []
    total_order_amount = 0.0

    for item_data in payload.items:
        # 2a. Fetch product price from Product Service
        try:
            product_info = product_client.get_product(item_data.product_id)
            unit_price = float(product_info.get("price", 0.0))
            product_name = product_info.get("name", f"Product #{item_data.product_id}")
            logger.info(f"🏷️  [SAGA STEP 2a] Verified Product #{item_data.product_id} ('{product_name}') at ${unit_price:.2f}/unit.")
        except Exception as exc:
            error_msg = f"Failed to fetch product #{item_data.product_id}: {str(exc)}"
            logger.error(f"❌ [SAGA STEP 2a FAILED] {error_msg}")
            _run_compensation(reserved_items, new_order, db, error_msg)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Saga Aborted: {error_msg}",
            )

        # Create OrderItem entity
        order_item = models.OrderItem(
            order_id=new_order.id,
            product_id=item_data.product_id,
            quantity=item_data.quantity,
            unit_price=unit_price,
        )
        db.add(order_item)
        total_order_amount += unit_price * item_data.quantity

        # 2b. Forward Action: Reserve Stock from Inventory Service
        logger.info(f"📦 [SAGA STEP 2b] Requesting reservation of {item_data.quantity} units for Product #{item_data.product_id}...")
        try:
            reservation_ok = inventory_client.reserve(item_data.product_id, item_data.quantity)
        except Exception as exc:
            reservation_ok = False
            logger.error(f"❌ [SAGA STEP 2b EXCEPTION] Inventory reservation call failed: {exc}")

        if not reservation_ok:
            error_msg = (
                f"Insufficient stock for Product #{item_data.product_id} "
                f"(requested {item_data.quantity} units)."
            )
            logger.error(f"❌ [SAGA STEP 2b REJECTED] {error_msg}")
            _run_compensation(reserved_items, new_order, db, error_msg)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Saga Failed: {error_msg} Compensating transactions executed successfully.",
            )

        # Add to successfully reserved items list
        reserved_items.append(order_item)
        logger.info(f"✓  [SAGA STEP 2b] Successfully reserved {item_data.quantity} unit(s) of Product #{item_data.product_id}.")

    # ── STEP 3: Finalize Order Confirmation ──────────────────────────────────
    new_order.total_amount = round(total_order_amount, 2)
    new_order.status = "CONFIRMED"
    db.commit()
    db.refresh(new_order)

    logger.info("=" * 70)
    logger.info(f"🎉 [SAGA SUCCESS] Order #{new_order.id} CONFIRMED! Total: ${new_order.total_amount:.2f}")
    logger.info("=" * 70)

    # ── STEP 4: Fire-and-Forget / Best-Effort Event to Recommendation Service ───
    # WHY IS THIS FIRE-AND-FORGET?
    # 1. Non-Critical Auxiliary System:
    #    The core transaction (inventory deduction & order persistence) is already
    #    100% committed in PostgreSQL. The recommendation graph is an auxiliary feature.
    # 2. Resiliency & Decoupling:
    #    If the Recommendation Service is down, slow, or fails, we MUST NEVER fail,
    #    roll back, or cancel a customer's confirmed order!
    # 3. Best-Effort Execution:
    #    Wrapped in a strict try/except with a 2-second timeout so the user's HTTP
    #    response is returned immediately.
    _send_recommendation_events(new_order, payload.user_id, reserved_items)

    return new_order


def _send_recommendation_events(
    order: models.Order,
    user_id: int,
    items: List[models.OrderItem],
):
    """
    Sends purchase events to the Recommendation Service asynchronously / best-effort.
    """
    import os
    import requests
    rec_url = os.getenv("RECOMMENDATION_SERVICE_URL", "http://localhost:8005").rstrip("/")
    internal_key = os.getenv("INTERNAL_SERVICE_KEY", "")
    headers = {"X-Service-Key": internal_key} if internal_key else {}
    endpoint = f"{rec_url}/graph/purchase"

    for item in items:
        # Retrieve product metadata (name, category)
        try:
            prod = product_client.get_product(item.product_id)
            product_name = prod.get("name", f"Product #{item.product_id}")
            category = prod.get("category", "General")
        except Exception:
            product_name = f"Product #{item.product_id}"
            category = "General"

        payload = {
            "user_id": user_id,
            "product_id": item.product_id,
            "product_name": product_name,
            "category": category,
        }

        try:
            logger.info(f"📡 [EVENT PUBLISH] Notifying Recommendation Service: User #{user_id} bought Product #{item.product_id}...")
            res = requests.post(endpoint, json=payload, headers=headers, timeout=2.0)
            if res.status_code in (200, 201):
                logger.info(f"✓  [EVENT ACK] Recommendation Service registered purchase for Product #{item.product_id}.")
            else:
                logger.warning(f"⚠️ [EVENT WARN] Recommendation Service returned status {res.status_code}: {res.text}")
        except Exception as exc:
            # Non-blocking warning — NEVER roll back or crash
            logger.warning(f"⚠️ [EVENT FAILED] Could not send purchase event to Recommendation Service ({exc}). Order #{order.id} remains CONFIRMED.")
