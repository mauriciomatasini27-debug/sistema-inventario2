---
item: DASH-S4
estado: hecho
adr: ADR-0043
prd: PRD-DASH-01
fecha: 2026-10-17
---
DASH-S4 hecho: /panel/alertas/umbrales con tabla de productos con min_stock y reorder_qty editables en línea vía el PATCH existente de /api/products (solo dueño/encargado, 403 al empleado), validación entera en línea sin mandar request (Poné un número entero desde 0/1, vacío = sin valor null), sugerido por rotación 7d en gris desde GET /api/analytics/tablero reusando umbral_efectivo, edición masiva por sector (products.sector), toast Sonner con Deshacer que restaura por la misma API, y links desde /panel/stock y la tarjeta StockCard; lógica pura en src/lib/umbrales-panel.ts con tests primeros y cobertura en tests/panel-paginas.test.ts; sin pill nuevo (queda para DASH-S12); omitidos: destinatarios e historial (DASH-S5/S6) y el sugerido cubre hasta 6 páginas de 50 del tablero.
