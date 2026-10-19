/**
 * components/ProtectedRoute.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Role-Based Access Control (RBAC) Route Guard.
 *
 * Checks if the current user has the required permission/role (default: 'admin').
 * - If role matches (e.g. 'admin'), renders the protected children or <Outlet />.
 * - If user is unauthenticated or has an insufficient role (e.g. 'customer'),
 *   redirects them to the home page ('/').
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute({ children, requiredRole = null }) {
  const { user, role, isAdmin, isAuthenticated } = useAuth();
  const location = useLocation();

  // Determine current active role from dedicated role state or user object
  const currentRole = role || user?.role;

  // 1. If not authenticated, redirect to /login
  if (!isAuthenticated && !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 2. If a specific role is required (e.g. 'admin')
  if (requiredRole === 'admin' && !(isAdmin || currentRole === 'admin')) {
    return <Navigate to="/" replace />;
  }

  if (requiredRole && requiredRole !== 'admin' && currentRole !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  // If authorized, render children or nested routes
  return children ? children : <Outlet />;
}
