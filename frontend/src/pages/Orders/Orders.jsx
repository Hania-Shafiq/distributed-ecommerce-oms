/**
 * pages/Orders/Orders.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Orders History Page for the Logged-in User.
 * Features parallel product metadata retrieval, responsive order cards,
 * and friendly error messaging without leaking backend internals.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Package,
  Calendar,
  ChevronRight,
  RotateCcw,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  ShoppingBag,
} from 'lucide-react';
import CategoryIcon from '../../components/CategoryIcon';
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

  const userId = user?.id || user?.user_id || 1;

  useEffect(() => {
    let isMounted = true;

    async function fetchOrdersAndProducts() {
      setLoading(true);
      setError(null);

      try {
        const orderList = await getMyOrders(userId);

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
  }, [userId]);

  // ── Loading Skeleton State ──
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="h-8 bg-gray-200 rounded-lg w-40 mb-8 animate-pulse" />
        <div className="flex flex-col gap-6">
          {[1, 2].map((n) => (
            <div
              key={n}
              className="bg-white rounded-lg border border-gray-200/80 p-6 shadow-xs animate-pulse"
            >
              <div className="flex justify-between items-center pb-4 border-b border-gray-100 mb-4">
                <div className="h-5 w-36 bg-gray-200 rounded-md" />
                <div className="h-6 w-24 bg-gray-200 rounded-full" />
              </div>
              <div className="flex items-center gap-4 py-2">
                <div className="w-16 h-16 bg-gray-200 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 bg-gray-200 rounded" />
                  <div className="h-3 w-24 bg-gray-200 rounded" />
                </div>
                <div className="h-5 w-16 bg-gray-200 rounded" />
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
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-semibold text-granite mb-2">Order History Notice</h1>
        <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto leading-relaxed">
          {error}
        </p>
        <div className="flex justify-center gap-3">
          <Button
            variant="secondary"
            onClick={() => window.location.reload()}
            className="gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Refresh</span>
          </Button>
          <Link to="/products">
            <Button>Browse Catalog</Button>
          </Link>
        </div>
      </div>
    );
  }

  // ── Empty State ──
  if (orders.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-24 sm:py-32 text-center">
        <div className="w-20 h-20 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-6">
          <Package className="w-10 h-10" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-granite mb-2">No orders placed yet</h1>
        <p className="text-gray-500 text-sm mb-8 max-w-sm mx-auto leading-relaxed">
          Once you complete an order, your tracking details and purchase records will appear right here.
        </p>
        <Link to="/products">
          <Button size="lg" className="px-8 gap-2">
            <ShoppingBag className="w-4 h-4" />
            <span>Start Shopping</span>
          </Button>
        </Link>
      </div>
    );
  }

  // ── Active Orders List ──
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-charcoal tracking-tight">Order history</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {orders.length} {orders.length === 1 ? 'order' : 'orders'} placed
          </p>
        </div>
        <Link to="/products">
          <Button variant="secondary" size="sm" className="gap-1.5">
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Shop More</span>
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-6">
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            productsMap={productsMap}
          />
        ))}
      </div>
    </div>
  );
}

// ── Sub-component: Individual Order Card ──────────────────────────────────────
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
      className="bg-white rounded-lg border border-gray-200/80 shadow-xs overflow-hidden hover:shadow-lg hover:border-sea-green/30 transition-all cursor-pointer group/card select-none"
      title={firstProductId ? 'Click to view product details' : undefined}
    >
      {/* ── Order Header ── */}
      <div className="bg-gray-50/70 px-6 py-4 border-b border-gray-100 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold text-granite text-sm sm:text-base group-hover/card:text-sea-green transition-colors">
            Order #{order.id}
          </span>
          <span className="text-xs text-gray-300">•</span>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            <span>{formattedDate}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <StatusBadge status={order.status} />
          <span className="font-semibold text-granite text-base sm:text-lg">
            ${Number(order.total_amount || 0).toFixed(2)}
          </span>
        </div>
      </div>

      {/* ── Order Items List ── */}
      <div className="p-6 divide-y divide-gray-100">
        {(order.items || []).map((item, idx) => {
          const product = productsMap[item.product_id];
          const productName = product?.name || `Item #${item.product_id}`;
          const imageUrl = product?.image_url;
          const category = product?.category;

          return (
            <div
              key={item.id || idx}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/products/${item.product_id}`);
              }}
              className="py-3 px-3 -mx-3 first:pt-2 last:pb-2 flex items-center justify-between gap-4 hover:bg-gray-50/80 rounded-lg transition-all group/item"
              title={`View ${productName}`}
            >
              {/* Product Thumbnail & Details */}
              <div className="flex items-center gap-4 min-w-0">
                <ProductImageThumbnail
                  imageUrl={imageUrl}
                  name={productName}
                  category={category}
                />
                <div className="min-w-0">
                  <span className="font-bold text-granite text-sm group-hover/item:text-sea-green group-hover/card:text-sea-green transition-colors line-clamp-1 block">
                    {productName}
                  </span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Qty: <span className="font-semibold text-gray-700">{item.quantity}</span>
                    <span className="mx-1.5 text-gray-300">•</span>
                    ${Number(item.unit_price || 0).toFixed(2)} each
                  </p>
                </div>
              </div>

              {/* Line Total */}
              <div className="text-right flex-shrink-0 flex items-center gap-3">
                <span className="font-bold text-granite text-sm">
                  ${(Number(item.unit_price || 0) * item.quantity).toFixed(2)}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover/item:text-sea-green group-hover/card:text-sea-green group-hover/card:translate-x-0.5 transition-all" />
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
      classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: CheckCircle2,
    },
    PENDING: {
      classes: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: Clock,
    },
    FAILED: {
      classes: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: XCircle,
    },
  };

  const config = configs[normalized] || {
    classes: 'bg-gray-100 text-gray-700 border-gray-200',
    icon: Clock,
  };

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border ${config.classes} uppercase tracking-wider`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{normalized || 'PROCESSING'}</span>
    </span>
  );
}

// ── Sub-component: Product Image Thumbnail ────────────────────────────────────
function ProductImageThumbnail({ imageUrl, name, category }) {
  const [imgError, setImgError] = useState(false);

  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        alt={name}
        onError={() => setImgError(true)}
        className="w-14 h-14 object-cover rounded-md border border-gray-100 flex-shrink-0"
      />
    );
  }

  return (
    <div className="w-14 h-14 bg-sage-mist rounded-md flex items-center justify-center text-granite/45 flex-shrink-0 border border-granite/8 select-none">
      <CategoryIcon category={category} className="w-5 h-5" />
    </div>
  );
}
