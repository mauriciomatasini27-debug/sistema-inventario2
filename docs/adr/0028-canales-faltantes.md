---
id: ADR-0028
tipo: adr
estado: aceptado
modulos: [email]
depende_de: [ADR-0002, PRD-CH-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Agregar POST /api/email/send (Resend/SES), POST /api/media/upload-url (R2 firmada), POST /api/jobs/enqueue
  (pg-boss) y POST /api/billing/webhooks/mercadopago verificado por firma. PRD:
  diseno/PRD-CH-01-canales-faltantes.md.
---
# ADR-0028 - Canales faltantes: email/send, media, jobs, billing

Estado: aceptado (2026-10-12, evidencia: `src/pages/api/email/send.ts`). Fecha: 2026-10-11. Fuentes: ADR-0002, NE1-NE17, OP1-OP13, grep `email/send|media/upload|jobs/enqueue|billing/webhook` = 0 en `src/pages/api`.

## Decisión

Agregar `POST /api/email/send` (Resend/SES), `POST /api/media/upload-url` (R2 firmada), `POST /api/jobs/enqueue` (pg-boss) y `POST /api/billing/webhooks/mercadopago` verificado por firma. PRD: `diseno/PRD-CH-01-canales-faltantes.md`.

## Por qué

Sin send no hay NE real; sin upload no hay Photos/facturas; sin boss los jobs de `src/pages/api/jobs/*` quedan cron suelto; sin webhook OP queda sin confirmación.

## Qué cambia

4 endpoints; `email_outbox/delivery_status` pasan a usarse; jobs migran a boss idempotente.

## Alternativa descartada

Cron + subida directa al servidor: se descarta por costo/límite y falta de reintento.

## Pendientes

CH-S1→S4 + tests firma inválida 401 y `delivery_status`.
