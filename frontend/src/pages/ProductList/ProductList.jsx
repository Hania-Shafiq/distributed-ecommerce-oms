/**
 * pages/ProductList/ProductList.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Editorial product catalog with unified toolbar, clean category pills,
 * 4/3/2/1 responsive grid, and custom line illustrations for empty states.
 * All API calls, search endpoints, filters, and state logic remain 100% identical.
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
} from 'lucide-react';
import { getProducts, searchProducts, getProductSuggestions } from '../../api/productApi';
import { getAllInventory } from '../../api/inventoryApi';
import { useCart } from '../../context/CartContext';
import ProductCard from '../../components/ProductCard';
import Button from '../../components/Button';
import { formatError } from '../../utils/formatError';

// ── Skeleton Loader Matching 4:3 Card Layout ──────────────────────────────────
function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
        <div
          key={n}
          className="bg-white rounded-xl border border-[#231C28]/[0.08] p-4 flex flex-col gap-3 animate-pulse"
        >
          <div className="aspect-[4/3] bg-[#F1F4EE] rounded-lg" />
          <div className="flex justify-between items-center mt-1">
            <div className="h-3.5 bg-[#F1F4EE] rounded w-1/4" />
            <div className="h-3.5 bg-[#F1F4EE] rounded w-1/6" />
          </div>
          <div className="h-4 bg-[#F1F4EE] rounded w-4/5" />
          <div className="h-3 bg-[#F1F4EE] rounded w-2/3" />
          <div className="mt-auto pt-3 border-t border-[#231C28]/[0.06] flex items-center justify-between">
            <div className="h-5 bg-[#F1F4EE] rounded w-16" />
            <div className="h-8 bg-[#F1F4EE] rounded-md w-20" />
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
    <div className="fixed bottom-6 right-6 z-50 bg-[#231C28] text-white px-5 py-3.5 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.3)] border border-white/10 flex items-center gap-3 animate-fade-in backdrop-blur-md">
      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
      <span className="text-xs font-mono font-medium">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 text-white/50 hover:text-white transition-colors"
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
          : getProducts(0, 100, activeCategory !== 'All' ? activeCategory : null, options),
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
    <div className="page-container py-10 sm:py-12">
      {/* ── Page Header with Mono Eyebrow ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="section-eyebrow mb-1">
            <span>01 / CATALOG EXPLORER</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#1A161F] tracking-tight">
            Product Catalog
          </h1>
          <p className="text-slate-500 text-sm mt-1 font-normal font-mono">
            {loading ? 'Fetching catalog manifests...' : `Showing ${products.length} ${products.length === 1 ? 'verified item' : 'verified items'}`}
          </p>
        </div>
      </div>

      {/* ── Unified Cohesive Toolbar (Search + Smart Search + Filters + Sort) ── */}
      <div className="bg-white rounded-xl border border-[#231C28]/[0.08] shadow-[0_2px_12px_rgba(26,22,31,0.04)] p-4 sm:p-5 mb-8 space-y-4">
        {/* Row 1: Search Input & Smart Search Switch */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div ref={searchContainerRef} className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search products by SKU, title, category, or features…"
              value={query}
              onChange={e => handleSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              className="w-full pl-10 pr-10 py-2.5 bg-[#F7F8F6] border border-[#231C28]/[0.1] rounded-lg text-[#1A161F] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3D8361]/25 focus:border-[#3D8361] transition-all text-sm font-normal"
            />

            {query && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#1A161F] p-1 rounded-full transition-colors"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {isSearching && (
              <span className="absolute right-9 top-1/2 -translate-y-1/2 pointer-events-none">
                <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-[#3D8361] rounded-full animate-spin" />
              </span>
            )}

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <ul
                role="listbox"
                className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-[#231C28]/[0.08] py-2 z-50 overflow-hidden animate-slide-down"
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
                      className={`px-4 py-2 flex items-center gap-2.5 cursor-pointer text-xs font-mono transition-colors ${
                        isSelected
                          ? 'bg-[#EBF4EF] text-[#2D6349] font-semibold'
                          : 'text-[#1A161F] hover:bg-slate-50'
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

          {/* Smart Search Mode Toggle */}
          <button
            type="button"
            onClick={() => setSmartSearch(prev => !prev)}
            className={`inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-mono font-medium transition-all shrink-0 border cursor-pointer select-none ${
              smartSearch
                ? 'bg-[#EBF4EF] text-[#2D6349] border-[#3D8361]/30 shadow-xs'
                : 'bg-white text-slate-500 border-[#231C28]/[0.1] hover:bg-slate-50'
            }`}
            title={smartSearch ? "Hybrid vector + lexical search active" : "Standard lexical search active"}
            aria-pressed={smartSearch}
          >
            <Sparkles className={`w-3.5 h-3.5 ${smartSearch ? 'text-[#3D8361]' : 'text-slate-400'}`} />
            <span>SMART VECTOR</span>
            <span
              className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded ${
                smartSearch ? 'bg-[#3D8361] text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {smartSearch ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>

        {/* Row 2: Secondary Filter Controls (Price, Stock, Sort) */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-[#231C28]/[0.06]">
          {/* Price Range & In Stock */}
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Price Filter:
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                placeholder="Min $"
                value={minPrice}
                onChange={e => setMinPrice(e.target.value)}
                className="w-18 text-xs px-2.5 py-1.5 border border-[#231C28]/[0.1] rounded-md bg-[#F7F8F6] text-[#1A161F] focus:outline-none focus:border-[#3D8361]"
              />
              <span className="text-slate-400">-</span>
              <input
                type="number"
                min="0"
                placeholder="Max $"
                value={maxPrice}
                onChange={e => setMaxPrice(e.target.value)}
                className="w-18 text-xs px-2.5 py-1.5 border border-[#231C28]/[0.1] rounded-md bg-[#F7F8F6] text-[#1A161F] focus:outline-none focus:border-[#3D8361]"
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-[#1A161F] cursor-pointer ml-2 select-none">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={e => setInStockOnly(e.target.checked)}
                className="rounded border-slate-300 text-[#3D8361] focus:ring-[#3D8361]/20 w-3.5 h-3.5 cursor-pointer"
              />
              <span>In stock only</span>
            </label>

            {(minPrice !== '' || maxPrice !== '' || inStockOnly || sortBy !== '' || activeCategory !== 'All' || query) && (
              <button
                onClick={handleResetFilters}
                className="text-xs text-rose-600 hover:text-rose-800 font-medium ml-2 underline cursor-pointer"
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
              className="text-xs font-medium text-[#1A161F] bg-[#F7F8F6] border border-[#231C28]/[0.1] rounded-md px-3 py-1.5 focus:outline-none focus:border-[#3D8361] cursor-pointer"
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

      {/* ── Category Filter Pills with Clear Selected State ── */}
      {!loading && categories.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-8 no-scrollbar">
          {categories.map(cat => {
            const isSelected = activeCategory.toLowerCase() === cat.toLowerCase();
            return (
              <button
                key={cat}
                onClick={() => setActive(cat)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer select-none whitespace-nowrap ${
                  isSelected
                    ? 'bg-[#3D8361] text-white border border-[#2D6349] font-semibold shadow-xs'
                    : 'bg-white border border-[#231C28]/[0.08] text-slate-600 hover:bg-[#F1F4EE] hover:text-[#1A161F]'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Catalog States: Loading / Error / Custom Line Illustration Empty State / Grid ── */}
      {loading ? (
        <ProductGridSkeleton />
      ) : error ? (
        <div className="bg-white rounded-xl border border-[#231C28]/[0.08] p-12 text-center max-w-lg mx-auto shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4 border border-rose-200">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-[#1A161F] mb-1">Catalog Query Notice</h2>
          <p className="text-slate-500 text-xs mb-6 leading-relaxed font-mono">{error}</p>
          <Button onClick={() => loadProducts()} className="gap-2 mx-auto">
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </Button>
        </div>
      ) : products.length === 0 ? (
        /* Custom Line Illustration Empty State (Human Designer Crafted) */
        <div className="bg-white rounded-2xl border border-[#231C28]/[0.08] p-14 text-center max-w-lg mx-auto shadow-sm">
          {/* Architectural Line Illustration */}
          <div className="w-24 h-24 mx-auto mb-6 text-slate-400">
            <svg viewBox="0 0 96 96" fill="none" stroke="currentColor" className="w-full h-full">
              {/* Outer dashed hex frame */}
              <polygon points="48,8 84,28 84,68 48,88 12,68 12,28" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
              {/* Empty catalog box */}
              <rect x="28" y="34" width="40" height="34" rx="4" strokeWidth="1.5" stroke="#3D8361" fill="#EBF4EF" fillOpacity="0.4" />
              <path d="M28 44H68" stroke="#3D8361" strokeWidth="1.25" opacity="0.6" />
              {/* Magnifying search lens over box */}
              <circle cx="56" cy="40" r="12" strokeWidth="1.75" stroke="#1A161F" fill="#FFFFFF" />
              <path d="M65 49L75 59" strokeWidth="2" stroke="#1A161F" strokeLinecap="round" />
              <path d="M52 40H60" stroke="#B8956C" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-[#1A161F] tracking-tight mb-1 font-mono uppercase">
            No Matching Products Found
          </h2>
          <p className="text-slate-500 text-xs max-w-sm mx-auto mb-6 leading-relaxed">
            {query
              ? `We searched our active inventory but found zero SKUs matching "${query}".`
              : `No inventory records matched your selected category and price constraints.`}
          </p>
          <Button
            variant="secondary"
            onClick={handleResetFilters}
            className="text-xs px-5 py-2"
          >
            Clear Filters & Search
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={handleAddToCart}
            />
          ))}
        </div>
      )}

      {/* ── Toast ── */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
