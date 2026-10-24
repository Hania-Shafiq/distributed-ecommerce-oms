/**
 * components/StockModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Focused modal for administrators to calibrate/update available stock.
 * Calls PUT /products/{id} with new stock_quantity, which calibrates
 * inventory-service (inventory_db) atomically via row-locking.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { X, Layers, CheckCircle2, AlertCircle } from 'lucide-react';
import Button from './Button';
import { updateProduct } from '../api/productApi';
import { formatError } from '../utils/formatError';

export default function StockModal({ isOpen, onClose, product, onUpdated }) {
  const [stockQuantity, setStockQuantity] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (product) {
      setStockQuantity(product.stock_quantity != null ? String(product.stock_quantity) : '0');
    }
    setError(null);
  }, [product, isOpen]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !product) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const qty = parseInt(stockQuantity, 10);
    if (isNaN(qty) || qty < 0) {
      setError('Please provide a valid stock quantity (0 or greater).');
      return;
    }

    setLoading(true);
    try {
      const updated = await updateProduct(product.id, {
        stock_quantity: qty,
      });
      if (onUpdated) {
        onUpdated(updated);
      }
      onClose();
    } catch (err) {
      setError(formatError(err, 'Failed to update stock in inventory_db.'));
    } finally {
      setLoading(false);
    }
  }

  const currentStock = Number(product.stock_quantity || 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stock-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-emerald-950/15 shadow-2xl max-w-md w-full overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100 bg-[#F4F7F5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100/80 border border-emerald-200 text-[#107C55] flex items-center justify-center shrink-0 shadow-2xs">
              <Layers className="w-5 h-5 text-[#107C55]" strokeWidth={2.2} />
            </div>
            <div>
              <h3 id="stock-modal-title" className="text-base font-bold text-slate-900 tracking-tight">
                Update Inventory Stock
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                SKU #PROD-{product.id} • {product.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          {/* Current Stock Banner */}
          <div className="p-3.5 rounded-xl bg-[#F4F7F5] border border-slate-200/90 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-500 font-medium">Current Stock in inventory_db:</span>
            <span
              className={`px-2.5 py-1 rounded-full font-bold ${
                currentStock > 5
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : currentStock > 0
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-rose-100 text-rose-800 border border-rose-300'
              }`}
            >
              {currentStock} units
            </span>
          </div>

          <div>
            <label className="block text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              New Authoritative Stock Level <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              required
              autoFocus
              value={stockQuantity}
              onChange={(e) => setStockQuantity(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#F4F7F5] border border-slate-200 rounded-xl text-slate-900 text-base font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#107C55]/20 focus:border-[#107C55] transition-all"
            />
            <p className="text-[11px] text-slate-400 font-mono mt-1.5">
              Directly sets the authoritative stock in PostgreSQL <code className="text-emerald-700 font-bold">inventory_db</code> using row-level locking.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-mono font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <Button
              type="submit"
              size="md"
              loading={loading}
              className="gap-2 text-xs font-mono font-bold bg-[#107C55] hover:bg-[#0E6847] text-white shadow-xs"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Update Stock</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
