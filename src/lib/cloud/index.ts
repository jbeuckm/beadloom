// The app's one cloud connection. Configured by VITE_NEON_AUTH_URL +
// VITE_NEON_DATA_API_URL (Neon), or VITE_CLOUD_FAKE=1 / a dev-only
// localStorage flag (the in-memory fake, for tests). With neither, accounts
// are simply absent and the app is local-only.

import { useStore } from '../../store/useStore';
import type { CloudBackend } from './backend';
import { createFakeBackend } from './fake';
import { createNeonBackend } from './neon';
import { createSyncEngine, type SyncEngine } from './sync';

export const FAKE_FLAG = 'beadloom.cloudFake';

export interface Cloud {
  available: boolean;
  backend: CloudBackend | null;
  engine: SyncEngine | null;
}

function init(): Cloud {
  let fake = false;
  try {
    fake =
      import.meta.env.VITE_CLOUD_FAKE === '1' ||
      (import.meta.env.DEV && localStorage.getItem(FAKE_FLAG) === '1');
  } catch {
    fake = false;
  }
  const authUrl = import.meta.env.VITE_NEON_AUTH_URL as string | undefined;
  const dataUrl = import.meta.env.VITE_NEON_DATA_API_URL as string | undefined;

  let backend: (CloudBackend & { fake?: unknown }) | null = null;
  if (fake) backend = createFakeBackend();
  else if (authUrl && dataUrl) backend = createNeonBackend(authUrl, dataUrl);
  if (!backend) return { available: false, backend: null, engine: null };

  const store = () => useStore.getState();
  const engine = createSyncEngine(
    backend,
    (info) => store().setCloudInfo(info),
    () => store().bumpLibrary(),
  );
  engine.start();
  store().setCloudAvailable(true);

  const apply = (u: Parameters<SyncEngine['setUser']>[0]) => {
    store().setCloudUser(u);
    engine.setUser(u);
  };
  backend.onUserChange(apply);
  backend
    .currentUser()
    .then(apply)
    .catch(() => apply(null));

  if (fake && 'fake' in backend)
    (window as unknown as { __beadloomCloudFake: unknown }).__beadloomCloudFake = backend.fake;

  return { available: true, backend, engine };
}

export const cloud: Cloud = init();

/** The URL a password-reset email should send the user back to. */
export const resetRedirectUrl = () => `${location.origin}${location.pathname}#auth=reset`;

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
  history.replaceState(null, '', location.pathname);
}
