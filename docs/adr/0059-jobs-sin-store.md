---
id: ADR-0059
tipo: adr
estado: aceptado
modulos: [persistencia]
depende_de: [ADR-0024, ADR-0052, ADR-0053, ADR-0057, PRD-PERS-02]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0059 - Jobs programados sin `store`: rutas `jobs/*` por repositorios de dominio

Estado: aceptado. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E10), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

Los jobs no tienen repositorio propio: reusan los de dominio y agregan funciones donde falten. Se crea `src/lib/repos/lotes.ts` porque lotes todavía no tiene repositorio. El tenant sale siempre de `gateJob`.

## Qué cambia

Funciones nuevas en `caja.ts`, `servicios.ts`, `ordenes-pago.ts` y `whatsapp.ts` cuando hagan falta; `src/lib/repos/lotes.ts`; `tests/pers2-jobs.test.ts`.

## Alternativa descartada

Un repositorio `jobs.ts`: duplicaría lecturas que ya tienen dueño en otro dominio.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.

## Evidencia de aceptación (2026-10-13)

- Commits: f093c0f.
- `npm test`: 802 passed, 3 failed, 18 skipped. Fallan los 2 de caja-c11 y el de `tests/vencimientos.test.ts` que depende de la fecha (preexistentes, ver ADR-0057).
- Tests PG con Postgres local (`PG_TEST_URL_A/B`): 17/17 en `tests/pers2-jobs.test.ts` (los tests de PERS2-S3 siguen y se agregaron los de este grupo). El cierre de medianoche y los vencimientos de A solo tocan la base de A.
- Las claves de avisos (`waEnviados`) no tienen tabla y quedan en memoria dentro de `caja.ts` y `whatsapp.ts`.
- `tsc --noEmit`: 1 error preexistente. `npm run build`: OK.
- Rutas en `src/pages/api` que importan `store`: 27 → 21.
