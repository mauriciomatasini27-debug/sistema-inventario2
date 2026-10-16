---
id: ADR-0075
tipo: adr
estado: aceptado
modulos: [fiscal, tenant]
depende_de: [ADR-0050, ADR-0051, ADR-0074, PRD-SEC-03]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0075 - Backfill real de `tenant_id` en `fiscal_documents` y `fiscal_settings`

Estado: aceptado (2026-10-14, evidencia: `tests/sec03-backfill-tenant-id.test.ts` 13/13 con Postgres local, commit `bf24de1`). Fecha: 2026-10-14. Fuentes: PRD `diseno/PRD-SEC-03-backfill-tenant-id.md`, ADR-0074 (Pendientes), ADR-0051, ADR-0050, `scripts/backfill-tenant-id.mjs`, `scripts/backfill-tenant-id-lib.mjs`, `drizzle/0015_fiscal_tenant_id.sql`, `drizzle/0016_fiscal_settings_tenant.sql`.

## Decisión

`planBackfill` devuelve una sentencia por tabla: `fiscal_documents` actualiza todas las filas con `tenant_id` nulo; `fiscal_settings` actualiza solo la fila nula más reciente (`created_at`, luego `id`) y solo si no existe ya una fila del tenant, para respetar el índice único. El script es seco por defecto (cuenta filas nulas si hay base, imprime sentencias, no escribe) y con `--apply` corre las dos sentencias en una transacción y reporta filas cambiadas por tabla. Se niega con más de un comercio en la base. Sin migración nueva.

## Qué cambia

- `--apply` ahora también completa `fiscal_settings`, así la configuración guardada antes de la migración 0016 vuelve a resolver el CUIT de emisión del comercio.
- El modo seco puede conectarse para contar (solo lectura); antes no conectaba nunca.
- Repetir `--apply` no cambia filas.

## Alternativa descartada

Un `UPDATE` de todas las filas nulas de `fiscal_settings`: viola el índice único con dos o más filas nulas o si el comercio ya guardó una fila. Borrar las filas nulas sobrantes: destructivo e innecesario, quedan sin leerse.

## Consecuencias

Filas nulas sobrantes de `fiscal_settings` quedan en la base sin uso; el script las informa. El backfill sigue dependiendo de confirmar que la base es de un solo comercio (`--comercios`).

## Pendientes

Extender a otras tablas cuando ganen `tenant_id` (PERS-S4/S5). Fan-out de jobs por tenant (P0.4).

## Evidencia de aceptación (2026-10-14)

- Commits: bf24de1. Sin migración nueva; tests y CLI corridos solo contra Postgres local (127.0.0.1:54329, bases A y B); no se tocó Supabase.
- `npm run evidencia` con `PG_TEST_URL_A/B` locales:
  - tsc: 0 errores
  - vitest: `Test Files  133 passed (133)`
  - vitest: `Tests  942 passed (942)`
  - build: `[build] Complete!`
  - sha: `bf24de1`
- `npm run check:arch`: `Test Files  11 passed (11)`, `Tests  22 passed (22)`; `tests/arch/baselines.json` sin cambios.
- Cambio de comportamiento: el modo seco se conecta para contar filas nulas si hay `TENANT_DATABASE_URL` (solo lectura); `--apply` también completa `fiscal_settings` e informa filas cambiadas por tabla.
