/**
 * components/ProductCard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays a single product in the grid on catalog & home pages.
 * Pure presentational component with rich hover micro-interactions,
 * clear stock status indicators, and clean typography.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import Button from './Button';

function categoryGradient(category = '') {
  const gradients = {
    Electronics:         'from-slate-800 to-granite',
    Furniture:           'from-amber-950 to-shadow-grey',
    Kitchen:             'from-orange-900 to-granite',
    'Sports & Outdoors': 'from-emerald-950 to-granite',
    Accessories:         'from-purple-950 to-shadow-grey',
  };
  return gradients[category] || 'from-granite to-shadow-grey';
}

function categoryEmoji(category = '') {
  const map = {
    Electronics:         '💻',
    Furniture:           '🪑',
    Kitchen:             '🍳',
    'Sports & Outdoors': '🏃',
    Accessories:         '👜',
  };
  return map[category] || '📦';
}

export default function ProductCard({ product, onAddToCart }) {
  const { id, name, category, price, description, stock_quantity, image_url } = product || {};
  const [imgError, setImgError] = useState(false);
  const stock = Number(stock_quantity || 0);
  const inStock = stock > 0;
  const numericPrice = Number(price || 0);
  const gradient = categoryGradient(category);

  return (
    <article className="bg-white rounded-2xl border border-gray-200/80 shadow-xs hover:shadow-xl hover:border-sea-green/30 hover:-translate-y-1 transition-all duration-300 flex flex-col group overflow-hidden">
      {/* ── Visual banner / Image container ── */}
      <div className={`h-44 bg-gradient-to-br ${gradient} flex items-center justify-center relative overflow-hidden select-none`}>
        {image_url && !imgError ? (
          <img
            src={image_url}
            alt={name || 'Product'}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 group-hover:scale-110 transition-transform duration-300">
            <span className="text-5xl">{categoryEmoji(category)}</span>
            <span className="text-[10px] font-semibold tracking-wider uppercase text-white/50">{category}</span>
          </div>
        )}

        {/* Stock status badge */}
        <div className="absolute top-3 right-3 flex items-center gap-1">
          {inStock ? (
            stock <= 5 ? (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/90 text-white backdrop-blur-xs shadow-xs">
                Only {stock} left
              </span>
            ) : (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-sea-green/90 text-white backdrop-blur-xs shadow-xs">
                In Stock
              </span>
            )
          ) : (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-500/90 text-white backdrop-blur-xs shadow-xs">
              Out of Stock
            </span>
          )}
        </div>
      </div>

      {/* ── Card Body ── */}
      <div className="p-4 sm:p-5 flex flex-col flex-1 gap-2.5">
        {/* Category chip */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-sea-green uppercase tracking-wider bg-sea-green/10 px-2.5 py-0.5 rounded-md">
            {category || 'General'}
          </span>
        </div>

        {/* Product title */}
        <Link
          to={`/products/${id}`}
          className="font-bold text-granite text-base leading-snug group-hover:text-sea-green transition-colors line-clamp-2"
          title={name}
        >
          {name}
        </Link>

        {/* Description */}
        {description && (
          <p className="text-gray-500 text-xs sm:text-sm leading-relaxed line-clamp-2 flex-1">
            {description}
          </p>
        )}

        {/* Price & Action row */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100 gap-2">
          <div>
            <span className="text-xs text-gray-400 block font-medium">Price</span>
            <span className="text-lg sm:text-xl font-extrabold text-granite tracking-tight">
              ${numericPrice.toFixed(2)}
            </span>
          </div>

          <Button
            size="sm"
            onClick={() => onAddToCart && onAddToCart(product)}
            disabled={!inStock}
            variant={inStock ? 'primary' : 'secondary'}
            className="group/btn"
          >
            {inStock ? (
              <>
                <Plus className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                <span>Add</span>
              </>
            ) : (
              'Sold Out'
            )}
          </Button>
        </div>
      </div>
    </article>
  );
}
