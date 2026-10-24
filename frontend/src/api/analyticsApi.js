/**
 * api/analyticsApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All HTTP calls to the Admin Analytics Service are centralised here.
 * Base URL: VITE_ANALYTICS_API_URL (http://localhost:8002 by default or / via gateway)
 *
 * Order analytics  → Elasticsearch aggregations (GET /analytics/overview, etc.)
 * Product analytics → Direct PostgreSQL queries / cached proxy
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createApiClient } from './client';

const BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_ANALYTICS_API_URL || 'http://localhost:8000';

const api = createApiClient(BASE_URL);

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

// ── Order analytics (Elasticsearch aggregations on "orders_daily" / "analytics") ──

/**
 * GET /analytics/overview
 * → { total_orders, confirmed_orders, failed_orders, total_revenue, avg_order_value, last_sync_time, sync_status }
 */
export async function getAnalyticsOverview() {
  const { data } = await api.get('/analytics/overview');
  return data;
}

/**
 * GET /analytics/revenue-trend?days={days}
 * → [{ date, revenue, order_count }]
 */
export async function getRevenueTrend(days = 30) {
  const { data } = await api.get('/analytics/revenue-trend', { params: { days } });
  return data;
}

/**
 * GET /analytics/orders-by-weekday
 * → [{ weekday, day_of_week, order_count, total_revenue }]
 */
export async function getOrdersByWeekday() {
  const { data } = await api.get('/analytics/orders-by-weekday');
  return data;
}

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

/**
 * GET /health
 * Pings the API Gateway and measures round-trip response latency.
 * → { status: 'healthy', service: 'gateway', latency: number }
 */
export async function getGatewayHealth() {
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const { data } = await api.get('/health');
  const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const latency = Math.max(1, Math.round(t1 - t0));
  return { ...data, latency };
}
