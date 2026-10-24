/**
 * pages/AdminProducts/AdminProducts.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dedicated Administrative Product Management Page.
 * Exclusively accessible to administrators via /admin/products.
 * Matches the OMS//STORE Catalog editorial light-and-dark aesthetic:
 * - Dark forest-green hero section with live inventory telemetry indicator
 * - 4 real-time KPI summary cards (Total Products, Active Products, Archived Products, Low Stock)
 * - Spacious elevated floating toolbar with full-width search, category, status, stock, price, and sort
 * - Responsive enterprise product table with inline stock update, edit, archive & restore
 * - Modals for Add/Edit Product, Authoritative Stock Calibration, and Confirmation Dialogs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
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
  ShieldCheck,
  Filter,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  getProducts,
  deleteProduct,
  restoreProduct,
} from '../../api/productApi';
import { getAllInventory } from '../../api/inventoryApi';
import ProductModal from '../../components/ProductModal';
import StockModal from '../../components/StockModal';
import ProductImage from '../../components/ProductImage';
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
    <div className="fixed bottom-6 right-6 z-50 bg-[#0F1C18] text-white px-5 py-3.5 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.35)] border border-emerald-500/30 flex items-center gap-3 animate-fade-in backdrop-blur-md">
      {isSuccess ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
      ) : (
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
      )}
      <span className="text-xs font-mono font-medium">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 text-white/50 hover:text-white transition-colors cursor-pointer"
        aria-label="Dismiss toast"
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-rose-200 shadow-2xl max-w-md w-full overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mb-4">
            <Archive className="w-6 h-6 text-rose-600" />
          </div>

          <h3 className="text-lg font-bold text-slate-900 tracking-tight mb-1">
            Archive Product?
          </h3>
          <p className="text-xs font-mono text-slate-500 mb-4">
            SKU #PROD-{product.id} • {product.name}
          </p>

          <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/90 text-amber-900 text-xs leading-relaxed space-y-1 mb-5">
            <p className="font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Safe Soft-Archiving Guarantee</span>
            </p>
            <p className="text-amber-800 text-[11px]">
              This product will be immediately excluded from the customer catalog, autocomplete, and SAGA purchasing. All historical orders, ledger manifests, and sales analytics will remain completely intact.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-mono font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <Button
              variant="danger"
              size="md"
              loading={loading}
              onClick={() => onConfirm(product)}
              className="gap-2 text-xs font-mono font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
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

// ── Skeleton Loader for Table & Cards ────────────────────────────────────────
function AdminTableSkeleton() {
  return (
    <div className="divide-y divide-slate-100 animate-pulse">
      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
        <div key={n} className="py-4 px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-11 h-11 bg-slate-200 rounded-xl shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-4 bg-slate-200 rounded w-48" />
              <div className="h-3 bg-slate-200 rounded w-72" />
            </div>
          </div>
          <div className="h-5 bg-slate-200 rounded w-20 hidden sm:block" />
          <div className="h-5 bg-slate-200 rounded w-24 hidden md:block" />
          <div className="h-5 bg-slate-200 rounded w-16" />
          <div className="h-5 bg-slate-200 rounded w-20 hidden lg:block" />
          <div className="h-8 bg-slate-200 rounded-lg w-28" />
        </div>
      ))}
    </div>
  );
}

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // Search & Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, ACTIVE, ARCHIVED
  const [stockFilter, setStockFilter] = useState('ALL');   // ALL, IN_STOCK, LOW_STOCK, OUT_OF_STOCK
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState('id_desc');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modals State
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
      setError(formatError(err, 'Failed to fetch catalog manifests. Please check backend services.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Derived KPI metrics from real backend data
  const totalCount = products.length;
  const activeCount = useMemo(() => products.filter((p) => !p.is_archived).length, [products]);
  const archivedCount = useMemo(() => products.filter((p) => p.is_archived).length, [products]);
  const lowStockCount = useMemo(
    () => products.filter((p) => !p.is_archived && Number(p.stock_quantity || 0) <= 5).length,
    [products]
  );

  const activePct = totalCount > 0 ? ((activeCount / totalCount) * 100).toFixed(0) : 0;

  // Unique categories derived dynamically
  const categories = useMemo(() => {
    return ['All', ...new Set(products.map((p) => p.category).filter(Boolean))];
  }, [products]);

  // Is any filter currently active?
  const isFiltered = Boolean(
    searchQuery.trim() ||
    selectedCategory !== 'All' ||
    statusFilter !== 'ALL' ||
    stockFilter !== 'ALL' ||
    minPrice !== '' ||
    maxPrice !== '' ||
    sortBy !== 'id_desc'
  );

  // Client-side filtering & sorting
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // 1. Search Query (name, SKU, id, category, description)
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

    // 2. Category Filter
    if (selectedCategory && selectedCategory !== 'All') {
      result = result.filter(
        (p) => (p.category || '').toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    // 3. Status Filter (Active, Archived, All)
    if (statusFilter === 'ACTIVE') {
      result = result.filter((p) => !p.is_archived);
    } else if (statusFilter === 'ARCHIVED') {
      result = result.filter((p) => p.is_archived);
    }

    // 4. Stock Filter (In Stock, Low Stock, Out of Stock)
    if (stockFilter === 'IN_STOCK') {
      result = result.filter((p) => Number(p.stock_quantity || 0) > 5);
    } else if (stockFilter === 'LOW_STOCK') {
      result = result.filter((p) => {
        const s = Number(p.stock_quantity || 0);
        return s > 0 && s <= 5;
      });
    } else if (stockFilter === 'OUT_OF_STOCK') {
      result = result.filter((p) => Number(p.stock_quantity || 0) === 0);
    }

    // 5. Price Range Filter
    if (minPrice !== '') {
      const min = parseFloat(minPrice);
      if (!isNaN(min)) result = result.filter((p) => Number(p.price || 0) >= min);
    }
    if (maxPrice !== '') {
      const max = parseFloat(maxPrice);
      if (!isNaN(max)) result = result.filter((p) => Number(p.price || 0) <= max);
    }

    // 6. Sorting
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
  }, [products, searchQuery, selectedCategory, statusFilter, stockFilter, minPrice, maxPrice, sortBy]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredProducts.length / pageSize) || 1;
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, statusFilter, stockFilter, minPrice, maxPrice, sortBy, pageSize]);

  function handleResetFilters() {
    setSearchQuery('');
    setSelectedCategory('All');
    setStatusFilter('ALL');
    setStockFilter('ALL');
    setMinPrice('');
    setMaxPrice('');
    setSortBy('id_desc');
    setCurrentPage(1);
  }

  // Execute archive confirmation
  async function handleConfirmArchive(product) {
    setArchiveLoading(true);
    try {
      await deleteProduct(product.id);
      setToast({
        message: `Product "${product.name}" (#PROD-${product.id}) archived safely.`,
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
    <div className="bg-[#F4F7F5] min-h-screen">
      {/* ── Dark Hero Section: Admin Product Management Header ── */}
      <section className="bg-gradient-to-b from-[#0A1612] via-[#0D1E18] to-[#122A21] text-white pt-10 pb-16 border-b border-emerald-950/60 relative overflow-hidden">
        {/* Subtle background glow and blueprint dots matching Catalog theme */}
        <div className="absolute inset-0 bg-blueprint-dots opacity-20 pointer-events-none" aria-hidden="true" />
        <div
          className="absolute -top-24 right-1/4 w-120 h-120 rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none"
          aria-hidden="true"
        />

        <div className="page-container relative z-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              {/* Breadcrumb matching Catalog header specification */}
              <div className="inline-flex items-center gap-2 text-[#489B97] font-mono text-xs font-semibold uppercase tracking-wider mb-2">
                <span className="w-2 h-2 rounded-full bg-[#10B981] stock-dot-live" />
                <span>ADMIN / PRODUCT MANAGEMENT</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-white tracking-tight leading-tight mb-2">
                Product Management
              </h1>
              <p className="text-emerald-100/75 font-mono text-xs sm:text-sm max-w-2xl">
                Manage your products, pricing, and inventory efficiently.
              </p>
            </div>

            {/* Header Right Actions & Compact Inventory Status Indicator */}
            <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
              {/* Compact Inventory Synchronization Status Indicator */}
              <div className="flex items-center gap-2 bg-emerald-950/70 border border-emerald-500/30 px-3.5 py-2.5 rounded-xl text-emerald-200 font-mono text-xs shadow-xs backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-[#10B981] stock-dot-live" />
                <span className="font-semibold text-emerald-100">inventory_db Synchronized</span>
              </div>

              {/* Primary Green Action Button: + Add Product */}
              <button
                type="button"
                onClick={() => {
                  setEditingProduct(null);
                  setProductModalOpen(true);
                }}
                className="inline-flex items-center gap-2 bg-[#10B981] hover:bg-[#0EA271] text-emerald-950 font-mono text-xs font-bold px-4.5 py-2.5 rounded-xl shadow-md transition-all cursor-pointer hover:-translate-y-0.5 active:translate-y-0 select-none"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Add Product</span>
              </button>

              {/* Refresh Telemetry */}
              <button
                type="button"
                onClick={fetchAllData}
                disabled={loading}
                className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white font-mono text-xs font-semibold px-3 py-2.5 rounded-xl transition-all cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
                title="Refresh product manifests"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Page Content (Cards, Toolbar, Table) ── */}
      <div className="page-container -mt-8 relative z-20 pb-16 space-y-6">
        {/* ── 3. Four Statistics Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Products */}
          <div className="bg-white rounded-2xl border border-emerald-950/[0.08] shadow-[0_4px_20px_rgba(20,50,35,0.04)] p-5 flex items-center justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(20,50,35,0.08)]">
            <div className="min-w-0">
              <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold mb-1">
                Total Products
              </p>
              <h3 className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 tracking-tight tabular-nums">
                {loading ? '—' : totalCount.toLocaleString()}
              </h3>
              <p className="text-[11px] font-mono text-slate-400 mt-1 truncate">
                PostgreSQL products_db & ES
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200/80 text-slate-700 flex items-center justify-center shrink-0 ml-3">
              <Package className="w-6 h-6 text-slate-700" />
            </div>
          </div>

          {/* Card 2: Active Products */}
          <div className="bg-white rounded-2xl border border-emerald-950/[0.08] shadow-[0_4px_20px_rgba(20,50,35,0.04)] p-5 flex items-center justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(20,50,35,0.08)]">
            <div className="min-w-0">
              <p className="text-[11px] font-mono uppercase tracking-wider text-emerald-700 font-bold mb-1">
                Active Products
              </p>
              <h3 className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-800 tracking-tight tabular-nums">
                {loading ? '—' : activeCount.toLocaleString()}
              </h3>
              <p className="text-[11px] font-mono text-emerald-600 mt-1 truncate">
                {activePct}% available in storefront
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0 ml-3">
              <CheckCircle2 className="w-6 h-6 text-[#107C55]" />
            </div>
          </div>

          {/* Card 3: Archived Products */}
          <div className="bg-white rounded-2xl border border-emerald-950/[0.08] shadow-[0_4px_20px_rgba(20,50,35,0.04)] p-5 flex items-center justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(20,50,35,0.08)]">
            <div className="min-w-0">
              <p className="text-[11px] font-mono uppercase tracking-wider text-rose-700 font-bold mb-1">
                Archived Products
              </p>
              <h3 className="text-2xl sm:text-3xl font-extrabold font-mono text-rose-800 tracking-tight tabular-nums">
                {loading ? '—' : archivedCount.toLocaleString()}
              </h3>
              <p className="text-[11px] font-mono text-rose-600 mt-1 truncate">
                Safe soft-deletion • Restorable
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0 ml-3">
              <Archive className="w-6 h-6 text-rose-600" />
            </div>
          </div>

          {/* Card 4: Low Stock */}
          <div className="bg-white rounded-2xl border border-emerald-950/[0.08] shadow-[0_4px_20px_rgba(20,50,35,0.04)] p-5 flex items-center justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(20,50,35,0.08)]">
            <div className="min-w-0">
              <p className="text-[11px] font-mono uppercase tracking-wider text-amber-700 font-bold mb-1">
                Low Stock
              </p>
              <h3 className="text-2xl sm:text-3xl font-extrabold font-mono text-amber-800 tracking-tight tabular-nums">
                {loading ? '—' : lowStockCount.toLocaleString()}
              </h3>
              <p className="text-[11px] font-mono text-amber-600 mt-1 truncate">
                Stock ≤ 5 in inventory_db
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0 ml-3">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>

        {/* ── 4. Upgraded Search and Filters Panel ── */}
        <div className="bg-white rounded-2xl border border-emerald-900/10 shadow-[0_8px_30px_rgba(20,50,35,0.06)] p-5 space-y-4">
          {/* Row 1: Full-Width Search Input Matching Catalog Specification */}
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <Search className="w-4 h-4 text-slate-400" />
            </span>
            <input
              type="text"
              placeholder="Search by product name, SKU (#PROD-...), or product ID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-10 py-3 bg-[#F4F7F5] border border-slate-200/90 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#10B981]/20 focus:border-[#10B981] transition-all text-sm font-normal"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-800 p-1 rounded-full transition-colors cursor-pointer"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Row 2: Secondary Filters (Category, Status, Stock, Price, Sort) */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-slate-100 text-xs font-mono">
            {/* Left Filter Group */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Category Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Category:
                </span>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="text-xs font-semibold text-slate-800 bg-[#F4F7F5] border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#10B981] cursor-pointer"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat === 'All' ? 'All Categories' : cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter: Active, Archived, All */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Status:
                </span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs font-semibold text-slate-800 bg-[#F4F7F5] border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#10B981] cursor-pointer"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active Only</option>
                  <option value="ARCHIVED">Archived Only</option>
                </select>
              </div>

              {/* Stock Filter: In Stock, Low Stock, Out of Stock */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Stock:
                </span>
                <select
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value)}
                  className="text-xs font-semibold text-slate-800 bg-[#F4F7F5] border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#10B981] cursor-pointer"
                >
                  <option value="ALL">All Stock Levels</option>
                  <option value="IN_STOCK">In Stock (&gt; 5)</option>
                  <option value="LOW_STOCK">Low Stock (≤ 5)</option>
                  <option value="OUT_OF_STOCK">Out of Stock (0)</option>
                </select>
              </div>

              {/* Price Range Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Price:
                </span>
                <input
                  type="number"
                  min="0"
                  placeholder="Min $"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="w-18 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-[#F4F7F5] text-slate-800 focus:outline-none focus:border-[#10B981] font-mono"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Max $"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="w-18 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-[#F4F7F5] text-slate-800 focus:outline-none focus:border-[#10B981] font-mono"
                />
              </div>

              {/* Clear Filters Action */}
              {isFiltered && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 font-bold ml-1 cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Clear Filters</span>
                </button>
              )}
            </div>

            {/* Right Sorting & Page Size Group */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Sort By Dropdown */}
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Sort:
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="text-xs font-semibold text-slate-800 bg-[#F4F7F5] border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#10B981] cursor-pointer"
                >
                  <option value="id_desc">ID: High to Low (Newest)</option>
                  <option value="id_asc">ID: Low to High (Oldest)</option>
                  <option value="name_asc">Name (A-Z)</option>
                  <option value="name_desc">Name (Z-A)</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                  <option value="stock_asc">Stock: Low to High</option>
                  <option value="stock_desc">Stock: High to Low</option>
                  <option value="newest">Created Date</option>
                </select>
              </div>

              {/* Page Size */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Per Page:
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="text-xs font-semibold text-slate-800 bg-[#F4F7F5] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#10B981] cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ── 5. Professional Product Table ── */}
        <div className="bg-white rounded-2xl border border-emerald-950/[0.08] shadow-[0_8px_30px_rgba(20,50,35,0.04)] overflow-hidden">
          {/* Table Header Action Bar */}
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#F4F7F5]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-100/80 border border-emerald-200 text-[#107C55] flex items-center justify-center shrink-0">
                <Package className="w-4 h-4 text-[#107C55]" />
              </div>
              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-800">
                  Products Manifest Ledger
                </span>
                <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white text-slate-600 border border-slate-200">
                  {filteredProducts.length} {filteredProducts.length === 1 ? 'record' : 'records'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
              <Database className="w-3.5 h-3.5 text-slate-400" />
              <span>Authoritative stock source: PostgreSQL</span>
              <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                inventory_db
              </span>
            </div>
          </div>

          {loading ? (
            <AdminTableSkeleton />
          ) : error ? (
            <div className="p-12 text-center font-mono max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-3 border border-rose-200">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-1">Unable to Load Products</h4>
              <p className="text-xs text-slate-500 mb-5 leading-relaxed">{error}</p>
              <Button size="sm" onClick={fetchAllData} className="mx-auto gap-2">
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry Fetch</span>
              </Button>
            </div>
          ) : paginatedProducts.length === 0 ? (
            <div className="p-14 text-center font-mono max-w-md mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <Package className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-1">No Matching Products Found</h4>
              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                {isFiltered
                  ? 'We could not find any product records matching your current filter criteria.'
                  : 'Your catalog manifest has zero records. Click below to create your first product.'}
              </p>
              {isFiltered ? (
                <Button variant="secondary" size="sm" onClick={handleResetFilters} className="mx-auto">
                  Clear All Filters
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingProduct(null);
                    setProductModalOpen(true);
                  }}
                  className="mx-auto gap-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add First Product</span>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-mono uppercase tracking-wider text-slate-500 select-none">
                    <th className="py-3.5 px-4 font-bold">Product</th>
                    <th className="py-3.5 px-4 font-bold">SKU / ID</th>
                    <th className="py-3.5 px-4 font-bold">Category</th>
                    <th className="py-3.5 px-4 font-bold text-right">Price</th>
                    <th className="py-3.5 px-4 font-bold text-center">Available Stock</th>
                    <th className="py-3.5 px-4 font-bold text-center">Status</th>
                    <th className="py-3.5 px-4 font-bold">Created</th>
                    <th className="py-3.5 px-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-mono">
                  {paginatedProducts.map((p) => {
                    const isArchived = Boolean(p.is_archived);
                    const stock = Number(p.stock_quantity || 0);
                    const formattedPrice = Number(p.price || 0).toFixed(2);
                    const createdDate = p.created_at
                      ? new Date(p.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : '—';

                    return (
                      <tr
                        key={p.id}
                        className={`transition-colors duration-150 hover:bg-[#F9FBFA] ${
                          isArchived ? 'bg-rose-50/15 text-slate-500' : 'text-slate-800'
                        }`}
                      >
                        {/* 1. Product Thumbnail + Title + Subtitle */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 overflow-hidden shrink-0 shadow-2xs">
                              <ProductImage
                                imageUrl={p.image_url}
                                name={p.name}
                                category={p.category}
                                className="w-full h-full"
                                imgClassName="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 max-w-xs">
                              <Link
                                to={`/products/${p.id}`}
                                className="font-bold text-slate-900 hover:text-[#107C55] transition-colors truncate block text-sm leading-snug"
                                title={p.name}
                              >
                                {p.name}
                              </Link>
                              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                {p.description || 'No description available'}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* 2. SKU / ID */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold border border-slate-200 text-[11px]">
                            #PROD-{p.id}
                          </span>
                        </td>

                        {/* 3. Category */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-medium text-[11px]">
                            {p.category || 'General'}
                          </span>
                        </td>

                        {/* 4. Price */}
                        <td className="py-3 px-4 text-right font-bold text-slate-900 text-sm whitespace-nowrap tabular-nums">
                          ${formattedPrice}
                        </td>

                        {/* 5. Stock Level with Visual Color Code */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {isArchived ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                {stock} units
                              </span>
                            ) : stock > 5 ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 stock-dot-live" />
                                <span>{stock} units</span>
                              </span>
                            ) : stock > 0 ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                <span>{stock} left</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                <span>0 units</span>
                              </span>
                            )}

                            {/* Inline Stock Calibrate Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setStockTargetProduct(p);
                                setStockModalOpen(true);
                              }}
                              className="p-1 rounded-lg text-slate-400 hover:text-[#107C55] hover:bg-emerald-50 transition-colors cursor-pointer"
                              title="Calibrate stock quantity"
                            >
                              <Layers className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        {/* 6. Status Badge */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {isArchived ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-rose-100 text-rose-800 border border-rose-200 shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              Archived
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 stock-dot-live" />
                              Active
                            </span>
                          )}
                        </td>

                        {/* 7. Created Date */}
                        <td className="py-3 px-4 whitespace-nowrap text-slate-400 text-[11px]">
                          {createdDate}
                        </td>

                        {/* 8. Action Menu Buttons */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Edit Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingProduct(p);
                                setProductModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-emerald-700 hover:border-emerald-300 transition-all cursor-pointer shadow-2xs"
                              title="Edit product details"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            {/* Update Stock Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setStockTargetProduct(p);
                                setStockModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 hover:border-emerald-300 transition-all cursor-pointer shadow-2xs"
                              title="Update stock level"
                            >
                              <Layers className="w-3.5 h-3.5 text-[#107C55]" />
                            </button>

                            {/* Archive or Restore */}
                            {isArchived ? (
                              <button
                                type="button"
                                onClick={() => handleRestore(p)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#107C55] hover:bg-[#0E6847] text-white transition-all cursor-pointer shadow-2xs"
                                title="Restore product to active catalog"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Restore</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setArchiveTargetProduct(p)}
                                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-700 hover:border-rose-300 transition-all cursor-pointer shadow-2xs"
                                title="Archive product safely"
                              >
                                <Archive className="w-3.5 h-3.5 text-amber-600" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Table Footer & Pagination ── */}
          {!loading && filteredProducts.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono bg-[#F4F7F5]">
              <div className="text-slate-500">
                Showing{' '}
                <span className="font-bold text-slate-800">
                  {(currentPage - 1) * pageSize + 1}
                </span>{' '}
                to{' '}
                <span className="font-bold text-slate-800">
                  {Math.min(currentPage * pageSize, filteredProducts.length)}
                </span>{' '}
                of <span className="font-bold text-slate-800">{filteredProducts.length}</span>{' '}
                products
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <span className="px-3 py-1 font-bold text-slate-800 bg-white border border-slate-200 rounded-lg shadow-2xs">
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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
              : `Product "${saved.name}" created and synchronized with inventory!`,
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
            message: `Stock for "${updated.name}" updated to ${updated.stock_quantity} units in inventory_db.`,
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
