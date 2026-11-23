---
id: PRD-AUD-05
tipo: prd
estado: propuesto
modulos: [pagos, persistencia]
depende_de: [ADR-0127]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Construir la pantalla /panel/pagos (hoy 404) sobre la API de pagos existente, para cerrar el hallazgo pagos-1 de ADR-0127.
---
# PRD-AUD-05 - Pantalla de pagos

Fuente: hallazgo pagos-1 de ADR-0127 (#481). Restringido por ADR-0127.

## Problema

El módulo de pagos existe solo en la API (ADR-0057); la pantalla `/panel/pagos` devuelve
404, así que el dueño no puede ver ni operar los pagos desde la UI.

## Épica AUD-E5. Pantalla de pagos

Requisito AUD-R5: la pantalla de pagos carga, lista los pagos y permite la operación básica
del módulo, trazada a su handler y columna.

- Historia AUD-FIX-S8. Construir `/panel/pagos` (#481). AC: Given la pantalla When carga
  Then lista los pagos y la operación básica guarda y relee contra la API. ADR: 0127. Talla M.

## Decisión de producto (2026-11-23)

`payment_orders` **convive** con el pago de factura de proveedor:

- `/panel/pagos` opera órdenes de pago a beneficiarios (pagos sueltos y servicios) y las lista.
- El pago de una factura de proveedor sigue mandando por `/panel/proveedores` →
  `/api/supplier-invoices/payments`; los servicios siguen en `/panel/consumos`.
- La pantalla nueva no crea ni confirma pagos de facturas. Una orden con `supplier_invoice_id`
  se muestra como referencia de solo lectura: no genera un segundo egreso por la misma factura.

## Dependencias externas

Ninguna nueva: la API de pagos ya existe (ADR-0057).

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Pantalla carga | GET /panel/pagos | 200 con lista |
| Feliz | Operación básica | guardar + releer | el pago vuelve de la API |
| Fallo | Ruta inexistente | GET /panel/pagos | deja de ser 404 |
| Borde | Factura de proveedor | pantalla nueva | no ofrece pagar facturas; deriva a Proveedores y no duplica el egreso |
