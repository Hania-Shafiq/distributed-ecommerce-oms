/**
 * pages/ProductDetail/ProductDetail.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Detailed view of a single product with live inventory stock check,
 * customer recommendations, and clear purchase CTA.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useParams, useNavigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Check,
  ShieldCheck,
  Truck,
  RotateCcw,
  Sparkles,
  AlertCircle,
  PackageCheck,
} from 'lucide-react';
import { getProductById } from '../../api/productApi';
import { getInventoryStock } from '../../api/inventoryApi';
import { getProductRecommendations } from '../../api/recommendationApi';
import { useCart } from '../../context/CartContext';
import Button from '../../components/Button';
import { formatError } from '../../utils/formatError';

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

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [product, setProduct] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      setImgError(false);
      try {
        const [data, inv] = await Promise.all([
          getProductById(id),
          getInventoryStock(id).catch(() => null),
        ]);

        if (!data) {
          throw new Error('Product not found.');
        }

        const liveStock = inv !== null && inv !== undefined && inv.stock_quantity !== undefined
          ? inv.stock_quantity
          : data.stock_quantity;

        setProduct({ ...data, stock_quantity: liveStock });

        getProductRecommendations(id, 4)
          .then(recs => setRecommendations(recs || []))
          .catch(() => setRecommendations([]));
      } catch (err) {
        setError(formatError(err, 'Product not found. It may have been removed or updated.'));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  function handleAddToCart() {
    if (!product) return;
    addToCart(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 2200);
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-10 animate-pulse">
          <div className="h-96 bg-gray-200 rounded-3xl" />
          <div className="space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4" />
            <div className="h-8 bg-gray-200 rounded w-3/4" />
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-24 bg-gray-200 rounded" />
            <div className="h-12 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-xl mx-auto text-center py-24 px-4">
        <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-granite mb-2">Item Unavailable</h2>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          {error || 'This product is currently unavailable in our catalog.'}
        </p>
        <Button variant="secondary" onClick={() => navigate('/products')} className="gap-2 mx-auto">
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Products</span>
        </Button>
      </div>
    );
  }

  const stock = Number(product.stock_quantity || 0);
  const inStock = stock > 0;
  const price = Number(product.price || 0);
  const gradient = categoryGradient(product.category);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* ── Breadcrumb Navigation ── */}
      <nav className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-8 overflow-x-auto no-scrollbar">
        <Link to="/" className="hover:text-granite transition-colors">Home</Link>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
        <Link to="/products" className="hover:text-granite transition-colors">Products</Link>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
        <span className="text-gray-500 truncate">{product.category}</span>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
        <span className="text-granite font-semibold truncate max-w-[200px]">{product.name}</span>
      </nav>

      {/* ── Main Product Section ── */}
      <div className="bg-white rounded-3xl border border-gray-200/80 shadow-xs p-6 sm:p-10">
        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {/* Visual Showcase Panel */}
          <div className={`h-80 sm:h-96 md:h-full min-h-[320px] bg-gradient-to-br ${gradient} rounded-2xl flex items-center justify-center relative overflow-hidden shadow-inner select-none`}>
            {product.image_url && !imgError ? (
              <img
                src={product.image_url}
                alt={product.name}
                onError={() => setImgError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2">
                <span className="text-8xl select-none">{categoryEmoji(product.category)}</span>
                <span className="text-xs uppercase font-bold tracking-widest text-white/50">{product.category}</span>
              </div>
            )}

            {/* In-Stock Floating Pill */}
            <div className="absolute top-4 right-4">
              {inStock ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/90 text-sea-green shadow-xs backdrop-blur-xs">
                  <span className="w-2 h-2 rounded-full bg-sea-green animate-pulse" />
                  <span>{stock <= 5 ? `Only ${stock} left` : 'In Stock'}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200 shadow-xs">
                  <span>Out of Stock</span>
                </span>
              )}
            </div>
          </div>

          {/* Details & Actions Panel */}
          <div className="flex flex-col justify-between gap-6">
            <div className="space-y-4">
              {/* Category & SKU row */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-sea-green uppercase tracking-wider bg-sea-green/10 px-3 py-1 rounded-lg">
                  {product.category}
                </span>
                <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-100">
                  SKU: OMS-{String(product.id).padStart(4, '0')}
                </span>
              </div>

              {/* Title */}
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-granite tracking-tight leading-tight">
                {product.name}
              </h1>

              {/* Price row */}
              <div className="flex items-baseline gap-3 pt-1">
                <span className="text-3xl sm:text-4xl font-black text-sea-green tracking-tight">
                  ${price.toFixed(2)}
                </span>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  Free Shipping
                </span>
              </div>

              {/* Description */}
              {product.description && (
                <div className="pt-2">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Overview</h3>
                  <p className="text-gray-600 text-sm sm:text-base leading-relaxed">
                    {product.description}
                  </p>
                </div>
              )}

              {/* Inventory status pill */}
              <div className="flex items-center gap-2 pt-2">
                <PackageCheck className={`w-4 h-4 ${inStock ? 'text-sea-green' : 'text-gray-400'}`} />
                <span className={`text-xs sm:text-sm font-semibold ${inStock ? 'text-sea-green' : 'text-gray-400'}`}>
                  {inStock ? `${stock} units currently available` : 'Currently unavailable for order'}
                </span>
              </div>
            </div>

            {/* Add to Cart CTA */}
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <Button
                size="lg"
                fullWidth
                onClick={handleAddToCart}
                disabled={!inStock}
                variant={added ? 'secondary' : 'primary'}
                className="py-3.5 text-base gap-2"
              >
                {added ? (
                  <>
                    <Check className="w-5 h-5 text-sea-green" />
                    <span className="text-sea-green font-bold">Added to Cart!</span>
                  </>
                ) : inStock ? (
                  <>
                    <ShoppingCart className="w-5 h-5" />
                    <span>Add to Cart</span>
                  </>
                ) : (
                  'Out of Stock'
                )}
              </Button>

              {/* Trust assurances strip */}
              <div className="grid grid-cols-3 gap-2 pt-2 text-center border-t border-gray-50">
                <div className="flex flex-col items-center gap-1 p-2 rounded-xl bg-gray-50/60">
                  <Truck className="w-4 h-4 text-gray-500" />
                  <span className="text-[11px] font-medium text-gray-600">Fast Delivery</span>
                </div>
                <div className="flex flex-col items-center gap-1 p-2 rounded-xl bg-gray-50/60">
                  <ShieldCheck className="w-4 h-4 text-gray-500" />
                  <span className="text-[11px] font-medium text-gray-600">Verified Stock</span>
                </div>
                <div className="flex flex-col items-center gap-1 p-2 rounded-xl bg-gray-50/60">
                  <RotateCcw className="w-4 h-4 text-gray-500" />
                  <span className="text-[11px] font-medium text-gray-600">Easy Returns</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Related Recommendations Section ── */}
      {recommendations.length > 0 && (
        <div className="mt-14 pt-8">
          <div className="flex items-center gap-2 mb-6">
            <Sparkles className="w-5 h-5 text-sea-green" />
            <h2 className="text-xl sm:text-2xl font-extrabold text-granite">
              Customers Also Viewed
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
            {recommendations.map(rec => (
              <Link
                key={rec.product_id}
                to={`/products/${rec.product_id}`}
                className="bg-white rounded-2xl border border-gray-200/80 p-4 hover:shadow-md hover:border-sea-green/30 transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-2xl mb-3 group-hover:scale-105 transition-transform">
                    {categoryEmoji(rec.category)}
                  </div>
                  <p className="font-bold text-granite text-sm line-clamp-2 group-hover:text-sea-green transition-colors">
                    {rec.name}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1 uppercase font-semibold">{rec.category}</p>
                </div>
                <div className="mt-4 pt-2 border-t border-gray-50 flex items-center justify-between text-xs font-semibold text-sea-green">
                  <span>View Item</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
