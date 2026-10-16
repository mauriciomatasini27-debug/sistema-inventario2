---
id: ADR-0001
tipo: adr
estado: aceptado
modulos: [inventario]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0001 - Arquitectura base Sistema de Inventario

Estado: aceptado. Fecha: 2026-10-10.

## Contexto

28 PRD, kioscos Argentina, mobile-first PWA, 1 DB por cliente + base control, offline v1 venta/stock/caja, 1 número central WhatsApp, Ley 25.326 solo-datos-gestión en panel.

## Candidato A - Monolito modular Astro + Postgres por tenant (recomendado)

Frontend Astro + TS + islas React, SSR Node, PWA SQLite-WASM/OPFS + outbox. Backend mismo deploy Astro `/api` o Hono + Zod + Drizzle. Postgres por cliente + base control, pooling por base, runner Drizzle escalonado. Jobs pg-boss/cron mismo repo. Fotos R2/Supabase firmadas. WhatsApp Cloud API directo + Resend + Mercado Pago preapproval + Gmail watch + ARCA FiscalProvider.

Pros: velocidad despliegue, 1 repo, costos Hetzner bajos, transacciones locales simples (ticket+stock+caja misma tx), inmutabilidad con `REVOKE` + triggers por DB.
Contras: escala vertical por host, migraciones N bases.

## Candidato B - Servicios separados por dominio + DB compartida con RLS

`app-web`, `api-core`, `worker-jobs`, `bot-gateway`, `fiscal-service`. 1 Postgres compartido con `tenant_id` + RLS. Cola externa Inngest/Trigger. OCR servicio propio.

Pros: despliegue independiente, escala horizontal por servicio.
Contras: RLS riesgoso para auditoría inmutable, joins cross-tenant, costo operativo mayor, rompe decisión PRD 1-DB-por-cliente, latencia 4G peor, over-engineering MVP.

## Decisión

Candidato A. Principios aplicados: `foundational-thinking` (scaffold tipos y fronteras antes de features), `laziness-protocol` (no segunda arena, MVP monolito), `model-the-domain` (dominios como módulos con tablas propias, no servicios), `boundary-discipline` (guards en borde: OIDC, webhooks, ARCA, WA).

## Módulos (mapa)

- `core/tenants` - control: tenants, tenant_databases, memberships, invitations, sessions, platform_admins.
- `core/auth` - OIDC Google 2 apps OAuth, sesiones servidor, allowlist superadmin.
- `inventory` - products, codes, lots FEFO, movements append-only, counts, suppliers, purchase_orders.
- `pricing` - cost_history, markups, ajustes programados, redondeo.
- `sales/ticket` - sales, returns, tickets secuenciales offline-safe, PDF/imagen, link público firmado.
- `cash` - cash_day, movements, handover, drops, sueldos, retiros.
- `credit/fiados` - clientes, saldos deterministas, topes, antigüedad.
- `purchases` - supplier_invoices/drafts/payments, matching.
- `utilities` - service_accounts, utility_bills, email_ingestion.
- `payments` - payment_orders, payees, allowlist dominios.
- `fiscal` - fiscal_settings, sequences, documents, FiscalProvider ARCA.
- `channels/bot` - whatsapp_identities, usage, preferences, aliases, jobs matutino/viernes/cierre.
- `channels/email` - outbox, deliveries, plantillas React Email.
- `analytics` - daily_stats, mv_rotation, snapshots.
- `admin` - subdominio admin, contadores, billing, infra_hosts, migration_rollouts, audit hash.
- `sync` - outbox, id_mappings, sync_state, offline_grants, devices.

## Consecuencias

- Alta Onboarding aprovisiona DB + migra + siembra.
- Stock = SUM(movements), caché `stock_actual` misma tx.
- Panel nunca accede a DB tenant negocio, solo `ops_signals_outbox`.
- Backups diarios + lógico semanal RPO24h RTO<4h.
- Tests aislamiento CI por base.

## Red flags revisados

Sin shallow modules, sin leakage costos a dominio, sin descomposición temporal, sin pass-through. Interfaz rica en `registrar_movimiento`, `confirmar_venta`, `cerrar_caja`.

## Contratos API

- `POST /api/tenants` con sesión superadmin. Body Zod: `nombre_comercio` string 3 a 80, `plan` enum cerrado `demo|base|plus`, `owner_google_sub` string, `moneda` literal `ARS`. Responde 201 con `tenant_id + database + membership_dueno`, 409 si ya existe tenant activo con mismo `nombre_comercio` para ese `owner_google_sub`, 422 si `plan` fuera de lista o nombre corto, 403 si `google_sub` no esta en allowlist superadmin.
- `POST /api/tenants/:tenant_id/memberships` con sesión Dueño. Body Zod: `google_sub` string, `rol` enum cerrado `dueno|empleado`, `invitation_token_hash?`. Responde 201 con `membership_id + tenant_id + rol`, 409 si ese `google_sub` ya es miembro activo, 422 si `rol` invalido o token vencido, 403 si quien invita no es Dueño del tenant.
- `POST /api/sync/push` con `Idempotency-Key` header igual a `op_id`. Body Zod: `op_id` uuid, `device_code` string, `device_seq` int positivo, `hlc` string, `modulo` enum `inventory|sales|cash|credit`, `payload` objeto segun modulo, `client_occurred_at` ISO. Responde 201 con `op_id + cursor_nuevo + id_mapeado`, 409 si `op_id` ya existia con distinto `payload`, 422 si `device_seq` salta o `modulo` desconocido, 403 si dispositivo no pertenece al tenant.
- `GET /api/sync/pull?cursor=&limite=` con sesión miembro. Query Zod: `cursor` bigint, `limite` int 1 a 200 def 100. Responde 200 con `items + cursor_nuevo`, 409 no aplica y se documenta como 409 si `cursor` corresponde a rama archivada y exige reseed, 422 si `cursor` negativo o `limite` fuera de rango, 403 si miembro no pertenece al tenant.

## Eventos outbox

- `tenant_aprovisionado {tenant_id, database, owner_google_sub, plan, occurred_at}`.
- `membership_otorgada {tenant_id, membership_id, google_sub, rol, otorgado_por, occurred_at}`.
- `sync_lote_confirmado {tenant_id, device_code, op_ids, cursor_nuevo, client_occurred_at}`.
- Entrega at-least-once por `op_id`. Consumidor admin para contadores y `migration_rollouts`, nunca lee tablas negocio.

## Errores E1-E5

- E1 tenant duplicado: 409, no crea segunda DB, devuelve `tenant_id` existente.
- E2 membership duplicada: 409, devuelve membership vigente sin crear otra.
- E3 doble push mismo `op_id` con distinto body: 409, devuelve confirmación original, audita intento.
- E4 cursor desfasado o rama archivada: 409, exige reseed desde snapshot, no acepta push hasta reseed.
- E5 acceso cross tenant: 403, loguea en `admin_audit_log`, no revela si el tenant existe.

## Fuera de corte

- Extracción a microservicios antes del umbral host mayor a 80 por ciento o jobs saturados.
- DB compartida con RLS, multirregion activo activo, sharding por tabla.
- Migraciones online sin ventana, backfill histórico mayor a 90 días en MVP.
- Acceso panel a DB tenant negocio fuera de `ops_signals_outbox`.
