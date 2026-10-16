---
id: ADR-0061
tipo: adr
estado: aceptado
modulos: [offline, persistencia]
depende_de: [ADR-0024, ADR-0052, ADR-0053, ADR-0057, PRD-PERS-02]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0061 - Repositorio de sincronización en `src/lib/repos/sync.ts`: rutas `sync/*` sin `store`

Estado: aceptado. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E12), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

`src/lib/repos/sync.ts` concentra outbox, secuencias y estado por dispositivo. Precios, stock y promociones se leen por los repositorios de dominio cuando existen; si no, por funciones en `sync.ts`. Los mapas sin tabla quedan en memoria dentro del repositorio, marcados con un comentario.

## Qué cambia

`src/lib/repos/sync.ts`; rutas `sync/*` sin `store`; `tests/pers2-sync.test.ts`.

## Alternativa descartada

Dejar sync para el final junto con ventas: sync es independiente de la ruta de ventas y bloquea el modo offline en multi.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.

## Evidencia de aceptación (2026-10-13)

- Commits: c0e1b65.
- `npm test`: 814 passed, 3 failed, 23 skipped. Fallan los 2 de caja-c11 y el de `tests/vencimientos.test.ts` que depende de la fecha (preexistentes, ver ADR-0057).
- Tests PG con Postgres local (`PG_TEST_URL_A/B`): 10/10 en `tests/pers2-sync.test.ts`. Las operaciones de A quedan en `outbox` de A, un `op_id` repetido no duplica y B no las ve; el heartbeat de A no aparece en B.
- Pendiente: el catálogo del delta de `pull` (stock y precios) sigue saliendo del espejo en memoria, como antes del cambio, y el correlativo `T-*` de `promote` (`nextTicket`) no tiene tabla.
- `tsc --noEmit`: 1 error preexistente. `npm run build`: OK.
- Rutas en `src/pages/api` que importan `store`: 16 → 12.
