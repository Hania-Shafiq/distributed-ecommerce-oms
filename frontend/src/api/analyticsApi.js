/**
 * api/analyticsApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All HTTP calls to the Admin Analytics Service are centralised here.
 * Base URL: VITE_ANALYTICS_API_URL (http://localhost:8002 by default)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_ANALYTICS_API_URL || 'http://localhost:8002';

const api = axios.create({ baseURL: BASE_URL });

/** GET /analytics/total-products → { total: number } */
export async function getTotalProducts() {
  const { data } = await api.get('/analytics/total-products');
  return data;
}

/** GET /analytics/category-summary → [{ category, count, avg_price }] */
export async function getCategorySummary() {
  const { data } = await api.get('/analytics/category-summary');
  return data;
}

/** GET /analytics/low-stock → [{ id, name, stock_quantity }] */
export async function getLowStock() {
  const { data } = await api.get('/analytics/low-stock');
  return data;
}

/** GET /analytics/price-range → { min_price, max_price, avg_price } */
export async function getPriceRange() {
  const { data } = await api.get('/analytics/price-range');
  return data;
}
