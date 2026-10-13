# 0000 - Índice PRD ordenado - Sistema de Inventario

Fecha: 2026-10-10. Fuente: 28 docx en `Sistema de Inventario/`. Extracción con `python-docx` + 3 workers en paralelo (principio `guard-the-context-window`).

## Orden por dependencias (no por fecha)

### Nivel 0 - Fundaciones transversales (hacer primero)

1. `PRD - Autenticación y Gestión de Usuarios` - AU1-AU10+. Google OIDC puro `openid email profile`, Code+PKCE servidor, sin passwords. Tablas control: `users`, `memberships`, `invitations`, `sessions`, `bot_links`, `auth_events`. Roles Dueño total / Empleado limitado backend.
2. `PRD - Onboarding de Nuevos Clientes Parte 1+2` - ON1-ON13. Alta autoservicio, aprovisionamiento idempotente `crear base -> migraciones -> sembrar plantillas rubro -> registrar catálogo -> membership Dueño`. Verificación WA `VINCULAR <codigo>` gratis + respaldo plantilla. Demo `es_demo` borra 14d.
3. `PRD - Modo Offline` - OF1-OF9+. Principio no negociable 100% celular. SQLite local celular, outbox `op_id UUIDv7 + device_seq + hlc`, doble hora, FEFO local, confirma online. Decisión dueño 9/10/2026: venta/stock/caja offline entran en MVP v1.
4. `Costos estimados por cliente` - Restricción. 1 número central WABA compartido, 1000 servicio gratis compartido, utilidad ~USD 0.026 AR. Postgres propio Hetzner recomendado (0.14/cliente a escala vs Neon 16.75). PaddleOCR autohospedado elegido. Precios Básico 15 / Plus 35 / Pro 59.

### Nivel 1 - Núcleo comercio (MVP)

5. `PRD - Sistema de Inventario Parte 1/2/3` - F1-F14. Núcleo: `products`, `product_codes`, `stock_lots`, `stock_movements` append-only, `sales`, `sale_returns`, `suppliers`, `purchase_orders`, `product_cost_history`, `audit_log`. F2 jerarquía lector HID > cámara > texto > foto. F3 inmutable `REVOKE UPDATE/DELETE` + `registrar_movimiento FOR UPDATE`. F12 lotes FEFO MVP. F13 conteo por sector MVP. F8 mora 14d + día15 solo-lectura.
6. `PRD - Gestión de Precios Parte 1+2` - GP1-GP11. `cost_history` MVP v1. Recomendado bot vs aplicado manual prevalece. Snapshot precio en venta. Redondeo $1/10/50/100.
7. `PRD - Ticket de Venta Parte 1+2` - TV1-TV18. Comprobante interno no fiscal leyenda `DOCUMENTO NO VÁLIDO COMO FACTURA`. 1 venta = 1 ticket misma transacción stock + caja. Numeración secuencial por comercio segura offline.
8. `PRD - Caja Digital Parte 1/2/3` - C1-C18. `cash_movements`, `cash_day`, `shift_handovers`, `handover_counts`, `cash_drawer_drops`. C8 integración inventario misma tx. C17 entrega turno conteo a ciegas + conteo sorpresa. C18 fiado lado caja.
9. `PRD - Fiado y Cuenta Corriente` - FC1-FC9. Herramientas deterministas sin IA. `A cuenta` no es medio caja. Tope por cliente, offline controla contra saldo local, pago de más = saldo a favor a revisar.

### Nivel 2 - Compras y gastos

10. `PRD - Facturas de Proveedores` - FP1-FP12. Foto al bot -> Photos -> OCR sugerencia -> confirma 1 toque. `supplier_invoices` inmutable + `drafts` mutable + `supplier_payments` + `match_log`. Matching con `purchase_orders`.
11. `PRD - Consumos de Servicios` - CS1-CS12. `service_accounts`, `utility_bills`, `email_ingestion_filters/log`. Ingesta Gmail `users.watch -> PubSub` + fallback 15min. PDF digital primero, luego OCR.
12. `PRD - Órdenes de Pago` - OP1-OP13. Principio `el bot prepara, el comerciante paga`. Sin credenciales MP/homebanking/ARCA. `payment_orders` + `payees` + `official_payment_domains` allowlist. `Ya pagué` -> caja manual.

### Nivel 3 - Fiscal

13. `PRD - Facturación Electrónica ARCA` - FE1-FE16 → implementado en `docs/diseno/PRD-FE-01-fiscal-arca.md` + `docs/adr/0018-fiscal-arca.md`. Ticket sigue no fiscal. Factura con CAE + QR vinculada a venta. `FiscalProvider` propio (pyafipws descartado). WSAA TA 12h cacheado + WSFEv1. Cola + lock por (CUIT,PV,tipo) + idempotencia `FECompConsultar`. Offline: vende igual, factura al sincronizar.

### Nivel 4 - Canales

14. `PRD - Bot de WhatsApp Parte 1+2` - B1-B15. 1 número central WABA proveedor. Vinculación, opt-in, consulta stock texto libre `pg_trgm`, alertas umbral, aviso matutino, urgente/viernes, armado pedido, envío `wa.me` MVP vs Cloud API P1. Tablas `whatsapp_identities`, `whatsapp_usage`, `notification_preferences`, `product_aliases`.
15. `PRD - Notificaciones por Email` - NE1-NE17. Resend recomendado, SES plan B. 3 claves por WA+email (matutino, viernes, cierre caja). Resto email. `email_outbox`, `delivery_status`, plantillas React Email, SPF/DKIM/DMARC.

### Nivel 5 - Inteligencia y operación

16. `PRD - Reportes de Rotación` - RT1-RT11. Sobre `stock_movements` neto devoluciones. `product_daily_stats`, `mv_rotation_7d/30d/90d`. Sin integración directa, reusa bot+email RT6.
17. `PRD - Panel de Administración Multi-Kiosco` - PA1-PA14 vigente = Partes 1-3 de 3. ATENCIÓN divergencia: `PRD - Panel ... .docx` suelto es versión vieja (incluye ventas, deudas, drill-down) explícitamente prohibida por Parte 1 Tabla 3/O2 + Ley 25.326. Vigente = solo datos gestión: `platform_admins`, `admin_audit_log`, `tenant_daily_usage`, `tenant_health_signals`, `infra_hosts`, `billing_*`, `migration_rollouts`. Admin en `admin.<dominio>`, allowlist `google_sub`.

## Dependencias críticas

- Todo cuelga de Auth + control DB + aprovisionamiento Onboarding.
- Offline atraviesa venta/stock/caja/ticket/precios/fiado.
- Caja es hub: inventario F5, ticket TV6, fiado FC, proveedores FP5, consumos CS5, pagos OP9, ARCA FE, cierre bot B14 + email NE4.
- Bot + Email comparten `notification_preferences` y catálogo NE1.
- Panel solo lee contadores técnicos vía `ops_signals_outbox`, nunca negocio.
- Costos condicionan: número central, Resend vs SES, Hetzner vs Neon, PaddleOCR vs Vision.

## Qué falta / a verificar

- `[a verificar]` Google OIDC, Gmail/Photos API, Cloud API Meta, ARCA, BarcodeDetector iOS, OPFS iOS. Confirmar en fuente oficial antes de implementar.
- Alinear PRD principal con decisión offline v1 y `cost_history` v1.
- Resolver OCR definitivo Fase 0 (costos dice PaddleOCR propio, FP dice Vision/Textract/multimodal).
- Legal/fiscal con abogado/contador (Ley 25.326, leyenda ticket, ARCA).

## ADRs de PRDs nuevos (2026-10-12)

| PRD | ADR | Decisión |
|---|---|---|
| `PRD-BOT-01` | `0039` | Bot único con módulos por rubro |
| `PRD-BOT-01` | `0040` | Resumen mensual y acciones propuestas |
| `PRD-BOT-02` | `0041` | Proveedor WhatsApp: Cloud API oficial, Baileys descartado |
| `PRD-BOT-02` | `0042` | Interfaz `WhatsAppTransport` intercambiable |
| `PRD-ALR-01` | `0043` | Cron de alertas con `pg_cron` + `pg_net` en Supabase |
| `PRD-IA-01` | `0044` | Asistente IA: catálogo cerrado + function calling de solo lectura |
| `PRD-IA-01` | `0045` | Proveedor LLM del asistente y cupo por plan |
| `PRD-LP-04` | `0046` | Chat de landing: LLM barato, solo FAQ, aislado |
| `PRD-UX-01` | no aplica | Uso de skills de diseño por fase y componente en el dashboard (usa ADR-0037/0038) |
| `PRD-PLAN-01` | `0047` | Cobro por plan mensual (Básico, Plus, Pro), no por módulo, con cupos |
| `PRD-PLAN-02` | `0047` | Rango de precios por plan (Básico 15-20, Plus 30-35, Pro 49-59 USD) con costos y mercado; condicionado a funciones en producción |
| `PRD-DASH-01` | no aplica | Bot, alertas, asistente IA y chat en dashboard (usa ADR-0039, 0041 a 0046) |
| `PRD-ISO-01` | `0050` | Aislamiento fiscal por tenant: contexto en servidor, `tenant_id` y fail-closed (2026-10-13) |
| `PRD-ISO-02` | `0051` | Tenant por request (AsyncLocalStorage) en todo el plano de datos, 403 en multi sin tenant, backfill en seco (2026-10-13) |
| `PRD-PERS-02` | `0052` | Memoria por tenant, sin fallback silencioso en multi, jobs con tenant y Postgres local para tests (2026-10-13) |
| `PRD-PERS-02` (E4) | `0053` | Repos de dominio en `src/lib/repos/`: rutas sin `store`, DB primero, memoria solo en single; grupo 1 tickets, precios, proveedores (2026-10-13) |
| `PRD-PERS-02` (E5) | `0054` | Repositorio fiscal: rutas `fiscal/*` sin `store`; grupo 2 (2026-10-13) |
| `PRD-PERS-02` (E6) | `0055` | Repositorios de canales: rutas `whatsapp/*` y `email/*` sin `store`; grupo 3 (2026-10-13) |
| `PRD-PERS-02` (E7) | `0056` | Repositorio de caja: rutas `cash/*` sin `store`; grupo 4 (2026-10-13) |
