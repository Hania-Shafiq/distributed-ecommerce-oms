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

import axios from 'axios';

// Base URL from .env — VITE_ prefix is required for Vite to expose it to the browser.
const BASE_URL = import.meta.env.VITE_PRODUCT_API_URL || 'http://localhost:8006';

// Axios instance scoped to this service — all calls inherit this base URL.
// If we later add auth tokens, we add them once to this instance's interceptors.
const api = axios.create({ baseURL: BASE_URL });

/**
 * Fetch products (with optional pagination and category filtering).
 * GET /products?skip=0&limit=100&category={category}
 *
 * Supports positional args: getProducts(skip, limit, category)
 * or options object:        getProducts({ category, skip, limit })
 */
export async function getProducts(skip = 0, limit = 100, category = null) {
  let s = skip;
  let l = limit;
  let c = category;

  if (typeof skip === 'object' && skip !== null) {
    s = skip.skip ?? 0;
    l = skip.limit ?? 100;
    c = skip.category ?? null;
  }

  const params = { skip: s, limit: l };
  if (c && c !== 'All') {
    params.category = c;
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
export async function searchProducts(query) {
  const { data } = await api.get('/products/search', { params: { q: query } });
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
 * @param {Object} productData - { name, category, price, description, stock_quantity }
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
