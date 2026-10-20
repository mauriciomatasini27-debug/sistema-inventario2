// PWA-S2 (PRD-PWA-01, OF1/OF3): SW mínimo sin dependencias.
// - Estático same-origin: cache-first (la app abre sin red con último catálogo).
// - GET /api/sync/pull: network-first con fallback a caché (fondo del catálogo).
// - GET /api/sync/pull sin red: la copia cacheada sale marcada con
//   `x-desde-cache: 1` para que el cliente no la tome como catálogo recién bajado.
// - Navegaciones: network-first; solo las páginas que funcionan sin red
//   (PAGINAS_OFFLINE) se guardan al responder OK sin redirección, para no dejar
//   HTML con datos del panel en el dispositivo. Sin red sirve la misma página
//   cacheada (o "/" si esa no está).
// - Solo GET; nunca intercepta POST (push/promote/sales) ni cross-origin.
// Bumpeá CACHE al cambiar precacheados.
const CACHE = "inventario-v3";
const PAGINAS_OFFLINE = new Set(["/", "/venta"]);
const PRECACHE = [
  "/",
  "/venta",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "cachear-assets" || !Array.isArray(data.urls)) return;
  event.waitUntil(cachearAssets(data.urls));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/api/sync/pull") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => (hit ? marcarDesdeCache(hit) : hit))),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected && PAGINAS_OFFLINE.has(url.pathname)) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(req, { ignoreSearch: true })
            .then((hit) => hit ?? caches.match("/")),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
          return res;
        }),
    ),
  );
});

function cachearAssets(urls) {
  return caches.open(CACHE).then((cache) =>
    Promise.all(
      urls.map((raw) => {
        if (typeof raw !== "string") return undefined;
        const url = new URL(raw, self.location.origin);
        if (url.origin !== self.location.origin) return undefined;
        if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return undefined;
        if (url.pathname === "/sw.js") return undefined;
        return cache.match(url.href).then((hit) => {
          if (hit) return undefined;
          return fetch(url.href)
            .then((res) => {
              // Nunca HTML: solo /, /venta (navegación) quedan como páginas offline.
              if (!res.ok || res.redirected) return undefined;
              if ((res.headers?.get("content-type") ?? "").includes("text/html")) return undefined;
              const headers = new Headers(res.headers);
              headers.delete("vary");
              return cache.put(url.href, new Response(res.body, { status: res.status, statusText: res.statusText, headers }));
            })
            .catch((error) => {
              console.warn("[pwa] no se pudo cachear el asset", url.href, error);
            });
        });
      }),
    ),
  );
}

function marcarDesdeCache(res) {
  const headers = new Headers(res.headers);
  headers.set("x-desde-cache", "1");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
