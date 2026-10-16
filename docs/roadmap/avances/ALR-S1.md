---
item: ALR-S1
estado: hecho
adr: ADR-0043
prd: PRD-ALR-01
fecha: 2026-10-16
---
ALR-S1 hecho: min_stock y reorder_qty de products persistidos y editables desde el panel (PATCH /api/products valida min_stock entero >= 0 y reorder_qty entero > 0 con null para limpiar, solo dueno o encargado con 403 al empleado; repo revalida y tolera bases sin la 0027 con espejo en memoria; aviso matutino usa min_stock de la DB primero con fallback a rotación 7d e incluye reorder_qty; bloque por SKU en panel.astro; coincideDifuso parte la consulta por guion igual que las fichas para que q=UMV-4 encuentre el producto; tests/alr-s1-umbrales.test.ts 11/11 más PG A/B).
