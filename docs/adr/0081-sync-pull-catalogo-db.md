# ADR-0081 - Catálogo del delta de sync/pull DB-first

Estado: aceptado (2026-10-14, evidencia: `tests/pers6-sync-pull-catalogo.test.ts` con Postgres local). Fecha: 2026-10-14. Fuentes: PRD `diseno/PRD-PERS-06-sync-pull-catalogo-db.md`, ADR-0061 (Pendientes), ADR-0052, ADR-0024, `src/lib/repos/sync.ts`, `src/db/schema.ts` (`products`).

## Decisión

Con base viva del tenant, el `catalogo` de `GET /api/sync/pull` se arma con un SELECT a `products` (`sku`, `stock_actual`, `precio_centavos`) dentro de `leerLote`. La memoria (`store.stock`, `store.prices`) queda como fuente solo en single sin base y en el fallback single ante error de DB. En multi sin base, 503 como el resto del cutover. No hay migración nueva: las columnas ya existen desde el esquema inicial.

## Qué cambia

- `src/lib/repos/sync.ts`: `catalogoDesdeDb(db)` y uso en el camino DB de `leerLote`; `catalogoMemoria()` solo en memoria/fallback.
- Comentarios de la ruta `src/pages/api/sync/pull.ts` alineados al corte.
- Tests nuevos o ampliación de `tests/pers2-sync.test.ts` / `tests/pers6-sync-pull-catalogo.test.ts` (single sin DB + multi PG A/B con reinicio).
- Si el trinquete `store.` (u otro) baja, se actualiza `tests/arch/baselines.json` al número nuevo.

## Alternativa descartada

Seguir con el espejo hasta ARQ-S4: el dispositivo offline ve catálogo vacío tras reinicio aunque el outbox ya es durable. Leer stock/precios por los repos de dominio (`nivelStock`, listados): hoy `nivelStock` sigue en memoria y forzaría un cutover más grande; un SELECT directo a `products` cierra el pendiente de ADR-0061 sin tocar esos repos. Ampliar el shape del catálogo a PRD-SYNC-01 completo: fuera de P1.4 (talla mayor).

## Consecuencias

Tras reinicio con base viva, el pull devuelve stock y precios del comercio. El valor de `catalogo` puede diferir del espejo si la memoria quedó atrás (p.ej. tras `resetStore`); la forma no cambia. El espejo en `store` sigue hasta ARQ-S4.

## Pendientes

Retiro del espejo memoria (P2.2 / ARQ-S4). Catálogo completo de PRD-SYNC-01 (códigos, lotes, etc.). Aplicar ajustes de `price_adjustments` al precio del pull si el dueño lo pide.

## Evidencia de aceptación (2026-10-14)

- Sin migración nueva: `products.stock_actual` y `products.precio_centavos` ya existen.
- Verificación local con `PG_TEST_URL_A/B`:
  - `npm run typecheck`: 0 errores
  - `npm run check:arch`: `Test Files  11 passed (11)`, `Tests  22 passed (22)`; baselines sin cambio (`storeRepos` 430, `esModoMulti` 145)
  - `npm test`: `Test Files  139 passed (139)`, `Tests  997 passed (997)` (0 salteados, dos corridas)
  - `npm run build`: `12:55:18 [build] Complete!`
- TDD: antes del cambio, pull multi devolvía `catalogo.prices[sku]` undefined (espejo memoria); después, precio y stock de A desde la base y ausentes en B; tras `resetStore` el catálogo de A sigue.
- Cambio de comportamiento: con base viva, `GET /api/sync/pull` arma `catalogo` desde `products` del tenant; en multi sin base, 503; single sin base igual que hoy. Sin cambio de shape HTTP ni status codes.
