// Accounts: sign in, sign up, forgot / reset password, and — once signed in —
// the sync status, username and friends, sign out.

import { useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../store/useStore';
import Modal from './Modal';
import Friends from './Friends';
import { Icon } from './icons';
import { cloud, clearAuthUrl, resetRedirectUrl } from '../lib/cloud';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset' | 'account';

export default function AccountDialog({
  onClose,
  resetToken,
  onSettings,
}: {
  onClose: () => void;
  resetToken: string | null;
  onSettings?: () => void;
}) {
  const user = useStore((s) => s.cloudUser);
  const info = useStore((s) => s.cloudInfo);
  const notify = useStore((s) => s.notify);
  const backend = cloud.backend;
  const engine = cloud.engine;

  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : user ? 'account' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  // arriving signed in (or a sign-in landing): show the account
  useEffect(() => {
    if (!user || mode === 'reset') return;
    setMode('account');
  }, [user, mode]);

  if (!backend || !engine) return null;

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

  const title =
    mode === 'account'
      ? 'Account'
      : mode === 'signup'
        ? 'Create account'
        : mode === 'forgot'
          ? 'Reset password'
          : mode === 'reset'
            ? 'Choose a new password'
            : 'Sign in';

  const statusLine =
    info.status === 'syncing'
      ? 'Syncing…'
      : info.status === 'offline'
        ? `Offline — ${info.pending} change${info.pending === 1 ? '' : 's'} will sync when you're back online`
        : info.status === 'error'
          ? `Sync problem: ${info.error ?? 'request failed'}`
          : info.pending
            ? `${info.pending} change${info.pending === 1 ? '' : 's'} waiting to sync`
            : `Everything is synced${info.lastSync ? ` · ${new Date(info.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`;

  return (
    <Modal title={title} onClose={onClose}>
      {mode === 'account' && user ? (
        <div className="acct">
          <p className="acct-who">
            <Icon name="user" size={18} /> <b>{user.email}</b>
          </p>
          <p className={'acct-status ' + info.status} role="status">
            <Icon name={info.status === 'offline' || info.status === 'error' ? 'cloud-off' : 'cloud'} size={16} />{' '}
            {statusLine}
          </p>
          <p className="hint">
            Designs and palettes in <b>Cloud Storage</b> are kept in your account and appear on every
            device you sign in on; saving still works offline and syncs when you're back. Those in{' '}
            <b>Local Storage</b> stay on this device. Move a file between them in Open or the Palette
            Library.
          </p>
          <Friends />
          <div className="actions spread">
            <button className="btn" onClick={() => void engine.flush()} disabled={info.status === 'syncing'}>
              Sync now
            </button>
            {onSettings && (
              <button className="btn ghost" onClick={onSettings}>
                Notifications…
              </button>
            )}
            <span className="grow" />
            <button
              className="btn"
              onClick={() => {
                void backend.signOut();
                onClose();
              }}
            >
              Sign out
            </button>
            <button className="btn primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
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
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    minLength={mode === 'signin' ? undefined : 8}
                    required
                  />
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
          <div className="actions spread">
            {mode === 'signin' && (
              <>
                <button type="button" className="btn ghost" onClick={() => setMode('forgot')}>
                  Forgot password?
                </button>
                <button type="button" className="btn ghost" onClick={() => setMode('signup')}>
                  Create account
                </button>
              </>
            )}
            {(mode === 'signup' || mode === 'forgot' || mode === 'reset') && (
              <button type="button" className="btn ghost" onClick={() => setMode('signin')}>
                Back to sign in
              </button>
            )}
            <span className="grow" />
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
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
          </div>
        </form>
      )}
    </Modal>
  );
}
