---
item: DASH-S6
estado: parcial
adr: ADR-0043
prd: PRD-DASH-01
fecha: 2026-10-23
---
DASH-S6 parcial: `/panel/alertas/historial` muestra fecha, producto, stock, mínimo, urgente, canal y estado de entrega. `GET /api/alertas/historial` exige Dueño (401 sin sesión, 403 Empleado) y lista `notification_events` tipo `alerta_stock` con una fila por `dedupe_key`. El aviso de WhatsApp guarda `canal: whatsapp` y `estado: enviado`; un payload viejo sin canal se lee como whatsapp (`canalAlerta`). `tests/dash-s6-historial.test.ts` cubre permisos, dedupe, otro comercio, canal email y estado. Sigue sin el botón Armar pedido (espera ALR-S5). Sin columna ni SQL nuevos.
