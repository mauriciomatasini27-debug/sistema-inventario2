# Roadmap - Sistema de Inventario

Fecha: 2026-10-12 (actualizado 2026-10-15). Este archivo reemplaza a `CHECKLIST-documentacion.md` como fuente de estado de implementación (el checklist queda como historia, sin cambios). Estados: `funciona`, `en memoria (store.ts)`, `parcial`, `simulado`, `a verificar`. Basado en relevamientos de `src/` del 2026-10-12; los tests no se corrieron para armar este archivo. Actualización 2026-10-12: UX-S0 (Sonner) y LAND-S11/LAND-S12 (sin Descubrimiento, precios solo desde planes) implementados con `tests/landing.test.ts` 38/38 y `npm run build` en verde. Actualización 2026-10-12: PERS-S1 hecho (sales y cash/movements DB-first en 1 tx con contador sin huecos; suite 710/714 con 2 fallos caja-c11 preexistentes). Actualización 2026-10-13: 422 fiscal post-apply eliminados de `src/pages/api/sales.ts` (código muerto, la puerta decide pre-apply con los mismos inputs); caja standalone sin cambios (un solo INSERT atómico con clave única); base 110 de 136 con store; PERS-S2 hecho 2026-10-13: push/pull sync DB-first verificado en vivo. Actualización 2026-10-13: SUP-S1 a S4 hechos (proyecto Supabase en `ca-central-1`, desvío de `sa-east-1`; `.env` con Session pooler 5432; `npm i @supabase/supabase-js @supabase/ssr`; `db:migrate` 15/15 verificado en DB); restan SUP-S5 y SUP-S6. Actualización 2026-10-14: PRs #1 a #30 fusionados en `main` (cutover por dominio ADR-0053 a 0063, SEC-01, ARQ fases 1 y 2, pila de dependencias ADR-0067 a 0072, guardas ADR-0073); estado verificado contra el código de `main` (`01202ee`); nueva sección "Pendientes priorizados". Actualización 2026-10-14 (tarde): P0.1 a P0.4, P1.1 a P1.6 y P2.1 hechos (SEC-02/03/04, PERS-03 a PERS-07, P1-6, P2-1). Actualización 2026-10-15: P2-2 hecho (ARQ-S4 cerrado, cada repo sobre el puerto Almacen) y P2-3 hecho (ARQ-S8 cerrado, fase 5 de PRD-ARQ-01 completa). P3-1 en curso (PRD-CAT-01 hecho con CAT-S1 a CAT-S6, CAJA-S1 y CAJA-S2 hechos; siguen CAJA-S3 y S4, PWA P1.8 hecho, SYNC-S1 a S7). Journal con 23 entradas para 23 SQL (`0000` a `0022`). `store.` vive solo en `src/lib/repos/_almacen.ts` (72 refs) y `esModoMulti` suma 34 en `src/` (3 en repos). 44 rutas de `src/pages/api` importan `control` desde `src/lib/store.js` y ninguna importa el objeto `store`. Verificado contra `main` (`420ddee`).

Actualización 2026-10-18: auditoría de los PRD y ADR contra el código de `main` (`c73913c`). Se reconcilió el `estado:` del front-matter de 52 docs (ver `docs/INDEX.md`) y quedó la lista de pendientes de "Pendientes priorizados (2026-10-18)". P0, P1 y P2 cerrados; los PRD-PERS-01 a PERS-07, SEC-01 a SEC-04, ISO-01/02, SUP-01, CAT-01, CAJA-01, PWA-01, SYNC-01, DEP-01, PROC-01, ROAD-01, AU-01, LP-02/03/04 y DS-01 pasan a `hecho`.

## Ya implementado

Dato base (2026-10-15): ninguna ruta de `src/pages/api` importa el objeto `store` (44 importan `control` desde `src/lib/store.js`); la memoria sobrevive dentro de `src/lib/repos/_almacen.ts` (72 referencias `store.` y 3 `esModoMulti`, trinquete AT4) y como fuente de verdad en single sin base (P2-2 hecho 2026-10-15, ARQ-S4 cerrado).

| Área | Estado | Qué hay | Rutas | PRD / ADR |
|---|---|---|---|---|
| Sync y dispositivos | funciona (SYNC-S1 a S7 durables, 2026-10-16) | Pull por lotes con cursor estable, heartbeat DB-first, avisos 24/60/72 h con claim atómico (migración 0024), grants/register DB-first y sensibles solo online (`OPERACIONES_SOLO_ONLINE`); copia durable con espejo memoria | `src/pages/api/sync/*`, `src/pages/api/devices/*`, `src/offline/avisos.ts`, `src/db/schema-sync.ts` | PRD-SYNC-01, ADR-0023 |
| Persistencia DB | hecho (PRD-PERS-01 y PRD-PERS-02, 2026-10-18) | PERS-S1 hecho 2026-10-12: `POST /api/sales` y `POST /api/cash/movements` DB-first en 1 tx (sales, tickets, cash, pagos, stock, contador `ticket_counters` sin huecos) con 409 y puerta fiscal pre-apply (422 post-apply muertos eliminados de `sales.ts` 2026-10-13); PERS-S2 hecho 2026-10-13: `POST /api/sync/push` y `GET /api/sync/pull` DB-first (`outbox` + `id_mappings` en 1 tx, replay 200, 409) con espejo memoria; `GET /api/cash/balance` deriva SUM; write-through best-effort en crédito, tickets, precios, proveedores, fiscal y WhatsApp/email; lecturas con `fuente: db\|memoria` | `src/modules/sales/registro_venta.ts`, `src/modules/cash/registro_movimiento.ts`, `src/lib/control-db.ts`, `src/lib/fiscal-db.ts`, `drizzle/*.sql` | PRD-PERS-01, ADR-0024 |
| Caja, ventas, ticket, fiado | hecho (PRD-CAJA-01, CAJA-S1 a S4 2026-10-16) | Rutas y módulos completos de dominio; varios TODO en `cash/caja.ts`, `historial.ts`, `reversion.ts`, `credit/fiado.ts`, `saldos.ts`; `POST /api/credit/payments` y `POST /api/credit/sales-on-account` DB-first con 409 y espejo memoria (migración 0009 `customer_id` a text); `POST/GET/DELETE /api/tickets/link` DB-first con espejo (migración 0005 aplicada a desarrollo) | `src/pages/api/cash/*`, `sales*`, `tickets/*`, `credit/*`, `src/modules/{cash,sales,credit}` | ADR-0004 |
| PWA | hecho (PRD-PWA-01, PWA-S1 a S5; P1-8 2026-10-14) | Manifest, iconos, `sw.js`, SQLite-WASM con `journal_outbox`, `photos_queue` y borrado remoto (revocar-remoto, heartbeat wipe, latido); queda cifrado local como refinamiento | `public/sw.js`, `src/offline/db.ts` | PRD-PWA-01, ADR-0025 |
| Fiscal ARCA | en curso (PRD-FE-01; emisión real bloqueada por P9-2) | Núcleo, WSAA/WSFEv1, lock, idempotencia, NC/ND, QR, KMS y wizard escritos; corre contra `homo-fake.ts`; `crear_arca_provider` sin conectar; `padron.ts` stub; `caea.ts` solo flag; `GET documents/history/export` con unión DB+memoria y doc fiscal de `POST sales` DB-first (`asegurarFiscalDoc` + espejo, 409 frío); `POST retry` con UPDATE atómico T3 y `POST nd` con 409 por header-key (prefijo, unión factura/cobro) DB-first 2026-10-13 (G2a); `GET/POST wizard` DB-first con upsert por tenant y espejo memoria (migración 0010 `fiscal_wizard`) 2026-10-13 (G2b-wizard); `POST delegacion-confirmada` DB-first con `guardarWizard` y espejo 2026-10-13 (G2b-delegación; su tarea vive en `fiscal_jobs` text-keyed desde el slice Control 2026-10-13); emisión durable DB-first con claim + pre-estampa `respuesta_incierta` pre-ARCA, `store` de cinco salidas, reaper `rehidratar_fiscal` y `marcar_no_facturar` como único escritor (migración 0011 PK `fiscal_sequences`, `src/lib/fiscal-emitir.ts`, sin ruta HTTP hasta G2d) 2026-10-13 (G2c); `POST emitir` cáscara fina sobre `emitir_fiscal_durable` con mapeo 200/422/202/409, replay 409 y barrido reaper best-effort por emisión (sin boot hook en Astro standalone; scheduler periódico para slice Control) 2026-10-13 (G2d) | `src/modules/fiscal/*`, `src/pages/api/fiscal/*` (10), `src/db/schema-fiscal*.ts` | PRD-FE-01, ADR-0018, ADR-0019 |
| WhatsApp | parcial | Módulos de consulta, alertas, aviso matutino, resúmenes, vincular y webhook; adaptador Cloud API real; sin número central en Meta | `src/modules/whatsapp/*`, `src/pages/api/whatsapp/*`, `src/jobs/whatsapp-*` | PRD-BOT-02, ADR-0041, ADR-0042 |
| Email | a verificar | Cierre de caja a `email_outbox`; ruta `POST /api/email/send` existe (envío real con Resend a verificar) | `src/modules/email/*`, `src/pages/api/email/send.ts` | PRD-CH-01, ADR-0028 |
| Cobro | parcial (webhook MP durable P0-5 2026-10-14) | Webhook de Mercado Pago con firma HMAC e idempotencia durable por evento (`mp_webhook_events`, migración 0020); sin suscripciones cobrables | `src/pages/api/billing/webhooks/mercadopago.ts` | PRD-CH-01 CH-S4 |
| Landing | funciona (build OK 2026-10-12, `tests/landing.test.ts` 38/38) | 18 secciones en `index.astro` (Descubrimiento eliminado); `Planes.astro` con Plus `Precio a confirmar` y CTA `Probar 14 días` a `/alta?plan`; ningún `$` fuera de `business.planes` (AT2) | `src/pages/index.astro`, `src/components/sections/*`, `src/data/business.ts` | PRD-LP-01 a LP-03, PRD-LANDING-01 |
| Panel `/panel` | parcial (P3-7a a P3-7g 2026-10-17) | Pantallas full de Caja, Stock, Precios, Proveedores, Fiado, Consumos y Reportes; `GET /api/sales/resumen` con agregados de servidor (sin `n-tickets` hardcodeado), devoluciones y correcciones netas; falta el tablero DASH-S* | `src/pages/panel.astro` | PRD-OP-01 OP-S3, PRD-DASH-01 |
| Venta, alta, admin | funciona (verificado P3-6b 2026-10-16) | Páginas existen; admin con mora, flags, señales y ledger en API | `src/pages/{venta,alta,admin}.astro`, `src/pages/api/admin/*` | PRD-CP-01, ADR-0006 |
| Login Google OIDC | funciona (verificado P3-2a/2b 2026-10-16; Google real pendiente) | Slice con `jose`, nonce y PKCE; login con destino y bifurcación admin/tenant | `src/modules/auth/*`, `src/pages/api/auth/*` | PRD-AU-01, PRD-AU-02 |
| Compras, OCR, consumos, órdenes de pago | parcial (compras DB-first 2026-10-13) | `POST /api/suppliers` DB-first con 409 por CUIT; `POST /api/purchase-orders` cabecera+líneas en 1 tx y `close` durable; `supplier-invoices` (drafts/discard/confirm/match/account/payments) DB-first con confirm en 1 tx (factura+borrador+log+cierre OC); espejo memoria; OCR Fase 0 ratificado por ADR-0089 (benchmark del piloto pendiente) | `src/modules/{purchases,ocr,utilities,payments,pagos-tx}`, `src/pages/api/{supplier-invoices,ocr,utility-bills,payment-orders}/*`, `src/lib/compras-db.ts` | FP1-FP12, CS1-CS12, OP1-OP13, ADR-0005 |
| Precios | parcial (ajustes DB-first 2026-10-13) | `prices/preview` pura sin store; `POST /api/prices/adjustments` DB-first con 409 y espejo memoria | `src/modules/pricing/*`, `src/pages/api/prices/*` | GP1-GP11 |
| Onboarding y tenants | funciona (verificado P3-2c 2026-10-16) | Rutas de onboarding y aprovisionamiento; jobs de provisión durables con claim + tx única y espejo memoria (`POST tenants` y `POST onboarding/alta` delegan al runner, 201/409 por requestKey, `persistirTenantAlta` con id explícito); outbox transaccional con drain por reclamo (`POST admin/senales/consumir`); delegación fiscal en tabla propia text-keyed (`fiscal_jobs`, migración 0013); kill real converge a activo con un job por requestKey (migraciones 0012 claim en `provision_jobs` y 0014 claim en outbox) | `src/modules/onboarding/*`, `src/modules/tenants/*`, `src/pages/api/onboarding/*`, `src/jobs/aprovisionar.ts` | ON1-ON13, ADR-0011 |
| Reportes de rotación | funciona (verificado P3-6a 2026-10-16; UI del tablero pendiente) | Módulo y rutas de analytics con RT1-RT11 en núcleo | `src/modules/analytics/*`, `src/pages/api/analytics/*` | RT1-RT11 |
| UI y sistema de diseño | parcial (Tema Papel avanzado; T-UI-01 a T-UI-07) | Cero `alert()`; contraste AA 13/13 pares y tema claro/oscuro por dispositivo; Sonner, diálogos de confirmación, errores con fix, virtualizado, harness `venta` y gate `interface-review`; DS-S1 a S23 con slices pendientes | `src/components/ui/Toaster.tsx`, `src/styles/global.css`, `scripts/check-ui.mjs`, `scripts/check-contrast.mjs` | SPEC-UI-00, EVIDENCIA-UI-00, ADR-0032 a 0038 |
| Aislamiento fiscal por tenant | hecho (PRD-ISO-01, ISO-S1 a S4; SEC-02/03 2026-10-14) | `tenantDeRequest` con sesión + membership en `TENANT_MODE=multi` (single por defecto, sin cambios); `getTenantDb` fail-closed en multi; `fiscal_documents.tenant_id` (migración `0015`); `documents`, `history` y `export` filtran DB y memoria; `tests/iso-fiscal-tenant.test.ts` 7/7. Falta: resto del plano de datos sin tenant, `wizard.ts` toma `tenant_id` del body, backfill | `src/lib/tenant-context.ts`, `src/lib/tenant-mode.ts`, `src/lib/fiscal-db.ts`, `src/pages/api/fiscal/*` | PRD-ISO-01, ADR-0050 |
| Aislamiento del plano de datos | hecho (PRD-ISO-02, ISO-S5 a S9) | Middleware resuelve el tenant por request (`AsyncLocalStorage`) para 16 prefijos de datos y corta 403 en `TENANT_MODE=multi` sin tenant; `getTenantDb()` toma el contexto; wizard y delegación usan el tenant del contexto (403 si el body pide otro); docs fiscales sin dueño rechazados; `scripts/backfill-tenant-id.mjs` en seco por defecto. Falta: memoria de `store.ts` global, jobs por `X-Job-Secret` sin tenant, backfill real | `src/lib/tenant-mode.ts`, `src/lib/tenant-context.ts`, `src/middleware.ts`, `scripts/backfill-tenant-id*.mjs` | PRD-ISO-02, ADR-0051 |
| Memoria por tenant y cutover multi | hecho (PRD-PERS-02, PERS2-S1 a S26, ADR-0052 a 0063) | `store` particionado por tenant (Proxy sobre `tenantActual()`), en multi sin base del tenant 503 `base_no_disponible` (excepción fiscal en memoria particionada), jobs con `X-Job-Secret` exigen `X-Tenant-Id` en multi, `scripts/pg-local.sh` + `tests/pers2-pg.test.ts` contra Postgres local. Falta: PERS-S4 por dominio, PERS-S5 (110 rutas con `store`), fan-out de jobs | `src/lib/store.ts`, `src/lib/server-db.ts`, `src/lib/tenant-context.ts`, `src/middleware.ts`, `scripts/pg-local.sh` | PRD-PERS-02, ADR-0052 |
| Arquitectura amigable para agentes | hecho (PRD-ARQ-01, fases 1 a 5; P2-1 a P2-3) | `ctx()`, `FechaAR`, LF, JSON tipado; CI `ci` con `typecheck`, `check:arch`, `npm test` con Postgres de servicio (bases A y B) y `build`; trinquetes con baselines | `tests/arch/*`, `.github/workflows/ci.yml` | PRD-ARQ-01, ADR-0065, ADR-0073 |
| Dependencias | funciona (fusionado #22 a #29) | Actions v7, vitest 5, astro 7, drizzle 0.45, zod 4, TypeScript 7 | `package.json` | PRD-DEP-01, ADR-0067 a 0072 |
| Catálogo, lotes y ubicaciones | hecho (PRD-CAT-01, CAT-S1 a S6, 2026-10-16) | Alta y CRUD de productos con búsqueda difusa, lotes FEFO, ubicaciones y conteo por sector; tablas en migraciones 0017 y 0021 | `src/pages/api/products.ts`, `lots.ts`, `locations.ts`, `counts.ts`, `src/lib/repos/catalogo.ts` | PRD-CAT-01, ADR-0026 |
| Asistente IA, chat de landing, planes y umbrales | parcial (núcleo hecho 2026-10-16) | Asistente de catálogo cerrado con `ai_usage` y cupo (IA-S1 a IA-S5), chat de landing aislado (LP4-S1 a S5), planes de ejemplo con cambio de plan (PLAN-S1/S2/S4) y alertas de stock bajo con `min_stock`/`reorder_qty` (ALR-S1/S2); faltan proveedor LLM real, cobro y envío real de canales | `src/modules/ia/*`, `src/pages/api/landing-chat.ts`, `src/lib/repos/planes.ts`, `src/modules/alertas/*` | PRD-IA-01, PRD-LP-04, PRD-PLAN-01, PRD-ALR-01 |

## Pendientes priorizados (2026-10-18)

Auditoría 2026-10-18 de los PRD y ADR contra el código de `main` (`c73913c`); el front-matter `estado:` de cada PRD/ADR se reconcilió con la evidencia (ver `docs/roadmap/avances/`). P0, P1 y P2 quedaron cerrados. Lo que falta, por cercanía a cobrable y después por nivel de `archivo/0000-indice-prd-ordenado.md`.

### Cerrado desde 2026-10-15
1. P0. Seguridad y aislamiento: SEC-02/03/04 y P0-5 hechos (ADR-0074, 0075, 0077); PRD-SEC-01 a SEC-04 hechos.
2. P1. Integridad de datos: PERS-03 a PERS-07 hechos (ADR-0078 a 0082), más P1-6, P1-7 y P1-8; PRD-PERS-01 a PERS-07 hechos.
3. P2. Arquitectura: fases 3 a 5 cerradas (P2-1 a P2-3), SUP-S5/S6 hechos; PRD-ARQ-01 y PRD-SUP-01 hechos.

### En curso
1. PRD-FE-01 fiscal: cablear `crear_arca_provider_desde_env` al worker, computador fiscal homo (CSR + certificado WSASS + clave cifrada), homologación real de Factura C con CAE, `arca_tokens` cifrado y `fiscal_points_of_sale`; la emisión real espera P9-2 (fecha límite ARCA 1/12/2026).
2. PRD-OCR-01: benchmark del piloto (OCR1-S3), ingesta de Gmail y descarga de media (OCR1-S5); motor PaddleOCR ratificado por ADR-0089.
3. PRD-BOT-01 y PRD-BOT-02: módulos por rubro (S5/S6 detrás de `BOT_RUBROS_AVANZADOS`, S8 acciones propuestas) y `pg_trgm` + `product_aliases`; el envío real espera P9-3.
4. PRD-PLAN-01: cobro (PLAN-S3) y resto de catálogo/panel/upsell; los montos esperan P9-5.
5. PRD-DASH-01: DASH-S2/S5/S6/S7/S9/S12/S13 (historial del bot, destinatarios, historial de alertas, drawer del asistente, índice sin hardcode).
6. PRD-DS-02 y PRD-DS-03 (slices S13 y S18/S22/S23), PRD-UI-01 a UI-07 y PRD-UX-01: verificación de diseño en curso.
7. PRD-OP-01: OP-S1 real (tenants/rollouts, `audit` deja de ser alias); PRD-CH-01: CH-S2 (media/R2) y CH-S3 (cola real).
8. PRD-AU-02 (AU2-S6, allowlist dual de `POST /api/tenants`) y PRD-E2E-01 (E2E-S5, `GET /api/demo/quien-soy`).
9. PRD-SK-01 a SK-03, PRD-NEG-01, PRD-ADAP-01 y PRD-PS-01: cumplimiento a verificar.

### Sin empezar (propuesto)
1. PRD-CP-01 Control Plane; PRD-LANDING-01 (fusión de planes a la landing).
2. Bloqueados por decisión o credencial externa: PRD-FE-02 (P9-2), PRD-BOT-03 (ejecución tras P9-3), PRD-PLAN-02 y PRD-PLAN-03 (tras P9-5).
3. Proceso: PRD-COM-01 poda de comentarios (ADR-0064 propuesto).

## Para implementar

Orden por prioridad y dependencias. Tallas de cada PRD.

### 1. Base de datos (bloquea todo lo cobrable)
1. Hecho 2026-10-14 (P1-7), ampliado 2026-10-16: journal de migraciones con 28 entradas que coinciden con los 28 SQL `0000` a `0027` (a `0020` webhook MP, `0021` location_id y `0022` cash_qr_receipts se sumaron `0023` cash_due_items, `0024` device_sync_avisos, `0025` planes_suscripciones, `0026` ai_usage y `0027` products_min_stock).
2. Hecho (PERS-S1/S2 2026-10-13 y cutover por dominio grupos 1 a 11, PRD-PERS-02, ADR-0052 a ADR-0063): 0 rutas de `src/pages/api` importan `store`; `store.` vive solo en `src/lib/repos/_almacen.ts`. Resta el refinamiento de mapas en memoria dentro de repositorios ya cubiertos por tablas.
3. Hecho 2026-10-18 (PRD-SUP-01): SUP-S5 (fuente `db` en Supabase, verificado en vivo) y SUP-S6 (tests) hechos; `adr/0048-supabase-single-project.md` y `adr/0049-supabase-driver-pooler.md`; guía en `docs/migracion-supabase.md`.
4. Hecho 2026-10-16 (PRD-SYNC-01, ADR-0023): `device_sync_state`, `offline_grants` y avisos DB-first con claim atómico (SYNC-S1 a S7).
5. Hecho (PWA-S4 `photos_queue` y PWA-S5 borrado remoto, P1-8 2026-10-14); el cifrado local queda como refinamiento (ADR-0025).

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
1. PRD-AU-01 hecho 2026-10-16 (AU-FIX-S1 a S6); PRD-AU-02 en curso: resta AU2-S6 (allowlist dual de `POST /api/tenants`); Google real y migración de `pendingAuth` pendientes.
2. Onboarding ON1-ON13 verificado 2026-10-16 (P3-2c); pendientes: respaldo por plantilla Meta, reintentar de admin, seed de ubicaciones, tour overlay, cupo de prueba y PWA/cámara.
3. Flujo demo de dos tenants E2E (PRD-E2E-01, en curso): resta E2E-S5 (`GET /api/demo/quien-soy`).
4. PRD-SEC-01 a SEC-04 hechos (ADR-0066, 0074, 0075, 0077).

### 3. WhatsApp y canales
1. Alta del número central en Meta, verificación del negocio y plantillas (ADR-0041, ADR-0042, ADR-0091): externo; P9-3 decidido 2026-10-18 (ejecución por PRD-BOT-03).
2. PRD-BOT-02 consulta de stock por WhatsApp (BOT2 núcleo hecho 2026-10-16); resta `pg_trgm` + `product_aliases` y detalle por lote.
3. PRD-BOT-01 módulos por rubro (BOT-S1 a S4 y S7 hechos; resta S5/S6 detrás de `BOT_RUBROS_AVANZADOS` y S8 acciones propuestas; ADR-0039).
4. PRD-ALR-01 umbrales y alertas (ALR-S1/S2 hechos; resta S3 canal por encargado y `pg_cron`/`notification_events` durable; ADR-0043).
5. Resumen mensual del bot (ADR-0040, BOT-S7) hecho 2026-10-16.
6. Canales PRD-CH-01 (ADR-0028): las cuatro rutas existen; falta CH-S2 (media/R2) y CH-S3 (cola real).
7. Email NE1-NE17 con Resend, SPF/DKIM/DMARC (`notificaciones-email.md`): envío real a verificar (credenciales).

### 4. Asistente IA y chat
1. PRD-IA-01: catálogo cerrado, `ai_usage` y cupo hechos (IA-S1 a IA-S3, IA-S5, IA-LLM-FREE); resta IA-S4 (rutas del asistente y canal WhatsApp) y el proveedor LLM real (credenciales).
2. PRD-LP-04 hecho 2026-10-16 (`ChatLanding.astro` reemplaza `FloatingWhatsApp.astro`; ADR-0046); DASH-S10 cubierto por el núcleo de DASH-01.

### 5. Dashboard y diseño
1. UX-S0: hecho 2026-10-12 (commit `70c7a67`): React, `@astrojs/react` y Sonner instalados, `src/components/ui/Toaster.tsx` con tokens de Tema Papel (`bottom-center` en móvil, `top-right` en escritorio, `richColors` apagado), un solo `<Toaster client:idle />` en panel y `BaseLayout`; `npm run build` y `check:ui` 10/10 en verde.
2. PRD-DASH-01 en curso: DASH-S1/S3/S4/S8/S10/S11 hechos (2026-10-17); restan S2, S5, S6, S7, S9, S12 y S13 (bot, alertas, asistente, chat, índice sin hardcode).
3. PRD-UX-01 (UX-S1 a S12) en curso, apoyado en los T-UI.
4. PRD-UI-01 a UI-07 (UI-S1 a UI-S31, ADR-0032 a 0038) en curso; T-UI-01 a T-UI-07 hechos 2026-10-17 (diálogos, Virtuoso/NumberFlow, errores con fix, contraste 13/13, harness `venta` y gate `interface-review`).
5. Sistema de diseño Tema Papel: PRD-DS-01 hecho; PRD-DS-02 y DS-03 en curso (slices pendientes; SPEC-UI-00 decidió quedarse con `--color-*`).

### 6. Planes y precios
1. PRD-PLAN-01 en curso: PLAN-S1/S2/S4 y S10 hechos 2026-10-16; restan cambios de plan (S3/S5/S6), panel y upsell, cupos/cobro (S13/S14) y captación.
2. PRD-PLAN-02 propuesto: verificar tarifa Meta, piloto de costos, regla de margen y condiciones de publicación (PLAN2-S1 a S5); bloqueado por los montos (P9-5).
3. PRD-LANDING-01 propuesto: tarjetas con precio publicado, comparativa y chat de captación; LAND-S11 y LAND-S12 hechos 2026-10-12 (commit `39c9cf1`; Descubrimiento eliminado, Plus en `Precio a confirmar`, CTA por plan a `/alta?plan`).

### 6b. Operación y plataforma
1. Control Plane PRD-CP-01 (CP-S1 a S16, ADR-0011, ADR-0006): propuesto.
2. Panel admin PA1-PA14 y PRD-OP-01 (OP-S1 a OP-S4, ADR-0029): PA1-PA14 verificados 2026-10-16 (P3-6b) y OP-S2/S3/S4 hechos; resta OP-S1 real (tenants/rollouts, `audit` deja de ser alias).
3. Reportes de rotación RT1-RT11 (`reportes-rotacion.md`): núcleo verificado 2026-10-16 (P3-6a); resta la UI del tablero.
4. Índice y navegación del dashboard (`dashboard-indice-navegacion.md`, ADR-0020): lo absorbe DASH-S12.

### 6c. Landing pendiente fuera de planes
1. PRD-LP-03 accesos `Mi comercio` y `Admin` (LP3-S1 a S5, ADR-0030): hecho 2026-10-16.
2. Gaps E8 a E13 de `landing-gaps-modoops.md` (SEO, OG, UTM, nav, migración, higiene comercial) vía OP-S4; PRD-LP-01 (S7 SEO/meta pendiente, en curso) y PRD-LP-02 (hecho).

### 7. Núcleo comercio pendiente
1. PRD-CAT-01 hecho 2026-10-16 (CAT-S1 a S6, ADR-0026).
2. PRD-CAJA-01 hecho 2026-10-16 (CAJA-S1 a S4, ADR-0027); resta la ingesta QR real por bot/Gmail.
3. OCR Fase 0: motor ratificado como PaddleOCR propio (ADR-0089); benchmark del piloto e ingesta real en curso (PRD-OCR-01).
4. Compras, consumos y órdenes de pago (FP1-FP12, CS1-CS12 con Gmail `users.watch`, OP1-OP13): cableado real parcial, verificado 2026-10-16 (P3-3a/3-3b); depende de OCR y de credenciales.

### 8. Legal y fiscal
1. Consulta con contador y abogado: Ley 25.326, leyenda del ticket, ARCA y facturación de la suscripción.
2. Verificación en fuente oficial de las 5 APIs en consola y dispositivo (`verificacion-fuente-oficial.md`): parcial.

### 9. Proceso y negocio (no es código)
1. PRD-NEG-01 catálogo y oferta (ADR-0012; NEG-S8 superado por PRD-LANDING-01), PRD-ADAP-01 adaptación desde ModoOps (ADR-0013), skills PRD-SK-01 a SK-03 (ADR-0014 a 0016): cumplimiento a verificar.
2. Poda de comentarios de código (PRD-COM-01, ADR-0064 propuesto): aplicar el grupo borrar del plan `diseno/PLAN-COM-01-poda-comentarios.md`, abrir issues del grupo refactor, regla de lint y checklist de PR. Talla M.
3. Arquitectura amigable para agentes (PRD-ARQ-01, ADR-0065 aceptado): hecho (fases 1 a 5; P2-1 a P2-3). `ctx()`, `FechaAR`, LF y JSON tipado, `tsc`/tests/trinquetes de arquitectura, arch-test de evidencia y puerto `Almacen<T>` en cada repo.
4. Actualización de dependencias (PRD-DEP-01, ADR-0067 a 0072 aceptados; fusionado en `main` 2026-10-14): pila de 6 PRs que reemplaza los Dependabot #6 a #19; Actions, vitest 5 y astro 7 cierran las 4 alertas críticas; después drizzle 0.45, zod 4 y TypeScript 7. Talla M.

<!-- roadmap:avances:inicio -->
## Avances por PR (generado)

No se edita a mano: se regenera con `npm run roadmap` desde `docs/roadmap/avances/`.

| Fecha | Item | Estado | Avance | PRD / ADR |
|---|---|---|---|---|
| 2026-10-18 | P1-9 | hecho | P1-9: el login persiste el usuario en `users`, así el alta de comercio deja de fallar la FK y llega a Supabase. | — / — |
| 2026-10-18 | OCR1-S3 | parcial | OCR1-S3 parcial: benchmark del extractor OCR sobre un corpus etiquetado (tests/ocr-benchmark.test.ts, exactitud global 0.9667); la medición sobre el set del piloto y la latencia de Paddle esperan las imágenes y el endpoint. | PRD-OCR-01 / ADR-0005 |
| 2026-10-18 | OCR1-S4 | hecho | OCR1-S4 hecho: el umbral de fallback vive en `UMBRAL_FALLBACK_NUBE = 0.6` (`src/modules/ocr/motor.ts`, ADR-0089 prevé subirlo a 0.7); decisión: `Extraccion.nubeOfrecida` queda verdadera solo cuando Paddle respondió bajo el umbral (pdf, texto directo y motor caído E6 no la ofrecen), la ruta 201 y el evento `ocr_borrador_listo` responden `fallback_nube: "ofrecido"` con `revisa` y borrador `pendiente` sin llamar a Vision ni Textract ni exponer claves/endpoints (AT2), y `GET /api/ocr/jobs/:id` deriva `fallback_nube` del evento ya persistido vía `buscarFallbackNubeJob` (`src/lib/repos/ocr.ts`, jsonb `payload->>'job_id'`), sin columna nueva ni migración. | PRD-OCR-01 / ADR-0005 |
| 2026-10-18 | OCR1-S5 | parcial | OCR1-S5 parcial: la ingesta vive una sola vez en `src/lib/ocr-ingesta.ts` (`ingerirOcr` + `respuestaIngesta`) y `POST /api/ocr/jobs` quedó como cáscara con el mismo contrato HTTP; decisión: el webhook reconoce `image`/`document` de la Cloud API (`normalizarAdjuntoEntrada`, media id + mime_type), valida el mime (415 + texto corto si no es comprobante, sin job) y descarga el media con las credenciales del número central (`descargar_media`, dos saltos: metadata y binario), entregando los bytes como `ImagenOcr` al motor OCR (el body del motor ya no lleva referencia, solo bytes en base64 + mime); el job, el borrador y el evento conservan `wa-media:<id>` como referencia de auditoría, y si la descarga falla el bot responde un mensaje de reintento sin crear job; llama la ingesta con Idempotency-Key = wamid, `origen: "wa"`, `bytes_ref: "wa-media:<id>"` y `es_comprobante: true`, y corre todo inline en la request, sin cola; el job y el borrador quedan en el tenant del número vía `conTenant` y el mismo wamid dos veces no crea ni un segundo job ni una segunda respuesta (AT1), la oferta es un `interactive` de botones con `Confirmar` / `Editar` / `Descartar` e ids `ocr:<acción>:<borradorId>` armados por la función pura `payload_borrador_ocr` (`src/modules/whatsapp/ocr-borrador.ts`) y enviados por `enviarPayload` del transporte, y el toque de esos botones ya se atiende: `normalizarBotonEntrada` lo parsea en la frontera, `parsear_boton_ocr` decide la acción y `atenderBotonOcr` despacha después de la puerta de identidad; Descartar cierra el borrador al toque desde el número dueño con `descartarBorradorOcrRepo` dentro de `conTenant` y registra el evento `ocr_descartado`, Confirmar deriva a la web (AU10.4) y Editar también por ahora (ADR-0005 pide el flujo por texto), y un botón inválido responde sin ejecutar (en multi, un borrador de otro comercio no se encuentra y responde igual); quedan para después: el pull real de Gmail (`history.list` con OAuth de Mauri) y la prueba en vivo del número central (P9-3). | PRD-OCR-01 / ADR-0005 |
| 2026-10-18 | IA-LLM-FREE | hecho | IA-LLM-FREE: adaptador de proveedor LLM compatible con la API OpenAI (Groq free como puente) detrás de `ProveedorLLM`, con `crear_proveedor_llm_desde_env`; falta cablear la ruta del asistente (IA-S4). | PRD-IA-01 / ADR-0045 |
| 2026-10-18 | PLAN-S2 | hecho | PLAN-S2 hecho: PATCH /api/bot-modulos bloquea encender un módulo de rubro con 403 `fuera_de_plan` cuando el plan activo no incluye `bot_rubro` (bajar sigue permitido y sin suscripción no cambia el comportamiento). | PRD-PLAN-01 / ADR-0047 |
| 2026-10-18 | PLAN-S4 | hecho | PLAN-S4 hecho: `POST /api/plan/cambiar` (solo Dueño) programa la baja a fin de período en `plan_programado` sin reintegro y fija `hasta` con la fecha en que rige (`hasta` vigente o el próximo aniversario mensual de `desde` en fecha AR, `src/modules/planes/ciclo.ts`); decisión: el cambio se ancla en `hasta` al programarlo para que `leerSuscripcionActiva` ruede el plan vigente al llegar esa fecha aunque nadie lea ese día (sin job; persistencia best-effort, el ciclo nuevo arranca ese día), el mismo plan cancela el programado, subir responde 409 `requiere_cobro` hasta que PLAN-S3 defina el cobro (P9-5) y `/panel/plan` muestra "Tu plan pasa a … el DD/MM/AAAA". | PRD-PLAN-01 / ADR-0047 |
| 2026-10-18 | SUP-S5 | hecho | SUP-S5: prueba viva contra Supabase con venta y `GET /api/cash/balance`, `GET /api/tickets` y balance de credit con `fuente: "db"`, escritura real en sales/tickets/cash_movements/stock_movements y alta durable de comercio (fix P1-9). | PRD-SUP-01 / ADR-0048 |
| 2026-10-18 | SUP-S6 | hecho | SUP-S6: `npm test` verde en `tests/sync-durable.test.ts`, `tests/pers-write-through.test.ts` y `tests/credit-rutas.test.ts`; `npm run verify` ok (9 pasos). | PRD-SUP-01 / ADR-0048 |
| 2026-10-18 | P9-1 | hecho (decisión tomada) | P9-1 desbloqueado: Mauri aprobó ADR-0089 el 2026-10-18 y ratificó PaddleOCR PP-OCRv5 autohospedado como motor primario de Fase 0; pasa a ejecución por PRD-OCR-01. | PRD-OCR-01 / ADR-0089 |
| 2026-10-18 | P9-2 | bloqueado (diferido por Mauri) | P9-2 sigue bloqueado: Mauri difirió la decisión el 2026-10-18; ADR-0090 queda propuesto hasta que designe contador y abogado. | PRD-FE-02 / ADR-0090 |
| 2026-10-18 | P9-3 | hecho (decisión tomada) | P9-3 desbloqueado: Mauri aprobó ADR-0091 el 2026-10-18 y eligió la Cloud API directa de Meta para el número central; pasa a ejecución por PRD-BOT-03. | PRD-BOT-03 / ADR-0091 |
| 2026-10-18 | P9-5 | hecho (decisión tomada) | P9-5 desbloqueado: Mauri aprobó ADR-0092 el 2026-10-18 y eligió Mercado Pago en pesos con débito automático; pasa a ejecución por PRD-PLAN-03. | PRD-PLAN-03 / ADR-0092 |
| 2026-10-17 | P9-4 | hecho | P9-4 hecho: migraciones 0016 a 0019 (y hasta 0028) aplicadas en la base real, registradas en `docs/roadmap/migraciones-aplicadas.md`; el backfill de `tenant_id` corre con `scripts/backfill-tenant-id.mjs` (P0-3, `--apply`). | — / — |
| 2026-10-17 | DS-S21 | hecho | DS-S21: el papel del email pasa a un solo lugar, `src/modules/email/papel.ts`, que arma el documento completo (metas `color-scheme` y `supported-color-schemes`, `color-scheme: light dark` en el root, `<style>` con `@media (prefers-color-scheme: dark)` a `#1a1a1a`/`#f7f5f2` y bordes `#3a3a3a`) sobre las nueve plantillas de `src/modules/email/`, con las clases estables `ne-papel`, `ne-mute`, `ne-tabla` y `ne-cta` para que la media query alcance el inline claro; el CTA queda `#bf360c` con blanco a 44px de alto (14+14 de padding más 16 de línea) y `display:block`, y las tablas con `table-layout:fixed` y `overflow-wrap:anywhere` para entrar a 360px; decisión: documento entero y no fragmento porque los metas de color-scheme solo existen en `<head>` y el outbox entrega el html tal cual al proveedor sin otra capa que envuelva, y el inline queda con la base clara para los clientes que ignoran `<style>`; trinquete en `tests/email-papel.test.ts` (57 casos sobre las 16 salidas generadas, sin `<img>` en ninguna), pares nuevos de dark en `check:contrast` (69/69) y regenerado `docs/diseno/contraste-aa.md`. | PRD-DS-03 / ADR-0002 |
| 2026-10-17 | DS-LANDING-AA | hecho | Landing `/` legible en Tema Papel con header claro (decisión de Mauri): texto oscuro en secciones claras y claro en las oscuras, botón WhatsApp con token `--color-whatsapp` y texto `void` (también en `/alta/estado`), CTA de emails en `#bf360c`, 3 pares nuevos en `check-contrast` (16/16), spec Playwright que mide el contraste real de cada texto a 360px y 1280px, trinquete estático `tests/landing-legibilidad.test.ts` y `/admin` sin desborde a 360px. | PRD-DS-01 / ADR-0008 |
| 2026-10-17 | DS-S1 | hecho | DS-S1: paleta llama completa en `global.css` (`@theme`) y `tokens-papel.css` con los mismos nombres (`--color-llama-hover #ffe033`, `--gradiente-llama` 135deg llama/naranja/deep, `--sombra-cta 0 4px 14px rgba(230,74,25,0.35)` y `--sombra-cta-hover 0 6px 18px`), más la clase única `sg-flame-cta` (fondo `star-glow`, blanco 600 con `0.02em`, sombra del CTA, hover con `color-mix(star-glow 85%, #000)` y `--sombra-cta-hover`, active `scale(0.98)`, foco bitono y sin transición ni scale bajo `reduce`) que reemplaza a las clases sueltas del `primary` de `Button.astro`, del CTA de `SiteHeader.astro` y de los dos botones de `Contacto.astro` (WhatsApp verde y ember sin tocar); `#ffe033` salió de los alias locales de `panel.astro`/`admin.astro` al token, par nuevo de contraste en `check:contrast` (70/70) y trinquete en `tests/ds-s1-cta-llama.test.ts`; decisión: el CTA primario con texto blanco vive en `star-glow #bf360c` (5.60:1) y su hover en `#a22e0a` vía `color-mix` (7.16:1), no en el gradiente amarillo→naranja ni en deep `#e64a19` (~3.9:1 con blanco), porque esos tonos no llegan a 4.5:1 con blanco y el gradiente queda solo como token decorativo sin texto. | PRD-DS-01 / ADR-0008 |
| 2026-10-17 | DS-S12 | hecho | DS-S12: la franja KPI de `/panel` (`KpiStrip.astro`) arranca con skeleton y shimmer sutil en tokens `--tema-*` y `aria-busy="true"`; al llegar `/api/sales/resumen` y `/api/cash/balance` los valores entran escalonados (60 ms por KPI) y `aria-busy` pasa a `false`; con `prefers-reduced-motion: reduce` el skeleton queda estático y sin entrada. | PRD-DS-02 / ADR-0008 |
| 2026-10-17 | DS-S17 | hecho | DS-S17 hecho: `/venta` con `viewport-fit=cover` y padding `env(safe-area-inset-*)`, touch 44px y 360px sin desborde cubiertos por los specs e2e, y el skeleton con shimmer de los KPI de `/panel` cerrado en DS-S12 (`docs/roadmap/avances/DS-S12.md`). | PRD-DS-02 / ADR-0008 |
| 2026-10-17 | DS-S2 | hecho | DS-S2: tokens ember (`--color-ember-ambar/coral/rojo/vino`) en `global.css` y `tokens-papel.css` y el segbar del panel (`panel.astro`) en ámbar, coral y vino; ember queda solo en secundarias, nunca CTA primario. Marca 2 (2026-10-17, aprobado por Mauri): ember por módulo en `src/lib/panel-modulos.ts` (`EMBER_MODULO`, `emberModulo`, `ember` en `pillsPanel`) con punto decorativo en las pills (`TopPills.astro`), punto en las etiquetas de los KPI (`KpiStrip.astro`), borde superior ember en las cards secundarias de `/panel` y en `/panel/plan` (`.card-ember--<tono>` en `tema.css`), serie `--serie-ember` (vino en claro, ámbar en oscuro) en el gráfico de ventas y la dona, y el segmento "Mora" del segbar de `/admin` en coral. Trinquete en `tests/marca2.test.ts`. | PRD-DS-01 / ADR-0008 |
| 2026-10-17 | DS-S3 | hecho | DS-S3: papel `#f7f5f2` (`var(--color-canvas)`) en `/venta`, `/alta`, `/alta/estado` y `/t/[token]` en lugar de `#f5f1e8`, tokens de `tokens-papel.css` en esas páginas y en `/admin` (muted viejo `#8a8578` pasa a ash AA), `manifest.webmanifest` en `#f7f5f2` y trinquete `tests/tema-papel-adopcion.test.ts`; la landing con texto claro sobre papel queda como HIGH previo en `docs/diseno/AUDITORIA-DS-tema-papel.md`. | PRD-DS-01 / ADR-0008 |
| 2026-10-17 | DS-S4 | hecho | DS-S4: tema claro/oscuro por dispositivo con `src/styles/tema.css` (roles `--tema-*` y `--estado-*`), `src/lib/tema.ts`, `TemaInicial.astro` (sin flash) y `TemaToggle.astro` (44px, `aria-pressed`); sistema por defecto en `/venta`, `/panel` y el shell, sin ambiente radial (decisión de Mauri), con trinquete en `tests/tema.test.ts` y e2e `tests/e2e/tema.spec.ts`. Marca 2 (2026-10-17): `/admin` suma `TemaInicial`/`TemaToggle` y sus colores pasan a los roles `--tema-*` (claro y oscuro); el toggle muestra a qué tema lleva ("☾ Oscuro" en claro, "☀ Claro" en oscuro) sin perder `aria-pressed`, con el nombre accesible "Tema oscuro" / "Tema oscuro, cambiar a claro". En oscuro el segbar vacío de `/panel` ya no pinta un segmento blanco. E2e en `tests/e2e/tema.spec.ts` (ahora con `/admin`) y `tests/e2e/marca2.spec.ts`. | PRD-DS-01 / ADR-0008 |
| 2026-10-17 | DS-S5 | hecho | DS-S5: vidrio en panel/POS con `.vidrio-barra`/`.vidrio-card` (blur 16px bajo `@supports`, fallback opaco y `prefers-reduced-transparency`); la landing sigue sin glass (ADR-0010) y los pares de contraste del peor caso quedan en `docs/diseno/contraste-aa.md`. | PRD-DS-01 / ADR-0008 |
| 2026-10-17 | DS-S6 | hecho | DS-S6: pila del sistema (`--font-sans` en `global.css` y `tokens-papel.css`) en todas las páginas, se quitó el `<link>` de Inter y los `preconnect` a Google Fonts de `BaseLayout.astro` y se alinearon `/venta`, `/panel`, `/admin`, `/alta`, `/alta/estado` y `/t/[token]`; Montserrat queda descartado. | PRD-DS-01 / ADR-0008 |
| 2026-10-17 | T-UI-05 | hecho | T-UI-05: medición de contraste AA por par en `scripts/check-contrast-lib.mjs` con umbral texto 4.5 / grande 3.0, tabla generada por `node scripts/check-contrast.mjs --md` en `docs/diseno/contraste-aa.md` (13/13 PASS), muted grey `#8a8578` a `#6e695d`, botón del panel a star-glow con hover void, heatmap con `role="img"` y aria-label, StockCard y componentes del panel sin hex hardcodeado y controles a 44px. | PRD-UX-01 / ADR-0008 |
| 2026-10-17 | DS-S15 | hecho | DS-S15: la tabla virtualizada de `/panel/stock` y `/panel/precios` (`TablaCatalogo.tsx`) pasa a `.875rem` con celdas `.45rem` centradas, header sticky en `--tema-fondo` con peso 600 y borde de 2px (deep 15%), filas transparentes con hover naranja 6% y fila seleccionada deep 10% sin transiciones, y SKU/cantidades en peso 500 con `--tema-enfasis` (star-glow en claro y ámbar en oscuro, porque deep como texto no pasa AA); decisión: "seleccionada" es la fila del SKU elegido en el formulario de la página (select de precios, SKU de lote o ingreso en stock) vía `marcarSkuSeleccionado` en `catalogo-panel.ts`, con `data-seleccionada` y `aria-current` (sin clic nuevo en filas ni `aria-selected`, porque la tabla no es grid); roles nuevos en `tema.css`, `--color-naranja`, 7 pares en `check:contrast`, trinquete `tests/ds-s15-listas.test.ts` y spec `tests/e2e/ds-s15-listas.spec.ts`. | PRD-DS-02 / ADR-0009 |
| 2026-10-17 | DS-S19 | hecho | DS-S19: sin rastro de ModoOps en código: el remitente por defecto de `src/lib/alertas-seguridad.ts` pasa de `ModoOps <avisos@modoops.local>` a `Inventario <seguridad@local>`, con trinquete en `tests/tema-papel-adopcion.test.ts`; `mencionaOdoo` sigue como detector. | PRD-DS-03 / ADR-0009 |
| 2026-10-17 | P3-7a | hecho | P3-7a hecho: pantallas full de Caja, Stock y Precios en `/panel` (#142); decisión: la navegación vive una sola vez en `src/lib/panel-modulos.ts` (`hrefModulo`, `pillsPanel`), cada pantalla reusa solo GET/POST existentes, tokens de Tema Papel, táctil >=44px, una columna a 360px y dos desde 900px, estados cargando/vacío/error por widget vía `derivarEstado`. | PRD-OP-01 / ADR-0020 |
| 2026-10-17 | P3-7b | hecho | P3-7b hecho: Proveedores, Fiado, Consumos y Reportes tienen pantalla y los enlaces ↗ del panel apuntan a cada módulo; `tienePantalla` deja de distinguir y `hrefModulo` resuelve `/panel/<modulo>` (con `/panel/pronto?m=` vivo para módulos desconocidos) reusando solo endpoints existentes (`/api/suppliers`, `/api/purchase-orders`, `/api/supplier-invoices/account`, `/api/credit/balance`, `/api/credit/payments`, `/api/service-accounts`, `/api/utility-bills/due`, `/api/utility-bills/pay`, `/api/analytics/tablero`, `/api/analytics/snapshots`, `/api/cash/history`); próximo: endpoints de servidor para los números demo del panel, partir `panel.astro` en componentes y el tablero DASH-S*. | PRD-OP-01 / ADR-0020 |
| 2026-10-17 | P3-7c | hecho | P3-7c hecho: `GET /api/sales/resumen` reemplaza los números `demo` del panel con agregados de servidor (tickets de hoy, stock bajo, ventas del mes y por mes Efectivo/Digital, composición por medio, heatmap de 28 días y turnos de hoy), con la lógica pura en `src/lib/panel-resumen.ts`, la lectura tenant DB + memoria (`BaseNoDisponible` => 503) en `src/lib/repos/panel.ts`, días y horas de Buenos Aires vía `fecha-ar`, y `panel.astro` con un solo fetch más los movimientos recientes desde `GET /api/cash/history`; tests unitarios de los agregados y test PG A/B que prueba que el resumen de un comercio nunca ve las ventas de otro. | PRD-OP-01 / ADR-0020 |
| 2026-10-17 | P3-7d | hecho | P3-7d hecho: `GET /api/suppliers` y `GET /api/credit/customers` agregan listados read-only tenant-scoped con `?q=` (case-insensitive sobre nombre/CUIT o nombre/id/teléfono/DNI), `?limit=` (default 20, tope 50) y `?cursor=` con `next_cursor` (offset), con la lógica pura en `src/lib/lista-paginada.ts` (schema zod, `filtrarTexto`, `paginar`), la lectura DB + memoria (`intentarLeer`; `BaseNoDisponible` => 503) en `src/lib/repos/proveedores.ts` (`listarProveedores`) y `src/lib/repos/fiado.ts` (`listarClientes`), un buscador con debounce que llena el CUIT/cliente en `proveedores.astro` y `fiado.astro`, y tests unitarios de la lógica y las rutas (422, tope de límite, filtro, `next_cursor`) más un test PG A/B que prueba que el proveedor y el cliente de un comercio nunca se listan en otro. | PRD-OP-01 / ADR-0020 |
| 2026-10-17 | P3-7e | hecho | P3-7e hecho: `panel.astro` queda como composición fina sobre componentes en `src/components/panel/` (`TopPills`, `KpiStrip`, `ShiftTimeline`, `MovementsTable`, `HeatCard`, `SalesChart`, `MixDonut`, `ConsumosCard`, `PagarServicioCard`, `StockCard`, `PreciosCard`, `ProveedoresCard`, `FiadoCard`, `BotModulosCard`, `AjustesCard`; `PanelShell` reusa `TopPills`), el render del único `GET /api/sales/resumen` se muda a `src/lib/panel-dashboard.ts` con un solo fetch que llama `renderResumen`/`renderResumenError`, se agrega la regla global `prefers-reduced-motion: reduce` en `src/styles/global.css` y `panel.astro`, `GET /api/credit/customers` devuelve solo `customer_id` y `nombre` (sigue buscando server-side por nombre/id/teléfono/DNI) y el buscador de `proveedores.astro` llena también el CUIT de la orden de compra; tests de composición, rutas y PG A/B en verde. | PRD-OP-01 / ADR-0020 |
| 2026-10-17 | P3-7f | hecho | P3-7f hecho: `GET /api/sales/resumen` netea devoluciones (`sale_returns`) y correcciones de medio (`ticket_payment_corrections`) usando las tablas existentes: la devolución resta `monto_centavos` de `ventas_mes_centavos`, de `ventas_por_mes` (Efectivo/digital según el `medio` de la devolución) y de `por_medio`, bucketeada por su `created_at` en Buenos Aires y clampeada en 0n sin tocar `tickets_hoy` ni el heatmap; la corrección fija el medio efectivo de la venta con el `medio_nuevo` de la última por `created_at` para `ventas_por_mes` y `por_medio` sin cambiar el total; la lectura en `src/lib/repos/panel.ts` trae devoluciones por su ventana y correcciones joineadas a ventas de la ventana, con fallback a los almacenes en memoria (`crearAlmacenDevoluciones`/`crearAlmacenCorrecciones`), y tests unitarios de neteo más un caso PG A/B en verde. | PRD-OP-01 / ADR-0020 |
| 2026-10-17 | P3-7g | hecho | P3-7g hecho: `HeatCard` y la barra segmentada del panel dejan sus últimos números `demo` sin endpoint nuevo; `ResumenPanel` suma `devoluciones_hoy` (filas de `datos.devoluciones` con `fechaAR(ocurridoEn)` de hoy en Buenos Aires, contadas en el loop de `construirResumen` sin tocar `tickets_hoy` ni el heatmap), `renderResumen` lo escribe en `heat-dev` y `renderResumenError` lo deja en "—", la leyenda pasa a "tickets hoy · devoluciones hoy" y se borra la regla `.demo` de `panel.astro` (el admin conserva la suya); la nueva función pura `segmentosPorMedio(porMedio)` en `src/lib/panel-dashboard.ts` reusa `por_medio` de `GET /api/sales/resumen` y devuelve hasta 3 medios por monto más "Otros" con el resto, porcentajes enteros por método de mayor resto que suman 100 y lista vacía si el total es 0; la `segbar` arranca con el placeholder neutro "Sin datos" (title "Ventas del mes por medio"), `renderResumen` la repinta con `textContent` (sin `innerHTML` con datos), sin ventas muestra "Sin ventas este mes" y conserva los estilos por `nth-child` (primero oscuro, segundo amarillo, tercero rayado, "Otros" con borde); tests de `devoluciones_hoy` (corte AR y cruce de medianoche), de `segmentosPorMedio` (vacío, 1 = 100, >3 con "Otros", redondeo que suma 100) y guardas de HTML sin "demo" ni porcentajes fijos; el test PG A/B no suma aserción de `devoluciones_hoy` porque otros tests insertan `sale_returns` en la misma base en paralelo. | PRD-OP-01 / ADR-0020 |
| 2026-10-17 | DASH-S3 | hecho | DASH-S3 hecho: tarjeta Bot en el índice de /panel con consultas de hoy, última consulta en hora AR y estado del número central desde GET /api/whatsapp/resumen (sesión + membership activa, nunca teléfonos en la respuesta); las consultas se registran en whatsapp_usage (tabla existente, sin migración, tipo consulta y costo 0, idempotente por wamid) desde el webhook una vez pasada la puerta de identidad, la salud de la Cloud API vive en memoria por instancia según el último envío, y sin número central el estado honesto es sin configurar; el estado siempre se explica en palabras en texto (aria-live polite), omitidos historial (DASH-S2) y ocultar por módulo apagado (DASH-S12). | PRD-DASH-01 / ADR-0034 |
| 2026-10-17 | T-UI-03 | hecho | T-UI-03: catálogo de `/panel/precios` y `/panel/stock` virtualizado con `TableVirtuoso` sobre la ventana (sin scroll anidado) y precios con `NumberFlow` (react-virtuoso 4.18.19 y @number-flow/react 0.6.2 fijadas, isla de ~26 KB gzip solo en esas dos páginas, `respectMotionPreference`) más `.tnum` en el mismo formato que `formatearCentavos`, store compartido entre el script de la página y la isla, harness dev-only `?data=mil` de 1000 filas con spec Playwright a 360px y reduced motion, y de paso `select`/`input` del panel ya no desbordan a 360px con nombres largos. | PRD-UX-01 / ADR-0037 |
| 2026-10-17 | T-UI-02 | hecho | T-UI-02: diálogos de confirmación para acciones destructivas con `src/lib/confirmar.ts` (comparación insensible a mayúsculas/acentos/espacios), `src/lib/confirmar-dom.ts` (`confirmar({ titulo, mensaje, accion, nombreRequerido? }) => Promise<boolean>`) y `src/components/ui/ConfirmDialog.astro`, un `<dialog>` nativo con `showModal()`, aria-labelledby/aria-describedby, foco inicial en Cancelar (o en el nombre si es crítico), trampa de Tab, foco devuelto al elemento previo, Confirmar deshabilitado hasta `puedeConfirmar` y tokens de Tema Papel; las críticas piden el nombre (edición masiva por sector en `alertas/umbrales.astro`, apagar módulo en `BotModulosCard.astro`) y el resto confirma sin tipear (egreso de `caja.astro`, pagar factura en `consumos.astro`, registrar cobro en `fiado.astro`), con Cancelar que no dispara request. | PRD-UX-01 / ADR-0038 |
| 2026-10-17 | T-UI-04 | hecho | T-UI-04: errores con fix junto al campo en los formularios de `panel` (caja, stock, precios, proveedores, fiado, consumos, bot/config) y `alta`, con catálogo rioplatense en `src/lib/errores-campo.ts`, helper DOM `src/lib/errores-campo-dom.ts` (aria-invalid, `<p class="error-campo">` con aria-describedby y foco al primer inválido), validación de cliente sin request y mapeo de `fieldErrors` 422 a cada campo; umbrales ya cumplía con su propio catálogo; inventario de locales salteado porque no existe `locales/`. | PRD-UX-01 / ADR-0038 |
| 2026-10-17 | T-UI-06 | hecho | T-UI-06: primer harness worst-case de `/venta` con `src/lib/venta-worst.ts` (fixture con la forma del contrato), toggle dev-only `?data=worst` y `?dir=rtl` en `src/pages/venta.astro`, fixes de layout a 360px/zoom 200%/dark/RTL y spec Playwright de 4 escenarios en `tests/e2e/venta-worst.spec.ts`, con reporte en `docs/diseno/harness-venta.md`. | PRD-UX-01 / ADR-0038 |
| 2026-10-17 | T-UI-07 | hecho | T-UI-07: gate `interface-review` por PR en `puede-mergear` más `npm run review:gate`; "guidelines con fetch fresco" queda fuera. | PRD-UI-07 / ADR-0038 |
| 2026-10-17 | DASH-S1 | hecho | DASH-S1 hecho: /panel/bot/config con estado de vinculación por persona (vinculado, pendiente con expira_en, pausado con pausado_hasta) desde el núcleo puro src/modules/whatsapp/vinculos-panel.ts y el endpoint read-only nuevo GET /api/whatsapp/vinculos (sesión + membership, Dueño ve a todos y Empleado solo se ve a sí mismo, sin hash ni número completo); CTA Vincular WhatsApp con estado vacío de un solo botón, form de celular + Generar código (6 dígitos, 10 min, cuenta regresiva mm:ss con aria-live, regenera sin recargar al vencer; relee el estado cada 5 s mientras el código vive para mostrar el paso a vinculado sin recargar), y toggles de módulos reusando BotModulosCard; decisión: opt-in solo lectura (lo da cada persona por WhatsApp con ALTA, el Dueño no lo cambia), sin migración y sin tablas nuevas, endpoint read-only nuevo sobre el plano de control; sin botón Desvincular porque la respuesta no expone el número completo que exige POST /api/whatsapp/desvincular; lógica de cliente en src/lib/bot-config-panel.ts; sin pill nuevo (queda para DASH-S12); omitidos historial (DASH-S2) y destinatarios (DASH-S5). | PRD-DASH-01 / ADR-0039 |
| 2026-10-17 | DASH-S4 | hecho | DASH-S4 hecho: /panel/alertas/umbrales con tabla de productos con min_stock y reorder_qty editables en línea vía el PATCH existente de /api/products (solo dueño/encargado, 403 al empleado), validación entera en línea sin mandar request (Poné un número entero desde 0/1, vacío = sin valor null), sugerido por rotación 7d en gris desde GET /api/analytics/tablero reusando umbral_efectivo, edición masiva por sector (products.sector), toast Sonner con Deshacer que restaura por la misma API, y links desde /panel/stock y la tarjeta StockCard; lógica pura en src/lib/umbrales-panel.ts con tests primeros y cobertura en tests/panel-paginas.test.ts; sin pill nuevo (queda para DASH-S12); omitidos: destinatarios e historial (DASH-S5/S6) y el sugerido cubre hasta 6 páginas de 50 del tablero. | PRD-DASH-01 / ADR-0043 |
| 2026-10-17 | DASH-S8 | hecho | DASH-S8 hecho (parcial: /panel/plan; el medidor del drawer espera a DASH-S7): núcleo puro `src/lib/plan-panel.ts` (nombre del plan o "Sin plan activo", marca de catálogo de ejemplo, features incluidas/no incluidas con etiqueta legible y medidor del asistente con cupo efectivo, restante nunca negativo, agotado = usado >= cupo y reinicio el día 1 del mes siguiente en hora AR), `CUPO_ASISTENTE_POR_DEFECTO` exportado desde `src/modules/ia/asistente.ts` y compartido por el bloqueo y el medidor, mes unificado en hora AR con `mesAR` (`src/lib/fecha-ar.ts`) como default de `crearAsistente` y del endpoint, `GET /api/plan/resumen` read-only bajo `/api/plan` (sesión + membership activa, sin precios ni datos de otro tenant, 503 `base_no_disponible`) y la pantalla `/panel/plan` en Tema Papel con medidor accesible y número en texto, enlazada desde AjustesCard; omitidos el drawer del asistente y su estado `sin_cupo` (DASH-S7/DASH-S9); de paso, el test de aceptar invitación de `tests/auth-onboarding.test.ts` invita con el reloj real porque la ruta vence a 7 días y con la fecha fija fallaba desde el 2026-10-17T12:00Z. | PRD-DASH-01 / ADR-0045 |
| 2026-10-17 | LAYA-S0 | hecho (rechazado) | LAYA-S0: Laya rechazado (Mauri 2026-10-17): no se usa; no sirve tal cual en español, ajustada no le gana claramente a TF-IDF, sidecar ~2,4 GB sin GPU. Desinstalado del box. | PRD-LAYA-01 / ADR-0087 |
| 2026-10-16 | P3-1 | hecho | P3-1 hecho: PRD-CAT-01 (CAT-S1..S6), PRD-CAJA-01 (CAJA-S1..S4, #76 #78 #81 #82), PWA P1.8 (#51) y SYNC-S1..S7 (#103 #104 #105 #102) mergeados en `main`, cada uno con su avance. | PRD-CAT-01 / — |
| 2026-10-16 | P9-10 | hecho | P9-10: pago de vencimiento atómico con claim-first (M2): un 200 y un 409 ante doble pago concurrente. | — / — |
| 2026-10-16 | P9-11 | hecho | P9-11: tests de aviso-sync y heartbeat aislados con DB-first (sec04 y pers2-sync en bases privadas). | — / — |
| 2026-10-16 | P9-12 | hecho | P9-12: lista única ADMIN_ALLOWLIST_SUBS para admin y superadmin, con SUPERADMIN_SUBS como fallback deprecado. | — / — |
| 2026-10-16 | P9-13 | hecho | P9-13: el rol para autorizar sale de sesión + membership activa, nunca del body, en products POST/PATCH y cash shifts resolve. | — / — |
| 2026-10-16 | P9-14 | hecho | P9-14: condición IVA receptor con los 11 IDs vigentes ARCA en vez de 1-9. | — / — |
| 2026-10-16 | P3-2d | hecho | P3-2d hecho: E2E-S1/S2/S3/S4/S6 cumplen con evidencia en código (S5 falta: sin ruta `GET /api/demo/quien-soy`, tabla completa en el cuerpo del commit); nuevo `tests/e2e-dos-tenants.test.ts` 4/4 en `TENANT_MODE=multi` contra PG local (alta/login con sesión fake, producto, venta, caja, ticket, aislamiento A/B en ambas direcciones en cada ruta de lectura) con skip sin `PG_TEST_URL_A/B`; sin migración ni servicios externos. | PRD-E2E-01 / ADR-0001 |
| 2026-10-16 | P3-6b | hecho | P3-6b hecho: PA1-PA14 y OP-S1 a S4 verificados contra el código con evidencia (tabla completa en el cuerpo del commit); cumplen núcleo PA1-allowlist, PA2-hash, PA3-frontera, PA4-señales, PA6-ledger, PA7-mora-14/15, PA12-flags y OP-S2/S3/S4, parciales OP-S1-alias, PA10-ciclo, PA11-infra y PA14-rollout, faltan PA5-directorio, PA8-WhatsApp, PA9-alertas y PA13-Sentry; alias `GET /api/admin/audit` nuevo más 16 tests en `tests/panel-admin-p36b.test.ts`; suite 1232 passed más 76 skipped, arch 28/28, `tsc` limpio; sin migraciones; pendientes: migraciones customers/billing-cargos/whatsapp/alertas/infra, Meta/Sentry/MP/ARCA reales, demora/gracia fina, prórrogas, recordatorios y deploys P1. | PRD-OP-01 / ADR-0006 |
| 2026-10-16 | P3-2c | hecho | P3-2c hecho: ON1-ON13 verificados contra código con evidencia (tabla completa en el cuerpo del commit); cumplen ON1, ON2-núcleo, ON3, ON5, ON8, ON10, ON11, parciales ON4 (nuevo `plantillas-rubro.ts` versionado por rubro más 5 tests), ON6 (nueva ruta `POST /api/onboarding/video` con eventos `video_inicio/50/fin` más 3 tests), ON7, ON9, ON12 (eventos extendidos), ON13-base; nuevos tests ON1.5 verificar-después y ON5.8 marca onboarding; pendientes: respaldo por plantilla Meta, reintentar de admin, seed de ubicaciones en tenant, tour overlay/accesibilidad, cupo de prueba y PWA/cámara (decisiones de producto o credenciales externas). | PRD-E2E-01 / ADR-0011 |
| 2026-10-16 | SEC-FORGE | hecho | SEC-FORGE: firmar TRA/CMS con node:crypto (DER propio en src/modules/fiscal/cms-der.ts, misma salida que node-forge verificada con openssl) y retirar node-forge (GHSA-86w9-cpqp-85rv). | PRD-FE-01 / ADR-0018 |
| 2026-10-16 | SYNC-S1 | hecho | SYNC-S1/S2 hecho: pull por lotes topado a 50 en el repo con cursor estable por outbox append-only y alcance por tenant (tests/sync-s1-s2.test.ts 10/10, incluye PG A/B con 10k productos) más búsqueda difusa local pura en src/offline/busqueda-local.ts; pendientes sin migración: cursor keyset sobre (createdAt, opId) con índice si el volumen exige paginado estable ante escrituras concurrentes desordenadas. | PRD-SYNC-01 / ADR-0023 |
| 2026-10-16 | SYNC-S3 | hecho | SYNC-S3/S4 hecho: heartbeat DB-first (`leerLatidoPrevioDuro` + upsert que limpia avisos) y job `ejecutarAvisoSyncDuro` que reclama 24/60/72h con un UPDATE condicional por banda con RETURNING (una sola marca ante corridas concurrentes), con migración 0024 (`aviso_24_en`/`aviso_60_en`/`aviso_72_en` en `device_sync_state`, journal incluido) y `tests/sync-s3-durable.test.ts` 5/5 (PG A/B + memoria intacta). | PRD-SYNC-01 / ADR-0023 |
| 2026-10-16 | SYNC-S5 | hecho | SYNC-S5/S6 hecho: grants y registro de devices DB-first en la base del tenant (offline_grants/device_sync_state con espejo en memoria, 503 en multi sin base), register idempotente con grant inicial en la misma tx y revocación legible tras reinicio, con tests/sync-s5-s6-durable.test.ts 7/7 (incluye PG A/B); pendientes sin migración: rol/permisos y registrado_por/en/nombre siguen en JWT/memoria. | PRD-SYNC-01 / ADR-0023 |
| 2026-10-16 | SYNC-S7 | hecho | SYNC-S7 hecho: sensibles solo online con OPERACIONES_SOLO_ONLINE (cambio_tope/plazo, baja_fiado, ajuste_stock/precio, reversion, export); push acepta lote {ops} y responde necesita_conexion sin persistir, encolar lanza NecesitaConexionError ("Necesita conexión", visible en sync de venta.astro), tests/sync-s7-solo-online.test.ts 5/5 (memoria + PG). | PRD-SYNC-01 / ADR-0023 |
| 2026-10-16 | P3-2b | hecho | P3-2b hecho: AU2-S1 cumple (allowlist exacta en `login.ts:33`, e2e S1/S4 en verde), S2 cumple (`pendingAuth.next` en `store.ts:455` más expiración heredada de P3-2a), S3 cerrado (bifurcación admin en `callback.ts:180-182`, next validado gana sobre allowlist; e2e S3 4/4), S4 cumple (doble validación login más callback, vectores `//`, `https:`, `/\`, `javascript:` rechazados), S5 cumple (`.env.example:24-25`), S6 parcial (`embudo.ts` migrado a `exigirAdmin`, resto de `/api/admin/*` ya lo usaba; `POST /api/tenants` queda con `SUPERADMIN_SUBS` por decisión de producto pendiente), S7 cerrado (200/403 por `google_sub` en `nivel5-admin.test.ts`); seguridad: state/nonce/PKCE verificados, cookies HttpOnly más Secure más SameSite, `pendingAuth` con expiración y borrado, sin open-redirect, sesión nueva de 256 bits; ADR-0030 sin cambio de Estado (sigue aceptado, ahora con evidencia completa en código); pendientes: migración de `pendingAuth` a Postgres, Google real, decisión dual allowlist para `POST /api/tenants`. | PRD-AU-02 / ADR-0030 |
| 2026-10-16 | LP3-S1 a LP3-S5 | hecho | LP3-S1 a LP3-S5: accesos Mi comercio/Admin vía login con destino desde header y hero, nav solo anclas y Entrar de alta a /panel. | PRD-LP-03 / ADR-0030 |
| 2026-10-16 | P3-2a | hecho | P3-2a hecho: AU-FIX-S1 a S6 cumplen con evidencia (S1 redirect con 2 cookies en `login.ts:47-50`, S2 sin `void headers` en reauth, S3 `expiraEnMs` más 403 y borrado en `callback.ts:43-47`, S4 sin nonce-cookie con nonce validado en `oidc.ts:103-105`, S5 e2e con redirect real, S6 regresión de Set-Cookie); locks nuevos de flags/Max-Age=600, ausencia de nonce-cookie y allowlist de `next` en `tests/auth-login-e2e.test.ts` 7/7; suite 1183 passed más 72 skipped, arch 28/28, `tsc` limpio; ADR-0031 sin cambio; pendientes: migración de pendingAuth, Google real y heredados de ADR-0031. | PRD-AU-01 / ADR-0031 |
| 2026-10-16 | BOT-S1 | hecho | BOT-S1/S2 hechos: módulos del bot por tenant (`rotacion`, `vencimientos`, `flujo_caja`, `cobranza`, `ordenes_produccion`, `entregas`) con defaults por rubro (quiosco `rotacion`+`vencimientos`, pyme `flujo_caja`+`cobranza`, fábrica `ordenes_produccion` y logística `entregas` detrás del flag `BOT_RUBROS_AVANZADOS` apagado), activados al terminar el alta en `POST /api/onboarding/alta`; el Dueño prende/apaga con `PATCH /api/bot-modulos` (rol desde sesión+membership, nunca del body) y un toggle en `/panel`; el router de WhatsApp responde `no disponible en tu plan/rubro` sin ejecutar cuando el módulo está apagado (tests/bot-modulos-rubro.test.ts). Persistencia DB-first en `tenant_bot_modules` (migración 0028) vía `dbVivaTenant()`, con las 6 filas por tenant en una transacción (todo apagado se distingue de sin filas) y el espejo en memoria de control (`crearAlmacenBotModulos`) como fallback en single sin base. | PRD-BOT-01 / ADR-0039 |
| 2026-10-16 | BOT-S3 | hecho | BOT-S3 hecho: el job diario del bot rubro quiosco une `vencimientos` (CAT-S4 15/7/3d) y `rotacion` (RT6 dormidos) en UN mensaje de WhatsApp por comercio y día, con la promo propuesta para los lotes a ≤3 días (motivo "vencer") y para los dormidos (motivo "dormido"); el núcleo puro `src/jobs/bot-quiosco.ts` gatea cada sección por los módulos del tenant (`leerModulosBot`), sin novedades no envía, respeta opt-in/pausa e idempotencia por `bot_quiosco:{tenant}:{fecha}`, y `POST /api/jobs/bot-quiosco` corre con `correrJob` (X-Job-Secret, tenant de gateJob) sin marcar enviado cuando faltan credenciales Cloud API. | PRD-BOT-01 / ADR-0039 |
| 2026-10-16 | BOT-S4 | hecho | BOT-S4 hecho: el job diario del bot rubro pyme une `flujo_caja` (caja de hoy contra los pagos pendientes a 7 días, con faltante y fiado a cobrar) y `cobranza` (deudores con saldo sobre su tope o con 14+ días de atraso, con link `wa.me` de recordatorio) en UN mensaje de WhatsApp por comercio y día; el núcleo puro `src/jobs/bot-pyme.ts` gatea cada sección por los módulos del tenant (`leerModulosBot`), sin novedades no envía, respeta opt-in/pausa e idempotencia por `bot_pyme:{tenant}:{fecha}`, y `POST /api/jobs/bot-pyme` corre con `correrJob` (X-Job-Secret, tenant de gateJob) sin marcar enviado cuando faltan credenciales Cloud API. | PRD-BOT-01 / ADR-0039 |
| 2026-10-16 | BOT-S7 | hecho | BOT-S7 hecho: el job mensual (`src/jobs/resumen-mensual.ts`, núcleo puro, y `POST /api/jobs/resumen-mensual` con `correrJob`, X-Job-Secret y tenant de gateJob) arma UN snapshot del mes cerrado (caja: ingresos, egresos, resultado y ventas; `cobranza`: fiado a cobrar y deudores; `flujo_caja`: pagos que vencen el mes que empieza, cada sección gateada por `leerModulosBot`) y lo manda igual por WhatsApp y email el día 1 desde las 09:00 (zona por defecto America/Argentina/Buenos_Aires, no hay zona por tenant), idempotente por `resumen_mensual:{canal}:{tenant}:{mes}` sin migración (WA en memoria como BOT-S3/S4, email durable por `idempotency_key` de `email_outbox`), con opt-in/pausa por canal y sin marcar el WA enviado cuando faltan credenciales Cloud API. | PRD-BOT-01 / ADR-0040 |
| 2026-10-16 | P3-5b | hecho | P3-5b hecho: BOT2-S1 parcial con evidencia (exacta más barcode en `servicio.ts:78-102`, `consulta.ts:33-62`, `consult.ts:34-56` fuente db), S2 cerrada (lista 1-5 más selección en `servicio.ts:104-175`, precisar más de 5, sugerencia, sesión desambiguar en `webhook.ts:281-310`), S3 cerrada (código 6 dígitos en `resolucion.ts:37-38`), S5 cerrada (WhatsAppTransport más fake más cloud en `transport.ts` con AT1 en `tests/arch/whatsapp-nucleo-puro.test.ts`), S6 cumple (ADR-0041 aceptado); suite 1339 passed en 171 files con PG local, arch 34/34, `tsc` limpio; pendientes: pg_trgm real más product_aliases, columna controla_vencimiento en products y fallback memoria de consult.ts (decisiones con migración). | PRD-BOT-02 / ADR-0042 |
| 2026-10-16 | ALR-S1 | hecho | ALR-S1 hecho: min_stock y reorder_qty de products persistidos y editables desde el panel (PATCH /api/products valida min_stock entero >= 0 y reorder_qty entero > 0 con null para limpiar, solo dueno o encargado con 403 al empleado; repo revalida y tolera bases sin la 0027 con espejo en memoria; aviso matutino usa min_stock de la DB primero con fallback a rotación 7d e incluye reorder_qty; bloque por SKU en panel.astro; coincideDifuso parte la consulta por guion igual que las fichas para que q=UMV-4 encuentre el producto; tests/alr-s1-umbrales.test.ts 11/11 más PG A/B). | PRD-ALR-01 / ADR-0043 |
| 2026-10-16 | P3-5a | hecho | P3-5a hecho: ALR-S1 parcial (núcleo puro cumple, falta `min_stock`/`reorder_qty` persistidos sin migración), S2 hecho sin pg_cron (endpoint `alertas-stock.ts:27` con clave tenant+producto+día, ventana quiebre 10-20 y secreto por `correrJob`), S3 parcial (Dueño siempre más opt-in/pausa en `stock-bajo.ts:54`, falta canal por encargado en DB), S4 hecho en núcleo (paginado 10 en `alertas.ts:122`, cobertura y ver-todo en `stock-bajo.ts:80`), S5 hecho como borrador sin envío (`alertas-stock.ts:95`); 18 tests nuevos en `tests/alr-stock-bajo.test.ts`, suite 1250 passed más 76 skipped, arch 28/28, `tsc` limpio; sin migraciones; pendientes: columnas `min_stock`/`reorder_qty` y UI umbrales, `notification_events` durable, encargados y proveedor habitual, pg_cron fuera del repo. | PRD-ALR-01 / ADR-0043 |
| 2026-10-16 | IA-S1 a IA-S3 | hecho | IA-S1 a IA-S3: asistente con catálogo cerrado detrás de ProveedorLLM + fake, registro en memoria; la tabla ai_usage queda para migración futura. | PRD-IA-01 / ADR-0044 |
| 2026-10-16 | IA-S5 | hecho | IA-S5 hecho: `src/lib/repos/ia-uso.ts` persiste una fila por consulta en `ai_usage` (tenant, mes, proveedor, modelo, tokens, costo) con `usoDelMes` por SQL y contador `usage_counters/asistente_ia` en la misma transacción, `RegistroUsoIA` async con `crearRegistroUsoIA` como única elección memoria-vs-DB y espejo memoria del corte 19; el asistente espera al registro y el cupo por mes sigue bloqueando; sin migraciones nuevas. | PRD-IA-01 / ADR-0045 |
| 2026-10-16 | LP4-S1 a LP4-S5 | hecho | LP4-S1 a LP4-S5: ChatLanding reemplaza el flotante y /api/landing-chat responde solo desde FAQ/planes/rubros de ejemplo con cupo 20/día, sin DB. | PRD-LP-04 / ADR-0046 |
| 2026-10-16 | PLAN-S1 | hecho | PLAN-S1 hecho: `src/lib/repos/planes.ts` persiste planes/suscripciones/usage_counters en DB (catálogo desde `plans`+`plan_features` con fallback a `PLANES_EJEMPLO`, `ProveedorCobroDb` con reemplazo atómico de la activa, `planIncluye` como único resolvedor, upsert de contadores por tenant/mes/feature) con espejo memoria del corte 19 y `ProveedorCobroFake` intacto; sin migraciones nuevas. | PRD-PLAN-01 / ADR-0047 |
| 2026-10-16 | PRD-PLAN-01 | hecho | PRD-PLAN-01: catálogo de planes de EJEMPLO configurable (PLANES_EJEMPLO con ejemplo:true y override PLANES_EJEMPLO_JSON) con planDe/tieneFeature/cupoRestante/cambioDePlan más ProveedorCobroFake en memoria; solo código, sin migración (tablas plans/subscriptions quedan para una migración futura). | PRD-PLAN-01 / ADR-0047 |
| 2026-10-16 | P3-3a | hecho | P3-3a hecho: OP1-OP13 verificados contra código con evidencia (tabla completa en el cuerpo del commit); cumplen OP1 (nuevo test automático sin-credenciales en `tests/pagos-op1-sin-credenciales.test.ts` 4/4 más cita corregida en `schema-pagos.ts:14`), OP6, OP9-núcleo, OP10-núcleo y OP13-núcleo, parciales OP2/OP3/OP5/OP7/OP8/OP11 (máquina cerrada, job de vencidas, allowlist y auditoría en código; faltan estados Borrador/Lista/Enviada, edición versionada, antifraude CBU y presentación bot); pendientes: migración de pagos (sin `drizzle/*.sql` de pagos), Lane E/facturas, pedidos F5, bot/plantillas WhatsApp, OCR/fotos Google, ARCA/MP/bancos y UI Pagos con totales. | PRD-PERS-02 / ADR-0057 |
| 2026-10-16 | P3-3b | hecho | P3-3b hecho: CS1-CS12 verificados contra código con evidencia (tabla completa en el cuerpo del commit); cumplen CS2-núcleo, CS4-núcleo, CS5-núcleo, CS8, CS9-núcleo y CS7-núcleo, parciales CS1/CS11/CS12 (watch/filtros/log mínimo en código; faltan OAuth real, consentimiento, revocación y anulación con migración); nuevos tests puros en `tests/servicios-p3-3b.test.ts` 10/10 (posible-duplicado CS9.4, vínculo CS5.6, resumen CS7, OCR con motor existente); suite 1309 passed más 80 skipped, arch 34/34, `tsc` limpio; sin migración (hard rule); pendientes: OAuth/consentimiento Google, Google Photos, cash_due/vencimientos, órdenes de pago, anulación/reversión, avisos bot y panel completo. | PRD-PERS-02 / ADR-0058 |
| 2026-10-16 | P3-6a | hecho | P3-6a hecho: RT1-RT11 de MOD-08 verificados contra el código con evidencia (tabla completa en el cuerpo del commit); cumplen RT1-núcleo, RT2-núcleo, RT3-núcleo, RT4-núcleo, RT5-núcleo, RT6-núcleo, RT7-núcleo, RT8-núcleo, RT9-núcleo, RT10-núcleo y RT11-núcleo, parciales todos en adaptadores; 13 tests nuevos en `tests/analytics-rotacion-p36a.test.ts` (compensatorio netea y no repone, reposición día/pedido, ABC crosser en A, D efectivo por alta, ingresos/ganancia/margen/markup, cobertura independiente, menos-vendidos, motivos, resumen único, visita, cajas); suite 1292 passed, arch 28/28, `tsc` limpio; sin migraciones; pendientes: jobs Drizzle (`product_daily_stats`, vistas), WhatsApp/email reales, PDF maquetado, SQLite offline y UI del tablero. | PRD-IA-01 / ADR-0063 |
| 2026-10-16 | PS-S1 a S3 | hecho | PS-S1 a S3: conformidad de 4 agentes sin `auto`, fixtures rotas en proceso más hijo en rojo y pendientes reales en ADR-0085 (M3). | PRD-PS-01 / ADR-0085 |
| 2026-10-16 | CI-LOCAL | hecho | CI-LOCAL: verificación local con `npm run verify` (replica ci.yml y regenera ROADMAP/INDEX) y los cuatro workflows de GitHub Actions quedan en `workflow_dispatch`. | PRD-ARQ-01 / ADR-0086 |
| 2026-10-15 | P2-2 | hecho | P2-2 hecho: ARQ-S4 cerrado, todos los repos sobre el puerto Almacen; el `store.` restante vive solo dentro de `_almacen.ts`. | — / — |
| 2026-10-15 | P2-3 | hecho | P2-3 hecho: ARQ-S8 cerrado, la evidencia de ADR ya no admite "preexistente" sin issue; fase 5 de PRD-ARQ-01 completa. | — / — |
| 2026-10-15 | P9-7 | hecho | P9-7: `tests/auth-pin.test.ts` determinista (sin substring de PIN sobre hash aleatorio) + guard E11. | — / — |
| 2026-10-15 | P9-8 | hecho | P9-8: `cerrarCaja` cuenta QR fuera del try de persistencia con helper seguro que informa 0 si falla (H1 #78). | — / — |
| 2026-10-15 | P9-9 | hecho | P9-9: review CAJA-S3 (#81): aviso atómico y auth de jobs (H3, M1, L4; M2 skipped). | — / — |
| 2026-10-15 | CAJA-S1 | hecho | CAJA-S1 hecho: migración 0022 de `cash_qr_receipts` (`fecha_operacion`, `origen`, `cash_movement_id` SET NULL) + asociación QR monto exacto ±15 min con auto solo ante Op. nuevo y único candidato, con Deshacer a pendiente. | PRD-CAJA-01 / ADR-0027 |
| 2026-10-15 | CAJA-S2 | hecho | CAJA-S2 hecho: `POST /api/cash/close` informa `qr_sin_comprobante` con `contarQrSinComprobante` sobre recibos pendientes, sin migración y con `tests/caja-s2-qr-cierre.test.ts` 3/3. | PRD-CAJA-01 / ADR-0027 |
| 2026-10-15 | CAJA-S3 | hecho | CAJA-S3 hecho: migración 0023 crea `cash_due_items` con `avisado_el`/`pagado_el`/`cash_movement_id`, job `POST /api/jobs/vencimientos-caja` avisa a 3 días (72h inclusive, idempotente por `avisado_el`), `GET ?id=` precarga `Registrar pago` y el pago acepta `metodo`, con `tests/caja-s3-vencimientos.test.ts` 8/8 (incluye PG). | PRD-CAJA-01 / ADR-0027 |
| 2026-10-15 | CAJA-S4 | hecho | CAJA-S4 hecho: `registro_venta.ts` inserta `cash_movements` con `id = p.cashMovementId` para que `ticket_payments.cash_movement_id` referencie el egreso real, con `tests/caja-s4-ticket-payments.test.ts` 3/3 en memoria + PG. | PRD-CAJA-01 / ADR-0027 |
| 2026-10-14 | P0-1 | hecho | P0-1: rutas fuera de `PREFIJOS_DATOS` sumadas (PRD-SEC-02, ADR-0074). | — / — |
| 2026-10-14 | P0-2 | hecho | P0-2: `fiscal_settings.tenant_id` con migración 0016 (PRD-SEC-02, ADR-0074). | — / — |
| 2026-10-14 | P0-3 | hecho | P0-3: script de backfill de `tenant_id` listo (PRD-SEC-03, ADR-0075). | — / — |
| 2026-10-14 | P0-4 | hecho | P0-4: fan-out por tenant de jobs con `X-Job-Secret` (PRD-SEC-04, ADR-0077). | — / — |
| 2026-10-14 | P0-5 | hecho | P0-5 hecho: el webhook de Mercado Pago reclama cada evento en mp_webhook_events. | — / — |
| 2026-10-14 | P1-1 | hecho | P1-1: ubicaciones, fotos y conteos DB-first en `locations`/`product_photos`/`stock_counts` (PRD-PERS-03, ADR-0078). | — / — |
| 2026-10-14 | P1-2 | hecho | P1-2: trabajos y eventos de OCR en `ocr_jobs`/`ocr_eventos` (PRD-PERS-04, ADR-0079). | — / — |
| 2026-10-14 | P1-3 | hecho | P1-3: correlativos `D-*` y `T-*` desde `ticket_counters` (PRD-PERS-05, ADR-0080). | — / — |
| 2026-10-14 | P1-4 | hecho | P1-4: catálogo del delta de `GET /api/sync/pull` desde `products` (PRD-PERS-06, ADR-0081). | — / — |
| 2026-10-14 | P1-5 | hecho | P1-5: los 9 errores tragados de E7 en 0 (PRD-PERS-07, ADR-0082). | — / — |
| 2026-10-14 | P1-6 | hecho | P1-6: tests intermitentes de base B aislados sin reintentos: sec04 en bases privadas, due filtrado y notif_id únicos. | — / — |
| 2026-10-14 | P1-7 | hecho | P1-7: journal de migraciones arreglado (cierra Para implementar 1.1): 20 entradas en `drizzle/meta/_journal.json` para 20 SQL `0000` a `0019`. | — / — |
| 2026-10-14 | P1-8 | hecho | P1-8: PWA-S5 borrado remoto cerrado (revocar-remoto → heartbeat wipe → latido → revocarDispositivo). | — / — |
| 2026-10-14 | P2-1 | hecho | P2-1: fase 3 cerrada (casts en piso intencional 1/0; ARQ-S7 ya en CI). | — / — |
| 2026-10-14 | P9-6 | hecho | P9-6: estado de ADRs al 2026-10-14 (reemplaza el párrafo del 2026-10-12). | — / — |
| 2026-10-14 | ROAD1-S1 a S4 | hecho | ROAD1-S1 a S4 hechos: avances por archivo y sección generada sin conflictos entre PRs. | PRD-ROAD-01 / ADR-0076 |
| 2026-10-14 | SEC4-S1 a S3 | hecho | SEC4-S1 a S3 hechos: jobs con `X-Job-Secret` sin `X-Tenant-Id` en multi recorren todos los comercios activos o suspendidos, con resumen por tenant. | PRD-SEC-04 / ADR-0077 |
| 2026-10-14 | PERS3-S1 a S4 | hecho | PERS3-S1 a S4 hechos: ubicaciones, fotos al alta y conteos DB-first en `locations` / `product_photos` / `stock_counts` (ADR-0078). | PRD-PERS-03 / ADR-0078 |
| 2026-10-14 | PERS4-S1 a S4 | hecho | PERS4-S1 a S4 hechos: trabajos y eventos de OCR DB-first en `ocr_jobs` / `ocr_eventos` (ADR-0079). | PRD-PERS-04 / ADR-0079 |
| 2026-10-14 | PERS5-S1 a S3 | hecho | PERS5-S1 a S3 hechos: correlativos `D-*` y `T-*` desde `ticket_counters` con lock en la transacción (ADR-0080). | PRD-PERS-05 / ADR-0080 |
| 2026-10-14 | PERS6-S1 | hecho | PERS6-S1 hecho: catálogo del delta de `GET /api/sync/pull` desde `products` (ADR-0081). | PRD-PERS-06 / ADR-0081 |
| 2026-10-14 | PERS7-S1 a S3 | hecho | PERS7-S1 a S3 hechos: los 9 errores tragados de E7 registran con `console.warn` o relanzan; `PERMITIDOS` vacío (ADR-0082). | PRD-PERS-07 / ADR-0082 |
| 2026-10-14 | PROC1-S1 a S3 | hecho | PROC1-S1 a S3: tests de arquitectura una sola vez en CI, evidencia desde un reporte JSON y avances chicos `P<n>-<m>` sin ADR/PRD (ADR-0083). | PRD-PROC-01 / ADR-0083 |
<!-- roadmap:avances:fin -->

## Decisiones registradas

- Suscripción mensual por plan, no por módulo (ADR-0047).
- Sin precio de servicio ni costo de implementación; la carga de datos va incluida en el onboarding (decisión del dueño 2026-10-12, revisable; PRD-LANDING-01).
- WhatsApp Cloud API oficial con número central, Baileys descartado (ADR-0041, ADR-0042).
- Alertas con `pg_cron` + `pg_net` (ADR-0043).
- Asistente IA con catálogo cerrado y solo lectura (ADR-0044).
- Chat de landing aislado, solo FAQ (ADR-0046).
- ARCA con implementación propia `FiscalProvider` (ADR-0018).

Estado de ADRs (2026-10-18, auditado contra el código): aceptados 0001 a 0031, 0034, 0036 a 0038, 0041, 0047, 0050 a 0063 y 0065 a 0083, más 0085 a 0089, 0091 y 0092. Siguen propuestos 0032 (layout PWA), 0033 (tipografía), 0035 (copy/voz), 0064 (comentarios), 0084 (rúbrica pstack) y 0090 (encuadre legal fiscal, diferido). Deprecados 0087 y 0088 (Laya).

## Bloqueado por decisiones de Mauri

- Consulta legal y fiscal con contador y abogado, y certificados ARCA (fecha límite 1/12/2026) (P9-2, ADR-0090).
- Proveedor LLM real y sus costos (hoy un adapter free detrás de `ProveedorLLM`).
- Montos de los planes a publicar (PRD-PLAN-02).
- Credenciales externas: Google OAuth, Meta WhatsApp Cloud API, Resend, Mercado Pago y Sentry (detalle en `docs/roadmap/bloqueos.json`).

## Cobertura

Cada doc de `docs/` (sin `_origen-docx`) y dónde lo cubre este roadmap. Auditoría 2026-10-12.

| Doc | Estado | Dónde |
|---|---|---|
| `docs/README.md` | meta | índice; enlaza este archivo |
| `docs/archivo/CHECKLIST-documentacion.md` | meta | reemplazado como fuente de estado |
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
| `adr/0059-jobs-sin-store.md` | cubierto | Ya implementado (grupo 7: jobs) |
| `adr/0073-errores-recurrentes-llm-guardas.md` | cubierto | 9.3 |
| `adr/0074-prefijos-datos-y-fiscal-settings-tenant.md` | cubierto | 2b.4 (PRD-SEC-02, aceptado) |
| `diseno/PRD-SEC-02` | cubierto | 2b.4 |
| `adr/0067-dependabot-actions-y-politica.md` | cubierto | 9.4 |
| `adr/0068-vitest-5.md` | cubierto | 9.4 |
| `adr/0069-astro-7.md` | cubierto | 9.4 |
| `adr/0070-drizzle-orm-045.md` | cubierto | 9.4 |
| `adr/0071-zod-4.md` | cubierto | 9.4 |
| `adr/0072-typescript-7.md` | cubierto | 9.4 |
| `adr/0066-dueno-real-y-correlativo-unico.md` | cubierto | Ya implementado (2b.4: dueño real, online real, correlativo único) |
| `adr/0064-politica-comentarios.md` | cubierto | 9.2 |
| `adr/0065-arquitectura-amigable-agentes.md` | cubierto | 9.3 |
| `adr/0063-ventas-devoluciones-sin-store.md` | cubierto | Ya implementado (grupo 11: ventas y devoluciones) |
| `adr/0062-repos-catalogo-stock-sin-store.md` | cubierto | Ya implementado (grupo 10: catálogo, stock y compras) |
| `adr/0061-repo-sync-sin-store.md` | cubierto | Ya implementado (grupo 9: sincronización) |
| `adr/0060-repo-ocr-sin-store.md` | cubierto | Ya implementado (grupo 8: OCR) |
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
| `archivo/panel-admin-version-anterior-DEPRECADA.md` | no aplica | deprecado |
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
| `diseno/PRD-COM-01` | cubierto | 9.2 |
| `diseno/PRD-ARQ-01` | cubierto | 9.3 |
| `diseno/PRD-SEC-01` | cubierto | 2b.4 |
| `diseno/PRD-DEP-01` | cubierto | 9.4 |
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
