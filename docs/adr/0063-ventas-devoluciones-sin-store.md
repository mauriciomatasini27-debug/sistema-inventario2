---
id: ADR-0063
tipo: adr
estado: aceptado
modulos: [persistencia, ventas]
depende_de: [ADR-0024, ADR-0052, ADR-0053, ADR-0057, PRD-PERS-02]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0063 - Ventas, devoluciones y correcciones de medio sin `store`: cierre de PERS-S5 en `src/pages/api`

Estado: aceptado. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E14), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

`src/lib/repos/ventas.ts` para devoluciones y correcciones; `sales` y `returns` reusan `fiscal.ts`, `stock.ts` y `caja.ts`. Los mapas sin tabla quedan en memoria dentro del repositorio, marcados con un comentario.

## Qué cambia

`src/lib/repos/ventas.ts`; funciones nuevas en `fiscal.ts`, `stock.ts` y `caja.ts` si faltan; `tests/pers2-ventas.test.ts` con el arch-test global.

## Alternativa descartada

Dejar `sales` con `store` por ser la ruta más usada: PERS-S5 pide cero imports y el cambio en `sales` es chico.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.

## Evidencia de aceptación (2026-10-13)

- Commits: f90aae3.
- `npm test`: 829 passed, 3 failed, 28 skipped. Fallan los 2 de caja-c11 y el de `tests/vencimientos.test.ts` que depende de la fecha (preexistentes, ver ADR-0057).
- Tests PG con Postgres local (`PG_TEST_URL_A/B`): 9/9 en `tests/pers2-ventas.test.ts`, con el arch-test global (0 rutas con `store`). La devolución y la corrección de medio de A quedan en A y B no las ve.
- 44 rutas siguen importando de `lib/store` solo `control` (plano de control global) o tipos, como permite ADR-0053.
- Pendiente: el correlativo de devoluciones (`nextReturn`) no tiene tabla y queda en memoria dentro de `src/lib/repos/ventas.ts`.
- `tsc --noEmit`: 1 error preexistente. `npm run build`: OK.
- Rutas en `src/pages/api` que importan `store`: 3 → 0.
