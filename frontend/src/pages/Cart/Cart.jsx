/**
 * pages/Cart/Cart.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side cart connected to Order Service (FastAPI on port 8004).
 * Submits distributed SAGA orders with { user_id, items: [{ product_id, quantity }] }.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../hooks/useAuth';
import { placeOrder } from '../../api/orderApi';
import Button from '../../components/Button';

function categoryEmoji(category) {
  const map = { Electronics: '💻', Furniture: '🪑', Kitchen: '🍳', 'Sports & Outdoors': '🏃', Accessories: '👜' };
  return map[category] || '📦';
}

export default function Cart() {
  const { cartItems, removeFromCart, addToCart, removeItemCompletely, clearCart, cartTotal } = useCart();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [placing, setPlacing] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [error, setError] = useState(null);

  async function handlePlaceOrder() {
    if (!isAuthenticated || !user?.id) {
      navigate('/login', { state: { from: { pathname: '/cart' } } });
      return;
    }

    setPlacing(true);
    setError(null);
    try {
      const orderPayload = {
        user_id: Number(user.id),
        items: cartItems.map(item => ({
          product_id: Number(item.id),
          quantity: Number(item.quantity),
        })),
      };

      const result = await placeOrder(orderPayload);
      setOrderSuccess(result.id || result.order_id);
      clearCart();
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
        err?.message ||
        'Order placement failed. Check inventory or backend availability.'
      );
    } finally {
      setPlacing(false);
    }
  }

  // ── Empty cart state ──────────────────────────────────────────────────────
  if (cartItems.length === 0 && !orderSuccess) {
    return (
      <div className="max-w-2xl mx-auto text-center py-32 px-4">
        <p className="text-7xl mb-6">🛒</p>
        <h1 className="text-2xl font-bold text-granite mb-3">Your cart is empty</h1>
        <p className="text-gray-500 mb-8">Browse products and add items to get started.</p>
        <Link to="/products">
          <Button size="lg">Browse Products</Button>
        </Link>
      </div>
    );
  }

  // ── Order success state ───────────────────────────────────────────────────
  if (orderSuccess) {
    return (
      <div className="max-w-2xl mx-auto text-center py-32 px-4">
        <p className="text-7xl mb-6">🎉</p>
        <h1 className="text-2xl font-bold text-granite mb-3">Order Confirmed!</h1>
        <p className="text-gray-600 mb-2">
          Order ID: <span className="font-mono font-bold text-sea-green">#{orderSuccess}</span>
        </p>
        <p className="text-gray-500 text-sm mb-8">
          The SAGA transaction has confirmed your inventory reservations and order record.
        </p>
        <div className="flex justify-center gap-4">
          <Link to="/orders">
            <Button size="lg">View My Orders</Button>
          </Link>
          <Link to="/products">
            <Button size="lg" variant="secondary">Continue Shopping</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-extrabold text-granite mb-8">Your Cart</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm mb-6 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold text-red-400 hover:text-red-700 ml-4">✕</button>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-8">
        {/* ── Line items ── */}
        <div className="md:col-span-2 flex flex-col gap-4">
          {cartItems.map(item => (
            <div key={item.id} className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4">
              {/* Thumbnail */}
              <div className="w-16 h-16 bg-gradient-to-br from-granite to-shadow-grey rounded-xl flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'inline';
                    }}
                  />
                ) : null}
                <span className={item.image_url ? 'hidden' : 'inline'}>
                  {categoryEmoji(item.category)}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-bold text-granite text-sm leading-tight line-clamp-1">{item.name}</p>
                <p className="text-gray-400 text-xs mt-0.5">{item.category}</p>
                <p className="text-sea-green font-bold mt-1">${item.price.toFixed(2)}</p>
              </div>

              {/* Quantity control */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => removeFromCart(item.id)}
                  className="w-8 h-8 rounded-full border-2 border-ash-grey text-granite font-bold hover:bg-ash-grey/30 transition-colors"
                >
                  −
                </button>
                <span className="w-6 text-center font-bold text-granite">{item.quantity}</span>
                <button
                  onClick={() => addToCart(item)}
                  className="w-8 h-8 rounded-full border-2 border-sea-green text-sea-green font-bold hover:bg-sea-green hover:text-white transition-colors"
                >
                  +
                </button>
              </div>

              <div className="text-right min-w-[5rem]">
                <p className="font-extrabold text-granite">${(item.price * item.quantity).toFixed(2)}</p>
                <button
                  onClick={() => removeItemCompletely(item.id)}
                  className="text-xs text-red-400 hover:text-red-600 mt-1"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ── Order summary ── */}
        <div className="bg-white rounded-2xl shadow-sm p-6 h-fit flex flex-col gap-4">
          <h2 className="font-bold text-granite text-lg">Order Summary</h2>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Items ({cartItems.reduce((s, i) => s + i.quantity, 0)})</span>
            <span>${cartTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Shipping</span>
            <span className="text-sea-green font-semibold">Free</span>
          </div>
          <div className="border-t border-gray-100 pt-3 flex justify-between font-extrabold text-granite text-lg">
            <span>Total</span>
            <span>${cartTotal.toFixed(2)}</span>
          </div>
          <Button fullWidth size="lg" loading={placing} onClick={handlePlaceOrder}>
            {isAuthenticated ? 'Place Order' : 'Sign in to Checkout'}
          </Button>
          <Link to="/products" className="text-center text-sm text-gray-400 hover:text-granite">
            ← Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
