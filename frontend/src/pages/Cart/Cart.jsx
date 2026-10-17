/**
 * pages/Cart/Cart.jsx
 * Cart UI matured — logic unchanged. Line icons, gilt prices, sharp radius.
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
  AlertCircle,
  X,
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../hooks/useAuth';
import { placeOrder } from '../../api/orderApi';
import Button from '../../components/Button';
import ProductImage from '../../components/ProductImage';
import { formatError } from '../../utils/formatError';

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
        items: cartItems.map((item) => ({
          product_id: Number(item.id),
          quantity: Number(item.quantity),
        })),
      };

      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

      const result = await placeOrder(orderPayload, idempotencyKey);
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

  if (cartItems.length === 0 && !orderSuccess) {
    return (
      <div className="max-w-xl mx-auto text-center py-24 sm:py-32 px-4">
        <div className="w-14 h-14 rounded-lg bg-sage-mist text-granite/50 flex items-center justify-center mx-auto mb-5">
          <ShoppingBag className="w-6 h-6" strokeWidth={1.25} />
        </div>
        <h1 className="text-2xl font-semibold text-charcoal mb-2">Your cart is empty</h1>
        <p className="text-slate-500 text-sm mb-8 max-w-sm mx-auto leading-relaxed font-normal">
          Discover products from the catalog when you&apos;re ready.
        </p>
        <Link to="/products">
          <Button size="lg" className="px-7 gap-2">
            <span>Explore catalog</span>
            <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
          </Button>
        </Link>
      </div>
    );
  }

  if (orderSuccess) {
    return (
      <div className="max-w-xl mx-auto text-center py-20 px-4">
        <div className="panel-quiet p-8 sm:p-10">
          <div className="w-14 h-14 rounded-lg bg-sage-mist text-teal-deep flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-7 h-7" strokeWidth={1.25} />
          </div>
          <span className="badge-status badge-status-ok">Reservation verified</span>
          <h1 className="text-2xl font-semibold text-charcoal mt-4 mb-2">Order confirmed</h1>
          <p className="text-slate-600 text-sm mb-2 font-normal">
            Reference:{' '}
            <span className="font-mono font-medium text-granite bg-sage-mist px-2 py-0.5 rounded-md">
              #{orderSuccess}
            </span>
          </p>
          <p className="text-slate-500 text-sm mb-8 max-w-md mx-auto leading-relaxed font-normal">
            Items are reserved and preparing for dispatch.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <Link to="/orders">
              <Button size="lg" className="w-full sm:w-auto">
                View orders
              </Button>
            </Link>
            <Link to="/products">
              <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                Continue shopping
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
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-granite/10">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-charcoal tracking-tight">
            Shopping cart
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 font-normal">
            {totalQuantity} {totalQuantity === 1 ? 'item' : 'items'}
          </p>
        </div>
        <button
          onClick={clearCart}
          className="text-xs font-medium text-slate-400 hover:text-rose-600 ui-transition flex items-center gap-1.5"
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span>Clear all</span>
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200/80 text-rose-800 rounded-lg px-4 py-3.5 text-sm mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" strokeWidth={1.5} />
            <span className="font-normal">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-700 p-1"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 flex flex-col gap-3">
          {cartItems.map((item) => (
            <div
              key={item.id}
              className="panel-quiet p-4 sm:p-5 flex items-center gap-4 hover:border-granite/15 ui-transition"
            >
              <ProductImage
                imageUrl={item.image_url}
                name={item.name}
                width={64}
                height={64}
                className="rounded-md flex-shrink-0 border border-granite/8 sm:w-[72px] sm:h-[72px]"
              />

              <div className="flex-1 min-w-0">
                <Link
                  to={`/products/${item.id}`}
                  className="font-semibold text-charcoal text-sm hover:text-granite ui-transition line-clamp-1 block"
                >
                  {item.name}
                </Link>
                <span className="badge-category mt-1 inline-block">{item.category}</span>
                <span className="text-sm price-gilt block mt-1.5">
                  ${Number(item.price || 0).toFixed(2)}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => removeFromCart(item.id)}
                  className="w-8 h-8 rounded-md border border-granite/12 text-slate-500 hover:bg-sage-mist flex items-center justify-center ui-transition"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
                <span className="w-7 text-center font-medium text-charcoal text-sm">
                  {item.quantity}
                </span>
                <button
                  onClick={() => addToCart(item)}
                  className="w-8 h-8 rounded-md border border-sea-green/25 bg-sea-green/5 text-sea-green hover:bg-sea-green hover:text-white flex items-center justify-center ui-transition"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>

              <div className="text-right min-w-[4.5rem]">
                <p className="font-semibold text-charcoal text-sm">
                  ${(Number(item.price || 0) * item.quantity).toFixed(2)}
                </p>
                <button
                  onClick={() => removeItemCompletely(item.id)}
                  className="text-xs text-slate-400 hover:text-rose-600 mt-1 inline-flex items-center gap-1 ui-transition font-normal"
                  title="Remove item"
                >
                  <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                  <span className="hidden sm:inline">Remove</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="glass-card rounded-lg p-6 flex flex-col gap-5 sticky top-24">
            <h2 className="font-semibold text-charcoal text-base pb-3 border-b border-granite/8">
              Order summary
            </h2>

            <div className="space-y-3 text-sm text-slate-600 font-normal">
              <div className="flex justify-between">
                <span>Items ({totalQuantity})</span>
                <span className="font-medium text-charcoal">${cartTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping</span>
                <span className="text-teal-deep font-medium">Free</span>
              </div>
              <div className="flex justify-between">
                <span>Estimated tax</span>
                <span className="font-medium text-charcoal">$0.00</span>
              </div>
            </div>

            <div className="border-t border-granite/8 pt-4 flex justify-between items-baseline">
              <span className="font-medium text-charcoal text-sm">Total</span>
              <span className="text-2xl price-gilt">${cartTotal.toFixed(2)}</span>
            </div>

            <Button
              fullWidth
              size="lg"
              loading={placing}
              onClick={handlePlaceOrder}
              className="py-3 gap-2"
            >
              <Package className="w-4 h-4" strokeWidth={1.5} />
              <span>{isAuthenticated ? 'Place order' : 'Sign in to checkout'}</span>
            </Button>

            <div className="flex items-center justify-center gap-2 text-xs text-slate-400 font-normal">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-deep shrink-0" strokeWidth={1.5} />
              <span>Secure checkout with live stock verification</span>
            </div>

            <Link
              to="/products"
              className="text-center text-xs font-medium text-slate-400 hover:text-charcoal ui-transition"
            >
              ← Continue shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
