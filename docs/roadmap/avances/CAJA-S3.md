---
item: CAJA-S3
estado: hecho
adr: ADR-0027
prd: PRD-CAJA-01
fecha: 2026-10-15
---
CAJA-S3 hecho: migración 0023 crea `cash_due_items` con `avisado_el`/`pagado_el`/`cash_movement_id`, job `POST /api/jobs/vencimientos-caja` avisa a 3 días (72h inclusive, idempotente por `avisado_el`), `GET ?id=` precarga `Registrar pago` y el pago acepta `metodo`, con `tests/caja-s3-vencimientos.test.ts` 8/8 (incluye PG).
