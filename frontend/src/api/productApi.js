/**
 * api/productApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All HTTP calls to the Product Service are centralised here.
 *
 * WHY ISOLATE API CALLS?
 * Components should never call fetch/axios directly because:
 *   1. If the base URL changes (e.g. moving behind an API Gateway, or Docker),
 *      you change ONE line here, not every component that uses products.
 *   2. Error handling, auth headers, and response shaping live in one place.
 *   3. Components stay clean — they just call getProducts() and get data back.
 *
 * The base URL is read from the VITE_PRODUCT_API_URL environment variable
 * (defined in .env), so it's reconfigurable without touching any code.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createApiClient } from './client';

// Base URL from .env — VITE_ prefix is required for Vite to expose it to the browser.
const BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_PRODUCT_API_URL || 'http://localhost:8000';

// Centralized client with auth interceptors
const api = createApiClient(BASE_URL);

/**
 * Fetch products (with optional pagination and category filtering).
 * GET /products?skip=0&limit=100&category={category}
 *
 * Supports positional args: getProducts(skip, limit, category)
 * or options object:        getProducts({ category, skip, limit })
 */
export async function getProducts(skip = 0, limit = 100, category = null, options = {}) {
  let s = skip;
  let l = limit;
  let c = category;
  let extra = options;

  if (typeof skip === 'object' && skip !== null) {
    s = skip.skip ?? 0;
    l = skip.limit ?? 100;
    c = skip.category ?? null;
    extra = skip;
  }

  const params = { skip: s, limit: l };
  if (c && c !== 'All') {
    params.category = c;
  }
  if (extra.min_price != null && extra.min_price !== '') {
    params.min_price = Number(extra.min_price);
  }
  if (extra.max_price != null && extra.max_price !== '') {
    params.max_price = Number(extra.max_price);
  }
  if (extra.in_stock != null && extra.in_stock !== false) {
    params.in_stock = extra.in_stock;
  }
  if (extra.sort) {
    params.sort = extra.sort;
  }

  const { data } = await api.get('/products', { params });
  return data; // array of product objects
}

/**
 * Fetch a single product by its ID.
 * GET /products/{id}
 */
export async function getProductById(id) {
  const { data } = await api.get(`/products/${id}`);
  return data;
}

/**
 * Full-text search via Elasticsearch (typo-tolerant).
 * GET /products/search?q={query}
 */
export async function searchProducts(query, options = {}) {
  const params = { q: query };
  if (options.category && options.category !== 'All') {
    params.category = options.category;
  }
  if (options.min_price != null && options.min_price !== '') {
    params.min_price = Number(options.min_price);
  }
  if (options.max_price != null && options.max_price !== '') {
    params.max_price = Number(options.max_price);
  }
  if (options.in_stock != null && options.in_stock !== false) {
    params.in_stock = options.in_stock;
  }
  if (options.sort) {
    params.sort = options.sort;
  }

  const { data } = await api.get('/products/search', { params });
  // Backend returns { query, results: [...], count }
  return data.results;
}

/**
 * Autocomplete / typeahead product name suggestions via Elasticsearch.
 * GET /products/autocomplete?q={query}
 */
export async function getProductSuggestions(query) {
  if (!query || !query.trim()) return [];
  const { data } = await api.get('/products/autocomplete', { params: { q: query.trim() } });
  return data.suggestions || [];
}

/**
 * Create a new product.
 * POST /products
 * @param {Object} productData - { name, category, price, description, stock_quantity, image_url? }
 */
export async function createProduct(productData) {
  const { data } = await api.post('/products', productData);
  return data;
}

/**
 * Update an existing product (partial updates supported).
 * PUT /products/{id}
 */
export async function updateProduct(id, productData) {
  const { data } = await api.put(`/products/${id}`, productData);
  return data;
}

/**
 * Delete a product by ID.
 * DELETE /products/{id}
 */
export async function deleteProduct(id) {
  await api.delete(`/products/${id}`);
}
