---
item: CAJA-S4
estado: hecho
adr: ADR-0027
prd: PRD-CAJA-01
fecha: 2026-10-15
---
CAJA-S4 hecho: `registro_venta.ts` inserta `cash_movements` con `id = p.cashMovementId` para que `ticket_payments.cash_movement_id` referencie el egreso real, con `tests/caja-s4-ticket-payments.test.ts` 3/3 en memoria + PG.
