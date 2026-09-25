/**
 * pages/Signup/Signup.jsx
 * Wired to POST /signup on the User Service via userApi.js → AuthContext.signup().
 * On success: redirects to /login with a success message.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/Button';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [form, setForm]     = useState({ username: '', email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      await signup({ username: form.username, email: form.email, password: form.password });
      navigate('/login', { state: { message: 'Account created! Please log in.' } });
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'Registration failed. Username or email may already be taken.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-ash-grey/20 to-dry-sage/20 flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">✨</div>
          <h1 className="text-2xl font-extrabold text-granite">Create account</h1>
          <p className="text-gray-500 text-sm mt-1">Join the OMS platform</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {[
            { id: 'signup-username', name: 'username', label: 'Username', type: 'text',     placeholder: 'your_username' },
            { id: 'signup-email',    name: 'email',    label: 'Email',    type: 'email',    placeholder: 'you@example.com' },
            { id: 'signup-password', name: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
            { id: 'signup-confirm',  name: 'confirm',  label: 'Confirm password', type: 'password', placeholder: '••••••••' },
          ].map(field => (
            <div key={field.name}>
              <label className="block text-sm font-semibold text-granite mb-1.5" htmlFor={field.id}>
                {field.label}
              </label>
              <input
                id={field.id}
                name={field.name}
                type={field.type}
                required
                value={form[field.name]}
                onChange={handleChange}
                placeholder={field.placeholder}
                className="w-full border-2 border-ash-grey rounded-xl px-4 py-3 text-granite placeholder-gray-400 focus:outline-none focus:border-sea-green transition-colors"
              />
            </div>
          ))}

          <Button type="submit" fullWidth loading={loading} size="lg">
            Create Account
          </Button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-sea-green font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
