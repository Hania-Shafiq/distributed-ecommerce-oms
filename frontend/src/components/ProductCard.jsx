/**
 * components/ProductCard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Human-designed product card with consistent 4:3 image frame, baseline alignment,
 * warm gold pricing, refined stock pills, and calm micro-interactions.
 * Props, handlers, and bindings remain 100% intact.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import Button from './Button';
import ProductImage from './ProductImage';

export default function ProductCard({ product, onAddToCart }) {
  const { id, name, category, price, description, stock_quantity, image_url, rating } = product || {};
  const stock = Number(stock_quantity || 0);
  const inStock = stock > 0;
  const numericPrice = Number(price || 0);

  return (
    <article className="bg-white rounded-xl border border-[#231C28]/[0.08] hover:border-[#231C28]/[0.18] flex flex-col group overflow-hidden transition-all duration-200 hover:-translate-y-[2px] hover:shadow-[0_4px_16px_rgba(26,22,31,0.06)]">
      {/* 4:3 Image Frame with Neutral Surface & Refined Stock Pill */}
      <div className="relative aspect-[4/3] bg-[#F1F4EE] overflow-hidden select-none border-b border-[#231C28]/[0.05]">
        <ProductImage
          imageUrl={image_url}
          name={name}
          className="w-full h-full"
          imgClassName="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300 ease-out"
        />

        <div className="absolute top-2.5 right-2.5">
          {inStock ? (
            stock <= 5 ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium tracking-wide bg-amber-50 text-amber-800 border border-amber-200/80 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Only {stock} left
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium tracking-wide bg-[#EBF4EF] text-[#2D6349] border border-[#3D8361]/25 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3D8361] stock-dot-live" />
                In Stock
              </span>
            )
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium tracking-wide bg-slate-100 text-slate-500 border border-slate-200">
              Out of Stock
            </span>
          )}
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 flex flex-col flex-1 gap-2.5">
        {/* Baseline Alignment: Category Pill & Star Rating */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#2D4239] bg-[#F1F4EE] px-2 py-0.5 rounded">
            {category || 'General'}
          </span>
          {rating != null && (
            <span className="text-xs font-mono font-medium text-amber-700 flex items-center gap-1" title="Product rating">
              <span className="text-amber-500">★</span>
              <span className="tabular-nums">{Number(rating).toFixed(1)}</span>
            </span>
          )}
        </div>

        {/* Product Title */}
        <Link
          to={`/products/${id}`}
          className="font-semibold text-[#1A161F] text-sm leading-snug group-hover:text-[#3D8361] transition-colors duration-150 line-clamp-2"
          title={name}
        >
          {name}
        </Link>

        {/* Optional Description */}
        {description && (
          <p className="text-slate-500 text-xs leading-relaxed line-clamp-2 flex-1 font-normal">
            {description}
          </p>
        )}

        {/* Price & Add Action Footer */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-[#231C28]/[0.06] gap-2">
          <div>
            <span className="text-[10px] text-slate-400 block font-mono uppercase tracking-wider">
              Price
            </span>
            <span className="text-lg font-bold font-mono tracking-tight text-[#B8956C] tabular-nums">
              ${numericPrice.toFixed(2)}
            </span>
          </div>

          <Button
            size="sm"
            onClick={() => onAddToCart && onAddToCart(product)}
            disabled={!inStock}
            variant={inStock ? 'primary' : 'secondary'}
            className="text-xs px-3.5 py-1.5"
          >
            {inStock ? (
              <>
                <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
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
