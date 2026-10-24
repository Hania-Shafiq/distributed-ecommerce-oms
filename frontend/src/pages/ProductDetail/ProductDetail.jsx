/**
 * pages/ProductDetail/ProductDetail.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Detailed product view with balanced light-and-dark aesthetic:
 * - High-definition visual product frame with stock indicator
 * - Emerald buttons and crisp typography
 * - Intelligent related products & Neo4j affinity recommendations
 * All routing, cart state, and API bindings remain 100% intact.
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
  AlertCircle,
  PackageCheck,
  Sparkles,
} from 'lucide-react';
import { getProductById, getSimilarProducts } from '../../api/productApi';
import { getInventoryStock } from '../../api/inventoryApi';
import { getProductRecommendations } from '../../api/recommendationApi';
import { useCart } from '../../context/CartContext';
import Button from '../../components/Button';
import ProductImage from '../../components/ProductImage';
import { formatError } from '../../utils/formatError';

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [product, setProduct] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [similarProducts, setSimilarProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [data, inv] = await Promise.all([
          getProductById(id),
          getInventoryStock(id).catch(() => null),
        ]);

        if (!data) {
          throw new Error('Product not found.');
        }

        const liveStock =
          inv !== null && inv !== undefined && inv.stock_quantity !== undefined
            ? inv.stock_quantity
            : data.stock_quantity;

        setProduct({ ...data, stock_quantity: liveStock });

        getProductRecommendations(id, 4)
          .then((recs) => setRecommendations(recs || []))
          .catch(() => setRecommendations([]));

        getSimilarProducts(id, 4)
          .then((similar) => setSimilarProducts(similar || []))
          .catch(() => setSimilarProducts([]));
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
          <div className="h-96 bg-[#EAEFEA] rounded-2xl" />
          <div className="space-y-4">
            <div className="h-4 bg-[#EAEFEA] rounded w-1/4" />
            <div className="h-8 bg-[#EAEFEA] rounded w-3/4" />
            <div className="h-8 bg-[#EAEFEA] rounded w-1/3" />
            <div className="h-24 bg-[#EAEFEA] rounded-xl" />
            <div className="h-12 bg-[#EAEFEA] rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-xl mx-auto text-center py-24 px-4">
        <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4 border border-rose-200">
          <AlertCircle className="w-6 h-6" strokeWidth={1.5} />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2 font-mono">Item Unavailable</h2>
        <p className="text-slate-500 text-sm mb-6 leading-relaxed">
          {error || 'This product is currently unavailable in our catalog.'}
        </p>
        <Button variant="secondary" onClick={() => navigate('/products')} className="gap-2 mx-auto">
          <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
          <span>Back to catalog</span>
        </Button>
      </div>
    );
  }

  const isArchived = Boolean(product.is_archived);
  const stock = Number(product.stock_quantity || 0);
  const inStock = stock > 0 && !isArchived;
  const price = Number(product.price || 0);

  return (
    <div className="bg-[#F4F7F5] min-h-screen py-8 sm:py-12">
      <div className="page-container">
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-8 overflow-x-auto">
          <Link to="/" className="hover:text-emerald-700 transition-colors">
            Home
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />
          <Link to="/products" className="hover:text-emerald-700 transition-colors">
            Catalog
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />
          <span className="text-slate-600 truncate">{product.category}</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />
          <span className="text-slate-900 font-bold truncate max-w-[200px]">{product.name}</span>
        </nav>

        {/* Product Details Card */}
        <div className="bg-white rounded-2xl border border-emerald-950/[0.08] shadow-[0_8px_30px_rgba(20,50,35,0.04)] p-6 sm:p-8">
          <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-start">
            {/* Visual Frame */}
            <div className="h-80 sm:h-96 md:h-[440px] rounded-2xl relative overflow-hidden select-none border border-emerald-950/[0.06] bg-[#F4F7F5]">
              <ProductImage
                imageUrl={product.image_url}
                name={product.name}
                category={product.category}
                className="w-full h-full"
                loading="eager"
              />

              {/* Stock Badge Overlay */}
              <div className="absolute top-4 right-4">
                {isArchived ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wide bg-rose-950/80 text-rose-200 border border-rose-400/40 backdrop-blur-md shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    Archived
                  </span>
                ) : inStock ? (
                  stock <= 5 ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium tracking-wide bg-amber-50/95 text-amber-800 border border-amber-200/80 shadow-xs backdrop-blur-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Only {stock} left
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium tracking-wide bg-emerald-50/95 text-emerald-800 border border-emerald-200/80 shadow-xs backdrop-blur-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 stock-dot-live" />
                      In Stock
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-mono font-medium tracking-wide bg-slate-900/65 text-white border border-white/20 backdrop-blur-md shadow-xs">
                    Out of Stock
                  </span>
                )}
              </div>
            </div>

            {/* Product Meta & Actions */}
            <div className="flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200/80">
                    {product.category}
                  </span>
                  <span className="text-xs font-normal text-slate-400 font-mono">
                    SKU: OMS-{String(product.id).padStart(4, '0')}
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-snug">
                  {product.name}
                </h1>

                <div className="flex items-baseline gap-3 pt-1">
                  <span className="text-3xl sm:text-4xl font-extrabold font-mono text-slate-900 tracking-tight tabular-nums">
                    ${price.toFixed(2)}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-emerald-900 bg-emerald-100/70 px-2.5 py-1 rounded-md border border-emerald-200 uppercase tracking-wider">
                    Free shipping
                  </span>
                </div>

                {product.description && (
                  <div className="pt-2">
                    <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Overview
                    </h3>
                    <p className="text-slate-600 text-sm leading-relaxed font-normal">
                      {product.description}
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <PackageCheck
                    className={`w-4 h-4 ${inStock ? 'text-emerald-700' : 'text-slate-400'}`}
                    strokeWidth={2}
                  />
                  <span
                    className={`text-sm font-medium ${inStock ? 'text-emerald-800' : 'text-slate-400'}`}
                  >
                    {isArchived
                      ? 'Item archived — preserved for order history'
                      : inStock
                      ? `${stock} units available in active inventory`
                      : 'Currently unavailable for checkout'}
                  </span>
                </div>

                {isArchived && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/90 text-amber-900 text-xs font-mono flex items-center gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>This product has been archived. It cannot be purchased by customers.</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-5 pt-5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!inStock}
                  className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all shadow-md active:translate-y-0.5 cursor-pointer select-none ${
                    added
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : inStock
                      ? 'bg-[#107C55] hover:bg-[#0E6847] text-white'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                  }`}
                >
                  {added ? (
                    <>
                      <Check className="w-5 h-5 text-emerald-800" strokeWidth={2} />
                      <span className="text-emerald-900">Added to Cart!</span>
                    </>
                  ) : inStock ? (
                    <>
                      <ShoppingCart className="w-5 h-5" strokeWidth={2} />
                      <span>Add to Cart</span>
                    </>
                  ) : isArchived ? (
                    'Archived / Discontinued'
                  ) : (
                    'Sold Out'
                  )}
                </button>

                {/* Delivery & Trust Icons */}
                <div className="grid grid-cols-3 gap-3 pt-2 text-center">
                  {[
                    [Truck, 'Fast delivery'],
                    [ShieldCheck, 'Verified stock'],
                    [RotateCcw, 'Easy returns'],
                  ].map(([Icon, label]) => (
                    <div
                      key={label}
                      className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-[#F4F7F5] border border-slate-200/60"
                    >
                      <Icon className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />
                      <span className="text-[11px] font-mono font-medium text-slate-600">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Similar Products */}
        {similarProducts.length > 0 && (
          <div className="mt-14 pt-8 border-t border-slate-200/80">
            <div className="flex items-center gap-2 mb-6">
              <Sparkles className="w-5 h-5 text-[#107C55]" />
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Similar Products</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {similarProducts.map((sim) => (
                <Link
                  key={sim.id}
                  to={`/products/${sim.id}`}
                  className="bg-white rounded-2xl border border-emerald-950/[0.08] p-4 hover:border-emerald-600/30 hover:shadow-md transition-all group flex flex-col justify-between"
                >
                  <div>
                    <ProductImage
                      imageUrl={sim.image_url}
                      name={sim.name}
                      category={sim.category}
                      className="rounded-xl mb-3 aspect-[4/3] w-full"
                    />
                    <p className="font-bold text-slate-900 text-sm line-clamp-1 group-hover:text-emerald-700 transition-colors">
                      {sim.name}
                    </p>
                    <p className="text-[10px] font-mono text-slate-400 mt-1 uppercase tracking-wider font-semibold">
                      {sim.category}
                    </p>
                  </div>
                  <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-mono font-bold text-slate-900">
                    <span>${Number(sim.price || 0).toFixed(2)}</span>
                    <span className="text-emerald-700 group-hover:translate-x-0.5 transition-transform">→</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="mt-14 pt-8 border-t border-slate-200/80">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight mb-6">Customers Also Viewed</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {recommendations.map((rec) => (
                <Link
                  key={rec.product_id}
                  to={`/products/${rec.product_id}`}
                  className="bg-white rounded-2xl border border-emerald-950/[0.08] p-4 hover:border-emerald-600/30 hover:shadow-md transition-all group flex flex-col justify-between"
                >
                  <div>
                    <ProductImage
                      imageUrl={rec.image_url}
                      name={rec.name}
                      category={rec.category}
                      className="rounded-xl mb-3 aspect-[4/3] w-full"
                    />
                    <p className="font-bold text-slate-900 text-sm line-clamp-1 group-hover:text-emerald-700 transition-colors">
                      {rec.name}
                    </p>
                    <p className="text-[10px] font-mono text-slate-400 mt-1 uppercase tracking-wider font-semibold">
                      {rec.category}
                    </p>
                  </div>
                  <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-mono font-bold text-emerald-800">
                    <span>View Item</span>
                    <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
