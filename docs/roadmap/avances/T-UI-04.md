---
item: T-UI-04
estado: hecho
adr: ADR-0038
prd: PRD-UX-01
fecha: 2026-10-17
---
T-UI-04: errores con fix junto al campo en los formularios de `panel` (caja, stock, precios, proveedores, fiado, consumos, bot/config) y `alta`, con catálogo rioplatense en `src/lib/errores-campo.ts`, helper DOM `src/lib/errores-campo-dom.ts` (aria-invalid, `<p class="error-campo">` con aria-describedby y foco al primer inválido), validación de cliente sin request y mapeo de `fieldErrors` 422 a cada campo; umbrales ya cumplía con su propio catálogo; inventario de locales salteado porque no existe `locales/`.
