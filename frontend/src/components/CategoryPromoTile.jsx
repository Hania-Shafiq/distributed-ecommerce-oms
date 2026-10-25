/**
 * components/CategoryPromoTile.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Promotional Tile for Category-Sectioned Catalog View:
 * - Desktop (>=1024px): Tall vertical promo card spanning 2 rows in 5-col grid.
 * - Tablet (640-1023px): Full-width horizontal banner (~140px tall).
 * - Mobile (<640px): Full-width banner above 2-column product grid.
 * - Theme-compliant dark emerald gradient overlay for guaranteed text contrast >= 4.5:1.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { CATEGORY_PROMO_CONFIG } from '../config/categoryPromoConfig';

export default function CategoryPromoTile({
  category,
  fallbackProductImage,
  onSelectCategory,
}) {
  const config = CATEGORY_PROMO_CONFIG[category] || {};
  const [imgSrc, setImgSrc] = useState(
    config.image || config.fallbackImage || fallbackProductImage || '/images/placeholder.svg'
  );

  const headline = config.headline || `${category} Collection`;
  const subtitle = config.subtitle || `Explore handpicked, in-stock ${category.toLowerCase()} essentials.`;
  const tag = config.tag || category.toUpperCase();
  const ctaText = config.ctaText || 'Shop now';

  function handleImageError() {
    if (config.fallbackImage && imgSrc !== config.fallbackImage) {
      setImgSrc(config.fallbackImage);
    } else if (fallbackProductImage && imgSrc !== fallbackProductImage) {
      setImgSrc(fallbackProductImage);
    } else if (imgSrc !== '/images/placeholder.svg') {
      setImgSrc('/images/placeholder.svg');
    }
  }

  return (
    <div className="relative w-full h-full min-h-[140px] rounded-2xl overflow-hidden border border-emerald-950/[0.08] dark:border-white/10 shadow-[0_2px_12px_rgba(26,22,31,0.03)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.35)] bg-[#071F16] text-white group flex flex-col justify-between">
      {/* Background Image */}
      <img
        src={imgSrc}
        alt={`Featured ${category} collection`}
        onError={handleImageError}
        className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-[1.03] transition-transform duration-500 ease-out"
        loading="lazy"
      />

      {/* High-Contrast Dual-Theme Gradient Overlays */}
      {/* Desktop Vertical Gradient: Richer at bottom and top */}
      <div
        className="hidden lg:block absolute inset-0 bg-gradient-to-t from-[#051710]/95 via-[#082218]/80 to-[#0B2E21]/60 pointer-events-none"
        aria-hidden="true"
      />
      {/* Tablet & Mobile Horizontal Gradient: Richer at left */}
      <div
        className="lg:hidden absolute inset-0 bg-gradient-to-r from-[#051710]/95 via-[#082218]/85 to-[#082218]/65 pointer-events-none"
        aria-hidden="true"
      />

      {/* Subtle Blueprint Dots */}
      <div className="absolute inset-0 bg-blueprint-dots opacity-10 pointer-events-none" aria-hidden="true" />

      {/* ── Desktop Layout (>= 1024px): Tall Card Spanning 2 Rows ── */}
      <div className="hidden lg:flex relative z-10 flex-col justify-between h-full p-7 xl:p-8">
        <div>
          {/* Eyebrow Label */}
          <div className="inline-flex items-center gap-1.5 text-emerald-300 font-mono text-[11px] font-bold uppercase tracking-wider mb-3">
            <Sparkles className="w-3.5 h-3.5 text-[#10B981]" />
            <span>{tag}</span>
          </div>

          {/* 2-Line Headline */}
          <h3 className="font-['DM_Sans',sans-serif] text-2xl xl:text-[1.75rem] font-bold text-white tracking-tight leading-snug mb-3 drop-shadow-xs">
            {headline}
          </h3>

          {/* Short Subtitle */}
          <p className="text-emerald-100/80 text-xs sm:text-sm leading-relaxed max-w-[240px]">
            {subtitle}
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-6">
          <button
            type="button"
            onClick={() => onSelectCategory(category)}
            className="inline-flex items-center gap-2 bg-[#10B981] hover:bg-[#2BCB8E] text-[#04261A] font-medium text-xs font-mono uppercase tracking-wider px-5 py-3 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:ring-offset-2 focus:ring-offset-[#071F16]"
            aria-label={`${ctaText} for ${category}`}
          >
            <span>{ctaText}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Tablet & Mobile Layout (< 1024px): Wide Banner (~140px tall) ── */}
      <div className="flex lg:hidden relative z-10 flex-col sm:flex-row sm:items-center sm:justify-between h-full p-5 sm:p-6 gap-3">
        <div className="max-w-md">
          <div className="inline-flex items-center gap-1.5 text-emerald-300 font-mono text-[10px] font-bold uppercase tracking-wider mb-1">
            <Sparkles className="w-3 h-3 text-[#10B981]" />
            <span>{tag}</span>
          </div>
          <h3 className="font-['DM_Sans',sans-serif] text-lg sm:text-xl font-bold text-white tracking-tight leading-tight">
            {headline}
          </h3>
          <p className="hidden sm:block text-emerald-100/80 text-xs mt-1 line-clamp-1">
            {subtitle}
          </p>
        </div>

        <div className="self-start sm:self-center shrink-0">
          <button
            type="button"
            onClick={() => onSelectCategory(category)}
            className="inline-flex items-center gap-2 bg-[#10B981] hover:bg-[#2BCB8E] text-[#04261A] font-semibold text-xs font-mono uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:ring-offset-2 focus:ring-offset-[#071F16]"
            aria-label={`${ctaText} for ${category}`}
          >
            <span>{ctaText}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
