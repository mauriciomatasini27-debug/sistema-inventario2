---
item: DASH-S6
estado: parcial
adr: ADR-0043
prd: PRD-DASH-01
fecha: 2026-10-23
---
DASH-S6 parcial: `/panel/alertas/historial` muestra las alertas de stock bajo enviadas (fecha, producto, stock, mínimo, urgente) leyendo `GET /api/alertas/historial`, que exige sesión con membership de Dueño (sin sesión 401, Empleado 403) y lista `notification_events` tipo `alerta_stock` del comercio con una fila por `dedupe_key` aunque el job reintente (`historialAlertasStock` en `src/lib/repos/whatsapp.ts`, memoria como respaldo); se apoya en la memoria durable de ALR-S2; `tests/dash-s6-historial.test.ts` cubre permisos, dedupe y aislamiento por comercio; sin botón "Armar pedido", sin columna ni SQL nuevos. Falta mostrar canal y estado de entrega de cada alerta (requisito de PRD-DASH-01).
