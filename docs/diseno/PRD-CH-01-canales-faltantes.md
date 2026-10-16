---
id: PRD-CH-01
tipo: prd
estado: propuesto
modulos: [email]
depende_de: [ADR-0002]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# PRD-CH-01 - Canales faltantes: email/send, media, jobs, billing

Fuente: ADR-0002, `docs/07-canales-whatsapp-email/*`, `docs/05-compras-servicios-pagos/ordenes-pago.md`. Gap: grep `email/send|media/upload|jobs/enqueue|billing/webhook|mercadopago` en `src/pages/api` = 0 endpoints.

## Épica CH-E1. Email + media + jobs

- CH-S1. `POST /api/email/send` (Resend, SES plan B). AC: Given evento NE When dispara Then `email_outbox` + `delivery_status` + plantilla React Email + SPF/DKIM/DMARC. Tablas: existentes `schema-email.ts`. Depende de: nada.
- CH-S2. `POST /api/media/upload-url` (R2 firmada: facturas, consumos, fotos). AC: Given alta producto When pide URL Then subida directa + `mediaItemId` guardado. Depende de: nada.
- CH-S3. `POST /api/jobs/enqueue` (pg-boss: cierre-medianoche, mora, purga-demos, whatsapp-avisos). AC: Given jobs actuales en `src/pages/api/jobs/*` When migro Then encolan vía boss con idempotencia. Depende de: CH-S2.

## Épica CH-E2. Billing webhooks

- CH-S4. `POST /api/billing/webhooks/mercadopago` + allowlist dominios. AC: Given pago proveedor When confirma Then verifica firma + crea evento sin credenciales MP (principio OP: el bot prepara, el comerciante paga). Tablas: `payment_orders`, `official_payment_domains`. Depende de: nada.

## Estrategia prueba

| Tipo | Caso | Resultado |
|---|---|---|
| Feliz | send + delivery | `delivery_status` entregado |
| Fallo | webhook firma inválida | 401 sin mutar nada |
