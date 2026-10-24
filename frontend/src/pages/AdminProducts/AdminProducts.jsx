/**
 * pages/AdminProducts/AdminProducts.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Professional, customer-facing SaaS UI for Admin Product Management.
 * Preserves all backend logic, routes, APIs, inventory consistency, and soft-archiving.
 * 
 * DESIGN TOKENS:
 * - Page background: #eef3f0
 * - Header band: solid dark green #0c2a20, borders inside #1d4637
 * - Accent / primary: #14b87a (hover #2bcb8e), text on it #04261a
 * - Cards: white #ffffff, 1px border #e0eae5, radius 16px, shadow 0 1px 2px rgba(12,42,32,.04), 0 8px 24px rgba(12,42,32,.06)
 * - Text: primary #0f2a21, muted #56675f
 * - Semantic: active #0b6444 on #e1f5ec, archived #a3122f on #fde8ec, low stock #8a4f08 on #fff1da
 * - Font: "DM Sans" / system sans for UI, "JetBrains Mono" for uppercase labels, SKUs, dates, headers
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  Plus,
  Search,
  X,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Archive,
  Layers,
  Edit3,
  Download,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Check,
  ArrowUpDown,
} from 'lucide-react';
import {
  getProducts,
  deleteProduct,
  restoreProduct,
} from '../../api/productApi';
import { getAllInventory } from '../../api/inventoryApi';
import ProductModal from '../../components/ProductModal';
import StockModal from '../../components/StockModal';
import Button from '../../components/Button';
import { formatError } from '../../utils/formatError';

// ── Toast Notification ───────────────────────────────────────────────────────
function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);

  const isSuccess = type === 'success';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 bg-[#0c2a20] text-white px-5 py-3.5 rounded-2xl shadow-[0_8px_30px_rgba(12,42,32,0.3)] border border-[#1d4637] flex items-center gap-3 animate-fade-in backdrop-blur-md"
    >
      {isSuccess ? (
        <CheckCircle2 className="w-5 h-5 text-[#14b87a] shrink-0" />
      ) : (
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
      )}
      <span className="text-xs font-mono font-medium tracking-tight">{message}</span>
      <button
        onClick={onClose}
        aria-label="Dismiss message"
        className="ml-2 text-white/50 hover:text-white transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#14b87a] rounded"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── In-App Confirmation Modal for Archiving ─────────────────────────────────
function ArchiveConfirmModal({ isOpen, onClose, product, onConfirm, loading }) {
  if (!isOpen || !product) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[16px] border border-[#e0eae5] shadow-[0_8px_30px_rgba(12,42,32,0.18)] max-w-md w-full overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="w-12 h-12 rounded-2xl bg-[#fde8ec] text-[#a3122f] flex items-center justify-center mb-4">
            <Archive className="w-6 h-6 text-[#a3122f]" />
          </div>

          <h3 id="archive-modal-title" className="text-lg font-bold text-[#0f2a21] tracking-tight mb-1">
            Archive this product?
          </h3>
          <p className="text-xs font-mono text-[#56675f] mb-4">
            SKU #PROD-{product.id} • {product.name}
          </p>

          <div className="p-3.5 rounded-xl bg-[#fff1da] border border-[#fde2b3] text-[#8a4f08] text-xs leading-relaxed space-y-1 mb-5">
            <p className="font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#8a4f08] shrink-0" />
              <span>Safe Archiving Policy</span>
            </p>
            <p className="text-[11px] text-[#8a4f08]">
              This product will be hidden from shoppers on your storefront and blocked from new orders. All historical orders, manifests, and revenue analytics remain safely preserved and you can restore it anytime.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#edf2ef]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-mono font-medium border border-[#e0eae5] bg-white hover:bg-[#f6faf8] text-[#0f2a21] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#14b87a] focus-visible:ring-offset-2"
            >
              Cancel
            </button>
            <Button
              variant="danger"
              size="md"
              loading={loading}
              onClick={() => onConfirm(product)}
              className="gap-2 text-xs font-mono font-bold bg-[#a3122f] hover:bg-[#880e26] text-white shadow-xs focus-visible:ring-2 focus-visible:ring-[#14b87a] focus-visible:ring-offset-2"
            >
              <Archive className="w-4 h-4" />
              <span>Confirm Archive</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Reusable KPI Metric Card ─────────────────────────────────────────────────
function KpiCard({ label, value, helper, icon: Icon, variant = 'neutral', loading = false }) {
  const styles = {
    neutral: {
      number: 'text-[#0f2a21]',
      helper: 'text-[#56675f]',
      iconBg: 'bg-[#f1f5f3]',
      iconText: 'text-[#0f2a21]',
    },
    active: {
      number: 'text-[#0b6444]',
      helper: 'text-[#0b6444]',
      iconBg: 'bg-[#e1f5ec]',
      iconText: 'text-[#0b6444]',
    },
    archived: {
      number: 'text-[#a3122f]',
      helper: 'text-[#a3122f]',
      iconBg: 'bg-[#fde8ec]',
      iconText: 'text-[#a3122f]',
    },
    lowStock: {
      number: 'text-[#8a4f08]',
      helper: 'text-[#8a4f08]',
      iconBg: 'bg-[#fff1da]',
      iconText: 'text-[#8a4f08]',
    },
  }[variant] || styles.neutral;

  return (
    <div className="flex-1 min-w-[250px] bg-white rounded-[16px] border border-[#e0eae5] shadow-[0_1px_2px_rgba(12,42,32,0.04),0_8px_24px_rgba(12,42,32,0.06)] p-5 flex items-center justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_28px_rgba(12,42,32,0.1)]">
      <div className="min-w-0 flex-1 pr-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#56675f] font-bold mb-1">
          {label}
        </p>
        <h3 className={`text-3xl lg:text-4xl font-extrabold tracking-tight tabular-nums ${styles.number}`}>
          {loading ? '—' : Number(value).toLocaleString()}
        </h3>
        <p className={`text-xs mt-1 truncate font-medium ${styles.helper}`}>
          {helper}
        </p>
      </div>
      <div className={`w-12 h-12 rounded-full ${styles.iconBg} ${styles.iconText} flex items-center justify-center shrink-0`}>
        <Icon className="w-5 h-5" strokeWidth={2.2} />
      </div>
    </div>
  );
}

// ── Reusable Status Pill ─────────────────────────────────────────────────────
function StatusPill({ isArchived }) {
  if (isArchived) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#fde8ec] text-[#a3122f] border border-[#fbd0d8]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#a3122f]" />
        <span>Archived</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#e1f5ec] text-[#0b6444] border border-[#c5eedc]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#14b87a] stock-dot-live" />
      <span>Active</span>
    </span>
  );
}

// ── Reusable Available Stock Progress Bar Component ──────────────────────────
function StockBar({ stock, isArchived, onQuickEdit }) {
  const numStock = Number(stock || 0);
  const isLow = !isArchived && numStock <= 5 && numStock > 0;
  const isOut = !isArchived && numStock === 0;

  // Max scale reference of 40 units for the 88px progress bar
  const pct = Math.max(3, Math.min(100, (numStock / 40) * 100));

  return (
    <div className="inline-flex items-center gap-2">
      <div className="flex flex-col items-start gap-1">
        <div className="flex items-center gap-1.5">
          <span className="tabular-nums font-bold text-sm text-[#0f2a21]">
            {numStock}
          </span>
          {isLow && (
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-[#fff1da] text-[#8a4f08] border border-[#fde2b3]">
              LOW
            </span>
          )}
          {isOut && (
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-[#fde8ec] text-[#a3122f] border border-[#fbd0d8]">
              OUT
            </span>
          )}
        </div>

        {/* 88px thin progress bar */}
        <div className="w-[88px] h-1.5 bg-[#edf2ef] rounded-full overflow-hidden" title={`${numStock} units in stock`}>
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isArchived
                ? 'bg-slate-300'
                : isOut
                ? 'bg-[#a3122f]'
                : isLow
                ? 'bg-[#d97706]'
                : 'bg-[#14b87a]'
            }`}
            style={{ width: `${isOut ? 100 : pct}%` }}
          />
        </div>
      </div>

      {onQuickEdit && (
        <button
          type="button"
          onClick={onQuickEdit}
          className="p-1 rounded-md text-[#56675f] hover:text-[#0b6444] hover:bg-[#e1f5ec] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#14b87a]"
          title="Quick update stock"
          aria-label="Quick update stock"
        >
          <Layers className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Initials Avatar Palette Generator ─────────────────────────────────────────
const TINT_PALETTE = [
  { bg: 'bg-[#e1f5ec]', text: 'text-[#0b6444]' },
  { bg: 'bg-[#e0f2fe]', text: 'text-[#0369a1]' },
  { bg: 'bg-[#fef3c7]', text: 'text-[#92400e]' },
  { bg: 'bg-[#f3e8ff]', text: 'text-[#6b21a8]' },
  { bg: 'bg-[#ffedd5]', text: 'text-[#9a3412]' },
  { bg: 'bg-[#ecfdf5]', text: 'text-[#047857]' },
];

function getInitials(name) {
  if (!name) return 'PR';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ── Reusable Product Row with Kebab Dropdown ──────────────────────────────────
function ProductRow({ product, onEdit, onUpdateStock, onArchive, onRestore }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const isArchived = Boolean(product.is_archived);
  const tint = TINT_PALETTE[(Number(product.id) || 0) % TINT_PALETTE.length];
  const initials = getInitials(product.name);

  const formattedPrice = Number(product.price || 0).toFixed(2);
  const createdDate = product.created_at
    ? new Date(product.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';

  return (
    <tr className={`transition-colors duration-150 hover:bg-[#f6faf8] ${isArchived ? 'bg-[#fde8ec]/10' : ''}`}>
      {/* 1. Product Cell (40px initials tile + bold name + muted variant line) */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          {/* 40px rounded initials tile with rotating soft tints (or thumbnail image) */}
          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-[#e0eae5] relative bg-white flex items-center justify-center">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className={`w-full h-full flex items-center justify-center font-mono font-bold text-xs ${tint.bg} ${tint.text} ${
                product.image_url ? 'hidden' : 'flex'
              }`}
            >
              {initials}
            </div>
          </div>

          <div className="min-w-0 max-w-xs">
            <Link
              to={`/products/${product.id}`}
              className="font-bold text-[#0f2a21] hover:text-[#0b6444] transition-colors truncate block text-sm leading-snug"
              title={product.name}
            >
              {product.name}
            </Link>
            <p className="text-xs text-[#56675f] truncate mt-0.5">
              {product.description || product.category || 'Standard catalog variant'}
            </p>
          </div>
        </div>
      </td>

      {/* 2. SKU / ID */}
      <td className="py-3 px-4 whitespace-nowrap">
        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-[#f3f7f5] text-[#0f2a21] border border-[#e0eae5] tracking-[0.12em]">
          #PROD-{product.id}
        </span>
      </td>

      {/* 3. Category */}
      <td className="py-3 px-4 whitespace-nowrap">
        <span className="text-xs text-[#0f2a21] font-medium">
          {product.category || 'General'}
        </span>
      </td>

      {/* 4. Price */}
      <td className="py-3 px-4 text-right tabular-nums font-bold text-[#0f2a21] text-sm whitespace-nowrap">
        ${formattedPrice}
      </td>

      {/* 5. Available Stock */}
      <td className="py-3 px-4 whitespace-nowrap">
        <StockBar
          stock={product.stock_quantity}
          isArchived={isArchived}
          onQuickEdit={() => onUpdateStock(product)}
        />
      </td>

      {/* 6. Status */}
      <td className="py-3 px-4 whitespace-nowrap text-center">
        <StatusPill isArchived={isArchived} />
      </td>

      {/* 7. Created Date */}
      <td className="py-3 px-4 whitespace-nowrap font-mono text-xs text-[#56675f]">
        {createdDate}
      </td>

      {/* 8. Kebab Actions Menu */}
      <td className="py-3 px-4 text-right whitespace-nowrap relative">
        <div ref={menuRef} className="inline-flex items-center justify-end relative">
          <button
            type="button"
            aria-label="More actions"
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-lg text-[#56675f] hover:text-[#0f2a21] hover:bg-[#edf2ef] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#14b87a] focus-visible:ring-offset-2"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {/* Action Popover Menu */}
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-xl shadow-[0_8px_24px_rgba(12,42,32,0.12)] border border-[#e0eae5] py-1.5 z-40 animate-slide-down text-left">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(product);
                }}
                className="w-full px-3.5 py-2 text-xs text-[#0f2a21] hover:bg-[#f6faf8] flex items-center gap-2 font-medium transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#56675f]" />
                <span>Edit product</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onUpdateStock(product);
                }}
                className="w-full px-3.5 py-2 text-xs text-[#0f2a21] hover:bg-[#f6faf8] flex items-center gap-2 font-medium transition-colors"
              >
                <Layers className="w-3.5 h-3.5 text-[#14b87a]" />
                <span>Update stock</span>
              </button>

              <div className="my-1 border-t border-[#edf2ef]" />

              {isArchived ? (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onRestore(product);
                  }}
                  className="w-full px-3.5 py-2 text-xs text-[#0b6444] hover:bg-[#e1f5ec] flex items-center gap-2 font-bold transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore product</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onArchive(product);
                  }}
                  className="w-full px-3.5 py-2 text-xs text-[#a3122f] hover:bg-[#fde8ec] flex items-center gap-2 font-bold transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Archive product</span>
                </button>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Main AdminProducts Component ─────────────────────────────────────────────
export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [statusTab, setStatusTab] = useState('ALL'); // ALL, ACTIVE, ARCHIVED, LOW_STOCK
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState('id_desc');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modals
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockTargetProduct, setStockTargetProduct] = useState(null);
  const [archiveTargetProduct, setArchiveTargetProduct] = useState(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  // Fetch all products (including archived) and authoritative stock manifests
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prodsData, invData] = await Promise.all([
        getProducts(0, 1000, null, { include_archived: true }),
        getAllInventory(1000).catch(() => []),
      ]);

      const stockMap = {};
      for (const inv of invData || []) {
        stockMap[inv.product_id] = inv.stock_quantity;
      }

      const merged = (prodsData || []).map((p) => ({
        ...p,
        stock_quantity: p.id in stockMap ? stockMap[p.id] : p.stock_quantity,
      }));

      setProducts(merged);
      setInventoryList(invData || []);
    } catch (err) {
      setError(formatError(err, 'Failed to fetch catalog data. Please check services.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Derived metrics from actual data
  const totalCount = products.length;
  const activeCount = useMemo(() => products.filter((p) => !p.is_archived).length, [products]);
  const archivedCount = useMemo(() => products.filter((p) => p.is_archived).length, [products]);
  const lowStockCount = useMemo(
    () => products.filter((p) => !p.is_archived && Number(p.stock_quantity || 0) <= 5).length,
    [products]
  );

  // Unique categories derived dynamically
  const categories = useMemo(() => {
    return ['All', ...new Set(products.map((p) => p.category).filter(Boolean))];
  }, [products]);

  // Check if any filter is active
  const isFiltered = Boolean(
    searchQuery.trim() ||
    selectedCategory !== 'All' ||
    statusTab !== 'ALL' ||
    minPrice !== '' ||
    maxPrice !== '' ||
    sortBy !== 'id_desc'
  );

  // Client-side filtering & sorting
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // 1. Search query (name, SKU, id, category, description)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((p) => {
        const idMatch = String(p.id).includes(q) || `prod-${p.id}`.includes(q);
        const nameMatch = (p.name || '').toLowerCase().includes(q);
        const catMatch = (p.category || '').toLowerCase().includes(q);
        const descMatch = (p.description || '').toLowerCase().includes(q);
        return idMatch || nameMatch || catMatch || descMatch;
      });
    }

    // 2. Category filter
    if (selectedCategory && selectedCategory !== 'All') {
      result = result.filter(
        (p) => (p.category || '').toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    // 3. Status Tab filter (All, Active, Archived, Low Stock)
    if (statusTab === 'ACTIVE') {
      result = result.filter((p) => !p.is_archived);
    } else if (statusTab === 'ARCHIVED') {
      result = result.filter((p) => p.is_archived);
    } else if (statusTab === 'LOW_STOCK') {
      result = result.filter((p) => !p.is_archived && Number(p.stock_quantity || 0) <= 5);
    }

    // 4. Price range filter
    if (minPrice !== '') {
      const min = parseFloat(minPrice);
      if (!isNaN(min)) result = result.filter((p) => Number(p.price || 0) >= min);
    }
    if (maxPrice !== '') {
      const max = parseFloat(maxPrice);
      if (!isNaN(max)) result = result.filter((p) => Number(p.price || 0) <= max);
    }

    // 5. Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'id_asc':
          return a.id - b.id;
        case 'id_desc':
          return b.id - a.id;
        case 'name_asc':
          return (a.name || '').localeCompare(b.name || '');
        case 'name_desc':
          return (b.name || '').localeCompare(a.name || '');
        case 'price_asc':
          return Number(a.price || 0) - Number(b.price || 0);
        case 'price_desc':
          return Number(b.price || 0) - Number(a.price || 0);
        case 'stock_asc':
          return Number(a.stock_quantity || 0) - Number(b.stock_quantity || 0);
        case 'stock_desc':
          return Number(b.stock_quantity || 0) - Number(a.stock_quantity || 0);
        case 'newest':
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        default:
          return b.id - a.id;
      }
    });

    return result;
  }, [products, searchQuery, selectedCategory, statusTab, minPrice, maxPrice, sortBy]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredProducts.length / pageSize) || 1;
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, statusTab, minPrice, maxPrice, sortBy, pageSize]);

  function handleResetFilters() {
    setSearchQuery('');
    setSelectedCategory('All');
    setStatusTab('ALL');
    setMinPrice('');
    setMaxPrice('');
    setSortBy('id_desc');
    setCurrentPage(1);
  }

  // Export CSV of currently filtered products
  function handleExportCSV() {
    if (!filteredProducts.length) return;
    const headers = ['ID', 'SKU', 'Name', 'Category', 'Price', 'Stock', 'Status', 'CreatedAt'];
    const rows = filteredProducts.map((p) => [
      p.id,
      `PROD-${p.id}`,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.category || '').replace(/"/g, '""')}"`,
      Number(p.price || 0).toFixed(2),
      p.stock_quantity || 0,
      p.is_archived ? 'Archived' : 'Active',
      p.created_at ? new Date(p.created_at).toISOString() : '',
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `products_catalog_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setToast({
      message: `Exported ${filteredProducts.length} products to CSV.`,
      type: 'success',
    });
  }

  // Execute archive confirmation
  async function handleConfirmArchive(product) {
    setArchiveLoading(true);
    try {
      await deleteProduct(product.id);
      setToast({
        message: `Product "${product.name}" (#PROD-${product.id}) archived.`,
        type: 'success',
      });
      setArchiveTargetProduct(null);
      fetchAllData();
    } catch (err) {
      setToast({
        message: formatError(err, 'Failed to archive product.'),
        type: 'error',
      });
    } finally {
      setArchiveLoading(false);
    }
  }

  // Execute restore
  async function handleRestore(product) {
    try {
      await restoreProduct(product.id);
      setToast({
        message: `Product "${product.name}" (#PROD-${product.id}) restored to active catalog.`,
        type: 'success',
      });
      fetchAllData();
    } catch (err) {
      setToast({
        message: formatError(err, 'Failed to restore product.'),
        type: 'error',
      });
    }
  }

  return (
    <div className="bg-[#eef3f0] min-h-screen text-[#0f2a21] font-sans">
      {/* ── 1. Solid Dark Green Header Band (#0c2a20) ── */}
      <section className="bg-[#0c2a20] text-white pt-6 pb-24 border-b border-[#1d4637] relative">
        <div className="max-w-[1320px] mx-auto px-6 sm:px-8">
          {/* Top Sub-Nav Row */}
          <div className="flex items-center justify-between py-2 border-b border-[#1d4637] mb-8 text-xs font-mono">
            <div className="flex items-center gap-1 sm:gap-2">
              <Link
                to="/admin"
                className="px-3 py-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors"
              >
                Overview
              </Link>
              <Link
                to="/admin/products"
                className="px-3 py-1.5 rounded-lg text-[#14b87a] bg-white/10 font-bold border border-[#14b87a]/30 shadow-xs"
              >
                Products
              </Link>
              <Link
                to="/orders"
                className="px-3 py-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors"
              >
                Orders
              </Link>
              <Link
                to="/admin/graph"
                className="px-3 py-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors hidden sm:inline-block"
              >
                Affinity Graph
              </Link>
            </div>

            <div className="flex items-center gap-2 text-white/70">
              <span className="w-2 h-2 rounded-full bg-[#14b87a] stock-dot-live" />
              <span className="text-[11px] font-semibold text-emerald-300 hidden sm:inline">
                Real-Time Inventory Mesh
              </span>
            </div>
          </div>

          {/* Header Title & Action Buttons Row */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              {/* Eyebrow */}
              <div className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#14b87a] mb-2 flex items-center gap-2">
                <span>CATALOG</span>
              </div>
              <h1 className="text-[34px] font-extrabold text-white tracking-tight leading-tight mb-2">
                Products
              </h1>
              <p className="text-white/70 text-sm max-w-xl leading-relaxed">
                Manage your products, pricing, and inventory efficiently.
              </p>
            </div>

            {/* Right Action Buttons */}
            <div className="flex items-center gap-3 self-start md:self-auto">
              {/* Export CSV Button (outline on dark) */}
              <button
                type="button"
                onClick={handleExportCSV}
                className="inline-flex items-center gap-2 border border-[#1d4637] bg-white/5 hover:bg-white/10 text-white font-mono text-xs font-semibold px-4 py-2.5 rounded-xl transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#14b87a] focus-visible:ring-offset-2 active:translate-y-0.5"
                title="Export filtered records to CSV"
              >
                <Download className="w-4 h-4 text-white/80" />
                <span>Export CSV</span>
              </button>

              {/* Add Product Button (accent filled #14b87a) */}
              <button
                type="button"
                onClick={() => {
                  setEditingProduct(null);
                  setProductModalOpen(true);
                }}
                className="inline-flex items-center gap-2 bg-[#14b87a] hover:bg-[#2bcb8e] text-[#04261a] font-mono text-xs font-bold px-4.5 py-2.5 rounded-xl shadow-md transition-all cursor-pointer hover:-translate-y-0.5 active:translate-y-0 select-none focus-visible:ring-2 focus-visible:ring-[#14b87a] focus-visible:ring-offset-2"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Add product</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Canvas (Overlaps Header by ~64px) ── */}
      <main className="max-w-[1320px] mx-auto px-6 sm:px-8 -mt-16 relative z-20 pb-20 space-y-6">
        {/* ── 2. KPI Row (4 Cards, Min 250px) ── */}
        <section aria-label="Catalog Overview Metrics" className="flex flex-wrap gap-4">
          {/* Card 1: Total products */}
          <KpiCard
            label="TOTAL PRODUCTS"
            value={totalCount}
            helper="Across your entire catalog"
            icon={Package}
            variant="neutral"
            loading={loading}
          />

          {/* Card 2: Active */}
          <KpiCard
            label="ACTIVE"
            value={activeCount}
            helper="100% live on your storefront"
            icon={CheckCircle2}
            variant="active"
            loading={loading}
          />

          {/* Card 3: Archived */}
          <KpiCard
            label="ARCHIVED"
            value={archivedCount}
            helper="Hidden from shoppers, can be restored"
            icon={Archive}
            variant="archived"
            loading={loading}
          />

          {/* Card 4: Low stock */}
          <KpiCard
            label="LOW STOCK"
            value={lowStockCount}
            helper="5 units or fewer remaining"
            icon={AlertTriangle}
            variant="lowStock"
            loading={loading}
          />
        </section>

        {/* ── 3. One Single White Card Containing Everything Else ── */}
        <div className="bg-white rounded-[16px] border border-[#e0eae5] shadow-[0_1px_2px_rgba(12,42,32,0.04),0_8px_24px_rgba(12,42,32,0.06)] overflow-hidden">
          {/* ── 3a. Toolbar ── */}
          <div className="p-5 border-b border-[#edf2ef] flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Wide Search Bar */}
            <div className="relative flex-1 min-w-[260px] sm:min-w-[320px]">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#56675f] pointer-events-none">
                <Search className="w-4 h-4 text-[#56675f]" />
              </span>
              <input
                type="text"
                placeholder="Search by name, SKU or category"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-9 py-2.5 bg-[#f3f7f5] border border-[#e0eae5] rounded-xl text-[#0f2a21] placeholder-[#56675f] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#14b87a] focus-visible:ring-offset-2 transition-all font-sans"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#56675f] hover:text-[#0f2a21] p-1 rounded-full cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Controls Row */}
            <div className="flex flex-wrap items-center gap-2.5 font-mono">
              {/* Category Select */}
              <div className="flex items-center gap-1.5">
                <label htmlFor="cat-select" className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#56675f]">
                  Category:
                </label>
                <select
                  id="cat-select"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-2.5 py-1.5 bg-[#f3f7f5] border border-[#e0eae5] rounded-lg text-xs font-semibold text-[#0f2a21] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#14b87a] cursor-pointer"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c === 'All' ? 'All categories' : c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Min/Max Price Inputs */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#56675f]">
                  Price:
                </span>
                <input
                  type="number"
                  min="0"
                  placeholder="Min $"
                  aria-label="Minimum price"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="w-20 px-2 py-1.5 bg-[#f3f7f5] border border-[#e0eae5] rounded-lg text-xs font-mono text-[#0f2a21] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#14b87a]"
                />
                <span className="text-[#56675f]">-</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Max $"
                  aria-label="Maximum price"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="w-20 px-2 py-1.5 bg-[#f3f7f5] border border-[#e0eae5] rounded-lg text-xs font-mono text-[#0f2a21] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#14b87a]"
                />
              </div>

              {/* Sort Select */}
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#56675f]" />
                <label htmlFor="sort-select" className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#56675f]">
                  Sort:
                </label>
                <select
                  id="sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-2.5 py-1.5 bg-[#f3f7f5] border border-[#e0eae5] rounded-lg text-xs font-semibold text-[#0f2a21] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#14b87a] cursor-pointer"
                >
                  <option value="id_desc">Newest arrivals</option>
                  <option value="id_asc">Oldest arrivals</option>
                  <option value="name_asc">Name (A-Z)</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                  <option value="stock_asc">Stock: Low to High</option>
                  <option value="stock_desc">Stock: High to Low</option>
                </select>
              </div>

              {/* Clear Filters Button */}
              {isFiltered && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-xs text-[#a3122f] hover:text-[#880e26] font-bold flex items-center gap-1 ml-1 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#14b87a] rounded px-1.5 py-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Clear filters</span>
                </button>
              )}
            </div>
          </div>

          {/* ── 3b. Status Tabs with Counts ── */}
          <div className="px-6 py-2.5 border-b border-[#edf2ef] flex items-center justify-between flex-wrap gap-4">
            {/* Tabs List */}
            <div className="flex items-center gap-6 text-sm font-medium">
              {[
                { id: 'ALL', label: 'All', count: totalCount },
                { id: 'ACTIVE', label: 'Active', count: activeCount },
                { id: 'ARCHIVED', label: 'Archived', count: archivedCount },
                { id: 'LOW_STOCK', label: 'Low stock', count: lowStockCount },
              ].map((tab) => {
                const isActive = statusTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusTab(tab.id)}
                    className={`py-2 flex items-center gap-2 cursor-pointer transition-colors relative select-none font-sans ${
                      isActive
                        ? 'text-[#0f2a21] font-bold border-b-2 border-[#14b87a]'
                        : 'text-[#56675f] hover:text-[#0f2a21]'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                        isActive
                          ? 'bg-[#e1f5ec] text-[#0b6444]'
                          : 'bg-[#f3f7f5] text-[#56675f]'
                      }`}
                    >
                      {loading ? '—' : tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right Live Status Indicator */}
            <div className="flex items-center gap-2 text-xs font-medium text-[#56675f]">
              <span className="w-2 h-2 rounded-full bg-[#14b87a] stock-dot-live" />
              <span>Stock levels update in real time</span>
            </div>
          </div>

          {/* ── 3c. Table ── */}
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-3 border-[#14b87a] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-[#56675f] font-mono">Loading product manifests...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-[#fde8ec] text-[#a3122f] flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-[#0f2a21] mb-1">Failed to Load Products</h4>
              <p className="text-xs text-[#56675f] mb-4 leading-relaxed">{error}</p>
              <Button size="sm" onClick={fetchAllData} className="mx-auto gap-2 bg-[#14b87a] text-[#04261a]">
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </Button>
            </div>
          ) : paginatedProducts.length === 0 ? (
            /* ── 4. Empty State ── */
            <div className="py-16 px-6 text-center max-w-md mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-[#f3f7f5] text-[#56675f] flex items-center justify-center mx-auto mb-3">
                <Package className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-[#0f2a21] mb-1">No products match</h4>
              <p className="text-xs text-[#56675f] mb-5 leading-relaxed">
                {isFiltered
                  ? 'Try a different name, SKU or filter.'
                  : 'Get started by creating your first product in the catalog.'}
              </p>
              {isFiltered ? (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-[#f3f7f5] hover:bg-[#e0eae5] text-[#0f2a21] transition-colors cursor-pointer"
                >
                  Clear all filters
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingProduct(null);
                    setProductModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-[#14b87a] hover:bg-[#2bcb8e] text-[#04261a] transition-colors cursor-pointer inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add product</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="border-b border-[#edf2ef] bg-[#f6faf8] text-[11px] font-mono uppercase tracking-[0.14em] text-[#56675f] select-none">
                    <th className="py-3 px-4 font-bold">Product</th>
                    <th className="py-3 px-4 font-bold">SKU</th>
                    <th className="py-3 px-4 font-bold">Category</th>
                    <th className="py-3 px-4 font-bold text-right">Price</th>
                    <th className="py-3 px-4 font-bold">Available stock</th>
                    <th className="py-3 px-4 font-bold text-center">Status</th>
                    <th className="py-3 px-4 font-bold">Created</th>
                    <th className="py-3 px-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2ef] text-sm">
                  {paginatedProducts.map((p) => (
                    <ProductRow
                      key={p.id}
                      product={p}
                      onEdit={(prod) => {
                        setEditingProduct(prod);
                        setProductModalOpen(true);
                      }}
                      onUpdateStock={(prod) => {
                        setStockTargetProduct(prod);
                        setStockModalOpen(true);
                      }}
                      onArchive={(prod) => setArchiveTargetProduct(prod)}
                      onRestore={handleRestore}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── 3d. Footer Pagination & Rows Per Page ── */}
          {!loading && filteredProducts.length > 0 && (
            <div className="px-6 py-4 border-t border-[#edf2ef] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono bg-white">
              {/* Count Indicator */}
              <div className="text-[#56675f]">
                Showing{' '}
                <span className="font-bold text-[#0f2a21]">
                  {(currentPage - 1) * pageSize + 1}
                </span>{' '}
                to{' '}
                <span className="font-bold text-[#0f2a21]">
                  {Math.min(currentPage * pageSize, filteredProducts.length)}
                </span>{' '}
                of <span className="font-bold text-[#0f2a21]">{filteredProducts.length}</span>{' '}
                products
              </div>

              {/* Pagination Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Previous page"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-[#e0eae5] bg-white text-[#0f2a21] hover:bg-[#f6faf8] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#14b87a]"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Page number button: current page solid dark green #0c2a20 */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = i + 1;
                    if (totalPages > 5 && currentPage > 3) {
                      pageNum = currentPage - 2 + i;
                      if (pageNum > totalPages) pageNum = totalPages - (4 - i);
                    }
                    const isCur = pageNum === currentPage;
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          isCur
                            ? 'bg-[#0c2a20] text-white shadow-xs'
                            : 'bg-white border border-[#e0eae5] text-[#0f2a21] hover:bg-[#f6faf8]'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  aria-label="Next page"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-[#e0eae5] bg-white text-[#0f2a21] hover:bg-[#f6faf8] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#14b87a]"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Rows Per Page */}
              <div className="flex items-center gap-2">
                <label htmlFor="rows-per-page" className="text-[#56675f] text-xs">
                  Rows per page:
                </label>
                <select
                  id="rows-per-page"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2 py-1 bg-[#f3f7f5] border border-[#e0eae5] rounded-lg text-xs font-bold text-[#0f2a21] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#14b87a] cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Add / Edit Product Modal ── */}
      <ProductModal
        isOpen={productModalOpen}
        onClose={() => {
          setProductModalOpen(false);
          setEditingProduct(null);
        }}
        product={editingProduct}
        onSaved={(saved, isEditing) => {
          setToast({
            message: isEditing
              ? `Product "${saved.name}" updated successfully!`
              : `Product "${saved.name}" created and synced live!`,
            type: 'success',
          });
          fetchAllData();
        }}
        existingCategories={categories}
      />

      {/* ── Quick Stock Calibration Modal ── */}
      <StockModal
        isOpen={stockModalOpen}
        onClose={() => {
          setStockModalOpen(false);
          setStockTargetProduct(null);
        }}
        product={stockTargetProduct}
        onUpdated={(updated) => {
          setToast({
            message: `Stock for "${updated.name}" updated to ${updated.stock_quantity} units.`,
            type: 'success',
          });
          fetchAllData();
        }}
      />

      {/* ── Archive Confirmation Modal ── */}
      <ArchiveConfirmModal
        isOpen={Boolean(archiveTargetProduct)}
        onClose={() => setArchiveTargetProduct(null)}
        product={archiveTargetProduct}
        onConfirm={handleConfirmArchive}
        loading={archiveLoading}
      />

      {/* ── Toast Notifications ── */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
