---
item: SYNC-S5
estado: hecho
adr: ADR-0023
prd: PRD-SYNC-01
fecha: 2026-10-16
---
SYNC-S5/S6 hecho: grants y registro de devices DB-first en la base del tenant (offline_grants/device_sync_state con espejo en memoria, 503 en multi sin base), register idempotente con grant inicial en la misma tx y revocación legible tras reinicio, con tests/sync-s5-s6-durable.test.ts 7/7 (incluye PG A/B); pendientes sin migración: rol/permisos y registrado_por/en/nombre siguen en JWT/memoria.
