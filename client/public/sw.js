/**
 * Deliberately conservative service worker.
 *
 * Its job is to make the app installable and to survive a flaky connection —
 * not to serve stale code. The panel ships several times a day, so HTML and API
 * calls always go to the network; only Vite's content-hashed assets are cached,
 * and those are safe because a new build produces new filenames.
 */
const ASSET_CACHE = "tickai-assets-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== ASSET_CACHE).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build output: same URL always means the same bytes.
  const isHashedAsset =
    url.pathname.startsWith("/assets/") &&
    /\.[0-9a-zA-Z_-]{8,}\.(js|css|woff2?|png|jpg|jpeg|svg|webp)$/.test(url.pathname);

  if (isHashedAsset) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  // Everything else — documents, API, uploads — stays live.
});
