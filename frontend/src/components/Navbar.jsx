/**
 * components/Navbar.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Top navigation bar present on every page via App.jsx layout.
 * Shows: logo, nav links, cart badge (from CartContext), auth state.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../context/CartContext';

export default function Navbar() {
  // Access auth state, user profile, and RBAC role helper flags from AuthContext
  const { user, role, isAdmin, logout, isAuthenticated } = useAuth();
  const { cartCount } = useCart();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <nav className="bg-shadow-grey text-white px-6 py-4 flex items-center justify-between shadow-lg sticky top-0 z-50">
      {/* ── Brand / Logo ── */}
      <Link
        to="/"
        className="text-xl font-bold tracking-tight text-ash-grey hover:text-white transition-colors"
      >
        🛒 <span className="text-sea-green">OMS</span>Store
      </Link>

      {/* ── Nav Links ── */}
      <div className="hidden md:flex items-center gap-6 text-sm font-medium">
        <Link to="/products" className="text-ash-grey hover:text-white transition-colors">
          Products
        </Link>
        <Link to="/orders" className="text-ash-grey hover:text-white transition-colors">
          Orders
        </Link>
        
        {/* 
          Role-Based Access Control (RBAC):
          Only render the "Admin" link if the user is authenticated AND their role is "admin".
          Regular "customer" role accounts and unauthenticated visitors will not see this link.
        */}
        {isAuthenticated && (isAdmin || role === 'admin' || user?.role === 'admin') && (
          <Link to="/admin" className="text-sea-green hover:text-white transition-colors">
            Admin
          </Link>
        )}
      </div>

      {/* ── Right-side actions ── */}
      <div className="flex items-center gap-4">
        {/* Cart icon with badge */}
        <Link
          to="/cart"
          className="relative text-ash-grey hover:text-white transition-colors"
          title="Cart"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-sea-green text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
              {cartCount}
            </span>
          )}
        </Link>

        {/* Auth */}
        {isAuthenticated ? (
          <div className="flex items-center gap-3">
            <span className="text-ash-grey text-sm hidden md:block">
              Hi, <span className="text-white font-semibold">{user?.username}</span>
            </span>
            <button
              onClick={handleLogout}
              className="text-sm border border-ash-grey text-ash-grey px-3 py-1.5 rounded-lg hover:bg-ash-grey hover:text-shadow-grey transition-all"
            >
              Logout
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Link
              to="/login"
              className="text-sm text-ash-grey hover:text-white transition-colors"
            >
              Login
            </Link>
            <Link
              to="/signup"
              className="text-sm bg-sea-green text-white px-3 py-1.5 rounded-lg hover:bg-granite transition-colors"
            >
              Sign Up
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
