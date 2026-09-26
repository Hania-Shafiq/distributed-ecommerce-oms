/**
 * pages/Home/Home.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Landing page — hero section + live featured products + personalized recommendations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
        setFeaturedProducts(products);

        if (isAuthenticated && user?.id) {
          const recs = await getUserRecommendations(user.id, 4);
          setRecommendations(recs);
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
    <div>
      {/* ── Hero ── */}
      <section className="bg-gradient-to-br from-shadow-grey via-granite to-sea-green text-white px-6 py-24 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-ash-grey mb-4">
          Distributed E-Commerce OMS
        </p>
        <h1 className="text-4xl md:text-6xl font-black mb-6 leading-tight">
          Shop smarter.<br />
          <span className="text-sea-green">Powered by microservices.</span>
        </h1>
        <p className="text-ash-grey text-base md:text-lg max-w-xl mx-auto mb-10">
          Browse our curated catalog — products indexed by Elasticsearch with distributed SAGA order fulfillment.
        </p>
        <div className="flex justify-center gap-4">
          <Link to="/products">
            <Button size="lg" className="text-base md:text-lg px-8">
              Browse Products →
            </Button>
          </Link>
          <Link to="/orders">
            <Button size="lg" variant="secondary" className="text-base md:text-lg px-8">
              My Orders
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Personalized Recommendations (if logged in and has recs) ── */}
      {recommendations.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-extrabold text-granite">Recommended For You</h2>
              <p className="text-gray-500 text-sm">Personalized by Neo4j graph recommendations</p>
            </div>
            <Link to="/products" className="text-sea-green font-semibold text-sm hover:underline">
              View All →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {recommendations.map(rec => (
              <div
                key={rec.product_id}
                className="bg-white rounded-2xl shadow p-5 hover:shadow-lg transition-shadow flex flex-col justify-between"
              >
                <div>
                  <span className="text-xs font-bold text-sea-green uppercase">{rec.category}</span>
                  <h3 className="font-bold text-granite text-base mt-1">{rec.name}</h3>
                </div>
                <Link to={`/products/${rec.product_id}`} className="mt-4">
                  <Button size="sm" fullWidth variant="secondary">View Details</Button>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Featured Products ── */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-extrabold text-granite">Featured Products</h2>
            <p className="text-gray-500 text-sm">Top picks from our live catalog</p>
          </div>
          <Link to="/products" className="text-sea-green font-semibold text-sm hover:underline">
            View All ({featuredProducts.length}+) →
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-ash-grey border-t-sea-green rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={(p) => addToCart(p)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Feature tiles ── */}
      <section className="max-w-5xl mx-auto px-6 py-16 grid sm:grid-cols-3 gap-8 text-center border-t border-gray-100">
        {[
          { icon: '⚡', title: 'Elasticsearch Search', desc: 'Full-text typo-tolerant product catalog indexing.' },
          { icon: '🔄', title: 'SAGA Orchestration', desc: 'Atomic distributed transactions across Order & Inventory.' },
          { icon: '🕸️', title: 'Neo4j Recommendations', desc: 'Graph-powered collaborative filtering & related items.' },
        ].map(f => (
          <div key={f.title} className="bg-white rounded-2xl shadow-md p-8 hover:shadow-xl transition-shadow">
            <div className="text-5xl mb-4">{f.icon}</div>
            <h3 className="text-lg font-bold text-granite mb-2">{f.title}</h3>
            <p className="text-gray-500 text-sm">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
