# Roadmap - Sistema de Inventario

Fecha: 2026-10-12. Este archivo reemplaza a `CHECKLIST-documentacion.md` como fuente de estado de implementación (el checklist queda como historia, sin cambios). Estados: `funciona`, `en memoria (store.ts)`, `parcial`, `simulado`, `a verificar`. Basado en relevamientos de `src/` del 2026-10-12; los tests no se corrieron para armar este archivo. Actualización 2026-10-12: UX-S0 (Sonner) y LAND-S11/LAND-S12 (sin Descubrimiento, precios solo desde planes) implementados con `tests/landing.test.ts` 38/38 y `npm run build` en verde. Actualización 2026-10-12: PERS-S1 hecho (sales y cash/movements DB-first en 1 tx con contador sin huecos; suite 710/714 con 2 fallos caja-c11 preexistentes). Actualización 2026-10-13: 422 fiscal post-apply eliminados de `src/pages/api/sales.ts` (código muerto, la puerta decide pre-apply con los mismos inputs); caja standalone sin cambios (un solo INSERT atómico con clave única); base 110 de 136 con store; PERS-S2 hecho 2026-10-13: push/pull sync DB-first verificado en vivo. Actualización 2026-10-13: SUP-S1 a S4 hechos (proyecto Supabase en `ca-central-1`, desvío de `sa-east-1`; `.env` con Session pooler 5432; `npm i @supabase/supabase-js @supabase/ssr`; `db:migrate` 15/15 verificado en DB); restan SUP-S5 y SUP-S6.

## Ya implementado

Dato base: 109 de 136 archivos de `src/pages/api` importan `src/lib/store.ts` (medido 2026-10-13 con `node scripts/cutover-scope.mjs`; PowerShell subcuenta por los `[id]` en rutas; 109 desde Slice E); la memoria sigue siendo la fuente de verdad fuera de Slice-0.

| Área | Estado | Qué hay | Rutas | PRD / ADR |
|---|---|---|---|---|
| Sync y dispositivos | parcial | Pull, heartbeat, offline-grants, register y avisos 24/60/72 h con tests; copia durable best-effort, memoria manda | `src/pages/api/sync/*`, `src/pages/api/devices/*`, `src/offline/avisos.ts`, `src/db/schema-sync.ts` | PRD-SYNC-01, ADR-0023 |
| Persistencia DB | parcial | PERS-S1 hecho 2026-10-12: `POST /api/sales` y `POST /api/cash/movements` DB-first en 1 tx (sales, tickets, cash, pagos, stock, contador `ticket_counters` sin huecos) con 409 y puerta fiscal pre-apply (422 post-apply muertos eliminados de `sales.ts` 2026-10-13); PERS-S2 hecho 2026-10-13: `POST /api/sync/push` y `GET /api/sync/pull` DB-first (`outbox` + `id_mappings` en 1 tx, replay 200, 409) con espejo memoria; `GET /api/cash/balance` deriva SUM; write-through best-effort en crédito, tickets, precios, proveedores, fiscal y WhatsApp/email; lecturas con `fuente: db\|memoria` | `src/modules/sales/registro_venta.ts`, `src/modules/cash/registro_movimiento.ts`, `src/lib/control-db.ts`, `src/lib/fiscal-db.ts`, `drizzle/*.sql` | PRD-PERS-01, ADR-0024 |
| Caja, ventas, ticket, fiado | parcial (fiado y links DB-first 2026-10-13) | Rutas y módulos completos de dominio; varios TODO en `cash/caja.ts`, `historial.ts`, `reversion.ts`, `credit/fiado.ts`, `saldos.ts`; `POST /api/credit/payments` y `POST /api/credit/sales-on-account` DB-first con 409 y espejo memoria (migración 0009 `customer_id` a text); `POST/GET/DELETE /api/tickets/link` DB-first con espejo (migración 0005 aplicada a desarrollo) | `src/pages/api/cash/*`, `sales*`, `tickets/*`, `credit/*`, `src/modules/{cash,sales,credit}` | ADR-0004 |
| PWA | parcial | Manifest, iconos, `sw.js`, SQLite-WASM con `journal_outbox`; falta `photos_queue`, cifrado y borrado remoto | `public/sw.js`, `src/offline/db.ts` | PRD-PWA-01, ADR-0025 |
| Fiscal ARCA | parcial (G2d-ruta emitir 2026-10-13) | Núcleo, WSAA/WSFEv1, lock, idempotencia, NC/ND, QR, KMS y wizard escritos; corre contra `homo-fake.ts`; `crear_arca_provider` sin conectar; `padron.ts` stub; `caea.ts` solo flag; `GET documents/history/export` con unión DB+memoria y doc fiscal de `POST sales` DB-first (`asegurarFiscalDoc` + espejo, 409 frío); `POST retry` con UPDATE atómico T3 y `POST nd` con 409 por header-key (prefijo, unión factura/cobro) DB-first 2026-10-13 (G2a); `GET/POST wizard` DB-first con upsert por tenant y espejo memoria (migración 0010 `fiscal_wizard`) 2026-10-13 (G2b-wizard); `POST delegacion-confirmada` DB-first con `guardarWizard` y espejo 2026-10-13 (G2b-delegación; su tarea vive en `fiscal_jobs` text-keyed desde el slice Control 2026-10-13); emisión durable DB-first con claim + pre-estampa `respuesta_incierta` pre-ARCA, `store` de cinco salidas, reaper `rehidratar_fiscal` y `marcar_no_facturar` como único escritor (migración 0011 PK `fiscal_sequences`, `src/lib/fiscal-emitir.ts`, sin ruta HTTP hasta G2d) 2026-10-13 (G2c); `POST emitir` cáscara fina sobre `emitir_fiscal_durable` con mapeo 200/422/202/409, replay 409 y barrido reaper best-effort por emisión (sin boot hook en Astro standalone; scheduler periódico para slice Control) 2026-10-13 (G2d) | `src/modules/fiscal/*`, `src/pages/api/fiscal/*` (10), `src/db/schema-fiscal*.ts` | PRD-FE-01, ADR-0018, ADR-0019 |
| WhatsApp | parcial | Módulos de consulta, alertas, aviso matutino, resúmenes, vincular y webhook; adaptador Cloud API real; sin número central en Meta | `src/modules/whatsapp/*`, `src/pages/api/whatsapp/*`, `src/jobs/whatsapp-*` | PRD-BOT-02, ADR-0041, ADR-0042 |
| Email | a verificar | Cierre de caja a `email_outbox`; ruta `POST /api/email/send` existe (envío real con Resend a verificar) | `src/modules/email/*`, `src/pages/api/email/send.ts` | PRD-CH-01, ADR-0028 |
| Cobro | parcial | Solo webhook de Mercado Pago con firma HMAC e idempotencia en memoria; sin suscripciones | `src/pages/api/billing/webhooks/mercadopago.ts` | PRD-CH-01 CH-S4 |
| Landing | funciona (build OK 2026-10-12, `tests/landing.test.ts` 38/38) | 18 secciones en `index.astro` (Descubrimiento eliminado); `Planes.astro` con Plus `Precio a confirmar` y CTA `Probar 14 días` a `/alta?plan`; ningún `$` fuera de `business.planes` (AT2) | `src/pages/index.astro`, `src/components/sections/*`, `src/data/business.ts` | PRD-LP-01 a LP-03, PRD-LANDING-01 |
| Panel `/panel` | parcial | Tarjetas con colores sueltos y `n-tickets=91` hardcodeado | `src/pages/panel.astro` | PRD-OP-01 OP-S3, PRD-DASH-01 |
| Venta, alta, admin | a verificar | Páginas existen; admin con mora, flags, señales y ledger en API | `src/pages/{venta,alta,admin}.astro`, `src/pages/api/admin/*` | PRD-CP-01, ADR-0006 |
| Login Google OIDC | a verificar | Slice con `jose`, nonce y PKCE; AU-01/AU-02 sin verificar | `src/modules/auth/*`, `src/pages/api/auth/*` | PRD-AU-01, PRD-AU-02 |
| Compras, OCR, consumos, órdenes de pago | parcial (compras DB-first 2026-10-13) | `POST /api/suppliers` DB-first con 409 por CUIT; `POST /api/purchase-orders` cabecera+líneas en 1 tx y `close` durable; `supplier-invoices` (drafts/discard/confirm/match/account/payments) DB-first con confirm en 1 tx (factura+borrador+log+cierre OC); espejo memoria; OCR definitivo sin decidir | `src/modules/{purchases,ocr,utilities,payments,pagos-tx}`, `src/pages/api/{supplier-invoices,ocr,utility-bills,payment-orders}/*`, `src/lib/compras-db.ts` | FP1-FP12, CS1-CS12, OP1-OP13, ADR-0005 |
| Precios | parcial (ajustes DB-first 2026-10-13) | `prices/preview` pura sin store; `POST /api/prices/adjustments` DB-first con 409 y espejo memoria | `src/modules/pricing/*`, `src/pages/api/prices/*` | GP1-GP11 |
| Onboarding y tenants | parcial (Control durable 2026-10-13) | Rutas de onboarding y aprovisionamiento; jobs de provisión durables con claim + tx única y espejo memoria (`POST tenants` y `POST onboarding/alta` delegan al runner, 201/409 por requestKey, `persistirTenantAlta` con id explícito); outbox transaccional con drain por reclamo (`POST admin/senales/consumir`); delegación fiscal en tabla propia text-keyed (`fiscal_jobs`, migración 0013); kill real converge a activo con un job por requestKey (migraciones 0012 claim en `provision_jobs` y 0014 claim en outbox) | `src/modules/onboarding/*`, `src/modules/tenants/*`, `src/pages/api/onboarding/*`, `src/jobs/aprovisionar.ts` | ON1-ON13, ADR-0011 |
| Reportes de rotación | a verificar | Módulo y rutas de analytics | `src/modules/analytics/*`, `src/pages/api/analytics/*` | RT1-RT11 |
| UI y sistema de diseño | parcial | Cero `alert()` en `src/`; contraste AA 5 de 7 pares; Sonner instalado (React + `@astrojs/react`, un solo `<Toaster />` en `panel.astro` y `BaseLayout.astro`, commit `70c7a67`) | `src/components/ui/Toaster.tsx`, `src/styles/global.css`, `scripts/check-ui.mjs`, `scripts/check-contrast.mjs` | SPEC-UI-00, EVIDENCIA-UI-00, ADR-0032 a 0038 |
| Aislamiento fiscal por tenant | parcial (ISO-S1 a S4 hechos 2026-10-13, commit `dfdc3de`) | `tenantDeRequest` con sesión + membership en `TENANT_MODE=multi` (single por defecto, sin cambios); `getTenantDb` fail-closed en multi; `fiscal_documents.tenant_id` (migración `0015`); `documents`, `history` y `export` filtran DB y memoria; `tests/iso-fiscal-tenant.test.ts` 7/7. Falta: resto del plano de datos sin tenant, `wizard.ts` toma `tenant_id` del body, backfill | `src/lib/tenant-context.ts`, `src/lib/tenant-mode.ts`, `src/lib/fiscal-db.ts`, `src/pages/api/fiscal/*` | PRD-ISO-01, ADR-0050 |
| Aislamiento del plano de datos | parcial (ISO-S5 a S9 hechos 2026-10-13, commit `bc2f48f`) | Middleware resuelve el tenant por request (`AsyncLocalStorage`) para 16 prefijos de datos y corta 403 en `TENANT_MODE=multi` sin tenant; `getTenantDb()` toma el contexto; wizard y delegación usan el tenant del contexto (403 si el body pide otro); docs fiscales sin dueño rechazados; `scripts/backfill-tenant-id.mjs` en seco por defecto. Falta: memoria de `store.ts` global, jobs por `X-Job-Secret` sin tenant, backfill real | `src/lib/tenant-mode.ts`, `src/lib/tenant-context.ts`, `src/middleware.ts`, `scripts/backfill-tenant-id*.mjs` | PRD-ISO-02, ADR-0051 |
| Memoria por tenant y cutover multi | parcial (PERS2-S1 a S4 hechos 2026-10-13, commit `2b926a1`) | `store` particionado por tenant (Proxy sobre `tenantActual()`), en multi sin base del tenant 503 `base_no_disponible` (excepción fiscal en memoria particionada), jobs con `X-Job-Secret` exigen `X-Tenant-Id` en multi, `scripts/pg-local.sh` + `tests/pers2-pg.test.ts` contra Postgres local. Falta: PERS-S4 por dominio, PERS-S5 (110 rutas con `store`), fan-out de jobs | `src/lib/store.ts`, `src/lib/server-db.ts`, `src/lib/tenant-context.ts`, `src/middleware.ts`, `scripts/pg-local.sh` | PRD-PERS-02, ADR-0052 |
| Asistente IA, chat de landing, planes, umbrales | sin código | — | — | PRD-IA-01, PRD-LP-04, PRD-PLAN-01, PRD-ALR-01 |

## Para implementar

Orden por prioridad y dependencias. Tallas de cada PRD.

### 1. Base de datos (bloquea todo lo cobrable)
1. Arreglar el journal de migraciones: `drizzle/meta/_journal.json` solo registra `0000`; `0001` a `0006` no están y hay dos `0004` (`0004_auth_append_only.sql`, `0004_ticket_links.sql`). Talla S.
2. Completar cutover a DB y retirar `store.ts` de `src/pages/api` (PERS-S4/S5, ADR-0024; PERS-S1 hecho 2026-10-12, ticket_lines queda diferido). Talla L. Primer corte hecho 2026-10-13 (PRD-PERS-02, ADR-0052, ver Ya implementado); resta el cutover por dominio de PERS-S4 y PERS-S5. Grupo 1 (tickets, precios, proveedores) aceptado (ADR-0053); grupo 2: fiscal aceptado (ADR-0054); grupo 3: whatsapp y email aceptado (ADR-0055); grupo 4: caja aceptado (ADR-0056); grupo 5: facturas de proveedores y órdenes de pago aceptado (ADR-0057); grupo 6: consumos de servicios y fiado aceptado (ADR-0058). Ahora: quedan 27 rutas que importan `store`.
3. Migración a Supabase según `diseno/PRD-SUP-01-conexion-supabase.md`: SUP-S1 a S4 hechos 2026-10-13 (proyecto en `ca-central-1`, desvío de `sa-east-1`; `.env` Session pooler 5432; `db:migrate` 15/15 verificado); restan SUP-S5 (fuente db) y SUP-S6 (tests); más `adr/0048-supabase-single-project.md` y `adr/0049-supabase-driver-pooler.md`; guía en `docs/migracion-supabase.md`.
4. Cierre durable de sync: `device_sync_state`, `offline_grants` con DB en CI (SYNC-S1 a S7, ADR-0023).
5. PWA: `photos_queue`, cifrado y borrado remoto (PWA-S4, PWA-S5, ADR-0025).

### 2. Fiscal ARCA (Factura C para Básico primero)
Fecha límite: desde el 1/12/2026 ARCA rechaza comprobantes sin `CondicionIVAReceptorId` (manual WSFEv1 v4.8). El envelope ya lo manda (`wsfe.ts:206`).
1. Cablear `crear_arca_provider_desde_env` al worker y rutas (homo por defecto). S.
2. Computador fiscal homo: CSR, certificado WSASS, clave cifrada en `fiscal_computers`. M.
3. Homologación real de Factura C con CAE y vencimiento en Postgres. M.
4. Token WSAA persistido cifrado en `arca_tokens`. S.
5. Tabla de condición IVA receptor con `FEParamGetCondicionIvaReceptor` (antes del 1/12/2026). S.
6. `fiscal_points_of_sale` y delegación real ARCA (el estado del wizard ya es DB-first desde G2b 2026-10-13). M.
7. QR RG 4892 verificado e impreso. S.
8. NC C desde devolución en homo. S.
9. Factura B para Responsables Inscriptos y padrón real. M.
10. Pase a producción con contador. M.
11. CAEA de contingencia para offline (RG 5782, FE-E8). L.

### 2b. Identidad y onboarding
1. Login endurecido (PRD-AU-01, ADR-0031) y login con destino `next` y bifurcación admin/tenant (AU2-S1 a S7, ADR-0030): a verificar contra código.
2. Onboarding ON1-ON13 (`docs/02-identidad-onboarding/onboarding-parte-1.md`, `-parte-2.md`): estado a verificar; cupo de prueba abierto (`onboarding-parte-2.md:261`).
3. Flujo demo de dos tenants E2E (PRD-E2E-01, E2E-S1 a S6).

### 3. WhatsApp y canales
1. Alta del número central en Meta, verificación del negocio y plantillas (ADR-0041, ADR-0042). Externo.
2. PRD-BOT-02 consulta de stock por WhatsApp (BOT2-S1 en adelante).
3. PRD-BOT-01 módulos por rubro (BOT-S1 a S6, ADR-0039).
4. PRD-ALR-01 umbrales y alertas (ALR-S1, ALR-S3, ALR-S5; ADR-0043).
5. Resumen mensual y acciones propuestas del bot (ADR-0040, PRD-BOT-01).
6. Canales PRD-CH-01 (ADR-0028 aceptado): las cuatro rutas existen (`email/send`, `media/upload-url`, `jobs/enqueue`, `billing/webhooks/mercadopago`); falta envío real Resend, firma R2, pg-boss y webhook durable fuera de memoria (CH-S1 a S4, a verificar).
7. Email NE1-NE17 con Resend, SPF/DKIM/DMARC (`notificaciones-email.md`): estado a verificar.

### 4. Asistente IA y chat
1. PRD-IA-01 asistente con catálogo cerrado y `ai_usage` (IA-S2, IA-S5; ADR-0044, ADR-0045).
2. PRD-LP-04 y DASH-S10: `ChatLanding.astro` reemplaza `FloatingWhatsApp.astro` (ADR-0046).

### 5. Dashboard y diseño
1. UX-S0: hecho 2026-10-12 (commit `70c7a67`): React, `@astrojs/react` y Sonner instalados, `src/components/ui/Toaster.tsx` con tokens de Tema Papel (`bottom-center` en móvil, `top-right` en escritorio, `richColors` apagado), un solo `<Toaster client:idle />` en panel y `BaseLayout`; `npm run build` y `check:ui` 10/10 en verde.
2. PRD-DASH-01 DASH-S1 a S13 (bot, alertas, asistente, chat, índice sin hardcode). M a S.
3. PRD-UX-01 UX-S1 a S12 (skills por fase) y auditoría del panel viejo UX-S11. M.
4. PRD-UI-01 a UI-07 (UI-S1 a UI-S31, ADR-0032 a 0038) y tickets SPEC-UI-00 T-UI-01 a T-UI-07: T-UI-01 (Sonner) cubierto por UX-S0 hecho 2026-10-12; T-UI-02 diálogos, T-UI-03 Virtuoso/NumberFlow, T-UI-04 errores, T-UI-05 contraste 7 de 7, T-UI-06 harness `venta`, T-UI-07 gate por PR.
5. Sistema de diseño Tema Papel: PRD-DS-01, DS-02, DS-03 (DS-S1 a S23, ADR-0008, ADR-0009): adopción a verificar (SPEC-UI-00 decidió quedarse con `--color-*`).

### 6. Planes y precios
1. PRD-PLAN-01: `plans`, `plan_features`, `subscriptions` (PLAN-S1, M), cambios de plan (S3 a S6), panel y upsell (S7 a S9), cupos y medición (S10 a S12), cobro (S13, S14), captación (S15 a S19).
2. PRD-PLAN-02: verificar tarifa Meta, piloto de costos, regla de margen y condiciones de publicación (PLAN2-S1 a S5).
3. PRD-LANDING-01: tarjetas, comparativa, mobile, chat (LAND-S1 a S10); LAND-S11 y LAND-S12 hechos 2026-10-12 (commit `39c9cf1`): Descubrimiento quitado de `src/data/business.ts`, `src/pages/index.astro` y `src/components/sections/Descubrimiento.astro` (archivo borrado); Plus en `Precio a confirmar`; CTA por plan a `/alta?plan`; AT2 sin `$` fuera de `Planes.astro`; resto de fusiones pendiente.

### 6b. Operación y plataforma
1. Control Plane PRD-CP-01 (CP-S1 a S16, ADR-0011, ADR-0006): mora 14 días, suspensión, logs; estado a verificar.
2. Panel admin multi-kiosco PA1-PA14 (`panel-admin-parte-1..3.md`) y cierre de paneles PRD-OP-01 (OP-S1 a OP-S4, ADR-0029): admin tenants/rollouts/audit, `/panel` sin hardcode, landing E13.
3. Reportes de rotación RT1-RT11 (`reportes-rotacion.md`): estado a verificar.
4. Índice y navegación del dashboard (`dashboard-indice-navegacion.md`, ADR-0020): lo absorbe DASH-S12.

### 6c. Landing pendiente fuera de planes
1. PRD-LP-03 accesos `Mi comercio` y `Admin` (LP3-S1 a S5, ADR-0030).
2. Gaps E8 a E13 de `landing-gaps-modoops.md` (SEO, OG, UTM, nav, migración, higiene comercial) vía OP-S4; PRD-LP-01 y LP-02 resto (ADR-0010, 0021, 0022).

### 7. Núcleo comercio pendiente
1. PRD-CAT-01: products CRUD, lotes FEFO, ubicaciones y conteo (CAT-S1 a S6, ADR-0026).
2. PRD-CAJA-01: QR, vencimientos y pagos divididos (CAJA-S1 a S4, ADR-0027).
3. OCR definitivo Fase 0 (PaddleOCR propio vs Vision/Textract, ADR-0005).
4. Compras, consumos y órdenes de pago (FP1-FP12, CS1-CS12 con Gmail `users.watch`, OP1-OP13): cableado real a verificar; dependen de OCR y PERS.

### 8. Legal y fiscal
1. Consulta con contador y abogado: Ley 25.326, leyenda del ticket, ARCA y facturación de la suscripción.
2. Verificación en fuente oficial de las 5 APIs en consola y dispositivo (`verificacion-fuente-oficial.md`): parcial.

### 9. Proceso y negocio (no es código)
1. PRD-NEG-01 catálogo y oferta (ADR-0012; NEG-S8 superado por PRD-LANDING-01), PRD-ADAP-01 adaptación desde ModoOps (ADR-0013), skills PRD-SK-01 a SK-03 (ADR-0014 a 0016): cumplimiento a verificar.

## Decisiones registradas

- Suscripción mensual por plan, no por módulo (ADR-0047).
- Sin precio de servicio ni costo de implementación; la carga de datos va incluida en el onboarding (decisión del dueño 2026-10-12, revisable; PRD-LANDING-01).
- WhatsApp Cloud API oficial con número central, Baileys descartado (ADR-0041, ADR-0042).
- Alertas con `pg_cron` + `pg_net` (ADR-0043).
- Asistente IA con catálogo cerrado y solo lectura (ADR-0044).
- Chat de landing aislado, solo FAQ (ADR-0046).
- ARCA con implementación propia `FiscalProvider` (ADR-0018).

Estado de ADRs (2026-10-12): aceptados con evidencia en `src/` 0023, 0024, 0025, 0028, 0029, 0030, 0031, 0036 y 0041; 0047 aceptado por decisión del dueño. Siguen propuestos 0026, 0027, 0032 a 0035, 0037 a 0040 y 0042 a 0046 (sin código que aplique la decisión).

## Abiertas

- Proveedor de OCR.
- Mercado Pago como proveedor de cobro.
- Precios a publicar (PLAN2-S4).
- Consulta legal y fiscal.

## Cobertura

Cada doc de `docs/` (sin `_origen-docx`) y dónde lo cubre este roadmap. Auditoría 2026-10-12.

| Doc | Estado | Dónde |
|---|---|---|
| `docs/README.md` | meta | índice; enlaza este archivo |
| `docs/CHECKLIST-documentacion.md` | meta | reemplazado como fuente de estado |
| `docs/migracion-supabase.md` | cubierto | Para implementar 1.3 |
| `diseno/PRD-SUP-01-conexion-supabase.md` | cubierto | Para implementar 1.3 |
| `adr/0048-supabase-single-project.md` | cubierto | Para implementar 1.3 |
| `adr/0049-supabase-driver-pooler.md` | cubierto | Para implementar 1.3 |
| `diseno/PRD-ISO-01` | cubierto | Ya implementado (Aislamiento fiscal) |
| `adr/0050-aislamiento-fiscal-por-tenant.md` | cubierto | Ya implementado (Aislamiento fiscal) |
| `diseno/PRD-ISO-02` | cubierto | Ya implementado (Aislamiento del plano de datos) |
| `adr/0051-tenant-por-request.md` | cubierto | Ya implementado (Aislamiento del plano de datos) |
| `diseno/PRD-PERS-02` | cubierto | Ya implementado (Memoria por tenant) |
| `adr/0052-memoria-por-tenant-y-cutover.md` | cubierto | Ya implementado (Memoria por tenant) |
| `adr/0053-repos-dominio-sin-store.md` | cubierto | Ya implementado (grupo 1: tickets, precios, proveedores) |
| `adr/0054-repos-fiscal-sin-store.md` | cubierto | Ya implementado (grupo 2: fiscal) |
| `adr/0055-repos-canales-sin-store.md` | cubierto | Ya implementado (grupo 3: whatsapp y email) |
| `adr/0056-repo-caja-sin-store.md` | cubierto | Ya implementado (grupo 4: caja) |
| `adr/0057-repos-compras-pagos-sin-store.md` | cubierto | Ya implementado (grupo 5: facturas de proveedores y órdenes de pago) |
| `adr/0058-repos-servicios-fiado-sin-store.md` | cubierto | Ya implementado (grupo 6: consumos de servicios y fiado) |
| `01-fundacion/costos-por-cliente.md` | cubierto | 6 Planes y precios |
| `01-fundacion/modo-offline.md` | cubierto | Ya implementado PWA/Sync; 1.4, 1.5; 2.11 CAEA |
| `01-fundacion/verificacion-fuente-oficial.md` | cubierto | 8.2 |
| `02-identidad-onboarding/autenticacion-gestion-usuarios.md` | cubierto | 2b.1 |
| `02-identidad-onboarding/autenticacion.md` | cubierto | 2b.1 |
| `02-identidad-onboarding/onboarding-parte-1.md` | cubierto | 2b.2 |
| `02-identidad-onboarding/onboarding-parte-2.md` | cubierto | 2b.2 |
| `03-inventario-precios/inventario-parte-1.md` | cubierto | Ya implementado; 7.1 |
| `03-inventario-precios/inventario-parte-2.md` | cubierto | 7.1; 6 (F8.4 mora) |
| `03-inventario-precios/inventario-parte-3.md` | cubierto | 7.1 |
| `03-inventario-precios/precios-parte-1.md` | cubierto | Ya implementado Precios; 1.2 |
| `03-inventario-precios/precios-parte-2.md` | cubierto | Ya implementado Precios; 1.2 |
| `04-ventas-caja-fiado/caja-digital-parte-1.md` | cubierto | Ya implementado; 7.2 |
| `04-ventas-caja-fiado/caja-digital-parte-2-turnos.md` | cubierto | Ya implementado; 1.2 |
| `04-ventas-caja-fiado/caja-digital-parte-3-integraciones.md` | cubierto | Ya implementado; 7.2 |
| `04-ventas-caja-fiado/fiado-cuenta-corriente.md` | cubierto | Ya implementado; 1.2 |
| `04-ventas-caja-fiado/ticket-venta-parte-1.md` | cubierto | Ya implementado; 1.2 |
| `04-ventas-caja-fiado/ticket-venta-parte-2.md` | cubierto | Ya implementado; 1.2 |
| `05-compras-servicios-pagos/consumos-servicios.md` | cubierto | 7.4 |
| `05-compras-servicios-pagos/facturas-proveedores.md` | cubierto | 7.3, 7.4 |
| `05-compras-servicios-pagos/ordenes-pago.md` | cubierto | 7.4 |
| `06-fiscal-arca/facturacion-electronica-arca.md` | cubierto | 2 |
| `07-canales-whatsapp-email/bot-whatsapp-parte-1.md` | cubierto | 3 |
| `07-canales-whatsapp-email/bot-whatsapp-parte-2.md` | cubierto | 3 |
| `07-canales-whatsapp-email/notificaciones-email.md` | cubierto | 3.7 |
| `08-operacion-admin-analytics/dashboard-indice-navegacion.md` | cubierto | 6b.4 |
| `08-operacion-admin-analytics/panel-admin-parte-1.md` | cubierto | 6b.2 |
| `08-operacion-admin-analytics/panel-admin-parte-2.md` | cubierto | 6b.2 |
| `08-operacion-admin-analytics/panel-admin-parte-3.md` | cubierto | 6b.2 |
| `08-operacion-admin-analytics/reportes-rotacion.md` | cubierto | 6b.3 |
| `09-frontend-landing-diseno/landing-gaps-modoops.md` | cubierto | 6.3, 6c.2 |
| `historico/panel-admin-version-anterior-DEPRECADA.md` | no aplica | deprecado |
| `adr/0000` | meta | meta (índice) |
| `adr/0001` | cubierto | Ya implementado (base) |
| `adr/0002` | cubierto | Ya implementado (stack) |
| `adr/0003` | cubierto | 1, 6b |
| `adr/0004` | cubierto | Ya implementado caja |
| `adr/0005` | cubierto | 7.3 |
| `adr/0006` | cubierto | 6b.1 |
| `adr/0007` | cubierto | 8.2 |
| `adr/0008` | cubierto | 5.5 |
| `adr/0009` | cubierto | 5.5 |
| `adr/0010` | cubierto | 6c.2 |
| `adr/0011` | cubierto | 6b.1 |
| `adr/0012` | cubierto | 9 |
| `adr/0013` | cubierto | 9 |
| `adr/0014` | cubierto | 9 |
| `adr/0015` | cubierto | 9 |
| `adr/0016` | cubierto | 9 |
| `adr/0017` | cubierto | Ya implementado (slice 0) |
| `adr/0018` | cubierto | 2 |
| `adr/0019` | cubierto | 2 |
| `adr/0020` | cubierto | 6b.4 |
| `adr/0021` | cubierto | 6c.2 |
| `adr/0022` | cubierto | 6c.2 |
| `adr/0023` | cubierto | 1.4 |
| `adr/0024` | cubierto | 1.2 |
| `adr/0025` | cubierto | 1.5 |
| `adr/0026` | cubierto | 7.1 |
| `adr/0027` | cubierto | 7.2 |
| `adr/0028` | cubierto | 3.6 |
| `adr/0029` | cubierto | 6b.2 |
| `adr/0030` | cubierto | 2b.1, 6c.1 |
| `adr/0031` | cubierto | 2b.1 |
| `adr/0032` | cubierto | 5.4 |
| `adr/0033` | cubierto | 5.4 |
| `adr/0034` | cubierto | 5.4 |
| `adr/0035` | cubierto | 5.4 |
| `adr/0036` | cubierto | 5.4 |
| `adr/0037` | cubierto | 5.4 |
| `adr/0038` | cubierto | 5.4 |
| `adr/0039` | cubierto | 3.3 |
| `adr/0040` | cubierto | 3.5 |
| `adr/0041` | cubierto | 3.1 |
| `adr/0042` | cubierto | 3.1 |
| `adr/0043` | cubierto | 3.4 |
| `adr/0044` | cubierto | 4.1 |
| `adr/0045` | cubierto | 4.1 |
| `adr/0046` | cubierto | 4.2 |
| `adr/0047` | cubierto | 6.1 |
| `diseno/PRD-ADAP-01` | cubierto | 9 |
| `diseno/PRD-ALR-01` | cubierto | 3.4 |
| `diseno/PRD-AU-01` | cubierto | 2b.1 |
| `diseno/PRD-AU-02` | cubierto | 2b.1 |
| `diseno/PRD-BOT-01` | cubierto | 3.3, 3.5 |
| `diseno/PRD-BOT-02` | cubierto | 3.2 |
| `diseno/PRD-CAJA-01` | cubierto | 7.2 |
| `diseno/PRD-CAT-01` | cubierto | 7.1 |
| `diseno/PRD-CH-01` | cubierto | 3.6 |
| `diseno/PRD-CP-01` | cubierto | 6b.1 |
| `diseno/PRD-DASH-01` | cubierto | 5.2 |
| `diseno/PRD-DS-01` | cubierto | 5.5 |
| `diseno/PRD-DS-02` | cubierto | 5.5 |
| `diseno/PRD-DS-03` | cubierto | 5.5 |
| `diseno/PRD-E2E-01` | cubierto | 2b.3 |
| `diseno/PRD-FE-01` | cubierto | 2 |
| `diseno/PRD-IA-01` | cubierto | 4.1 |
| `diseno/PRD-LANDING-01` | cubierto | 6.3 |
| `diseno/PRD-LP-01` | cubierto | 6c.2 |
| `diseno/PRD-LP-02` | cubierto | 6c.2 |
| `diseno/PRD-LP-03` | cubierto | 6c.1 |
| `diseno/PRD-LP-04` | cubierto | 4.2 |
| `diseno/PRD-NEG-01` | cubierto | 9 |
| `diseno/PRD-OP-01` | cubierto | 6b.2 |
| `diseno/PRD-PERS-01` | cubierto | 1.2 |
| `diseno/PRD-PLAN-01` | cubierto | 6.1 |
| `diseno/PRD-PLAN-02` | cubierto | 6.2 |
| `diseno/PRD-PWA-01` | cubierto | 1.5 |
| `diseno/PRD-SK-01` | cubierto | 9 |
| `diseno/PRD-SK-02` | cubierto | 9 |
| `diseno/PRD-SK-03` | cubierto | 9 |
| `diseno/PRD-SYNC-01` | cubierto | 1.4 |
| `diseno/PRD-UI-01` | cubierto | 5.4 |
| `diseno/PRD-UI-02` | cubierto | 5.4 |
| `diseno/PRD-UI-03` | cubierto | 5.4 |
| `diseno/PRD-UI-04` | cubierto | 5.4 |
| `diseno/PRD-UI-05` | cubierto | 5.4 |
| `diseno/PRD-UI-06` | cubierto | 5.4 |
| `diseno/PRD-UI-07` | cubierto | 5.4 |
| `diseno/PRD-UX-01` | cubierto | 5.1, 5.3 |
| `diseno/SPEC-UI-00-implementacion.md` | cubierto | 5.4 |
| `diseno/EVIDENCIA-UI-00-tickets.md` | cubierto | Ya implementado UI; 5.4 |
