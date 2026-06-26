const CACHE_NAME = 'l3-v2';
const FILES_TO_CACHE = [
  './',                  // Cacha la raíz (evita errores si entran sin poner "index.html")
  './index.html',
  './manifest.json',
  './icon.png'
];

// 1. Evento Install: Guarda los archivos en caché de inmediato
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Cacheando archivos estáticos');
        return cache.addAll(FILES_TO_CACHE);
      })
      .then(() => self.skipWaiting()) // Fuerza al nuevo SW a activarse sin esperar
  );
});

// 2. Evento Activate: Limpia la basura (cachés viejos) automáticamente
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          // Si el caché actual no coincide con el CACHE_NAME, se borra
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Eliminando caché antiguo:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim()) // Toma el control de las pestañas abiertas inmediatamente
  );
});

// 3. Evento Fetch: Estrategia Cache First (Caché primero, si no hay, va a red)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      // Devuelve el archivo si está en caché, si no, hace la petición a internet
      return response || fetch(e.request).catch(() => {
        console.log('[Service Worker] Error de red y el archivo no estaba en caché.');
        // Aquí podrías retornar una página offline genérica si quisieras
      });
    })
  );
});
