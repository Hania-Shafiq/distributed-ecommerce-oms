/**
 * components/ProductCard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays a single product in the catalog and homepage grids.
 * Pure presentational component with refined visual placeholders (no emojis),
 * consistent aspect ratio, and clean retail card spacing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Laptop,
  Armchair,
  Coffee,
  Compass,
  Watch,
  Package,
} from 'lucide-react';
import Button from './Button';

function CategoryIcon({ category, className = 'w-7 h-7 stroke-[1.5]' }) {
  switch (category) {
    case 'Electronics':
      return <Laptop className={className} />;
    case 'Furniture':
      return <Armchair className={className} />;
    case 'Kitchen':
      return <Coffee className={className} />;
    case 'Sports & Outdoors':
      return <Compass className={className} />;
    case 'Accessories':
      return <Watch className={className} />;
    default:
      return <Package className={className} />;
  }
}

function categoryGradient(category = '') {
  const gradients = {
    Electronics:         'from-slate-900 via-slate-800 to-granite',
    Furniture:           'from-stone-900 via-stone-800 to-shadow-grey',
    Kitchen:             'from-amber-950 via-stone-900 to-granite',
    'Sports & Outdoors': 'from-emerald-950 via-slate-900 to-granite',
    Accessories:         'from-purple-950 via-slate-900 to-shadow-grey',
  };
  return gradients[category] || 'from-slate-900 via-granite to-shadow-grey';
}

export default function ProductCard({ product, onAddToCart }) {
  const { id, name, category, price, description, stock_quantity, image_url } = product || {};
  const [imgError, setImgError] = useState(false);
  const stock = Number(stock_quantity || 0);
  const inStock = stock > 0;
  const numericPrice = Number(price || 0);
  const gradient = categoryGradient(category);

  return (
    <article className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-xl hover:border-sea-green/30 hover:-translate-y-1 transition-all duration-300 flex flex-col group overflow-hidden">
      {/* ── Product Visual Container (Fixed aspect ratio 16:10) ── */}
      <div className={`relative aspect-[16/10] bg-gradient-to-br ${gradient} flex items-center justify-center overflow-hidden select-none`}>
        {image_url && !imgError ? (
          <img
            src={image_url}
            alt={name || 'Product image'}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
          />
        ) : (
          <div className="relative flex flex-col items-center justify-center gap-2">
            {/* Ambient glow behind icon */}
            <div className="absolute w-20 h-20 rounded-full bg-white/5 blur-xl pointer-events-none" />

            {/* Refined sculpted icon container */}
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center text-white/90 shadow-inner group-hover:scale-110 group-hover:bg-white/15 transition-all duration-300">
              <CategoryIcon category={category} className="w-7 h-7 stroke-[1.5]" />
            </div>

            <span className="text-[10px] font-semibold tracking-widest uppercase text-white/50">
              {category || 'Catalog Item'}
            </span>
          </div>
        )}

        {/* Stock status badge */}
        <div className="absolute top-3 right-3 flex items-center">
          {inStock ? (
            stock <= 5 ? (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/90 text-white backdrop-blur-xs shadow-xs">
                Only {stock} left
              </span>
            ) : (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-sea-green/90 text-white backdrop-blur-xs shadow-xs">
                In Stock
              </span>
            )
          ) : (
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/90 text-white backdrop-blur-xs shadow-xs">
              Out of Stock
            </span>
          )}
        </div>
      </div>

      {/* ── Card Content ── */}
      <div className="p-4 sm:p-5 flex flex-col flex-1 gap-2">
        {/* Category chip */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-sea-green uppercase tracking-wider bg-sea-green/10 px-2 py-0.5 rounded-md">
            {category || 'General'}
          </span>
        </div>

        {/* Product Title */}
        <Link
          to={`/products/${id}`}
          className="font-bold text-granite text-sm sm:text-base leading-snug group-hover:text-sea-green transition-colors line-clamp-2"
          title={name}
        >
          {name}
        </Link>

        {/* Description */}
        {description && (
          <p className="text-slate-500 text-xs leading-relaxed line-clamp-2 flex-1">
            {description}
          </p>
        )}

        {/* Price & Action Row */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100 gap-2">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">Price</span>
            <span className="text-lg font-extrabold text-granite tracking-tight">
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
