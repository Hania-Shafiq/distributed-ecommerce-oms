/**
 * components/Footer.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Clean site footer with brand info, quick navigation, and copyright.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-shadow-grey text-ash-grey mt-auto border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-5">
          {/* Brand & tag */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-sea-green flex items-center justify-center text-white">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <span className="text-base font-extrabold text-white tracking-tight">
              OMS<span className="text-dry-sage">Store</span>
            </span>
            <span className="text-xs text-ash-grey/40 hidden sm:inline">|</span>
            <p className="text-xs text-ash-grey/70">
              Verified catalog & order fulfillment platform
            </p>
          </div>

          {/* Quick links & copyright */}
          <div className="flex items-center gap-6 text-xs font-medium">
            <Link to="/products" className="hover:text-white transition-colors">
              Products
            </Link>
            <Link to="/orders" className="hover:text-white transition-colors">
              My Orders
            </Link>
            <Link to="/cart" className="hover:text-white transition-colors">
              Cart
            </Link>
            <span className="text-ash-grey/30 hidden sm:inline">•</span>
            <span className="text-ash-grey/60">© {currentYear} OMSStore</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
