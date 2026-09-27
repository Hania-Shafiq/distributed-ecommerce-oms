/**
 * pages/Orders/Orders.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Orders History Page for the Logged-in User.
 *
 * ARCHITECTURE & DATA FLOW:
 * 1. Fetch Orders: Queries Order Service (GET /orders?user_id=X).
 * 2. Fetch & Cache Products in Parallel:
 *    - Extracts all unique product_ids across all order line items.
 *    - Uses Promise.all to fetch product metadata (name, image_url, category)
 *      from the Product Service in parallel (O(1) round trips instead of N sequential).
 *    - Stores in a local lookup map (cache) so the same product across multiple
 *      orders is never fetched twice.
 * 3. Graceful UI States:
 *    - Loading: Animated skeletons/spinner.
 *    - Empty: Friendly zero-state with a "Browse Products" action.
 *    - Error: Graceful alert banner if Order Service is unreachable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMyOrders } from '../../api/orderApi';
import { getProductById } from '../../api/productApi';
import Button from '../../components/Button';

export default function Orders() {
  const { user } = useAuth();

  // Primary component states
  const [orders, setOrders] = useState([]);
  const [productsMap, setProductsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Resolve user_id from auth state or fallback
  const userId = user?.id || user?.user_id || 1;

  useEffect(() => {
    let isMounted = true;

    async function fetchOrdersAndProducts() {
      setLoading(true);
      setError(null);

      try {
        // ── 1. Fetch Orders from Order Service ─────────────────────────────────
        // Calls GET http://localhost:8004/orders?user_id={userId}
        const orderList = await getMyOrders(userId);

        if (!isMounted) return;
        setOrders(orderList || []);

        // ── 2. Extract Unique Product IDs & Fetch Details in Parallel ───────────
        // Collect all distinct product IDs across every order to avoid duplicate requests
        const uniqueProductIds = [
          ...new Set(
            (orderList || []).flatMap((order) =>
              (order.items || []).map((item) => item.product_id)
            )
          ),
        ];

        if (uniqueProductIds.length > 0) {
          // Fetch all unique products concurrently using Promise.all
          const productEntries = await Promise.all(
            uniqueProductIds.map(async (productId) => {
              try {
                const product = await getProductById(productId);
                return [productId, product];
              } catch (prodErr) {
                // If an individual product fetch fails, fallback gracefully without breaking the order
                console.warn(`[Orders] Could not fetch details for product #${productId}:`, prodErr);
                return [
                  productId,
                  { id: productId, name: `Product #${productId}`, image_url: null },
                ];
              }
            })
          );

          if (isMounted) {
            // Build lookup cache: { [productId]: { name, image_url, ... } }
            setProductsMap(Object.fromEntries(productEntries));
          }
        }
      } catch (err) {
        console.error('[Orders] Failed to load orders from Order Service:', err);
        if (isMounted) {
          setError(
            err?.response?.data?.detail ||
              'Unable to reach Order Service. Please make sure the service is running.'
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

  // ═══════════════════════════════════════════════════════════════════════════
  //  UI STATE 1: LOADING SKELETON
  // ═══════════════════════════════════════════════════════════════════════════
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-extrabold text-granite mb-8">My Orders</h1>
        <div className="flex flex-col gap-6">
          {[1, 2].map((n) => (
            <div
              key={n}
              className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 animate-pulse"
            >
              <div className="flex justify-between items-center pb-4 border-b border-gray-100 mb-4">
                <div className="h-5 w-32 bg-gray-200 rounded-lg"></div>
                <div className="h-6 w-24 bg-gray-200 rounded-full"></div>
              </div>
              <div className="flex items-center gap-4 py-2">
                <div className="w-14 h-14 bg-gray-200 rounded-xl"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 bg-gray-200 rounded"></div>
                  <div className="h-3 w-24 bg-gray-200 rounded"></div>
                </div>
                <div className="h-5 w-16 bg-gray-200 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  UI STATE 2: ERROR STATE (Order Service Unreachable / Warning Banner)
  // ═══════════════════════════════════════════════════════════════════════════
  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <div className="text-7xl mb-6">📋</div>
        <h1 className="text-3xl font-extrabold text-granite mb-3">My Orders</h1>
        <p className="text-gray-500 mb-4 max-w-md mx-auto">
          We couldn't connect to the Order Service to retrieve your history.
        </p>
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 inline-block mb-8 max-w-lg">
          ⚠️ {error}
        </div>
        <div>
          <Link to="/products">
            <Button size="lg">Browse Products</Button>
          </Link>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  UI STATE 3: EMPTY STATE (User Has No Orders Yet)
  // ═══════════════════════════════════════════════════════════════════════════
  if (orders.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <div className="text-7xl mb-6">📦</div>
        <h1 className="text-3xl font-extrabold text-granite mb-3">No orders yet</h1>
        <p className="text-gray-500 mb-8 max-w-md mx-auto">
          You haven't placed any orders yet — start shopping to fill your history!
        </p>
        <div>
          <Link to="/products">
            <Button size="lg">Browse Products</Button>
          </Link>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  UI STATE 4: SUCCESS (Render Live Order Cards)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-extrabold text-granite">My Orders</h1>
        <span className="text-sm text-gray-500 font-medium">
          {orders.length} {orders.length === 1 ? 'order' : 'orders'} placed
        </span>
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

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
      {/* ── Order Header ── */}
      <div className="bg-gray-50/80 px-6 py-4 border-b border-gray-100 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold text-granite text-base">
            Order #{order.id}
          </span>
          <span className="text-xs text-gray-400">•</span>
          <span className="text-xs text-gray-500">{formattedDate}</span>
        </div>

        <div className="flex items-center gap-4">
          <StatusBadge status={order.status} />
          <span className="font-extrabold text-granite text-lg">
            ${Number(order.total_amount || 0).toFixed(2)}
          </span>
        </div>
      </div>

      {/* ── Order Items List (Entire row is clickable) ── */}
      <div className="p-6 divide-y divide-gray-100">
        {(order.items || []).map((item, idx) => {
          const product = productsMap[item.product_id];
          const productName = product?.name || `Product #${item.product_id}`;
          const imageUrl = product?.image_url;
          const category = product?.category;

          return (
            <div
              key={item.id || idx}
              onClick={() => navigate(`/products/${item.product_id}`)}
              className="py-3 px-3 -mx-3 first:pt-3 last:pb-3 flex items-center justify-between gap-4 cursor-pointer hover:bg-gray-50/80 rounded-xl transition-all group select-none"
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
                  <span className="font-bold text-granite text-sm group-hover:text-sea-green transition-colors line-clamp-1 block">
                    {productName}
                  </span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Qty: <span className="font-semibold text-gray-600">{item.quantity}</span>
                    <span className="mx-1.5">•</span>
                    ${Number(item.unit_price || 0).toFixed(2)} each
                  </p>
                </div>
              </div>

              {/* Line Total */}
              <div className="text-right flex-shrink-0 flex items-center gap-3">
                <span className="font-bold text-granite text-sm">
                  ${(Number(item.unit_price || 0) * item.quantity).toFixed(2)}
                </span>
                <span className="text-gray-300 group-hover:text-sea-green group-hover:translate-x-0.5 transition-all text-sm">
                  →
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sub-component: Status Badge with Color Coding ────────────────────────────
function StatusBadge({ status }) {
  const normalized = (status || '').toUpperCase();

  const styles = {
    CONFIRMED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    PENDING:   'bg-amber-50 text-amber-700 border-amber-200',
    FAILED:    'bg-red-50 text-red-700 border-red-200',
  };

  const badgeClass =
    styles[normalized] || 'bg-gray-100 text-gray-700 border-gray-200';

  return (
    <span
      className={`text-xs font-bold px-3 py-1 rounded-full border ${badgeClass} uppercase tracking-wider`}
    >
      {normalized || 'UNKNOWN'}
    </span>
  );
}

// ── Sub-component: Product Image with Neutral Fallback Placeholder ──────────
function ProductImageThumbnail({ imageUrl, name, category }) {
  const [imgError, setImgError] = useState(false);

  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        alt={name}
        onError={() => setImgError(true)}
        className="w-14 h-14 object-cover rounded-xl border border-gray-100 flex-shrink-0"
      />
    );
  }

  // Neutral emoji thumbnail fallback
  const categoryEmojis = {
    Electronics: '💻',
    Furniture: '🪑',
    Kitchen: '🍳',
    'Sports & Outdoors': '🏃',
    Books: '📚',
    Home: '🏠',
    Fitness: '🏋️',
    Accessories: '👜',
  };

  const emoji = categoryEmojis[category] || '📦';

  return (
    <div className="w-14 h-14 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center text-xl flex-shrink-0 border border-gray-200/50 select-none">
      {emoji}
    </div>
  );
}
