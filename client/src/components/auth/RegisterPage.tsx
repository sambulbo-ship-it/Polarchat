import React, { useState, FormEvent, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Lock, Eye, EyeOff, AlertCircle, Key, Download, CheckCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { EncryptedKeyBackup } from '../../crypto';

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Weak', color: 'bg-red-500' };
  if (score <= 2) return { score, label: 'Fair', color: 'bg-yellow-500' };
  if (score <= 3) return { score, label: 'Good', color: 'bg-blue-500' };
  return { score, label: 'Strong', color: 'bg-emerald-500' };
}

export function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [keyBackup, setKeyBackup] = useState<EncryptedKeyBackup | null>(null);
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const { register, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);
  const passwordsMatch = password === confirmPassword;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();

    if (!username.trim() || !password || !passwordsMatch) return;
    if (password.length < 8) return;

    try {
      const result = await register(username.trim(), password);
      setKeyBackup(result.backupKeys);
    } catch {
      // Error is set in the store
    }
  };

  const downloadBackup = () => {
    if (!keyBackup) return;

    const blob = new Blob([JSON.stringify(keyBackup, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `polarchat-keys-backup-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBackupDownloaded(true);
  };

  const continueToApp = () => {
    navigate('/app');
  };

  // Key backup screen (shown after successful registration)
  if (keyBackup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-polar-bg p-4">
        <div className="w-full max-w-md">
          <div className="polar-card">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Key size={20} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-polar-text">Save Your Keys</h2>
                <p className="text-sm text-polar-text-muted">This is critical for account recovery</p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm mb-6">
              <p className="font-medium mb-1">Important:</p>
              <p>
                Your encryption keys are generated on this device only. If you lose access, you will
                need this backup to decrypt your messages. We cannot recover your keys.
              </p>
            </div>

            <button
              onClick={downloadBackup}
              className="polar-btn-primary w-full flex items-center justify-center gap-2 mb-4"
            >
              <Download size={18} />
              Download Encrypted Key Backup
            </button>

            {backupDownloaded && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mb-4">
                <CheckCircle size={16} />
                <span>Backup downloaded. Store it somewhere safe.</span>
              </div>
            )}

            <button
              onClick={continueToApp}
              className={`w-full polar-btn ${
                backupDownloaded
                  ? 'polar-btn-primary'
                  : 'polar-btn-secondary'
              }`}
            >
              {backupDownloaded ? 'Continue to PolarChat' : 'Skip for now (not recommended)'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-polar-bg p-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-polar-accent/30 mb-4">
            <Shield size={32} className="text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-polar-text">Join PolarChat</h1>
          <p className="text-polar-text-muted mt-2">No personal information required</p>
        </div>

        {/* Register Form */}
        <div className="polar-card">
          <h2 className="text-xl font-semibold text-polar-text mb-2">Create your account</h2>
          <p className="text-sm text-polar-text-dim mb-6">
            Just pick a username and password. That's it.
          </p>

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
                placeholder="Choose a username"
                autoComplete="username"
                autoFocus
                required
                minLength={3}
                maxLength={32}
              />
              <p className="text-xs text-polar-text-dim mt-1">3-32 characters. This is your only identifier.</p>
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
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-polar-text-dim hover:text-polar-text transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Password Strength Bar */}
              {password.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <div
                        key={level}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                          level <= passwordStrength.score
                            ? passwordStrength.color
                            : 'bg-polar-border'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-polar-text-dim">
                    Password strength: <span className="font-medium">{passwordStrength.label}</span>
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-polar-text-muted mb-1.5">
                Confirm Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`polar-input ${
                  confirmPassword && !passwordsMatch
                    ? 'border-polar-danger focus:border-polar-danger focus:ring-polar-danger'
                    : ''
                }`}
                placeholder="Confirm your password"
                autoComplete="new-password"
                required
              />
              {confirmPassword && !passwordsMatch && (
                <p className="text-xs text-polar-danger mt-1">Passwords do not match</p>
              )}
            </div>

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="privacy-consent"
                checked={agreedToPrivacy}
                onChange={(e) => setAgreedToPrivacy(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-polar-border bg-polar-bg text-blue-500 focus:ring-blue-500"
              />
              <label htmlFor="privacy-consent" className="text-sm text-polar-text-muted">
                I have read and agree to the{' '}
                <Link to="/privacy" className="text-blue-400 hover:text-blue-300 font-medium">
                  Privacy Policy
                </Link>
              </label>
            </div>

            <button
              type="submit"
              disabled={
                isLoading ||
                !username.trim() ||
                !password ||
                !passwordsMatch ||
                password.length < 8 ||
                !agreedToPrivacy
              }
              className="polar-btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating keys & registering...
                </span>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-polar-text-muted">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-400 hover:text-blue-300 font-medium">
              Log in
            </Link>
          </div>
        </div>

        {/* Privacy Notice */}
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-center gap-2 text-xs text-polar-text-dim">
            <Lock size={12} />
            <span>Encryption keys are generated on your device only</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-polar-text-dim">
            <Shield size={12} />
            <span>No email, no phone, no tracking. Ever.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
