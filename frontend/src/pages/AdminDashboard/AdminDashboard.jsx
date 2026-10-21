/**
 * pages/AdminDashboard/AdminDashboard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Analytics & Store Administration Dashboard.
 * Data sources:
 *   Product analytics → Catalog summary, low-stock alerts, price metrics
 *   Order analytics   → Elasticsearch "orders_daily" rollups:
 *                       - /analytics/overview (KPI summary + last sync time)
 *                       - /analytics/revenue-trend (daily trend)
 *                       - /analytics/orders-by-weekday (weekly distribution)
 *                       - /analytics/top-selling-products & revenue-by-category
 *   Order management  → Admin filtered & paginated orders ledger (GET /orders)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  DollarSign,
  TrendingDown,
  TrendingUp,
  BarChart3,
  CheckCircle2,
  Clock,
  XCircle,
  ClipboardList,
  Trophy,
  Banknote,
  Layers,
  AlertTriangle,
  CheckCircle,
  RotateCcw,
  ShieldCheck,
  Share2,
  Calendar,
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import {
  getTotalProducts,
  getCategorySummary,
  getLowStock,
  getPriceRange,
  getTopSellingProducts,
  getRevenueByCategory,
  getOrderStatus,
  getAnalyticsOverview,
  getRevenueTrend,
  getOrdersByWeekday,
} from '../../api/analyticsApi';
import { getOrders } from '../../api/orderApi';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { formatError } from '../../utils/formatError';

// ── Number & Currency Formatters ─────────────────────────────────────────────
const currencyCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
});

const currencyFull = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberCompact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const numberFull = new Intl.NumberFormat('en-US');

function formatCurrency(val, compact = false) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const num = Number(val);
  return compact ? currencyCompact.format(num) : currencyFull.format(num);
}

function formatNumber(val, compact = false) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const num = Number(val);
  return compact ? numberCompact.format(num) : numberFull.format(num);
}

// ── Status styling & icons ───────────────────────────────────────────────────
const STATUS_STYLES = {
  CONFIRMED: {
    bg: 'bg-emerald-50/70 border-emerald-200/80',
    icon: CheckCircle2,
    iconColor: 'text-emerald-700',
    pill: 'bg-emerald-100/80 text-emerald-800 border-emerald-200/80',
    dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]',
  },
  PENDING: {
    bg: 'bg-amber-50/70 border-amber-200/80',
    icon: Clock,
    iconColor: 'text-amber-700',
    pill: 'bg-amber-100/80 text-amber-800 border-amber-200/80',
    dot: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]',
  },
  FAILED: {
    bg: 'bg-rose-50/70 border-rose-200/80',
    icon: XCircle,
    iconColor: 'text-rose-700',
    pill: 'bg-rose-100/80 text-rose-800 border-rose-200/80',
    dot: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]',
  },
};

// ── Reusable Stat Tile ───────────────────────────────────────────────────────
function StatTile({ label, value, isCurrency = false, icon, sub, colorClass = 'bg-[#3D8361]/10 text-[#3D8361]' }) {
  const numVal = value !== undefined && value !== null && !isNaN(value) ? Number(value) : null;
  const isLarge = numVal !== null && numVal >= 1000000;

  const displayVal = numVal !== null
    ? (isCurrency ? formatCurrency(numVal, isLarge) : (isLarge ? formatNumber(numVal, true) : formatNumber(numVal, false)))
    : (value ?? '—');

  const fullVal = numVal !== null
    ? (isCurrency ? formatCurrency(numVal, false) : formatNumber(numVal, false))
    : String(value ?? '—');

  return (
    <div
      title={fullVal}
      className="bg-white rounded-xl border border-[#231C28]/[0.08] hover:border-[#231C28]/[0.16] p-5 flex items-center gap-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_18px_rgba(26,22,31,0.06)]"
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${colorClass}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-slate-400 uppercase font-mono font-medium tracking-wider truncate">{label}</p>
        <p className="text-xl sm:text-2xl font-bold font-mono text-[#1A161F] tracking-tight mt-0.5 tabular-nums truncate">
          {displayVal}
        </p>
        {sub && <p className="text-xs text-slate-500 mt-0.5 truncate font-normal">{sub}</p>}
      </div>
    </div>
  );
}

// ── Reusable Horizontal Bar Chart Row ────────────────────────────────────────
function HorizontalBar({ label, value, maxValue, prefix = '', isCurrency = false, color = 'bg-[#3D8361]' }) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;
  const num = Number(value || 0);

  const fullString = isCurrency
    ? formatCurrency(num, false)
    : `${prefix}${num.toLocaleString()}`;

  const displayString = isCurrency
    ? (num >= 100000 ? formatCurrency(num, true) : formatCurrency(num, false))
    : `${prefix}${num >= 100000 ? formatNumber(num, true) : num.toLocaleString()}`;

  return (
    <div className="flex items-center gap-3 py-1.5 group/bar" title={`${label}: ${fullString}`}>
      <span className="text-xs font-semibold text-[#1A161F] w-36 sm:w-44 truncate shrink-0" title={label}>
        {label}
      </span>
      <div className="flex-1 bg-[#231C28]/[0.06] rounded-full h-2 overflow-hidden">
        <div
          className={`${color} h-2 rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono font-semibold text-slate-700 w-24 text-right tabular-nums shrink-0">
        {displayString}
      </span>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats]           = useState({});
  const [orderStats, setOrderStats] = useState({});
  const [overview, setOverview]     = useState({});
  const [revenueTrend, setRevenueTrend] = useState([]);
  const [ordersByWeekday, setOrdersByWeekday] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // ── Admin Order Ledger State & Filters ──
  const [adminOrders, setAdminOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderPage, setOrderPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [filterOrderId, setFilterOrderId] = useState('');
  const [filterCreatedFrom, setFilterCreatedFrom] = useState('');
  const [filterCreatedTo, setFilterCreatedTo] = useState('');
  const PAGE_SIZE = 10;

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      // Product analytics
      const [total, categories, lowStock, priceRange] = await Promise.all([
        getTotalProducts(),
        getCategorySummary(),
        getLowStock(),
        getPriceRange(),
      ]);
      setStats({ total, categories, lowStock, priceRange });

      // Order analytics & daily rollups
      const [topProducts, revByCat, ordStatus, ovResp, trendResp, weekdayResp] = await Promise.allSettled([
        getTopSellingProducts(8),
        getRevenueByCategory(),
        getOrderStatus(),
        getAnalyticsOverview(),
        getRevenueTrend(14),
        getOrdersByWeekday(),
      ]);

      setOrderStats({
        topProducts:       topProducts.status       === 'fulfilled' ? topProducts.value       : [],
        revenueByCategory: revByCat.status          === 'fulfilled' ? revByCat.value          : [],
        orderStatus:       ordStatus.status         === 'fulfilled' ? ordStatus.value         : [],
      });

      if (ovResp.status === 'fulfilled') setOverview(ovResp.value || {});
      if (trendResp.status === 'fulfilled') setRevenueTrend(trendResp.value || []);
      if (weekdayResp.status === 'fulfilled') setOrdersByWeekday(weekdayResp.value || []);

    } catch (err) {
      setError(
        formatError(
          err,
          'Analytics data is currently offline. Please verify the connection or try refreshing the dashboard.'
        )
      );
    } finally {
      setLoading(false);
    }
  }

  const fetchAdminOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const skip = (orderPage - 1) * PAGE_SIZE;
      const data = await getOrders({
        userId: filterUserId ? Number(filterUserId) : undefined,
        status: filterStatus || undefined,
        orderId: filterOrderId ? Number(filterOrderId) : undefined,
        createdFrom: filterCreatedFrom ? `${filterCreatedFrom}T00:00:00Z` : undefined,
        createdTo: filterCreatedTo ? `${filterCreatedTo}T23:59:59Z` : undefined,
        skip,
        limit: PAGE_SIZE,
      });
      setAdminOrders(data || []);
    } catch (err) {
      console.warn('Failed to fetch admin orders:', err);
    } finally {
      setOrdersLoading(false);
    }
  }, [orderPage, filterStatus, filterUserId, filterOrderId, filterCreatedFrom, filterCreatedTo]);

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    fetchAdminOrders();
  }, [fetchAdminOrders]);

  const handleApplyOrderFilters = (e) => {
    e.preventDefault();
    setOrderPage(1);
    fetchAdminOrders();
  };

  const handleResetOrderFilters = () => {
    setFilterStatus('');
    setFilterUserId('');
    setFilterOrderId('');
    setFilterCreatedFrom('');
    setFilterCreatedTo('');
    setOrderPage(1);
  };

  if (loading) {
    return (
      <div className="page-container py-12">
        <div className="h-8 bg-slate-200 rounded-lg w-52 mb-8 animate-pulse" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="bg-white rounded-xl border border-slate-200 p-6 h-28 animate-pulse" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 h-72 animate-pulse" />
          <div className="bg-white rounded-xl border border-slate-200 p-6 h-72 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto text-center py-24 px-4">
        <div className="w-16 h-16 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-200">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-[#1A161F] mb-2 font-mono">Analytics Notice</h2>
        <p className="text-slate-500 text-sm mb-6 leading-relaxed">{error}</p>
        <Button onClick={fetchAll} className="gap-2 mx-auto">
          <RotateCcw className="w-4 h-4" />
          <span>Refresh Dashboard</span>
        </Button>
      </div>
    );
  }

  const { total, categories = [], lowStock = [], priceRange = {} } = stats;
  const { topProducts = [], revenueByCategory = [], orderStatus = [] } = orderStats;

  const totalCount  = categories.reduce((acc, c) => acc + (c.product_count || 0), 0) || 1;
  const maxQty      = topProducts.length ? Math.max(...topProducts.map(p => p.total_quantity)) : 1;
  const maxRevenue  = revenueByCategory.length ? Math.max(...revenueByCategory.map(c => c.total_revenue)) : 1;
  const totalOrders = overview?.total_orders || orderStatus.reduce((s, o) => s + o.count, 0) || 0;
  const maxWeekdayOrders = ordersByWeekday.length ? Math.max(...ordersByWeekday.map(d => d.order_count || 0), 1) : 1;
  const maxTrendRevenue = revenueTrend.length ? Math.max(...revenueTrend.map(d => d.revenue || 0), 1) : 1;

  const formattedSyncTime = overview?.last_sync_time
    ? new Date(overview.last_sync_time).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium',
        timeZone: 'UTC',
      }) + ' UTC'
    : 'Not yet synchronized';

  return (
    <div className="page-container py-10">
      {/* ── Dashboard Eyebrow & Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-4 border-b border-[#231C28]/[0.08]">
        <div>
          <span className="text-[11px] font-mono tracking-widest text-[#3D8361] uppercase font-semibold block mb-1">
            05 / SYSTEM ANALYTICS
          </span>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-semibold text-[#1A161F] tracking-tight">
              Admin Dashboard
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-[#3D8361]/10 text-[#3D8361] border border-[#3D8361]/20">
              <ShieldCheck className="w-3 h-3" strokeWidth={1.75} />
              <span>Admin</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-slate-500 text-xs font-mono mt-1">
            <span>Real-time telemetry & Elasticsearch daily rollups</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Last Sync: {formattedSyncTime}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <Link
            to="/admin/graph"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border border-[#231C28]/10 bg-white text-[#1A161F] hover:bg-slate-50 hover:border-[#3D8361]/40 transition-colors shadow-2xs"
          >
            <Share2 className="w-3.5 h-3.5 text-[#3D8361]" />
            <span>Co-Purchase Graph</span>
          </Link>
          <Button variant="secondary" size="sm" onClick={fetchAll} className="gap-2 text-xs font-mono">
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Refresh Telemetry</span>
          </Button>
        </div>
      </div>

      {/* ── Executive Overview KPI Tiles ── */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatTile
          icon={<DollarSign className="w-5 h-5" strokeWidth={1.75} />}
          label="Total Revenue"
          value={overview?.total_revenue}
          isCurrency={true}
          sub="Confirmed orders gross"
          colorClass="bg-[#3D8361]/10 text-[#3D8361]"
        />
        <StatTile
          icon={<BarChart3 className="w-5 h-5" strokeWidth={1.75} />}
          label="Total Orders"
          value={totalOrders}
          sub={`AOV: ${formatCurrency(overview?.avg_order_value)}`}
          colorClass="bg-[#B8956C]/10 text-[#B8956C]"
        />
        <StatTile
          icon={<Package className="w-5 h-5" strokeWidth={1.75} />}
          label="Catalog Products"
          value={total?.total_products}
          sub={`${categories.length} active categories`}
          colorClass="bg-[#2A5F52]/10 text-[#2A5F52]"
        />
        <StatTile
          icon={<TrendingUp className="w-5 h-5" strokeWidth={1.75} />}
          label="Avg Item Price"
          value={priceRange?.avg_price}
          isCurrency={true}
          sub={`Range: ${formatCurrency(priceRange?.min_price)} - ${formatCurrency(priceRange?.max_price)}`}
          colorClass="bg-slate-100 text-slate-700"
        />
      </div>

      {/* ── Order Status Breakdown (Exact Postgres Match) ── */}
      {orderStatus.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-[#1A161F] flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#3D8361]" />
              <span>Order Fulfillment Status</span>
            </h2>
            <span className="text-xs font-mono text-slate-500">
              {totalOrders.toLocaleString()} total orders recorded (ES = PostgreSQL verified)
            </span>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {orderStatus.map(({ status, count }) => {
              const style = STATUS_STYLES[status] || {
                bg: 'bg-slate-50/70 border-slate-200/80',
                icon: ClipboardList,
                iconColor: 'text-slate-600',
                pill: 'bg-slate-100 text-slate-700 border-slate-200',
                dot: 'bg-slate-400',
              };
              const StatusIcon = style.icon;
              const pct = totalOrders > 0 ? ((count / totalOrders) * 100).toFixed(2) : 0;
              return (
                <div
                  key={status}
                  className={`${style.bg} border rounded-xl p-5 flex items-center gap-4 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_18px_rgba(26,22,31,0.06)]`}
                >
                  <div className="w-12 h-12 rounded-xl bg-white shadow-xs border border-black/[0.04] flex items-center justify-center flex-shrink-0">
                    <StatusIcon className={`w-6 h-6 ${style.iconColor}`} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                      <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${style.pill}`}>
                        {status}
                      </span>
                    </div>
                    <p className="text-2xl font-bold font-mono text-[#1A161F] tabular-nums">{count.toLocaleString()}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{pct}% of total orders</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Daily Revenue Trend & Weekday Orders ── */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Revenue Trend */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#3D8361]" />
              <span>Daily Revenue Trend</span>
            </span>
          }
          subtitle="Confirmed sales trajectory (/analytics/revenue-trend)"
        >
          {revenueTrend.length === 0 ? (
            <p className="text-slate-400 text-sm py-4 italic">No trend data available yet.</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
              {revenueTrend.map(d => (
                <HorizontalBar
                  key={d.date}
                  label={d.date}
                  value={d.revenue}
                  maxValue={maxTrendRevenue}
                  isCurrency={true}
                  color="bg-[#3D8361]"
                />
              ))}
            </div>
          )}
        </Card>

        {/* Orders by Weekday */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#B8956C]" />
              <span>Orders by Weekday</span>
            </span>
          }
          subtitle="Day-of-week volume distribution (/analytics/orders-by-weekday)"
        >
          {ordersByWeekday.length === 0 ? (
            <p className="text-slate-400 text-sm py-4 italic">No weekday volume recorded yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {ordersByWeekday.map(d => (
                <HorizontalBar
                  key={d.weekday}
                  label={d.weekday}
                  value={d.order_count}
                  maxValue={maxWeekdayOrders}
                  prefix=""
                  color="bg-[#B8956C]"
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Order Sales Analytics ── */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Top-Selling Products */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#B8956C]" />
              <span>Top-Selling Products</span>
            </span>
          }
          subtitle="Highest units ordered across customer manifests"
        >
          {topProducts.length === 0 ? (
            <p className="text-slate-400 text-sm py-4 italic">
              No orders recorded yet. Top-selling items will appear here once purchases are placed.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {topProducts.map(p => (
                <HorizontalBar
                  key={p.product_id}
                  label={p.product_name}
                  value={p.total_quantity}
                  maxValue={maxQty}
                  color="bg-[#3D8361]"
                />
              ))}
            </div>
          )}
        </Card>

        {/* Revenue by Category */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-[#3D8361]" />
              <span>Revenue by Category</span>
            </span>
          }
          subtitle="Cumulative gross sales distribution"
        >
          {revenueByCategory.length === 0 ? (
            <p className="text-slate-400 text-sm py-4 italic">
              No revenue recorded yet. Category breakdown will update as customer orders are completed.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {revenueByCategory.map(cat => (
                <HorizontalBar
                  key={cat.category}
                  label={cat.category}
                  value={cat.total_revenue}
                  maxValue={maxRevenue}
                  isCurrency={true}
                  color="bg-[#B8956C]"
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Inventory & Catalog Health ── */}
      <div className="grid md:grid-cols-2 gap-6 mb-10">
        {/* Products by Category */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#3D8361]" />
              <span>Products by Category</span>
            </span>
          }
          subtitle="Current catalog inventory classification"
        >
          {categories.length === 0 ? (
            <p className="text-slate-400 text-sm py-4 italic">No categories recorded in catalog.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {categories.map(cat => {
                const count = cat.product_count || 0;
                return (
                  <HorizontalBar
                    key={cat.category}
                    label={cat.category}
                    value={count}
                    maxValue={totalCount}
                    color="bg-[#2A5F52]"
                  />
                );
              })}
            </div>
          )}
        </Card>

        {/* Low Stock Alerts */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>Inventory Stock Alerts</span>
            </span>
          }
          subtitle="Items requiring immediate fulfillment restocking"
        >
          {lowStock.length === 0 ? (
            <div className="flex items-center gap-2.5 text-[#3D8361] py-4">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span className="text-sm font-semibold">All products are healthy and well stocked</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
              {lowStock.map(item => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-[#F7F8F6] border border-[#231C28]/[0.06] hover:border-[#231C28]/[0.12] transition-colors"
                >
                  <div className="min-w-0 pr-3">
                    <span className="text-sm text-[#1A161F] font-bold truncate block">{item.name}</span>
                    <span className="text-[10px] text-slate-400 uppercase font-mono font-semibold">{item.category}</span>
                  </div>
                  <span
                    className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
                      item.stock_quantity <= 2
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {item.stock_quantity} left
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Admin Order Management & Multi-Field Filters ── */}
      <div className="bg-white rounded-xl border border-[#231C28]/[0.08] shadow-sm p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#231C28]/[0.08] mb-6">
          <div>
            <div className="section-eyebrow mb-1">
              <span>06 / ORDER MANAGEMENT</span>
            </div>
            <h2 className="text-xl font-bold text-[#1A161F]">
              Admin Orders Ledger & Multi-Field Filters
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Securely query orders by created_from, created_to, status, user ID, and order ID with compound index acceleration
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-[#3D8361]/10 text-[#3D8361] border border-[#3D8361]/20 self-start sm:self-auto">
            <span>Server Paginated (Limit: {PAGE_SIZE})</span>
          </span>
        </div>

        {/* Filter Form */}
        <form onSubmit={handleApplyOrderFilters} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 mb-6">
          {/* Status */}
          <div>
            <label className="block text-[10px] uppercase font-mono font-semibold text-slate-500 mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full text-xs font-mono rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-[#3D8361] focus:border-[#3D8361] outline-hidden"
            >
              <option value="">All Statuses</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="FAILED">FAILED</option>
              <option value="PENDING">PENDING</option>
            </select>
          </div>

          {/* User ID */}
          <div>
            <label className="block text-[10px] uppercase font-mono font-semibold text-slate-500 mb-1">User ID</label>
            <input
              type="number"
              placeholder="e.g. 10"
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              className="w-full text-xs font-mono rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-[#3D8361] focus:border-[#3D8361] outline-hidden"
            />
          </div>

          {/* Order ID */}
          <div>
            <label className="block text-[10px] uppercase font-mono font-semibold text-slate-500 mb-1">Order ID</label>
            <input
              type="number"
              placeholder="e.g. 42"
              value={filterOrderId}
              onChange={(e) => setFilterOrderId(e.target.value)}
              className="w-full text-xs font-mono rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-[#3D8361] focus:border-[#3D8361] outline-hidden"
            />
          </div>

          {/* Created From */}
          <div>
            <label className="block text-[10px] uppercase font-mono font-semibold text-slate-500 mb-1">Created From</label>
            <input
              type="date"
              value={filterCreatedFrom}
              onChange={(e) => setFilterCreatedFrom(e.target.value)}
              className="w-full text-xs font-mono rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-[#3D8361] focus:border-[#3D8361] outline-hidden"
            />
          </div>

          {/* Created To */}
          <div>
            <label className="block text-[10px] uppercase font-mono font-semibold text-slate-500 mb-1">Created To</label>
            <input
              type="date"
              value={filterCreatedTo}
              onChange={(e) => setFilterCreatedTo(e.target.value)}
              className="w-full text-xs font-mono rounded-lg border border-slate-300 p-2 focus:ring-1 focus:ring-[#3D8361] focus:border-[#3D8361] outline-hidden"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-5 flex items-center gap-2 pt-2">
            <Button type="submit" size="sm" className="gap-1.5 text-xs">
              <Filter className="w-3.5 h-3.5" />
              <span>Apply Filters</span>
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={handleResetOrderFilters} className="text-xs">
              <span>Reset</span>
            </Button>
          </div>
        </form>

        {/* Orders Table */}
        <div className="overflow-x-auto border border-[#231C28]/[0.08] rounded-xl mb-4">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F7F8F6] font-mono uppercase text-slate-500 border-b border-[#231C28]/[0.08]">
              <tr>
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">User ID</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Total Amount</th>
                <th className="py-3 px-4">Created At</th>
                <th className="py-3 px-4 text-right">Items</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#231C28]/[0.06]">
              {ordersLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-mono">
                    Loading orders ledger...
                  </td>
                </tr>
              ) : adminOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-mono italic">
                    No orders matching the specified filter criteria.
                  </td>
                </tr>
              ) : (
                adminOrders.map((ord) => {
                  const style = STATUS_STYLES[ord.status] || {
                    pill: 'bg-slate-100 text-slate-700 border-slate-200',
                  };
                  const dateStr = ord.created_at
                    ? new Date(ord.created_at).toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—';
                  return (
                    <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-[#1A161F]">#{ord.id}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">User #{ord.user_id}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${style.pill}`}>
                          {ord.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-[#B8956C]">
                        ${Number(ord.total_amount || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">{dateStr}</td>
                      <td className="py-3 px-4 font-mono text-right text-slate-600">
                        {ord.items?.length || 0} line(s)
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between text-xs font-mono text-slate-500">
          <span>Page {orderPage} (showing up to {PAGE_SIZE} orders per page)</span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOrderPage((p) => Math.max(1, p - 1))}
              disabled={orderPage <= 1 || ordersLoading}
              className="gap-1 text-xs font-mono"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOrderPage((p) => p + 1)}
              disabled={adminOrders.length < PAGE_SIZE || ordersLoading}
              className="gap-1 text-xs font-mono"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
