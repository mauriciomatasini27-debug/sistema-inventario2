# Checklist — Completar documentación y desarrollo (gaps 2026-10-11)

> Reemplazado por `docs/ROADMAP.md` (y `docs/roadmap/avances/`) como fuente de estado de implementación desde 2026-10-12. Este checklist queda como historia; actualización 2026-10-14: tildados CH-01, `photos_queue` y Gmail watch con evidencia en código.

Origen: auditoría docs vs código (PRDs con IDs AU/ON/OF/F/GP/TV/C/FC/FP/CS/OP/FE/B/NE/RT/PA + ADRs 0000-0022). Cada ítem se cierra con PRD + ADR + código + test en verde.

## Cómo usar

- Orden por Nivel ADR-0000. No saltear Nivel 0.
- Marcar `- [x]` solo con evidencia (archivo + test).
- PRDs nuevos en `docs/diseno/PRD-*.md`; ADRs nuevos en `docs/adr/0032-*.md`.

## Nivel 0 — Fundaciones

- [ ] SYNC pull/heartbeat/grants/devices — PRD `PRD-SYNC-01-sync-pull-grants.md` + ADR `0023-sync-pull-grants.md`
  - [x] `GET /api/sync/pull?cursor=` + lote ≤50 (SYNC-S1/S2) — `src/pages/api/sync/pull.ts` + `tests/sync-pull.test.ts` (4 verdes 2026-10-11)
  - [x] `POST /api/sync/heartbeat` + `GET /api/health` + avisos 24/60/72h (SYNC-S3/S4) — `src/pages/api/sync/heartbeat.ts` + `src/pages/api/health.ts` + `src/offline/avisos.ts` + `src/jobs/aviso-sync.ts` + `src/pages/api/jobs/aviso-sync.ts` + `tests/sync-heartbeat.test.ts` (4 verdes) + `tests/sync-avisos.test.ts` (4 verdes 2026-10-12; job diario + rojo/cuarentena 72h)
  - [x] `POST /api/sync/offline-grants` + `POST /api/devices/register` + sensibles solo online (SYNC-S5/S6/S7) — `src/pages/api/sync/offline-grants.ts` (POST+DELETE) + `src/pages/api/devices/register.ts` + `tests/sync-grants.test.ts` (6 verdes 2026-10-11) + copia durable best-effort `src/db/schema-sync.ts` (`device_sync_state`, `sync_state`, `offline_grants`) + `drizzle/0006_sync_state_grants.sql` + write-through en heartbeat/grants/register + `tests/sync-durable.test.ts` (2 verdes 2026-10-12; memoria sigue mandando, cutover total pendiente DB en CI)
- [ ] Persistencia Drizzle — PRD `PRD-PERS-01-persistencia-drizzle.md` + ADR `0024-persistencia-drizzle.md`
  - [x] `sales` + `cash/movements` write-through 1 tx + 409 (PERS-S1 parcial) — `src/pages/api/sales.ts` + `src/pages/api/cash/movements.ts` (copia durable best-effort con DB viva, memoria sigue mandando; `tests/pers-write-through.test.ts` 2 verdes 2026-10-11; cutover total pendiente DB en CI)
  - [x] `sync/push` outbox + id_mappings write-through (PERS-S2 parcial) — `src/pages/api/sync/push.ts` + `persistirOutboxOp`/`persistirIdMapping` en `src/lib/control-db.ts` (tablas `outbox`/`id_mappings` ya en `src/db/schema.ts:90-105`; `tests/sync-durable.test.ts` 3 verdes 2026-10-12; memoria sigue mandando)
  - [x] `GET /api/cash/balance` derivado Σ con DB (PERS-S3) — `src/pages/api/cash/balance.ts` lee `SUM(case ingreso/egreso)` por medio desde `cash_movements` con fallback a memoria (`derivar_balance`), `fuente: db|memoria`, nunca caché manual (verificado sin DB: `fuente: memoria`; con DB pendiente CI)
  - [ ] Resto por dominio + retirar `src/lib/store.ts` de `api` (PERS-S4/S5)
  - [x] `credit/*` write-through + balance DB (PERS-S4 primer dominio) — `sales-on-account.ts`/`payments.ts` insertan `customer_movements` best-effort (+ingreso caja en `cash_movements`), `balance.ts` deriva de DB con fallback a memoria (`fuente: db|memoria`); `tests/credit-rutas.test.ts` (2 verdes 2026-10-12; caché `saldo_cache_centavos` misma-tx pendiente CRUD N1 CAT)
  - [x] `tickets` historial + correcciones (PERS-S4 segundo dominio) — `GET /api/tickets` lee `sales+tickets` con fallback a memoria (`fuente: db|memoria`), `POST /api/sales/medium-corrections` inserta `ticket_payment_corrections` best-effort (TV14 nunca UPDATE); `tests/ticket-correcciones-ruta.test.ts` (1 verde 2026-10-12)
  - [x] `prices/adjustments` + auditoría (PERS-S4 tercer dominio) — `POST` inserta `price_adjustments` (idempotente) + `pricing_audit_log` best-effort (GP1/GP8 append-only; `preview` es previa pura sin persistir); regresión `nivel0-cierre` 4 + `precios` 18 + `precios-redondeo` 7 verdes 2026-10-12
  - [x] `suppliers` + `purchase-orders` cabecera (PERS-S4 cuarto dominio) — altas best-effort (`suppliers` por cuit UNIQUE, `purchase_orders` por key; ids de dominio no-uuid van sin id; líneas + flujo OCR drafts/confirm/match pendientes OCR-definitivo N1); `tests/suppliers-rutas.test.ts` (1 verde) + `proveedores-automatch` 5 verdes 2026-10-12
  - [x] `fiscal` docs durables + lecturas con fallback (PERS-S4 quinto dominio) — `src/lib/fiscal-db.ts` (`persistirFiscalDoc`/`leerFiscalDocs`); `sales.ts` (3 ramas), `nd.ts` (2 ramas) y `retry.ts` persisten best-effort append-only; `history`/`documents`/`export` leen DB con fallback a memoria; `wizard` queda en memoria (`fiscal_settings` espera `POST settings` N2-4); `tests/fiscal-durable.test.ts` (2 verdes) + `slice-homo` 4 + `nd` 4 + `nc` 8 + `padron` 1 verdes 2026-10-12 (nota: `fiscal-cableado.test.ts:41` falla también en árbol limpio — preexistente, worker/homo-fake sin tocar)
  - [x] `whatsapp/email` canales (PERS-S4 sexto y último dominio) — `close-summary` inserta `notification_events` + `email_outbox` en 1 tx best-effort (dedupe jornada), `consult` lee `products` con fallback a memoria (`fuente: db|memoria`); vincular/webhook ya persistían (códigos + bot links); `tests/canales-rutas.test.ts` (2 verdes) + `whatsapp-slice` 15 + `email-cierre` 6 + `email-eventos` 7 verdes 2026-10-12
- [ ] PWA + SQLite — PRD `PRD-PWA-01-offline-local.md` + ADR `0025-pwa-sqlite-wasm.md`
  - [x] `manifest` + iconos + `sw.js` (PWA-S1/S2) — `public/manifest.webmanifest` + `public/icons/icon-192|512.png` (generados con sharp del favicon) + `public/sw.js` + registro en `BaseLayout.astro` + `tests/pwa-manifest.test.ts` (3 verdes) + `astro build` OK 2026-10-11
  - [x] SQLite-WASM en `src/offline/db.ts` (PWA-S3 parcial) — backing real sql.js + DDL (`journal_outbox`, `journal_idmap`, `kv_meta`, `photos_queue`) + diario dual-write en `outbox-store`/`id-mappings` + hidrata al boot en `offline.ts` + snapshot OPFS/archivo/memoria + `tests/offline-sqlite.test.ts` (5 verdes) + `tsc` limpio 2026-10-11 (pendiente: lógica `photos_queue` PWA-S4, cifrado/borrado PWA-S5)
  - [x] Lógica `photos_queue` (PWA-S4) — `src/offline/fotos.ts` + `tests/pwa-fotos.test.ts` (2026-10-14); cifrado y borrado remoto (PWA-S5) siguen pendientes
- [ ] Verificar en fuente oficial: Google OIDC, Gmail/Photos API, Cloud API Meta, ARCA, BarcodeDetector/OPFS iOS (parcial 2026-10-12: ver `docs/01-fundacion/verificacion-fuente-oficial.md`; falta consola/dispositivos/contador)

## Nivel 1 — Núcleo comercio

- [ ] Catálogo/lotes/ubicaciones/conteo — PRD `PRD-CAT-01-catalogo-lotes-ubicaciones.md` + ADR `0026-catalogo-lotes-ubicaciones.md`
  - [ ] `products CRUD` + búsqueda (CAT-S1/S2)
  - [ ] `lots` + FEFO + alertas 15/7/3d (CAT-S3/S4)
  - [ ] `locations` + `counts/confirmar` (CAT-S5/S6)
- [ ] Caja QR/vencimientos/dividido — PRD `PRD-CAJA-01-qr-vencimientos-ticket-payments.md` + ADR `0027-caja-qr-vencimientos.md`
  - [ ] `cash_qr_receipts` bot+Gmail + auto/Deshacer (CAJA-S1/S2)
  - [ ] `cash_due_items` (CAJA-S3) + `ticket_payments` (CAJA-S4)
- [ ] Resolver OCR definitivo Fase 0 (PaddleOCR propio vs Vision/Textract) + legal/fiscal (Ley 25.326, leyenda, ARCA)

## Nivel 2-4 — Compras / Fiscal / Canales

- [x] Gmail `users.watch→PubSub` + fallback 15min (CS) — `src/pages/api/gmail/watch.ts` + `src/pages/api/gmail/webhook.ts` + `src/modules/utilities/ingesta_gmail.ts` (`descriptor_fallback_history` cada 15min) (2026-10-14)
- [ ] `POST /api/fiscal/settings` (hay `wizard.ts`, falta `settings.ts`) + `fiscal_customers`/padrón (Etapas 2-4 = P1)
- [x] Canales (rutas) — PRD `PRD-CH-01-canales-faltantes.md` + ADR `0028-canales-faltantes.md`
  - [x] `POST /api/email/send` (CH-S1) — `src/pages/api/email/send.ts` (envío real Resend a verificar)
  - [x] `POST /api/media/upload-url` (CH-S2) — `src/pages/api/media/upload-url.ts` (firma R2 real a verificar)
  - [x] `POST /api/jobs/enqueue` (CH-S3) — `src/pages/api/jobs/enqueue.ts` (pg-boss a verificar)
  - [x] `POST /api/billing/webhooks/mercadopago` (CH-S4) — `src/pages/api/billing/webhooks/mercadopago.ts` (idempotencia solo en memoria: ver ROADMAP)

## Nivel 5 — Operación

- [ ] Paneles + landing — PRD `PRD-OP-01-panel-cierre-landing.md` + ADR `0029-panel-landing-cierre.md`
  - [ ] Admin: `tenants`, `suspender|reactivar`, `rollouts/reintentar`, `audit`, tablas `platform_admins/migration_rollouts/infra_hosts/tenant_daily_usage` (OP-S1/S2)
  - [ ] `/panel` sin hardcode (`n-tickets=91`) ni `Próximamente P1` (OP-S3)
  - [ ] Landing E13: placeholders `business.ts:36-39`, `site` prod, OG PNG, PDF espejo, dominio, Formspree (OP-S4)

## Mapa PRD↔ADR nuevo

| PRD | ADR |
|---|---|
| `PRD-SYNC-01` | `0023` |
| `PRD-PERS-01` | `0024` |
| `PRD-PWA-01` | `0025` |
| `PRD-CAT-01` | `0026` |
| `PRD-CAJA-01` | `0027` |
| `PRD-CH-01` | `0028` |
| `PRD-OP-01` | `0029` |

## Estado verificado 2026-10-12. Pendiente real contra codigo

Marca una casilla solo con evidencia en archivo mas test en verde. No cambies las secciones previas. Son historia.

- [ ] Retirar `src/lib/store.ts` de `src/pages/api`. Evidencia. `grep from .*store en src/pages/api` da 0 hits. Hoy da decenas. Ver `docs/diseno/PRD-PERS-01-persistencia-drizzle.md:14`.
- [ ] Cutover total a DB en CI. Evidencia. `fuente: db` en `balance`, `tickets`, `credit` con DB viva. Hoy la memoria sigue mandando. Ver `CHECKLIST:16`.
- [ ] PWA fotos y borrado. Evidencia. Cola `photos_queue` con subida posterior mas cifrado y borrado remoto. Hoy solo DDL y dual-write. Ver `CHECKLIST:30`. Actualización 2026-10-14: `photos_queue` hecho (`src/offline/fotos.ts`); falta cifrado y borrado remoto.
- [ ] Fuente oficial en consolas y dispositivos. Evidencia. `docs/01-fundacion/verificacion-fuente-oficial.md` en verde total con contador. Hoy esta parcial.
- [ ] OCR definitivo Fase 0. Evidencia. ADR con PaddleOCR propio o Vision o Textract mas costo. Hoy abierto. Ver `docs/README.md:65`.
- [ ] Legal fiscal Ley 25.326. Evidencia. Minuta con contador o abogado sobre leyenda y ARCA. Hoy abierto. Ver `docs/adr/0000-indice-prd-ordenado.md:56`.
- [ ] UI T-UI-01 a T-UI-07. Evidencia. `npm run check:ui` mas cero `alert()` mas Sonner unico mas contraste AA registrado. Hoy parcial. Cero `alert()` ya verde en `src`. Sonner diferido a tickets por decision 2026-10-12 segun `SPEC-UI-00:13`. Ver `docs/diseno/SPEC-UI-00-implementacion.md`.
- [ ] Panel sin hardcode. Evidencia. `/panel` lee tickets y KPIs desde API sin `n-tickets=91` y sin `Proximamente P1`. Hoy pendiente. Ver `docs/diseno/PRD-OP-01-panel-cierre-landing.md:12`.
- [ ] Landing E13. Evidencia. `business.ts:36-39` sin placeholders mas `site` prod mas OG mas PDF espejo mas dominio mas Formspree. Hoy parcial. R1 contacto hecho 2026-10-12 con telefono y email reales mas wa de ejemplo a confirmar. R2 precios, dominio, Formspree y PDF pendientes. Ver `CHECKLIST:59`.
- [ ] Auth AU-01 y AU-02. Evidencia. Test `login` a `callback` con cookies y `next` con allowlist. Hoy requiere verificacion. Ver `docs/diseno/PRD-AU-01-login-endurecido.md`.
- [x] Test `fiscal-cableado.test.ts:41`. Evidencia. Suite en verde 2026-10-12. Fix en `src/modules/fiscal/worker.ts`. Hoy verde. Ver `CHECKLIST:26`.
- [ ] Aislamiento fiscal por tenant. Evidencia. Test de fuga cruzada en verde mas `leerFiscalDocs(tenantId)` con `where tenant_id`. Hoy `fiscal-db.ts:196` lee la tabla entera. Ver `docs/diseno/PRD-ISO-01-aislamiento-fiscal-tenant.md`.
- [ ] Aislamiento del plano de datos. Evidencia. Arch-test AT3 en verde mas 403 en multi sin tenant en rutas de datos. Hoy 13 rutas y `compras-db.ts` llaman `getTenantDb()` sin tenant. Ver `docs/diseno/PRD-ISO-02-aislamiento-plano-datos.md`.
- [ ] Memoria por tenant y sin fallback silencioso en multi. Evidencia. Test de mezcla en memoria en verde mas 503 en multi sin base mas `tests/pers2-pg.test.ts` contra Postgres local. Hoy `store` es uno por proceso. Ver `docs/diseno/PRD-PERS-02-cutover-multi-tenant.md`.
