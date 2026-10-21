/**
 * api/orderApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP client for the Order Service (FastAPI running on port 8004).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createApiClient } from './client';

const BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_ORDER_API_URL || 'http://localhost:8000';

const api = createApiClient(BASE_URL);

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
 * List orders with optional filters and secure pagination.
 * GET /orders?user_id=...&status=...&order_id=...&created_from=...&created_to=...&skip=...&limit=...
 */
export async function getOrders({
  userId,
  status,
  orderId,
  createdFrom,
  createdTo,
  skip = 0,
  limit = 20,
} = {}) {
  const params = { skip, limit };
  if (userId !== undefined && userId !== null && userId !== '') {
    params.user_id = userId;
  }
  if (status !== undefined && status !== null && status !== '') {
    params.status = status;
  }
  if (orderId !== undefined && orderId !== null && orderId !== '') {
    params.order_id = orderId;
  }
  if (createdFrom !== undefined && createdFrom !== null && createdFrom !== '') {
    params.created_from = createdFrom;
  }
  if (createdTo !== undefined && createdTo !== null && createdTo !== '') {
    params.created_to = createdTo;
  }

  const { data } = await api.get('/orders', { params });
  return data;
}

/**
 * Get paginated orders for a specific user (defaults to limit=20).
 * GET /orders?user_id={userId}&skip={skip}&limit={limit}
 * @param {number|string} userId
 * @param {Object} options - { skip, limit }
 */
export async function getMyOrders(userId, { skip = 0, limit = 20 } = {}) {
  return getOrders({ userId, skip, limit });
}

/**
 * Get single order by ID.
 * GET /orders/{orderId}
 */
export async function getOrderById(orderId) {
  const { data } = await api.get(`/orders/${orderId}`);
  return data;
}
