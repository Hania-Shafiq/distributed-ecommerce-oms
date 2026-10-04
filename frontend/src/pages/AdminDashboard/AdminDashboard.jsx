/**
 * pages/AdminDashboard/AdminDashboard.jsx
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Analytics dashboard â€” fetches from Admin Analytics Service (port 8002).
 *
 * Data sources:
 *   Product analytics   â†’ PostgreSQL products_db (total, category summary, low-stock, price-range)
 *   Order analytics     â†’ Elasticsearch "analytics" index (top-selling, revenue by category, order status)
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

import { useEffect, useState } from 'react';
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

// â”€â”€ Status colour mapping â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STATUS_STYLES = {
  CONFIRMED: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'âœ…' },
  PENDING:   { bg: 'bg-amber-100',   text: 'text-amber-700',   icon: 'â³' },
  FAILED:    { bg: 'bg-red-100',     text: 'text-red-600',     icon: 'âŒ' },
};

// â”€â”€ Small reusable components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatTile({ label, value, icon, sub }) {
  return (
    <div className="bg-white rounded-2xl shadow-md p-6 flex items-center gap-4">
      <div className="text-4xl">{icon}</div>
      <div>
        <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">{label}</p>
        <p className="text-3xl font-black text-granite">{value ?? 'â€”'}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function HorizontalBar({ label, value, maxValue, suffix = '', color = 'bg-sea-green' }) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-semibold text-granite w-40 truncate">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div
          className={`${color} h-3 rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm text-gray-500 w-16 text-right font-mono">{suffix}{value.toLocaleString()}</span>
    </div>
  );
}

// â”€â”€ Main dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function AdminDashboard() {
  const [stats, setStats]           = useState({});
  const [orderStats, setOrderStats] = useState({});
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      try {
        // Product-catalogue analytics (always available from products_db)
        const [total, categories, lowStock, priceRange] = await Promise.all([
          getTotalProducts(),
          getCategorySummary(),
          getLowStock(),
          getPriceRange(),
        ]);
        setStats({ total, categories, lowStock, priceRange });

        // Order analytics from Elasticsearch (gracefully empty on fresh installs)
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
        setError(err?.response?.data?.detail || err.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  if (loading) return (
    <div className="flex justify-center items-center py-40">
      <div className="w-12 h-12 border-4 border-ash-grey border-t-sea-green rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="max-w-xl mx-auto text-center py-24">
      <p className="text-red-500 text-lg">{error}</p>
      <p className="text-sm text-gray-400 mt-2">Make sure the Admin Analytics Service is running on port 8002.</p>
    </div>
  );

  const { total, categories = [], lowStock = [], priceRange = {} } = stats;
  const { topProducts = [], revenueByCategory = [], orderStatus = [] } = orderStats;

  const totalCount = categories.reduce((acc, c) => acc + (c.product_count || 0), 0) || 1;
  const maxQty     = topProducts.length  ? Math.max(...topProducts.map(p => p.total_quantity))  : 1;
  const maxRevenue = revenueByCategory.length ? Math.max(...revenueByCategory.map(c => c.total_revenue)) : 1;
  const totalOrders = orderStatus.reduce((s, o) => s + o.count, 0) || 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-extrabold text-granite mb-8">Admin Dashboard</h1>

      {/* â”€â”€ KPI tiles â”€â”€ */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        <StatTile icon="ðŸ“¦" label="Total Products" value={total?.total_products} />
        <StatTile icon="ðŸ’°" label="Avg Price"      value={priceRange?.avg_price ? `$${Number(priceRange.avg_price).toFixed(2)}` : 'â€”'} />
        <StatTile icon="â¬‡ï¸" label="Min Price"      value={priceRange?.min_price ? `$${Number(priceRange.min_price).toFixed(2)}` : 'â€”'} />
        <StatTile icon="â¬†ï¸" label="Max Price"      value={priceRange?.max_price ? `$${Number(priceRange.max_price).toFixed(2)}` : 'â€”'} />
      </div>

      {/* â”€â”€ Order Status breakdown (Elasticsearch) â”€â”€ */}
      {orderStatus.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-granite mb-4">ðŸ“Š Order Status Breakdown</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {orderStatus.map(({ status, count }) => {
              const style = STATUS_STYLES[status] || { bg: 'bg-gray-100', text: 'text-gray-700', icon: 'ðŸ“‹' };
              const pct = totalOrders > 0 ? ((count / totalOrders) * 100).toFixed(1) : 0;
              return (
                <div key={status} className={`${style.bg} rounded-2xl p-5 flex items-center gap-4`}>
                  <span className="text-3xl">{style.icon}</span>
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-wider ${style.text}`}>{status}</p>
                    <p className="text-2xl font-black text-granite">{count.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">{pct}% of total orders</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* â”€â”€ Top-selling products (Elasticsearch) â”€â”€ */}
        <Card title="ðŸ† Top-Selling Products">
          {topProducts.length === 0 ? (
            <p className="text-gray-400 text-sm">
              No order data yet. Run <code className="bg-gray-100 px-1 rounded text-xs">python sync_orders.py</code> to populate.
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

        {/* â”€â”€ Revenue by category (Elasticsearch) â”€â”€ */}
        <Card title="ðŸ’µ Revenue by Category">
          {revenueByCategory.length === 0 ? (
            <p className="text-gray-400 text-sm">
              No revenue data yet. Run <code className="bg-gray-100 px-1 rounded text-xs">python sync_orders.py</code> to populate.
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
                  color="bg-teal-500"
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* â”€â”€ Category breakdown (products_db) â”€â”€ */}
        <Card title="Products by Category">
          {categories.length === 0 ? (
            <p className="text-gray-400 text-sm">No data</p>
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

        {/* â”€â”€ Low stock alert (products_db) â”€â”€ */}
        <Card title="âš ï¸ Low Stock Items">
          {lowStock.length === 0 ? (
            <p className="text-sea-green text-sm font-semibold">âœ“ All items are well stocked</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {lowStock.map(item => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <span className="text-sm text-granite font-medium truncate block">{item.name}</span>
                    <span className="text-xs text-gray-400">{item.category}</span>
                  </div>
                  <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-1 rounded-full whitespace-nowrap">
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

