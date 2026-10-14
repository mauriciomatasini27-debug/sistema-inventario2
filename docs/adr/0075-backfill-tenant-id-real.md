# ADR-0075 - Backfill real de `tenant_id` en `fiscal_documents` y `fiscal_settings`

Estado: propuesto. Fecha: 2026-10-14. Fuentes: PRD `diseno/PRD-SEC-03-backfill-tenant-id.md`, ADR-0074 (Pendientes), ADR-0051, ADR-0050, `scripts/backfill-tenant-id.mjs`, `scripts/backfill-tenant-id-lib.mjs`, `drizzle/0015_fiscal_tenant_id.sql`, `drizzle/0016_fiscal_settings_tenant.sql`.

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
