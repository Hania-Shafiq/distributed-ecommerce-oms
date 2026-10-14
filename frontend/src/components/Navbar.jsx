/**
 * components/Navbar.jsx
 * Floating nav — refined radius, purposeful accents. RBAC/auth/cart unchanged.
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingCart, LogOut, Menu, X, ShieldCheck, Box } from 'lucide-react';
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
    const onScroll = () => setScrolled(window.scrollY > 10);
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
    `px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider ui-transition font-medium ${
      isCurrent(path)
        ? 'bg-white/[0.08] text-white border border-white/10'
        : 'text-ash-grey hover:text-white hover:bg-white/[0.04]'
    }`;

  const hasAdminRole = isAuthenticated && (isAdmin || role === 'admin' || user?.role === 'admin');

  return (
    <header className={`sticky top-0 z-50 navbar-float ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2.5 group"
          >
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-white ui-transition group-hover:opacity-90"
              style={{
                background: 'linear-gradient(165deg, #4a9270 0%, #3D8361 55%, #2A5F52 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 6px rgba(0,0,0,0.25)',
              }}
            >
              <Box className="w-3.5 h-3.5" strokeWidth={1.5} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold tracking-tight text-white uppercase font-mono">
                OMS<span className="text-dry-sage font-medium">//STORE</span>
              </span>
              <span className="text-[10px] font-mono text-ash-grey/45 uppercase tracking-widest hidden sm:inline font-normal">
                [LIVE]
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <Link to="/products" className={navLinkClass('/products')}>
              Catalog
            </Link>
            <Link to="/orders" className={navLinkClass('/orders')}>
              Manifests
            </Link>

            {hasAdminRole && (
              <Link
                to="/admin"
                className={`px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 ui-transition font-medium ${
                  isCurrent('/admin')
                    ? 'bg-teal-deep/80 text-white border border-white/10'
                    : 'badge-role hover:bg-white/[0.06]'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.5} />
                Admin
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2.5">
            <Link
              to="/cart"
              onClick={() => setMobileMenuOpen(false)}
              className="relative p-2 rounded-md text-ash-grey hover:text-white hover:bg-white/[0.04] ui-transition flex items-center gap-1.5"
              aria-label="View Cart"
            >
              <ShoppingCart className="w-4 h-4" strokeWidth={1.5} />
              {cartCount > 0 ? (
                <span className="badge-status badge-status-ok text-[10px] font-mono h-5 min-w-5 px-1.5 flex items-center justify-center rounded-md">
                  {cartCount}
                </span>
              ) : (
                <span className="font-mono text-[11px] text-ash-grey/50 hidden sm:inline font-normal">
                  [0]
                </span>
              )}
            </Link>

            <div className="hidden sm:flex items-center gap-2">
              {isAuthenticated ? (
                <div className="flex items-center gap-3 pl-3 border-l border-white/10">
                  <div className="flex items-center gap-2 text-xs text-ash-grey font-mono font-normal">
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-teal-deep"
                      style={{ boxShadow: '0 0 6px rgba(42,95,82,0.6)' }}
                    />
                    <span className="text-white font-medium">{user?.username}</span>
                    {hasAdminRole && (
                      <span className="badge-role">ADM</span>
                    )}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-1.5 text-ash-grey/60 hover:text-rose-300 hover:bg-white/[0.04] rounded-md ui-transition"
                    title="Log Out"
                  >
                    <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 pl-3 border-l border-white/10 font-mono">
                  <Link
                    to="/login"
                    className="text-xs font-medium text-ash-grey hover:text-white px-3 py-1.5 rounded-md hover:bg-white/[0.04] ui-transition"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/signup"
                    className="btn-3d-nav text-xs font-medium px-3.5 py-1.5 rounded-md"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-ash-grey hover:text-white hover:bg-white/[0.04] rounded-md ui-transition"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" strokeWidth={1.5} /> : <Menu className="w-5 h-5" strokeWidth={1.5} />}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden glass-card-dark border-t border-white/10 px-4 pt-3 pb-5 space-y-1 animate-slide-down !rounded-none">
          <Link
            to="/products"
            onClick={() => setMobileMenuOpen(false)}
            className={`block px-3 py-2 rounded-md text-xs font-mono uppercase tracking-wider font-medium ui-transition ${
              isCurrent('/products') ? 'bg-white/10 text-white' : 'text-ash-grey hover:text-white'
            }`}
          >
            Catalog
          </Link>
          <Link
            to="/orders"
            onClick={() => setMobileMenuOpen(false)}
            className={`block px-3 py-2 rounded-md text-xs font-mono uppercase tracking-wider font-medium ui-transition ${
              isCurrent('/orders') ? 'bg-white/10 text-white' : 'text-ash-grey hover:text-white'
            }`}
          >
            Manifests
          </Link>

          {hasAdminRole && (
            <Link
              to="/admin"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-mono uppercase tracking-wider badge-role ui-transition"
            >
              <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.5} />
              Admin Dashboard
            </Link>
          )}

          <div className="pt-3 mt-2 border-t border-white/10">
            {isAuthenticated ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-md font-mono border border-white/5 bg-white/[0.03]">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-deep" />
                  <span className="text-xs font-medium text-white">{user?.username}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-xs text-rose-300/90 hover:text-rose-200 px-2 py-1 rounded-md bg-rose-950/30 border border-rose-500/15 ui-transition font-medium"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center text-xs font-medium text-ash-grey hover:text-white py-2 rounded-md bg-white/[0.04] border border-white/8 ui-transition"
                >
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="btn-3d-nav text-center text-xs font-medium py-2 rounded-md"
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
