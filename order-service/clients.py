# clients.py
# ─────────────────────────────────────────────────────────────────────────────
# Downstream Microservice Clients for Product and Inventory Services.
#
# Implements both MOCK and REAL clients with an automated factory pattern
# controlled by the `USE_MOCK` environment variable.
#
# Why Mock Clients?
# In microservice architectures, different teams develop services concurrently.
# Mock clients allow the Order Service and its SAGA orchestration logic to be
# thoroughly developed, unit tested, and demonstrated without requiring all
# remote microservices to be running.
# ─────────────────────────────────────────────────────────────────────────────

import os
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any
import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("order_service.clients")

# ── Configuration & Mock Switch ──────────────────────────────────────────────
USE_MOCK: bool = os.getenv("USE_MOCK", "true").lower() in ("true", "1", "yes")
PRODUCT_SERVICE_URL: str = os.getenv("PRODUCT_SERVICE_URL", "http://localhost:8006").rstrip("/")
INVENTORY_SERVICE_URL: str = os.getenv("INVENTORY_SERVICE_URL", "http://localhost:8003").rstrip("/")
RECOMMENDATION_SERVICE_URL: str = os.getenv("RECOMMENDATION_SERVICE_URL", "http://localhost:8005").rstrip("/")
HTTP_TIMEOUT_SECONDS: float = 5.0


# ═════════════════════════════════════════════════════════════════════════════
#  PRODUCT CLIENT INTERFACE & IMPLEMENTATIONS
# ═════════════════════════════════════════════════════════════════════════════

class BaseProductClient(ABC):
    """Abstract interface for communicating with the Product Service."""

    @abstractmethod
    def get_product(self, product_id: int) -> Dict[str, Any]:
        """Fetch product details (name, price) by product ID."""
        pass


class MockProductClient(BaseProductClient):
    """
    Simulated Product Service client.
    Returns deterministic product data without external network calls.
    """

    def get_product(self, product_id: int) -> Dict[str, Any]:
        logger.info(f"[MOCK ProductClient] Fetching product {product_id}...")
        # Simulated products
        return {
            "id": product_id,
            "name": f"Mock Product #{product_id}",
            "price": 29.99 + (product_id % 10) * 5.0,  # dynamic deterministic price
            "category": "Electronics",
        }


class RealProductClient(BaseProductClient):
    """
    Live Product Service client using requests.
    Communicates with GET /products/{id}.
    """

    def __init__(self, base_url: str):
        self.base_url = base_url

    def get_product(self, product_id: int) -> Dict[str, Any]:
        url = f"{self.base_url}/products/{product_id}"
        logger.info(f"[REAL ProductClient] GET {url}")
        try:
            response = requests.get(url, timeout=HTTP_TIMEOUT_SECONDS)
            if response.status_code == 404:
                raise ValueError(f"Product #{product_id} not found in Product Service.")
            response.raise_for_status()
            return response.json()
        except requests.RequestException as exc:
            logger.error(f"[ProductClient] Connection failed to {url}: {exc}")
            raise RuntimeError(f"Product Service unavailable at {url}: {str(exc)}")


# ═════════════════════════════════════════════════════════════════════════════
#  INVENTORY CLIENT INTERFACE & IMPLEMENTATIONS
# ═════════════════════════════════════════════════════════════════════════════

class BaseInventoryClient(ABC):
    """Abstract interface for communicating with the Inventory Service."""

    @abstractmethod
    def reserve(self, product_id: int, quantity: int) -> bool:
        """Forward action: Reserve / reduce stock for an order item."""
        pass

    @abstractmethod
    def release(self, product_id: int, quantity: int) -> bool:
        """Compensating action: Restock / release previously reserved stock."""
        pass


class MockInventoryClient(BaseInventoryClient):
    """
    Simulated Inventory Service client.
    Special Behavior for Demo / Testing:
      - Product ID 999 is hardcoded to FAIL reservation.
      - This allows reliable testing and demonstration of the SAGA
        compensation (rollback) flow without breaking other test items!
    """

    def reserve(self, product_id: int, quantity: int) -> bool:
        logger.info(f"[MOCK InventoryClient] Attempting to reserve {quantity} units for product #{product_id}...")
        if product_id == 999:
            logger.warning(f"[MOCK InventoryClient] Product #{product_id} triggered OUT-OF-STOCK simulation!")
            return False
        return True

    def release(self, product_id: int, quantity: int) -> bool:
        logger.info(f"[MOCK InventoryClient] COMPENSATING: Released {quantity} units back for product #{product_id}.")
        return True


class RealInventoryClient(BaseInventoryClient):
    """
    Live Inventory Service client using requests.
    Uses PUT /inventory/{product_id}/reduce for forward reservation,
    and PUT /inventory/{product_id}/restock for compensation.
    """

    def __init__(self, base_url: str):
        self.base_url = base_url

    def reserve(self, product_id: int, quantity: int) -> bool:
        url = f"{self.base_url}/inventory/{product_id}/reduce"
        logger.info(f"[REAL InventoryClient] PUT {url} payload={{'amount': {quantity}}}")
        try:
            response = requests.put(url, json={"amount": quantity}, timeout=HTTP_TIMEOUT_SECONDS)
            if response.status_code == 200:
                return True
            elif response.status_code in (404, 409):
                logger.warning(f"[InventoryClient] Reservation refused: {response.text}")
                return False
            else:
                response.raise_for_status()
                return True
        except requests.RequestException as exc:
            logger.error(f"[InventoryClient] Network error connecting to {url}: {exc}")
            raise RuntimeError(f"Inventory Service unavailable: {str(exc)}")

    def release(self, product_id: int, quantity: int) -> bool:
        url = f"{self.base_url}/inventory/{product_id}/restock"
        logger.info(f"[REAL InventoryClient COMPENSATING] PUT {url} payload={{'amount': {quantity}}}")
        try:
            response = requests.put(url, json={"amount": quantity}, timeout=HTTP_TIMEOUT_SECONDS)
            if response.status_code == 200:
                return True
            logger.error(f"[InventoryClient] Failed to release stock: {response.text}")
            return False
        except requests.RequestException as exc:
            logger.error(f"[InventoryClient] Critical error during compensation release: {exc}")
            return False


# ═════════════════════════════════════════════════════════════════════════════
#  CLIENT FACTORY / INSTANTIATION
# ═════════════════════════════════════════════════════════════════════════════
# The active client instances are determined by USE_MOCK in .env.
if USE_MOCK:
    logger.info(">>> Running Order Service in MOCK CLIENT mode (USE_MOCK=true) <<<")
    product_client: BaseProductClient = MockProductClient()
    inventory_client: BaseInventoryClient = MockInventoryClient()
else:
    logger.info(f">>> Running Order Service in REAL CLIENT mode (Product: {PRODUCT_SERVICE_URL}, Inventory: {INVENTORY_SERVICE_URL}) <<<")
    product_client = RealProductClient(PRODUCT_SERVICE_URL)
    inventory_client = RealInventoryClient(INVENTORY_SERVICE_URL)
