# ADR-0027 - Caja QR, vencimientos y ticket_payments

Estado: aceptado (parcial) (2026-10-14, evidencia: `src/db/schema.ts` tablas `cash_qr_receipts`, `cash_due_items`, `ticket_payments`; `src/pages/api/cash/qr.ts`, `src/pages/api/cash/due-items.ts`, `src/lib/repos/caja.ts`, `src/modules/sales/registro_venta.ts`; parcial: ingesta QR por bot+Gmail y CAJA-S1→S4 sin cerrar). Fecha: 2026-10-11. Fuentes: C9/C13, TV5.8, grep sin `cash_qr_receipts|cash_due_items|ticket_payments`.

## Decisión

Implementar `cash_qr_receipts` (ingesta bot+Gmail, auto solo Op. nuevo+monto exacto+único + Deshacer), `cash_due_items` y `ticket_payments` (dividido P1). PRD: `diseno/PRD-CAJA-01-qr-vencimientos-ticket-payments.md`.

## Por qué

C13 y C9 están documentados sin código; TV5.8 dividido es P1 declarado pero sin tabla base.

## Qué cambia

Tablas + `/api/cash/qr`, `/api/cash/due-items`; `ticket_payments(cash_movement_id)`.

## Alternativa descartada

Manual puro sin QR: se descarta porque C13 ya fija el contrato determinista.

## Pendientes

CAJA-S1→S4 + tests auto vs ambiguo + `ya registrado`.
