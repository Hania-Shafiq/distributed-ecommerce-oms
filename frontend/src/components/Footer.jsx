/**
 * components/Footer.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Refined footer matching the deep charcoal/emerald top-bar identity with hexagon motif.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Link } from 'react-router-dom';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#0A1612] text-[#9CA3AF] mt-auto border-t border-emerald-950/80">
      <div className="page-container py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand & Mission */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white bg-gradient-to-br from-[#10B981] to-[#0A543A] border border-[#34D399]/40 shadow-xs">
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 text-emerald-100"
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
            <span className="text-sm font-bold text-white tracking-tight font-mono uppercase">
              OMS<span className="text-[#34D399] font-medium">//STORE</span>
            </span>
            <span className="text-white/20 hidden sm:inline">|</span>
            <p className="text-xs text-emerald-100/60 font-normal">
              Distributed enterprise order management & live inventory sync
            </p>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-6 text-xs font-mono tracking-wide">
            <Link to="/products" className="text-[#9CA3AF] hover:text-white transition-colors duration-150">
              Catalog
            </Link>
            <Link to="/orders" className="text-[#9CA3AF] hover:text-white transition-colors duration-150">
              Orders
            </Link>
            <Link to="/cart" className="text-[#9CA3AF] hover:text-white transition-colors duration-150">
              Cart
            </Link>
            <span className="text-white/20 hidden sm:inline">·</span>
            <span className="text-emerald-100/40 font-normal">© {currentYear} OMSStore</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
