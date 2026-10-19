/**
 * api/client.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised Axios HTTP client with Authentication & Error Interceptors.
 *
 * Interceptors:
 *   - Request: Automatically attaches Bearer token from localStorage ('oms_token')
 *   - Response 401: Clears session ('oms_user', 'oms_token', 'oms_role') and redirects to /login
 *   - Response 403: Logs and surfaces friendly permission error message
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';

export function attachInterceptors(instance) {
  // Request Interceptor: Attach JWT Bearer token if available
  instance.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('oms_token');
      if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Response Interceptor: Handle 401 Unauthorized & 403 Forbidden
  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response) {
        const { status } = error.response;

        if (status === 401) {
          // Clear session on 401 Unauthorized
          localStorage.removeItem('oms_token');
          localStorage.removeItem('oms_user');
          localStorage.removeItem('oms_role');

          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        } else if (status === 403) {
          // Surface friendly message on 403 Forbidden
          const detail = error.response.data?.detail || 'You do not have permission to perform this action.';
          console.warn(`[Auth 403 Forbidden] ${detail}`);
          if (error.response.data && typeof error.response.data === 'object') {
            error.response.data.message = detail;
          }
        }
      }
      return Promise.reject(error);
    }
  );

  return instance;
}

export function createApiClient(baseURL) {
  const instance = axios.create({ baseURL });
  return attachInterceptors(instance);
}

const DEFAULT_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const client = createApiClient(DEFAULT_BASE_URL);

export default client;
export { client as api };
