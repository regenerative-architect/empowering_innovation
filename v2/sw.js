/* Empowerment OS v4 service worker (OPT-IN: registered only when the person presses
   "Enable offline cache / install" under Data & privacy, on a hosted https/localhost copy).
   - Precaches the app shell only (index.html, manifest, icons).
   - Same-origin GETs: cache-first with network fallback; navigations: network-first, cached shell as fallback.
   - Third-party module/model hosts (esm.sh, huggingface.co, raw.githubusercontent.com) are cached at runtime ONLY
     after a successful online fetch the person started. It never promises first-use offline availability for them.
   - No analytics, no background sync, no push, no telemetry. */
const VERSION = 'empowerment-os-v4.0.0-2026-10-10';
const CORE = VERSION + ':core', RUNTIME = VERSION + ':runtime';
const CORE_URLS = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.svg', './icons/icon-512.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CORE).then(c => c.addAll(CORE_URLS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('empowerment-os-') && !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return; const url = new URL(req.url);
  if (req.mode === 'navigate') { e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(RUNTIME).then(c => c.put(req, copy)); return r; }).catch(() => caches.match('./index.html'))); return; }
  if (url.origin === self.location.origin) { e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(RUNTIME).then(c => c.put(req, copy)); } return r; }))); return; }
  if (['esm.sh', 'huggingface.co', 'raw.githubusercontent.com'].includes(url.hostname)) { e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(RUNTIME).then(c => c.put(req, copy)); } return r; }))); }
});
