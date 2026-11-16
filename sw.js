// Service Worker del Chat de Argentina
// Versión: cambiá el número si actualizás el HTML y querés forzar recarga
const CACHE_VERSION = "chat-arg-v1";
const CACHE_STATIC = CACHE_VERSION + "-static";
const CACHE_RUNTIME = CACHE_VERSION + "-runtime";

// Archivos que se cachean al instalar (el "shell" de la app)
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// ─── Install: cachear el shell ───
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(() => {
        // Si algún asset falla, igual instalamos para no bloquear
      }))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate: borrar caches viejos ───
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_RUNTIME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ─── Fetch: estrategia por tipo de request ───
self.addEventListener("fetch", event => {
  const req = event.request;

  // Solo manejamos GET
  if (req.method !== "GET") return;

  // Ignoramos requests que no son http(s) (chrome-extension, etc.)
  if (!req.url.startsWith("http")) return;

  const url = new URL(req.url);

  // ─── 1. Supabase y APIs externas: Network only (nunca cachear) ───
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("supabase.in") ||
    url.hostname.includes("youtube.com") ||
    url.hostname.includes("ytimg.com") ||
    url.hostname.includes("pipedapi") ||
    url.hostname.includes("yewtu.be") ||
    url.hostname.includes("invidious")
  ) {
    return; // Dejamos pasar al network, sin cache
  }

  // ─── 2. Navegación (abrir la app): Network first, cache fallback ───
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_STATIC).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(c => c || caches.match("./index.html")))
    );
    return;
  }

  // ─── 3. Assets propios (mismo origen): Cache first, network fallback ───
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_STATIC).then(c => c.put(req, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // ─── 4. Resto (CDNs, imágenes remotas): Stale-while-revalidate ───
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_RUNTIME).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// ─── Mensajes desde la app (opcional) ───
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});