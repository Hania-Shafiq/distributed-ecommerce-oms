/**
 * pages/Cart/Cart.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Editorial shopping cart with spacious item rows, refined quantity stepper,
 * sticky order summary card, and custom line illustration empty state.
 * All order placement API calls, auth checks, and cart handlers remain 100% intact.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
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

  // ── Custom Line Illustration Empty State ──
  if (cartItems.length === 0 && !orderSuccess) {
    return (
      <div className="page-container py-24 sm:py-32">
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-[#231C28]/[0.08] p-12 text-center shadow-sm">
          {/* Architectural Line Illustration */}
          <div className="w-24 h-24 mx-auto mb-6 text-slate-400">
            <svg viewBox="0 0 96 96" fill="none" stroke="currentColor" className="w-full h-full">
              <polygon points="48,6 86,28 86,68 48,90 10,68 10,28" strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />
              {/* Shopping Bag / Cart Geometric Line */}
              <path d="M30 36H66L62 70H34L30 36Z" stroke="#3D8361" strokeWidth="1.75" fill="#EBF4EF" fillOpacity="0.5" />
              <path d="M40 36V26C40 21.58 43.58 18 48 18C52.42 18 56 21.58 56 26V36" stroke="#1A161F" strokeWidth="1.75" strokeLinecap="round" />
              <circle cx="48" cy="52" r="3" fill="#B8956C" />
            </svg>
          </div>
          <div className="section-eyebrow justify-center mb-1">
            <span>BAG STATUS: EMPTY</span>
          </div>
          <h1 className="text-xl font-semibold text-[#1A161F] tracking-tight mb-2">
            Your shopping cart is empty
          </h1>
          <p className="text-slate-500 text-xs mb-8 max-w-xs mx-auto leading-relaxed">
            Browse our verified catalog with real-time stock allocation to add items.
          </p>
          <Link to="/products">
            <Button size="md" className="px-6 gap-2 mx-auto">
              <span>Explore Catalog</span>
              <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ── Order Success State ──
  if (orderSuccess) {
    return (
      <div className="page-container py-20">
        <div className="max-w-lg mx-auto bg-white rounded-2xl border border-[#231C28]/[0.08] p-10 text-center shadow-md">
          <div className="w-14 h-14 rounded-xl bg-[#EBF4EF] text-[#3D8361] flex items-center justify-center mx-auto mb-4 border border-[#3D8361]/25">
            <CheckCircle2 className="w-7 h-7" strokeWidth={1.75} />
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Reservation Confirmed
          </span>
          <h1 className="text-2xl font-semibold text-[#1A161F] mt-4 mb-2 tracking-tight">
            Order Successfully Placed
          </h1>
          <p className="text-slate-600 text-xs font-mono mb-2">
            REFERENCE:{' '}
            <span className="font-bold text-[#1A161F] bg-[#F1F4EE] px-2.5 py-1 rounded border border-[#231C28]/[0.08]">
              #{orderSuccess}
            </span>
          </p>
          <p className="text-slate-500 text-xs mb-8 max-w-sm mx-auto leading-relaxed">
            Inventory is locked via distributed SAGA transaction and preparing for dispatch.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <Link to="/orders">
              <Button size="md" className="w-full sm:w-auto px-6">
                View My Orders
              </Button>
            </Link>
            <Link to="/products">
              <Button size="md" variant="secondary" className="w-full sm:w-auto px-6">
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
    <div className="page-container py-10 sm:py-12">
      {/* ── Cart Header ── */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-[#231C28]/[0.08]">
        <div>
          <div className="section-eyebrow mb-1">
            <span>BAG // CHECKOUT SUMMARY</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#1A161F] tracking-tight">
            Shopping Cart
          </h1>
          <p className="text-slate-500 text-xs font-mono mt-0.5">
            {totalQuantity} {totalQuantity === 1 ? 'item' : 'items'} queued for reservation
          </p>
        </div>
        <button
          onClick={clearCart}
          className="text-xs font-mono font-medium text-slate-400 hover:text-rose-600 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-rose-50"
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span>Clear All</span>
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3.5 text-xs font-mono mb-6 flex items-start justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" strokeWidth={1.75} />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-700 p-1"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
      )}

      {/* ── Two-Column Layout with Item Rows & Sticky Order Summary ── */}
      <div className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Item Rows: Larger images, refined steppers, clear actions */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {cartItems.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-xl border border-[#231C28]/[0.08] hover:border-[#231C28]/[0.16] p-4 sm:p-5 flex items-center gap-4 sm:gap-6 transition-all shadow-[0_1px_3px_rgba(26,22,31,0.04)]"
            >
              {/* Larger Product Image Frame */}
              <ProductImage
                imageUrl={item.image_url}
                name={item.name}
                width={80}
                height={80}
                className="w-20 h-20 sm:w-22 sm:h-22 rounded-lg flex-shrink-0 border border-[#231C28]/[0.06] bg-[#F1F4EE]"
              />

              {/* Product Info */}
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#2D4239] bg-[#F1F4EE] px-2 py-0.5 rounded">
                  {item.category}
                </span>
                <Link
                  to={`/products/${item.id}`}
                  className="font-semibold text-[#1A161F] text-sm hover:text-[#3D8361] transition-colors line-clamp-1 block mt-1"
                >
                  {item.name}
                </Link>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-xs text-slate-400 font-mono">Unit:</span>
                  <span className="text-sm font-bold font-mono text-[#B8956C] tabular-nums">
                    ${Number(item.price || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Quantity Stepper with Better Affordance */}
              <div className="flex items-center gap-1.5 bg-[#F7F8F6] p-1 rounded-lg border border-[#231C28]/[0.08]">
                <button
                  onClick={() => removeFromCart(item.id)}
                  className="w-7 h-7 rounded-md bg-white border border-[#231C28]/[0.1] text-slate-600 hover:text-[#1A161F] hover:bg-slate-50 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-3 h-3" strokeWidth={1.75} />
                </button>
                <span className="w-8 text-center font-mono font-semibold text-[#1A161F] text-xs tabular-nums">
                  {item.quantity}
                </span>
                <button
                  onClick={() => addToCart(item)}
                  className="w-7 h-7 rounded-md bg-[#3D8361] text-white hover:bg-[#2D6349] flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-3 h-3" strokeWidth={1.75} />
                </button>
              </div>

              {/* Line Item Total & Remove Action */}
              <div className="text-right min-w-[5.5rem]">
                <p className="font-bold font-mono text-base text-[#1A161F] tabular-nums">
                  ${(Number(item.price || 0) * item.quantity).toFixed(2)}
                </p>
                <button
                  onClick={() => removeItemCompletely(item.id)}
                  className="text-[11px] font-mono text-slate-400 hover:text-rose-600 mt-1 inline-flex items-center gap-1 transition-colors"
                  title="Remove item"
                >
                  <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Sticky Order Summary Card */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-xl border border-[#231C28]/[0.08] shadow-[0_4px_24px_rgba(26,22,31,0.06)] p-6 flex flex-col gap-5 sticky top-24">
            <div className="pb-3 border-b border-[#231C28]/[0.08] flex items-center justify-between">
              <h2 className="font-semibold font-mono text-sm uppercase tracking-wider text-[#1A161F]">
                Order Manifest Summary
              </h2>
              <span className="text-[11px] font-mono text-slate-400">
                {totalQuantity} Units
              </span>
            </div>

            <div className="space-y-3 text-xs font-mono text-slate-600">
              <div className="flex justify-between">
                <span>Items Subtotal</span>
                <span className="font-semibold text-[#1A161F] tabular-nums">${cartTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Warehouse Freight</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  FREE SHIPPING
                </span>
              </div>
              <div className="flex justify-between">
                <span>Sales Tax (Estimated)</span>
                <span className="font-semibold text-[#1A161F] tabular-nums">$0.00</span>
              </div>
            </div>

            <div className="border-t border-[#231C28]/[0.08] pt-4 flex justify-between items-baseline">
              <span className="font-bold font-mono text-sm text-[#1A161F] uppercase">Total</span>
              <span className="text-2xl font-bold font-mono text-[#B8956C] tabular-nums">
                ${cartTotal.toFixed(2)}
              </span>
            </div>

            {/* Primary Order CTA */}
            <Button
              fullWidth
              size="lg"
              loading={placing}
              onClick={handlePlaceOrder}
              className="py-3 gap-2"
            >
              <Package className="w-4 h-4" strokeWidth={1.75} />
              <span>{isAuthenticated ? 'Place Order Now' : 'Sign In To Place Order'}</span>
            </Button>

            <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-slate-400 text-center">
              <ShieldCheck className="w-3.5 h-3.5 text-[#3D8361] shrink-0" strokeWidth={1.75} />
              <span>SAGA Distributed Lock & Inventory Guard</span>
            </div>

            <Link
              to="/products"
              className="text-center text-xs font-mono font-medium text-slate-400 hover:text-[#1A161F] transition-colors"
            >
              ← Back to Catalog
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
