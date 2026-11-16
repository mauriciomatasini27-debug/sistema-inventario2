---
id: ADR-0080
tipo: adr
estado: aceptado
modulos: [fiado, offline, persistencia, ventas]
depende_de: [ADR-0024, ADR-0052, ADR-0061, ADR-0063, ADR-0066, PRD-PERS-05]
reemplaza: []
reemplazado_por: ""
modifica: [ADR-0066]
resumen: |
  Los correlativos internos con base viva salen de ticketcounters, una fila por serie con lock FOR UPDATE dentro
  de la transacción que escribe la fila numerada: mostrador para T- (ventas, promote y venta a cuenta) y
  devolucion para D-. La migración Drizzle 0019 siembra devolucion con el máximo D- existente en salereturns.
---
# ADR-0080 - Correlativos de devoluciones y tickets DB-first

Estado: aceptado (2026-10-14, evidencia: `tests/pers5-correlativos.test.ts` con Postgres local). Fecha: 2026-10-14. Fuentes: PRD `diseno/PRD-PERS-05-correlativos-db.md`, ADR-0063 (Pendientes), ADR-0061, ADR-0066, ADR-0052, ADR-0024, `src/lib/repos/ventas.ts`, `src/lib/repos/sync.ts`, `src/lib/repos/fiado.ts`, `src/modules/sales/registro_venta.ts`.

## Decisión

Los correlativos internos con base viva salen de `ticket_counters`, una fila por serie con lock `FOR UPDATE` dentro de la transacción que escribe la fila numerada: `mostrador` para `T-*` (ventas, `promote` y venta a cuenta) y `devolucion` para `D-*`. La migración Drizzle `0019` siembra `devolucion` con el máximo `D-*` existente en `sale_returns`. La memoria (`store.nextTicket`, `store.nextReturn`) queda como fuente solo en single sin base y como espejo alineado con `max(actual, n + 1)`. En multi sin base, 503 como el resto del cutover.

## Qué cambia

- Migración `drizzle/0019_return_counter.sql` + entrada en el journal; constante de serie en `src/db/schema.ts`.
- `src/lib/repos/ventas.ts`: `registrarDevolucion` numera, verifica la clave e inserta en una sola transacción; se borra el recorrido completo de `sale_returns` del camino DB.
- `src/lib/repos/fiado.ts`: `ventaACuenta` con base viva numera con `ticket_counters` (`mostrador`) en la transacción del INSERT de `customer_movements`.
- `src/modules/sales/registro_venta.ts`: el espejo se alinea al número del ticket en vez de sumar 1. `src/lib/repos/sync.ts` ya alineaba tras la tx (ADR-0066) y queda sin cambios.
- Tests nuevos (`tests/pers5-correlativos.test.ts`) single sin DB + multi PG A/B.
- Si el trinquete `store.` (u otro) baja, se actualiza `tests/arch/baselines.json` al número nuevo.

## Alternativa descartada

Tabla nueva `return_counters`: duplica una tabla que ya existe en cada base con la misma forma (`id`, `ultimo`) y el mismo lock. Secuencia Postgres (`CREATE SEQUENCE`): deja huecos cuando la transacción revierte y el correlativo interno se pidió sin huecos (ADR-0024). Seguir con `MAX(numero_devolucion)` y reintentar ante el choque único: sigue recorriendo la tabla y hoy confunde el choque con una clave repetida.

## Consecuencias

Devoluciones concurrentes dejan de devolver 409 falsos y el número no depende del proceso. La venta a cuenta con base viva deja de repetir `T-*` ya dados por ventas o `promote`: el número que devuelve cambia de valor (sigue el contador de la base), no de forma. El espejo en `store` sigue hasta ARQ-S4.

## Pendientes

Retiro del espejo memoria (P2.2 / ARQ-S4). Stock, caja y documento fiscal de la devolución fuera de la transacción del número. Aplicar `0019` a bases reales con aprobación del dueño. Actualización 2026-11-15: el ticket de la venta a cuenta ya se persiste en `tickets` (`fiado.ts:308-314`, P10-2), así que la limitación "sin tabla propia" quedó resuelta. Actualización 2026-11-16: P10-17 cierra el fallback de `promote` en `sync.ts:690-727`; con base viva, un fallo de tx se propaga y la ruta responde 503, nunca 201 con un `T-*` de memoria.

## Evidencia de aceptación (2026-10-14)

- Migración `drizzle/0019_return_counter.sql` aplicada solo a Postgres local (127.0.0.1:54329, bases A y B); no se tocó Supabase.
- Verificación local con `PG_TEST_URL_A/B`:
  - `npm run typecheck`: 0 errores
  - `npm run check:arch`: `Test Files  11 passed (11)`, `Tests  22 passed (22)`; baselines `storeRepos` 431→430, `esModoMulti` 146→145, `comentariosNoExiste` 8→7
  - `npm test`: `Test Files  138 passed (138)`, `Tests  994 passed (994)` (0 salteados, dos corridas)
  - `npm run build`: `12:38:34 [build] Complete!`
- TDD: antes del cambio, 5 devoluciones concurrentes en A daban `[201,503,503,503,201]` y el contador `mostrador` quedaba atrás del último `T-*` de la venta a cuenta; después, 5×201 con números distintos y `T-*` crecientes.
- Tests ajustados: `tests/pers2-ventas.test.ts` y `tests/sec01-dueno-correlativo.test.ts` pasan de números absolutos (`D-000001`, `T-000001`) a formato y orden, y `sec01` deja de resetear `mostrador` a 0 (rompía la monotonía de otros archivos en paralelo).
- Cambio de comportamiento: con base viva, `D-*` y `T-*` de venta a cuenta salen del contador de la base; en multi sin base, 503; single sin base igual que hoy. Sin cambio de shape HTTP, status codes ni formato de números.
