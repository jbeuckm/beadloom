// Settings for this device: where the app opens, and notifications about
// what other people do (see lib/cloud/activity.ts for how they're found).

import { useState } from 'react';
import { useStore } from '../store/useStore';
import Modal from './Modal';
import { Icon } from './icons';
import { ACTIVITY_KINDS, readNotifyPrefs, writeNotifyPrefs, type NotifyPrefs } from '../lib/cloud/activity';
import { readLaunchTo, writeLaunchTo, type LaunchTo } from './Home';

const supported = typeof Notification !== 'undefined';

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const user = useStore((s) => s.cloudUser);
  const [prefs, setPrefs] = useState<NotifyPrefs>(readNotifyPrefs);
  const [permission, setPermission] = useState(supported ? Notification.permission : 'denied');
  const [launchTo, setLaunchTo] = useState<LaunchTo>(readLaunchTo);
  const setLaunch = (v: LaunchTo) => {
    setLaunchTo(v);
    writeLaunchTo(v);
  };
  const update = (p: NotifyPrefs) => {
    setPrefs(p);
    writeNotifyPrefs(p);
  };

  const toggleSystem = async (on: boolean) => {
    if (on && supported && Notification.permission === 'default') {
      const r = await Notification.requestPermission(); // must follow the tap
      setPermission(r);
      if (r !== 'granted') return;
    }
    update({ ...prefs, system: on && (!supported || Notification.permission === 'granted') });
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <section className="settings" aria-label="When Chromattice opens">
        <h3>
          <Icon name="home" size={15} /> When Chromattice opens
        </h3>
        {(['home', 'design'] as const).map((v) => (
          <label key={v} className="check">
            <input type="radio" name="launch-to" checked={launchTo === v} onChange={() => setLaunch(v)} />
            <span>
              {v === 'home' ? 'Show my home' : 'Go straight back to my last design'}
              <span className="hint">
                {v === 'home'
                  ? ' — your designs, activity, friends and journal; the design you were on is one tap away'
                  : ' — the Home button, top left, is always there'}
              </span>
            </span>
          </label>
        ))}
      </section>
      <section className="settings" aria-label="Notifications">
        <h3>
          <Icon name="users" size={15} /> Notifications
        </h3>
        {!user && <p className="hint">Sign in to hear about friend requests, shares, comments and likes.</p>}
        <p className="hint">
          While Chromattice is open, even in a background tab, it checks for news about once a minute.
          It can't notify you while it's closed.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={prefs.system && permission === 'granted'}
            disabled={!supported || permission === 'denied'}
            onChange={(e) => void toggleSystem(e.target.checked)}
          />
          <span>
            System notifications when Chromattice isn't in front
            <span className="hint">
              {!supported
                ? ' — not available in this browser (on iPad, add Chromattice to the Home Screen first)'
                : permission === 'denied'
                  ? ' — blocked; allow notifications for this site in your browser settings'
                  : ' — otherwise you see them in the app'}
            </span>
          </span>
        </label>
        <p className="hint settings-sub">Tell me about:</p>
        {ACTIVITY_KINDS.map((k) => (
          <label key={k.kind} className="check">
            <input
              type="checkbox"
              checked={prefs.kinds[k.kind]}
              onChange={(e) => update({ ...prefs, kinds: { ...prefs.kinds, [k.kind]: e.target.checked } })}
            />
            <span>
              {k.label}
              <span className="hint"> — {k.hint}</span>
            </span>
          </label>
        ))}
      </section>
      <div className="actions">
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
