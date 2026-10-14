# ADR-0063 - Ventas, devoluciones y correcciones de medio sin `store`: cierre de PERS-S5 en `src/pages/api`

Estado: propuesto. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E14), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

`src/lib/repos/ventas.ts` para devoluciones y correcciones; `sales` y `returns` reusan `fiscal.ts`, `stock.ts` y `caja.ts`. Los mapas sin tabla quedan en memoria dentro del repositorio, marcados con un comentario.

## Qué cambia

`src/lib/repos/ventas.ts`; funciones nuevas en `fiscal.ts`, `stock.ts` y `caja.ts` si faltan; `tests/pers2-ventas.test.ts` con el arch-test global.

## Alternativa descartada

Dejar `sales` con `store` por ser la ruta más usada: PERS-S5 pide cero imports y el cambio en `sales` es chico.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.
