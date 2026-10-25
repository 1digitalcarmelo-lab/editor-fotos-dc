// Revelado DC sigue siendo instalable. El acceso requiere verificación en línea.
const CACHE = 'revelado-dc-shell-v21';
const CORE = ['./manifest.webmanifest','./assets/branding/icon-192.png','./assets/branding/icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('revelado-dc-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r, { cache:'no-store' }).catch(() => new Response('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Revelado DC</title><body style="background:#111336;color:white;font:18px system-ui;padding:2rem"><h1>Conecta a internet para ingresar</h1><p>Revelado DC está instalado. Necesita conexión para verificar tu licencia. Tus ajustes locales se conservan.</p><button onclick="location.reload()">Volver a intentar</button></body></html>', { status:503, headers:{ 'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store' } })));
    return;
  }
  if (CORE.some(p => new URL(p, self.registration.scope).href === r.url)) e.respondWith(fetch(r).catch(() => caches.match(r)));
});

