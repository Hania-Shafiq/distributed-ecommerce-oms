/**
 * pages/Cart/Cart.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side cart — reads from CartContext (no backend yet).
 * Shows line items, quantities, totals, and a "Place Order" stub button.
 * Order placement calls orderApi.placeOrder() — swapped for real route
 * once Order Service routes are confirmed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { placeOrder } from '../../api/orderApi';
import Button from '../../components/Button';

export default function Cart() {
  const { cartItems, removeFromCart, addToCart, removeItemCompletely, clearCart, cartTotal } = useCart();
  const [placing, setPlacing] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);

  async function handlePlaceOrder() {
    setPlacing(true);
    try {
      const result = await placeOrder({ items: cartItems, total: cartTotal });
      setOrderSuccess(result.order_id);
      clearCart();
    } catch (err) {
      alert('Order failed: ' + (err?.response?.data?.detail || err.message));
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
        <h1 className="text-2xl font-bold text-granite mb-3">Order placed!</h1>
        <p className="text-gray-500 mb-2">Order ID: <span className="font-mono font-bold text-sea-green">{orderSuccess}</span></p>
        <p className="text-gray-400 text-sm mb-8">
          (Order Service integration is in progress — this is a stub confirmation.)
        </p>
        <Link to="/products">
          <Button size="lg">Continue Shopping</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-extrabold text-granite mb-8">Your Cart</h1>

      <div className="grid md:grid-cols-3 gap-8">
        {/* ── Line items ── */}
        <div className="md:col-span-2 flex flex-col gap-4">
          {cartItems.map(item => (
            <div key={item.id} className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4">
              {/* Emoji thumbnail */}
              <div className="w-16 h-16 bg-gradient-to-br from-granite to-shadow-grey rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                {categoryEmoji(item.category)}
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
            Place Order
          </Button>
          <Link to="/products" className="text-center text-sm text-gray-400 hover:text-granite">
            ← Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
}

function categoryEmoji(category) {
  const map = { Electronics: '💻', Furniture: '🪑', Kitchen: '🍳', 'Sports & Outdoors': '🏃', Accessories: '👜' };
  return map[category] || '📦';
}
