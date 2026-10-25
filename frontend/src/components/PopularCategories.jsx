/**
 * components/PopularCategories.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Popular Categories row rendered at the bottom of the "All" sectioned catalog view.
 * - H2 title 'Popular categories' in DM Sans, sentence case, bold
 * - Responsive: Horizontally scrollable on mobile, centered grid on desktop
 * - Rounded/circular visual thumbnail, category name, and product count
 * - Accessible keyboard navigation and theme-aware surfaces
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ORDERED_CATEGORIES } from '../config/categoryPromoConfig';

const CATEGORY_THUMBNAILS = {
  Electronics: '/images/categories/electronics.jpg',
  Furniture: '/images/categories/furniture.jpg',
  Kitchen: '/images/categories/kitchen.jpg',
  'Sports & Outdoors': '/images/categories/sports-outdoors.jpg',
  Accessories: '/images/categories/accessories.jpg',
};

export default function PopularCategories({
  categories = ORDERED_CATEGORIES,
  categoryCounts = {},
  onSelectCategory,
}) {
  // Filter out 'All' and only show categories that exist
  const displayCategories = categories.filter(c => c && c.toLowerCase() !== 'all');

  return (
    <section className="mt-14 sm:mt-20 pt-10 border-t border-slate-200/90 dark:border-white/10" aria-label="Popular categories">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-['DM_Sans',sans-serif] text-xl sm:text-2xl font-bold text-slate-900 dark:text-[#E6EFEA] tracking-tight">
            Popular categories
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-1">
            Browse our full collections and verified catalog items
          </p>
        </div>
      </div>

      {/* ── Scrollable row on mobile / Centered grid on desktop ── */}
      <div className="flex sm:grid sm:grid-cols-3 md:grid-cols-5 gap-4 overflow-x-auto no-scrollbar pb-4 pt-1 -mx-4 px-4 sm:mx-0 sm:px-0">
        {displayCategories.map(cat => {
          const img = CATEGORY_THUMBNAILS[cat] || '/images/placeholder.svg';
          const count = categoryCounts[cat] != null ? categoryCounts[cat] : null;

          return (
            <button
              key={cat}
              type="button"
              onClick={() => onSelectCategory(cat)}
              className="flex-shrink-0 w-36 sm:w-auto bg-white dark:bg-[#111C18] border border-emerald-950/[0.08] dark:border-white/10 hover:border-emerald-600/40 dark:hover:border-emerald-400/40 rounded-2xl p-4 flex flex-col items-center text-center group transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(20,50,35,0.08)] dark:hover:shadow-[0_8px_20px_rgba(0,0,0,0.4)] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#10B981]"
              aria-label={`Browse ${cat} category, ${count != null ? `${count} products` : ''}`}
            >
              {/* Circular / Rounded Image Frame */}
              <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-slate-100 dark:bg-[#162721] mb-3.5 border border-slate-200/60 dark:border-white/10 group-hover:scale-105 transition-transform duration-300">
                <img
                  src={img}
                  alt={cat}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>

              {/* Category Name */}
              <span className="font-['DM_Sans',sans-serif] font-bold text-xs sm:text-sm text-slate-800 dark:text-[#E6EFEA] group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors line-clamp-1">
                {cat}
              </span>

              {/* Product Count */}
              {count != null && (
                <span className="text-[11px] font-mono text-slate-400 dark:text-slate-400 mt-1">
                  {count} {count === 1 ? 'item' : 'items'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
