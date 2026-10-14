/**
 * pages/Home/Home.jsx
 * Clear hierarchy: hero → featured → categories → trust → CTA.
 * Data / auth / cart logic unchanged.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, PackageCheck, ShieldCheck, Truck } from 'lucide-react';
import { getProducts } from '../../api/productApi';
import { getUserRecommendations } from '../../api/recommendationApi';
import { useAuth } from '../../hooks/useAuth';
import { useCart } from '../../context/CartContext';
import useReveal from '../../hooks/useReveal';
import ProductCard from '../../components/ProductCard';
import Button from '../../components/Button';
import CategoryIcon, { categoryGradient } from '../../components/CategoryIcon';

const SHOP_CATEGORIES = [
  'Electronics',
  'Furniture',
  'Kitchen',
  'Sports & Outdoors',
  'Accessories',
];

const TRUST_POINTS = [
  {
    icon: PackageCheck,
    text: 'Live, verified stock before you buy',
  },
  {
    icon: ShieldCheck,
    text: 'Secure checkout on every order',
  },
  {
    icon: Truck,
    text: 'Fast fulfillment once you check out',
  },
];

function RevealSection({ children, className = '' }) {
  const ref = useReveal();
  return (
    <section ref={ref} className={`reveal-on-scroll ${className}`.trim()}>
      {children}
    </section>
  );
}

function stockLabel(qty) {
  const n = Number(qty || 0);
  if (n <= 0) return { text: 'Out of stock', live: false };
  return { text: `${n} in stock`, live: true };
}

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

  const liveStockItems = featuredProducts.slice(0, 3);

  return (
    <div className="bg-canvas min-h-screen">
      {/* ── Hero: one message, one action ── */}
      <section className="relative overflow-hidden surface-plum text-white pt-16 pb-16 md:pt-20 md:pb-24 px-4 sm:px-6 lg:px-8 border-b border-white/8">
        <div className="absolute top-0 right-0 w-[24rem] h-[24rem] rounded-full bg-teal-deep/10 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-plum-deep blur-[90px] pointer-events-none opacity-60" />

        <div className="relative max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            {/* Primary reading column */}
            <div className="lg:col-span-7 flex flex-col items-start text-left">
              <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-semibold tracking-tight leading-[1.08] mb-5 text-white max-w-xl">
                Shop products with live stock counts
              </h1>

              <p className="text-ash-grey/80 text-base sm:text-lg max-w-md leading-relaxed mb-8 font-normal">
                Everyday essentials, tools, and electronics. What you see in stock
                is what you can buy — checked before checkout.
              </p>

              <Link to="/products">
                <Button size="lg" className="px-8 gap-2.5">
                  <span>Shop products</span>
                  <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                </Button>
              </Link>
            </div>

            {/* Live Stock preview — supports headline, does not compete with CTA */}
            <div className="lg:col-span-5 hidden lg:block">
              <div className="glass-card-dark elevation-card-dark rounded-lg p-5 hero-stock-widget">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-ash-grey/50 font-normal">
                    Live stock
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-dry-sage/80">
                    <span className="stock-dot-live w-1.5 h-1.5 rounded-full" aria-hidden />
                    Updated
                  </span>
                </div>

                {loading && liveStockItems.length === 0 ? (
                  <div className="space-y-3 animate-pulse">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="flex items-center gap-3 py-2">
                        <div className="w-8 h-8 rounded-md bg-white/6 shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-white/6 rounded w-4/5" />
                          <div className="h-2.5 bg-white/6 rounded w-1/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ul className="divide-y divide-white/6">
                    {liveStockItems.map((product) => {
                      const stock = stockLabel(product.stock_quantity);
                      return (
                        <li key={product.id} className="hero-stock-row">
                          <Link
                            to={`/products/${product.id}`}
                            className="flex items-center gap-3 py-2.5 group"
                          >
                            <div
                              className={`w-8 h-8 rounded-md bg-gradient-to-br ${categoryGradient(product.category)} flex items-center justify-center shrink-0 border border-white/6`}
                            >
                              <CategoryIcon
                                category={product.category}
                                className="w-3.5 h-3.5 text-ash-grey/60"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-white/90 group-hover:text-dry-sage ui-transition line-clamp-1">
                                {product.name}
                              </p>
                              <p className="mt-0.5 flex items-center gap-1.5 text-xs font-normal">
                                {stock.live ? (
                                  <>
                                    <span
                                      className="stock-dot-live w-1.5 h-1.5 rounded-full shrink-0"
                                      aria-hidden
                                    />
                                    <span className="text-dry-sage/90">{stock.text}</span>
                                  </>
                                ) : (
                                  <span className="text-ash-grey/45">{stock.text}</span>
                                )}
                              </p>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16 space-y-16">
        {/* ── Featured products ── */}
        <RevealSection>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-7">
            <div>
              <h2 className="text-xl sm:text-2xl font-semibold text-charcoal tracking-tight">
                Featured products
              </h2>
              <p className="text-slate-500 text-sm mt-1 font-normal">
                A few items you can add to your cart right now
              </p>
            </div>
            <Link
              to="/products"
              className="text-sm font-medium text-granite hover:text-sea-green ui-transition inline-flex items-center gap-1.5"
            >
              <span>See all products</span>
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="elevation-card bg-white rounded-lg border border-granite/8 p-4 flex flex-col gap-3 animate-pulse"
                >
                  <div className="aspect-[16/10] bg-sage-mist rounded-md" />
                  <div className="h-3 bg-sage-mist rounded w-1/4" />
                  <div className="h-4 bg-sage-mist rounded w-3/4" />
                  <div className="h-8 bg-sage-mist rounded-md mt-2" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {featuredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={(p) => addToCart(p)}
                />
              ))}
            </div>
          )}
        </RevealSection>

        {/* ── Personal picks (only when logged in) ── */}
        {recommendations.length > 0 && (
          <RevealSection className="pt-2 border-t border-granite/10">
            <div className="mb-7">
              <h2 className="text-xl sm:text-2xl font-semibold text-charcoal tracking-tight">
                Suggested for you
              </h2>
              <p className="text-slate-500 text-sm mt-1 font-normal">
                Based on your recent orders and browsing
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {recommendations.map((rec) => (
                <Link
                  key={rec.product_id}
                  to={`/products/${rec.product_id}`}
                  className="panel-quiet p-5 flex flex-col group hover:border-granite/20"
                >
                  <div className="text-granite/40 mb-3">
                    <CategoryIcon category={rec.category} className="w-5 h-5" />
                  </div>
                  <span className="badge-category w-fit">{rec.category}</span>
                  <h3 className="font-semibold text-charcoal text-sm mt-2.5 group-hover:text-granite ui-transition line-clamp-2">
                    {rec.name}
                  </h3>
                  <span className="mt-auto pt-4 text-xs font-medium text-granite/55 inline-flex items-center gap-1">
                    View product
                    <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 ui-transition" strokeWidth={1.5} />
                  </span>
                </Link>
              ))}
            </div>
          </RevealSection>
        )}

        {/* ── Shop by category ── */}
        <RevealSection className="pt-2 border-t border-granite/10">
          <div className="mb-7">
            <h2 className="text-xl sm:text-2xl font-semibold text-charcoal tracking-tight">
              Shop by category
            </h2>
            <p className="text-slate-500 text-sm mt-1 font-normal">
              Jump straight to the aisle you need
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {SHOP_CATEGORIES.map((category) => (
              <Link
                key={category}
                to={`/products?category=${encodeURIComponent(category)}`}
                className="elevation-card bg-white rounded-lg border border-granite/10 hover:border-granite/20 flex flex-col group overflow-hidden"
              >
                <div
                  className={`aspect-[4/3] bg-gradient-to-br ${categoryGradient(category)} flex items-center justify-center`}
                >
                  <CategoryIcon
                    category={category}
                    className="w-7 h-7 text-ash-grey/70 group-hover:text-dry-sage ui-transition"
                  />
                </div>
                <div className="px-3 py-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-charcoal tracking-tight line-clamp-1">
                    {category}
                  </span>
                  <ArrowRight
                    className="w-3.5 h-3.5 text-granite/35 group-hover:text-sea-green group-hover:translate-x-0.5 ui-transition shrink-0"
                    strokeWidth={1.5}
                  />
                </div>
              </Link>
            ))}
          </div>
        </RevealSection>
      </div>

      {/* ── Why OMSStore (single instance) ── */}
      <RevealSection className="relative overflow-hidden surface-plum text-white border-y border-white/8">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-1/4 w-72 h-72 rounded-full bg-teal-deep/10 blur-[100px]" />
          <div className="absolute bottom-0 left-1/5 w-56 h-56 rounded-full bg-sea-green/5 blur-[80px]" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14">
          <div className="mb-8">
            <h2 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
              Why OMSStore
            </h2>
            <p className="text-ash-grey/60 text-sm mt-1 font-normal">
              What you can count on here
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            {TRUST_POINTS.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3.5">
                <div className="mt-0.5 text-dry-sage/80 shrink-0">
                  <Icon className="w-5 h-5" strokeWidth={1.25} aria-hidden />
                </div>
                <p className="text-sm text-ash-grey/85 font-normal leading-snug">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </RevealSection>

      {/* ── Closing CTA band ── */}
      <RevealSection className="bg-sage-mist/60 border-b border-granite/8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-sm sm:text-base font-medium text-charcoal tracking-tight">
            Ready to shop the full catalog?
          </p>
          <Link to="/products">
            <Button size="sm" className="gap-2">
              <span>Browse products</span>
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
            </Button>
          </Link>
        </div>
      </RevealSection>
    </div>
  );
}
