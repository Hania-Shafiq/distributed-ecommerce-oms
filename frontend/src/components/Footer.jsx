/**
 * components/Footer.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Editorial footer matching the charcoal top-bar identity with hexagon motif.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Link } from 'react-router-dom';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#18131A] text-[#BEC5AD] mt-auto border-t border-white/[0.08]">
      <div className="page-container py-9">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand & Mission */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md flex items-center justify-center text-white bg-gradient-to-br from-[#3D8361] to-[#204936] border border-[#4a9270]/30 shadow-sm">
              <svg
                viewBox="0 0 24 24"
                className="w-3.5 h-3.5 text-emerald-200"
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
            <span className="text-sm font-semibold text-white tracking-tight font-mono uppercase">
              OMS<span className="text-[#A4B494] font-medium">//STORE</span>
            </span>
            <span className="text-xs text-white/20 hidden sm:inline">|</span>
            <p className="text-xs text-[#BEC5AD]/60 font-normal">
              Distributed enterprise order management & live inventory sync
            </p>
          </div>

          {/* Editorial Navigation Links */}
          <div className="flex items-center gap-6 text-xs font-mono tracking-wide">
            <Link to="/products" className="text-[#BEC5AD] hover:text-white transition-colors duration-150">
              Catalog
            </Link>
            <Link to="/orders" className="text-[#BEC5AD] hover:text-white transition-colors duration-150">
              Orders
            </Link>
            <Link to="/cart" className="text-[#BEC5AD] hover:text-white transition-colors duration-150">
              Cart
            </Link>
            <span className="text-white/20 hidden sm:inline">·</span>
            <span className="text-[#BEC5AD]/40 font-normal">© {currentYear} OMSStore</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
