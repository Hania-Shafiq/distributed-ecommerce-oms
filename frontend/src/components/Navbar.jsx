/**
 * components/Navbar.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Top navigation bar present on every page via App.jsx layout.
 * Shows: logo, nav links, cart badge (from CartContext), auth state.
 *
 * RBAC:
 *   Admin link is strictly rendered only when user is authenticated AND
 *   holds the 'admin' role. All role checks are preserved unchanged.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingCart, LogOut, User as UserIcon, Menu, X, ShieldCheck, ShoppingBag } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../context/CartContext';

export default function Navbar() {
  const { user, role, isAdmin, logout, isAuthenticated } = useAuth();
  const { cartCount } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    setMobileMenuOpen(false);
    navigate('/login');
  }

  const isCurrent = (path) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  const navLinkClass = (path) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
      isCurrent(path)
        ? 'bg-white/10 text-white font-semibold shadow-2xs'
        : 'text-ash-grey hover:text-white hover:bg-white/5'
    }`;

  const hasAdminRole = isAuthenticated && (isAdmin || role === 'admin' || user?.role === 'admin');

  return (
    <header className="sticky top-0 z-50 bg-shadow-grey/95 backdrop-blur-md border-b border-white/10 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* ── Brand / Logo ── */}
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-9 h-9 rounded-xl bg-sea-green flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform duration-200">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-extrabold tracking-tight text-white leading-none">
                OMS<span className="text-dry-sage">Store</span>
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-ash-grey/70 leading-tight">
                Distributed Catalog
              </span>
            </div>
          </Link>

          {/* ── Desktop Navigation Links ── */}
          <nav className="hidden md:flex items-center gap-1.5">
            <Link to="/products" className={navLinkClass('/products')}>
              Products
            </Link>
            <Link to="/orders" className={navLinkClass('/orders')}>
              My Orders
            </Link>

            {/* 
              Role-Based Access Control (RBAC):
              Only render the "Admin" link if the user is authenticated AND their role is "admin".
            */}
            {hasAdminRole && (
              <Link
                to="/admin"
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all duration-150 ${
                  isCurrent('/admin')
                    ? 'bg-sea-green text-white shadow-sm'
                    : 'text-dry-sage hover:text-white hover:bg-white/5'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                Admin
              </Link>
            )}
          </nav>

          {/* ── Right-side actions: Cart & Auth ── */}
          <div className="flex items-center gap-3">
            {/* Cart icon with animated badge */}
            <Link
              to="/cart"
              onClick={() => setMobileMenuOpen(false)}
              className="relative p-2 rounded-xl text-ash-grey hover:text-white hover:bg-white/5 transition-all"
              aria-label="View Cart"
            >
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-sea-green text-white text-[11px] font-bold rounded-full h-5 min-w-5 px-1.5 flex items-center justify-center shadow-md animate-fade-in">
                  {cartCount}
                </span>
              )}
            </Link>

            {/* Desktop Auth Section */}
            <div className="hidden sm:flex items-center gap-2">
              {isAuthenticated ? (
                <div className="flex items-center gap-3 pl-2 border-l border-white/10">
                  <div className="flex items-center gap-2 text-sm text-ash-grey">
                    <div className="w-8 h-8 rounded-full bg-granite border border-white/10 flex items-center justify-center text-white font-bold text-xs uppercase">
                      {user?.username ? user.username.charAt(0) : <UserIcon className="w-4 h-4" />}
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-semibold text-white leading-tight">
                        {user?.username}
                      </span>
                      {hasAdminRole && (
                        <span className="text-[10px] text-dry-sage font-medium uppercase tracking-wider">
                          Admin
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-1.5 text-ash-grey hover:text-rose-400 hover:bg-white/5 rounded-lg transition-colors"
                    title="Log Out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 pl-2 border-l border-white/10">
                  <Link
                    to="/login"
                    className="text-xs font-semibold text-ash-grey hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/signup"
                    className="text-xs font-semibold bg-sea-green text-white px-3.5 py-1.5 rounded-lg hover:bg-sea-green/90 shadow-sm transition-all active:scale-95"
                  >
                    Sign Up
                  </Link>
                </div>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-ash-grey hover:text-white hover:bg-white/5 rounded-xl transition-colors"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile Menu Dropdown ── */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-shadow-grey/98 border-t border-white/10 px-4 pt-3 pb-5 space-y-2 animate-slide-down">
          <Link
            to="/products"
            onClick={() => setMobileMenuOpen(false)}
            className={`block px-3 py-2 rounded-lg text-sm font-medium ${
              isCurrent('/products') ? 'bg-white/10 text-white font-semibold' : 'text-ash-grey hover:text-white'
            }`}
          >
            Products
          </Link>
          <Link
            to="/orders"
            onClick={() => setMobileMenuOpen(false)}
            className={`block px-3 py-2 rounded-lg text-sm font-medium ${
              isCurrent('/orders') ? 'bg-white/10 text-white font-semibold' : 'text-ash-grey hover:text-white'
            }`}
          >
            My Orders
          </Link>

          {hasAdminRole && (
            <Link
              to="/admin"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-dry-sage hover:text-white hover:bg-white/5"
            >
              <ShieldCheck className="w-4 h-4" />
              Admin Dashboard
            </Link>
          )}

          {/* Mobile Auth actions */}
          <div className="pt-3 mt-2 border-t border-white/10">
            {isAuthenticated ? (
              <div className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-granite text-white font-bold text-xs flex items-center justify-center uppercase">
                    {user?.username?.charAt(0) || 'U'}
                  </div>
                  <span className="text-sm font-semibold text-white">{user?.username}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-xs text-rose-300 hover:text-rose-200 font-medium px-2 py-1 rounded bg-rose-950/40"
                >
                  Log out
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center text-xs font-semibold text-ash-grey hover:text-white py-2 rounded-lg bg-white/5"
                >
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center text-xs font-semibold bg-sea-green text-white py-2 rounded-lg"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
