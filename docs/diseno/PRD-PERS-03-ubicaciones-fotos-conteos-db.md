---
id: PRD-PERS-03
tipo: prd
estado: hecho
modulos: [inventario, persistencia]
depende_de: [ADR-0024, ADR-0052, ADR-0062, ADR-0078]
reemplaza: []
reemplazado_por: ""
resumen: |
  Las tablas locations, productphotos, stockcounts y stockcountlines están en el esquema Drizzle
  (src/db/schema.ts) pero no existen en las migraciones aplicadas ni se usan en runtime.
---
# PRD-PERS-03 - Ubicaciones, fotos de producto y conteos DB-first

Fuente: pendientes de ADR-0062 ("ubicaciones, fotos de producto y conteos siguen en la memoria... aunque existen las tablas `locations`, `product_photos` y `stock_counts`/`stock_count_lines`"); `docs/ROADMAP.md`, Pendientes priorizados P1.1. Uso en este sistema: catálogo y stock de cualquier comercio. Restringido por ADR-0078, ADR-0062, ADR-0052 y ADR-0024. Tipo persistencia.

## Problema

Las tablas `locations`, `product_photos`, `stock_counts` y `stock_count_lines` están en el esquema Drizzle (`src/db/schema.ts`) pero no existen en las migraciones aplicadas ni se usan en runtime. `listarUbicaciones` / `altaUbicacion` (`src/lib/repos/catalogo.ts`), las fotos de `altaProducto` y `crearConteo` / `confirmarConteo` / `conteoPorSector` (`src/lib/repos/stock.ts`) leen y escriben solo los mapas particionados `store.ubicaciones`, `store.fotosProducto`, `store.conteos` y `store.conteoVistos`. En multi con base viva un reinicio pierde esas filas; en single sin base el comportamiento actual (memoria) se conserva.

## Épica PERS3-E1. Tablas reales y repositorios DB-first

Requisito PERS3-R1: con base viva del tenant, ubicaciones, fotos de producto al alta y conteos (crear / confirmar / por sector) se persisten en Postgres del tenant; en single sin base siguen en memoria; en multi sin base propagan `BaseNoDisponible` (503).

- Historia PERS3-S1. Migración Drizzle nueva que crea `locations`, `product_photos`, `stock_counts` (con `sector`) y `stock_count_lines`, con índice único case-insensitive sobre `locations.nombre`. AC: Given Postgres local When corro la migración Then las cuatro tablas existen en A y B; Given el journal Then el siguiente número queda registrado. ADR: 0078. Talla S. Depende de: nada.
- Historia PERS3-S2. `altaUbicacion` / `listarUbicaciones` DB-first con espejo memoria. AC: Given multi con base de A When doy de alta "Deposito" Then queda en `locations` de A y B no la ve; Given el mismo nombre en otra capitalización Then 409; Given single sin base Then se comporta como hoy. ADR: 0078. Talla S. Depende de: PERS3-S1.
- Historia PERS3-S3. `altaProducto` con `foto` inserta en `product_photos` cuando hay base viva, además del espejo memoria. AC: Given multi con base de A When doy de alta un producto con foto Then hay fila en `product_photos` de A con ese `sku` y B no la ve; Given single sin base Then solo memoria como hoy. ADR: 0078. Talla S. Depende de: PERS3-S1.
- Historia PERS3-S4. `crearConteo`, `confirmarConteo` y `conteoPorSector` DB-first: cabecera + líneas en `stock_counts` / `stock_count_lines`, idempotencia por `idem_key`, confirmación de dueño aplica movimientos compensatorios como hoy. AC: Given multi con base de A When creo y confirmo un conteo Then quedan filas en A y el stock de A se ajusta; B no ve el conteo; Given la misma `Idempotency-Key` Then 409; Given single sin base Then se comporta como hoy. ADR: 0078. Talla M. Depende de: PERS3-S1.

## Fuera de alcance

Retiro total de los mapas de `store` (queda espejo; ARQ-S4 / P2.2). API dedicada de listado/borrado de fotos. Backfill de datos ya escritos solo en memoria. Aplicar la migración a bases reales / Supabase (solo Postgres local de tests). OCR definitivo, legal/fiscal, servicios pagos.

## Dependencias externas

Ninguna. Sin servicios nuevos ni Supabase.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Ubicación en PG | Alta en tenant-a | Fila en `locations` de A; B no la ve |
| Feliz | Foto al alta | Producto con foto en A | Fila en `product_photos` de A |
| Feliz | Conteo + confirm | Crear y confirmar dueño en A | Filas en counts/lines; stock ajustado en A |
| Fallo | Nombre duplicado | Misma ubicación otra capitalización | 409 |
| Fallo | Idempotencia | Misma key de conteo | 409 |
| Regresión | Single sin DB | Sin `TENANT_DATABASE_URL` | Memoria como hoy |
| Arch | Trinquetes | `store.` / `esModoMulti` / `as never` | No suben; si bajan, bajar baseline |
