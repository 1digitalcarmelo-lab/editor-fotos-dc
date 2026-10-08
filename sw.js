// Revelado DC · permite instalarlo y abrirlo aunque no haya internet.
// Siempre busca primero la versión nueva; si no hay conexión, usa la guardada.
const CACHE = 'revelado-dc-v17';
// Lo mínimo para que la app instalada abra sin conexión (con logo e íconos incluidos).
const CORE = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/engine.js', 'js/exif.js', 'js/store.js', 'js/vendor/fflate.js', 'manifest.webmanifest',
  'assets/branding/logo-principal.png', 'assets/branding/favicon-32.png', 'assets/branding/favicon-64.png', 'assets/branding/apple-touch-icon.png',
  'assets/branding/icon-192.png', 'assets/branding/icon-512.png', 'assets/branding/icon-maskable-512.png'];
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {})); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('revelado-dc-')).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('./')))
  );
});
