// Network first so updates show on the next open; falls back to the cache offline.
const CACHE = 'sourdough-v6';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './store.js', './ui.js', './bake-view.js', './starter-view.js',
  './recipe-view.js', './settings-view.js', './format.js', './schedule.js', './starter.js', './recipes.js', './guide.js',
  './sync.js', './ntfy.js', './alerts.js', './household-view.js', './vendor/qrcode.mjs', './vendor/jsQR.js',
  './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html')))
  );
});
