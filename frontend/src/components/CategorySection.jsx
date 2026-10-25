/**
 * components/CategorySection.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Individual Category Section for the Catalog:
 * - Section header with H2 category title and 'See all' link
 * - Desktop (>=1024px): 5-column grid with Column 1 tall Promo Tile (row-span-2)
 *   and Columns 2-5 holding 8 product cards (2 rows x 4).
 * - Tablet (640-1023px): Wide banner above a 3-column product grid.
 * - Mobile (<640px): Banner above a 2-column product grid showing 4 products.
 * - In-stock products prioritized, sorted by rating/popularity.
 * - Independent skeleton loading, error retry, and smooth category selection.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowRight, RotateCcw, AlertCircle } from 'lucide-react';
import ProductCard from './ProductCard';
import CategoryPromoTile from './CategoryPromoTile';
import { getProducts } from '../api/productApi';

// ── Independent Section Skeleton ──────────────────────────────────────────────
function SectionSkeleton({ category }) {
  return (
    <section className="mb-14 sm:mb-16 animate-pulse" aria-label={`Loading ${category}`}>
      {/* Title Row Skeleton */}
      <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200/80 dark:border-white/10">
        <div className="h-7 bg-slate-200 dark:bg-white/10 rounded-md w-40 sm:w-56" />
        <div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-20" />
      </div>

      {/* Grid Skeleton */}
      <div className="flex flex-col lg:grid lg:grid-cols-5 gap-6">
        {/* Promo Tile Skeleton */}
        <div className="w-full h-[140px] lg:h-full lg:min-h-[500px] lg:col-span-1 lg:row-span-2 bg-slate-200/70 dark:bg-white/[0.06] rounded-2xl p-6 flex flex-col justify-between" />

        {/* Product Cards Skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:contents gap-4 sm:gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n, idx) => (
            <div
              key={n}
              className={`bg-white dark:bg-[#111C18] rounded-2xl border border-emerald-950/[0.08] dark:border-white/10 p-4 flex flex-col gap-3 shadow-xs ${
                idx >= 4 ? 'hidden sm:flex lg:flex' : 'flex'
              }`}
            >
              <div className="aspect-[16/10] bg-slate-200/80 dark:bg-white/[0.08] rounded-xl" />
              <div className="h-4 bg-slate-200/80 dark:bg-white/[0.08] rounded w-4/5 mt-1" />
              <div className="h-3 bg-slate-200/80 dark:bg-white/[0.08] rounded w-1/3" />
              <div className="mt-auto pt-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between">
                <div className="h-5 bg-slate-200/80 dark:bg-white/[0.08] rounded w-16" />
                <div className="h-8 bg-slate-200/80 dark:bg-white/[0.08] rounded-lg w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function CategorySection({
  category,
  onSelectCategory,
  onAddToCart,
  initialProducts = null,
  stockMap = {},
  onLoaded,
}) {
  const [products, setProducts] = useState(initialProducts);
  const [loading, setLoading] = useState(!initialProducts);
  const [error, setError] = useState(null);

  const fetchCategoryProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch up to 16 products to guarantee up to 8 in-stock candidates
      const data = await getProducts(0, 16, category);
      const merged = (data || []).map(p => ({
        ...p,
        stock_quantity: p.id in stockMap ? stockMap[p.id] : p.stock_quantity,
      }));

      // Sort: In-stock first, then highest rating / popularity
      const sorted = [...merged].sort((a, b) => {
        const aInStock = Number(a.stock_quantity || 0) > 0 ? 1 : 0;
        const bInStock = Number(b.stock_quantity || 0) > 0 ? 1 : 0;
        if (aInStock !== bInStock) return bInStock - aInStock;

        const aRating = Number(a.rating != null ? a.rating : 4.0);
        const bRating = Number(b.rating != null ? b.rating : 4.0);
        if (bRating !== aRating) return bRating - aRating;

        return (b.id || 0) - (a.id || 0);
      });

      const topProducts = sorted.slice(0, 8);
      setProducts(topProducts);
      if (onLoaded) {
        onLoaded(category, topProducts);
      }
    } catch {
      setError(`Couldn't load ${category}`);
    } finally {
      setLoading(false);
    }
  }, [category, stockMap, onLoaded]);

  useEffect(() => {
    if (!initialProducts) {
      fetchCategoryProducts();
    }
  }, [fetchCategoryProducts, initialProducts]);

  // Fallback image from top in-stock product
  const fallbackProductImage = useMemo(() => {
    if (!products || products.length === 0) return null;
    const topInStock = products.find(p => Number(p.stock_quantity || 0) > 0) || products[0];
    return topInStock?.image_url || null;
  }, [products]);

  // If already loaded and zero products, skip section
  if (!loading && !error && (!products || products.length === 0)) {
    return null;
  }

  if (loading) {
    return <SectionSkeleton category={category} />;
  }

  if (error) {
    return (
      <section
        id={`section-${encodeURIComponent(category)}`}
        className="mb-14 sm:mb-16 scroll-mt-36"
        aria-label={category}
      >
        <div className="flex items-center justify-between pb-3.5 mb-6 border-b border-slate-200/90 dark:border-white/10">
          <h2 className="font-['DM_Sans',sans-serif] text-xl sm:text-2xl font-bold text-slate-900 dark:text-[#E6EFEA] tracking-tight">
            {category}
          </h2>
        </div>
        <div className="bg-white dark:bg-[#111C18] rounded-2xl border border-rose-200 dark:border-rose-950/40 p-8 text-center max-w-md mx-auto shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-5 h-5" />
          </div>
          <p className="text-slate-700 dark:text-slate-300 text-sm font-medium mb-4">{error}</p>
          <button
            type="button"
            onClick={fetchCategoryProducts}
            className="inline-flex items-center gap-2 bg-[#1B5E43] hover:bg-[#164D37] text-white text-xs font-mono font-semibold uppercase px-4 py-2 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#10B981]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      id={`section-${encodeURIComponent(category)}`}
      className="mb-14 sm:mb-16 scroll-mt-36"
      aria-label={`${category} Section`}
    >
      {/* ── Section Title Row ── */}
      <div className="flex items-baseline justify-between pb-3.5 mb-6 border-b border-slate-200/90 dark:border-white/10">
        <h2 className="font-['DM_Sans',sans-serif] text-xl sm:text-2xl font-bold text-slate-900 dark:text-[#E6EFEA] tracking-tight">
          {category}
        </h2>
        <button
          type="button"
          onClick={() => onSelectCategory(category)}
          className="group inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#10B981] rounded-md px-1.5 py-0.5"
          aria-label={`See all ${category} products`}
        >
          <span>See all</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      {/* ── Responsive Grid ── */}
      <div className="flex flex-col lg:grid lg:grid-cols-5 gap-6">
        {/* Tall Promo Tile on Desktop / Wide Banner on Tablet & Mobile */}
        <div className="w-full lg:col-span-1 lg:row-span-2 h-full">
          <CategoryPromoTile
            category={category}
            fallbackProductImage={fallbackProductImage}
            onSelectCategory={onSelectCategory}
          />
        </div>

        {/* Product Cards: 4 on mobile (<640px), up to 8 on tablet & desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:contents gap-4 sm:gap-6">
          {products.map((product, idx) => (
            <div
              key={product.id}
              className={`flex flex-col ${idx >= 4 ? 'hidden sm:flex lg:flex' : 'flex'}`}
            >
              <ProductCard
                product={product}
                onAddToCart={onAddToCart}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── 'See more <Category>' Centered Link Below Section ── */}
      <div className="flex justify-center pt-8">
        <button
          type="button"
          onClick={() => onSelectCategory(category)}
          className="group inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300 hover:text-emerald-950 dark:hover:text-emerald-100 transition-all duration-200 px-5 py-2.5 rounded-full hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border border-transparent hover:border-emerald-500/20 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#10B981]"
          aria-label={`See more in ${category}`}
        >
          <span>See more {category}</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </section>
  );
}
