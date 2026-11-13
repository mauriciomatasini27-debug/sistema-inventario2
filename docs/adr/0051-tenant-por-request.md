---
id: ADR-0051
tipo: adr
estado: aceptado
modulos: [compras, persistencia, tenant]
depende_de: [ADR-0002, ADR-0050, PRD-ISO-02]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: [ADR-0116]
resumen: |
  El middleware resuelve el tenant una vez por request para las rutas de datos (tenantDeRequest, ADR-0050) y
  ejecuta la ruta dentro de un AsyncLocalStorage. getTenantDb() sin argumento toma el tenant de ese contexto.
---
# ADR-0051 - Tenant por request con AsyncLocalStorage para todo el plano de datos

Estado: aceptado (2026-10-13, evidencia: `tests/iso-plano-datos.test.ts`, `-2` y `-3` 21/21 con arch-tests AT3 y AT4, `npm test` 740/742 con solo los 2 de `caja-c11`, commit `bc2f48f`). Fecha: 2026-10-13. Modificado por ADR-0116 (2026-11-13). Fuentes: PRD `diseno/PRD-ISO-02-aislamiento-plano-datos.md`, ADR-0050, ADR-0002, ADR-0116, `src/middleware.ts`, `src/lib/db.ts`, `src/lib/server-db.ts`, `src/lib/compras-db.ts`.

## Decisión

El middleware resuelve el tenant una vez por request para las rutas de datos (`tenantDeRequest`, ADR-0050) y ejecuta la ruta dentro de un `AsyncLocalStorage`. `getTenantDb()` sin argumento toma el tenant de ese contexto. En `TENANT_MODE=multi`, una ruta de datos sin tenant responde 403 antes de tocar memoria o base, y `getTenantDb()` fuera de contexto lanza. En `single` no cambia nada.

En `TENANT_MODE=shared` (ADR-0116) el middleware exige sesión y membership como en multi, pero `getTenantDb()` abre la URL compartida y el aislamiento lo dan las filas con `tenant_id`.

## Por qué

Hay más de 40 llamadas a `getTenantDb`, `dbViva`, `intentarLeer` e `intentarPersistir`; pasar el tenant a mano en cada una es fácil de olvidar y difícil de auditar. Un único punto de resolución más un arch-test que verifica que toda ruta con acceso a base cae bajo el middleware cubre las rutas nuevas sin depender de memoria humana. El adaptador `@astrojs/node` corre en Node, donde `AsyncLocalStorage` es estable.

## Qué cambia

`conTenant` y `tenantActual` en `src/lib/tenant-mode.ts`; lista de prefijos de datos y corte 403 en `src/middleware.ts`; `getTenantDb` lee el contexto; `wizard.ts` y `delegacion-confirmada.ts` usan el tenant del contexto; `asegurarFiscalDoc` rechaza docs sin dueño en multi; `scripts/backfill-tenant-id.mjs` en seco.

## Alternativa descartada

Pasar `tenantId` explícito en cada llamada: más visible pero obliga a tocar más de 40 sitios y no protege rutas futuras.

## Alternativa elegida después (ADR-0116)

`tenant_id` en las tablas de negocio con `TENANT_MODE=shared` y una Postgres compartida. Deja de estar descartada. El aislamiento por base por comercio (`multi` / ADR-0003 original) sigue disponible en código hasta un subtract, pero el piloto Free usa filas con dueño.

## Pendientes

Memoria de `store.ts` por tenant o cutover total a DB (PERS-S4/S5). Backfill bajo shared. Política por tabla/tenant (ya no «una base = un comercio»).
