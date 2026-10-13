/**
 * pages/Home/Home.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Editorial, high-craft homepage with intentional asymmetry:
 *   • Split Hero with live interactive product spotlight
 *   • Industrial monospace ledger index tags & architectural status bar
 *   • Curated essentials catalog with verified stock
 *   • Personalized graph archive for authenticated users
 *   • "The OMSStore Standard" editorial technical ledger
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Sparkles,
  Check,
  Clock,
  Package,
  Laptop,
  Armchair,
  Coffee,
  Compass,
  Watch,
  Plus,
} from 'lucide-react';
import { getProducts } from '../../api/productApi';
import { getUserRecommendations } from '../../api/recommendationApi';
import { useAuth } from '../../hooks/useAuth';
import { useCart } from '../../context/CartContext';
import ProductCard from '../../components/ProductCard';
import Button from '../../components/Button';

function CategoryIcon({ category, className = 'w-6 h-6' }) {
  switch (category) {
    case 'Electronics':
      return <Laptop className={className} />;
    case 'Furniture':
      return <Armchair className={className} />;
    case 'Kitchen':
      return <Coffee className={className} />;
    case 'Sports & Outdoors':
      return <Compass className={className} />;
    case 'Accessories':
      return <Watch className={className} />;
    default:
      return <Package className={className} />;
  }
}

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const { addToCart } = useCart();
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [spotlightAdded, setSpotlightAdded] = useState(false);

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

  const leadProduct = featuredProducts[0] || null;

  function handleAddSpotlight() {
    if (!leadProduct) return;
    addToCart(leadProduct);
    setSpotlightAdded(true);
    setTimeout(() => setSpotlightAdded(false), 2200);
  }

  return (
    <div className="bg-[#F8FAFC] min-h-screen">
      {/* ── 1. ASYMMETRIC EDITORIAL HERO SECTION ── */}
      <section className="relative overflow-hidden bg-[#18131A] text-white pt-16 pb-20 md:pt-24 md:pb-28 px-4 sm:px-6 lg:px-8 border-b border-white/10">
        {/* Subtle geometric grid backdrop */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] pointer-events-none" />
        
        {/* Deep atmospheric glow */}
        <div className="absolute top-1/4 right-10 w-[30rem] h-[30rem] rounded-full bg-sea-green/10 blur-[140px] pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-96 h-96 rounded-full bg-granite/20 blur-[120px] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            {/* Left Column: Bold Editorial Copy (Col 1-7) */}
            <div className="lg:col-span-7 flex flex-col items-start text-left">
              {/* Mono Index Tag */}
              <div className="flex items-center gap-3 font-mono text-[11px] tracking-widest uppercase text-dry-sage mb-6">
                <span className="px-2 py-0.5 rounded bg-white/[0.08] border border-white/10 font-bold">
                  CATALOG // 2026 EDITION
                </span>
                <span className="flex items-center gap-1.5 text-ash-grey/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-sea-green animate-pulse" />
                  <span>AUTHORITATIVE LEDGER ACTIVE</span>
                </span>
              </div>

              {/* High-Impact Headline */}
              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight uppercase leading-[0.95] mb-6 text-white">
                PRECISION RETAIL. <br />
                <span className="text-dry-sage">ZERO SURPRISE STOCK.</span>
              </h1>

              {/* Human, authentic subtext */}
              <p className="text-ash-grey text-base sm:text-lg max-w-xl leading-relaxed mb-8 font-normal">
                Curated everyday essentials, culinary tools, and electronics. Every unit is
                checked against an authoritative inventory ledger before checkout, guaranteeing
                exact stock availability on every order.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto mb-10">
                <Link to="/products" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto px-8 gap-2.5 shadow-lg shadow-sea-green/20 text-base"
                  >
                    <span>Explore Catalog</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link to="/orders" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    variant="secondary"
                    className="w-full sm:w-auto px-7 bg-white/[0.06] hover:bg-white/[0.12] text-white border-white/20 backdrop-blur-xs text-base gap-2"
                  >
                    <Clock className="w-4 h-4 text-dry-sage" />
                    <span>Track Orders</span>
                  </Button>
                </Link>
              </div>

              {/* Department Quick Filter Rails */}
              <div className="pt-6 border-t border-white/10 w-full">
                <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-ash-grey/60 block mb-2.5">
                  DIRECT DEPARTMENT ACCESS:
                </span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Electronics', path: '/products' },
                    { label: 'Furniture', path: '/products' },
                    { label: 'Kitchen', path: '/products' },
                    { label: 'Sports & Outdoors', path: '/products' },
                    { label: 'Accessories', path: '/products' },
                  ].map(dept => (
                    <Link
                      key={dept.label}
                      to={dept.path}
                      className="px-3 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-xs font-mono text-ash-grey hover:text-white hover:bg-white/10 hover:border-white/20 transition-all"
                    >
                      {dept.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Live Interactive Product Spotlight (Col 8-12) */}
            <div className="lg:col-span-5">
              <div className="bg-white/[0.04] border border-white/15 backdrop-blur-xl rounded-3xl p-6 sm:p-7 shadow-2xl relative group">
                {/* Decorative corner tag */}
                <div className="flex items-center justify-between pb-4 mb-5 border-b border-white/10 text-xs font-mono">
                  <span className="text-dry-sage font-bold tracking-wider">
                    SPECIMEN // 01 SPOTLIGHT
                  </span>
                  <span className="text-white/40 uppercase tracking-widest text-[10px]">
                    REAL-TIME SYNC
                  </span>
                </div>

                {leadProduct ? (
                  <div className="flex flex-col gap-5">
                    {/* Visual container */}
                    <div className="relative aspect-[16/10] bg-gradient-to-br from-slate-900 via-stone-900 to-granite rounded-2xl flex items-center justify-center overflow-hidden border border-white/10 select-none">
                      {leadProduct.image_url ? (
                        <img
                          src={leadProduct.image_url}
                          alt={leadProduct.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-3">
                          <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-white/90">
                            <CategoryIcon category={leadProduct.category} className="w-8 h-8 stroke-[1.5]" />
                          </div>
                          <span className="text-[10px] font-mono uppercase tracking-widest text-white/50">
                            {leadProduct.category}
                          </span>
                        </div>
                      )}

                      {/* Live Ledger Pill */}
                      <div className="absolute top-3 right-3 bg-sea-green/90 text-white text-[11px] font-mono font-bold px-2.5 py-1 rounded-full shadow-xs">
                        ● {leadProduct.stock_quantity || 0} IN LEDGER
                      </div>
                    </div>

                    {/* Meta info */}
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono text-ash-grey mb-1">
                        <span>SKU: OMS-{String(leadProduct.id).padStart(4, '0')}</span>
                        <span className="text-dry-sage font-semibold uppercase">{leadProduct.category}</span>
                      </div>
                      <Link
                        to={`/products/${leadProduct.id}`}
                        className="text-lg font-bold text-white hover:text-dry-sage transition-colors line-clamp-1 block"
                      >
                        {leadProduct.name}
                      </Link>
                      <p className="text-xs text-ash-grey/70 line-clamp-2 mt-1 leading-relaxed">
                        {leadProduct.description}
                      </p>
                    </div>

                    {/* Price and Instant Add CTA */}
                    <div className="flex items-center justify-between pt-4 border-t border-white/10 gap-4">
                      <div>
                        <span className="text-[10px] font-mono uppercase text-ash-grey/60 block">Price</span>
                        <span className="text-2xl font-black text-white font-mono">
                          ${Number(leadProduct.price || 0).toFixed(2)}
                        </span>
                      </div>

                      <Button
                        size="md"
                        onClick={handleAddSpotlight}
                        variant={spotlightAdded ? 'secondary' : 'primary'}
                        className="px-5 py-2.5 gap-2 text-sm shadow-md"
                      >
                        {spotlightAdded ? (
                          <>
                            <Check className="w-4 h-4 text-sea-green" />
                            <span className="text-sea-green font-bold">Added to Cart</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4" />
                            <span>Quick Add</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Loading skeleton for spotlight */
                  <div className="space-y-4 animate-pulse py-6">
                    <div className="aspect-[16/10] bg-white/10 rounded-2xl" />
                    <div className="h-4 bg-white/10 rounded w-1/3" />
                    <div className="h-6 bg-white/10 rounded w-3/4" />
                    <div className="h-10 bg-white/10 rounded-xl" />
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── 2. ARCHITECTURAL STATUS BAR (Tangible Micro-Metrics) ── */}
      <div className="bg-[#120E14] border-b border-white/10 text-ash-grey/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-white/10 text-xs font-mono py-3">
            <div className="py-2 md:py-0 md:px-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sea-green shrink-0" />
              <span className="text-white font-medium">01 // CATALOG FEED:</span>
              <span className="text-dry-sage">SYNCHRONIZED</span>
            </div>
            <div className="py-2 md:py-0 md:px-4 flex items-center gap-2">
              <span className="text-white font-medium">02 // INVENTORY AUDIT:</span>
              <span className="text-dry-sage">AUTHORITATIVE</span>
            </div>
            <div className="py-2 md:py-0 md:px-4 flex items-center gap-2">
              <span className="text-white font-medium">03 // SAGA PROTOCOL:</span>
              <span className="text-dry-sage">ATOMIC</span>
            </div>
            <div className="py-2 md:py-0 md:px-4 flex items-center gap-2">
              <span className="text-white font-medium">04 // SEARCH LATENCY:</span>
              <span className="text-dry-sage">&lt; 40MS INDEXED</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. MAIN CONTENT CANVAS ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24 py-16 sm:py-24">

        {/* ── Section 1: Curated Catalog Collection ── */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 pb-4 border-b border-slate-200">
            <div>
              <span className="text-xs font-mono font-bold tracking-widest text-sea-green uppercase block mb-1">
                [ 01 // ESSENTIALS ]
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-granite tracking-tight uppercase">
                Curated Catalog Highlights
              </h2>
              <p className="text-slate-500 text-sm mt-1">
                Everyday gear and tools verified against physical warehouse stock
              </p>
            </div>
            <Link
              to="/products"
              className="font-mono text-xs font-bold text-sea-green hover:underline flex items-center gap-1.5 self-start sm:self-auto uppercase tracking-wider"
            >
              <span>View Full Repository</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map(n => (
                <div
                  key={n}
                  className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3 animate-pulse shadow-xs"
                >
                  <div className="aspect-[16/10] bg-slate-200 rounded-xl" />
                  <div className="h-4 bg-slate-200 rounded w-1/4 mt-1" />
                  <div className="h-5 bg-slate-200 rounded w-3/4" />
                  <div className="h-4 bg-slate-200 rounded w-1/2" />
                  <div className="h-10 bg-slate-200 rounded-xl mt-4" />
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

        {/* ── Section 2: Personalized Archive (Logged-In User) ── */}
        {recommendations.length > 0 && (
          <section className="pt-6 border-t border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 pb-4 border-b border-slate-200">
              <div>
                <span className="text-xs font-mono font-bold tracking-widest text-sea-green uppercase block mb-1">
                  [ 02 // PERSONAL ARCHIVE ]
                </span>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-sea-green" />
                  <h2 className="text-2xl sm:text-3xl font-black text-granite tracking-tight uppercase">
                    Recommended For Your Profile
                  </h2>
                </div>
                <p className="text-slate-500 text-sm mt-1">
                  Tailored suggestions based on your prior orders and viewing patterns
                </p>
              </div>
              <Link
                to="/products"
                className="font-mono text-xs font-bold text-sea-green hover:underline flex items-center gap-1.5 self-start sm:self-auto uppercase tracking-wider"
              >
                <span>Explore Related</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {recommendations.map(rec => (
                <div
                  key={rec.product_id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-700 mb-4 group-hover:scale-105 group-hover:bg-sea-green/10 group-hover:text-sea-green transition-all">
                      <CategoryIcon category={rec.category} className="w-6 h-6 stroke-[1.5]" />
                    </div>
                    <span className="text-[10px] font-mono font-bold text-sea-green uppercase tracking-wider bg-sea-green/10 px-2 py-0.5 rounded">
                      {rec.category}
                    </span>
                    <h3 className="font-bold text-granite text-base mt-2.5 group-hover:text-sea-green transition-colors line-clamp-2">
                      {rec.name}
                    </h3>
                  </div>
                  <Link to={`/products/${rec.product_id}`} className="mt-6">
                    <Button size="sm" fullWidth variant="secondary">
                      Inspect Specimen
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Section 3: The Operational Manifesto (Technical Ledger) ── */}
        <section className="pt-8 border-t border-slate-200">
          <div className="grid lg:grid-cols-12 gap-10 items-start">
            {/* Left Manifesto Anchor */}
            <div className="lg:col-span-4">
              <span className="text-xs font-mono font-bold tracking-widest text-sea-green uppercase block mb-2">
                [ 03 // ARCHITECTURE ]
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-granite tracking-tight uppercase leading-[1.05] mb-4">
                HOW OMSSTORE OPERATES.
              </h2>
              <p className="text-slate-600 text-sm leading-relaxed mb-6">
                Most e-commerce systems show cached estimations that fall out of sync during
                checkout rushes. OMSStore runs directly on an authoritative inventory ledger,
                treating every order as an atomic, verifiable transaction.
              </p>
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs font-mono text-xs text-slate-500">
                <span className="text-sea-green font-bold">STATUS:</span> Physical ledger checks
                precede order confirmation. Zero phantom items allowed.
              </div>
            </div>

            {/* Right Technical Principles */}
            <div className="lg:col-span-8 flex flex-col divide-y divide-slate-200 bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              {/* Principle 01 */}
              <div className="p-6 sm:p-8 hover:bg-slate-50/70 transition-colors">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <span className="font-mono text-xs font-bold text-sea-green tracking-wider uppercase">
                    01 // LIVE LEDGER VERIFICATION
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 uppercase">NO PHANTOM STOCK</span>
                </div>
                <h3 className="text-lg font-bold text-granite mb-2">Authoritative Inventory Ledger</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Every product card displays exact numbers from our central database. The moment
                  you click checkout, inventory is reserved instantaneously—eliminating surprise
                  cancellations and post-checkout backorders.
                </p>
              </div>

              {/* Principle 02 */}
              <div className="p-6 sm:p-8 hover:bg-slate-50/70 transition-colors">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <span className="font-mono text-xs font-bold text-granite tracking-wider uppercase">
                    02 // INSTANTANEOUS DISCOVERY
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 uppercase">&lt; 40MS INDEXED</span>
                </div>
                <h3 className="text-lg font-bold text-granite mb-2">Typo-Tolerant Search Indexing</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Catalog queries are indexed in real time for sub-second retrieval. Search queries
                  automatically handle typos, synonyms, and partial names with immediate typeahead
                  suggestions.
                </p>
              </div>

              {/* Principle 03 */}
              <div className="p-6 sm:p-8 hover:bg-slate-50/70 transition-colors">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <span className="font-mono text-xs font-bold text-sea-green tracking-wider uppercase">
                    03 // ATOMIC TRANSACTION GUARANTEE
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 uppercase">END-TO-END AUDIT</span>
                </div>
                <h3 className="text-lg font-bold text-granite mb-2">Distributed Order Fulfillment</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Transactions execute atomically across services. If any inventory step fails,
                  reservations are rolled back cleanly. Your order history provides continuous,
                  verifiable tracking from placement to dispatch.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 4: Closing Editorial Invitation ── */}
        <section className="bg-[#18131A] rounded-3xl text-white p-8 sm:p-12 shadow-sm border border-white/10 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-sea-green/10 blur-[90px] pointer-events-none" />

          <div className="max-w-xl text-center md:text-left relative">
            <span className="text-[11px] font-mono tracking-widest uppercase text-dry-sage block mb-2">
              [ DIRECT ACCESS // REPOSITORY ]
            </span>
            <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-2">
              Browse the complete collection
            </h3>
            <p className="text-ash-grey text-sm leading-relaxed">
              Explore all five departments with live inventory counts, detailed specifications, and instant checkout.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-center relative">
            <Link to="/products" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto px-8">
                Explore All Products →
              </Button>
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
