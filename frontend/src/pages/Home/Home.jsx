/**
 * pages/Home/Home.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modern, cohesive homepage with intentional visual rhythm:
 *   • Dark Hero Section (brand shadow-grey / granite palette)
 *   • Single unified light tone for all catalog sections below
 *   • Refined product placeholders & cohesive typography
 *   • Merged single-source "OMSStore Standard" trust section (no duplicate strips)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Sparkles,
  Zap,
  ShieldCheck,
  CheckCircle2,
  Package,
  Laptop,
  Armchair,
  Coffee,
  Compass,
  Watch,
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
    <div className="bg-[#F8FAFC] min-h-screen">
      {/* ── 1. HERO SECTION (Dark Tone Anchor) ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-shadow-grey via-shadow-grey to-[#1C2424] text-white pt-20 pb-24 md:pt-28 md:pb-32 px-4 sm:px-6 lg:px-8 border-b border-white/5">
        {/* Soft atmospheric glow accents */}
        <div className="absolute top-0 right-1/4 w-96 h-96 rounded-full bg-sea-green/15 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-80 h-80 rounded-full bg-granite/40 blur-[100px] pointer-events-none" />

        <div className="relative max-w-4xl mx-auto text-center flex flex-col items-center">
          {/* Specific product context badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.08] border border-white/10 text-dry-sage text-xs font-semibold tracking-wide uppercase mb-8 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-sea-green animate-pulse" />
            <span>Curated Catalog • Real-Time Stock Sync</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.12] mb-6 text-white">
            Curated essentials, <br />
            <span className="text-dry-sage">verified in real time.</span>
          </h1>

          {/* Authentic, grounded subtext */}
          <p className="text-ash-grey text-base sm:text-lg md:text-xl max-w-2xl leading-relaxed mb-10 font-normal">
            Browse our hand-selected catalog of electronics, home goods, and outdoor gear.
            Every item features live-verified inventory and automated order fulfillment.
          </p>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
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
                className="w-full sm:w-auto px-8 bg-white/10 hover:bg-white/15 text-white border-white/20 backdrop-blur-xs text-base"
              >
                <span>Track Orders</span>
              </Button>
            </Link>
          </div>

          {/* Subtle live-status indicator */}
          <div className="mt-12 flex items-center gap-6 text-xs text-ash-grey/70 tracking-wider uppercase font-medium">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-sea-green" />
              <span>Live Ledger Active</span>
            </span>
            <span className="text-white/20 hidden sm:inline">•</span>
            <span className="hidden sm:inline">Sub-Second Search</span>
            <span className="text-white/20 hidden sm:inline">•</span>
            <span className="hidden sm:inline">Zero Phantom Stock</span>
          </div>
        </div>
      </section>

      {/* ── 2. MAIN CONTENT (Consistent Light Canvas) ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20 py-16 sm:py-20">

        {/* ── Featured Products Grid (Focal Point 1) ── */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 pb-4 border-b border-slate-200/70">
            <div>
              <span className="text-xs font-bold text-sea-green uppercase tracking-wider block mb-1">
                Catalog Highlights
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-granite tracking-tight">
                Featured Essentials
              </h2>
              <p className="text-slate-500 text-sm mt-1">
                Top items from our live catalog with verified stock availability
              </p>
            </div>
            <Link
              to="/products"
              className="text-sea-green font-bold text-sm hover:underline inline-flex items-center gap-1 self-start sm:self-auto"
            >
              <span>View All Products</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {loading ? (
            /* Skeleton loading cards with matching 16:10 aspect ratio */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map(n => (
                <div
                  key={n}
                  className="bg-white rounded-2xl border border-slate-200/80 p-4 flex flex-col gap-3 animate-pulse shadow-xs"
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

        {/* ── Personalized Recommendations (When Logged In) ── */}
        {recommendations.length > 0 && (
          <section className="pt-4 border-t border-slate-200/60">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 pb-4 border-b border-slate-200/70">
              <div>
                <span className="text-xs font-bold text-sea-green uppercase tracking-wider block mb-1">
                  Personalized For You
                </span>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-sea-green" />
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-granite tracking-tight">
                    Recommended For You
                  </h2>
                </div>
                <p className="text-slate-500 text-sm mt-1">
                  Suggestions based on your previous order history and preferences
                </p>
              </div>
              <Link
                to="/products"
                className="text-sea-green font-bold text-sm hover:underline inline-flex items-center gap-1 self-start sm:self-auto"
              >
                <span>View Recommendations</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {recommendations.map(rec => (
                <div
                  key={rec.product_id}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md p-5 transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-700 mb-4 group-hover:scale-105 group-hover:bg-sea-green/10 group-hover:text-sea-green transition-all">
                      <CategoryIcon category={rec.category} className="w-6 h-6 stroke-[1.5]" />
                    </div>
                      <span className="text-[10px] font-bold text-sea-green uppercase tracking-wider bg-sea-green/10 px-2 py-0.5 rounded">
                        {rec.category}
                      </span>
                      <h3 className="font-bold text-granite text-base mt-2.5 group-hover:text-sea-green transition-colors line-clamp-2">
                        {rec.name}
                      </h3>
                    </div>
                    <Link to={`/products/${rec.product_id}`} className="mt-6">
                      <Button size="sm" fullWidth variant="secondary">
                        View Product Details
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
          </section>
        )}

        {/* ── 3. THE OMSSTORE STANDARD (Unified, Non-Redundant Value Section) ── */}
        <section className="pt-6 border-t border-slate-200/60">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold text-sea-green uppercase tracking-wider block mb-1">
              Engineered For Certainty
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-granite tracking-tight">
              The OMSStore Standard
            </h2>
            <p className="text-slate-500 text-sm sm:text-base mt-2 leading-relaxed">
              Every step of our catalog and checkout is built to prevent backorders, eliminate search friction, and deliver transparent tracking.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 lg:gap-8">
            {/* Value Pillar 1 */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-8 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-sea-green/10 text-sea-green flex items-center justify-center mb-6">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-granite mb-2.5">
                  Verified Live Inventory
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Every product card is checked against our live inventory ledger. Stock counts are locked the second you order, so you never encounter phantom stock.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs font-semibold text-sea-green">
                <span>Real-time reservation</span>
              </div>
            </div>

            {/* Value Pillar 2 */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-8 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-granite/10 text-granite flex items-center justify-center mb-6">
                  <Zap className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-granite mb-2.5">
                  Sub-Second Typo Search
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Locate products instantaneously. Our search indexing automatically handles spelling variations and category queries with instant typeahead suggestions.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs font-semibold text-granite">
                <span>Typo-tolerant lookup</span>
              </div>
            </div>

            {/* Value Pillar 3 */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-8 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-800 flex items-center justify-center mb-6">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-granite mb-2.5">
                  Automated Order Pipeline
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  From checkout confirmation to fulfillment, your order status is tracked and updated automatically in your order history with complete auditability.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs font-semibold text-slate-700">
                <span>Direct status tracking</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 4. CLOSING ACTION CONTAINER ── */}
        <section className="bg-gradient-to-r from-granite to-shadow-grey rounded-3xl text-white p-8 sm:p-12 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="max-w-xl text-center md:text-left">
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">
              Ready to find what you need?
            </h3>
            <p className="text-ash-grey text-sm leading-relaxed">
              Explore our full catalog of electronics, home essentials, and lifestyle products with guaranteed stock availability.
            </p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-center">
            <Link to="/products" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto px-6">
                Browse Complete Catalog
              </Button>
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
