/* Service worker for Sneaky Bigfoot — offline-capable app shell.
 * Bump CACHE on any asset change to force clients to refetch. */
const CACHE = "sneaky-bigfoot-v5";

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./game.js",
  "./manifest.json",
  "./assets/title.jpg",
  "./assets/sprites/bigfoot.png",
  "./assets/sprites/mama.png",
  "./assets/sprites/kid.png",
  "./assets/sprites/ranger.png",
  "./assets/sprites/tent.png",
  "./assets/sprites/tree.png",
  "./assets/sprites/store.png",
  "./assets/sprites/table.png",
  "./assets/sprites/den.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-180.png",
];

// Precache the app shell on install.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Drop old caches on activate.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for same-origin GETs, falling back to network (and caching it).
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
