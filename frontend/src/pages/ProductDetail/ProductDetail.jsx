/**
 * pages/ProductDetail/ProductDetail.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Detailed view of a single product.
 * Reads the product id from the URL via useParams().
 * Fetches via getProductById() from productApi.
 * Fetches related products via getProductRecommendations() from recommendationApi.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useParams, useNavigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getProductById } from '../../api/productApi';
import { getInventoryStock } from '../../api/inventoryApi';
import { getProductRecommendations } from '../../api/recommendationApi';
import { useCart } from '../../context/CartContext';
import Button from '../../components/Button';

function categoryEmoji(category) {
  const map = { Electronics: '💻', Furniture: '🪑', Kitchen: '🍳', 'Sports & Outdoors': '🏃', Accessories: '👜' };
  return map[category] || '📦';
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [product, setProduct] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Fetch product data and live inventory stock in parallel.
        // inventory_db is the authoritative stock source (reduced by SAGA on orders).
        // products_db.stock_quantity is only the initial seed and is never updated.
        const [data, inv] = await Promise.all([
          getProductById(id),
          getInventoryStock(id).catch(() => null), // non-fatal fallback
        ]);

        // Merge live stock from inventory_db, fallback to products_db value
        const liveStock = inv !== null ? inv.stock_quantity : data.stock_quantity;
        setProduct({ ...data, stock_quantity: liveStock });

        // Fetch graph recommendations asynchronously
        getProductRecommendations(id, 4)
          .then(recs => setRecommendations(recs))
          .catch(() => setRecommendations([]));
      } catch (err) {
        setError(err?.response?.status === 404 ? 'Product not found.' : 'Failed to load product.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  function handleAddToCart() {
    addToCart(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  if (loading) return (
    <div className="flex justify-center items-center py-40">
      <div className="w-14 h-14 border-4 border-ash-grey border-t-sea-green rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="max-w-xl mx-auto text-center py-32">
      <p className="text-6xl mb-6">😕</p>
      <p className="text-xl text-red-500 font-semibold mb-6">{error}</p>
      <Button variant="secondary" onClick={() => navigate('/products')}>← Back to Products</Button>
    </div>
  );

  const inStock = product.stock_quantity > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Back link */}
      <button onClick={() => navigate(-1)} className="text-sm text-gray-400 hover:text-granite mb-6 flex items-center gap-1">
        ← Back
      </button>

      <div className="grid md:grid-cols-2 gap-10">
        {/* ── Visual panel ── */}
        <div className="bg-gradient-to-br from-granite to-shadow-grey rounded-3xl flex items-center justify-center h-80 shadow-xl overflow-hidden relative">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'inline';
              }}
            />
          ) : null}
          <span className={`text-8xl select-none ${product.image_url ? 'hidden' : 'inline'}`}>
            {categoryEmoji(product.category)}
          </span>
        </div>

        {/* ── Info panel ── */}
        <div className="flex flex-col gap-4">
          <span className="text-xs font-bold text-sea-green uppercase tracking-widest">
            {product.category}
          </span>
          <h1 className="text-3xl font-extrabold text-granite leading-tight">
            {product.name}
          </h1>
          <p className="text-4xl font-black text-sea-green">
            ${product.price.toFixed(2)}
          </p>

          {product.description && (
            <p className="text-gray-600 leading-relaxed">{product.description}</p>
          )}

          {/* Stock status */}
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${inStock ? 'bg-sea-green' : 'bg-red-500'}`} />
            <span className={`text-sm font-semibold ${inStock ? 'text-sea-green' : 'text-red-500'}`}>
              {inStock ? `${product.stock_quantity} units in stock` : 'Out of stock'}
            </span>
          </div>

          {/* Product ID (for reference) */}
          <p className="text-xs text-gray-400">Product ID: #{product.id}</p>

          {/* Add to cart */}
          <Button
            size="lg"
            fullWidth
            onClick={handleAddToCart}
            disabled={!inStock}
            variant={added ? 'secondary' : 'primary'}
            className="mt-2"
          >
            {added ? '✓ Added to Cart!' : inStock ? 'Add to Cart' : 'Out of Stock'}
          </Button>
        </div>
      </div>

      {/* ── Recommendations Section ── */}
      {recommendations.length > 0 && (
        <div className="mt-16 pt-10 border-t border-gray-100">
          <h2 className="text-2xl font-extrabold text-granite mb-6 flex items-center gap-2">
            <span>✨ Customers Who Bought This Also Bought</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {recommendations.map(rec => (
              <Link
                key={rec.product_id}
                to={`/products/${rec.product_id}`}
                className="bg-white rounded-2xl shadow p-4 hover:shadow-md transition-shadow group flex flex-col justify-between"
              >
                <div>
                  <div className="w-12 h-12 bg-ash-grey/30 rounded-xl flex items-center justify-center text-2xl mb-3 group-hover:scale-105 transition-transform">
                    {categoryEmoji(rec.category)}
                  </div>
                  <p className="font-bold text-granite text-sm line-clamp-2 group-hover:text-sea-green transition-colors">
                    {rec.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{rec.category}</p>
                </div>
                <div className="mt-3 pt-2 border-t border-gray-50 flex items-center justify-between text-xs font-semibold text-sea-green">
                  <span>View Product</span>
                  <span>→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
