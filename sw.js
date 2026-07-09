// L-3 Logística — Service Worker
// Versión del cache — cambia este número para forzar actualización
var CACHE_VERSION = 'l3-v1.4';

var ARCHIVOS_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600;700&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Instalar — guardar archivos en cache
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      return cache.addAll(ARCHIVOS_CACHE);
    })
  );
  self.skipWaiting();
});

// Activar — borrar caches viejos
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_VERSION; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — Network First para API/mapa, Cache First para assets
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // APIs externas: siempre red (nunca cache)
  if (url.includes('openrouteservice.org') ||
      url.includes('nominatim.openstreetmap.org') ||
      url.includes('firebase') ||
      url.includes('workers.dev') ||
      url.includes('wttr.in') ||
      url.includes('basemaps.cartocdn.com')) {
    e.respondWith(fetch(e.request).catch(function() {
      return new Response(JSON.stringify({ error: 'Sin conexión' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }));
    return;
  }

  // Assets propios: Cache First con fallback a red
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(res) {
        return caches.open(CACHE_VERSION).then(function(cache) {
          cache.put(e.request, res.clone());
          return res;
        });
      });
    })
  );
});
