/**
 * api/recommendationApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP client for the Recommendation Service (FastAPI running on port 8005).
 * Powered by Neo4j graph database for collaborative filtering.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createApiClient } from './client';

const BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_RECOMMENDATION_API_URL || 'http://localhost:8000';

const api = createApiClient(BASE_URL);

/**
 * Get "Customers who bought this also bought" recommendations for a product.
 * GET /recommendations/product/{productId}?limit={limit}
 * @param {number|string} productId
 * @param {number} limit
 * @returns {Promise<Array<{ product_id: number, name: string, category: string, co_occurrences: number }>>}
 */
export async function getProductRecommendations(productId, limit = 4) {
  try {
    const { data } = await api.get(`/recommendations/product/${productId}`, {
      params: { limit },
    });
    return data.recommendations || [];
  } catch (error) {
    console.warn('Failed to fetch product recommendations:', error.message);
    return [];
  }
}

/**
 * Get personalized collaborative recommendations for a user.
 * GET /recommendations/user/{userId}?limit={limit}
 * @param {number|string} userId
 * @param {number} limit
 * @returns {Promise<Array<{ product_id: number, name: string, category: string, score: number }>>}
 */
export async function getUserRecommendations(userId, limit = 4) {
  try {
    const { data } = await api.get(`/recommendations/user/${userId}`, {
      params: { limit },
    });
    return data.recommendations || [];
  } catch (error) {
    console.warn('Failed to fetch user recommendations:', error.message);
    return [];
  }
}

/**
 * Get co-purchase network topology (Admin only).
 * GET /graph/network?limit_edges={limitEdges}
 * @param {number} limitEdges
 * @returns {Promise<{ nodes: Array<{id: number, name: string, category: string, degree: number}>, edges: Array<{source: number, target: number, weight: number}> }>}
 */
export async function getGraphNetwork(limitEdges = 150) {
  const { data } = await api.get('/graph/network', {
    params: { limit_edges: limitEdges },
  });
  return data;
}

