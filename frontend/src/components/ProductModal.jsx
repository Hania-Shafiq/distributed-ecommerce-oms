/**
 * components/ProductModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal dialog for Admin to Add or Edit a product in the catalog.
 * Wires directly to product-service and inventory-service:
 * - Persists to products_db (PostgreSQL)
 * - Calibrates authoritative stock in inventory_db (PostgreSQL) via inventory-service
 * - Indexes dense vector embeddings in Elasticsearch
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { X, Package, DollarSign, Layers, Image as ImageIcon, FileText, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import Button from './Button';
import { createProduct, updateProduct } from '../api/productApi';
import { formatError } from '../utils/formatError';

const DEFAULT_CATEGORIES = [
  'Electronics',
  'Audio',
  'Accessories',
  'Wearables',
  'Gaming',
  'Office',
  'Home',
  'Appliances',
];

export default function ProductModal({ isOpen, onClose, product = null, onSaved, existingCategories = [] }) {
  const isEditing = Boolean(product && product.id);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Electronics');
  const [customCategory, setCustomCategory] = useState('');
  const [price, setPrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Combine default categories with any existing ones in the catalog
  const categoryOptions = Array.from(new Set([
    ...DEFAULT_CATEGORIES,
    ...(existingCategories || []).filter(c => c && c !== 'All'),
    'Custom...',
  ]));

  useEffect(() => {
    if (product) {
      setName(product.name || '');
      const cat = product.category || 'Electronics';
      if (categoryOptions.includes(cat) && cat !== 'Custom...') {
        setCategory(cat);
        setCustomCategory('');
      } else {
        setCategory('Custom...');
        setCustomCategory(cat);
      }
      setPrice(product.price != null ? String(product.price) : '');
      setStockQuantity(product.stock_quantity != null ? String(product.stock_quantity) : '0');
      setImageUrl(product.image_url || '');
      setDescription(product.description || '');
    } else {
      setName('');
      setCategory('Electronics');
      setCustomCategory('');
      setPrice('');
      setStockQuantity('15');
      setImageUrl('');
      setDescription('');
    }
    setError(null);
  }, [product, isOpen]);

  // Handle ESC key press to close
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Product name is required.');
      return;
    }

    const resolvedCategory = category === 'Custom...' ? customCategory.trim() : category;
    if (!resolvedCategory) {
      setError('Please select or specify a category.');
      return;
    }

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      setError('Please provide a valid price strictly greater than $0.00.');
      return;
    }

    const numericStock = parseInt(stockQuantity, 10);
    if (isNaN(numericStock) || numericStock < 0) {
      setError('Please provide a valid stock quantity (0 or greater).');
      return;
    }

    setLoading(true);

    const payload = {
      name: trimmedName,
      category: resolvedCategory,
      price: numericPrice,
      stock_quantity: numericStock,
      image_url: imageUrl.trim() || null,
      description: description.trim() || null,
    };

    try {
      let saved;
      if (isEditing) {
        saved = await updateProduct(product.id, payload);
      } else {
        saved = await createProduct(payload);
      }

      if (onSaved) {
        onSaved(saved, isEditing);
      }
      onClose();
    } catch (err) {
      setError(formatError(err, 'Failed to save product. Please verify database connectivity and try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#111C18] rounded-2xl border border-emerald-950/15 dark:border-white/10 shadow-2xl max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100 dark:border-white/10 bg-[#F4F7F5] dark:bg-[#14231E]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100/80 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/40 text-[#107C55] dark:text-[#34D399] flex items-center justify-center shrink-0 shadow-2xs">
              <Package className="w-5 h-5 text-[#107C55] dark:text-[#34D399]" strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="product-modal-title" className="text-base sm:text-lg font-bold text-slate-900 dark:text-[#E6EFEA] tracking-tight">
                  {isEditing ? `Edit Product` : 'Add New Product'}
                </h3>
                {isEditing ? (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 text-[11px] font-mono font-bold">
                    #PROD-{product.id}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#1A2C26] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10 text-[10px] font-mono uppercase">
                    Auto-SKU
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {isEditing ? 'Update catalog record and calibrate live inventory' : 'Dual-persisted: products_db + inventory_db + Elasticsearch'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#14231E] hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-[#E6EFEA] flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/40 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          {/* Product Name */}
          <div>
            <label className="block text-xs font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Product Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Ergonomic Mechanical Keyboard"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#F4F7F5] dark:bg-[#14231E] border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-[#E6EFEA] placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#107C55]/20 focus:border-[#107C55] transition-all"
            />
          </div>

          {/* Category & Price in 2 Columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Category */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Category <span className="text-rose-500">*</span>
              </label>
              <div className="space-y-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#F4F7F5] dark:bg-[#14231E] border border-slate-200 dark:border-white/10 rounded-xl text-slate-800 dark:text-[#E6EFEA] text-sm focus:outline-none focus:ring-2 focus:ring-[#107C55]/20 focus:border-[#107C55] transition-all cursor-pointer"
                >
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                {category === 'Custom...' && (
                  <input
                    type="text"
                    required
                    placeholder="Enter custom category"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[#F4F7F5] dark:bg-[#14231E] border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-[#E6EFEA] placeholder-slate-400 dark:placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-[#107C55]/20 focus:border-[#107C55] transition-all"
                  />
                )}
              </div>
            </div>

            {/* Price */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Price (USD) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-mono text-sm font-bold pointer-events-none">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="29.99"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full pl-8 pr-3.5 py-2.5 bg-[#F4F7F5] dark:bg-[#14231E] border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-[#E6EFEA] placeholder-slate-400 dark:placeholder-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#107C55]/20 focus:border-[#107C55] transition-all"
                />
              </div>
            </div>
          </div>

          {/* Stock Quantity (Authoritative source: inventory-service) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                {isEditing ? 'Authoritative Stock Units' : 'Initial Stock Quantity'} <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/40">
                inventory_db Managed
              </span>
            </div>
            <input
              type="number"
              min="0"
              required
              placeholder="10"
              value={stockQuantity}
              onChange={(e) => setStockQuantity(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#F4F7F5] dark:bg-[#14231E] border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-[#E6EFEA] placeholder-slate-400 dark:placeholder-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#107C55]/20 focus:border-[#107C55] transition-all"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-1">
              Guaranteed by PostgreSQL row-locking and non-negative CHECK constraints.
            </p>
          </div>

          {/* Image URL */}
          <div>
            <label className="block text-xs font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Image URL (Optional)
            </label>
            <input
              type="url"
              placeholder="https://images.unsplash.com/photo-..."
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#F4F7F5] dark:bg-[#14231E] border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-[#E6EFEA] placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#107C55]/20 focus:border-[#107C55] transition-all"
            />
            {imageUrl.trim() && (
              <div className="mt-2.5 flex items-center gap-3 p-2.5 bg-[#F4F7F5] dark:bg-[#14231E] rounded-xl border border-slate-200/80 dark:border-white/10">
                <div className="w-14 h-14 rounded-lg bg-white dark:bg-[#0B1411] border border-slate-200 dark:border-white/10 overflow-hidden shrink-0">
                  <img
                    src={imageUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.src = 'https://placehold.co/100x100?text=Invalid';
                    }}
                  />
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono min-w-0">
                  <span className="font-bold text-slate-700 dark:text-slate-200 block">Image Preview</span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-400 truncate block max-w-xs">{imageUrl}</span>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Description (Optional)
            </label>
            <textarea
              rows={3}
              placeholder="Detailed product features, specifications, and customer overview..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#F4F7F5] dark:bg-[#14231E] border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-[#E6EFEA] placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#107C55]/20 focus:border-[#107C55] transition-all resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-xs font-mono font-medium border border-slate-200 dark:border-white/10 bg-white dark:bg-[#14231E] hover:bg-slate-50 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
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
              <span>{isEditing ? 'Save Changes' : 'Create Product'}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
