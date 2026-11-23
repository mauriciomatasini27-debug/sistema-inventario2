# Roadmap

El estado vivo son los avances que no están en hecho. `npm run roadmap` en main regenera esta sección desde `docs/roadmap/avances/`.

<!-- roadmap:avances:inicio -->
## Avances por PR (generado)

No se edita a mano: se regenera con `npm run roadmap` desde `docs/roadmap/avances/`.

| Fecha | Item | Estado | Avance | PRD / ADR |
|---|---|---|---|---|
| 2026-11-22 | TB-169 | aceptado | TB-169: spec aceptada para simplificar `/panel/stock` con una próxima acción por estado del negocio. | PRD-STOCK-04 / — |
| 2026-11-22 | WA-ESTADOS-WEBHOOK | en curso | WA-ESTADOS-WEBHOOK: la ruta del webhook guarda los estados de Meta (sent, delivered, read, failed) en whatsapp_usage con compare-and-swap que nunca retrocede; la migración 0059 suma entregado_en, leido_en, fallo_codigo y fallo_motivo, está aprobada por Mauri y aplicada en Supabase (journal 52→60, ver 0058) y en el clúster local; el código espera merge en #503. | — / — |
| 2026-11-21 | P10-93 | propuesto | P10-93: venta por peso con gramos enteros, precio por kilogramo y ticket en kilogramos. | PRD-VP-02 / ADR-0121 |
| 2026-11-18 | STOCK-E5 | parcial | STOCK-E5 parcial: alta de códigos en `/panel/stock` (STOCK-S19) más edición/baja vía `PATCH /api/products` con `codigo` (dedupe por PK `(tenant_id, codigo)` con 409 y normalización a mayúsculas, `""` limpia, también en modo memoria); queda la UI de edición/baja en el panel y la validación EAN. | PRD-STOCK-01 / ADR-0114 |
| 2026-11-15 | P10-17 | pendiente | P10-17: el fallback de `promote` en `src/pages/api/sync/promote.ts` (`src/lib/repos/sync.ts:690-727`) numera `T-*` desde el contador de memoria y responde 201 cuando la transacción con base viva falla, contra ADR-0080 (correlativos solo de `ticket_counters` con `FOR UPDATE`). | — / — |
| 2026-11-15 | GGL-E1, GGL-E2, GGL-E3 y GGL-E4 | bloqueado (externo) | GGL-E1–E3 implementados en repo (OAuth PKCE, token cifrado, watch/history, Pub/Sub OIDC, cola, panel, remitentes, S10b, S12), con huecos P0 listados en ADR-0103 (dedupe por messageId, evento por filtros, label elegible, rechazo de casilla ajena al conectar, scheduler del watch); GGL-E4 (Photos) no tiene código: solo `photos_albumes` y el tipo en el state; bloqueado externo: E2E con Google real y Pub/Sub/KMS en prod (Mauri); GGL-S13 reenvío queda P1 sin ADR. | PRD-GMAIL-01 / ADR-0102 |
| 2026-11-15 | GGL-P0-HUECOS | pendiente | GGL-P0-HUECOS pendiente: cerrar los cinco huecos P0 de la ingesta Gmail que la auditoría 2026-11-15 encontró entre ADR-0103 y el código, antes de abrir la ingesta a más comercios: dedupe explícita por `messageId` (el webhook lo descarta, `src/pages/api/gmail/webhook.ts:51-57`; la cola deduplica por `(connection_id, history_id)`, `src/lib/repos/gmail-cola.ts:45-47`), evento en `gmail_connection_events` al cambiar filtros (hoy solo conexión/desconexión/error, `src/lib/repos/google-conexiones.ts:171,446`), label elegible para `users.watch` (hoy `INBOX` fijo, `src/jobs/gmail.ts:212`), rechazo de la casilla ya activa en otro comercio al conectar (el 409 salta recién al registrar el watch, `src/lib/repos/gmail-watch.ts:51-53`) y scheduler del watch (`src/pages/api/jobs/gmail-poll.ts` renueva con <12 h de vida pero nada lo invoca cada 24 h). | PRD-GMAIL-01 / ADR-0103 |
| 2026-10-20 | P10-8 | bloqueado (diferido por Mauri) | P10-8 queda bloqueado: las ventas offline aplicadas desde la outbox (P10-6) no crean el doc fiscal pendiente que arma `POST /api/sales`; Mauri lo difirió el 2026-10-20 junto con el resto de ARCA/fiscal. | PRD-FE-02 / ADR-0097 |
| 2026-10-19 | FE-S26 | parcial | FE-S26 parcial: `fiscal_computers` y `arca_tokens` dejan de ser tablas sin uso. `src/lib/repos/fiscal-control.ts` guarda el computador con `key_pem` cifrado por el KMS (`FISCAL_KMS_KEY_B64`, sin fallback a texto plano), lo lee descifrado y persiste la TA de WSAA (`token` y `sign`) cifrada con vencimiento. `crear_arca_provider` acepta una `TaDurable`: antes de pedir login a WSAA lee la TA de otro worker, y después del login guarda la nueva. Si la base o el KMS fallan, avisa y sigue con el login, nunca bloquea la emisión. `POST /api/fiscal/emitir` cablea la TA durable con `taDurablePara`. El endurecimiento queda en ADR-0098 y PRD-FE-03 (alta idempotente con `.returning`, fallback registrado, ambiente validado al leer, test del store drizzle contra el control DB). Alertas 60/30/7 y runbooks: issue #106 (`P106-1`). Falta CSR/certificado WSASS en entorno (#63). Tests en `tests/fiscal-control-persistencia.test.ts`, `tests/fiscal-control-pg.test.ts`, `tests/fiscal-ta-durable.test.ts` y `tests/fiscal-cert-vencimiento.test.ts`. | PRD-FE-01 / ADR-0018 |
| 2026-10-18 | OCR1-S3 | parcial | OCR1-S3 parcial: benchmark del extractor OCR sobre un corpus etiquetado (tests/ocr-benchmark.test.ts, exactitud global 0.9667); la medición sobre el set del piloto y la latencia de Paddle esperan las imágenes y el endpoint. | PRD-OCR-01 / ADR-0005 |
| 2026-10-18 | P9-2 | bloqueado (diferido por Mauri) | P9-2 sigue bloqueado: Mauri difirió la decisión el 2026-10-18; ADR-0090 queda propuesto hasta que designe contador y abogado. | PRD-FE-02 / ADR-0090 |
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
