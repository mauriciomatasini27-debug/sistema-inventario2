---
id: ADR-0002
tipo: adr
estado: aceptado
modulos: []
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: |
  Monorepo TypeScript estricto. Frontend Astro + TS + islas React/Preact, Tema papel adaptado, 360px touch 44px
  bottom-sheets. PWA manifest + SW + IndexedDB + SQLite-WASM/OPFS, fallback Dexie, plan B Capacitor SQLCipher si
  iOS falla Fase 0.
---
# ADR-0002 - Stack desarrollo y despliegue

Estado: aceptado. Fecha: 2026-10-10.

## Stack

- Monorepo TypeScript estricto. Frontend Astro + TS + islas React/Preact, Tema papel adaptado, 360px touch 44px bottom-sheets.
- PWA manifest + SW + IndexedDB + SQLite-WASM/OPFS, fallback Dexie, plan B Capacitor SQLCipher si iOS falla Fase 0.
- Backend Astro `/api` (decisión, se descarta Hono). Validación borde, lógica pura interna.
- DB Postgres gestionado dev (Supabase/Neon), prod Hetzner CX33/43/53 + PgBouncer por costo. Migraciones Drizzle versionadas + catálogo.
- Fotos: R2/Supabase Storage firmadas, compresión cliente 800px/200KB, original en Photos del cliente vía API.
- Jobs: pg-boss (decisión, se descartan Inngest y cron) + `notification_schedules` America/Argentina jitter. Outbox `email_outbox`, `notification_events`.
- Email Resend (streams avisos/pedidos), fallback SES. SPF/DKIM/DMARC.
- Pagos Mercado Pago preapproval + webhooks -> activo/gracia/suspendido.
- WhatsApp Cloud API directo, 1 WABA central. MVP `wa.me` cero costo para envío proveedor, Cloud API para avisos con plantilla.
- OCR: PaddleOCR PP-OCRv5 autohospedado (costos), fallback Vision/Document AI. Definir Fase 0 contra FP.
- Escáner BarcodeDetector + fallback zxing-wasm/html5-qrcode. EAN-13/8 UPC-A/E Code128/39 QR.
- Obs: Sentry + logs + uptime por base. GH Actions Vitest + Playwright viewport celular.

## Despliegue

- Vercel/Netlify/Cloudflare o Hetzner/DO Coolify. SSR Node/Cloudflare rutas app, marketing estático mismo proyecto.
- Admin en `admin.<dominio>` OAuth separado.
- Variables por tenant resueltas servidor desde control, nunca desde cliente.

## Calidad

- TS estricto, Zod lista cerrada permisos, rate-limit, URLs firmadas sin PII, HTTPS, HttpOnly/Secure.
- <3s 4G gama media, <300ms búsqueda 5k con `pg_trgm+unaccent` GIN.
- PDF servidor streaming `REPEATABLE READ` + `history_exports`.

## Consecuencias

- 1 deploy cubre app + api + jobs MVP.
- Cambio a microservicios solo si host >80% bases o jobs saturan, vía `migration_rollouts`.

## Contratos API

- `POST /api/jobs/enqueue` con pg-boss mismo repo. Body Zod: `nombre` enum cerrado `cierre_caja|recomendacion_mensual|aplica_precio_programado|verifica_inmutables|envio_matutino`, `payload` objeto acotado, `run_at` ISO America/Argentina, `idempotency_key` uuid. Responde 201 con `job_id + run_at`, 409 si `idempotency_key` repetida con distinto `payload`, 422 si `nombre` fuera de lista o `run_at` pasado mayor a 5 min, 403 si rol no es sistema o Dueño.
- `POST /api/email/send` vía Resend streams avisos y pedidos. Body Zod: `stream` enum `avisos|pedidos`, `to` email, `plantilla` enum cerrado `cierre|vencimiento|pedido_confirmado`, `vars` objeto sin PII sensible, `idempotency_key` uuid. Responde 201 con `email_id + stream`, 409 si `idempotency_key` duplicada, 422 si `plantilla` desconocida o falta var requerida, 403 si tenant suspendido.
- `POST /api/media/upload-url` para fotos R2 con firma corta. Body Zod: `content_type` enum `image/jpeg|image/webp`, `bytes` int 1 a 2097152, `modulo_origen` enum `inventory|purchases|tickets`. Responde 201 con `upload_url + object_key + expira_en`, 409 si mismo hash ya subido y devuelve clave existente, 422 si `content_type` fuera de lista o `bytes` excede 2 MB, 403 si dispositivo no pertenece al tenant.
- `POST /api/billing/webhooks/mercadopago` con firma webhook. Body Zod: `preapproval_id` string, `estado` enum `activo|gracia|suspendido`, `firma` string, `occurred_at` ISO. Responde 201 con `tenant_id + estado_nuevo`, 409 si evento ya procesado por `preapproval_id + estado + occurred_at`, 422 si `firma` invalida o falta campo, 403 si IP u origen fuera de allowlist Mercado Pago.

## Eventos outbox

- `job_programado {job_id, nombre, idempotency_key, run_at, tenant_id?}`.
- `email_solicitado {email_id, stream, plantilla, destinatario_hash, op_id}`.
- `pago_actualizado {tenant_id, preapproval_id, estado_anterior, estado_nuevo, occurred_at}`.
- Entrega at-least-once por `idempotency_key` o `email_id`. Consumidor worker pg-boss mismo deploy, reintento con jitter America/Argentina.

## Errores E1-E5

- E1 job duplicado: 409, devuelve `job_id` original sin encolar otro.
- E2 webhook con firma invalida: 422, no cambia estado billing, audita intento.
- E3 tenant suspendido pide envío: 403, email no encolado, sugiere regularizar pago.
- E4 foto mayor a 2 MB o tipo no permitido: 422, no genera URL firmada.
- E5 plantilla email desconocida: 422, no encola, lista plantillas válidas en mensaje.

## Fuera de corte

- Cambio a Inngest o cron externo, worker en servicio separado.
- Capacitor SQLCipher salvo plan B Fase 0 si SQLite-WASM falla en iOS.
- SES como envío principal, solo queda fallback si Resend cae.
- Vision o Document AI como OCR principal, solo fallback si PaddleOCR no alcanza FP Fase 0.
- Dominios custom por tenant y marketing multidioma.
