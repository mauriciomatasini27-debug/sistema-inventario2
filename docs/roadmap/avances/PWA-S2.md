---
item: PWA-S2
estado: hecho
adr: ADR-0003
prd: PRD-PWA-01
fecha: 2026-10-20
---
PWA-S2 hecho: `/venta` descarga `GET /api/sync/pull?cursor=0&limite=1` en segundo plano al abrir y en `online` (`src/offline/catalogo-local.ts`) y guarda `offline:catalogo` como snapshot `{version, descargadoEl, productos}` en localStorage con la misma vida que la cola de /venta; decisión: refresco a los 15 minutos, nunca pisa el último catálogo bueno con una respuesta fallida ni lanza, completa el precio al cambiar el SKU solo si el usuario no lo editó, `sw.js` precachea `/venta` y guarda sin red solo `/` y `/venta` (nunca HTML del panel ni respuestas redirigidas; caché `inventario-v2`), el pull cacheado que sirve el SW sin red sale con `x-desde-cache: 1` y no se toma como catálogo nuevo, y `revocarDispositivo` borra el catálogo local.
