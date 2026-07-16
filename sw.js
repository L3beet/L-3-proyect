var CACHE_VERSION = 'l3-v2.0';
var ARCHIVOS_CACHE = ['./', './index.html', './manifest.json'];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      return Promise.allSettled(ARCHIVOS_CACHE.map(function(url) { return cache.add(url); }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE_VERSION; }).map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  if (url.includes('openrouteservice.org') || url.includes('nominatim.openstreetmap.org') ||
      url.includes('firebase') || url.includes('workers.dev') ||
      url.includes('wttr.in') || url.includes('cartocdn.com') || url.includes('googleapis.com')) {
    e.respondWith(fetch(e.request).catch(function() {
      return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    }));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(res) {
        return caches.open(CACHE_VERSION).then(function(cache) {
          cache.put(e.request, res.clone());
          return res;
        });
      });
    }).catch(function() { return caches.match('./index.html'); })
  );
});
