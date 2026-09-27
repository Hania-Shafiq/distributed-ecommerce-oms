/**
 * context/AuthContext.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages authentication state globally across the app.
 *
 * WHY CONTEXT FOR AUTH?
 * Multiple components (Navbar, Cart, PrivateRoute, AdminDashboard) need to
 * know if the user is logged in and who they are.  Passing this down as props
 * through every component tree ("prop drilling") becomes unmanageable.
 * React Context provides a single source of truth readable by any component.
 *
 * WHAT IT STORES:
 *   user   — the logged-in user object (or null)
 *   token  — JWT token stored in localStorage for persistence across refreshes
 *
 * USAGE IN COMPONENTS:
 *   import { useAuth } from '../context/AuthContext';
 *   const { user, login, logout } = useAuth();
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { login as apiLogin, signup as apiSignup } from '../api/userApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Initialise from localStorage so the user stays logged in across page refreshes.
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('oms_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => localStorage.getItem('oms_token') || null);

  // Initialize role from localStorage alongside user and token for RBAC.
  // Falls back to checking user.role if 'oms_role' key was not yet set.
  const [role, setRole] = useState(() => {
    try {
      const storedRole = localStorage.getItem('oms_role');
      if (storedRole) return storedRole;
      const storedUser = localStorage.getItem('oms_user');
      return storedUser ? JSON.parse(storedUser)?.role || null : null;
    } catch {
      return null;
    }
  });

  // Sync state changes to localStorage so they persist across browser refreshes.
  useEffect(() => {
    if (user) {
      localStorage.setItem('oms_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('oms_user');
    }
  }, [user]);

  useEffect(() => {
    if (token) {
      localStorage.setItem('oms_token', token);
    } else {
      localStorage.removeItem('oms_token');
    }
  }, [token]);

  // Sync role changes to localStorage alongside other auth state.
  useEffect(() => {
    if (role) {
      localStorage.setItem('oms_role', role);
    } else {
      localStorage.removeItem('oms_role');
    }
  }, [role]);

  /**
   * Log in: call the User Service, then store the returned user/token/role.
   * Throws on failure so Login page can display the error.
   */
  async function login(credentials) {
    const response = await apiLogin(credentials);
    
    // Support both 'token' and 'access_token' response properties
    const authToken = response.token || response.access_token || null;
    
    // Extract user profile and role from the User Service response
    const userData = response.user || { username: credentials.username, role: 'customer' };
    const userRole = userData.role || 'customer';

    setToken(authToken);
    setUser(userData);
    setRole(userRole);

    return response;
  }

  /**
   * Sign up: create account then auto-log in.
   */
  async function signup(credentials) {
    const response = await apiSignup(credentials);
    return response;
  }

  /**
   * Log out: clear all auth state and localStorage.
   */
  function logout() {
    setUser(null);
    setToken(null);
    setRole(null);
    localStorage.removeItem('oms_user');
    localStorage.removeItem('oms_token');
    localStorage.removeItem('oms_role');
  }

  // Active role resolves from dedicated role state or the user object
  const currentRole = role || user?.role || null;

  const value = {
    user,
    token,
    role: currentRole,
    isAdmin: currentRole === 'admin',
    login,
    signup,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Custom hook — components use this instead of useContext(AuthContext) directly.
 * This enforces that AuthContext is only consumed inside AuthProvider.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
