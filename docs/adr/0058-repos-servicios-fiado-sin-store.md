# ADR-0058 - Repositorios de consumos de servicios y fiado: rutas `utility-bills*` y `credit/*` sin `store`

Estado: propuesto. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E9), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

Un repositorio por dominio (`servicios.ts`, `fiado.ts`); los movimientos de caja por `caja.ts`; los mapas sin tabla quedan en memoria dentro del repositorio, marcados con un comentario.

## Qué cambia

`src/lib/repos/servicios.ts`, `src/lib/repos/fiado.ts`; rutas `utility-bills*` y `credit/*` sin `store`; `tests/pers2-servicios-fiado.test.ts`.

## Alternativa descartada

Juntar fiado con caja: el fiado tiene su propio saldo por cliente y no es un movimiento del cajón.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.
