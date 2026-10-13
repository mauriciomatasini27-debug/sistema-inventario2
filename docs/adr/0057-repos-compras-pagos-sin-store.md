# ADR-0057 - Repositorios de facturas de proveedores y órdenes de pago: rutas `supplier-invoices/*` y `payment-orders/*` sin `store`

Estado: propuesto. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E8), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

Un repositorio por dominio (`facturas-proveedor.ts`, `ordenes-pago.ts`). Los movimientos de caja se escriben por el repositorio de caja para no duplicar esa lógica. Los mapas sin tabla quedan en memoria dentro del repositorio, marcados con un comentario.

## Qué cambia

`src/lib/repos/facturas-proveedor.ts`, `src/lib/repos/ordenes-pago.ts`; rutas `supplier-invoices/*` y `payment-orders/*` sin `store`; `tests/pers2-compras-pagos.test.ts`.

## Alternativa descartada

Escribir los movimientos de caja desde cada repositorio: duplica reglas que ya viven en `caja.ts`.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.
