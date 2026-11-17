// Route Art service worker: makes the app open without a connection and keeps
// the map tiles you've already viewed so Follow mode still has a map on weak signal.
// Map data, address search and elevation always go to the network.
const VERSION = "route-art-v4";
const SHELL = VERSION + "-shell";
const TILES = "route-art-tiles";
const MAX_TILES = 4000;
const SHELL_FILES = [
  "./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.allSettled(SHELL_FILES.map(u => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("route-art-v") && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // The app itself: network first so updates show up, cached copy when offline.
  if (req.mode === "navigate" || (url.origin === location.origin)) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html"))));
    return;
  }

  // Map tiles: cache first, keep them for offline use.
  if (url.hostname === "tile.openstreetmap.org") {
    const key = url.origin + url.pathname;
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(key);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") { c.put(key, res.clone()); trim(c); }
      return res;
    }));
    return;
  }

  // Library and fonts: cached copy first, refresh in the background.
  if (url.hostname === "cdnjs.cloudflare.com" || url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.open(SHELL).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
  // Everything else (OpenStreetMap data, Nominatim, Open-Meteo) goes straight to the network.
});

let trimming = false;
async function trim(c) {
  if (trimming) return; trimming = true;
  try { const keys = await c.keys(); for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]); }
  finally { trimming = false; }
}
