// Whether this build has accounts, and which cloud: decided once at load from
// the environment (and, in development, a localStorage flag for the fake).
// Kept apart from index.ts so storage-level code can ask without importing
// the store.

export const FAKE_FLAG = 'beadloom.cloudFake';

export const cloudConfig = (() => {
  let fake = false;
  try {
    fake =
      import.meta.env.VITE_CLOUD_FAKE === '1' ||
      (import.meta.env.DEV && localStorage.getItem(FAKE_FLAG) === '1');
  } catch {
    fake = false;
  }
  const authUrl = (import.meta.env.VITE_NEON_AUTH_URL as string | undefined) || '';
  const dataUrl = (import.meta.env.VITE_NEON_DATA_API_URL as string | undefined) || '';
  return { fake, authUrl, dataUrl, available: fake || !!(authUrl && dataUrl) };
})();
