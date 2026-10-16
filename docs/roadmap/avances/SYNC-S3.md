---
item: SYNC-S3
estado: hecho
adr: ADR-0023
prd: PRD-SYNC-01
fecha: 2026-10-16
---
SYNC-S3/S4 hecho: heartbeat DB-first (`leerLatidoPrevioDuro` + upsert que limpia avisos) y job `ejecutarAvisoSyncDuro` que reclama 24/60/72h con un UPDATE condicional por banda con RETURNING (una sola marca ante corridas concurrentes), con migración 0024 (`aviso_24_en`/`aviso_60_en`/`aviso_72_en` en `device_sync_state`, journal incluido) y `tests/sync-s3-durable.test.ts` 5/5 (PG A/B + memoria intacta).
