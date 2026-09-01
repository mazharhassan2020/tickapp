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

/* ---- Push notifications ----
   The server sends a JSON payload; the click opens the panel, focusing a tab
   that is already open rather than piling up new ones. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "New message", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "New message";
  const options = {
    body: data.body || "",
    icon: data.icon || undefined,
    badge: data.icon || undefined,
    // Same tag means a second message from one chat replaces the first
    // instead of stacking.
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || "/inbox" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/inbox";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
