# ADR-0062 - Repositorios de catálogo, stock y compras: productos, ubicaciones, lotes, conteos, órdenes de compra, beneficiarios y cuentas de servicio sin `store`

Estado: propuesto. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E13), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

Dos repositorios nuevos (`catalogo.ts` y `stock.ts`) y funciones nuevas en los que ya existen. Los movimientos de stock se escriben solo por `stock.ts`. Los mapas sin tabla quedan en memoria dentro del repositorio, marcados con un comentario.

## Qué cambia

`src/lib/repos/catalogo.ts`, `src/lib/repos/stock.ts`; funciones nuevas en `lotes.ts`, `proveedores.ts`, `ordenes-pago.ts` y `servicios.ts`; `tests/pers2-catalogo-stock.test.ts`.

## Alternativa descartada

Un repositorio por ruta: repetiría la escritura de movimientos de stock en cinco lugares.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.
