---
id: PRD-PERS-06
tipo: prd
estado: propuesto
modulos: [inventario, offline, persistencia]
depende_de: [ADR-0024, ADR-0052, ADR-0061, ADR-0081, PRD-SYNC-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  GET /api/sync/pull ya arma el lote (outbox + mappings) desde Postgres del tenant cuando hay base viva
  (leerLote en src/lib/repos/sync.ts, ADR-0061 / PERS2-S22). El campo catalogo del delta, en cambio, sigue
  saliendo de catalogoMemoria() (store.stock y store.prices).
---
# PRD-PERS-06 - Catálogo del delta de sync/pull DB-first

Fuente: pendiente de ADR-0061 ("el catálogo del delta de `pull` (stock y precios) sigue saliendo del espejo en memoria"); `docs/ROADMAP.md`, Pendientes priorizados P1.4. Uso en este sistema: sincronización offline de cualquier comercio. Restringido por ADR-0081, ADR-0061, ADR-0052 y ADR-0024. Tipo persistencia. No amplía el shape del catálogo (sigue `{ stock, prices }` por SKU).

## Problema

`GET /api/sync/pull` ya arma el lote (outbox + mappings) desde Postgres del tenant cuando hay base viva (`leerLote` en `src/lib/repos/sync.ts`, ADR-0061 / PERS2-S22). El campo `catalogo` del delta, en cambio, sigue saliendo de `catalogoMemoria()` (`store.stock` y `store.prices`). Tras un reinicio del proceso con base viva el pull devolve outbox durable pero stock/precios del espejo vacío o desfasado: el dispositivo offline no ve el catálogo real del comercio. Las tablas ya existen: `products.stock_actual` y `products.precio_centavos` son la fuente de verdad que escriben `aplicarMovimiento`, `altaProducto` y el parche de productos.

## Épica PERS6-E1. Catálogo del pull desde la base del tenant

Requisito PERS6-R1: con base viva del tenant, el `catalogo` de `GET /api/sync/pull` sale de `products` (`sku` → `stock_actual`, `sku` → `precio_centavos` en número); en single sin base sigue en memoria como hoy; en multi sin base propaga `BaseNoDisponible` (503, ya cubierto por `leerLote`). Sin cambio de shape HTTP (`catalogo.stock` / `catalogo.prices` como `Record<string, number>`), status codes ni paginado.

- Historia PERS6-S1. `leerLote` con base viva lee el catálogo desde `products` (SELECT de `sku`, `stock_actual`, `precio_centavos`); `catalogoMemoria()` queda solo para el camino sin base / fallback single. AC: Given multi con base de A When doy de alta un producto en A con precio y movimiento de stock y hago pull Then `catalogo.prices` y `catalogo.stock` del pull de A reflejan esos valores y el de B no los ve; Given `resetStore` (reinicio) Then el pull de A sigue mostrando el catálogo de la base; Given single sin base Then el catálogo sale de memoria como hoy (p.ej. `demo-sku-1`). ADR: 0081. Talla S. Depende de: nada.

## Fuera de alcance

Ampliar el catálogo al shape completo de PRD-SYNC-01 (códigos, lotes, medios, jornada, permisos, clientes fiado, turnos, promos). Retiro total del espejo en `store` (ARQ-S4 / P2.2). Aplicar precios de `price_adjustments` sobre el catálogo del pull (el precio vigente del producto sigue siendo `products.precio_centavos`). Migración nueva (no hace falta: las columnas ya existen). Aplicar nada a bases reales / Supabase.

## Dependencias externas

Ninguna. Sin servicios nuevos ni Supabase.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Pull con producto en PG | Alta producto + movimiento stock en A, GET pull | `catalogo.prices[sku]` y `catalogo.stock[sku]` de A coinciden con la base; B no los ve |
| Feliz | Reinicio | `resetStore` y pull en A | Catálogo sigue el de la base (no el espejo vacío) |
| Regresión | Single sin DB | Sin `TENANT_DATABASE_URL` | Catálogo desde memoria como hoy (`tests/pers2-sync.test.ts`) |
| Arch | Trinquetes | `store.` / `esModoMulti` / `as never` | No suben; si `store.` baja, bajar baseline |
