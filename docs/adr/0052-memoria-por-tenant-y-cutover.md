---
id: ADR-0052
tipo: adr
estado: aceptado
modulos: [persistencia, tenant]
depende_de: [ADR-0024, ADR-0051, ADR-0077, PRD-PERS-02, PRD-SEC-04]
reemplaza: []
reemplazado_por: ""
resumen: |
  store pasa a ser una partición por tenant resuelta con tenantActual() (ADR-0051); en multi fuera de contexto
  lanza. En multi la falta de base del tenant ya no cae a memoria: server-db.ts y los dbViva() locales propagan
  el error y la ruta responde 503. La memoria como fallback queda permitida solo en single (dev, tests y build).
---
# ADR-0052 - Memoria por tenant, sin fallback silencioso en multi y jobs con tenant

Estado: aceptado (2026-10-13, evidencia: `tests/pers2-memoria.test.ts`, `pers2-jobs`, `pers2-arch` y `pers2-pg` contra Postgres local 17/17, `npm test` 756/759 con solo los 2 de `caja-c11` y 1 salteado sin `PG_TEST_URL`, commit `2b926a1`). Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md`, ADR-0024, ADR-0051, `src/lib/store.ts`, `src/lib/server-db.ts`, `src/middleware.ts`.

## Decisión

`store` pasa a ser una partición por tenant resuelta con `tenantActual()` (ADR-0051); en multi fuera de contexto lanza. En multi la falta de base del tenant ya no cae a memoria: `server-db.ts` y los `dbViva()` locales propagan el error y la ruta responde 503. La memoria como fallback queda permitida solo en `single` (dev, tests y build). Los jobs con `X-Job-Secret` en multi necesitan `X-Tenant-Id` de un tenant existente y corren dentro de su contexto. Los tests de cutover usan un Postgres local del box.

## Por qué

Retirar `store.ts` de 110 rutas (PERS-S5) lleva varias iteraciones. Mientras tanto, particionar la memoria y prohibir el fallback silencioso en multi cierra el riesgo de mezcla entre comercios sin tocar cada ruta, y deja el cutover por dominio como trabajo incremental verificable.

## Qué cambia

`src/lib/store.ts` exporta `store` como vista de la partición del tenant actual; `server-db.ts` con modo estricto en multi; middleware de jobs con tenant; `scripts/pg-local.sh` y `tests/pers2-pg.test.ts` con `PG_TEST_URL`.

## Alternativa descartada

Esperar al cutover completo: deja abierta la mezcla en multi durante varias iteraciones. pglite embebido: el código usa el driver `postgres-js` y SQL crudo; un Postgres real local prueba lo mismo que producción.

## Pendientes

Excepción vigente: `leerFiscalDocs` en multi sin base del tenant devuelve `null` y las rutas fiscales leen memoria; esa memoria ya está particionada por tenant (sin mezcla) pero no es durable, hasta el cutover fiscal de PERS-S4. 
PERS-S4 por dominio y PERS-S5. Fan-out de jobs por tenant: ADR-0077 (PRD-SEC-04). Postgres del box no sobrevive a un reset (reinstalar con apt).
