// Signing in, creating an account, and a forgotten password (asking for the
// email, then choosing a new password from the emailed link). On its own page
// (#/signin); once signed in, the Account dialog takes over.

import { useState, type FormEvent } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './icons';
import { cloud, clearAuthUrl, resetRedirectUrl } from '../lib/cloud';

export type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset';

export const AUTH_TITLES: Record<AuthMode, string> = {
  signin: 'Sign in',
  signup: 'Create account',
  forgot: 'Reset password',
  reset: 'Choose a new password',
};

export default function AuthForm({
  initialMode = 'signin',
  resetToken,
  onCancel,
  onModeChange,
}: {
  initialMode?: AuthMode;
  /** From an emailed reset link: the form asks for a new password. */
  resetToken: string | null;
  onCancel?: () => void;
  onModeChange?: (mode: AuthMode) => void;
}) {
  const notify = useStore((s) => s.notify);
  const backend = cloud.backend;
  const [mode, setModeState] = useState<AuthMode>(resetToken ? 'reset' : initialMode);
  const setMode = (m: AuthMode) => {
    setModeState(m);
    setError(null);
    onModeChange?.(m);
  };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (!backend) return null;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Something went wrong');
      else done?.();
    } catch (e) {
      setError((e as Error).message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'signin') void run(() => backend.signIn(email.trim(), password));
    else if (mode === 'signup')
      void run(() => backend.signUp(email.trim(), password, name.trim() || email.split('@')[0]));
    else if (mode === 'forgot')
      void run(
        () => backend.requestPasswordReset(email.trim(), resetRedirectUrl()),
        () => setSent(true),
      );
    else if (mode === 'reset' && resetToken)
      void run(
        () => backend.resetPassword(resetToken, password),
        () => {
          clearAuthUrl();
          notify('Password changed — sign in with your new password');
          setPassword('');
          setMode('signin');
        },
      );
  };

  return (
  <form className="acct" onSubmit={submit}>
    {mode === 'signin' && (
      <p className="hint">
        Sign in to keep your designs and palettes in your account and use them on every device.
        Without an account everything stays on this device.
      </p>
    )}
    {mode === 'forgot' && sent ? (
      <p className="hint">
        If an account exists for <b>{email}</b>, a reset link is on its way. The link works for
        15 minutes.
      </p>
    ) : (
      <>
        {mode === 'signup' && (
          <div className="field">
            <label>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
        )}
        {mode !== 'reset' && (
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              required
            />
          </div>
        )}
        {mode !== 'forgot' && (
          <div className="field">
            <label>{mode === 'reset' ? 'New password' : 'Password'}</label>
            <div className="pw-field">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                minLength={mode === 'signin' ? undefined : 8}
                required
              />
              {/* see what was typed, or what the browser filled in */}
              <button
                type="button"
                className="pw-eye"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} />
              </button>
            </div>
            {mode !== 'signin' && <span className="hint">At least 8 characters</span>}
          </div>
        )}
        {error && (
          <p className="acct-error" role="alert">
            {error}
          </p>
        )}
      </>
    )}
    <div className="auth-actions">
      {!(mode === 'forgot' && sent) && (
        <button type="submit" className="btn primary" disabled={busy}>
          {mode === 'signin'
            ? 'Sign in'
            : mode === 'signup'
              ? 'Create account'
              : mode === 'forgot'
                ? 'Send reset link'
                : 'Change password'}
        </button>
      )}
      <div className="auth-links">
        {mode === 'signin' && (
          <>
            <button type="button" className="btn ghost" onClick={() => setMode('signup')}>
              Create account
            </button>
            <button type="button" className="btn ghost" onClick={() => setMode('forgot')}>
              Forgot password?
            </button>
          </>
        )}
        {(mode === 'signup' || mode === 'forgot' || mode === 'reset') && (
          <button type="button" className="btn ghost" onClick={() => setMode('signin')}>
            Back to sign in
          </button>
        )}
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  </form>
  );
}
