// The app's one cloud connection. Configured by VITE_NEON_AUTH_URL +
// VITE_NEON_DATA_API_URL (Neon), or VITE_CLOUD_FAKE=1 / a dev-only
// localStorage flag (the in-memory fake, for tests). With neither, accounts
// are simply absent and the app is local-only.

import { useStore } from '../../store/useStore';
import type { CloudBackend } from './backend';
import { createFakeBackend } from './fake';
import { createNeonBackend } from './neon';
import { createSyncEngine, type SyncEngine } from './sync';
import { cloudConfig } from './config';
import { inCloudStorage, setCloudStoreOpen } from '../stores';
import { createActivityWatcher, deliver, type ActivityWatcher } from './activity';

export { FAKE_FLAG } from './config';

export interface Cloud {
  available: boolean;
  backend: CloudBackend | null;
  engine: SyncEngine | null;
  activity: ActivityWatcher | null;
}

function init(): Cloud {
  const { fake, authUrl, dataUrl } = cloudConfig;
  let backend: (CloudBackend & { fake?: unknown }) | null = null;
  if (fake) backend = createFakeBackend();
  else if (authUrl && dataUrl) backend = createNeonBackend(authUrl, dataUrl);
  if (!backend) {
    useStore.getState().setCloudReady();
    return { available: false, backend: null, engine: null, activity: null };
  }

  const store = () => useStore.getState();
  const engine = createSyncEngine(
    backend,
    (info) => store().setCloudInfo(info),
    () => store().bumpLibrary(),
  );
  engine.start();
  store().setCloudAvailable(true);

  const activity = createActivityWatcher(
    backend,
    (e) => void deliver(e, (text) => store().notify(text)),
    (id) => `${location.origin}${location.pathname}#/gallery/${id}`,
    (id) => `${location.origin}${location.pathname}#/journal/${id}`,
  );

  let lastUserId: string | null | undefined; // undefined: not known yet
  const apply = (u: Parameters<SyncEngine['setUser']>[0]) => {
    // another account (or none): the open design and palette no longer belong
    // to a Cloud Storage file here, so they stay open but unsaved
    if (lastUserId !== undefined && lastUserId !== (u?.id ?? null)) {
      const s = store();
      if (inCloudStorage(s.slotPath)) useStore.setState({ slotPath: null, dirty: true });
      if (inCloudStorage(s.paletteSlotPath)) useStore.setState({ paletteSlotPath: null });
    }
    lastUserId = u?.id ?? null;
    store().setCloudReady();
    setCloudStoreOpen(!!u); // Cloud Storage shows in the browsers only while signed in
    store().setCloudUser(u);
    engine.setUser(u);
    activity.setUser(u);
    store().bumpLibrary();
    if (u)
      backend!
        .myProfile()
        .then((p) => store().cloudUser?.id === u.id && store().setCloudUsername(p?.username ?? null))
        .catch(() => {});
    if (u) setTimeout(refreshStanding); // after init: `cloud` isn't assigned yet if this runs during it
  };
  backend.onUserChange(apply);
  backend
    .currentUser()
    .then(apply)
    .catch(() => apply(null));

  if (fake && 'fake' in backend)
    Object.assign(window, { __beadloomCloudFake: backend.fake, __beadloomActivity: activity });

  return { available: true, backend, engine, activity };
}

export const cloud: Cloud = init();

/** The URL a password-reset email should send the user back to: the
 *  sign-in page, which then asks for the new password. */
export const resetRedirectUrl = () => `${location.origin}${location.pathname}#/signin?auth=reset`;

/** A reset token in the page URL (`#auth=reset?token=…` or `?auth=reset&token=…`), if any. */
export function resetTokenFromUrl(): string | null {
  const parts = [location.search.replace(/^\?/, ''), ...location.hash.replace(/^#/, '').split('?')];
  let isReset = false;
  let token: string | null = null;
  for (const p of parts) {
    const q = new URLSearchParams(p);
    if (q.get('auth') === 'reset') isReset = true;
    if (q.get('token')) token = q.get('token');
  }
  return isReset && token ? token : null;
}

/** Drop the reset token from the address bar once it's been used. */
export function clearAuthUrl() {
  history.replaceState(null, '', `${location.pathname}#/signin`);
}

/** Bring Cloud Storage up to date now: when the user is about to look at
 *  their designs (Open, the Palette Library, Home), so what they changed on
 *  another device is there. Does nothing signed out. */
export function syncOnLook() {
  void cloud.engine?.flush();
}

/** Reload my role and suspension (at sign-in; after staff change them). */
export function refreshStanding() {
  const b = cloud.backend;
  const id = useStore.getState().cloudUser?.id;
  if (!b || !id) return;
  b.standing()
    .then((st) => useStore.getState().cloudUser?.id === id && useStore.getState().setCloudStanding(st))
    .catch(() => {});
}
