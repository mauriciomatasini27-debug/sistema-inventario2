---
id: ADR-0057
tipo: adr
estado: aceptado
modulos: [compras, pagos, persistencia]
depende_de: [ADR-0024, ADR-0052, ADR-0053, PRD-PERS-02]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0057 - Repositorios de facturas de proveedores y órdenes de pago: rutas `supplier-invoices/*` y `payment-orders/*` sin `store`

Estado: aceptado. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E8), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

Un repositorio por dominio (`facturas-proveedor.ts`, `ordenes-pago.ts`). Los movimientos de caja se escriben por el repositorio de caja para no duplicar esa lógica. Los mapas sin tabla quedan en memoria dentro del repositorio, marcados con un comentario.

## Qué cambia

`src/lib/repos/facturas-proveedor.ts`, `src/lib/repos/ordenes-pago.ts`; rutas `supplier-invoices/*` y `payment-orders/*` sin `store`; `tests/pers2-compras-pagos.test.ts`.

## Alternativa descartada

Escribir los movimientos de caja desde cada repositorio: duplica reglas que ya viven en `caja.ts`.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.

## Evidencia de aceptación (2026-10-13)

- Commits: 4328fb0.
- `npm test`: 787 passed, 3 failed, 14 skipped. Fallan los 2 de caja-c11 (preexistentes) y `tests/vencimientos.test.ts` ("marca vencidas…"), que depende de la fecha: falla igual sin este cambio desde que el reloj pasó las 00:00 UTC del 2026-10-14.
- Tests PG con Postgres local (`PG_TEST_URL_A/B`): 8/8 en `tests/pers2-compras-pagos.test.ts`. Pago de factura y orden de pago de A quedan en A, B no los ve y numera aparte.
- Las sugerencias desde notificación (`notifVistos`) no tienen tabla y quedan en memoria dentro de `src/lib/repos/ordenes-pago.ts`.
- `tsc --noEmit`: 1 error preexistente. `npm run build`: OK.
- Rutas en `src/pages/api` que importan `store`: 43 → 33.
