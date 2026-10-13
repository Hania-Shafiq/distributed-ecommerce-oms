/**
 * pages/Home/Home.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Landing page — modern hero banner, personalized recommendations,
 * and featured live catalog products.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Sparkles,
  ShoppingBag,
  Zap,
  ShieldCheck,
  TrendingUp,
  PackageCheck,
} from 'lucide-react';
import { getProducts } from '../../api/productApi';
import { getUserRecommendations } from '../../api/recommendationApi';
import { useAuth } from '../../hooks/useAuth';
import { useCart } from '../../context/CartContext';
import ProductCard from '../../components/ProductCard';
import Button from '../../components/Button';

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const { addToCart } = useCart();
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const products = await getProducts(0, 4);
        setFeaturedProducts(products || []);

        if (isAuthenticated && user?.id) {
          const recs = await getUserRecommendations(user.id, 4);
          setRecommendations(recs || []);
        }
      } catch (err) {
        console.warn('Failed to load home products:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [isAuthenticated, user?.id]);

  return (
    <div className="flex flex-col gap-12 pb-16">
      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-shadow-grey via-granite to-sea-green text-white py-20 md:py-28 px-4 sm:px-6 lg:px-8">
        {/* Subtle decorative background circles */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-white/5 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 rounded-full bg-sea-green/20 blur-3xl pointer-events-none" />

        <div className="relative max-w-4xl mx-auto text-center flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-dry-sage text-xs font-semibold tracking-wide uppercase mb-6 shadow-2xs">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Next-Generation E-Commerce</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1] mb-6">
            Shop Smarter. <br />
            <span className="text-dry-sage">Engineered for Reliability.</span>
          </h1>

          <p className="text-ash-grey text-base sm:text-lg md:text-xl max-w-2xl leading-relaxed mb-10">
            Explore a curated catalog with instant search, real-time verified inventory,
            and seamless end-to-end order fulfillment.
          </p>

          <div className="flex flex-wrap justify-center items-center gap-4 w-full sm:w-auto">
            <Link to="/products" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto px-8 gap-2.5 shadow-lg shadow-sea-green/20">
                <span>Explore Catalog</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/orders" className="w-full sm:w-auto">
              <Button
                size="lg"
                variant="secondary"
                className="w-full sm:w-auto px-8 bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-xs"
              >
                Track Orders
              </Button>
            </Link>
          </div>

          {/* Quick value props pill bar */}
          <div className="mt-14 pt-8 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-8 text-left w-full max-w-3xl">
            <div className="flex items-center gap-2.5">
              <Zap className="w-4 h-4 text-dry-sage shrink-0" />
              <span className="text-xs font-medium text-ash-grey">Instant Search</span>
            </div>
            <div className="flex items-center gap-2.5">
              <PackageCheck className="w-4 h-4 text-dry-sage shrink-0" />
              <span className="text-xs font-medium text-ash-grey">Live Stock Sync</span>
            </div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-dry-sage shrink-0" />
              <span className="text-xs font-medium text-ash-grey">Secure Checkout</span>
            </div>
            <div className="flex items-center gap-2.5">
              <TrendingUp className="w-4 h-4 text-dry-sage shrink-0" />
              <span className="text-xs font-medium text-ash-grey">Smart Suggestions</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Personalized Recommendations (Logged-in User) ── */}
      {recommendations.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-gray-200/60">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-sea-green" />
                <h2 className="text-xl sm:text-2xl font-extrabold text-granite">Recommended For You</h2>
              </div>
              <p className="text-gray-500 text-xs sm:text-sm mt-0.5">
                Curated items based on your purchase history and browsing interests
              </p>
            </div>
            <Link
              to="/products"
              className="text-sea-green font-semibold text-xs sm:text-sm hover:underline flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {recommendations.map(rec => (
              <div
                key={rec.product_id}
                className="bg-white rounded-2xl border border-gray-200/80 shadow-xs hover:shadow-md p-5 transition-all flex flex-col justify-between group"
              >
                <div>
                  <span className="text-[10px] font-bold text-sea-green uppercase tracking-wider bg-sea-green/10 px-2.5 py-0.5 rounded">
                    {rec.category}
                  </span>
                  <h3 className="font-bold text-granite text-base mt-2.5 group-hover:text-sea-green transition-colors line-clamp-2">
                    {rec.name}
                  </h3>
                </div>
                <Link to={`/products/${rec.product_id}`} className="mt-5">
                  <Button size="sm" fullWidth variant="secondary">
                    View Details
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Featured Products Grid ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="flex items-center justify-between mb-6 pb-2 border-b border-gray-200/60">
          <div>
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-sea-green" />
              <h2 className="text-xl sm:text-2xl font-extrabold text-granite">Featured Products</h2>
            </div>
            <p className="text-gray-500 text-xs sm:text-sm mt-0.5">
              Hand-picked highlights from our live product catalog
            </p>
          </div>
          <Link
            to="/products"
            className="text-sea-green font-semibold text-xs sm:text-sm hover:underline flex items-center gap-1"
          >
            <span>Browse All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          /* High-quality skeleton loading cards */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(n => (
              <div
                key={n}
                className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-4 flex flex-col gap-3 animate-pulse"
              >
                <div className="h-40 bg-gray-200 rounded-xl" />
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="h-5 bg-gray-200 rounded w-4/5" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
                <div className="h-9 bg-gray-200 rounded-xl mt-3" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={p => addToCart(p)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Features / Architecture Highlights ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pt-6">
        <div className="text-center max-w-xl mx-auto mb-10">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-granite">
            Why Shop With OMSStore
          </h2>
          <p className="text-gray-500 text-sm mt-2">
            Every layer is built for smooth speed, accuracy, and absolute peace of mind.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl border border-gray-200/70 p-6 sm:p-8 shadow-xs hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-2xl bg-sea-green/10 text-sea-green flex items-center justify-center mb-5">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-granite mb-2">Fast Typo-Tolerant Search</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Find exactly what you want in milliseconds, even with partial names or typos,
              using our real-time indexed search engine.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200/70 p-6 sm:p-8 shadow-xs hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-2xl bg-granite/10 text-granite flex items-center justify-center mb-5">
              <PackageCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-granite mb-2">Guaranteed Order Sync</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Real-time multi-service order processing guarantees your stock is reserved
              the instant you place your order.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200/70 p-6 sm:p-8 shadow-xs hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-2xl bg-dry-sage/20 text-granite flex items-center justify-center mb-5">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-granite mb-2">Smart Personalization</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Discover relevant accessories and related products tailored to customer
              purchase behaviors and preferences.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
