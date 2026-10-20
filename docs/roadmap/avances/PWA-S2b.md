---
item: PWA-S2b
estado: hecho
adr: ADR-0003
prd: PRD-PWA-01
fecha: 2026-10-20
---
PWA-S2b hecho: `/venta` usa `PwaRegistro.astro` (mismo registro de `/sw.js` con scope `/` que `BaseLayout` y un `catch` que solo avisa) y enlaza `/manifest.webmanifest`, y al cargar le manda al SW las URLs same-origin de sus scripts y hojas de estilo, que el SW guarda con `CACHE` `inventario-v3` (solo GET same-origin, sin `/api/` ni `/sw.js`, solo respuestas OK sin redirección y nunca HTML, sin `Vary` para que el request de módulo con `Origin` encuentre la copia); decisión: cachear los assets ya cargados por la página en vez de parsear el HTML porque cubre el grafo de módulos de Vite en dev y los hashes de `/_astro` en prod, sigue precacheando `/venta`, solo `/` y `/venta` quedan como páginas offline, `/api/sync/pull` sigue network-first con `x-desde-cache: 1`, y la landing no cambia salvo compartir el registro y el reporte de assets.
