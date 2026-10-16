---
id: ADR-0026
tipo: adr
estado: aceptado
modulos: [inventario, persistencia]
depende_de: [ADR-0012, PRD-CAT-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Implementar products CRUD + búsqueda, lots + FEFO auto, locations y counts/confirmar según PRD-CAT-01. PRD:
  diseno/PRD-CAT-01-catalogo-lotes-ubicaciones.md.
---
# ADR-0026 - Catálogo, lotes FEFO, ubicaciones y conteo

Estado: aceptado (parcial) (2026-10-14, evidencia: `src/db/schema.ts` tablas `products`, `product_codes`, `product_photos`, `stock_lots`, `locations`, `stock_counts`/`stock_count_lines`; `src/pages/api/products.ts`, `src/pages/api/lots.ts`, `src/pages/api/locations.ts`, `src/pages/api/counts.ts`, `src/lib/repos/lotes.ts`; `tests/pers3-ubicaciones-fotos-conteos.test.ts`; parcial: sin `/api/stock/ingreso` y CAT-S1→S6 sin cerrar). Fecha: 2026-10-11. Fuentes: F1/F2/F9/F12/F13, ADR-0012, grep `pgTable` (sin `locations/promotions`), `src/pages/api/stock/conteo.ts`.

## Decisión

Implementar `products CRUD` + búsqueda, `lots` + FEFO auto, `locations` y `counts/confirmar` según PRD-CAT-01. PRD: `diseno/PRD-CAT-01-catalogo-lotes-ubicaciones.md`.

## Por qué

Sin CRUD no hay alta real; sin lots no hay FEFO MVP (F12); sin locations no hay conteo por sector (F13). Hoy solo existe conteo ciego en memoria.

## Qué cambia

Tablas `products`, `product_codes`, `product_photos`, `stock_lots`, `locations`, `stock_counts/lines`; endpoints `/api/products`, `/api/lots`, `/api/stock/ingreso`, `/api/locations`, `/api/counts`.

## Alternativa descartada

Dejar conteo ciego actual: se descarta porque incumple F9/F13.

## Pendientes

CAT-S1→S6 + tests FEFO y `ajuste_conteo` con contó/confirmó.
