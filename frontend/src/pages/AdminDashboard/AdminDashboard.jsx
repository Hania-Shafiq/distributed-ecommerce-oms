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

// ── Status styling & icons ───────────────────────────────────────────────────
const STATUS_STYLES = {
  CONFIRMED: {
    bg: 'bg-emerald-50/80 text-emerald-800 border-emerald-200',
    icon: CheckCircle2,
    iconColor: 'text-emerald-600',
    pill: 'bg-emerald-100/70 text-emerald-700',
  },
  PENDING: {
    bg: 'bg-amber-50/80 text-amber-800 border-amber-200',
    icon: Clock,
    iconColor: 'text-amber-600',
    pill: 'bg-amber-100/70 text-amber-700',
  },
  FAILED: {
    bg: 'bg-rose-50/80 text-rose-800 border-rose-200',
    icon: XCircle,
    iconColor: 'text-rose-600',
    pill: 'bg-rose-100/70 text-rose-700',
  },
};

// ── Reusable Stat Tile ───────────────────────────────────────────────────────
function StatTile({ label, value, icon, sub, colorClass = 'bg-sage-mist text-granite' }) {
  return (
    <div className="panel-quiet p-5 flex items-center gap-4 ui-transition hover:border-granite/15">
      <div className={`w-11 h-11 rounded-md flex items-center justify-center flex-shrink-0 ${colorClass}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-slate-400 uppercase font-medium tracking-wider truncate">{label}</p>
        <p className="text-xl sm:text-2xl font-semibold text-charcoal tracking-tight mt-0.5">{value ?? '—'}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5 truncate font-normal">{sub}</p>}
      </div>
    </div>
  );
}

// ── Reusable Horizontal Bar Chart ───────────────────────────────────────────
function HorizontalBar({ label, value, maxValue, suffix = '', color = 'bg-sea-green' }) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-xs sm:text-sm font-semibold text-granite w-36 sm:w-44 truncate">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div
          className={`${color} h-2.5 rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs sm:text-sm text-gray-600 w-20 text-right font-mono font-medium">
        {suffix}{typeof value === 'number' ? value.toLocaleString() : value}
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="h-8 bg-gray-200 rounded-lg w-52 mb-8 animate-pulse" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="bg-white rounded-lg border border-gray-200/80 p-6 h-28 animate-pulse" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-gray-200/80 p-6 h-72 animate-pulse" />
          <div className="bg-white rounded-lg border border-gray-200/80 p-6 h-72 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto text-center py-24 px-4">
        <div className="w-16 h-16 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-granite mb-2">Analytics Notice</h2>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">{error}</p>
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* ── Dashboard Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-4 border-b border-gray-200/60">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-semibold text-charcoal tracking-tight">Admin dashboard</h1>
            <span className="badge-role inline-flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" strokeWidth={1.5} />
              <span>Admin</span>
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-0.5 font-normal">
            Performance, inventory health, and fulfillment analytics
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <Link
            to="/admin/graph"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border border-granite/15 bg-white text-charcoal hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <Share2 className="w-3.5 h-3.5 text-sea-green" />
            <span>Co-Purchase Graph</span>
          </Link>
          <Button variant="secondary" size="sm" onClick={fetchAll} className="gap-2">
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Refresh Data</span>
          </Button>
        </div>
      </div>

      {/* ── KPI Tiles ── */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatTile
          icon={<Package className="w-5 h-5" strokeWidth={1.5} />}
          label="Total Products"
          value={total?.total_products}
          sub="Catalog inventory"
          colorClass="bg-sage-mist text-granite"
        />
        <StatTile
          icon={<DollarSign className="w-5 h-5" strokeWidth={1.5} />}
          label="Avg Price"
          value={priceRange?.avg_price ? `$${Number(priceRange.avg_price).toFixed(2)}` : '—'}
          sub="Across active items"
          colorClass="bg-sage-mist text-gilt"
        />
        <StatTile
          icon={<TrendingDown className="w-5 h-5" strokeWidth={1.5} />}
          label="Lowest Price"
          value={priceRange?.min_price ? `$${Number(priceRange.min_price).toFixed(2)}` : '—'}
          sub="Minimum item entry"
          colorClass="bg-sage-mist text-granite"
        />
        <StatTile
          icon={<TrendingUp className="w-5 h-5" strokeWidth={1.5} />}
          label="Highest Price"
          value={priceRange?.max_price ? `$${Number(priceRange.max_price).toFixed(2)}` : '—'}
          sub="Premium catalog peak"
          colorClass="bg-sage-mist text-teal-deep"
        />
      </div>

      {/* ── Order Status Breakdown ── */}
      {orderStatus.length > 0 && (
        <div className="mb-8">
          <h2 className="text-base font-bold text-granite mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-sea-green" />
            <span>Order Fulfillment Status</span>
          </h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {orderStatus.map(({ status, count }) => {
              const style = STATUS_STYLES[status] || {
                bg: 'bg-gray-50 text-gray-800 border-gray-200',
                icon: ClipboardList,
                iconColor: 'text-gray-600',
                pill: 'bg-gray-100 text-gray-700',
              };
              const StatusIcon = style.icon;
              const pct = totalOrders > 0 ? ((count / totalOrders) * 100).toFixed(1) : 0;
              return (
                <div key={status} className={`${style.bg} border rounded-lg p-5 flex items-center gap-4 shadow-2xs`}>
                  <div className="w-12 h-12 rounded-lg bg-white shadow-xs flex items-center justify-center flex-shrink-0">
                    <StatusIcon className={`w-6 h-6 ${style.iconColor}`} />
                  </div>
                  <div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${style.pill}`}>
                      {status}
                    </span>
                    <p className="text-2xl font-semibold text-granite mt-1">{count.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">{pct}% of total orders</p>
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
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>Top-Selling Products</span>
            </span>
          }
          subtitle="Highest units ordered by customers"
        >
          {topProducts.length === 0 ? (
            <p className="text-gray-400 text-sm py-4">
              No orders recorded yet. Top-selling items will appear here once customer purchases are placed.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {topProducts.map(p => (
                <HorizontalBar
                  key={p.product_id}
                  label={p.product_name}
                  value={p.total_quantity}
                  maxValue={maxQty}
                  color="bg-indigo-500"
                />
              ))}
            </div>
          )}
        </Card>

        {/* Revenue by Category */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-emerald-600" />
              <span>Revenue by Category</span>
            </span>
          }
          subtitle="Cumulative sales distribution"
        >
          {revenueByCategory.length === 0 ? (
            <p className="text-gray-400 text-sm py-4">
              No revenue recorded yet. Category breakdown will update as customer orders are completed.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {revenueByCategory.map(cat => (
                <HorizontalBar
                  key={cat.category}
                  label={cat.category}
                  value={cat.total_revenue}
                  maxValue={maxRevenue}
                  suffix="$"
                  color="bg-emerald-500"
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
              <Layers className="w-4 h-4 text-sea-green" />
              <span>Products by Category</span>
            </span>
          }
          subtitle="Current catalog classification"
        >
          {categories.length === 0 ? (
            <p className="text-gray-400 text-sm py-4">No categories recorded in catalog.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {categories.map(cat => {
                const count = cat.product_count || 0;
                return (
                  <HorizontalBar
                    key={cat.category}
                    label={cat.category}
                    value={count}
                    maxValue={totalCount}
                    color="bg-sea-green"
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
          subtitle="Items with critical stock levels"
        >
          {lowStock.length === 0 ? (
            <div className="flex items-center gap-2 text-sea-green py-4">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span className="text-sm font-semibold">All products are healthy and well stocked</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
              {lowStock.map(item => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2.5 px-3 rounded-md bg-gray-50/70 border border-gray-100"
                >
                  <div className="min-w-0 pr-3">
                    <span className="text-sm text-granite font-bold truncate block">{item.name}</span>
                    <span className="text-[11px] text-gray-400 uppercase font-semibold">{item.category}</span>
                  </div>
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
                      item.stock_quantity <= 2
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-amber-100 text-amber-800'
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
