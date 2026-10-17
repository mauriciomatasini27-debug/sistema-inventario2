---
item: BOT-S7
estado: hecho
adr: ADR-0040
prd: PRD-BOT-01
fecha: 2026-10-16
---
BOT-S7 hecho: el job mensual (`src/jobs/resumen-mensual.ts`, núcleo puro, y `POST /api/jobs/resumen-mensual` con `correrJob`, X-Job-Secret y tenant de gateJob) arma UN snapshot del mes cerrado (caja: ingresos, egresos, resultado y ventas; `cobranza`: fiado a cobrar y deudores; `flujo_caja`: pagos que vencen el mes que empieza, cada sección gateada por `leerModulosBot`) y lo manda igual por WhatsApp y email el día 1 desde las 09:00 (zona por defecto America/Argentina/Buenos_Aires, no hay zona por tenant), idempotente por `resumen_mensual:{canal}:{tenant}:{mes}` sin migración (WA en memoria como BOT-S3/S4, email durable por `idempotency_key` de `email_outbox`), con opt-in/pausa por canal y sin marcar el WA enviado cuando faltan credenciales Cloud API.
