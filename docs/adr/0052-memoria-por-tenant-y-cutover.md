# ADR-0052 - Memoria por tenant, sin fallback silencioso en multi y jobs con tenant

Estado: propuesto. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md`, ADR-0024, ADR-0051, `src/lib/store.ts`, `src/lib/server-db.ts`, `src/middleware.ts`.

## Decisión

`store` pasa a ser una partición por tenant resuelta con `tenantActual()` (ADR-0051); en multi fuera de contexto lanza. En multi la falta de base del tenant ya no cae a memoria: `server-db.ts` y los `dbViva()` locales propagan el error y la ruta responde 503. La memoria como fallback queda permitida solo en `single` (dev, tests y build). Los jobs con `X-Job-Secret` en multi necesitan `X-Tenant-Id` de un tenant existente y corren dentro de su contexto. Los tests de cutover usan un Postgres local del box.

## Por qué

Retirar `store.ts` de 110 rutas (PERS-S5) lleva varias iteraciones. Mientras tanto, particionar la memoria y prohibir el fallback silencioso en multi cierra el riesgo de mezcla entre comercios sin tocar cada ruta, y deja el cutover por dominio como trabajo incremental verificable.

## Qué cambia

`src/lib/store.ts` exporta `store` como vista de la partición del tenant actual; `server-db.ts` con modo estricto en multi; middleware de jobs con tenant; `scripts/pg-local.sh` y `tests/pers2-pg.test.ts` con `PG_TEST_URL`.

## Alternativa descartada

Esperar al cutover completo: deja abierta la mezcla en multi durante varias iteraciones. pglite embebido: el código usa el driver `postgres-js` y SQL crudo; un Postgres real local prueba lo mismo que producción.

## Pendientes

PERS-S4 por dominio y PERS-S5. Fan-out de jobs por tenant. Postgres del box no sobrevive a un reset (reinstalar con apt).
