/**
 * pages/AdminProducts/AdminProducts.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dedicated Administrative Product Management Page.
 * Exclusively accessible to administrators via /admin/products.
 * Matches the OMS//STORE Catalog editorial light-and-dark aesthetic:
 * - Dark forest-green hero section with live inventory telemetry indicator
 * - 4 real-time KPI summary cards (Total, Active, Archived, Low Stock)
 * - Elevated floating toolbar with search, status filters, category, price, and sort
 * - Responsive enterprise product table with inline stock update, edit, archive & restore
 * - Modals for Add/Edit Product and Authoritative Stock Calibration
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
  ArrowUpDown,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
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

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, ACTIVE, ARCHIVED, IN_STOCK, LOW_STOCK, OUT_OF_STOCK
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState('id_desc');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modals
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockTargetProduct, setStockTargetProduct] = useState(null);

  // Fetch all products (including archived) and live inventory records
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

  // Derived KPI metrics
  const totalCount = products.length;
  const activeCount = useMemo(() => products.filter((p) => !p.is_archived).length, [products]);
  const archivedCount = useMemo(() => products.filter((p) => p.is_archived).length, [products]);
  const lowStockCount = useMemo(
    () => products.filter((p) => !p.is_archived && Number(p.stock_quantity || 0) <= 5).length,
    [products]
  );

  // Unique categories
  const categories = useMemo(() => {
    return ['All', ...new Set(products.map((p) => p.category).filter(Boolean))];
  }, [products]);

  // Client-side filtering & sorting
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // Search query filter (matches name, SKU, id, category, description)
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

    // Category filter
    if (selectedCategory && selectedCategory !== 'All') {
      result = result.filter(
        (p) => (p.category || '').toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    // Status filter
    if (statusFilter === 'ACTIVE') {
      result = result.filter((p) => !p.is_archived);
    } else if (statusFilter === 'ARCHIVED') {
      result = result.filter((p) => p.is_archived);
    } else if (statusFilter === 'IN_STOCK') {
      result = result.filter((p) => !p.is_archived && Number(p.stock_quantity || 0) > 0);
    } else if (statusFilter === 'LOW_STOCK') {
      result = result.filter(
        (p) => !p.is_archived && Number(p.stock_quantity || 0) <= 5 && Number(p.stock_quantity || 0) > 0
      );
    } else if (statusFilter === 'OUT_OF_STOCK') {
      result = result.filter((p) => !p.is_archived && Number(p.stock_quantity || 0) === 0);
    }

    // Price filters
    if (minPrice !== '') {
      const min = parseFloat(minPrice);
      if (!isNaN(min)) result = result.filter((p) => Number(p.price || 0) >= min);
    }
    if (maxPrice !== '') {
      const max = parseFloat(maxPrice);
      if (!isNaN(max)) result = result.filter((p) => Number(p.price || 0) <= max);
    }

    // Sorting
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
  }, [products, searchQuery, selectedCategory, statusFilter, minPrice, maxPrice, sortBy]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredProducts.length / pageSize) || 1;
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, statusFilter, minPrice, maxPrice, sortBy, pageSize]);

  function handleResetFilters() {
    setSearchQuery('');
    setSelectedCategory('All');
    setStatusFilter('ALL');
    setMinPrice('');
    setMaxPrice('');
    setSortBy('id_desc');
    setCurrentPage(1);
  }

  // Archive operation
  async function handleArchive(product) {
    if (
      !window.confirm(
        `Are you sure you want to archive "${product.name}" (#PROD-${product.id})?\n\nIt will be hidden from customer catalogs and order checkout while preserving all historical order logs.`
      )
    ) {
      return;
    }

    try {
      await deleteProduct(product.id);
      setToast({
        message: `Product "${product.name}" (#PROD-${product.id}) archived safely.`,
        type: 'success',
      });
      fetchAllData();
    } catch (err) {
      setToast({
        message: formatError(err, 'Failed to archive product.'),
        type: 'error',
      });
    }
  }

  // Restore operation
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
        {/* Subtle background glow and blueprint dots */}
        <div className="absolute inset-0 bg-blueprint-dots opacity-20 pointer-events-none" aria-hidden="true" />
        <div
          className="absolute -top-24 right-1/4 w-120 h-120 rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none"
          aria-hidden="true"
        />

        <div className="page-container relative z-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 text-[#489B97] font-mono text-xs font-semibold uppercase tracking-wider mb-2">
                <span className="w-2 h-2 rounded-full bg-[#10B981] stock-dot-live" />
                <span>06 / CATALOG & INVENTORY ORCHESTRATION</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-white tracking-tight leading-tight mb-2">
                Product Management
              </h1>
              <p className="text-emerald-100/75 font-mono text-xs sm:text-sm">
                Manage products, pricing, availability, and authoritative stock synchronization.
              </p>
            </div>

            {/* Header Right Actions & Telemetry Indicator */}
            <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
              {/* Telemetry Status Badge */}
              <div className="flex items-center gap-2.5 bg-emerald-950/70 border border-emerald-500/30 px-3.5 py-2.5 rounded-xl text-emerald-200 font-mono text-xs shadow-xs backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 stock-dot-live" />
                <span className="font-medium">inventory_db Synchronized</span>
              </div>

              {/* Add Product Primary Action */}
              <button
                type="button"
                onClick={() => {
                  setEditingProduct(null);
                  setProductModalOpen(true);
                }}
                className="inline-flex items-center gap-2 bg-[#10B981] hover:bg-[#0EA271] text-emerald-950 font-mono text-xs font-bold px-4.5 py-2.5 rounded-xl shadow-md transition-all cursor-pointer hover:-translate-y-0.5 active:translate-y-0 select-none"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>+ Add Product</span>
              </button>

              {/* Refresh Telemetry */}
              <button
                type="button"
                onClick={fetchAllData}
                disabled={loading}
                className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white font-mono text-xs font-semibold px-3 py-2.5 rounded-xl transition-all cursor-pointer"
                title="Refresh product manifests"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Dashboard Content ── */}
      <div className="page-container -mt-8 relative z-20 pb-16 space-y-6">
        {/* ── Summary KPI Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Products */}
          <div className="bg-white rounded-2xl border border-emerald-900/10 shadow-[0_4px_20px_rgba(20,50,35,0.04)] p-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-semibold mb-1">
                Total Products
              </p>
              <h3 className="text-2xl font-mono font-bold text-slate-900">
                {loading ? '—' : totalCount.toLocaleString()}
              </h3>
              <p className="text-[11px] font-mono text-slate-400 mt-1">
                PostgreSQL products_db & ES
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center shrink-0">
              <Package className="w-6 h-6 text-slate-700" />
            </div>
          </div>

          {/* Card 2: Active Products */}
          <div className="bg-white rounded-2xl border border-emerald-900/10 shadow-[0_4px_20px_rgba(20,50,35,0.04)] p-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-emerald-700 font-semibold mb-1">
                Active Catalog
              </p>
              <h3 className="text-2xl font-mono font-bold text-emerald-800">
                {loading ? '—' : activeCount.toLocaleString()}
              </h3>
              <p className="text-[11px] font-mono text-emerald-600 mt-1">
                Visible to customers & checkout
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6 text-[#107C55]" />
            </div>
          </div>

          {/* Card 3: Archived Products */}
          <div className="bg-white rounded-2xl border border-emerald-900/10 shadow-[0_4px_20px_rgba(20,50,35,0.04)] p-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-rose-700 font-semibold mb-1">
                Archived Products
              </p>
              <h3 className="text-2xl font-mono font-bold text-rose-800">
                {loading ? '—' : archivedCount.toLocaleString()}
              </h3>
              <p className="text-[11px] font-mono text-rose-600 mt-1">
                Safe soft-deletion • Restorable
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0">
              <Archive className="w-6 h-6 text-rose-600" />
            </div>
          </div>

          {/* Card 4: Low-Stock Products */}
          <div className="bg-white rounded-2xl border border-emerald-900/10 shadow-[0_4px_20px_rgba(20,50,35,0.04)] p-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-amber-700 font-semibold mb-1">
                Low-Stock Alerts
              </p>
              <h3 className="text-2xl font-mono font-bold text-amber-800">
                {loading ? '—' : lowStockCount.toLocaleString()}
              </h3>
              <p className="text-[11px] font-mono text-amber-600 mt-1">
                Units ≤ 5 in inventory_db
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>

        {/* ── Floating Unified Toolbar Card (Search, Filters, Sort) ── */}
        <div className="bg-white rounded-2xl border border-emerald-900/10 shadow-[0_8px_30px_rgba(20,50,35,0.06)] p-4 sm:p-5 space-y-4">
          {/* Row 1: Search Input & Status Filter Pills */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Search className="w-4 h-4 text-slate-400" />
              </span>
              <input
                type="text"
                placeholder="Search products by ID, SKU (#PROD-...), name, category, or description…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-[#F4F7F5] border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#10B981]/20 focus:border-[#10B981] transition-all text-sm font-normal"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-800 p-1 rounded-full transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter Dropdown / Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {[
                { id: 'ALL', label: 'All Manifests' },
                { id: 'ACTIVE', label: 'Active Only' },
                { id: 'ARCHIVED', label: 'Archived Only' },
                { id: 'IN_STOCK', label: 'In Stock' },
                { id: 'LOW_STOCK', label: 'Low Stock (≤5)' },
                { id: 'OUT_OF_STOCK', label: 'Out of Stock' },
              ].map((pill) => {
                const isActive = statusFilter === pill.id;
                return (
                  <button
                    key={pill.id}
                    onClick={() => setStatusFilter(pill.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold tracking-wider transition-all whitespace-nowrap cursor-pointer select-none border ${
                      isActive
                        ? pill.id === 'ARCHIVED'
                          ? 'bg-rose-900 text-white border-rose-800 shadow-xs'
                          : pill.id === 'LOW_STOCK'
                          ? 'bg-amber-600 text-white border-amber-500 shadow-xs'
                          : 'bg-[#194D3F] text-white border-emerald-600/40 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-[#F4F7F5]'
                    }`}
                  >
                    {pill.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 2: Secondary Filter Controls (Category, Price, Sort, Reset) */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-3.5 border-t border-slate-100">
            {/* Category Select & Price Range */}
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
              {/* Category */}
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
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Price Range */}
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

              {/* Reset Filters */}
              {(searchQuery ||
                selectedCategory !== 'All' ||
                statusFilter !== 'ALL' ||
                minPrice !== '' ||
                maxPrice !== '' ||
                sortBy !== 'id_desc') && (
                <button
                  onClick={handleResetFilters}
                  className="text-xs text-rose-600 hover:text-rose-800 font-medium underline cursor-pointer"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Sort & Page Size */}
            <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
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
                  <option value="id_asc">ID: Low to High</option>
                  <option value="name_asc">Name (A-Z)</option>
                  <option value="name_desc">Name (Z-A)</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                  <option value="stock_asc">Stock: Low to High</option>
                  <option value="stock_desc">Stock: High to Low</option>
                  <option value="newest">Created Date</option>
                </select>
              </div>

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

        {/* ── Product Table Card ── */}
        <div className="bg-white rounded-2xl border border-emerald-900/10 shadow-[0_8px_30px_rgba(20,50,35,0.04)] overflow-hidden">
          {/* Table Header Action Bar */}
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#F4F7F5]">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-[#107C55]" />
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                Products Manifest Ledger
              </span>
              <span className="text-xs font-mono text-slate-400">
                ({filteredProducts.length} {filteredProducts.length === 1 ? 'record' : 'records'})
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-500">
              Authoritative stock source: PostgreSQL <span className="font-bold text-slate-700">inventory_db</span>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center font-mono">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-500">Loading catalog and inventory manifests...</p>
            </div>
          ) : error ? (
            <div className="p-10 text-center font-mono max-w-md mx-auto">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-3 border border-rose-200">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <p className="text-xs text-slate-700 font-semibold mb-2">{error}</p>
              <Button size="sm" onClick={fetchAllData} className="mx-auto">
                Try Again
              </Button>
            </div>
          ) : paginatedProducts.length === 0 ? (
            <div className="p-12 text-center font-mono max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <Package className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-1">No Matching Products</h4>
              <p className="text-xs text-slate-500 mb-4">
                No products match the selected filters or search criteria.
              </p>
              <Button variant="secondary" size="sm" onClick={handleResetFilters} className="mx-auto">
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-mono uppercase tracking-wider text-slate-500">
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
                        className={`transition-colors hover:bg-emerald-50/30 ${
                          isArchived ? 'bg-rose-50/20 text-slate-500' : 'text-slate-800'
                        }`}
                      >
                        {/* Product Info (Thumbnail + Name + Description) */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 relative group">
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
                                className="font-bold text-slate-900 hover:text-emerald-700 transition-colors truncate block text-sm"
                                title={p.name}
                              >
                                {p.name}
                              </Link>
                              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                {p.description || 'No description provided.'}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* SKU / ID */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold border border-slate-200 text-[11px]">
                            #PROD-{p.id}
                          </span>
                        </td>

                        {/* Category */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-medium text-[11px]">
                            {p.category || 'General'}
                          </span>
                        </td>

                        {/* Price */}
                        <td className="py-3 px-4 text-right font-bold text-slate-900 text-sm whitespace-nowrap tabular-nums">
                          ${formattedPrice}
                        </td>

                        {/* Available Stock with Quick Edit Button */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                                stock > 5
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : stock > 0
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-rose-50 text-rose-800 border-rose-200'
                              }`}
                            >
                              {stock} units
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setStockTargetProduct(p);
                                setStockModalOpen(true);
                              }}
                              className="p-1 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                              title="Update stock level"
                            >
                              <Layers className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {isArchived ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-rose-100 text-rose-800 border border-rose-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              Archived
                            </span>
                          ) : stock === 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              Out of Stock
                            </span>
                          ) : stock <= 5 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-800 border border-amber-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              Low Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 stock-dot-live" />
                              Active
                            </span>
                          )}
                        </td>

                        {/* Created Date */}
                        <td className="py-3 px-4 whitespace-nowrap text-slate-400 text-[11px]">
                          {createdDate}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {/* Edit Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingProduct(p);
                                setProductModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-emerald-700 hover:border-emerald-300 transition-all cursor-pointer shadow-2xs"
                              title="Edit product"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            {/* Calibrate Stock Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setStockTargetProduct(p);
                                setStockModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 hover:border-emerald-300 transition-all cursor-pointer shadow-2xs"
                              title="Calibrate stock in inventory_db"
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
                                onClick={() => handleArchive(p)}
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

          {/* ── Table Footer / Pagination ── */}
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
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <span className="px-3 py-1 font-bold text-slate-700">
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
