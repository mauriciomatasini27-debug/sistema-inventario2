---
id: ADR-0050
tipo: adr
estado: aceptado
modulos: [fiscal, persistencia, tenant]
depende_de: [ADR-0002, ADR-0003, ADR-0048, ADR-0049, PRD-ISO-01]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0050 - Aislamiento fiscal por tenant: contexto en servidor, `tenant_id` y fail-closed

Estado: aceptado (2026-10-13, evidencia: `tests/iso-fiscal-tenant.test.ts` 7/7, commit `dfdc3de`). Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-ISO-01-aislamiento-fiscal-tenant.md`, `src/lib/db.ts:42-46`, `src/lib/fiscal-db.ts:194-199`, `src/middleware.ts:18-24`, ADR-0002, ADR-0003, ADR-0048, Ley 25.326.

## Decisión

Los datos fiscales se aíslan en dos capas. Primero, el servidor resuelve el tenant de cada request fiscal (`tenantDeRequest`) desde la sesión y la membership; el cliente solo puede elegir entre sus memberships con `X-Tenant-Id`. Segundo, `fiscal_documents` guarda `tenant_id` y toda lectura filtra por él, en DB y en memoria. Un modo `TENANT_MODE` (`single` por defecto, `multi` para producción) decide si falta de contexto es un tenant por defecto o un 403, y en `multi` `getTenantDb()` sin tenant falla en vez de usar la base compartida.

## Por qué

Hoy el aislamiento depende solo de "una base por cliente" (ADR-0002), pero ningún caller pasa el tenant y con ADR-0048 hay una sola base para todos. Un filtro por `tenant_id` protege aunque las bases sigan compartidas, y el fail-closed evita que un tenant sin base propia caiga en la de otro. El modo `single` mantiene dev/demo y la suite actual sin cambios.

## Qué cambia

`src/lib/tenant-context.ts` nuevo; `getTenantDb` respeta `TENANT_MODE`; migración `0015` con `fiscal_documents.tenant_id`; `leerFiscalDocs(tenantId)`; rutas `documents`, `history` y `export` filtran por el tenant del contexto.

## Alternativa descartada

Solo separar bases por tenant (ADR-0002 puro): correcto en producción pero hoy no existe y depende de aprovisionamiento real; deja la fuga abierta mientras tanto. Row Level Security de Postgres: descartada por ahora porque el acceso es por connection string directa sin rol por tenant (ADR-0048, ADR-0049).

## Pendientes

Extender el mismo patrón a ventas, caja, fiado, compras, precios, sync y tickets. Sacar `tenant_id` del body en `wizard.ts`. Backfill de `tenant_id` en filas previas.
