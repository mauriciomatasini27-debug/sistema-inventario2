---
item: GGL-P240-FIX
estado: hecho
adr: ADR-0103
prd: PRD-GMAIL-01
fecha: 2026-11-21
---
GGL-P240-FIX hecho: corrige regresiones del merge #240 — dedupe de jobs por (tenantId, messageId), evento filtros_actualizados al pausar remitentes (no en cada job), labels persistidas y usadas en users.watch; tests en gmail-p240-fixes-pg.test.ts; migración pendiente UNIQUE (tenant_id, message_id) para reemplazar el índice global 0048.