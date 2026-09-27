/**
 * App.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Root application component. Defines the route tree and wraps everything in
 * context providers.
 *
 * PROVIDER ORDER (inner to outer):
 *   CartProvider   — needs to be inside AuthProvider (cart can check auth)
 *   AuthProvider   — top-level, wraps everything
 *   BrowserRouter  — must wrap all <Route> / <Link> usage
 *
 * LAYOUT:
 *   Every page shares <Navbar> (top) and <Footer> (bottom).
 *   Only the <Outlet> (page content) changes on navigation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';

// Pages
import Home           from './pages/Home/Home';
import ProductList    from './pages/ProductList/ProductList';
import ProductDetail  from './pages/ProductDetail/ProductDetail';
import Login          from './pages/Login/Login';
import Signup         from './pages/Signup/Signup';
import Cart           from './pages/Cart/Cart';
import Orders         from './pages/Orders/Orders';
import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
import ProtectedRoute from './components/ProtectedRoute';

/**
 * Shared layout wrapper — Navbar + page content + Footer.
 * <Outlet /> is replaced by the matched child route component.
 */
function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Routes>
            {/* All routes share the Layout (Navbar + Footer) */}
            <Route element={<Layout />}>
              <Route path="/"               element={<Home />} />
              <Route path="/products"       element={<ProductList />} />
              <Route path="/products/:id"   element={<ProductDetail />} />
              <Route path="/cart"           element={<Cart />} />
              <Route path="/orders"         element={<Orders />} />
              
              {/* 
                Protected Admin Route:
                Role-based guard requiring role="admin".
                Unauthorized visitors and customers are redirected to "/".
              */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* Auth pages don't use the Layout (they have their own full-screen design) */}
            <Route path="/login"  element={<Login />} />
            <Route path="/signup" element={<Signup />} />
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
