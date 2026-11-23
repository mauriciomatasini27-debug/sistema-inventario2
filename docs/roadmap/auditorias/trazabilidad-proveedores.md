# Trazabilidad — proveedores

Fecha: 2026-11-23. Historia: AUD-S5 de PRD-AUD-03 (ADR-0127).
Pantalla: `src/pages/panel/proveedores.astro` (546 líneas). Handlers:
`api/suppliers`, `api/suppliers/contactos`, `api/suppliers/invitar`, `api/purchase-orders`,
`api/supplier-invoices/*`. Repos: `lib/repos/proveedores.ts`, `ordenes-pago.ts`,
`facturas-proveedor.ts`.
No auditado: el borrador OCR (`supplier_drafts`) no tiene pantalla en esta pasada; su confirmación
llega por `supplier-invoices` desde el bot.

## Campos persistidos

| Campo en pantalla | Payload | Handler | Repo | Columna | Estado |
|---|---|---|---|---|---|
| CUIT | `cuit` | `POST /api/suppliers` | `altaProveedor` | `suppliers.cuit` | ok |
| Nombre | `nombre` | idem | idem | `suppliers.nombre` | ok |
| Email | `email` | idem | idem | `suppliers.email` | ok |
| Teléfono | `telefono` | idem | idem | `suppliers.telefono` | ok |
| Invitación de WhatsApp | `cuit` | `POST /api/suppliers/invitar` | `invitarProveedor` | `proveedor_invitaciones.supplier_cuit` (+ `codigo_hash`, `expira_en_ms`, `usado`) | ok |
| Decisión de contacto | `numero`, `estado` | `POST /api/suppliers/contactos/decidir` | `decidirContacto` | `proveedor_contactos.estado` | ok (proveedores-1) |
| OC: proveedor | `supplier_cuit` | `POST /api/purchase-orders` | `crearOrden` | `purchase_orders.supplier_cuit` | ok |
| OC: líneas (SKU, cantidad, costo) | `lineas[].sku`, `.qty`, `.costo_centavos` | idem | idem | `purchase_order_lines.sku`/`qty`/`costo_centavos` | ok |
| OC: quién la creó | `creado_por` | idem | idem | `purchase_orders.creado_por` | ok |
| OC: total | calculado | idem | idem | `purchase_orders.total_centavos` | ok (derivado) |
| Cierre de OC | `order_id`, `quien` | `POST /api/purchase-orders/close` | `cerrarOrden` | `purchase_orders.cerrado_en`, `estado` | ok |
| Pago: proveedor, monto, medio, fecha, quién | `supplier_cuit`, `monto_centavos`, `metodo`, `fecha_iso`, `creado_por` | `POST /api/supplier-invoices/payments` | `registrarPagoProveedorRepo` (`facturas-proveedor.ts:704`) | `supplier_payments.supplier_cuit`/`monto_centavos`/`metodo`/`created_at`/`creado_por` | ok |
| Pago: factura asociada | `factura_id` | idem | idem | `supplier_payments.factura_id` | ok |
| Pago: egreso en caja | (derivado) | idem | `registrarEgresoRetiro` | `cash_movements` (categoría `pago_proveedor`) | ok (derivado) |

## Solo lectura

| Elemento | Handler | Repo | Columnas |
|---|---|---|---|
| Buscador de proveedores | `GET /api/suppliers?q=` | `listarProveedores` | `suppliers.nombre`, `cuit`, `email`, `telefono`, `activo` |
| Cuenta corriente del proveedor | `GET /api/supplier-invoices/account?cuit=` | `cuentaProveedor` | `supplier_invoices.total_centavos`, `supplier_payments.monto_centavos` |
| Contactos pendientes | `GET /api/suppliers/contactos` | `listarContactos` | `proveedor_contactos.numero_e164`, `estado` |

## Columnas del módulo sin pantalla

| Columna | Clasificación |
|---|---|
| `suppliers.activo`, `updated_at` | internas: las maneja el dominio, no el panel |
| `purchase_orders.idempotency_key`, `es_semanal`, `origen`, `canal` | sin pantalla: las escribe el bot (`origen`/`canal`) o son internas |
| `supplier_invoices.*` (factura) | sin pantalla en el panel: la factura la crea la confirmación del borrador OCR (bot/ingesta) |
| `supplier_drafts.*` | sin pantalla: borrador OCR |
| `supplier_match_log.*` | interna: matching automático borrador ↔ OC |
| `proveedor_cupo.marcas_ms`, `aviso` | interna: anti-spam del bot |

## Hallazgos

1. **proveedores-1 — el contacto no queda vinculado al proveedor desde el panel.**
   `POST /api/suppliers/contactos/decidir` recibe `numero` y `estado` y actualiza
   `proveedor_contactos.estado`, pero `proveedor_contactos.supplier_cuit` queda en `null`: el
   vínculo lo pone la invitación. Nota: la pantalla muestra el contacto suelto; si el comercio
   aprobó un contacto sin invitación previa de ese CUIT, no hay forma de atarlo desde la UI.
2. **proveedores-2 — la OC no tiene pantalla de edición.** La tabla es editable “mientras la
   orden está abierta” (comentario de `schema-proveedores.ts:21`) y el panel solo crea y cierra:
   no hay `PATCH /api/purchase-orders`. Nota de producto, no bug.
