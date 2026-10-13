# Índice general de documentación — Sistema de Inventario

Organización por dominio, espejo de `src/modules/`. Cada carpeta = una funcionalidad del código.
Origen: 30 `.docx` de raíz convertidos a `.md` el 2026-10-11 (originales en `docs/_origen-docx/`).
ADRs en `docs/adr/` y PRDs de diseño en `docs/diseno/` se referencian, no se duplican.
Checklist de gaps 2026-10-11: `CHECKLIST-documentacion.md` (PRDs `PRD-SYNC-01`, `PRD-PERS-01`, `PRD-PWA-01`, `PRD-CAT-01`, `PRD-CAJA-01`, `PRD-CH-01`, `PRD-OP-01` + ADRs `0023`-`0031`).
Estado de implementación y roadmap 2026-10-12: `ROADMAP.md` (reemplaza al checklist como fuente de estado).

## 01-fundacion/ — Arquitectura, stack, costos y offline transversal
Base técnica y restricciones que condicionan todo.
- `costos-por-cliente.md` (WABA compartido, Hetzner vs Neon, PaddleOCR, planes 15/35/59) → `src/modules/whatsapp`, `src/modules/ocr`, `src/modules/payments`
- `modo-offline.md` (OF1-OF9, SQLite local, outbox `op_id UUIDv7`, FEFO local) → `src/offline/`, `src/pages/api/sync/*`, `src/lib/outbox.ts`
- ADRs: `adr/0001-arquitectura-base.md`, `adr/0002-stack-desarrollo.md`, `adr/0003-multitenancy-datos-offline.md`, `adr/0007-externos.md`, `adr/0013-adaptacion.md`, `adr/0017-slice-0.md`

## 02-identidad-onboarding/ — Auth, onboarding y tenants
Quién entra y cómo se crea su comercio.
- `autenticacion-gestion-usuarios.md` (AU1-AU10, Google OIDC, roles Dueño/Empleado) → `src/modules/auth/*`, `src/pages/api/auth/*`, `src/db/schema.ts`
- `onboarding-parte-1.md`, `onboarding-parte-2.md` (ON1-ON13, aprovisionamiento idempotente, `VINCULAR <codigo>`, demo 14d) → `src/modules/onboarding/*`, `src/modules/tenants/aprovisionar.ts`, `src/pages/api/onboarding/*`
- ADRs: `adr/0011-control-plane.md` + `diseno/PRD-CP-01-control-plane.md`

## 03-inventario-precios/ — Stock y precios
Núcleo comercio: qué hay y cuánto vale.
- `inventario-parte-1.md`, `inventario-parte-2.md`, `inventario-parte-3.md` (F1-F14, `stock_lots`, `stock_movements` append-only, FEFO, conteo por sector) → `src/modules/inventario/*`, `src/pages/api/stock/*`, `src/db/schema.ts`
- `precios-parte-1.md`, `precios-parte-2.md` (GP1-GP11, `cost_history`, snapshot en venta, redondeo) → `src/modules/pricing/*`, `src/pages/api/prices/*`, `src/db/schema-precios.ts`
- ADRs: `adr/0012-negocio-catalogo.md` + `diseno/PRD-NEG-01-negocio-catalogo.md`

## 04-ventas-caja-fiado/ — Ticket, caja, turnos y fiado
Plata que entra/sale y comprobantes.
- `ticket-venta-parte-1.md`, `ticket-venta-parte-2.md` (TV1-TV18, no fiscal, 1 venta = 1 ticket) → `src/modules/sales/ticket_*`, `src/pages/api/tickets/*`, `src/db/schema-tickets.ts`
- `caja-digital-parte-1.md`, `caja-digital-parte-2-turnos.md`, `caja-digital-parte-3-integraciones.md` (C1-C18, `cash_movements`, `shift_handovers`, conteo a ciegas) → `src/modules/cash/*`, `src/pages/api/cash/*`, `src/db/schema-caja.ts`
- `fiado-cuenta-corriente.md` (FC1-FC9, tope por cliente, `A cuenta` no es medio caja) → `src/modules/credit/*`, `src/pages/api/credit/*`, `src/db/schema-credito.ts`
- ADRs: `adr/0004-caja-ventas.md`

## 05-compras-servicios-pagos/ — Proveedores, servicios y órdenes de pago
Plata que sale: mercadería, luz/gas, pagos.
- `facturas-proveedores.md` (FP1-FP12, OCR → confirma 1 toque, `supplier_invoices` inmutable + `drafts`) → `src/modules/purchases/*`, `src/modules/ocr/*`, `src/pages/api/supplier-invoices/*`, `src/db/schema-proveedores.ts`
- `consumos-servicios.md` (CS1-CS12, Gmail `users.watch`, PDF primero) → `src/modules/utilities/*`, `src/pages/api/utility-bills/*`, `src/db/schema-servicios.ts`
- `ordenes-pago.md` (OP1-OP13, el bot prepara el comerciante paga, allowlist dominios) → `src/modules/payments/*`, `src/modules/pagos-tx/*`, `src/pages/api/payment-orders/*`, `src/db/schema-pagos.ts`
- ADRs: `adr/0005-ocr.md`

## 06-fiscal-arca/ — Facturación electrónica ARCA
Lo único fiscal; el ticket sigue no fiscal.
- `facturacion-electronica-arca.md` (FE1-FE16, CAE + QR, `FiscalProvider` propio, WSAA 12h, cola + lock por CUIT/PV/tipo) → `src/modules/fiscal/*`, `src/pages/api/fiscal/*`, `src/db/schema-fiscal.ts`, `src/db/schema-fiscal-control.ts`
- ADRs: `adr/0018-fiscal-arca.md`, `adr/0019-slice-fiscal.md`, `adr/0050-aislamiento-fiscal-por-tenant.md` + `diseno/PRD-FE-01-fiscal-arca.md`, `diseno/PRD-ISO-01-aislamiento-fiscal-tenant.md`, `diseno/PRD-ISO-02-aislamiento-plano-datos.md` + `adr/0051-tenant-por-request.md`

## 07-canales-whatsapp-email/ — Bot y email
Canales de aviso y consulta.
- `bot-whatsapp-parte-1.md`, `bot-whatsapp-parte-2.md` (B1-B15, 1 número central WABA, `VINCULAR`, `pg_trgm`, alertas umbral) → `src/modules/whatsapp/*`, `src/pages/api/whatsapp/*`, `src/db/schema-whatsapp.ts`
- `notificaciones-email.md` (NE1-NE17, Resend, `email_outbox`, plantillas React Email) → `src/modules/email/*`, `src/pages/api/email/*`, `src/db/schema-email.ts`
- ADRs: `adr/0039-bot-modulos-rubro.md`, `adr/0040-resumen-mensual-acciones.md`, `adr/0041-proveedor-whatsapp-cloud-api.md`, `adr/0042-whatsapp-transport-intercambiable.md`, `adr/0043-cron-alertas-pg-cron.md` + `diseno/PRD-BOT-01-modulos-rubro.md`, `diseno/PRD-BOT-02-consulta-stock-whatsapp.md`, `diseno/PRD-ALR-01-alertas-stock-bajo.md`

## 08-operacion-admin-analytics/ — Reportes, panel multi-kiosco y dashboard
Operar la plataforma, no los comercios.
- `reportes-rotacion.md` (RT1-RT11, `product_daily_stats`, vistas 7/30/90d) → `src/modules/analytics/*`, `src/pages/api/analytics/*`, `src/db/schema-analytics.ts`
- `panel-admin-parte-1.md`, `panel-admin-parte-2.md`, `panel-admin-parte-3.md` (PA1-PA14 vigente, solo gestión, Ley 25.326) → `src/modules/admin/*`, `src/pages/api/admin/*`, `src/db/schema-admin.ts`
- `panel-admin-version-anterior-DEPRECADA.md` ⚠️ versión vieja prohibida por Parte 1 Tabla 3/O2, solo referencia histórica
- `dashboard-indice-navegacion.md` → `src/pages/panel.astro`, `src/pages/index.astro`, `src/components/`
- ADRs: `adr/0006-panel.md`, `adr/0020-dashboard.md`, `adr/0000-indice-prd-ordenado.md` (orden de dependencias Nivel 0-5)
- Dashboard, asistente y planes: `diseno/PRD-DASH-01-implementacion-bot-alertas-ia-chat.md`, `diseno/PRD-IA-01-asistente-preguntas-negocio.md` + `adr/0044-asistente-ia-catalogo-cerrado.md`, `adr/0045-proveedor-llm-asistente.md`; `diseno/PRD-PLAN-01-planes-suscripcion.md`, `diseno/PRD-PLAN-02-precios-suscripcion.md` + `adr/0047-cobro-por-plan-mensual.md`

## 09-frontend-landing-diseno/ — Landing, tema papel y skills
Lo público y el sistema de diseño.
- `landing-gaps-modoops.md` (Gaps E1-E13) → `src/pages/index.astro`, `src/components/sections/*`
- ADRs: `adr/0008-tokens-tema-papel.md`, `adr/0009-componentes-adopcion.md`, `adr/0010-landing.md`, `adr/0021-landing-iteracion.md`, `adr/0022-landing-gaps.md` + `diseno/PRD-DS-01-tokens-tema-papel.md`, `diseno/PRD-DS-02-componentes.md`, `diseno/PRD-DS-03-adopcion-inventario.md`, `diseno/PRD-LP-01-landing.md`, `diseno/PRD-LP-02-landing-iteracion.md`, `diseno/PRD-ADAP-01-modoops-a-inventario.md`, `diseno/PRD-SK-01-grounding-how-why.md`, `diseno/PRD-SK-02-architect.md`, `diseno/PRD-SK-03-prosa-revision.md` + `adr/0014-grounding.md`, `adr/0015-architect.md`, `adr/0016-prosa-revision.md`
- Chat de landing y skills de diseño del dashboard: `diseno/PRD-LP-04-chat-flotante-landing.md` + `adr/0046-chat-landing-llm-aislado.md`; `diseno/PRD-UX-01-uso-skills-diseno-dashboard.md`

## Notas
- Divergencia conocida: el `.docx` suelto del Panel incluye ventas/deudas y está prohibido; vale Partes 1-3.
- OCR sin definir Fase 0 definitivo (PaddleOCR propio vs Vision/Textract).
- Verificar en fuente oficial antes de implementar: Google OIDC, Gmail/Photos API, Cloud API Meta, ARCA, BarcodeDetector/OPFS iOS.
