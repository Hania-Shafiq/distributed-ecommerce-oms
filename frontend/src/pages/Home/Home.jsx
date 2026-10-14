/**
 * pages/Home/Home.jsx
 * Clear hierarchy: one idea, one primary action, then products.
 * Data / auth / cart logic unchanged.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getProducts } from '../../api/productApi';
import { getUserRecommendations } from '../../api/recommendationApi';
import { useAuth } from '../../hooks/useAuth';
import { useCart } from '../../context/CartContext';
import ProductCard from '../../components/ProductCard';
import Button from '../../components/Button';
import CategoryIcon, { categoryGradient } from '../../components/CategoryIcon';

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

  const leadProduct = featuredProducts[0] || null;

  return (
    <div className="bg-canvas min-h-screen">
      {/* ── Hero: one message, one action ── */}
      <section className="relative overflow-hidden surface-plum text-white pt-16 pb-16 md:pt-20 md:pb-24 px-4 sm:px-6 lg:px-8 border-b border-white/8">
        {/* Quiet atmosphere — soft enough not to compete with type */}
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

              {/* Single primary CTA — unmistakable first click */}
              <Link to="/products">
                <Button size="lg" className="px-8 gap-2.5">
                  <span>Shop products</span>
                  <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                </Button>
              </Link>
            </div>

            {/* Supporting visual only — no competing CTA */}
            <div className="lg:col-span-5 hidden lg:block">
              <div className="glass-card-dark rounded-lg p-5 opacity-95">
                <p className="text-[10px] font-mono uppercase tracking-widest text-ash-grey/50 mb-4 font-normal">
                  Example from the catalog
                </p>

                {leadProduct ? (
                  <Link
                    to={`/products/${leadProduct.id}`}
                    className="block group"
                  >
                    <div
                      className={`aspect-[16/10] bg-gradient-to-br ${categoryGradient(leadProduct.category)} rounded-md flex items-center justify-center overflow-hidden border border-white/6 mb-4`}
                    >
                      {leadProduct.image_url ? (
                        <img
                          src={leadProduct.image_url}
                          alt={leadProduct.name}
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                        />
                      ) : (
                        <CategoryIcon
                          category={leadProduct.category}
                          className="w-8 h-8 text-ash-grey/50"
                        />
                      )}
                    </div>
                    <p className="text-sm font-semibold text-white group-hover:text-dry-sage ui-transition line-clamp-1">
                      {leadProduct.name}
                    </p>
                    <p className="text-xs text-ash-grey/55 mt-1 font-normal">
                      {leadProduct.category}
                      <span className="mx-1.5 text-white/20">·</span>
                      <span className="price-gilt-light">
                        ${Number(leadProduct.price || 0).toFixed(2)}
                      </span>
                    </p>
                  </Link>
                ) : (
                  <div className="space-y-3 animate-pulse">
                    <div className="aspect-[16/10] bg-white/6 rounded-md" />
                    <div className="h-4 bg-white/6 rounded w-2/3" />
                    <div className="h-3 bg-white/6 rounded w-1/3" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16 space-y-16">
        {/* ── Section 1: Featured products to browse / add ── */}
        <section>
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
                  className="bg-white rounded-lg border border-granite/8 p-4 flex flex-col gap-3 animate-pulse"
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
        </section>

        {/* ── Section 2: Personal picks (only when logged in) ── */}
        {recommendations.length > 0 && (
          <section className="pt-2 border-t border-granite/10">
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
                  className="panel-quiet p-5 flex flex-col group ui-transition hover:border-granite/20"
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
          </section>
        )}
      </div>
    </div>
  );
}
