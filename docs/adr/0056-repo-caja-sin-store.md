# ADR-0056 - Repositorio de caja en `src/lib/repos/caja.ts`: rutas `cash/*` sin `store`

Estado: propuesto. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E7), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

`src/lib/repos/caja.ts` concentra movimientos, cierres, turnos, retiros, reversiones, auditoría, recibos QR y vencimientos de caja. Los mapas sin tabla quedan en memoria dentro del repositorio, marcados con un comentario, hasta que tengan tabla.

## Qué cambia

`src/lib/repos/caja.ts`; rutas `cash/*` sin `store`; `tests/pers2-caja.test.ts` con arch-test y tests contra Postgres local.

## Alternativa descartada

Separar turnos de movimientos en dos repositorios: comparten el cierre y la conciliación, y partirlos duplicaría lecturas.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.
