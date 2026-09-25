/**
 * pages/Orders/Orders.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Orders history page.
 * Order Service routes are not yet finalised — this shows a clear placeholder
 * so the route renders something instead of a blank white page.
 * Once orderApi.getMyOrders() is wired to a real endpoint, replace the
 * stub content below with a real order list.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Link } from 'react-router-dom';
import Button from '../../components/Button';

export default function Orders() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-20 text-center">
      <div className="text-7xl mb-6">📋</div>
      <h1 className="text-3xl font-extrabold text-granite mb-3">My Orders</h1>
      <p className="text-gray-500 mb-2 max-w-md mx-auto">
        Order history will appear here once the Order Service integration is complete.
      </p>
      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 inline-block mb-8">
        ⚠️ Order Service routes not yet finalised — check back soon.
      </p>
      <div>
        <Link to="/products">
          <Button size="lg">Browse Products</Button>
        </Link>
      </div>
    </div>
  );
}
