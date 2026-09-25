/**
 * api/orderApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Placeholder for Order/Inventory Service API calls.
 * Base URL: VITE_ORDER_API_URL (http://localhost:8003 by default)
 *
 * NOTE: Exact routes are not yet finalised with the team.
 * When confirmed, replace the stub functions below with real implementations.
 * Components import from here — no changes needed in component files once
 * these stubs are filled in.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_ORDER_API_URL || 'http://localhost:8003';

const api = axios.create({ baseURL: BASE_URL });

/**
 * Place an order.
 * Route TBD — stub returns a resolved promise so the Cart page can
 * show a success state during development without a live backend.
 */
export async function placeOrder(orderData) {
  // TODO: replace with real route when confirmed
  // const { data } = await api.post('/orders', orderData);
  // return data;
  console.warn('[orderApi] placeOrder is a stub — Order Service route not yet confirmed.');
  return { success: true, order_id: 'STUB-001', ...orderData };
}

/**
 * Get orders for the logged-in user.
 * Route TBD.
 */
export async function getMyOrders() {
  // TODO: replace with real route when confirmed
  console.warn('[orderApi] getMyOrders is a stub — Order Service route not yet confirmed.');
  return [];
}
