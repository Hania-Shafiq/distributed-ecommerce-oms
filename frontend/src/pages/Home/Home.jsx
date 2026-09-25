/**
 * pages/Home/Home.jsx
 * Landing page — hero section + quick links to products.
 */
import { Link } from 'react-router-dom';
import Button from '../../components/Button';

export default function Home() {
  return (
    <div>
      {/* ── Hero ── */}
      <section className="bg-gradient-to-br from-shadow-grey via-granite to-sea-green text-white px-6 py-28 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-ash-grey mb-4">Distributed E-Commerce OMS</p>
        <h1 className="text-5xl md:text-6xl font-black mb-6 leading-tight">
          Shop smarter.<br />
          <span className="text-sea-green">Powered by microservices.</span>
        </h1>
        <p className="text-ash-grey text-lg max-w-xl mx-auto mb-10">
          Browse our curated catalog — products indexed by Elasticsearch for instant, typo-tolerant search.
        </p>
        <Link to="/products">
          <Button size="lg" className="text-lg px-10">
            Browse Products →
          </Button>
        </Link>
      </section>

      {/* ── Feature tiles ── */}
      <section className="max-w-5xl mx-auto px-6 py-20 grid sm:grid-cols-3 gap-8 text-center">
        {[
          { icon: '⚡', title: 'Fast Search', desc: 'Elasticsearch-powered full-text search with typo tolerance.' },
          { icon: '🔒', title: 'Secure Auth', desc: 'JWT-based user authentication via a dedicated User Service.' },
          { icon: '📦', title: 'Live Stock', desc: 'Real-time stock levels synced with PostgreSQL.' },
        ].map(f => (
          <div key={f.title} className="bg-white rounded-2xl shadow-md p-8 hover:shadow-xl transition-shadow">
            <div className="text-5xl mb-4">{f.icon}</div>
            <h3 className="text-lg font-bold text-granite mb-2">{f.title}</h3>
            <p className="text-gray-500 text-sm">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
