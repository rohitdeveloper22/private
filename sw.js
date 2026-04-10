/**
 * sw.js  –  ChordStar v6.0 Service Worker
 * Strategy: Stale-While-Revalidate for app shell so users always
 * get latest JS/CSS on next visit, not just after manual refresh.
 */

const CACHE_NAME = 'chordstar-v7';

const APP_SHELL = [
  './', './index.html', './manifest.json',
  './css/styles.css',
  './js/storage.js', './js/students.js', './js/tasks.js', './js/ui.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png'
];

/* ── Install: cache all files ─────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(APP_SHELL.map(url => cache.add(url).catch(e => console.warn('[SW] Skip:', url, e))))
    ).then(() => self.skipWaiting())
  );
});

/* ── Activate: purge old caches ──────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: Stale-While-Revalidate for app shell ─────────────── */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!isSameOrigin && !isFont) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        // Stale-while-revalidate: serve from cache immediately, update in background
        const fetchPromise = fetch(event.request).then(response => {
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => null);

        return cached || fetchPromise || (
          event.request.mode === 'navigate'
            ? cache.match('./index.html')
            : null
        );
      })
    )
  );
});
