/**
 * pages/ProductDetail/ProductDetail.jsx
 * Mature detail view — logic unchanged; line icons, gilt price, sharp radius.
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
          <div className="h-96 bg-sage-mist rounded-lg" />
          <div className="space-y-4">
            <div className="h-3 bg-sage-mist rounded w-1/4" />
            <div className="h-7 bg-sage-mist rounded w-3/4" />
            <div className="h-7 bg-sage-mist rounded w-1/3" />
            <div className="h-20 bg-sage-mist rounded" />
            <div className="h-11 bg-sage-mist rounded-md" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-xl mx-auto text-center py-24 px-4">
        <div className="w-12 h-12 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" strokeWidth={1.25} />
        </div>
        <h2 className="text-xl font-semibold text-charcoal mb-2">Item unavailable</h2>
        <p className="text-slate-500 text-sm mb-6 leading-relaxed font-normal">
          {error || 'This product is currently unavailable in our catalog.'}
        </p>
        <Button variant="secondary" onClick={() => navigate('/products')} className="gap-2 mx-auto">
          <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
          <span>Back to catalog</span>
        </Button>
      </div>
    );
  }

  const stock = Number(product.stock_quantity || 0);
  const inStock = stock > 0;
  const price = Number(product.price || 0);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <nav className="flex items-center gap-2 text-xs font-normal text-slate-400 mb-8 overflow-x-auto">
        <Link to="/" className="hover:text-charcoal ui-transition">
          Home
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" strokeWidth={1.5} />
        <Link to="/products" className="hover:text-charcoal ui-transition">
          Catalog
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" strokeWidth={1.5} />
        <span className="text-slate-500 truncate">{product.category}</span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" strokeWidth={1.5} />
        <span className="text-charcoal font-medium truncate max-w-[200px]">{product.name}</span>
      </nav>

      <div className="panel-quiet p-6 sm:p-8">
        <div className="grid md:grid-cols-2 gap-8 lg:gap-10">
          <div className="h-80 sm:h-96 md:h-full min-h-[320px] rounded-lg relative overflow-hidden select-none">
            <ProductImage
              imageUrl={product.image_url}
              name={product.name}
              className="w-full h-full"
              loading="eager"
            />

            <div className="absolute top-3 right-3">
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

          <div className="flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="badge-category">{product.category}</span>
                <span className="text-xs font-normal text-slate-400 font-mono">
                  SKU: OMS-{String(product.id).padStart(4, '0')}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-semibold text-charcoal tracking-tight leading-tight">
                {product.name}
              </h1>

              <div className="flex items-baseline gap-3 pt-1">
                <span className="text-3xl price-gilt tracking-tight">${price.toFixed(2)}</span>
                <span className="text-[10px] font-medium text-granite bg-sage-mist px-2 py-0.5 rounded-md border border-granite/10 uppercase tracking-wider">
                  Free shipping
                </span>
              </div>

              {product.description && (
                <div className="pt-1">
                  <h3 className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                    Overview
                  </h3>
                  <p className="text-slate-600 text-sm leading-relaxed font-normal">
                    {product.description}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <PackageCheck
                  className={`w-4 h-4 ${inStock ? 'text-teal-deep' : 'text-slate-400'}`}
                  strokeWidth={1.5}
                />
                <span
                  className={`text-sm font-normal ${inStock ? 'text-teal-deep' : 'text-slate-400'}`}
                >
                  {inStock
                    ? `${stock} units available`
                    : 'Currently unavailable'}
                </span>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-granite/8">
              <Button
                size="lg"
                fullWidth
                onClick={handleAddToCart}
                disabled={!inStock}
                variant={added ? 'secondary' : 'primary'}
                className="py-3 gap-2"
              >
                {added ? (
                  <>
                    <Check className="w-4 h-4 text-teal-deep" strokeWidth={1.5} />
                    <span className="text-teal-deep font-medium">Added to cart</span>
                  </>
                ) : inStock ? (
                  <>
                    <ShoppingCart className="w-4 h-4" strokeWidth={1.5} />
                    <span>Add to cart</span>
                  </>
                ) : (
                  'Out of stock'
                )}
              </Button>

              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                {[
                  [Truck, 'Fast delivery'],
                  [ShieldCheck, 'Verified stock'],
                  [RotateCcw, 'Easy returns'],
                ].map(([Icon, label]) => (
                  <div
                    key={label}
                    className="flex flex-col items-center gap-1 p-2 rounded-md"
                  >
                    <Icon className="w-4 h-4 text-slate-400" strokeWidth={1.25} />
                    <span className="text-[11px] font-normal text-slate-500">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {similarProducts.length > 0 && (
        <div className="mt-12 pt-8 border-t border-granite/10">
          <div className="flex items-center gap-2 mb-5">
            <Sparkles className="w-5 h-5 text-sea-green" />
            <h2 className="text-lg font-semibold text-charcoal">Similar products</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {similarProducts.map((sim) => (
              <Link
                key={sim.id}
                to={`/products/${sim.id}`}
                className="panel-quiet p-4 hover:border-granite/20 ui-transition group flex flex-col justify-between"
              >
                <div>
                  <ProductImage
                    imageUrl={sim.image_url}
                    name={sim.name}
                    width={56}
                    height={56}
                    className="rounded-md mb-3 border border-granite/8"
                  />
                  <p className="font-semibold text-charcoal text-sm line-clamp-2 group-hover:text-granite ui-transition">
                    {sim.name}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-medium">
                    {sim.category}
                  </p>
                </div>
                <div className="mt-4 pt-2 border-t border-granite/8 flex items-center justify-between text-xs font-medium text-granite/60">
                  <span className="font-semibold text-charcoal">${Number(sim.price || 0).toFixed(2)}</span>
                  <span className="group-hover:translate-x-0.5 ui-transition">→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="mt-12 pt-8 border-t border-granite/10">
          <h2 className="text-lg font-semibold text-charcoal mb-5">Customers also viewed</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {recommendations.map((rec) => (
              <Link
                key={rec.product_id}
                to={`/products/${rec.product_id}`}
                className="panel-quiet p-4 hover:border-granite/20 ui-transition group flex flex-col justify-between"
              >
                <div>
                  <ProductImage
                    imageUrl={rec.image_url}
                    name={rec.name}
                    width={56}
                    height={56}
                    className="rounded-md mb-3 border border-granite/8"
                  />
                  <p className="font-semibold text-charcoal text-sm line-clamp-2 group-hover:text-granite ui-transition">
                    {rec.name}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-medium">
                    {rec.category}
                  </p>
                </div>
                <div className="mt-4 pt-2 border-t border-granite/8 flex items-center justify-between text-xs font-medium text-granite/60">
                  <span>View</span>
                  <span className="group-hover:translate-x-0.5 ui-transition">→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
