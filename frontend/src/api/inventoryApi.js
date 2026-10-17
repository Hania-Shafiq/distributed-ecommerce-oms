/**
 * api/inventoryApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP client for the Inventory Service (FastAPI running on port 8003).
 *
 * WHY A SEPARATE INVENTORY API?
 * The Product Service (products_db) stores a snapshot/seed value of
 * stock_quantity that is NEVER updated when orders are placed.
 * The Inventory Service (inventory_db) holds the live, authoritative stock
 * that is atomically deducted by the SAGA on every successful order.
 *
 * To show accurate stock counts after orders, the frontend must read from
 * the Inventory Service — not the Product Service.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_INVENTORY_API_URL || 'http://localhost:8000';

const api = axios.create({ baseURL: BASE_URL });

/**
 * Fetch the live stock record for a single product.
 * GET /inventory/{productId}
 * @param {number|string} productId
 * @returns {{ product_id, stock_quantity, updated_at, id }}
 */
export async function getInventoryStock(productId) {
  const { data } = await api.get(`/inventory/${productId}`);
  return data;
}

/**
 * Fetch all inventory records (paginated, default limit 1000).
 * GET /inventory?limit=1000
 * Returns a flat array; caller builds a productId → stock_quantity map.
 * @returns {Array<{ product_id, stock_quantity, updated_at, id }>}
 */
export async function getAllInventory(limit = 1000) {
  const { data } = await api.get('/inventory', { params: { limit } });
  return data;
}
