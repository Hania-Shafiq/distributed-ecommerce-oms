/**
 * pages/ProductList/ProductList.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Editorial product catalog with balanced light-and-dark design:
 * - Premium dark hero banner with verified authenticity badges
 * - Floating elevated filter card with smart vector toggle & range inputs
 * - Refined category chips with solid emerald active pill
 * - High-definition visual product cards with stock pills and quick actions
 * All search, autocomplete, filter, and pagination logic remain 100% intact.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  X,
  SlidersHorizontal,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { getProducts, searchProducts, getProductSuggestions } from '../../api/productApi';
import { getAllInventory } from '../../api/inventoryApi';
import { useCart } from '../../context/CartContext';
import ProductCard from '../../components/ProductCard';
import Button from '../../components/Button';
import { formatError } from '../../utils/formatError';

// ── Skeleton Loader Matching 16:10 Card Layout ────────────────────────────────
function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
      {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
        <div
          key={n}
          className="bg-white dark:bg-[#111C18] rounded-2xl border border-emerald-950/[0.08] dark:border-white/10 p-4 flex flex-col gap-3 animate-pulse shadow-sm"
        >
          <div className="aspect-[16/10] bg-[#EAEFEA] dark:bg-[#1A2C26] rounded-xl" />
          <div className="h-4 bg-[#EAEFEA] dark:bg-[#1A2C26] rounded w-4/5 mt-1" />
          <div className="h-3 bg-[#EAEFEA] dark:bg-[#1A2C26] rounded w-1/3" />
          <div className="mt-auto pt-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between">
            <div className="h-6 bg-[#EAEFEA] dark:bg-[#1A2C26] rounded w-20" />
            <div className="h-8 bg-[#EAEFEA] dark:bg-[#1A2C26] rounded-lg w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Toast notification ────────────────────────────────────────────────────────
function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2800);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-[#0F1C18] text-white px-5 py-3.5 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.35)] border border-emerald-500/30 flex items-center gap-3 animate-fade-in backdrop-blur-md">
      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
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

export default function ProductList() {
  const [searchParams] = useSearchParams();
  const [products, setProducts]             = useState([]);
  const [categories, setCategories]         = useState(['All']);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [query, setQuery]                   = useState('');
  const [activeCategory, setActive]         = useState('All');
  const [sortBy, setSortBy]                 = useState('');
  const [minPrice, setMinPrice]             = useState('');
  const [maxPrice, setMaxPrice]             = useState('');
  const [inStockOnly, setInStockOnly]       = useState(false);
  const [toast, setToast]                   = useState(null);
  const [isSearching, setIsSearching]       = useState(false);
  const [smartSearch, setSmartSearch]       = useState(true);
  const [visibleCount, setVisibleCount]     = useState(24);

  // Autocomplete states
  const [suggestions, setSuggestions]               = useState([]);
  const [showSuggestions, setShowSuggestions]       = useState(false);
  const [activeSuggestionIndex, setActiveIndex]     = useState(-1);
  const searchContainerRef = useRef(null);
  const debounceRef        = useRef(null);
  const suggestDebounceRef = useRef(null);
  const { addToCart } = useCart();


  // Honor ?category= from homepage (and deep links)
  useEffect(() => {
    const cat = searchParams.get('category');
    if (cat) setActive(cat);
  }, [searchParams]);

  // Dismiss suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Populate categories once on mount
  useEffect(() => {
    getProducts(0, 1000).then(data => {
      const uniqueCats = ['All', ...new Set((data || []).map(p => p.category).filter(Boolean))];
      setCategories(uniqueCats);
    }).catch(() => {});
  }, []);

  // Fetch products using server-side query params
  const loadProducts = useCallback(async (searchQuery = query) => {
    setLoading(true);
    setError(null);
    try {
      const options = {
        mode: smartSearch ? 'hybrid' : 'lexical',
        category: activeCategory !== 'All' ? activeCategory : undefined,
        min_price: minPrice !== '' ? minPrice : undefined,
        max_price: maxPrice !== '' ? maxPrice : undefined,
        in_stock: inStockOnly ? true : undefined,
        sort: sortBy || undefined,
      };

      const [data, inventoryList] = await Promise.all([
        searchQuery.trim()
          ? searchProducts(searchQuery.trim(), options)
          : getProducts(0, 1000, activeCategory !== 'All' ? activeCategory : null, options),
        getAllInventory().catch(() => []),
      ]);

      const stockMap = {};
      for (const inv of (inventoryList || [])) {
        stockMap[inv.product_id] = inv.stock_quantity;
      }

      const merged = (data || []).map(p => ({
        ...p,
        stock_quantity: p.id in stockMap ? stockMap[p.id] : p.stock_quantity,
      }));

      setProducts(merged);
      setVisibleCount(24);
    } catch (err) {
      setError(formatError(err, 'Unable to load products. Please check your connection and try again.'));
    } finally {
      setLoading(false);
      setIsSearching(false);
    }
  }, [activeCategory, minPrice, maxPrice, inStockOnly, sortBy, query, smartSearch]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts, activeCategory, minPrice, maxPrice, inStockOnly, sortBy, smartSearch]);

  // Select a suggestion directly
  const selectSuggestion = useCallback(async (selectedName) => {
    setQuery(selectedName);
    setShowSuggestions(false);
    setSuggestions([]);
    setActiveIndex(-1);
    clearTimeout(debounceRef.current);
    clearTimeout(suggestDebounceRef.current);
    loadProducts(selectedName);
  }, [loadProducts]);

  // Debounced search with autocomplete typeahead
  const handleSearch = useCallback((value) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    clearTimeout(suggestDebounceRef.current);

    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      loadProducts('');
      return;
    }

    suggestDebounceRef.current = setTimeout(async () => {
      try {
        const items = await getProductSuggestions(value.trim());
        setSuggestions(items || []);
        setShowSuggestions((items || []).length > 0);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 200);

    debounceRef.current = setTimeout(() => {
      setIsSearching(true);
      loadProducts(value);
    }, 400);
  }, [loadProducts]);

  function handleClearSearch() {
    setQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
    loadProducts('');
  }

  // Keyboard navigation for suggestions
  function handleKeyDown(e) {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (activeSuggestionIndex >= 0 && suggestions[activeSuggestionIndex]) {
        e.preventDefault();
        selectSuggestion(suggestions[activeSuggestionIndex]);
      } else {
        setShowSuggestions(false);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setActiveIndex(-1);
    }
  }

  function handleResetFilters() {
    setMinPrice('');
    setMaxPrice('');
    setInStockOnly(false);
    setSortBy('');
    setActive('All');
    setQuery('');
  }

  function handleAddToCart(product) {
    addToCart(product);
    setToast(`Added "${product.name}" to cart`);
  }

  return (
    <div className="bg-[#F4F7F5] dark:bg-[#0B1411] min-h-screen">
      {/* ── Dark Hero Section: Catalog Explorer Header ── */}
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
                <span>01 / CATALOG EXPLORER</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-white tracking-tight leading-tight mb-2">
                Product Catalog
              </h1>
              <p className="text-emerald-100/75 font-mono text-xs sm:text-sm">
                {loading
                  ? 'Fetching catalog manifests...'
                  : `Showing ${products.length} ${products.length === 1 ? 'verified item' : 'verified items'}`}
              </p>
            </div>

            {/* Verified Badge Matching UI Reference */}
            <div className="flex items-center gap-3 bg-emerald-950/70 border border-emerald-500/30 px-4 py-2.5 rounded-xl text-emerald-200 font-mono text-xs shadow-xs backdrop-blur-sm self-start md:self-auto">
              <div className="w-6 h-6 rounded-md bg-emerald-900/80 flex items-center justify-center text-emerald-300">
                <ShieldCheck className="w-4 h-4 text-emerald-300" strokeWidth={2} />
              </div>
              <span className="font-medium">Verified • Authentic • Trusted</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Catalog Content (Floating Toolbar + Products) ── */}
      <div className="page-container -mt-8 relative z-20 pb-16">
        {/* ── Floating Unified Toolbar Card ── */}
        <div className="bg-white dark:bg-[#111C18] rounded-2xl border border-emerald-900/10 dark:border-white/10 shadow-[0_8px_30px_rgba(20,50,35,0.06)] p-4 sm:p-5 mb-6 space-y-4">
          {/* Row 1: Search Input & Smart Search Switch */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div ref={searchContainerRef} className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Search className="w-4 h-4 text-slate-400" />
              </span>
              <input
                type="text"
                placeholder="Search products by SKU, title, category, or features…"
                value={query}
                onChange={e => handleSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                className="w-full pl-10 pr-10 py-3 bg-[#F4F7F5] dark:bg-[#14231E] border border-slate-200/90 dark:border-white/10 rounded-xl text-slate-900 dark:text-[#E6EFEA] placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#10B981]/20 focus:border-[#10B981] transition-all text-sm font-normal"
              />

              {query && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 p-1 rounded-full transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {isSearching && (
                <span className="absolute right-9 top-1/2 -translate-y-1/2 pointer-events-none">
                  <div className="w-3.5 h-3.5 border-2 border-slate-300 dark:border-slate-600 border-t-[#10B981] rounded-full animate-spin" />
                </span>
              )}

              {/* Suggestions Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <ul
                  role="listbox"
                  className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-[#111C18] rounded-xl shadow-xl border border-emerald-950/10 dark:border-white/10 py-2 z-50 overflow-hidden animate-slide-down"
                >
                  {suggestions.map((suggestion, idx) => {
                    const isSelected = idx === activeSuggestionIndex;
                    return (
                      <li
                        key={suggestion}
                        role="option"
                        aria-selected={isSelected}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectSuggestion(suggestion);
                        }}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`px-4 py-2.5 flex items-center gap-2.5 cursor-pointer text-xs font-mono transition-colors ${
                          isSelected
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                        }`}
                      >
                        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{suggestion}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Smart Search Mode Toggle (Deep Emerald Pill Matching Mockup) */}
            <button
              type="button"
              onClick={() => setSmartSearch(prev => !prev)}
              className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-bold tracking-wider transition-all shrink-0 cursor-pointer select-none border shadow-xs ${
                smartSearch
                  ? 'bg-[#194D3F] hover:bg-[#143F34] text-white border-emerald-600/40'
                  : 'bg-white dark:bg-[#111C18] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
              }`}
              title={smartSearch ? "Hybrid vector + lexical search active" : "Standard lexical search active"}
              aria-pressed={smartSearch}
            >
              <Sparkles className={`w-4 h-4 ${smartSearch ? 'text-emerald-300' : 'text-slate-400'}`} />
              <span>SMART VECTOR</span>
              <span
                className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                  smartSearch ? 'bg-[#10B981] text-emerald-950' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {smartSearch ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>

          {/* Row 2: Secondary Filter Controls (Price, Stock, Sort) */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-3.5 border-t border-slate-100 dark:border-white/10">
            {/* Price Range & In Stock */}
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
              <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-400 tracking-wider">
                Price Filter:
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  placeholder="Min $"
                  value={minPrice}
                  onChange={e => setMinPrice(e.target.value)}
                  className="w-20 text-xs px-2.5 py-1.5 border border-slate-200 dark:border-white/10 rounded-lg bg-[#F4F7F5] dark:bg-[#14231E] text-slate-800 dark:text-[#E6EFEA] focus:outline-none focus:border-[#10B981] font-mono"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Max $"
                  value={maxPrice}
                  onChange={e => setMaxPrice(e.target.value)}
                  className="w-20 text-xs px-2.5 py-1.5 border border-slate-200 dark:border-white/10 rounded-lg bg-[#F4F7F5] dark:bg-[#14231E] text-slate-800 dark:text-[#E6EFEA] focus:outline-none focus:border-[#10B981] font-mono"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer ml-2 select-none">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={e => setInStockOnly(e.target.checked)}
                  className="rounded border-slate-300 dark:border-white/20 text-[#10B981] focus:ring-[#10B981]/20 w-4 h-4 cursor-pointer accent-[#10B981]"
                />
                <span className="font-medium text-slate-800 dark:text-[#E6EFEA]">In stock only</span>
              </label>

              {(minPrice !== '' || maxPrice !== '' || inStockOnly || sortBy !== '' || activeCategory !== 'All' || query) && (
                <button
                  onClick={handleResetFilters}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 font-medium ml-2 underline cursor-pointer"
                >
                  Reset filters
                </button>
              )}
            </div>

            {/* Sort By Dropdown */}
            <div className="flex items-center gap-2 font-mono text-xs">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Sort:
              </span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="text-xs font-semibold text-slate-800 dark:text-[#E6EFEA] bg-[#F4F7F5] dark:bg-[#14231E] border border-slate-200 dark:border-white/10 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#10B981] cursor-pointer"
              >
                <option value="">Featured</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="rating_desc">Highest Rated</option>
                <option value="newest">Newest Arrivals</option>
                <option value="name">Product Name (A-Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Category Filter Pills with Rounded-Full Design ── */}
        {!loading && categories.length > 1 && (
          <div className="flex items-center gap-2.5 overflow-x-auto pb-3 mb-8 no-scrollbar">
            {categories.map(cat => {
              const isSelected = activeCategory.toLowerCase() === cat.toLowerCase();
              return (
                <button
                  key={cat}
                  onClick={() => setActive(cat)}
                  className={`px-4 py-2 rounded-full text-xs font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer select-none whitespace-nowrap shadow-xs ${
                    isSelected
                      ? 'bg-[#1B5E43] text-white font-bold border border-[#164D37] shadow-xs'
                      : 'bg-white dark:bg-[#111C18] border border-slate-200/90 dark:border-white/10 text-slate-700 dark:text-slate-300 font-medium hover:bg-emerald-50/50 dark:hover:bg-emerald-950/40 hover:border-emerald-500/30 hover:text-emerald-800 dark:hover:text-emerald-300'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Catalog States: Loading / Error / Empty / Grid ── */}
        {loading ? (
          <ProductGridSkeleton />
        ) : error ? (
          <div className="bg-white dark:bg-[#111C18] rounded-2xl border border-emerald-950/10 dark:border-white/10 p-12 text-center max-w-lg mx-auto shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 dark:text-rose-400 flex items-center justify-center mx-auto mb-4 border border-rose-200 dark:border-rose-900/40">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-[#E6EFEA] mb-1">Catalog Notice</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-6 leading-relaxed font-mono">{error}</p>
            <Button onClick={() => loadProducts()} className="gap-2 mx-auto">
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Try Again</span>
            </Button>
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white dark:bg-[#111C18] rounded-2xl border border-emerald-950/10 dark:border-white/10 p-14 text-center max-w-lg mx-auto shadow-sm">
            <div className="w-24 h-24 mx-auto mb-6 text-slate-400">
              <svg viewBox="0 0 96 96" fill="none" stroke="currentColor" className="w-full h-full">
                <polygon points="48,8 84,28 84,68 48,88 12,68 12,28" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
                <rect x="28" y="34" width="40" height="34" rx="4" strokeWidth="1.5" stroke="#10B981" fill="#E6F4EA" className="dark:fill-[#14231E]" fillOpacity="0.4" />
                <path d="M28 44H68" stroke="#10B981" strokeWidth="1.25" opacity="0.6" />
                <circle cx="56" cy="40" r="12" strokeWidth="1.75" stroke="#0F1C18" fill="#FFFFFF" className="dark:stroke-[#E6EFEA] dark:fill-[#111C18]" />
                <path d="M65 49L75 59" strokeWidth="2" stroke="#0F1C18" className="dark:stroke-[#E6EFEA]" strokeLinecap="round" />
                <path d="M52 40H60" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-[#E6EFEA] tracking-tight mb-1 font-mono uppercase">
              No Matching Products Found
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs max-w-sm mx-auto mb-6 leading-relaxed">
              {query
                ? `We searched our active inventory but found zero SKUs matching "${query}".`
                : `No inventory records matched your selected category and price constraints.`}
            </p>
            <Button
              variant="secondary"
              onClick={handleResetFilters}
              className="text-xs px-5 py-2 font-mono"
            >
              Clear Filters & Search
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
              {products.slice(0, visibleCount).map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={handleAddToCart}
                />
              ))}
            </div>

            {visibleCount < products.length && (
              <div className="flex justify-center mt-12">
                <Button
                  variant="secondary"
                  onClick={() => setVisibleCount(prev => prev + 24)}
                  className="gap-2 px-8 py-3 font-mono text-xs uppercase tracking-wider shadow-sm hover:shadow-md"
                >
                  <span>Load More Products</span>
                  <span className="text-slate-400 font-normal">
                    ({products.length - visibleCount} remaining)
                  </span>
                </Button>
              </div>
            )}
          </>
        )}
      </div>



      {/* ── Toast ── */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
