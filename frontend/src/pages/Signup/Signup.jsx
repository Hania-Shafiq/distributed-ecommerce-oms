/**
 * pages/Signup/Signup.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * User registration page with client validation, password toggle,
 * friendly error masking, and smooth transition to login.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, Eye, EyeOff, Lock, User, Mail, AlertCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/Button';
import { formatError } from '../../utils/formatError';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirm) {
      setError('Passwords do not match. Please verify both fields.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must contain at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      await signup({ username: form.username, email: form.email, password: form.password });
      navigate('/login', { state: { message: 'Account created successfully! Please sign in.' } });
    } catch (err) {
      setError(
        formatError(
          err,
          'Unable to complete registration. This username or email address may already be in use.'
        )
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
      {/* Back to store link */}
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
            Create an account
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Join OMSStore for instant order tracking and personalized recommendations
          </p>
        </div>

        {/* Error message banner */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm mb-6 flex items-center gap-3 animate-fade-in shadow-2xs">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Signup form card */}
        <div className="bg-white rounded-3xl border border-gray-200/80 shadow-xs p-8 sm:p-10">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider text-granite mb-1.5"
                htmlFor="signup-username"
              >
                Username
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <User className="w-4 h-4" />
                </span>
                <input
                  id="signup-username"
                  name="username"
                  type="text"
                  required
                  value={form.username}
                  onChange={handleChange}
                  placeholder="Choose a username"
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-granite placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sea-green/20 focus:border-sea-green transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider text-granite mb-1.5"
                htmlFor="signup-email"
              >
                Email Address
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  id="signup-email"
                  name="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-granite placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sea-green/20 focus:border-sea-green transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider text-granite mb-1.5"
                htmlFor="signup-password"
              >
                Password
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  id="signup-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Minimum 6 characters"
                  className="w-full pl-10 pr-11 py-2.5 bg-white border border-gray-200 rounded-xl text-granite placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sea-green/20 focus:border-sea-green transition-all text-sm"
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

            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider text-granite mb-1.5"
                htmlFor="signup-confirm"
              >
                Confirm Password
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  id="signup-confirm"
                  name="confirm"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={form.confirm}
                  onChange={handleChange}
                  placeholder="Re-enter your password"
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-granite placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sea-green/20 focus:border-sea-green transition-all text-sm"
                />
              </div>
            </div>

            <Button
              type="submit"
              fullWidth
              loading={loading}
              size="lg"
              className="py-3 mt-3"
            >
              Create Account
            </Button>
          </form>

          <p className="text-center text-xs text-gray-500 mt-6 pt-5 border-t border-gray-100">
            Already have an account?{' '}
            <Link to="/login" className="text-sea-green font-bold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
