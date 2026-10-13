/**
 * pages/Cart/Cart.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side cart connected to Order Service.
 * Submits orders with user_id and items array.
 * Features friendly error masking and refined typography.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Package,
  Laptop,
  Armchair,
  Coffee,
  Compass,
  Watch,
  AlertCircle,
  X,
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../hooks/useAuth';
import { placeOrder } from '../../api/orderApi';
import Button from '../../components/Button';
import { formatError } from '../../utils/formatError';

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

export default function Cart() {
  const {
    cartItems,
    removeFromCart,
    addToCart,
    removeItemCompletely,
    clearCart,
    cartTotal,
  } = useCart();
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
        formatError(
          err,
          'Unable to complete your order. Some items may have limited stock or the checkout service is momentarily busy.'
        )
      );
    } finally {
      setPlacing(false);
    }
  }

  // ── Empty Cart State ──
  if (cartItems.length === 0 && !orderSuccess) {
    return (
      <div className="max-w-xl mx-auto text-center py-24 sm:py-32 px-4">
        <div className="w-20 h-20 rounded-3xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-6">
          <ShoppingBag className="w-10 h-10" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-granite mb-2">
          Your cart is currently empty
        </h1>
        <p className="text-gray-500 text-sm mb-8 max-w-sm mx-auto leading-relaxed">
          Looks like you haven't added anything to your cart yet. Discover products from our catalog!
        </p>
        <Link to="/products">
          <Button size="lg" className="px-8 gap-2">
            <span>Explore Products</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    );
  }

  // ── Order Confirmed Success State ──
  if (orderSuccess) {
    return (
      <div className="max-w-xl mx-auto text-center py-20 px-4">
        <div className="bg-white rounded-3xl border border-gray-200/80 shadow-xs p-8 sm:p-12">
          <div className="w-20 h-20 rounded-3xl bg-emerald-50 text-sea-green flex items-center justify-center mx-auto mb-6 shadow-xs">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <span className="text-xs font-bold text-sea-green uppercase tracking-wider bg-sea-green/10 px-3 py-1 rounded-full">
            Payment & Reservation Verified
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-granite mt-4 mb-2">
            Order Confirmed!
          </h1>
          <p className="text-gray-600 text-sm mb-2">
            Confirmation Reference:{' '}
            <span className="font-mono font-bold text-sea-green bg-sea-green/10 px-2 py-0.5 rounded">
              #{orderSuccess}
            </span>
          </p>
          <p className="text-gray-500 text-sm mb-8 max-w-md mx-auto leading-relaxed">
            Thank you for your purchase! We've reserved your items and are preparing your order for dispatch.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <Link to="/orders">
              <Button size="lg" className="w-full sm:w-auto">
                View My Orders
              </Button>
            </Link>
            <Link to="/products">
              <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                Continue Shopping
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200/60">
        <div>
          <h1 className="text-3xl font-extrabold text-granite tracking-tight">Shopping Cart</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {totalQuantity} {totalQuantity === 1 ? 'item' : 'items'} in your cart
          </p>
        </div>
        <button
          onClick={clearCart}
          className="text-xs font-semibold text-gray-400 hover:text-rose-500 transition-colors flex items-center gap-1.5"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear All</span>
        </button>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl px-5 py-4 text-sm mb-6 flex items-start justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-700 p-1"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Main Layout ── */}
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Line Items List */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {cartItems.map(item => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-4 sm:p-5 flex items-center gap-4 hover:border-gray-300 transition-colors"
            >
              {/* Product Thumbnail */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-xl flex items-center justify-center text-3xl flex-shrink-0 overflow-hidden border border-gray-100">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    onError={e => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'inline';
                    }}
                  />
                ) : null}
                {!item.image_url && (
                  <CategoryIcon category={item.category} className="w-7 h-7 text-slate-400 stroke-[1.5]" />
                )}
              </div>

              {/* Title & Info */}
              <div className="flex-1 min-w-0">
                <Link
                  to={`/products/${item.id}`}
                  className="font-bold text-granite text-sm sm:text-base hover:text-sea-green transition-colors line-clamp-1 block"
                >
                  {item.name}
                </Link>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mt-0.5">
                  {item.category}
                </span>
                <span className="text-sm font-bold text-sea-green block mt-1">
                  ${Number(item.price || 0).toFixed(2)}
                </span>
              </div>

              {/* Quantity Controls */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  onClick={() => removeFromCart(item.id)}
                  className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-granite flex items-center justify-center transition-colors active:scale-95"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-7 text-center font-bold text-granite text-sm">
                  {item.quantity}
                </span>
                <button
                  onClick={() => addToCart(item)}
                  className="w-8 h-8 rounded-lg border border-sea-green/30 bg-sea-green/5 text-sea-green hover:bg-sea-green hover:text-white flex items-center justify-center transition-all active:scale-95"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Subtotal & Delete */}
              <div className="text-right min-w-[4.5rem]">
                <p className="font-extrabold text-granite text-sm sm:text-base">
                  ${(Number(item.price || 0) * item.quantity).toFixed(2)}
                </p>
                <button
                  onClick={() => removeItemCompletely(item.id)}
                  className="text-xs text-gray-400 hover:text-rose-500 mt-1 inline-flex items-center gap-1 transition-colors"
                  title="Remove item"
                >
                  <Trash2 className="w-3 h-3" />
                  <span className="hidden sm:inline">Remove</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ── Order Summary Sidebar ── */}
        <div>
          <div className="bg-white rounded-3xl border border-gray-200/80 shadow-xs p-6 flex flex-col gap-5 sticky top-24">
            <h2 className="font-bold text-granite text-lg pb-3 border-b border-gray-100">
              Order Summary
            </h2>

            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Items ({totalQuantity})</span>
                <span className="font-medium text-granite">${cartTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping</span>
                <span className="text-sea-green font-semibold">Free</span>
              </div>
              <div className="flex justify-between">
                <span>Estimated Tax</span>
                <span className="font-medium text-granite">$0.00</span>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 flex justify-between items-baseline">
              <span className="font-bold text-granite text-base">Total</span>
              <span className="font-extrabold text-2xl text-granite">
                ${cartTotal.toFixed(2)}
              </span>
            </div>

            <Button
              fullWidth
              size="lg"
              loading={placing}
              onClick={handlePlaceOrder}
              className="py-3.5 text-base gap-2"
            >
              <Package className="w-5 h-5" />
              <span>{isAuthenticated ? 'Place Order' : 'Sign In to Checkout'}</span>
            </Button>

            <div className="flex items-center justify-center gap-2 text-xs text-gray-400 pt-1">
              <ShieldCheck className="w-4 h-4 text-sea-green shrink-0" />
              <span>Secure checkout with live stock verification</span>
            </div>

            <Link
              to="/products"
              className="text-center text-xs font-semibold text-gray-400 hover:text-granite transition-colors"
            >
              ← Continue shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
