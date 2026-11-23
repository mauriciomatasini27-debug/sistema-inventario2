# Trazabilidad — venta

Fecha: 2026-11-23. Historia: AUD-S5 de PRD-AUD-03 (ADR-0127).
Pantalla: `src/pages/venta.astro` (1526 líneas). Handlers: `src/pages/api/sales.ts`,
`src/pages/api/credit/*`, `src/pages/api/sync/*`, `src/pages/api/products.ts`.
No auditado en esta pasada: el escáner de cámara y Bluetooth (`escpos_bt.ts`), el visor de ticket
(`ticket_render.ts`) y las pantallas de corrección de medio y devoluciones (tienen pantalla propia
fuera de las 8).

## Campos persistidos

| Campo en pantalla | Payload | Handler | Repo | Columna | Estado |
|---|---|---|---|---|---|
| Nombre (alta al vender) | `lineas[].alta.nombre` | `POST /api/sales` | `registrar_venta` (`modules/sales/registro_venta.ts:390`) | `products.nombre` + `stock_movements` (tipo ALTA) | ok |
| Cantidad de la línea | `lineas[].qty` | idem | idem (`:506`) | `ticket_lines.qty` | ok |
| Precio de la línea | `lineas[].precio_centavos` | idem | idem (`:501`) | `ticket_lines.precio_centavos` | ok |
| Por peso (flag de la línea) | `lineas[].porPeso` | idem | idem (`:425`) | — (el servidor resuelve `products.por_peso` del catálogo) | **huérfano (venta-1)** |
| Medio de pago | `medio` | idem | idem (`:477`) | `sales.medio` + `cash_movements.metodo` | ok |
| Pago dividido (N medios y montos) | `pagos[].medio`, `pagos[].monto_centavos` | idem | `insertarMovimientosCaja` + `ticket_payments` (`:532`) | `ticket_payments.metodo`/`monto_centavos`, `cash_movements` | ok |
| Fecha y hora de la operación | `client_occurred_at` | idem | `registro_venta` (`:481`) | `sales.client_occurred_at` | ok |
| Venta sin conexión | `offline` | idem | idem (`:480`) | `sales.offline` | ok |
| Dispositivo y secuencia | `device_code`, `seq_local` | idem y `POST /api/sync/push` | `registro_venta` (`:448`), `sync` | `outbox.device_code`/`device_seq` (solo offline) | ok (dominio) |
| Cliente de fiado | `customer_id` | `POST /api/credit/sales-on-account` | `ventaACuenta` (`lib/repos/fiado.ts`) | `customer_movements.customer_id`, `sale_id` | ok |
| Nombre del cliente (alta rápida) | `nombre` | `POST /api/credit/customers` | `altaClienteRapida` | `customers.nombre` | ok |
| Teléfono del cliente | `telefono` | idem | idem | `customers.telefono` | ok |
| CUIT del receptor | `fiscal_receptor_cuit` | `POST /api/sales` → `asegurarDoc` | `lib/repos/fiscal.ts` | `fiscal_documents.doc_nro`, `fiscal_customers.doc_nro` | ok |
| Condición IVA del receptor | `fiscal_cond_iva_receptor` | idem | idem | `fiscal_documents.cond_iva_receptor` | ok |
| Condición y etapa del emisor | `fiscal_emisor_condicion`, `fiscal_emisor_etapa` | idem (`:160`) | `determinar_clase` | `fiscal_documents.cbte_tipo` (deriva la clase) | ok (derivado) |
| Alícuota de IVA | `fiscal_alicuota_id` | idem | idem | `fiscal_documents.alic_iva_id` | ok |
| Id de precio de la línea | `lineas[].precio_id` | `POST /api/sales` | — | — | **huérfano (venta-2)** |
| Vuelto | calculado en pantalla | cliente (`modules/sales/vuelto_efectivo.ts`) | — | — | ok (dominio) |
| Ticket para impresora térmica | `comercio`, `ticketDefinitivo`, `provisorio`, `fechaIso`, `medio`, `lineas`, `totalBrutoCentavos` | `POST /api/tickets/thermal` | `modules/sales/ticket_thermal.ts` | — (solo imprime) | ok (dominio) |
| Cola offline | `op_id`, `device_code`, `device_seq`, `hlc`, `modulo`, `payload`, `client_occurred_at` | `POST /api/sync/push` | `modules/sync` | `outbox.*` | ok |
| Promoción de ticket offline | `op_id`, `device_code`, `device_seq` | `POST /api/sync/promote` | `modules/sync` | `tickets.definitivo` | ok |

## Solo lectura

| Elemento | Handler | Repo | Columnas |
|---|---|---|---|
| Buscador de producto | `GET /api/products?q=` | `listarProductos`, `buscarProductoPorCodigo` (`lib/repos/catalogo.ts`) | `products.nombre`, `products.precio_centavos`, `products.por_peso`, `product_codes.codigo` |
| Balance de caja (barra) | `GET /api/cash/balance` | `obtenerBalance` (`lib/repos/caja.ts`) | `cash_movements.metodo`, `monto_centavos` |
| Saldo del cliente fiado | `GET /api/credit/balance?customer_id=` | `saldoCliente` (`lib/repos/fiado.ts`) | `customer_movements.debe_centavos`/`haber_centavos` |
| Buscador de clientes | `GET /api/credit/customers?q=` | `listarClientes` | `customers.nombre`, `customers.saldo_cache_centavos` |
| Previsualización de descuentos | `GET /api/sales/discounts-preview` | `modules/sales/descuentos.ts` | `prices`, `product_prices` |

## Columnas del módulo sin pantalla

Ninguna columna de negocio de `sales`, `tickets`, `ticket_lines`, `ticket_payments` queda sin
pantalla: la pantalla de venta cubre la emisión completa. Las internas (`id`, `tenant_id`,
`idempotency_key`, `created_at`, `ticket_lines.costo_centavos`, `ticket_payments.cash_movement_id`)
las escribe el servidor. Sí quedan sin pantalla en `customers` (ver venta-3).

## Hallazgos

1. **venta-1 — `porPeso` no llega al handler: vender más de 999 g devuelve 422.**
   `/venta` arma la línea con `porPeso` (`modules/sales/carrito_armar_cobro.ts:81`, `102`), pero
   `salesLineSchema` espera `por_peso` (`lib/validation.ts:18`). Zod descarta la clave desconocida,
   `por_peso` queda en `false` y el `superRefine` (`:25`) rechaza cualquier `qty > 999`.
   Sonda contra los handlers reales (sin DB):

   ```
   2500 g con porPeso (lo que manda /venta)  -> 422
   2500 g con por_peso (contrato del handler) -> 201
   ```

   Impacto: desde `/venta` no se puede cobrar 1 kg o más de un producto por peso. En
   `/api/credit/sales-on-account` el mismo campo camel hace que el rechazo esperado de dominio
   (`VENTA_A_CUENTA_POR_PESO_NO_DISPONIBLE`) llegue como error de cantidad. Issue #474. Accionable: corregir el
   nombre en el payload (o aceptar ambos) y agregar un test de la pantalla.
2. **venta-2 — `precio_id` viaja y no se usa.** Está en `salesLineSchema` (`lib/validation.ts:19`)
   y no lo lee ningún módulo (`grep precio_id`: solo el schema y un `delete` en
   `ventas-pendientes-form.ts:393`). Issue #475. Accionable: quitarlo del contrato o persistirlo si la
   intención era auditar el precio elegido.
3. **venta-3 — el alta rápida de cliente no permite tope, plazo, DNI ni notas.** Manda
   `nombre` y `telefono` (`venta.astro:1036`); `customers.tope_centavos`, `plazo_dias`, `dni` y
   `notas` quedan sin pantalla en esta pasada (`POST /api/credit/customers` los acepta: ver
   `tests/p1-64-alta-cliente.test.ts`). Nota, no bug: la pantalla de fiado solo cobra
   (`panel/fiado.astro`), así que hoy no hay UI para el tope. Decisión: issue de producto.
