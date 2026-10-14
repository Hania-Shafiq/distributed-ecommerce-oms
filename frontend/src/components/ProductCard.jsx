/**
 * components/ProductCard.jsx
 * Mature catalog card — thin-line icons, sharp radius, gilt prices,
 * teal status badges (green reserved for Add action).
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import Button from './Button';
import CategoryIcon, { categoryGradient } from './CategoryIcon';

export default function ProductCard({ product, onAddToCart }) {
  const { id, name, category, price, description, stock_quantity, image_url } = product || {};
  const [imgError, setImgError] = useState(false);
  const stock = Number(stock_quantity || 0);
  const inStock = stock > 0;
  const numericPrice = Number(price || 0);
  const gradient = categoryGradient(category);

  return (
    <article className="bg-white rounded-lg border border-granite/10 shadow-[0_1px_3px_rgba(35,28,40,0.05)] hover:shadow-[0_8px_24px_rgba(35,28,40,0.1)] hover:border-granite/20 ui-transition flex flex-col group overflow-hidden">
      {/* Visual — moody gradient, minimal line icon (no bubbly emoji box) */}
      <div
        className={`relative aspect-[16/10] bg-gradient-to-br ${gradient} flex items-center justify-center overflow-hidden select-none`}
      >
        {image_url && !imgError ? (
          <img
            src={image_url}
            alt={name || 'Product image'}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500 ease-out"
          />
        ) : (
          <div className="relative flex flex-col items-center justify-center gap-3 text-ash-grey/70">
            <CategoryIcon category={category} className="w-8 h-8 opacity-80" />
            <span className="text-[10px] font-medium tracking-[0.14em] uppercase text-white/40">
              {category || 'Catalog'}
            </span>
          </div>
        )}

        <div className="absolute top-2.5 right-2.5">
          {inStock ? (
            stock <= 5 ? (
              <span className="badge-status badge-status-warn">Only {stock} left</span>
            ) : (
              <span className="badge-status badge-status-ok">In Stock</span>
            )
          ) : (
            <span className="badge-status badge-status-err">Out of Stock</span>
          )}
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1 gap-2">
        <span className="badge-category w-fit">{category || 'General'}</span>

        <Link
          to={`/products/${id}`}
          className="font-semibold text-charcoal text-sm leading-snug group-hover:text-granite ui-transition line-clamp-2"
          title={name}
        >
          {name}
        </Link>

        {description && (
          <p className="text-slate-500 text-xs leading-relaxed line-clamp-2 flex-1 font-normal">
            {description}
          </p>
        )}

        <div className="flex items-center justify-between mt-auto pt-3 border-t border-granite/8 gap-2">
          <div>
            <span className="text-[10px] text-slate-400 block font-normal tracking-wide uppercase">
              Price
            </span>
            <span className="text-lg price-gilt tracking-tight">
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
                <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
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
