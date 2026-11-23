# Trazabilidad — servicios

Fecha: 2026-11-23. Historia: AUD-S5 de PRD-AUD-03 (ADR-0127).
Pantalla: `src/pages/panel/consumos.astro` (548 líneas) + `components/panel/ConsumosCard.astro`.
Handlers: `api/service-accounts`, `api/utility-bills/*`, `api/email-drafts/*`.
Tablas: `service_accounts`, `utility_bills`, `email_ingestion_drafts` (`schema-servicios.ts`,
`schema-google.ts`). Repos: `lib/repos/servicios.ts`, `lib/repos/gmail-borradores.ts`.
No auditado: la ingesta de Gmail (`gmail-ingesta.ts`) que crea los borradores; acá se traza lo que
la pantalla hace con ellos.

## Campos persistidos

| Campo en pantalla | Payload | Handler | Repo | Columna | Estado |
|---|---|---|---|---|---|
| Servicio (luz, gas, …) | `servicio` | `POST /api/service-accounts` | `altaCuenta` (`repos/servicios.ts`) | `service_accounts.servicio` | ok |
| Proveedor de la cuenta | `proveedor` | idem | idem | `service_accounts.proveedor` | ok |
| Titular | `titular` | idem | idem | `service_accounts.titular` | ok |
| Borrador: cuenta asociada | `account_id` | `POST /api/email-drafts/confirm` | `confirmarBorradorGmail` (`repos/gmail-borradores.ts`) | `utility_bills.account_id` | ok |
| Borrador: monto | `monto` | idem | idem | `utility_bills.monto_centavos` | ok |
| Borrador: vencimiento | `vencimiento` | idem | idem | `utility_bills.vencimiento` | ok |
| Borrador: período | `periodo` | idem | idem | `utility_bills.periodo` | ok |
| Borrador: confirmado | `draft_id` | idem | idem | `email_ingestion_drafts.estado` (`confirmado`) | ok |
| Borrador: descartado | `draft_id` | `POST /api/email-drafts/discard` | `descartarBorradorGmail` | `email_ingestion_drafts.estado` (`descartado`) | ok |
| Pago: factura | `bill_id` | `POST /api/utility-bills/pay` | `pagarFactura` | `utility_bills.estado` (`pagada`) | ok |
| Pago: medio | `medio` | idem | idem | `cash_movements.metodo` (egreso) | ok |
| Pago: servicio y proveedor | `servicio`, `proveedor` | idem | idem | `cash_movements.categoria_id` (deriva `categoria_para(servicio)`) | ok (derivado) |

## Solo lectura

| Elemento | Handler | Repo | Columnas |
|---|---|---|---|
| Cuentas de servicio | `GET /api/service-accounts` | `listarCuentasDetalle` | `service_accounts.*` |
| Facturas por vencer (7 días) | `GET /api/utility-bills/due?dentro_dias=7` | `listarFacturas` | `utility_bills.vencimiento`, `monto_centavos`, `estado` |
| Borradores pendientes | `GET /api/email-drafts` | `listarBorradoresPendientes` (`repos/gmail-borradores.ts`) | `email_ingestion_drafts.*` |

## Columnas del módulo sin pantalla

| Columna | Clasificación |
|---|---|
| `service_accounts.alias`, `email_origen`, `vencimiento_tipico_dia`, `medio_habitual`, `debito_automatico`, `activa` | **sin pantalla (servicios-1)**: el alta pide solo servicio, proveedor y titular |
| `service_accounts.numero_cuenta` | ídem: la API lo acepta, la pantalla no lo pide |
| `utility_bills.canal`, `origen`, `confianza`, `necesita_revision`, `gmail_attachment_id`, `message_id` | los escribe la ingesta; el panel muestra `necesita_revision` |
| `email_ingestion_drafts.confianza`, `vence_en`, `recordatorio_en`, `connection_id`, `gmail_attachment_id`, `canal`, `origen` | internas de la ingesta |

## Hallazgos

1. **servicios-1 — la cuenta de servicio se crea incompleta.** `POST /api/service-accounts` recibe
   solo `servicio`, `proveedor` y `titular` (`consumos.astro:439`), pero el matching de la ingesta
   por email usa `alias`/`email_origen` y el orden de “próximas a vencer” usa
   `vencimiento_tipico_dia` (`schema-servicios.ts:16-29`). Sin pantalla para esos campos, una
   cuenta nueva no matchea mails ni se ordena por vencimiento hasta que los cargue la ingesta.
   Issue #479. Accionable: extender el alta (o el `PATCH`) con alias, email de origen y día de vencimiento.
2. **servicios-2 — la factura pagada no muestra el comprobante ni el medio con que se pagó.** El
   panel lista vencimiento y monto, y el egreso queda en `cash_movements` con la categoría que
   deriva `categoria_para(servicio)`: la pantalla no muestra el movimiento generado. Nota de
   producto, sin acción de auditoría.
