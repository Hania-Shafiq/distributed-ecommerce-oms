/**
 * pages/Signup/Signup.jsx
 * Mature registration panel — validation/auth logic unchanged.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Box, Eye, EyeOff, Lock, User, Mail, AlertCircle, ArrowLeft } from 'lucide-react';
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
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
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
          <h1 className="text-2xl font-semibold text-charcoal tracking-tight">Create an account</h1>
          <p className="text-slate-500 text-sm mt-1 font-normal">
            Join for order tracking and personalized recommendations
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200/80 text-rose-800 rounded-lg p-3.5 text-sm mb-5 flex items-center gap-3 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" strokeWidth={1.5} />
            <span className="font-normal">{error}</span>
          </div>
        )}

        <div className="glass-card rounded-lg p-7 sm:p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div>
              <label
                className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-1.5"
                htmlFor="signup-username"
              >
                Username
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <User className="w-4 h-4" strokeWidth={1.5} />
                </span>
                <input
                  id="signup-username"
                  name="username"
                  type="text"
                  required
                  value={form.username}
                  onChange={handleChange}
                  placeholder="Choose a username"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label
                className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-1.5"
                htmlFor="signup-email"
              >
                Email
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <Mail className="w-4 h-4" strokeWidth={1.5} />
                </span>
                <input
                  id="signup-email"
                  name="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label
                className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-1.5"
                htmlFor="signup-password"
              >
                Password
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <Lock className="w-4 h-4" strokeWidth={1.5} />
                </span>
                <input
                  id="signup-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Minimum 6 characters"
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

            <div>
              <label
                className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-1.5"
                htmlFor="signup-confirm"
              >
                Confirm password
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <Lock className="w-4 h-4" strokeWidth={1.5} />
                </span>
                <input
                  id="signup-confirm"
                  name="confirm"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={form.confirm}
                  onChange={handleChange}
                  placeholder="Re-enter your password"
                  className={inputClass}
                />
              </div>
            </div>

            <Button type="submit" fullWidth loading={loading} size="lg" className="py-2.5 mt-2">
              Create account
            </Button>
          </form>

          <p className="text-center text-xs text-slate-500 mt-5 pt-4 border-t border-granite/8 font-normal">
            Already have an account?{' '}
            <Link to="/login" className="text-sea-green font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
