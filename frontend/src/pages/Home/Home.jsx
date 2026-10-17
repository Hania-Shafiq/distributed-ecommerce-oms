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
import ProductImage from '../../components/ProductImage';
import Button from '../../components/Button';
import CategoryIcon, { categoryGradient } from '../../components/CategoryIcon';

const SHOP_CATEGORIES = [
  'Electronics',
  'Furniture',
  'Kitchen',
  'Sports & Outdoors',
  'Accessories',
];

const CATEGORY_IMAGES = {
  'Electronics': '/images/products/wireless-noise-cancelling-headphones.jpg',
  'Furniture': '/images/products/ergonomic-office-chair.jpg',
  'Kitchen': '/images/products/electric-kettle.jpg',
  'Sports & Outdoors': '/images/products/running-shoes-mens.jpg',
  'Accessories': '/images/products/leather-wallet.jpg',
};

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
        {/* Ambient depth layer — decorative only; sits behind content */}
        <div className="hero-deco" aria-hidden="true">
          <div className="hero-deco-orb hero-deco-orb--teal" />
          <div className="hero-deco-orb hero-deco-orb--sage" />
          <div className="hero-deco-orb hero-deco-orb--plum" />
          <div className="hero-deco-grid" />
          <svg
            className="hero-deco-geo hero-deco-geo--hex"
            viewBox="0 0 120 104"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M60 2L112 32V72L60 102L8 72V32L60 2Z"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinejoin="round"
            />
            <path
              d="M60 28L86 43V73L60 88L34 73V43L60 28Z"
              stroke="currentColor"
              strokeWidth="0.75"
              strokeLinejoin="round"
              opacity="0.55"
            />
          </svg>
          <svg
            className="hero-deco-geo hero-deco-geo--ring"
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="0.8" />
            <circle cx="50" cy="50" r="32" stroke="currentColor" strokeWidth="0.6" opacity="0.5" />
            <path
              d="M50 4V18M50 82V96M4 50H18M82 50H96"
              stroke="currentColor"
              strokeWidth="0.7"
              strokeLinecap="round"
              opacity="0.65"
            />
          </svg>
          <svg
            className="hero-deco-geo hero-deco-geo--poly"
            viewBox="0 0 90 90"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M45 6L78 28V62L45 84L12 62V28L45 6Z"
              stroke="currentColor"
              strokeWidth="0.9"
              strokeLinejoin="round"
            />
            <path
              d="M45 6V84M12 28L78 62M78 28L12 62"
              stroke="currentColor"
              strokeWidth="0.55"
              opacity="0.4"
            />
          </svg>
        </div>

        <div className="relative max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            {/* Primary reading column */}
            <div className="relative z-1 lg:col-span-7 flex flex-col items-start text-left">
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
            <div className="lg:col-span-5 hidden lg:block relative z-1">
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
                            <ProductImage
                              imageUrl={product.image_url}
                              name={product.name}
                              width={32}
                              height={32}
                              className="rounded-md shrink-0 border border-white/6"
                            />
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
                  <div className="aspect-16/10 bg-sage-mist rounded-md" />
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
                  <ProductImage
                    imageUrl={rec.image_url}
                    name={rec.name}
                    width={56}
                    height={56}
                    className="rounded-md mb-3 border border-granite/8"
                  />
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
                <div className="relative aspect-4/3 overflow-hidden bg-slate-100 flex items-center justify-center">
                  <img
                    src={CATEGORY_IMAGES[category]}
                    alt={category}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-charcoal/70 via-charcoal/20 to-transparent" />
                  <div className="absolute top-2.5 left-2.5 p-1.5 rounded-md bg-white/20 backdrop-blur-xs text-white">
                    <CategoryIcon category={category} className="w-4 h-4" />
                  </div>
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
