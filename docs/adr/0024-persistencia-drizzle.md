# ADR-0024 - Persistencia Drizzle real tras store en memoria

Estado: aceptado (2026-10-12, evidencia: `src/lib/control-db.ts`). Fecha: 2026-10-11. Fuentes: auditoría `src/lib/store.ts` (~100 imports en `src/pages/api`), `src/pages/api/sync/promote.ts`, `src/db/*.ts` (86 tablas).

## Decisión

Migrar Slice-0 primero (`sales`, `cash/movements`, `balance`, `outbox`, `id_mappings`) a Drizzle/Postgres en 1 tx con `idempotency_key` único; luego resto por dominio; retirar `store` salvo tests. PRD: `diseno/PRD-PERS-01-persistencia-drizzle.md`.

## Por qué

Hoy restart pierde ventas/tickets/outbox y multi-instancia diverge. Las 86 tablas ya existen como schema sin uso.

## Qué cambia

`POST /api/sales` y `POST /api/cash/movements` leen/escriben DB; `GET /api/cash/balance` deriva Σlíneas; grep `from .*store` en `api` → 0.

## Alternativa descartada

Declarar memoria como decisión: se descarta salvo ADR explícito con pérdida aceptada (no es el caso MVP).

## Pendientes

PERS-S1→S5 + verde `tests/slice0*.test.ts`, `sync-e2e`, `offline-outbox`.
