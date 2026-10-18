/**
 * pages/AdminDashboard/AdminDashboard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Analytics & Store Administration Dashboard.
 * Data sources:
 *   Product analytics → Catalog summary, low-stock alerts, price metrics
 *   Order analytics   → Top-selling products, category revenue, order status
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import {
  getTotalProducts,
  getCategorySummary,
  getLowStock,
  getPriceRange,
  getTopSellingProducts,
  getRevenueByCategory,
  getOrderStatus,
} from '../../api/analyticsApi';
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
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

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

      // Order analytics
      const [topProducts, revenueByCategory, orderStatus] = await Promise.allSettled([
        getTopSellingProducts(8),
        getRevenueByCategory(),
        getOrderStatus(),
      ]);
      setOrderStats({
        topProducts:       topProducts.status       === 'fulfilled' ? topProducts.value       : [],
        revenueByCategory: revenueByCategory.status === 'fulfilled' ? revenueByCategory.value : [],
        orderStatus:       orderStatus.status       === 'fulfilled' ? orderStatus.value       : [],
      });
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

  useEffect(() => {
    fetchAll();
  }, []);

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
  const totalOrders = orderStatus.reduce((s, o) => s + o.count, 0) || 0;

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
          <p className="text-slate-500 text-xs font-mono mt-1">
            Real-time performance telemetry, inventory health, and fulfillment pipeline
          </p>
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
            <span>Refresh Data</span>
          </Button>
        </div>
      </div>

      {/* ── KPI Tiles ── */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatTile
          icon={<Package className="w-5 h-5" strokeWidth={1.75} />}
          label="Total Products"
          value={total?.total_products}
          sub="Catalog inventory"
          colorClass="bg-[#3D8361]/10 text-[#3D8361]"
        />
        <StatTile
          icon={<DollarSign className="w-5 h-5" strokeWidth={1.75} />}
          label="Avg Price"
          value={priceRange?.avg_price}
          isCurrency={true}
          sub="Across active items"
          colorClass="bg-[#B8956C]/10 text-[#B8956C]"
        />
        <StatTile
          icon={<TrendingDown className="w-5 h-5" strokeWidth={1.75} />}
          label="Lowest Price"
          value={priceRange?.min_price}
          isCurrency={true}
          sub="Minimum item entry"
          colorClass="bg-slate-100 text-slate-700"
        />
        <StatTile
          icon={<TrendingUp className="w-5 h-5" strokeWidth={1.75} />}
          label="Highest Price"
          value={priceRange?.max_price}
          isCurrency={true}
          sub="Premium catalog peak"
          colorClass="bg-[#2A5F52]/10 text-[#2A5F52]"
        />
      </div>

      {/* ── Order Status Breakdown ── */}
      {orderStatus.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-[#1A161F] flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#3D8361]" />
              <span>Order Fulfillment Status</span>
            </h2>
            <span className="text-xs font-mono text-slate-500">
              {totalOrders.toLocaleString()} total orders recorded
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
              const pct = totalOrders > 0 ? ((count / totalOrders) * 100).toFixed(1) : 0;
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

      {/* ── Order Sales Analytics ── */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
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
              No orders recorded yet. Top-selling items will appear here once customer purchases are placed.
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
      <div className="grid md:grid-cols-2 gap-6">
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
    </div>
  );
}
