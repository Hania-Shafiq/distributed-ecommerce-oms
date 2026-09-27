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

import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute({ children, requiredRole = 'admin' }) {
  const { user, role, isAdmin, isAuthenticated } = useAuth();

  // Determine current active role from dedicated role state or user object
  const currentRole = role || user?.role;

  // ---------------------------------------------------------------------------
  // Role Check Logic:
  // ---------------------------------------------------------------------------
  // 1. User must be authenticated (logged in).
  // 2. User's role must match the required role for this route.
  //    For 'admin' routes, checks both the isAdmin helper and role === 'admin'.
  // ---------------------------------------------------------------------------
  const hasAccess = isAuthenticated && (
    requiredRole === 'admin'
      ? (isAdmin || currentRole === 'admin')
      : currentRole === requiredRole
  );

  // If unauthorized (unauthenticated or non-admin customer), redirect to home page
  if (!hasAccess) {
    return <Navigate to="/" replace />;
  }

  // If authorized, render children or nested routes
  return children ? children : <Outlet />;
}
