// The signed-in account: sync status, username and friends, notifications,
// sign out. (Signing in is a page of its own: SignInPage, with AuthForm.)

import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import Modal from './Modal';
import Friends from './Friends';
import { SuspendedNotice } from './Home';
import { Icon } from './icons';
import { cloud, refreshStanding } from '../lib/cloud';
import { cloudStatusText } from '../lib/cloud/status';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset' | 'account';

export default function AccountDialog({
  onClose,
  onSettings,
}: {
  onClose: () => void;
  onSettings?: () => void;
}) {
  const user = useStore((s) => s.cloudUser);
  const info = useStore((s) => s.cloudInfo);
  const backend = cloud.backend;
  const engine = cloud.engine;

  useEffect(refreshStanding, []); // a moderator may have changed it since sign-in
  // signed out (from here, or elsewhere): nothing to show
  useEffect(() => {
    if (!user) onClose();
  }, [user, onClose]);
  if (!backend || !engine || !user) return null;

  const statusLine =
    cloudStatusText(info) +
    (info.status === 'synced' && !info.pending && info.lastSync
      ? ` · ${new Date(info.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : '');

  return (
    <Modal title="Account" onClose={onClose}>
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
          <SuspendedNotice />
          <Friends />
          <div className="actions spread">
            {/* syncing is automatic; a manual push is only for when it's stuck */}
            {info.status !== 'syncing' && (info.status === 'offline' || info.status === 'error' || info.pending > 0) && (
              <button className="btn" onClick={() => void engine.flush()}>
                Try again
              </button>
            )}
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
    </Modal>
  );
}
