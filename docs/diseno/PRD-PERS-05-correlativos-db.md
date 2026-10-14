# PRD-PERS-05 - Correlativos de devoluciones y tickets DB-first

Fuente: pendientes de ADR-0063 ("`nextReturn` no tiene tabla: el correlativo vive en memoria del repo") y ADR-0061 / ADR-0066 (correlativo `T-*` de `promote`); `docs/ROADMAP.md`, Pendientes priorizados P1.3. Uso en este sistema: numeración interna `D-*` de devoluciones y `T-*` de tickets de mostrador de cualquier comercio. Restringido por ADR-0080, ADR-0066, ADR-0063, ADR-0061, ADR-0052 y ADR-0024. Tipo persistencia. No toca numeración fiscal (`fiscal_sequences`, ARCA).

## Problema

Devoluciones: `src/lib/repos/ventas.ts` calcula el próximo `D-*` con `ultimoNumeroDevolucion`, que mezcla `store.nextReturn` con un `SELECT` de todos los `sale_returns` fuera de transacción. Dos devoluciones concurrentes en la misma base leen el mismo máximo, la segunda choca con `sale_returns_numero_devolucion_unique` y el catch la responde como 409 "idempotency-key repetida" con una clave que nunca se usó. Además cada devolución recorre la tabla entera.

Tickets `T-*`: ventas (`src/modules/sales/registro_venta.ts`) y `promote` (`src/lib/repos/sync.ts`) ya numeran con `ticket_counters` (`mostrador`, `FOR UPDATE`) en DB desde ADR-0066. Quedan dos huecos en el espejo: la venta a cuenta (`ventaACuenta` en `src/lib/repos/fiado.ts`) numera con `store.nextTicket` aunque haya base viva, así que repite números que ya dio la base; y el espejo de la venta DB hace `store.nextTicket += 1` en vez de alinearse al número de la base, así que tras un reinicio el contador en memoria queda atrás del de la base.

## Épica PERS5-E1. Correlativos en la base del tenant

Requisito PERS5-R1: con base viva del tenant, los números `D-*` y `T-*` salen de `ticket_counters` con lock `FOR UPDATE` en la misma transacción que escribe la fila que los usa; en single sin base siguen en memoria (`store.nextReturn`, `store.nextTicket`) como hoy; en multi sin base propagan `BaseNoDisponible` (503). Sin cambio de shape HTTP ni de formato de números (`D-000001`, `T-000001`).

- Historia PERS5-S1. Migración Drizzle `0019` que siembra la fila `devolucion` en `ticket_counters` con el máximo `D-*` existente en `sale_returns` (idempotente, `ON CONFLICT DO NOTHING`) y la entrada del journal; constante del id de serie en `src/db/schema.ts`. AC: Given Postgres local When corro la migración Then `ticket_counters` tiene la fila `devolucion` en A y B con `ultimo` igual al máximo `D-*` previo (0 si no hay); Given el journal Then el índice 0019 queda registrado. ADR: 0080. Talla S. Depende de: nada.
- Historia PERS5-S2. `registrarDevolucion` DB-first numera dentro de una transacción: lock `FOR UPDATE` de `ticket_counters` (`devolucion`, creada desde `MAX(sale_returns)` si falta), relectura de la clave (409 con el original), INSERT en `sale_returns` y UPDATE del contador; se elimina el recorrido completo de `sale_returns`. Espejo `store.nextReturn = max(actual, n + 1)`. AC: Given multi con base de A When registro N devoluciones concurrentes con claves distintas Then todas dan 201 con números `D-*` distintos y sin 409 falsos, y el contador de A avanza N; B no se mueve; Given la misma clave Then 409 con el número original; Given `resetStore` (reinicio) Then la siguiente devolución en A continúa el correlativo de la base; Given single sin base Then `D-000001`, `D-000002` como hoy. ADR: 0080. Talla S. Depende de: PERS5-S1.
- Historia PERS5-S3. Venta a cuenta con base viva numera con `ticket_counters` (`mostrador`) en la misma transacción que el INSERT de `customer_movements`; el espejo de ventas DB, `promote` y fiado se alinea con `store.nextTicket = max(actual, n + 1)`. AC: Given multi con base de A When intercalo venta, promote y venta a cuenta Then los tres `T-*` son distintos y crecientes y el contador `mostrador` de A queda en el último; Given `resetStore` (reinicio) Then la venta a cuenta siguiente no repite un número dado por la base; Given single sin base Then el contador en memoria compartido como hoy. ADR: 0080. Talla S. Depende de: nada.

## Fuera de alcance

Numeración fiscal (`fiscal_sequences`, CAE, ARCA). Retiro total del espejo en `store` (ARQ-S4 / P2.2). Guardar el ticket de la venta a cuenta en una tabla propia. Meter stock, caja y documento fiscal de la devolución en la misma transacción del número. Aplicar la migración a bases reales / Supabase (solo Postgres local de tests). Catálogo del delta de `GET /api/sync/pull` (P1.4).

## Dependencias externas

Ninguna. Sin servicios nuevos ni Supabase.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Devolución en PG | POST `/api/returns` en tenant-a | Fila en `sale_returns` de A con `D-*` del contador `devolucion` de A; B no se mueve |
| Fallo | Concurrencia | N devoluciones simultáneas, claves distintas | N × 201, números distintos, sin 409 |
| Fallo | Idempotencia | Misma clave | 409 con el número original |
| Feliz | Reinicio | `resetStore` y nueva devolución / venta a cuenta | Continúa el correlativo de la base |
| Feliz | `T-*` unificado | Venta + promote + venta a cuenta en A | Números distintos y crecientes, contador `mostrador` en el último |
| Regresión | Single sin DB | Sin `TENANT_DATABASE_URL` | Memoria como hoy (`tests/ticket-devoluciones.test.ts`, `tests/fiado.test.ts`, `tests/sec01-dueno-correlativo.test.ts`) |
| Arch | Trinquetes | `store.` / `esModoMulti` / `as never` | No suben; si `store.` baja, bajar baseline |
