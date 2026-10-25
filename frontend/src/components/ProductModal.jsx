/**
 * components/ProductModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal dialog for Admin to Add or Edit a product in the catalog.
 * Updated with:
 * - Direct image file upload + URL mode with preview via ImageUploadField.
 * - Customer-facing SaaS styling (DM Sans labels, #0f2a21 text, #14b87a accents).
 * - Live description counter (0 / 500).
 * - Focus trapping and restoration on close.
 * - Confirmation on Esc / backdrop click only if form has unsaved changes.
 * - Responsive design: bottom sheet with stacked buttons on mobile (<=480px).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, Package, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import ImageUploadField from './ImageUploadField';
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
  const [stockQuantity, setStockQuantity] = useState('15');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const modalRef = useRef(null);
  const triggerRef = useRef(null);

  // Combine default categories with any existing ones in the catalog
  const categoryOptions = useMemo(() => {
    return Array.from(new Set([
      ...DEFAULT_CATEGORIES,
      ...(existingCategories || []).filter(c => c && c !== 'All'),
      'Custom...',
    ]));
  }, [existingCategories]);

  // Sync state when modal opens or target product changes
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement;
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
      setIsUploadingImage(false);

      // Focus first input after modal renders
      const timer = setTimeout(() => {
        const firstInput = modalRef.current?.querySelector('input:not([type="hidden"]), select, textarea');
        firstInput?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      if (triggerRef.current) {
        triggerRef.current?.focus();
      }
    }
  }, [product, isOpen, categoryOptions]);

  // Check if form has unsaved modifications
  const isDirty = useMemo(() => {
    if (isEditing && product) {
      return (
        name !== (product.name || '') ||
        price !== (product.price != null ? String(product.price) : '') ||
        stockQuantity !== (product.stock_quantity != null ? String(product.stock_quantity) : '0') ||
        imageUrl !== (product.image_url || '') ||
        description !== (product.description || '')
      );
    }
    return (
      name.trim() !== '' ||
      price.trim() !== '' ||
      imageUrl.trim() !== '' ||
      description.trim() !== '' ||
      (stockQuantity !== '' && stockQuantity !== '15' && stockQuantity !== '0')
    );
  }, [isEditing, product, name, price, stockQuantity, imageUrl, description]);

  // Safe close handler that warns on unsaved changes
  const handleAttemptClose = useCallback(() => {
    if (loading || isUploadingImage) return;
    if (isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to discard them?');
      if (!confirmed) return;
    }
    onClose();
  }, [isDirty, loading, isUploadingImage, onClose]);

  // Keyboard navigation: Esc to close & focus trapping
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleAttemptClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleAttemptClose]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (isUploadingImage) {
      setError('Please wait for the image upload to complete.');
      return;
    }

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
      setError('Please provide a valid price greater than $0.00.');
      return;
    }

    const numericStock = parseInt(stockQuantity, 10);
    if (isNaN(numericStock) || numericStock < 0 || !Number.isInteger(Number(stockQuantity))) {
      setError('Stock must be a whole number greater than or equal to 0.');
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
      setError(formatError(err, 'Failed to save product. Please verify connectivity and try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-modal-title"
      className="fixed inset-0 z-50 flex sm:items-center justify-center p-0 sm:p-4 bg-slate-950/65 backdrop-blur-xs animate-fade-in"
      onClick={handleAttemptClose}
    >
      <div
        ref={modalRef}
        className="bg-white rounded-t-2xl sm:rounded-2xl border border-[#dbe6e0] shadow-[0_16px_50px_rgba(12,42,32,0.2)] max-w-xl w-full max-h-[90vh] sm:max-h-[92vh] flex flex-col overflow-hidden animate-scale-in self-end sm:self-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-[#edf2ef] bg-[#f8faf9]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#e1f5ec] text-[#0b6444] border border-[#c5eedc] flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-[#0b6444]" strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="product-modal-title" className="text-base sm:text-lg font-bold text-[#0f2a21] tracking-tight">
                  {isEditing ? 'Edit product' : 'Add new product'}
                </h3>
                {isEditing && (
                  <span className="px-2 py-0.5 rounded-md bg-[#e1f5ec] text-[#0b6444] border border-[#c5eedc] text-[11px] font-mono font-bold">
                    #PROD-{product.id}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#56675f] font-sans mt-0.5">
                {isEditing ? 'Update catalog details and inventory stock.' : 'SKU is generated automatically'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAttemptClose}
            className="w-8 h-8 rounded-xl border border-[#dbe6e0] bg-white hover:bg-[#f6faf8] text-[#56675f] hover:text-[#0f2a21] flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Form Body ── */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="p-3.5 rounded-xl bg-[#fde8ec] border border-[#fbd0d8] text-[#a3122f] text-xs flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-[#a3122f] shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          {/* Product Name */}
          <div>
            <label htmlFor="product-name-input" className="block text-[13px] font-semibold text-[#0f2a21] mb-1.5">
              Product name <span className="text-[#a3122f]">*</span>
            </label>
            <input
              id="product-name-input"
              type="text"
              required
              aria-required="true"
              placeholder="e.g. Ergonomic Mechanical Keyboard"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-11 px-3.5 bg-white border border-[#dbe6e0] rounded-[10px] text-[#0f2a21] placeholder-[#56675f] text-sm focus:outline-none focus:ring-2 focus:ring-[#14b87a] focus:border-[#14b87a] transition-all"
            />
          </div>

          {/* Category & Price (2 Columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Category */}
            <div>
              <label htmlFor="product-category-select" className="block text-[13px] font-semibold text-[#0f2a21] mb-1.5">
                Category <span className="text-[#a3122f]">*</span>
              </label>
              <div className="space-y-2">
                <select
                  id="product-category-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-11 px-3.5 bg-white border border-[#dbe6e0] rounded-[10px] text-[#0f2a21] text-sm focus:outline-none focus:ring-2 focus:ring-[#14b87a] focus:border-[#14b87a] transition-all cursor-pointer"
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
                    aria-required="true"
                    placeholder="Enter custom category"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="w-full h-10 px-3.5 bg-white border border-[#dbe6e0] rounded-[10px] text-[#0f2a21] placeholder-[#56675f] text-xs focus:outline-none focus:ring-2 focus:ring-[#14b87a] focus:border-[#14b87a] transition-all"
                  />
                )}
              </div>
            </div>

            {/* Price (USD) with $ Prefix */}
            <div>
              <label htmlFor="product-price-input" className="block text-[13px] font-semibold text-[#0f2a21] mb-1.5">
                Price (USD) <span className="text-[#a3122f]">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#56675f] font-mono text-sm font-bold pointer-events-none">
                  $
                </span>
                <input
                  id="product-price-input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  aria-required="true"
                  placeholder="29.99"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full h-11 pl-8 pr-3.5 bg-white border border-[#dbe6e0] rounded-[10px] text-[#0f2a21] placeholder-[#56675f] text-sm tabular-nums font-mono focus:outline-none focus:ring-2 focus:ring-[#14b87a] focus:border-[#14b87a] transition-all"
                />
              </div>
            </div>
          </div>

          {/* Stock Quantity */}
          <div>
            <label htmlFor="product-stock-input" className="block text-[13px] font-semibold text-[#0f2a21] mb-1.5">
              Available stock <span className="text-[#a3122f]">*</span>
            </label>
            <input
              id="product-stock-input"
              type="number"
              min="0"
              step="1"
              required
              aria-required="true"
              placeholder="10"
              value={stockQuantity}
              onChange={(e) => setStockQuantity(e.target.value)}
              className="w-full h-11 px-3.5 bg-white border border-[#dbe6e0] rounded-[10px] text-[#0f2a21] placeholder-[#56675f] text-sm tabular-nums font-mono focus:outline-none focus:ring-2 focus:ring-[#14b87a] focus:border-[#14b87a] transition-all"
            />
            <p className="text-xs text-[#56675f] font-sans mt-1">
              Number of units available to sell.
            </p>
          </div>

          {/* ── Product Image (Upload or URL) ── */}
          <ImageUploadField
            value={imageUrl}
            onChange={(newUrl) => setImageUrl(newUrl)}
            onUploadStateChange={(isUploading) => setIsUploadingImage(isUploading)}
            maxSizeMB={5}
            accept="image/png,image/jpeg,image/webp"
            disabled={loading}
          />

          {/* Description with Live 0/500 Character Counter */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="product-description-input" className="text-[13px] font-semibold text-[#0f2a21]">
                Description <span className="text-[#56675f] font-normal">(optional)</span>
              </label>
              <span className="text-xs font-mono text-[#56675f]">
                {description.length} / 500
              </span>
            </div>
            <textarea
              id="product-description-input"
              rows={3}
              maxLength={500}
              placeholder="Detailed product features, specifications, and customer overview..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-3 bg-white border border-[#dbe6e0] rounded-[10px] text-[#0f2a21] placeholder-[#56675f] text-sm focus:outline-none focus:ring-2 focus:ring-[#14b87a] focus:border-[#14b87a] transition-all resize-none"
            />
          </div>

          {/* ── Footer Actions ── */}
          <div className="pt-3 border-t border-[#edf2ef] flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2.5">
            <button
              type="button"
              onClick={handleAttemptClose}
              disabled={loading || isUploadingImage}
              className="w-full sm:w-auto h-11 px-5 rounded-[10px] text-sm font-semibold border border-[#dbe6e0] bg-white hover:bg-[#f6faf8] text-[#0f2a21] transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || isUploadingImage}
              className="w-full sm:w-auto h-11 px-6 rounded-[10px] text-sm font-bold bg-[#14b87a] hover:bg-[#2bcb8e] text-[#04261a] transition-colors shadow-xs cursor-pointer inline-flex items-center justify-center gap-2 disabled:opacity-50 select-none"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#04261a]" />
                  <span>{isEditing ? 'Saving...' : 'Creating...'}</span>
                </>
              ) : isUploadingImage ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#04261a]" />
                  <span>Uploading image...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#04261a]" />
                  <span>{isEditing ? 'Save changes' : 'Create product'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
