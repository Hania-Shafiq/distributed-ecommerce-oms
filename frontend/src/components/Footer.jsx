/**
 * components/Footer.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Polished site footer with brand overview, trust badges, and navigation links.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Link } from 'react-router-dom';
import { ShoppingBag, ShieldCheck, Zap, RefreshCw } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-shadow-grey text-ash-grey mt-auto border-t border-white/10">
      {/* ── Trust highlights strip ── */}
      <div className="border-b border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-sea-green/20 text-sea-green flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-white uppercase tracking-wider">Fast & Resilient</p>
                <p className="text-xs text-ash-grey/70">Sub-second searches & automated order workflows</p>
              </div>
            </div>
            <div className="flex items-center justify-center sm:justify-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-sea-green/20 text-sea-green flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-white uppercase tracking-wider">Secure Checkout</p>
                <p className="text-xs text-ash-grey/70">Authenticated sessions with verified token access</p>
              </div>
            </div>
            <div className="flex items-center justify-center sm:justify-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-sea-green/20 text-sea-green flex items-center justify-center flex-shrink-0">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-white uppercase tracking-wider">Live Inventory</p>
                <p className="text-xs text-ash-grey/70">Real-time stock synchronization across services</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main footer content ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sea-green flex items-center justify-center text-white">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <span className="text-base font-bold text-white tracking-tight">
              OMS<span className="text-dry-sage">Store</span>
            </span>
            <span className="text-xs text-ash-grey/60 hidden sm:inline">|</span>
            <p className="text-xs text-ash-grey/70">
              Modern distributed commerce platform
            </p>
          </div>

          <div className="flex items-center gap-6 text-xs font-medium">
            <Link to="/products" className="hover:text-white transition-colors">Products</Link>
            <Link to="/orders" className="hover:text-white transition-colors">My Orders</Link>
            <Link to="/cart" className="hover:text-white transition-colors">Cart</Link>
            <span className="text-ash-grey/40">•</span>
            <span className="text-ash-grey/60">© {currentYear} OMSStore Inc.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
