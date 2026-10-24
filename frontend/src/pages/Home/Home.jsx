/**
 * pages/Home/Home.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Editorial Homepage with layered hero composition, blueprint dot-grid & hexagon
 * motifs, slim trust/value strip, and mono eyebrow hierarchy.
 * All API calls, auth, and state logic remain 100% identical.
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
import Button from '../../components/Button';
import CategoryIcon, { categoryGradient } from '../../components/CategoryIcon';

const SHOP_CATEGORIES = [
  { name: 'Electronics', image: '/images/categories/electronics.jpg' },
  { name: 'Furniture', image: '/images/categories/furniture.jpg' },
  { name: 'Kitchen', image: '/images/categories/kitchen.jpg' },
  { name: 'Sports & Outdoors', image: '/images/categories/sports-outdoors.jpg' },
  { name: 'Accessories', image: '/images/categories/accessories.jpg' },
];

const CATEGORY_IMAGES = {
  'Electronics': '/images/categories/electronics.jpg',
  'Furniture': '/images/categories/furniture.jpg',
  'Kitchen': '/images/categories/kitchen.jpg',
  'Sports & Outdoors': '/images/categories/sports.jpg',
  'Accessories': '/images/categories/accessories.jpg',
};

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
    target: 580,
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
    <span className="text-base sm:text-lg font-bold font-mono text-sea-green tabular-nums">
      {prefix}{val}{suffix}
    </span>
  );
}

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
      className={`bg-white border-b border-shadow-grey/8 py-4 transition-all duration-700 ease-out ${
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="page-container">
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-shadow-grey/8">
          {TRUST_POINTS.map(({ icon: Icon, title, desc, target, prefix, suffix }) => (
            <div key={title} className="flex items-center gap-3.5 px-4 py-2.5">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-sea-green-light text-sea-green shrink-0 border border-sea-green/20">
                <Icon className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <StatCountUp
                    target={target}
                    prefix={prefix}
                    suffix={suffix}
                    active={inView}
                  />
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-charcoal truncate">
                    {title}
                  </h4>
                </div>
                <p className="text-xs text-slate-500 font-normal mt-0.5">
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
    <div className="bg-canvas min-h-screen">
      {/* ── Layered Editorial Hero ── */}
      <section className="relative overflow-hidden bg-plum-mid text-white pt-16 pb-16 md:pt-20 md:pb-24 border-b border-white/8">
        {/* Layer 1: Blueprint Dot-Grid & Fine Geometry Texture */}
        <div className="absolute inset-0 bg-blueprint-dots opacity-40 pointer-events-none" aria-hidden="true" />
        
        {/* Layer 2: Soft Deep Green Radial Glow (Subtle & Restrained) */}
        <div
          className="absolute -top-24 right-1/4 w-125 h-125 rounded-full bg-sea-green/15 blur-[120px] pointer-events-none"
          aria-hidden="true"
        />

        {/* Layer 3: Architectural Outlined Hexagons at Different Scales */}
        <div className="absolute right-12 top-10 w-96 h-96 pointer-events-none hidden md:block hero-hexagon-motif" aria-hidden="true">
          {/* Large Outlined Hexagon */}
          <svg className="w-full h-full text-dry-sage" viewBox="0 0 100 100" fill="none" stroke="currentColor">
            <polygon points="50,3 93,28 93,78 50,103 7,78 7,28" strokeWidth="0.75" />
            <polygon points="50,15 82,34 82,72 50,91 18,72 18,34" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.6" />
          </svg>
          {/* Small Concentric Hexagon */}
          <svg className="absolute top-16 right-16 w-36 h-36 text-sea-green" viewBox="0 0 100 100" fill="none" stroke="currentColor">
            <polygon points="50,3 93,28 93,78 50,103 7,78 7,28" strokeWidth="1" />
          </svg>
        </div>

        <div className="page-container relative z-10">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            {/* Primary Editorial Content */}
            <div className="lg:col-span-7 flex flex-col items-start text-left">
              {/* Eyebrow Label */}
              <div className="section-eyebrow text-dry-sage mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-sea-green" />
                <span>01 / ENTERPRISE CATALOG</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-semibold tracking-tight leading-[1.08] mb-5 text-white max-w-xl animate-fade-in-up">
                Precision inventory with verified stock counts.
              </h1>

              <p className="text-ash-grey/85 text-base sm:text-lg max-w-lg leading-relaxed mb-8 font-normal animate-fade-in-up animate-delay-200">
                Curated electronics, tools, and everyday essentials. Every SKU is synchronized
                with real-time distributed warehouse manifests prior to checkout.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <Link to="/products">
                  <Button size="lg" className="px-8 gap-2.5">
                    <span>Shop All Products</span>
                    <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                  </Button>
                </Link>
                <Link to="/orders">
                  <Button variant="outline" size="lg" className="px-6 text-white border-white/20 hover:bg-white/6 hover:border-white/30">
                    <span>View Orders</span>
                  </Button>
                </Link>
              </div>
            </div>

            {/* Live Stock Widget with Clear Structural Hierarchy */}
            <div className="lg:col-span-5 hidden lg:block">
              <div className="bg-shadow-grey border border-white/10 rounded-xl p-5 shadow-[0_12px_32px_rgba(0,0,0,0.35)] animate-slide-in-right">
                {/* Header Row */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/8">
                  <div className="flex items-center gap-2">
                    <span className="stock-dot-live animate-pulse-glow w-2 h-2 rounded-full" aria-hidden />
                    <span className="text-xs font-mono font-semibold uppercase tracking-wider text-white">
                      Live Warehouse Feed
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-dry-sage bg-white/4 px-2 py-0.5 rounded border border-white/6">
                    SYNC 200 OK
                  </span>
                </div>

                {loading && liveStockItems.length === 0 ? (
                  <div className="space-y-3 animate-pulse py-2">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="flex items-center gap-3 py-2">
                        <div className="w-10 h-10 rounded-lg bg-white/5 shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-white/5 rounded w-3/4" />
                          <div className="h-2.5 bg-white/5 rounded w-1/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ul className="divide-y divide-white/6">
                    {liveStockItems.map((product) => {
                      const stock = stockLabel(product.stock_quantity);
                      return (
                        <li key={product.id}>
                          <Link
                            to={`/products/${product.id}`}
                            className="flex items-center gap-3 py-2.5 group hover:bg-white/2 rounded-lg px-1.5 transition-colors"
                          >
                            <ProductImage
                              imageUrl={product.image_url}
                              name={product.name}
                              width={36}
                              height={36}
                              className="rounded-lg shrink-0 border border-white/8 bg-plum-deep"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-white/95 group-hover:text-dry-sage transition-colors line-clamp-1">
                                {product.name}
                              </p>
                              <div className="mt-1 flex items-center justify-between text-xs font-mono">
                                <span className="text-emerald-400 font-medium">
                                   {stock.text}
                                </span>
                                <span className="text-gilt font-semibold tabular-nums">
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

                {/* Footer Timestamp */}
                <div className="mt-3 pt-3 border-t border-white/6 flex items-center justify-between text-[10px] font-mono text-ash-grey/40">
                  <span>POSTGRES V16 // REPLICA 0</span>
                  <span>LATENCY &lt; 15MS</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Value & Trust Stat Cards ── */}
      <TrustStatsSection />

      {/* ── Main Page Content ── */}
      <div className="page-container py-14 sm:py-16 space-y-16">
        {/* ── Featured Products Section ── */}
        <RevealSection>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-8">
            <div>
              <div className="section-eyebrow mb-1">
                <span>02 / FEATURED ITEMS</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold text-charcoal tracking-tight">
                Featured Catalog Selection
              </h2>
              <p className="text-slate-500 text-sm mt-1 font-normal">
                High-demand products with guaranteed stock allocation
              </p>
            </div>
            <Link
              to="/products"
              className="text-sm font-mono font-semibold text-granite hover:text-sea-green transition-colors inline-flex items-center gap-1.5"
            >
              <span>SEE ALL CATALOG</span>
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="bg-white rounded-xl border border-shadow-grey/8 p-4 flex flex-col gap-3 animate-pulse"
                >
                  <div className="aspect-4/3 bg-surface-subtle rounded-lg" />
                  <div className="h-3 bg-surface-subtle rounded w-1/4" />
                  <div className="h-4 bg-surface-subtle rounded w-3/4" />
                  <div className="h-9 bg-surface-subtle rounded-lg mt-2" />
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

        {/* ── Personal Picks (Authenticated Only) ── */}
        {recommendations.length > 0 && (
          <RevealSection className="pt-2 border-t border-shadow-grey/8">
            <div className="mb-8">
              <div className="section-eyebrow mb-1">
                <span>03 / GRAPH AFFINITY</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold text-charcoal tracking-tight">
                Recommended For Your Profile
              </h2>
              <p className="text-slate-500 text-sm mt-1 font-normal">
                Computed via Neo4j co-purchase traversal and historical affinities
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {recommendations.map((rec) => (
                <Link
                  key={rec.product_id}
                  to={`/products/${rec.product_id}`}
                  className="bg-white rounded-xl border border-shadow-grey/8 hover:border-shadow-grey/18 flex flex-col group overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(26,22,31,0.06)]"
                >
                  <div className="relative aspect-4/3 overflow-hidden bg-surface-subtle">
                    <ProductImage
                      imageUrl={rec.image_url}
                      name={rec.name}
                      className="w-full h-full"
                      imgClassName="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300 ease-out"
                    />
                    <span className="absolute top-2.5 left-2.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-granite bg-white/95 px-2 py-0.5 rounded shadow-xs">
                      {rec.category}
                    </span>
                  </div>
                  <div className="p-4 flex flex-col flex-1">
                    <h3 className="font-semibold text-charcoal text-sm group-hover:text-sea-green transition-colors line-clamp-2">
                      {rec.name}
                    </h3>
                    <div className="mt-auto pt-3 flex items-center justify-between text-xs font-mono">
                      <span className="text-sea-green font-semibold">★ AFFINITY MATCH</span>
                      <span className="inline-flex items-center gap-1 text-slate-600 group-hover:text-charcoal">
                        VIEW
                        <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </RevealSection>
        )}

        {/* ── Shop By Category Section ── */}
        <RevealSection className="pt-2 border-t border-shadow-grey/8">
          <div className="mb-8">
            <div className="section-eyebrow mb-1">
              <span>04 / DEPARTMENTS</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-charcoal tracking-tight">
              Browse Departments
            </h2>
            <p className="text-slate-500 text-sm mt-1 font-normal">
              Direct access to our structured product classifications
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {SHOP_CATEGORIES.map(({ name: category }) => (
              <Link
                key={category}
                to={`/products?category=${encodeURIComponent(category)}`}
                className="elevation-card bg-white rounded-lg border border-granite/10 hover:border-granite/20 flex flex-col group overflow-hidden"
              >
                <div
                  className={`aspect-4/3 bg-linear-to-br ${categoryGradient(category)} flex items-center justify-center`}
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
                    className="w-3.5 h-3.5 text-slate-400 group-hover:text-sea-green group-hover:translate-x-0.5 transition-all shrink-0"
                    strokeWidth={1.75}
                  />
                </div>
              </Link>
            ))}
          </div>
        </RevealSection>
      </div>

      {/* ── Closing Editorial CTA ── */}
      <section className="bg-plum-mid text-white border-t border-white/8 py-14">
        <div className="page-container flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <div className="section-eyebrow text-dry-sage mb-1">
              <span>EXPLORE ALL INVENTORY</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
              Ready to explore the complete catalog?
            </h3>
            <p className="text-xs text-ash-grey/60 mt-1">
              Search by SKU, semantic concept, or category filters.
            </p>
          </div>
          <Link to="/products">
            <Button size="md" className="gap-2 px-6">
              <span>Open Catalog</span>
              <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
