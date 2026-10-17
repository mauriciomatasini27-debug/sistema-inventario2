---
item: DASH-S3
estado: hecho
adr: ADR-0034
prd: PRD-DASH-01
fecha: 2026-10-17
---
DASH-S3 hecho: tarjeta Bot en el índice de /panel con consultas de hoy, última consulta en hora AR y estado del número central desde GET /api/whatsapp/resumen (sesión + membership activa, nunca teléfonos en la respuesta); las consultas se registran en whatsapp_usage (tabla existente, sin migración, tipo consulta y costo 0, idempotente por wamid) desde el webhook una vez pasada la puerta de identidad, la salud de la Cloud API vive en memoria por instancia según el último envío, y sin número central el estado honesto es sin configurar; el estado siempre se explica en palabras en texto (aria-live polite), omitidos historial (DASH-S2) y ocultar por módulo apagado (DASH-S12).
