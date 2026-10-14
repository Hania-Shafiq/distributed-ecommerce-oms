/**
 * components/Footer.jsx
 * Quiet, refined footer — matches mature brand language.
 */

import { Link } from 'react-router-dom';
import { Box } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="surface-plum text-ash-grey mt-auto border-t border-white/8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-white"
              style={{
                background: 'linear-gradient(165deg, #4a9270 0%, #3D8361 55%, #2A5F52 100%)',
              }}
            >
              <Box className="w-3.5 h-3.5" strokeWidth={1.5} />
            </div>
            <span className="text-sm font-semibold text-white tracking-tight font-mono uppercase">
              OMS<span className="text-dry-sage font-medium">//STORE</span>
            </span>
            <span className="text-xs text-ash-grey/35 hidden sm:inline">|</span>
            <p className="text-xs text-ash-grey/60 font-normal">
              Verified catalog & order fulfillment
            </p>
          </div>

          <div className="flex items-center gap-6 text-xs font-medium">
            <Link to="/products" className="hover:text-white ui-transition">
              Catalog
            </Link>
            <Link to="/orders" className="hover:text-white ui-transition">
              Orders
            </Link>
            <Link to="/cart" className="hover:text-white ui-transition">
              Cart
            </Link>
            <span className="text-ash-grey/25 hidden sm:inline">·</span>
            <span className="text-ash-grey/50 font-normal">© {currentYear} OMSStore</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
