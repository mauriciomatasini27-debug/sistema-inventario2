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

Estado: aceptado (2026-10-16, evidencia: `src/pages/api/products.ts`, `lots.ts`, `locations.ts`, `counts.ts`, `stock/ingreso.ts`, `src/lib/repos/{catalogo,lotes,stock}.ts`, `tests/cat-s1..s6`, `tests/pers3-ubicaciones-fotos-conteos.test.ts`; CAT-S1 a S6 cerrados por PRD-CAT-01 y CAT-S7 a S11 por PRD-CAT-02). Fecha: 2026-10-11. Fuentes: F1/F2/F9/F12/F13, ADR-0012, grep `pgTable` (sin `locations/promotions`), `src/pages/api/stock/conteo.ts`.

## Decisión

Implementar `products CRUD` + búsqueda, `lots` + FEFO auto, `locations` y `counts/confirmar` según PRD-CAT-01. PRD: `diseno/PRD-CAT-01-catalogo-lotes-ubicaciones.md`.

## Por qué

Sin CRUD no hay alta real; sin lots no hay FEFO MVP (F12); sin locations no hay conteo por sector (F13). Hoy solo existe conteo ciego en memoria.

## Qué cambia

Tablas `products`, `product_codes`, `product_photos`, `stock_lots`, `locations`, `stock_counts/lines`; endpoints `/api/products`, `/api/lots`, `/api/stock/ingreso`, `/api/locations`, `/api/counts`.

## Alternativa descartada

Dejar conteo ciego actual: se descarta porque incumple F9/F13.

## Pendientes

Sin pendientes de CAT-S1 a S11. El detalle por lote en la consulta del bot sigue en PRD-BOT-02.
