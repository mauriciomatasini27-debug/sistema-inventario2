---
id: ADR-0078
tipo: adr
estado: aceptado
modulos: [inventario, persistencia]
depende_de: [ADR-0024, ADR-0052, ADR-0062, PRD-PERS-03]
reemplaza: []
reemplazado_por: ""
resumen: |
  Las tablas del esquema que todavía no tenían migración se crean con Drizzle 0017 (incluido sector en
  stockcounts y unicidad case-insensitive de locations.nombre).
---
# ADR-0078 - Ubicaciones, fotos de producto y conteos DB-first

Estado: aceptado (2026-10-14, evidencia: `tests/pers3-ubicaciones-fotos-conteos.test.ts` con Postgres local, commit b998527). Fecha: 2026-10-14. Fuentes: PRD `diseno/PRD-PERS-03-ubicaciones-fotos-conteos-db.md`, ADR-0062 (Pendientes), ADR-0052, ADR-0024, `src/lib/repos/catalogo.ts`, `src/lib/repos/stock.ts`, `src/db/schema.ts` (`locations`, `product_photos`, `stock_counts`, `stock_count_lines`).

## Decisión

Las tablas del esquema que todavía no tenían migración se crean con Drizzle `0017` (incluido `sector` en `stock_counts` y unicidad case-insensitive de `locations.nombre`). Los repositorios de catálogo y stock pasan a DB-first vía `dbVivaTenant()` para ubicaciones, fotos al alta de producto y los tres flujos de conteo, con espejo memoria y 503 en multi sin base. El aislamiento entre comercios sigue siendo por base de tenant (sin `tenant_id` en estas tablas).

## Qué cambia

- Migración `drizzle/0017_locations_photos_counts.sql` + entrada en el journal.
- `src/db/schema.ts`: columna `sector` en `stockCounts` alineada a la migración.
- `src/lib/repos/catalogo.ts`: `listarUbicaciones` / `altaUbicacion` y escritura de `product_photos` en `altaProducto`.
- `src/lib/repos/stock.ts`: `crearConteo` / `confirmarConteo` / `conteoPorSector` leen y escriben `stock_counts` + `stock_count_lines`.
- Tests nuevos o ampliación de `tests/pers2-catalogo-stock.test.ts` (single sin DB + multi PG A/B).
- Si el trinquete `store.` (u otro) baja, se actualiza `tests/arch/baselines.json` al número nuevo.

## Alternativa descartada

Dejar las tablas solo en el esquema TypeScript hasta un cutover más grande (ARQ-S4): P1.1 pide integridad ya y las rutas ya existen. Meter `tenant_id` en cada fila: contradice el modelo de base-por-tenant de ADR-0052 y no aporta aislamiento extra en Postgres local A/B.

## Consecuencias

Reiniciar el proceso con base viva ya no pierde ubicaciones, fotos al alta ni conteos. Los ids de `conteoPorSector` pasan a UUID (antes `conteo-N` solo en memoria). El espejo en `store` sigue hasta ARQ-S4.

## Pendientes

Retiro del espejo memoria (P2.2 / ARQ-S4). API de listado/borrado de fotos. Backfill de datos que solo vivieron en memoria. Aplicar `0017` a bases reales con aprobación del dueño.

## Evidencia de aceptación (2026-10-14)

- Migración `drizzle/0017_locations_photos_counts.sql` aplicada solo a Postgres local (127.0.0.1:54329, bases A y B); no se tocó Supabase.
- `npm run evidencia` con `PG_TEST_URL_A/B` locales:
  - tsc: 0 errores
  - vitest: `Test Files  136 passed (136)`
  - vitest: `Tests  982 passed (982)`
  - build: `11:42:36 [build] Complete!`
  - sha: `b998527` (feat); aceptación en el mismo PR
- `npm run check:arch`: `Test Files  11 passed (11)`, `Tests  22 passed (22)`; baselines `storeRepos` 435→433, `esModoMulti` 151→146.
- Cambio de comportamiento: con base viva, ubicaciones/fotos al alta/conteos sobreviven reinicio; ids de `conteoPorSector` son UUID; keys de movimiento compensatorio `conteo:${id}:${sku}`.
