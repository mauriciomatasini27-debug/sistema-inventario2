---
id: ADR-0062
tipo: adr
estado: aceptado
modulos: [compras, inventario, persistencia]
depende_de: [ADR-0024, ADR-0052, ADR-0053, ADR-0057, PRD-PERS-02]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0062 - Repositorios de catálogo, stock y compras: productos, ubicaciones, lotes, conteos, órdenes de compra, beneficiarios y cuentas de servicio sin `store`

Estado: aceptado. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E13), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

Dos repositorios nuevos (`catalogo.ts` y `stock.ts`) y funciones nuevas en los que ya existen. Los movimientos de stock se escriben solo por `stock.ts`. Los mapas sin tabla quedan en memoria dentro del repositorio, marcados con un comentario.

## Qué cambia

`src/lib/repos/catalogo.ts`, `src/lib/repos/stock.ts`; funciones nuevas en `lotes.ts`, `proveedores.ts`, `ordenes-pago.ts` y `servicios.ts`; `tests/pers2-catalogo-stock.test.ts`.

## Alternativa descartada

Un repositorio por ruta: repetiría la escritura de movimientos de stock en cinco lugares.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.

## Evidencia de aceptación (2026-10-13)

- Commits: 05e2f82.
- `npm test`: 823 passed, 3 failed, 25 skipped. Fallan los 2 de caja-c11 y el de `tests/vencimientos.test.ts` que depende de la fecha (preexistentes, ver ADR-0057).
- Tests PG con Postgres local (`PG_TEST_URL_A/B`): 11/11 en `tests/pers2-catalogo-stock.test.ts`. La orden de compra de A queda en `purchase_orders` de A y B no la ve.
- Pendiente: ubicaciones, fotos de producto y conteos siguen en la memoria particionada como antes del cambio aunque existen las tablas `locations`, `product_photos` y `stock_counts`/`stock_count_lines`; pasarlos a la base es el siguiente corte de este dominio.
- `tsc --noEmit`: 1 error preexistente. `npm run build`: OK.
- Rutas en `src/pages/api` que importan `store`: 12 → 3.
