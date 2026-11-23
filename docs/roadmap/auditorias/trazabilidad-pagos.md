# Trazabilidad — pagos

Fecha: 2026-11-23. Historia: AUD-S5 de PRD-AUD-03 (ADR-0127).
Pantalla: **no existe**. Handlers: `src/pages/api/payment-orders/{prepare,confirm-paid,cancel,sugerir-desde-notif}.ts`.
Repo: `src/lib/repos/ordenes-pago.ts`. Tabla: `payment_orders` (`schema-pagos.ts:29`).

## Campos persistidos

Ninguno: ningún archivo de `src/pages` ni `src/components` llama a `/api/payment-orders`. El
payload de los handlers (`prepareOrderSchema`, `confirmOrderPaymentSchema`, `cancelOrderSchema`)
existe y las columnas también, pero no hay campo de pantalla que los origine.

## Solo lectura

Ninguno. La pantalla que ADR-0127 lista como “pagos” no está en el panel: `src/pages/panel/` no
tiene `pagos.astro` ni una tarjeta que liste órdenes de pago.

## Columnas del módulo sin pantalla

Todas las de `payment_orders` (`numero`, `payee_id`, `tipo`, `concepto`, `categoria`,
`monto_centavos`, `moneda`, `vence_el`, `metodo_sugerido`, `instruccion_tipo`,
`instruccion_snapshot`, `link_dominio`, `referencia`, `supplier_invoice_id`, `servicio_id`,
`estado`, `version`, `cash_movement_id`, `paid_at`, `paid_amount_centavos`, `paid_method`, `nota`,
`comprobante_ref`, `cancel_motivo`, `creado_por`, `confirmado_por`, `enviado_at`), y las de
`payees`, `payment_order_events` y `official_payment_domains`: ninguna tiene pantalla en esta
pasada.

## Hallazgos

1. **pagos-1 — la pantalla de pagos no existe: el módulo está solo en API.** Las cuatro rutas
   (`prepare`, `confirm-paid`, `cancel`, `sugerir-desde-notif`), el repo y la tabla están
   completos, pero `grep payment-orders src/pages src/components` no devuelve consumidores; el
   único resultado es `lib/tenant-context.ts:49`, que es la lista de prefijos con tenant, no una
   llamada. Efecto para la auditoría: la pantalla “pagos” del PRD no se puede trazar ni recorrer
   (AUD-S6 va a tener que saltearla o marcarla como faltante). Issue #481.

   Decisión: hallazgo de producto, no de persistencia. Antes de crear la UI hay que decidir si
   `payment_orders` reemplaza el pago de factura de proveedor que hoy sí tiene pantalla
   (`trazabilidad-proveedores.md`) o si convive con él; si convive, son dos caminos para el mismo
   egreso y el registro tiene que decir cuál manda.
