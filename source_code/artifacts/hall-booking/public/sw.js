const TILE_CACHE = "esri-tiles-v1";

function isTileRequest(url) {
  return /arcgisonline\.com\/ArcGIS\/rest\/services\/(World_Imagery|Reference\/World_Boundaries_and_Places)\/MapServer\/tile\/\d+\/\d+\/\d+/.test(
    url,
  );
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !isTileRequest(request.url)) {
    return;
  }

  event.respondWith(
    caches.open(TILE_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        const fallback = await cache.match(request);
        if (fallback) {
          return fallback;
        }
        throw err;
      }
    }),
  );
});
