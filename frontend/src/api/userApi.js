/**
 * api/userApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All HTTP calls to the User Service (auth) are centralised here.
 * Base URL: VITE_USER_API_URL (http://localhost:8000 by default)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_USER_API_URL || 'http://localhost:8000';

const api = axios.create({ baseURL: BASE_URL });

/**
 * Register a new user.
 * POST /signup
 * @param {{ username: string, email: string, password: string }} credentials
 * @returns {Promise<{ id, username, email }>}
 */
export async function signup(credentials) {
  const { data } = await api.post('/signup', credentials);
  return data;
}

/**
 * Log in an existing user.
 * POST /login
 * @param {{ username: string, password: string }} credentials
 * @returns {Promise<{ access_token: string, token_type: string }>}
 *
 * NOTE: The exact response shape depends on the User Service implementation.
 * If it returns a JWT, AuthContext will store it in localStorage.
 */
export async function login(credentials) {
  const { data } = await api.post('/login', credentials);
  return data;
}
