/**
 * pages/ProductDetail/ProductDetail.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Detailed view of a single product.
 * Reads the product id from the URL via useParams().
 * Fetches via getProductById() from productApi.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getProductById } from '../../api/productApi';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getProductById(id);
        setProduct(data);
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
        <div className="bg-gradient-to-br from-granite to-shadow-grey rounded-3xl flex items-center justify-center h-80 shadow-xl">
          <span className="text-8xl">{categoryEmoji(product.category)}</span>
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
    </div>
  );
}
