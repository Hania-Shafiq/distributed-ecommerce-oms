/**
 * pages/Home/Home.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Editorial Homepage with balanced light-and-dark design & integrated animations:
 * - Rotating and pulsing hero hexagon motif (.hero-hexagon-motif)
 * - Fade-in-up animated headline and subtitle (.animate-fade-in-up)
 * - Slide-in-right Live Warehouse Feed widget (.animate-slide-in-right)
 * - Pulsing glowing live status dot (.animate-pulse-glow)
 * - StatCountUp scroll-triggered count-up animations (TrustStatsSection)
 * - Modern visual product cards, ratings, stock pills, and category departments
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, PackageCheck, ShieldCheck, Truck } from 'lucide-react';
import { getProducts } from '../../api/productApi';
import { getUserRecommendations } from '../../api/recommendationApi';
import { useAuth } from '../../hooks/useAuth';
import { useCart } from '../../context/CartContext';
import useReveal from '../../hooks/useReveal';
import ProductCard from '../../components/ProductCard';
import ProductImage from '../../components/ProductImage';
import CategoryIcon, { categoryGradient } from '../../components/CategoryIcon';

const SHOP_CATEGORIES = [
  { name: 'Electronics', image: '/images/categories/electronics.jpg' },
  { name: 'Furniture', image: '/images/categories/furniture.jpg' },
  { name: 'Kitchen', image: '/images/categories/kitchen.jpg' },
  { name: 'Sports & Outdoors', image: '/images/categories/sports-outdoors.jpg' },
  { name: 'Accessories', image: '/images/categories/accessories.jpg' },
];

const TRUST_POINTS = [
  {
    icon: PackageCheck,
    title: 'Live Stock Sync',
    desc: 'Real-time database verification before every checkout',
    target: 100,
    prefix: '',
    suffix: '%',
  },
  {
    icon: ShieldCheck,
    title: 'Verified Catalog',
    desc: 'High-integrity products calibrated to real OMS metrics',
    target: 417,
    prefix: '',
    suffix: '+',
  },
  {
    icon: Truck,
    title: 'Fast Fulfillment',
    desc: 'Automated SAGA reservation and instant order tracking',
    target: 15,
    prefix: '< ',
    suffix: 'ms',
  },
];

// ── Animated Stat Count-Up Component (User's Animation) ──
function StatCountUp({ target, prefix = '', suffix = '', active }) {
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!active) return;

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVal(target);
      return;
    }

    let start = null;
    const duration = 1200;
    let frameId;

    const tick = (now) => {
      if (!start) start = now;
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(ease * target));

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        setVal(target);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [active, target]);

  return (
    <span className="text-base sm:text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
      {prefix}{val}{suffix}
    </span>
  );
}

// ── Scroll-Triggered Animated Trust & Value Section ──
function TrustStatsSection() {
  const [inView, setInView] = useState(false);
  const sectionRef = useRef(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -20px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`bg-[#ECF7F3] dark:bg-[#0E1B16] border-b border-emerald-900/10 dark:border-white/10 py-4.5 transition-all duration-700 ease-out ${
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="page-container">
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-emerald-900/10 dark:divide-white/10">
          {TRUST_POINTS.map(({ icon: Icon, title, desc, target, prefix, suffix }) => (
            <div key={title} className="flex items-center gap-3.5 px-4 py-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white dark:bg-[#14231E] text-emerald-800 dark:text-emerald-400 shrink-0 border border-emerald-200/80 dark:border-white/10 shadow-xs">
                <Icon className="w-5 h-5 text-emerald-700 dark:text-emerald-400" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <StatCountUp
                    target={target}
                    prefix={prefix}
                    suffix={suffix}
                    active={inView}
                  />
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-900 dark:text-[#E6EFEA] truncate">
                    {title}
                  </h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

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
  if (n <= 0) return { text: 'Out of stock', live: false, count: 0 };
  return { text: `${n} units available`, live: true, count: n };
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
          const recs = await getUserRecommendations(user.id, 8);
          const seen = new Set();
          const uniqueRecs = (recs || []).filter((r) => {
            const key = (r.name || '').trim().toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          }).slice(0, 4);
          setRecommendations(uniqueRecs);
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
    <div className="bg-[#F4F7F5] dark:bg-[#0B1411] min-h-screen">
      {/* ── Deep Charcoal/Green Dark Hero Section ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#0A1612] via-[#0D1F19] to-[#122A21] text-white pt-14 pb-16 md:pt-18 md:pb-22 border-b border-emerald-950/80">
        {/* Layer 1: Subtle Blueprint Texture & Aurora Glow */}
        <div className="absolute inset-0 bg-blueprint-dots opacity-25 pointer-events-none" aria-hidden="true" />
        <div
          className="absolute -top-32 right-1/4 w-130 h-130 rounded-full bg-emerald-500/12 blur-[140px] pointer-events-none"
          aria-hidden="true"
        />

        {/* Layer 2: Geometric Hexagon Decoration (With User's Slow Rotation & Pulse Animation) */}
        <div className="absolute right-12 top-10 w-96 h-96 pointer-events-none hidden md:block hero-hexagon-motif" aria-hidden="true">
          <svg className="w-full h-full text-emerald-400" viewBox="0 0 100 100" fill="none" stroke="currentColor">
            <polygon points="50,3 93,28 93,78 50,103 7,78 7,28" strokeWidth="0.75" />
            <polygon points="50,15 82,34 82,72 50,91 18,72 18,34" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.6" />
          </svg>
        </div>

        <div className="page-container relative z-10">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            {/* Primary Hero Column */}
            <div className="lg:col-span-7 flex flex-col items-start text-left">
              {/* Eyebrow Label */}
              <div className="inline-flex items-center gap-2 text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider mb-3">
                <span className="text-[#34D399]">★</span>
                <span>FEATURED</span>
              </div>

              {/* Headline with User's Fade-In-Up Animation */}
              <h1 className="text-3xl sm:text-5xl lg:text-[3.25rem] font-extrabold tracking-tight leading-[1.12] mb-5 text-white max-w-xl animate-fade-in-up">
                Precision inventory with{' '}
                <span className="text-[#34D399]">verified stock counts.</span>
              </h1>

              {/* Subtitle with User's Delayed Fade-In-Up Animation */}
              <p className="text-emerald-100/75 text-base sm:text-lg max-w-lg leading-relaxed mb-8 font-normal animate-fade-in-up animate-delay-200">
                Curated electronics, tools, and everyday essentials. Every SKU is synchronized
                with real-time distributed warehouse manifests prior to checkout.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-4">
                <Link to="/products">
                  <button className="bg-[#107C55] hover:bg-[#0E6847] text-white px-7 py-3 rounded-full font-bold text-sm inline-flex items-center gap-2 shadow-lg hover:shadow-emerald-900/40 transition-all active:translate-y-0.5 cursor-pointer">
                    <span>Shop All Products</span>
                    <ArrowRight className="w-4 h-4" strokeWidth={2} />
                  </button>
                </Link>
                <Link to="/orders">
                  <button className="bg-transparent hover:bg-white/[0.06] text-white border border-white/20 hover:border-white/40 px-6 py-3 rounded-full font-semibold text-sm transition-all cursor-pointer">
                    View Orders
                  </button>
                </Link>
              </div>
            </div>

            {/* Live Warehouse Feed Widget with User's Slide-In-Right Animation */}
            <div className="lg:col-span-5 hidden lg:block">
              <div className="bg-[#0B1A15] border border-emerald-500/20 rounded-2xl p-5 shadow-[0_16px_36px_rgba(0,0,0,0.45)] backdrop-blur-md animate-slide-in-right">
                {/* Header Row */}
                <div className="flex items-center justify-between pb-3.5 mb-3 border-b border-emerald-950/80">
                  <div className="flex items-center gap-2.5">
                    {/* User's Pulsing Glow Animation */}
                    <span className="stock-dot-live animate-pulse-glow w-2.5 h-2.5 rounded-full bg-emerald-400" aria-hidden />
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                      Live Warehouse Feed
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-300 font-bold bg-emerald-950/80 px-2.5 py-0.5 rounded border border-emerald-500/30">
                    SYNC 200 OK
                  </span>
                </div>

                {loading && liveStockItems.length === 0 ? (
                  <div className="space-y-3 animate-pulse py-2">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="flex items-center gap-3 py-2">
                        <div className="w-10 h-10 rounded-xl bg-white/5 shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-white/5 rounded w-3/4" />
                          <div className="h-2.5 bg-white/5 rounded w-1/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ul className="divide-y divide-emerald-950/60">
                    {liveStockItems.map((product) => {
                      const stock = stockLabel(product.stock_quantity);
                      return (
                        <li key={product.id}>
                          <Link
                            to={`/products/${product.id}`}
                            className="flex items-center gap-3.5 py-2.5 group hover:bg-white/[0.04] rounded-xl px-2 transition-colors"
                          >
                            <ProductImage
                              imageUrl={product.image_url}
                              name={product.name}
                              category={product.category}
                              width={40}
                              height={40}
                              className="rounded-xl shrink-0 border border-emerald-500/20 bg-emerald-950 overflow-hidden"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-white/95 group-hover:text-emerald-300 transition-colors line-clamp-1">
                                {product.name}
                              </p>
                              <div className="mt-0.5 flex items-center justify-between text-xs font-mono">
                                <span className="text-emerald-400 font-medium">
                                  {stock.text}
                                </span>
                                <span className="text-white font-bold tabular-nums">
                                  ${Number(product.price || 0).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Footer Metadata */}
                <div className="mt-3.5 pt-3 border-t border-emerald-950/80 flex items-center justify-between text-[10px] font-mono text-emerald-200/50">
                  <span>POSTGRES V16 // REPLICA 0</span>
                  <span>LATENCY &lt; 15MS</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Scroll-Triggered Animated Trust & Value Section ── */}
      <TrustStatsSection />

      {/* ── Main Catalog Preview Content ── */}
      <div className="page-container py-14 sm:py-16 space-y-16">
        {/* ── Featured Products Section ── */}
        <RevealSection>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-8">
            <div>
              <div className="section-eyebrow mb-1 text-emerald-700 dark:text-emerald-400 font-mono text-xs uppercase font-bold tracking-wider">
                <span>02 / FEATURED ITEMS</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-[#E6EFEA] tracking-tight">
                Featured Catalog Selection
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-normal">
                High-demand products with guaranteed stock allocation
              </p>
            </div>
            <Link
              to="/products"
              className="text-sm font-mono font-bold text-emerald-800 dark:text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-300 transition-colors inline-flex items-center gap-1.5"
            >
              <span>SEE ALL CATALOG</span>
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="bg-white dark:bg-[#111C18] rounded-2xl border border-emerald-950/10 dark:border-white/10 p-4 flex flex-col gap-3 animate-pulse shadow-xs"
                >
                  <div className="aspect-[16/10] bg-[#EAEFEA] dark:bg-[#1A2C26] rounded-xl" />
                  <div className="h-4 bg-[#EAEFEA] dark:bg-[#1A2C26] rounded w-3/4 mt-1" />
                  <div className="h-3 bg-[#EAEFEA] dark:bg-[#1A2C26] rounded w-1/3" />
                  <div className="h-9 bg-[#EAEFEA] dark:bg-[#1A2C26] rounded-xl mt-3" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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

        {/* ── Recommendations Section (Authenticated) ── */}
        {recommendations.length > 0 && (
          <RevealSection className="pt-2 border-t border-slate-200/80 dark:border-white/10">
            <div className="mb-8">
              <div className="section-eyebrow mb-1 text-emerald-700 dark:text-emerald-400 font-mono text-xs uppercase font-bold tracking-wider">
                <span>03 / GRAPH AFFINITY</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-[#E6EFEA] tracking-tight">
                Recommended For Your Profile
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-normal">
                Computed via Neo4j co-purchase traversal and historical affinities
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {recommendations.map((rec) => (
                <Link
                  key={rec.product_id}
                  to={`/products/${rec.product_id}`}
                  className="bg-white dark:bg-[#111C18] rounded-2xl border border-emerald-950/10 dark:border-white/10 hover:border-emerald-600/30 dark:hover:border-emerald-500/40 flex flex-col group overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(20,50,35,0.08)] shadow-xs"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-[#F4F7F5] dark:bg-[#15241F]">
                    <ProductImage
                      imageUrl={rec.image_url}
                      name={rec.name}
                      category={rec.category}
                      className="w-full h-full"
                      imgClassName="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300 ease-out"
                    />
                    <span className="absolute top-2.5 left-2.5 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-200 bg-white/95 dark:bg-[#111C18]/95 px-2.5 py-0.5 rounded-full shadow-xs">
                      {rec.category}
                    </span>
                  </div>
                  <div className="p-4 flex flex-col flex-1">
                    <h3 className="font-bold text-slate-900 dark:text-[#E6EFEA] text-sm group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors line-clamp-1">
                      {rec.name}
                    </h3>
                    <div className="mt-auto pt-3 flex items-center justify-between text-xs font-mono">
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold">★ AFFINITY MATCH</span>
                      <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 group-hover:text-emerald-800 dark:group-hover:text-emerald-300 font-semibold">
                        VIEW
                        <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </RevealSection>
        )}

        {/* ── Shop By Category Section ── */}
        <RevealSection className="pt-2 border-t border-slate-200/80 dark:border-white/10">
          <div className="mb-8">
            <div className="section-eyebrow mb-1 text-emerald-700 dark:text-emerald-400 font-mono text-xs uppercase font-bold tracking-wider">
              <span>04 / DEPARTMENTS</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-[#E6EFEA] tracking-tight">
              Browse Departments
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-normal">
              Direct access to our structured product classifications
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {SHOP_CATEGORIES.map(({ name: category }) => (
              <Link
                key={category}
                to={`/products?category=${encodeURIComponent(category)}`}
                className="bg-white dark:bg-[#111C18] rounded-2xl border border-emerald-950/10 dark:border-white/10 hover:border-emerald-600/30 dark:hover:border-emerald-500/40 hover:shadow-md flex flex-col group overflow-hidden transition-all duration-200 hover:-translate-y-0.5"
              >
                <div
                  className={`aspect-[16/10] bg-linear-to-br ${categoryGradient(category)} flex items-center justify-center`}
                >
                  <CategoryIcon
                    category={category}
                    className="w-8 h-8 text-white/80 group-hover:text-white transition-colors"
                  />
                </div>
                <div className="px-3.5 py-3 flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-[#E6EFEA] tracking-tight line-clamp-1">
                    {category}
                  </span>
                  <ArrowRight
                    className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all shrink-0"
                    strokeWidth={2}
                  />
                </div>
              </Link>
            ))}
          </div>
        </RevealSection>
      </div>

      {/* ── Closing Editorial CTA ── */}
      <section className="bg-gradient-to-b from-[#0D1F19] to-[#0A1612] text-white border-t border-emerald-950/80 py-14">
        <div className="page-container flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <div className="text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider mb-1">
              <span>EXPLORE ALL INVENTORY</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Ready to explore the complete catalog?
            </h3>
            <p className="text-xs text-emerald-100/60 mt-1 font-mono">
              Search by SKU, semantic concept, or category filters.
            </p>
          </div>
          <Link to="/products">
            <button className="bg-[#107C55] hover:bg-[#0E6847] text-white px-7 py-3 rounded-full font-bold text-sm inline-flex items-center gap-2 shadow-md transition-all cursor-pointer">
              <span>Open Catalog</span>
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </button>
          </Link>
        </div>
      </section>
    </div>
  );
}
