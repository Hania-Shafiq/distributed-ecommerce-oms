/**
 * components/Navbar.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Editorial navigation bar with dark charcoal identity, hexagon brandmark,
 * smooth active-tab indicators, refined cart counter, and RBAC admin badges.
 * Functionality and routing remain 100% identical.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingCart, LogOut, Menu, X, ShieldCheck, Share2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../context/CartContext';

export default function Navbar() {
  const { user, role, isAdmin, logout, isAuthenticated } = useAuth();
  const { cartCount } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
    `relative px-3.5 py-2 rounded-md text-xs font-mono uppercase tracking-wider transition-all duration-150 font-medium select-none ${
      isCurrent(path)
        ? 'text-white bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] after:absolute after:bottom-0 after:left-3 after:right-3 after:h-[2px] after:bg-[#3D8361] after:rounded-full'
        : 'text-[#BEC5AD] hover:text-white hover:bg-white/[0.04]'
    }`;

  const hasAdminRole = isAuthenticated && (isAdmin || role === 'admin' || user?.role === 'admin');

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-200 bg-[#231C28] ${
        scrolled
          ? 'shadow-[0_4px_24px_rgba(0,0,0,0.4)] border-b border-white/[0.08]'
          : 'border-b border-white/[0.06]'
      }`}
    >
      <div className="page-container">
        <div className="flex items-center justify-between h-15">
          {/* Brand Wordmark with Hexagon Motif */}
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3D8361] rounded"
          >
            {/* Hexagon Brandmark Icon */}
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white bg-gradient-to-br from-[#3D8361] to-[#204936] border border-[#4a9270]/40 shadow-[0_2px_8px_rgba(0,0,0,0.3)] transition-transform duration-150 group-hover:scale-[1.03]">
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 text-emerald-200"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z" />
                <path d="M12 12l8.66-5" opacity="0.6" />
                <path d="M12 12v10" opacity="0.6" />
                <path d="M12 12L3.34 7" opacity="0.6" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold tracking-tight text-white uppercase font-mono">
                OMS<span className="text-[#A4B494] font-medium">//STORE</span>
              </span>
              <span className="text-[10px] font-mono text-[#BEC5AD]/50 uppercase tracking-widest hidden sm:inline font-normal px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">
                [LIVE]
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5">
            <Link to="/products" className={navLinkClass('/products')}>
              Catalog
            </Link>
            <Link to="/orders" className={navLinkClass('/orders')}>
              Orders
            </Link>

            {hasAdminRole && (
              <div className="flex items-center gap-1 pl-2 border-l border-white/[0.08]">
                <Link
                  to="/admin"
                  className={`px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all duration-150 font-medium ${
                    isCurrent('/admin') && !isCurrent('/admin/graph')
                      ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/30'
                      : 'text-[#A4B494] hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />
                  Dashboard
                </Link>
                <Link
                  to="/admin/graph"
                  className={`px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all duration-150 font-medium ${
                    isCurrent('/admin/graph')
                      ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/30'
                      : 'text-[#A4B494] hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <Share2 className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />
                  Graph
                </Link>
              </div>
            )}
          </nav>

          {/* Actions: Cart, User State, Mobile Toggle */}
          <div className="flex items-center gap-3">
            {/* Cart Link with Refined Counter */}
            <Link
              to="/cart"
              onClick={() => setMobileMenuOpen(false)}
              className="relative p-2 rounded-lg text-[#BEC5AD] hover:text-white hover:bg-white/[0.06] transition-colors duration-150 flex items-center gap-2 group"
              aria-label="View Cart"
            >
              <ShoppingCart className="w-4 h-4 transition-transform duration-150 group-hover:scale-105" strokeWidth={1.75} />
              {cartCount > 0 ? (
                <span className="text-[10px] font-mono font-bold tracking-tight text-white bg-[#3D8361] border border-[#2D6349] h-5 min-w-5 px-1.5 flex items-center justify-center rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.3)] animate-fade-in">
                  {cartCount}
                </span>
              ) : (
                <span className="font-mono text-[11px] text-[#BEC5AD]/40 hidden sm:inline font-normal">
                  [0]
                </span>
              )}
            </Link>

            {/* User Chip & Auth Controls */}
            <div className="hidden sm:flex items-center gap-2.5">
              {isAuthenticated ? (
                <div className="flex items-center gap-3 pl-3 border-l border-white/[0.1]">
                  <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.07] text-xs text-[#BEC5AD] font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 stock-dot-live" />
                    <span className="text-white font-medium">{user?.username}</span>
                    {hasAdminRole && (
                      <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold tracking-wider uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 rounded">
                        ADM
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-1.5 text-[#BEC5AD]/60 hover:text-rose-300 hover:bg-rose-950/20 rounded-md transition-colors duration-150"
                    title="Log Out"
                  >
                    <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 pl-3 border-l border-white/[0.1] font-mono">
                  <Link
                    to="/login"
                    className="text-xs font-medium text-[#BEC5AD] hover:text-white px-3 py-1.5 rounded-md hover:bg-white/[0.05] transition-colors duration-150"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/signup"
                    className="text-xs font-medium px-3.5 py-1.5 rounded-md bg-[#3D8361] hover:bg-[#2D6349] text-white border border-[#2D6349] shadow-sm transition-all duration-150 active:translate-y-0.5"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-[#BEC5AD] hover:text-white hover:bg-white/[0.05] rounded-md transition-colors"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" strokeWidth={1.75} /> : <Menu className="w-5 h-5" strokeWidth={1.75} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#18131A] border-t border-white/[0.08] px-4 pt-3 pb-5 space-y-1.5 animate-slide-down">
          <Link
            to="/products"
            onClick={() => setMobileMenuOpen(false)}
            className={`block px-3 py-2 rounded-md text-xs font-mono uppercase tracking-wider font-medium transition-colors ${
              isCurrent('/products') ? 'bg-white/10 text-white' : 'text-[#BEC5AD] hover:text-white'
            }`}
          >
            Catalog
          </Link>
          <Link
            to="/orders"
            onClick={() => setMobileMenuOpen(false)}
            className={`block px-3 py-2 rounded-md text-xs font-mono uppercase tracking-wider font-medium transition-colors ${
              isCurrent('/orders') ? 'bg-white/10 text-white' : 'text-[#BEC5AD] hover:text-white'
            }`}
          >
            Orders
          </Link>

          {hasAdminRole && (
            <div className="pt-2 mt-2 border-t border-white/[0.06] space-y-1">
              <Link
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-mono uppercase tracking-wider text-emerald-300 bg-emerald-950/40 border border-emerald-500/20"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />
                Admin Dashboard
              </Link>
              <Link
                to="/admin/graph"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-mono uppercase tracking-wider text-emerald-300 bg-emerald-950/40 border border-emerald-500/20"
              >
                <Share2 className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />
                Affinity Graph
              </Link>
            </div>
          )}

          <div className="pt-3 mt-3 border-t border-white/[0.08]">
            {isAuthenticated ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-md font-mono bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs font-medium text-white">{user?.username}</span>
                  {hasAdminRole && (
                    <span className="text-[9px] font-mono font-bold uppercase text-emerald-300 bg-emerald-950 px-1 py-0.5 rounded">
                      ADM
                    </span>
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  className="text-xs text-rose-300 hover:text-rose-200 px-2.5 py-1 rounded bg-rose-950/40 border border-rose-500/20 transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center text-xs font-medium text-[#BEC5AD] hover:text-white py-2 rounded-md bg-white/[0.04] border border-white/[0.08] transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center text-xs font-medium text-white py-2 rounded-md bg-[#3D8361] hover:bg-[#2D6349] border border-[#2D6349] transition-colors"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
