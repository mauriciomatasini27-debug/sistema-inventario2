# ADR-0059 - Jobs programados sin `store`: rutas `jobs/*` por repositorios de dominio

Estado: propuesto. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E10), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

Los jobs no tienen repositorio propio: reusan los de dominio y agregan funciones donde falten. Se crea `src/lib/repos/lotes.ts` porque lotes todavía no tiene repositorio. El tenant sale siempre de `gateJob`.

## Qué cambia

Funciones nuevas en `caja.ts`, `servicios.ts`, `ordenes-pago.ts` y `whatsapp.ts` cuando hagan falta; `src/lib/repos/lotes.ts`; `tests/pers2-jobs.test.ts`.

## Alternativa descartada

Un repositorio `jobs.ts`: duplicaría lecturas que ya tienen dueño en otro dominio.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.
