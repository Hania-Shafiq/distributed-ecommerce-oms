/**
 * api/orderApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP client for the Order Service (FastAPI running on port 8004).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_ORDER_API_URL || 'http://localhost:8000';

const api = axios.create({ baseURL: BASE_URL });

/**
 * Place a new order (runs SAGA orchestrator).
 * POST /orders
 * @param {Object} orderData - { user_id, items: [{ product_id, quantity }] }
 * @param {string} [idempotencyKey] - Unique key per checkout attempt
 */
export async function placeOrder(orderData, idempotencyKey = null) {
  const headers = {};
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  const { data } = await api.post('/orders', orderData, { headers });
  return data;
}

/**
 * Get orders for a specific user.
 * GET /orders?user_id={userId}
 * @param {number|string} userId
 */
export async function getMyOrders(userId) {
  const { data } = await api.get('/orders', {
    params: userId ? { user_id: userId } : {},
  });
  return data;
}

/**
 * Get single order by ID.
 * GET /orders/{orderId}
 */
export async function getOrderById(orderId) {
  const { data } = await api.get(`/orders/${orderId}`);
  return data;
}
