/**
 * pages/AdminDashboard/AdminDashboard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Analytics dashboard — fetches from Admin Analytics Service (port 8002).
 * All API calls go through analyticsApi.js.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import {
  getTotalProducts,
  getCategorySummary,
  getLowStock,
  getPriceRange,
} from '../../api/analyticsApi';
import Card from '../../components/Card';

function StatTile({ label, value, icon, sub }) {
  return (
    <div className="bg-white rounded-2xl shadow-md p-6 flex items-center gap-4">
      <div className="text-4xl">{icon}</div>
      <div>
        <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">{label}</p>
        <p className="text-3xl font-black text-granite">{value ?? '—'}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      try {
        const [total, categories, lowStock, priceRange] = await Promise.all([
          getTotalProducts(),
          getCategorySummary(),
          getLowStock(),
          getPriceRange(),
        ]);
        setStats({ total, categories, lowStock, priceRange });
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
  const totalCount =
    total?.total_products ||
    total?.total ||
    categories.reduce((acc, c) => acc + (c.product_count || c.count || 0), 0) ||
    1;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-extrabold text-granite mb-8">Admin Dashboard</h1>

      {/* ── KPI tiles ── */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        <StatTile icon="📦" label="Total Products" value={total?.total_products ?? total?.total} />
        <StatTile icon="💰" label="Avg Price" value={priceRange?.avg_price ? `$${Number(priceRange.avg_price).toFixed(2)}` : '—'} />
        <StatTile icon="⬇️" label="Min Price" value={priceRange?.min_price ? `$${Number(priceRange.min_price).toFixed(2)}` : '—'} />
        <StatTile icon="⬆️" label="Max Price" value={priceRange?.max_price ? `$${Number(priceRange.max_price).toFixed(2)}` : '—'} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* ── Category breakdown ── */}
        <Card title="Products by Category">
          {categories.length === 0 ? (
            <p className="text-gray-400 text-sm">No data</p>
          ) : (
            <div className="flex flex-col gap-3">
              {categories.map(cat => {
                const count = cat.product_count ?? cat.count ?? 0;
                const widthPercent = Math.min((count / totalCount) * 100, 100);

                return (
                  <div key={cat.category} className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-granite w-36 truncate">{cat.category}</span>
                    <div className="flex-1 bg-ash-grey/30 rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-sea-green h-3 rounded-full transition-all"
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-500 w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ── Low stock alert ── */}
        <Card title="⚠️ Low Stock Items">
          {lowStock.length === 0 ? (
            <p className="text-sea-green text-sm font-semibold">✓ All items are well stocked</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {lowStock.map(item => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-granite font-medium truncate">{item.name}</span>
                  <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-1 rounded-full">
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
