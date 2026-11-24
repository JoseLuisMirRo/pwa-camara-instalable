// sw.js
// Service Worker básico: precachea el App Shell y lo sirve con estrategia Cache First.

const CACHE_NAME = 'camara-static-v1';
const STATIC_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* ---------- Instalación: guardar el App Shell ---------- */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_FILES))
      .then(() => self.skipWaiting())
  );
});

/* ---------- Activación: borrar versiones viejas del caché ---------- */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nombres) => {
        return Promise.all(
          nombres
            .filter((nombre) => nombre.startsWith('camara-static-') && nombre !== CACHE_NAME)
            .map((nombre) => caches.delete(nombre))
        );
      })
      .then(() => self.clients.claim())
  );
});

/* ---------- Cache First ---------- */

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then((enCache) => {
        if (enCache) return enCache;

        return fetch(event.request).catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
