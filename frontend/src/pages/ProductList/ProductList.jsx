/**
 * pages/ProductList/ProductList.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Main product browsing page. Features:
 *   • Loads all products on mount via getProducts() from productApi
 *   • Live search: debounced input hits searchProducts() (Elasticsearch)
 *   • Category filter chips (client-side, no extra API call)
 *   • "Add to Cart" via CartContext (no backend call at this stage)
 *   • Toast notification on add-to-cart
 *
 * DATA FLOW:
 *   productApi.getProducts() → state.products → ProductCard grid
 *   search input → productApi.searchProducts() → state.products (replaced)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getProducts, searchProducts, getProductSuggestions } from '../../api/productApi';
import { getAllInventory } from '../../api/inventoryApi';
import { useCart } from '../../context/CartContext';
import ProductCard from '../../components/ProductCard';
import Button from '../../components/Button';

// ── Spinner helper ────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex justify-center items-center py-24">
      <div className="w-12 h-12 border-4 border-ash-grey border-t-sea-green rounded-full animate-spin" />
    </div>
  );
}

// ── Toast notification ────────────────────────────────────────────────────────
function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-granite text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 animate-bounce-in">
      <span className="text-sea-green text-lg">✓</span>
      {message}
    </div>
  );
}

export default function ProductList() {
  const [products, setProducts]       = useState([]);
  const [categories, setCategories]   = useState(['All']);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [query, setQuery]             = useState('');
  const [activeCategory, setActive]   = useState('All');
  const [toast, setToast]             = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  // ── Autocomplete typeahead states ──────────────────────────────────────────
  const [suggestions, setSuggestions]               = useState([]);
  const [showSuggestions, setShowSuggestions]       = useState(false);
  const [activeSuggestionIndex, setActiveIndex]     = useState(-1);
  const searchContainerRef = useRef(null);
  const debounceRef        = useRef(null);
  const suggestDebounceRef = useRef(null);
  const { addToCart } = useCart();

  // ── Dismiss suggestions when clicking outside ──────────────────────────────
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Load all products on mount ────────────────────────────────────────────
  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      // Fetch products and live inventory stock in parallel.
      // inventory_db holds the authoritative post-order stock; products_db
      // only has the initial seed value which is never updated by orders.
      const [data, inventoryList] = await Promise.all([
        getProducts(),
        getAllInventory().catch(() => []), // non-fatal: fall back to seed value
      ]);

      // Populate unique categories list from catalog (ensures filter chips persist)
      const uniqueCats = ['All', ...new Set(data.map(p => p.category).filter(Boolean))];
      setCategories(uniqueCats);

      // Build a fast O(1) lookup: productId → live stock_quantity
      const stockMap = {};
      for (const inv of inventoryList) {
        stockMap[inv.product_id] = inv.stock_quantity;
      }

      // Merge live stock into each product (overrides stale products_db value)
      const merged = data.map(p => ({
        ...p,
        stock_quantity: p.id in stockMap ? stockMap[p.id] : p.stock_quantity,
      }));

      setProducts(merged);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }

  // ── Select a suggestion directly (click or enter) ──────────────────────────
  const selectSuggestion = useCallback(async (selectedName) => {
    setQuery(selectedName);
    setShowSuggestions(false);
    setSuggestions([]);
    setActiveIndex(-1);
    clearTimeout(debounceRef.current);
    clearTimeout(suggestDebounceRef.current);

    setIsSearching(true);
    try {
      const results = await searchProducts(selectedName.trim());
      setProducts(results);
      setActive('All');
    } catch (err) {
      setError('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, []);

  // ── Debounced search with autocomplete typeahead ───────────────────────────
  const handleSearch = useCallback((value) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    clearTimeout(suggestDebounceRef.current);

    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      loadAll();
      return;
    }

    // Fast debounce (200 ms) for autocomplete suggestions
    suggestDebounceRef.current = setTimeout(async () => {
      try {
        const items = await getProductSuggestions(value.trim());
        setSuggestions(items);
        setShowSuggestions(items.length > 0);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 200);

    // UX debounce (400 ms) for full product card grid search
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchProducts(value.trim());
        setProducts(results);
        setActive('All'); // Reset category filter when searching
      } catch (err) {
        setError('Search failed. Please try again.');
      } finally {
        setIsSearching(false);
      }
    }, 400);
  }, []);

  // ── Keyboard navigation for autocomplete suggestions ───────────────────────
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

  // ── Apply category filter to products (case-insensitive for robustness) ───
  const displayed = activeCategory === 'All'
    ? products
    : products.filter(p => p.category?.toLowerCase() === activeCategory.toLowerCase());

  // ── Add to cart handler ───────────────────────────────────────────────────
  function handleAddToCart(product) {
    addToCart(product);
    setToast(`"${product.name}" added to cart`);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">

      {/* ── Page header ── */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-granite mb-1">Products</h1>
        <p className="text-gray-500">
          {loading ? 'Loading...' : `${displayed.length} ${displayed.length === 1 ? 'product' : 'products'} found`}
        </p>
      </div>

      {/* ── Search bar with Autocomplete Typeahead ── */}
      <div ref={searchContainerRef} className="relative mb-6">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
        </span>
        <input
          type="text"
          placeholder="Search products (typo-tolerant)…"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
          className="w-full pl-12 pr-10 py-3 border-2 border-ash-grey rounded-xl text-granite placeholder-gray-400 focus:outline-none focus:border-sea-green transition-colors text-base"
        />
        {isSearching && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
            <div className="w-5 h-5 border-2 border-ash-grey border-t-sea-green rounded-full animate-spin" />
          </span>
        )}

        {/* ── Suggestions Dropdown ── */}
        {showSuggestions && suggestions.length > 0 && (
          <ul
            role="listbox"
            className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 overflow-hidden"
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
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
                  </svg>
                  <span className="truncate">{suggestion}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Category filter chips ── */}
      {!loading && categories.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActive(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                activeCategory === cat
                  ? 'bg-sea-green text-white shadow-md'
                  : 'bg-ash-grey/30 text-granite hover:bg-ash-grey/60'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* ── States: loading / error / empty / grid ── */}
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="text-center py-20">
          <p className="text-red-500 text-lg mb-4">{error}</p>
          <Button onClick={loadAll}>Retry</Button>
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-5xl mb-4">🔍</p>
          <p className="text-lg font-medium">No products found for "{query}"</p>
          <Button className="mt-4" variant="secondary" onClick={() => { setQuery(''); loadAll(); }}>
            Clear search
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {displayed.map(product => (
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
