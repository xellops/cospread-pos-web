/*
 * App-shell service worker: lets the POS reload while offline.
 * - Build assets (/_next/static) are immutable: cache-first.
 * - Page navigations: network-first, falling back to the cached page (or any cached shell).
 * - API calls are never cached here; offline data lives in IndexedDB (lib/db.ts).
 */
const VERSION = "v1";
const SHELL_CACHE = `pos-shell-${VERSION}`;
const STATIC_CACHE = `pos-static-${VERSION}`;
const SHELL_ROUTES = ["/", "/login", "/pos", "/orders", "/invoices"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => Promise.allSettled(SHELL_ROUTES.map((r) => cache.add(r))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== STATIC_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || /\.(svg|png|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match(url.pathname)) || (await cache.match("/pos")) || (await cache.match("/")) || Response.error();
        }),
    );
  }
});
