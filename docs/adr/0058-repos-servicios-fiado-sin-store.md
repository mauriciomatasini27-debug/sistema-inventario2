---
id: ADR-0058
tipo: adr
estado: aceptado
modulos: [fiado, persistencia]
depende_de: [ADR-0024, ADR-0052, ADR-0053, ADR-0057, PRD-PERS-02]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0058 - Repositorios de consumos de servicios y fiado: rutas `utility-bills*` y `credit/*` sin `store`

Estado: aceptado. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E9), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

Un repositorio por dominio (`servicios.ts`, `fiado.ts`); los movimientos de caja por `caja.ts`; los mapas sin tabla quedan en memoria dentro del repositorio, marcados con un comentario.

## Qué cambia

`src/lib/repos/servicios.ts`, `src/lib/repos/fiado.ts`; rutas `utility-bills*` y `credit/*` sin `store`; `tests/pers2-servicios-fiado.test.ts`.

## Alternativa descartada

Juntar fiado con caja: el fiado tiene su propio saldo por cliente y no es un movimiento del cajón.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.

## Evidencia de aceptación (2026-10-13)

- Commits: 6d02250.
- `npm test`: 793 passed, 3 failed, 16 skipped. Fallan los 2 de caja-c11 y el de `tests/vencimientos.test.ts` que depende de la fecha (preexistentes, ver ADR-0057).
- Tests PG con Postgres local (`PG_TEST_URL_A/B`): 8/8 en `tests/pers2-servicios-fiado.test.ts`. Factura de servicio, venta a cuenta y cobro de A quedan en A y B no los ve.
- `tsc --noEmit`: 1 error preexistente. `npm run build`: OK.
- Rutas en `src/pages/api` que importan `store`: 33 → 27.
