/* BeadLoom Studio service worker — dependency-free runtime cache.
 *
 * - App shell (navigations) → network-first, falling back to a cached index.
 * - Static assets (same-origin GET) → stale-while-revalidate.
 * The registration scope is this file's directory, so the app works from a
 * sub-path (e.g. a folder on GitHub Pages) without any extra config. */

const CACHE = 'beadloom-v1';
const BASE = new URL('./', self.location).pathname; // e.g. "/beadloom-studio/"
const SHELL = [BASE, BASE + 'index.html', BASE + 'manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: try the network, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put(BASE + 'index.html', res.clone()));
          return res;
        })
        .catch(() =>
          caches
            .match(BASE + 'index.html')
            .then((r) => r || caches.match(BASE)),
        ),
    );
    return;
  }

  // Everything else: serve from cache, refresh in the background.
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    ),
  );
});
