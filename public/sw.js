// PWA-S2 (PRD-PWA-01, OF1/OF3): SW mínimo sin dependencias.
// - Navegaciones: solo intercepta las páginas offline (/ y /venta); el resto
//   (/panel, /plan, /admin, /alta...) va directo al servidor.
// - /api (salvo /api/sync/pull) nunca pasa por el SW: no rompe OAuth/sesiones.
// - Estáticos (JS, CSS, imágenes, fuentes): cache-first. Nunca HTML de prefetch.
// Bumpeá CACHE al cambiar precacheados. v6: solo interceptar destinos estáticos reales y nunca prefetch ni only-if-cached.
const CACHE = "inventario-v6";
const PAGINAS_OFFLINE = new Set(["/", "/venta"]);
const DESTINOS_ESTATICOS = new Set(["script", "style", "image", "font", "manifest"]);
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
  if (req.cache === "only-if-cached" && req.mode !== "same-origin") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const proposito = (
    req.headers.get("sec-purpose") ??
    req.headers.get("purpose") ??
    req.headers.get("x-moz") ??
    ""
  ).toLowerCase();
  if (proposito.includes("prefetch")) return;

  // 1. Sync offline-first
  if (url.pathname === "/api/sync/pull") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => (hit ? marcarDesdeCache(hit) : hit))),
    );
    return;
  }

  // 2. El resto de /api nunca pasa por el SW (evita romper OAuth y sesiones)
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return;

  // 3. Navegaciones: solo interceptar las páginas habilitadas offline.
  // El resto va directo al servidor.
  if (req.mode === "navigate") {
    if (!PAGINAS_OFFLINE.has(url.pathname)) return;

    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) {
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

  // 4. NUNCA cachear documentos HTML ni requests sin destino estático (prefetch, server islands, etc.)
  const aceptaHtml = (req.headers.get("accept") ?? "").includes("text/html");
  if (aceptaHtml || !DESTINOS_ESTATICOS.has(req.destination)) return;

  // 5. Estáticos reales (JS, CSS, imágenes, fuentes): cache-first
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok && !res.redirected) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
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
              // Nunca HTML: solo / y /venta (navegación) quedan como páginas offline.
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
