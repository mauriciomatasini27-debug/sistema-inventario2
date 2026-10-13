# ADR-0051 - Tenant por request con AsyncLocalStorage para todo el plano de datos

Estado: aceptado (2026-10-13, evidencia: `tests/iso-plano-datos.test.ts`, `-2` y `-3` 21/21 con arch-tests AT3 y AT4, `npm test` 740/742 con solo los 2 de `caja-c11`, commit `bc2f48f`). Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-ISO-02-aislamiento-plano-datos.md`, ADR-0050, ADR-0002, `src/middleware.ts`, `src/lib/db.ts`, `src/lib/server-db.ts`, `src/lib/compras-db.ts`.

## Decisión

El middleware resuelve el tenant una vez por request para las rutas de datos (`tenantDeRequest`, ADR-0050) y ejecuta la ruta dentro de un `AsyncLocalStorage`. `getTenantDb()` sin argumento toma el tenant de ese contexto. En `TENANT_MODE=multi`, una ruta de datos sin tenant responde 403 antes de tocar memoria o base, y `getTenantDb()` fuera de contexto lanza. En `single` no cambia nada.

## Por qué

Hay más de 40 llamadas a `getTenantDb`, `dbViva`, `intentarLeer` e `intentarPersistir`; pasar el tenant a mano en cada una es fácil de olvidar y difícil de auditar. Un único punto de resolución más un arch-test que verifica que toda ruta con acceso a base cae bajo el middleware cubre las rutas nuevas sin depender de memoria humana. El adaptador `@astrojs/node` corre en Node, donde `AsyncLocalStorage` es estable.

## Qué cambia

`conTenant` y `tenantActual` en `src/lib/tenant-mode.ts`; lista de prefijos de datos y corte 403 en `src/middleware.ts`; `getTenantDb` lee el contexto; `wizard.ts` y `delegacion-confirmada.ts` usan el tenant del contexto; `asegurarFiscalDoc` rechaza docs sin dueño en multi; `scripts/backfill-tenant-id.mjs` en seco.

## Alternativa descartada

Pasar `tenantId` explícito en cada llamada: más visible pero obliga a tocar más de 40 sitios y no protege rutas futuras. `tenant_id` en todas las tablas: contradice ADR-0002 (base por comercio) y exige migrar todo el plano de datos.

## Pendientes

Memoria de `store.ts` por tenant o cutover total a DB (PERS-S4/S5). Backfill real solo tras confirmar que cada base tiene un solo comercio.
