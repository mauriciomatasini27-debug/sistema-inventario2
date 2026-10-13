# ADR-0056 - Repositorio de caja en `src/lib/repos/caja.ts`: rutas `cash/*` sin `store`

Estado: aceptado. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E7), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

`src/lib/repos/caja.ts` concentra movimientos, cierres, turnos, retiros, reversiones, auditoría, recibos QR y vencimientos de caja. Los mapas sin tabla quedan en memoria dentro del repositorio, marcados con un comentario, hasta que tengan tabla.

## Qué cambia

`src/lib/repos/caja.ts`; rutas `cash/*` sin `store`; `tests/pers2-caja.test.ts` con arch-test y tests contra Postgres local.

## Alternativa descartada

Separar turnos de movimientos en dos repositorios: comparten el cierre y la conciliación, y partirlos duplicaría lecturas.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.

## Evidencia de aceptación (2026-10-13)

- Commits: c1b4704.
- `npm test`: 782 passed, 2 failed (caja-c11 preexistentes), 12 skipped.
- Tests PG con Postgres local (`PG_TEST_URL_A/B`): 12/12 en `tests/pers2-caja.test.ts`. Retiros y reversiones de A quedan en las tablas de A, B no las ve y la misma clave de idempotencia en B crea su propia fila.
- El aviso de cierre por WhatsApp (`waEnviados`) no tiene tabla y queda en memoria dentro de `src/lib/repos/caja.ts`.
- `tsc --noEmit`: 1 error preexistente. `npm run build`: OK.
- Rutas en `src/pages/api` que importan `store`: 54 → 43.
