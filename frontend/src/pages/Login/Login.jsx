/**
 * pages/Login/Login.jsx
 * Mature auth panel — form/auth logic unchanged.
 */

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Box, Eye, EyeOff, Lock, User, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
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
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
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

  const inputClass =
    'w-full pl-10 pr-4 py-2.5 bg-white border border-granite/12 rounded-md text-charcoal placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sea-green/20 focus:border-sea-green ui-transition text-sm font-normal';

  return (
    <div className="min-h-screen bg-canvas flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
      <div className="absolute inset-0 surface-plum opacity-[0.03] pointer-events-none" />

      <div className="absolute top-6 left-6 z-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-charcoal bg-white border border-granite/10 px-3 py-1.5 rounded-md ui-transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span>Back to store</span>
        </Link>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative">
        <div className="flex flex-col items-center text-center mb-8">
          <div
            className="w-10 h-10 rounded-md flex items-center justify-center text-white mb-4"
            style={{
              background: 'linear-gradient(165deg, #4a9270 0%, #3D8361 55%, #2A5F52 100%)',
            }}
          >
            <Box className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-semibold text-charcoal tracking-tight">Welcome back</h1>
          <p className="text-slate-500 text-sm mt-1 font-normal">
            Sign in to access orders and your account
          </p>
        </div>

        {successMessage && (
          <div className="bg-sage-mist border border-granite/15 text-granite rounded-lg p-3.5 text-sm mb-5 flex items-center gap-3 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-teal-deep shrink-0" strokeWidth={1.5} />
            <span className="font-normal">{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200/80 text-rose-800 rounded-lg p-3.5 text-sm mb-5 flex items-center gap-3 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" strokeWidth={1.5} />
            <span className="font-normal">{error}</span>
          </div>
        )}

        <div className="glass-card rounded-lg p-7 sm:p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label
                className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-1.5"
                htmlFor="login-username"
              >
                Username
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <User className="w-4 h-4" strokeWidth={1.5} />
                </span>
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  required
                  value={form.username}
                  onChange={handleChange}
                  placeholder="Enter your username"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label
                className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-1.5"
                htmlFor="login-password"
              >
                Password
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <Lock className="w-4 h-4" strokeWidth={1.5} />
                </span>
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-charcoal ui-transition p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" strokeWidth={1.5} />
                  ) : (
                    <Eye className="w-4 h-4" strokeWidth={1.5} />
                  )}
                </button>
              </div>
            </div>

            <Button type="submit" fullWidth loading={loading} size="lg" className="py-2.5 mt-1">
              Sign in
            </Button>
          </form>

          <p className="text-center text-xs text-slate-500 mt-5 pt-4 border-t border-granite/8 font-normal">
            Don&apos;t have an account?{' '}
            <Link to="/signup" className="text-sea-green font-medium hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
