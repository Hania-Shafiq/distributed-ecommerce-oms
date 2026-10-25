/**
 * pages/Orders/Orders.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Editorial Order History with unified page-container, timeline-style order cards,
 * mono order headers, gold pricing, and custom line illustration empty state.
 * Server-side pagination (limit=20) supported.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Calendar,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  ShoppingBag,
} from 'lucide-react';
import ProductImage from '../../components/ProductImage';
import { useAuth } from '../../context/AuthContext';
import { getMyOrders } from '../../api/orderApi';
import { getProductById } from '../../api/productApi';
import Button from '../../components/Button';
import { formatError } from '../../utils/formatError';

export default function Orders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [productsMap, setProductsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const userId = user?.id || user?.user_id;

  useEffect(() => {
    let isMounted = true;

    if (!userId) {
      setLoading(false);
      return;
    }

    async function fetchOrdersAndProducts() {
      setLoading(true);
      setError(null);

      try {
        const skip = (page - 1) * PAGE_SIZE;
        const orderList = await getMyOrders(userId, { skip, limit: PAGE_SIZE });

        if (!isMounted) return;
        setOrders(orderList || []);

        const uniqueProductIds = [
          ...new Set(
            (orderList || []).flatMap((order) =>
              (order.items || []).map((item) => item.product_id)
            )
          ),
        ];

        if (uniqueProductIds.length > 0) {
          const productEntries = await Promise.all(
            uniqueProductIds.map(async (productId) => {
              try {
                const product = await getProductById(productId);
                return [productId, product];
              } catch (prodErr) {
                console.warn(`[Orders] Could not fetch details for item #${productId}:`, prodErr);
                return [
                  productId,
                  { id: productId, name: `Item #${productId}`, image_url: null },
                ];
              }
            })
          );

          if (isMounted) {
            setProductsMap(Object.fromEntries(productEntries));
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(
            formatError(
              err,
              'Unable to retrieve your order history right now. Please try again shortly.'
            )
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchOrdersAndProducts();

    return () => {
      isMounted = false;
    };
  }, [userId, page]);

  // ── Loading Skeleton State ──
  if (loading) {
    return (
      <div className="page-container py-10 sm:py-12">
        <div className="h-4 bg-[#F1F4EE] dark:bg-[#1A2C26] rounded w-32 mb-2 animate-pulse" />
        <div className="h-8 bg-[#F1F4EE] dark:bg-[#1A2C26] rounded w-64 mb-8 animate-pulse" />
        <div className="flex flex-col gap-6">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="bg-white dark:bg-[#111C18] rounded-xl border border-[#231C28]/[0.08] dark:border-white/10 p-6 shadow-xs animate-pulse"
            >
              <div className="flex justify-between items-center pb-4 border-b border-[#231C28]/[0.06] dark:border-white/10 mb-4">
                <div className="h-5 w-44 bg-[#F1F4EE] dark:bg-[#1A2C26] rounded" />
                <div className="h-6 w-28 bg-[#F1F4EE] dark:bg-[#1A2C26] rounded-full" />
              </div>
              <div className="flex items-center gap-4 py-2">
                <div className="w-16 h-16 bg-[#F1F4EE] dark:bg-[#1A2C26] rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 bg-[#F1F4EE] dark:bg-[#1A2C26] rounded" />
                  <div className="h-3 w-28 bg-[#F1F4EE] dark:bg-[#1A2C26] rounded" />
                </div>
                <div className="h-5 w-20 bg-[#F1F4EE] dark:bg-[#1A2C26] rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error State ──
  if (error) {
    return (
      <div className="page-container py-20 text-center">
        <div className="max-w-md mx-auto bg-white dark:bg-[#111C18] rounded-2xl border border-[#231C28]/[0.08] dark:border-white/10 p-10 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4 border border-amber-200 dark:border-amber-900/40">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-semibold text-[#1A161F] dark:text-[#E6EFEA] mb-1 font-mono uppercase">
            Manifest Notice
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs mb-6 max-w-sm mx-auto leading-relaxed font-mono">
            {error}
          </p>
          <div className="flex justify-center gap-3">
            <Button
              variant="secondary"
              onClick={() => window.location.reload()}
              className="gap-2 text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </Button>
            <Link to="/products">
              <Button size="md" className="text-xs">Browse Catalog</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Empty State ──
  if (orders.length === 0 && page === 1) {
    return (
      <div className="page-container py-24 sm:py-32 text-center">
        <div className="max-w-md mx-auto bg-white dark:bg-[#111C18] rounded-2xl border border-[#231C28]/[0.08] dark:border-white/10 p-12 shadow-sm">
          <div className="w-24 h-24 mx-auto mb-6 text-slate-400">
            <svg viewBox="0 0 96 96" fill="none" stroke="currentColor" className="w-full h-full">
              <polygon points="48,8 84,28 84,68 48,88 12,68 12,28" strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />
              <polygon points="48,22 74,36 74,66 48,80 22,66 22,36" stroke="#3D8361" strokeWidth="1.75" fill="#EBF4EF" className="dark:fill-[#14231E]" fillOpacity="0.4" />
              <path d="M48 22V80" stroke="#3D8361" strokeWidth="1.25" opacity="0.6" />
              <path d="M22 36L48 50L74 36" stroke="#3D8361" strokeWidth="1.25" opacity="0.6" />
              <circle cx="48" cy="50" r="3" fill="#B8956C" />
            </svg>
          </div>
          <div className="section-eyebrow justify-center mb-1">
            <span>MANIFEST ARCHIVE: EMPTY</span>
          </div>
          <h1 className="text-xl font-semibold text-[#1A161F] dark:text-[#E6EFEA] tracking-tight mb-2">
            No orders placed yet
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs mb-8 max-w-xs mx-auto leading-relaxed">
            When you checkout with verified inventory, your full SAGA transaction manifest will be archived here.
          </p>
          <Link to="/products">
            <Button size="md" className="px-6 gap-2 mx-auto">
              <ShoppingBag className="w-4 h-4" />
              <span>Start Shopping</span>
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const startIdx = (page - 1) * PAGE_SIZE + 1;
  const endIdx = (page - 1) * PAGE_SIZE + orders.length;

  return (
    <div className="page-container py-10 sm:py-12">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-4 border-b border-[#231C28]/[0.08] dark:border-white/10">
        <div>
          <div className="section-eyebrow mb-1">
            <span>02 / ORDER MANIFESTS</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-semibold text-[#1A161F] dark:text-[#E6EFEA] tracking-tight">
              Order History
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#3D8361]/10 dark:bg-emerald-950/60 text-[#3D8361] dark:text-emerald-300 border border-[#3D8361]/20 dark:border-emerald-700/40">
              Paginated (Limit: 20)
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs font-mono mt-0.5">
            Showing orders {startIdx}–{endIdx} • Page {page}
          </p>
        </div>
        <Link to="/products">
          <Button variant="secondary" size="sm" className="gap-1.5 text-xs">
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Shop More</span>
          </Button>
        </Link>
      </div>

      {/* ── Timeline-Style Order Cards ── */}
      <div className="flex flex-col gap-6 mb-8">
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            productsMap={productsMap}
          />
        ))}
      </div>

      {/* ── Server-Side Pagination Bar ── */}
      <div className="flex items-center justify-between py-4 px-6 bg-white dark:bg-[#111C18] rounded-xl border border-[#231C28]/[0.08] dark:border-white/10 shadow-2xs">
        <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
          Page <strong className="text-[#1A161F] dark:text-[#E6EFEA]">{page}</strong> (showing {orders.length} items)
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="gap-1 text-xs font-mono"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={orders.length < PAGE_SIZE}
            className="gap-1 text-xs font-mono"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-component: Timeline Order Card ────────────────────────────────────────
function OrderCard({ order, productsMap }) {
  const navigate = useNavigate();

  const formattedDate = order.created_at
    ? new Date(order.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Recently';

  const firstProductId = order.items?.[0]?.product_id;

  const handleCardClick = () => {
    if (firstProductId) {
      navigate(`/products/${firstProductId}`);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className="bg-white dark:bg-[#111C18] rounded-xl border border-[#231C28]/[0.08] dark:border-white/10 hover:border-[#231C28]/[0.18] dark:hover:border-white/20 overflow-hidden transition-all duration-200 hover:-translate-y-[2px] hover:shadow-[0_4px_18px_rgba(26,22,31,0.06)] cursor-pointer group/card select-none"
      title={firstProductId ? 'Click to view product details' : undefined}
    >
      {/* ── Order Header Row: Order ID, Date, Status Pill, Total ── */}
      <div className="bg-[#F7F8F6] dark:bg-[#14231E] px-6 py-4 border-b border-[#231C28]/[0.06] dark:border-white/10 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold text-[#1A161F] dark:text-[#E6EFEA] text-sm sm:text-base group-hover/card:text-[#3D8361] dark:group-hover/card:text-emerald-400 transition-colors">
            ORDER #{order.id}
          </span>
          <span className="text-slate-300 dark:text-slate-600">•</span>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{formattedDate}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <StatusBadge status={order.status} />
          <span className="font-bold font-mono text-base sm:text-lg text-[#B8956C] tabular-nums">
            ${Number(order.total_amount || 0).toFixed(2)}
          </span>
        </div>
      </div>

      {/* ── Order Items List ── */}
      <div className="p-6 divide-y divide-[#231C28]/[0.06] dark:divide-white/10">
        {(order.items || []).map((item, idx) => {
          const product = productsMap[item.product_id];
          const productName = product?.name || `Item #${item.product_id}`;
          const imageUrl = product?.image_url;

          return (
            <div
              key={item.id || idx}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/products/${item.product_id}`);
              }}
              className="py-3.5 px-3 -mx-3 first:pt-1 last:pb-1 flex items-center justify-between gap-4 hover:bg-slate-50/80 dark:hover:bg-white/[0.04] rounded-lg transition-all group/item"
              title={`View ${productName}`}
            >
              {/* Product Thumbnail & Details */}
              <div className="flex items-center gap-4 min-w-0">
                <ProductImage
                  imageUrl={imageUrl}
                  name={productName}
                  width={56}
                  height={56}
                  className="w-14 h-14 rounded-lg flex-shrink-0 border border-[#231C28]/[0.06] dark:border-white/10 bg-[#F1F4EE] dark:bg-[#14231E]"
                />
                <div className="min-w-0">
                  <span className="font-semibold text-[#1A161F] dark:text-[#E6EFEA] text-sm group-hover/item:text-[#3D8361] dark:group-hover/item:text-emerald-400 group-hover/card:text-[#3D8361] dark:group-hover/card:text-emerald-400 transition-colors line-clamp-1 block">
                    {productName}
                  </span>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">
                    Qty: <span className="font-semibold text-slate-700 dark:text-slate-300">{item.quantity}</span>
                    <span className="mx-1.5 text-slate-300 dark:text-slate-600">•</span>
                    <span className="text-[#B8956C]">${Number(item.unit_price || 0).toFixed(2)}</span> each
                  </p>
                </div>
              </div>

              {/* Line Total */}
              <div className="text-right flex-shrink-0 flex items-center gap-3">
                <span className="font-bold font-mono text-sm text-[#1A161F] dark:text-[#E6EFEA] tabular-nums">
                  ${(Number(item.unit_price || 0) * item.quantity).toFixed(2)}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover/item:text-[#3D8361] dark:group-hover/item:text-emerald-400 group-hover/card:text-[#3D8361] dark:group-hover/card:text-emerald-400 group-hover/card:translate-x-0.5 transition-all" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sub-component: Status Badge ──────────────────────────────────────────────
function StatusBadge({ status }) {
  const normalized = (status || '').toUpperCase();

  const configs = {
    CONFIRMED: {
      classes: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-700/40',
      icon: CheckCircle2,
    },
    PENDING: {
      classes: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200/80 dark:border-amber-700/40',
      icon: Clock,
    },
    FAILED: {
      classes: 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200/80 dark:border-rose-900/40',
      icon: XCircle,
    },
  };

  const config = configs[normalized] || {
    classes: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10',
    icon: Clock,
  };

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${config.classes} uppercase tracking-wider`}
    >
      <Icon className="w-3 h-3" />
      <span>{normalized || 'PROCESSING'}</span>
    </span>
  );
}
