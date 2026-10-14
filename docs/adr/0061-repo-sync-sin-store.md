# ADR-0061 - Repositorio de sincronización en `src/lib/repos/sync.ts`: rutas `sync/*` sin `store`

Estado: propuesto. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E12), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

`src/lib/repos/sync.ts` concentra outbox, secuencias y estado por dispositivo. Precios, stock y promociones se leen por los repositorios de dominio cuando existen; si no, por funciones en `sync.ts`. Los mapas sin tabla quedan en memoria dentro del repositorio, marcados con un comentario.

## Qué cambia

`src/lib/repos/sync.ts`; rutas `sync/*` sin `store`; `tests/pers2-sync.test.ts`.

## Alternativa descartada

Dejar sync para el final junto con ventas: sync es independiente de la ruta de ventas y bloquea el modo offline en multi.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.
