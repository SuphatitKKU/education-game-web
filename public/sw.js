const CACHE_NAME = "parcel-lab-shell-v23-safe-asset-fallback";
const APP_SHELL = ["./", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.endsWith("/sw.js")) return;

  const isNavigation = request.mode === "navigate";
  const isAppAsset = request.destination === "script"
    || request.destination === "style"
    || request.destination === "worker"
    || url.pathname.indexOf("/_next/") >= 0;
  const fetchAndCache = () => fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  });

  event.respondWith(
    isNavigation
      ? fetchAndCache().catch(() => caches.match(request).then((cached) => cached || caches.match("./")))
      : isAppAsset
        // Never answer a JavaScript, CSS, worker, or Next.js asset request
        // with the cached HTML shell. Browsers parse that HTML as JavaScript
        // and surface "Unexpected token '<'" instead of a recoverable load
        // failure. Use only the exact cached asset when the network is down.
        ? fetchAndCache().catch(() => caches.match(request).then((cached) => cached || Response.error()))
      : caches.match(request).then((cached) => cached || fetchAndCache()).catch(() => caches.match("./")),
  );
});
