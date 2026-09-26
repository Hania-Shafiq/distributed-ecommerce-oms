/**
 * components/ProductCard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays a single product in the grid on the ProductList page.
 * Pure presentational component — receives product data as props,
 * emits actions via callbacks (no direct API calls here).
 *
 * Props:
 *   product   — product object from productApi
 *   onAddToCart — callback: (product) => void
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Link } from 'react-router-dom';
import Button from './Button';

/**
 * Returns a placeholder gradient based on category name (deterministic).
 * Keeps the UI visually rich without requiring real product images.
 */
function categoryGradient(category = '') {
  const gradients = {
    Electronics:       'from-blue-900 to-granite',
    Furniture:         'from-amber-900 to-shadow-grey',
    Kitchen:           'from-orange-800 to-granite',
    'Sports & Outdoors': 'from-emerald-900 to-granite',
    Accessories:       'from-purple-900 to-shadow-grey',
  };
  return gradients[category] || 'from-granite to-shadow-grey';
}

export default function ProductCard({ product, onAddToCart }) {
  const { id, name, category, price, description, stock_quantity, image_url } = product;
  const inStock = stock_quantity > 0;
  const gradient = categoryGradient(category);

  return (
    <article className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden flex flex-col group">
      {/* ── Visual header — image or category-coloured gradient banner ── */}
      <div className={`h-40 bg-gradient-to-br ${gradient} flex items-center justify-center relative overflow-hidden`}>
        {image_url ? (
          <img
            src={image_url}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'inline';
            }}
          />
        ) : null}
        <span
          className={`text-5xl select-none group-hover:scale-110 transition-transform duration-300 ${
            image_url ? 'hidden' : 'inline'
          }`}
        >
          {categoryEmoji(category)}
        </span>
        {/* Stock badge */}
        <span
          className={`absolute top-3 right-3 text-xs font-bold px-2 py-1 rounded-full ${
            inStock ? 'bg-sea-green text-white' : 'bg-red-500 text-white'
          }`}
        >
          {inStock ? `${stock_quantity} in stock` : 'Out of stock'}
        </span>
      </div>

      {/* ── Card body ── */}
      <div className="p-4 flex flex-col flex-1 gap-2">
        {/* Category chip */}
        <span className="text-xs font-semibold text-sea-green uppercase tracking-wide">
          {category}
        </span>

        {/* Product name — links to detail page */}
        <Link
          to={`/products/${id}`}
          className="font-bold text-granite text-base leading-snug hover:text-sea-green transition-colors line-clamp-2"
        >
          {name}
        </Link>

        {/* Description preview */}
        {description && (
          <p className="text-gray-500 text-sm leading-relaxed line-clamp-2 flex-1">
            {description}
          </p>
        )}

        {/* Price + CTA */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
          <span className="text-xl font-extrabold text-granite">
            ${price.toFixed(2)}
          </span>
          <Button
            size="sm"
            onClick={() => onAddToCart(product)}
            disabled={!inStock}
            variant={inStock ? 'primary' : 'secondary'}
          >
            {inStock ? '+ Add' : 'Sold out'}
          </Button>
        </div>
      </div>
    </article>
  );
}

/** Maps a category name to an emoji icon for the card header. */
function categoryEmoji(category) {
  const map = {
    Electronics:         '💻',
    Furniture:           '🪑',
    Kitchen:             '🍳',
    'Sports & Outdoors': '🏃',
    Accessories:         '👜',
  };
  return map[category] || '📦';
}
