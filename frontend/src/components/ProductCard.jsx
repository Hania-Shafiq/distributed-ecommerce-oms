/**
 * components/ProductCard.jsx
 * Mature catalog card — thin-line icons, sharp radius, gilt prices,
 * teal status badges (green reserved for Add action).
 */

import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import Button from './Button';
import ProductImage from './ProductImage';

export default function ProductCard({ product, onAddToCart }) {
  const { id, name, category, price, description, stock_quantity, image_url } = product || {};
  const stock = Number(stock_quantity || 0);
  const inStock = stock > 0;
  const numericPrice = Number(price || 0);

  return (
    <article className="elevation-card bg-white rounded-lg border border-granite/10 hover:border-granite/20 flex flex-col group overflow-hidden">
      <div className="relative aspect-[16/10] overflow-hidden select-none">
        <ProductImage
          imageUrl={image_url}
          name={name}
          className="w-full h-full"
          imgClassName="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500 ease-out"
        />

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
