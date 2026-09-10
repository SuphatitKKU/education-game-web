const CACHE_NAME = "parcel-lab-shell-v7-ipad-mini2-touchfix";
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

  const isAppCode = request.mode === "navigate"
    || request.destination === "script"
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
    isAppCode
      ? fetchAndCache().catch(() => caches.match(request).then((cached) => cached || caches.match("./")))
      : caches.match(request).then((cached) => cached || fetchAndCache()).catch(() => caches.match("./")),
  );
});
