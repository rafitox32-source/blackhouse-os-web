const CACHE_NAME = 'blackhouse-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/panel.html',
  '/index.html',
  '/tracking.html',
  '/icon-512.png',
  '/manifest.json'
];

// Instalar: cachear archivos esenciales
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando archivos esenciales...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activar: limpiar caches viejos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network First (para que siempre tenga datos frescos), cache como fallback
self.addEventListener('fetch', event => {
  // No cachear peticiones a la API (necesitan datos en tiempo real)
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Guardar copia en cache
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // Sin internet: servir desde cache
        return caches.match(event.request);
      })
  );
});
