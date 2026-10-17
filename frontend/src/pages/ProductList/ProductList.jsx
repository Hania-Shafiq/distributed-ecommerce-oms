/**
 * pages/ProductList/ProductList.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Main product browsing page.
 * Features:
 *   • Loads all products on mount via getProducts() & getAllInventory()
 *   • Live search: debounced Elasticsearch search with typeahead suggestions
 *   • Category filter chips (client-side)
 *   • Client-side sorting (Price, Name)
 *   • "Add to Cart" via CartContext
 *   • Polished skeleton loaders & friendly user messages
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  X,
  SlidersHorizontal,
  CheckCircle2,
  PackageSearch,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { getProducts, searchProducts, getProductSuggestions } from '../../api/productApi';
import { getAllInventory } from '../../api/inventoryApi';
import { useCart } from '../../context/CartContext';
import ProductCard from '../../components/ProductCard';
import Button from '../../components/Button';
import { formatError } from '../../utils/formatError';

// ── Skeleton Loader Grid ──────────────────────────────────────────────────────
function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
        <div
          key={n}
          className="elevation-card bg-white rounded-lg border border-granite/10 p-4 flex flex-col gap-3 animate-pulse"
        >
          <div className="h-44 bg-gray-200 rounded-md" />
          <div className="h-4 bg-gray-200 rounded w-1/4" />
          <div className="h-5 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
          <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between">
            <div className="h-6 bg-gray-200 rounded w-16" />
            <div className="h-8 bg-gray-200 rounded-lg w-20" />
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
    <div className="fixed bottom-6 right-6 z-50 bg-granite text-white px-5 py-3.5 rounded-lg shadow-2xl border border-white/10 flex items-center gap-3 animate-fade-in backdrop-blur-md">
      <CheckCircle2 className="w-5 h-5 text-dry-sage shrink-0" />
      <span className="text-sm font-medium">{message}</span>
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
  }, [activeCategory, minPrice, maxPrice, inStockOnly, sortBy, query]);

  useEffect(() => {
    loadProducts();
  }, [activeCategory, minPrice, maxPrice, inStockOnly, sortBy]);

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-charcoal tracking-tight">Product catalog</h1>
          <p className="text-slate-500 text-sm mt-1 font-normal">
            {loading ? 'Fetching available catalog...' : `${products.length} ${products.length === 1 ? 'product' : 'products'} available`}
          </p>
        </div>
      </div>

      {/* ── Search Bar with Typeahead ── */}
      <div ref={searchContainerRef} className="relative mb-6">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <Search className="w-5 h-5" />
        </span>
        <input
          type="text"
          placeholder="Search products by title, category, or features…"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
          className="w-full pl-12 pr-12 py-3 bg-white border border-granite/12 rounded-md text-charcoal placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sea-green/20 focus:border-sea-green ui-transition text-sm font-normal"
        />

        {query && (
          <button
            onClick={handleClearSearch}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-granite p-1 rounded-full transition-colors"
            title="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {isSearching && (
          <span className="absolute right-10 top-1/2 -translate-y-1/2 pointer-events-none">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-sea-green rounded-full animate-spin" />
          </span>
        )}

        {/* Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <ul
            role="listbox"
            className="absolute left-0 right-0 top-full mt-2 bg-white rounded-lg shadow-xl border border-gray-100 py-2 z-50 overflow-hidden animate-slide-down"
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
                  className={`px-4 py-2.5 flex items-center gap-3 cursor-pointer text-sm transition-colors ${
                    isSelected
                      ? 'bg-sea-green/10 text-sea-green font-semibold'
                      : 'text-granite hover:bg-gray-50'
                  }`}
                >
                  <Search className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="truncate">{suggestion}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Filters & Sorting Controls Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-white p-3.5 rounded-lg border border-granite/10 shadow-2xs">
        {/* Min / Max Price & In Stock Filter */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-gray-500 uppercase">Filters:</span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="0"
              placeholder="Min $"
              value={minPrice}
              onChange={e => setMinPrice(e.target.value)}
              className="w-20 text-xs px-2.5 py-1.5 border border-gray-200 rounded-md bg-white text-charcoal focus:outline-none focus:border-sea-green"
            />
            <span className="text-gray-400 text-xs">-</span>
            <input
              type="number"
              min="0"
              placeholder="Max $"
              value={maxPrice}
              onChange={e => setMaxPrice(e.target.value)}
              className="w-20 text-xs px-2.5 py-1.5 border border-gray-200 rounded-md bg-white text-charcoal focus:outline-none focus:border-sea-green"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-charcoal cursor-pointer ml-1 select-none">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={e => setInStockOnly(e.target.checked)}
              className="rounded border-gray-300 text-sea-green focus:ring-sea-green/20 w-4 h-4 cursor-pointer"
            />
            <span>In stock only</span>
          </label>

          {(minPrice !== '' || maxPrice !== '' || inStockOnly || sortBy !== '' || activeCategory !== 'All' || query) && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-rose-500 hover:text-rose-700 font-medium ml-2 underline cursor-pointer"
            >
              Reset filters
            </button>
          )}
        </div>

        {/* Server-side Sorting Dropdown */}
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-semibold text-gray-500 uppercase">Sort by:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="text-xs font-semibold text-granite bg-white border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:border-sea-green cursor-pointer shadow-2xs"
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

      {/* ── Category Filter Chips ── */}
      {!loading && categories.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-8 no-scrollbar">
          {categories.map(cat => {
            const isSelected = activeCategory.toLowerCase() === cat.toLowerCase();
            return (
              <button
                key={cat}
                onClick={() => setActive(cat)}
                className={`px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap ui-transition cursor-pointer ${
                  isSelected
                    ? 'bg-sea-green text-white shadow-sm'
                    : 'bg-white border border-granite/12 text-slate-600 hover:bg-sage-mist hover:text-charcoal'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {/* ── States: Loading / Error / Empty / Grid ── */}
      {loading ? (
        <ProductGridSkeleton />
      ) : error ? (
        <div className="bg-white rounded-lg border border-gray-200/80 p-12 text-center max-w-lg mx-auto shadow-xs">
          <div className="w-14 h-14 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-granite mb-2">Notice</h2>
          <p className="text-gray-500 text-sm mb-6 leading-relaxed">{error}</p>
          <Button onClick={() => loadProducts()} className="gap-2 mx-auto">
            <RotateCcw className="w-4 h-4" />
            <span>Try Again</span>
          </Button>
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200/80 p-12 text-center max-w-md mx-auto shadow-xs">
          <div className="w-16 h-16 rounded-lg bg-gray-50 text-gray-400 flex items-center justify-center mx-auto mb-4">
            <PackageSearch className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-granite mb-1">No products found</h2>
          <p className="text-gray-500 text-sm mb-6">
            {query
              ? `We couldn't find any results matching "${query}".`
              : `No items matched the active filters.`}
          </p>
          <Button
            variant="secondary"
            onClick={handleResetFilters}
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
