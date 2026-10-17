/**
 * api/analyticsApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All HTTP calls to the Admin Analytics Service are centralised here.
 * Base URL: VITE_ANALYTICS_API_URL (http://localhost:8002 by default)
 *
 * Order analytics  → Elasticsearch aggregations (GET /analytics/top-selling-products, etc.)
 * Product analytics → Direct PostgreSQL queries   (GET /analytics/total-products, etc.)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_ANALYTICS_API_URL || 'http://localhost:8000';

const api = axios.create({ baseURL: BASE_URL });

// ── Product analytics (catalogue data from products_db) ───────────────────────

/** GET /analytics/total-products → { total_products: number } */
export async function getTotalProducts() {
  const { data } = await api.get('/analytics/total-products');
  return data;
}

/** GET /analytics/category-summary → [{ category, product_count, average_price }] */
export async function getCategorySummary() {
  const { data } = await api.get('/analytics/category-summary');
  return data;
}

/** GET /analytics/low-stock → [{ id, name, category, stock_quantity, price }] */
export async function getLowStock(threshold) {
  const params = threshold !== undefined ? { threshold } : {};
  const { data } = await api.get('/analytics/low-stock', { params });
  return data;
}

/** GET /analytics/price-range → { min_price, max_price, avg_price } */
export async function getPriceRange() {
  const { data } = await api.get('/analytics/price-range');
  return data;
}

// ── Order analytics (Elasticsearch aggregations on "analytics" index) ─────────

/**
 * GET /analytics/top-selling-products
 * → [{ product_id, product_name, total_quantity }]  sorted by quantity desc
 */
export async function getTopSellingProducts(limit = 10) {
  const { data } = await api.get('/analytics/top-selling-products', { params: { limit } });
  return data;
}

/**
 * GET /analytics/revenue-by-category
 * → [{ category, total_revenue }]  sorted by revenue desc
 */
export async function getRevenueByCategory() {
  const { data } = await api.get('/analytics/revenue-by-category');
  return data;
}

/**
 * GET /analytics/order-status
 * → [{ status, count }]  one entry per distinct order status
 */
export async function getOrderStatus() {
  const { data } = await api.get('/analytics/order-status');
  return data;
}
