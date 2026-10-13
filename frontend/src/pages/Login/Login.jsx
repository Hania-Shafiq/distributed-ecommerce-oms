/**
 * pages/Login/Login.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * User sign in page with form validation, friendly error handling,
 * password toggle, and redirect to destination.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingBag, Eye, EyeOff, Lock, User, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/Button';
import { formatError } from '../../utils/formatError';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/products';
  const successMessage = location.state?.message || null;

  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(form);
      navigate(from, { replace: true });
    } catch (err) {
      setError(
        formatError(err, 'Unable to sign in. Please verify your username and password.')
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
      {/* Back to store navigation */}
      <div className="absolute top-6 left-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-granite bg-white border border-gray-200 px-3.5 py-2 rounded-xl shadow-2xs transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Store</span>
        </Link>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-sea-green flex items-center justify-center text-white shadow-sm mb-4">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-granite tracking-tight">
            Welcome back
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Sign in to access your orders and account
          </p>
        </div>

        {/* Success message banner (e.g. from signup) */}
        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl p-4 text-sm mb-6 flex items-center gap-3 animate-fade-in shadow-2xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error message banner */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm mb-6 flex items-center gap-3 animate-fade-in shadow-2xs">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login form card */}
        <div className="bg-white rounded-3xl border border-gray-200/80 shadow-xs p-8 sm:p-10">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider text-granite mb-1.5"
                htmlFor="login-username"
              >
                Username
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <User className="w-4 h-4" />
                </span>
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  required
                  value={form.username}
                  onChange={handleChange}
                  placeholder="Enter your username"
                  className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-granite placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sea-green/20 focus:border-sea-green transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider text-granite mb-1.5"
                htmlFor="login-password"
              >
                Password
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-11 py-3 bg-white border border-gray-200 rounded-xl text-granite placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sea-green/20 focus:border-sea-green transition-all text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-granite transition-colors p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              fullWidth
              loading={loading}
              size="lg"
              className="py-3 mt-2"
            >
              Sign In
            </Button>
          </form>

          <p className="text-center text-xs text-gray-500 mt-6 pt-5 border-t border-gray-100">
            Don't have an account yet?{' '}
            <Link to="/signup" className="text-sea-green font-bold hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
