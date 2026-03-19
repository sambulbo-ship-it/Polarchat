import React, { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();

    if (!username.trim() || !password) return;

    try {
      await login(username.trim(), password);
      navigate('/app');
    } catch {
      // Error is set in the store
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-polar-bg p-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-polar-accent/30 mb-4">
            <Shield size={32} className="text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-polar-text">PolarChat</h1>
          <p className="text-polar-text-muted mt-2">Private & Secure Messaging</p>
        </div>

        {/* Login Form */}
        <div className="polar-card">
          <h2 className="text-xl font-semibold text-polar-text mb-6">Welcome back</h2>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-polar-danger/10 border border-polar-danger/20 text-polar-danger text-sm">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-polar-text-muted mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="polar-input"
                placeholder="Enter your username"
                autoComplete="username"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-polar-text-muted mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="polar-input pr-10"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-polar-text-dim hover:text-polar-text transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !username.trim() || !password}
              className="polar-btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Authenticating...
                </span>
              ) : (
                'Log In'
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-polar-text-muted">
            Don't have an account?{' '}
            <Link to="/register" className="text-blue-400 hover:text-blue-300 font-medium">
              Create one
            </Link>
          </div>
        </div>

        {/* Privacy Notice */}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-polar-text-dim">
          <Lock size={12} />
          <span>Your identity stays anonymous. No email or phone required.</span>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
