# ADR-0054 - Repositorio fiscal en `src/lib/repos/fiscal.ts`: rutas `fiscal/*` sin `store`

Estado: aceptado. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E5), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

`src/lib/repos/fiscal.ts` concentra el acceso a comprobantes, ND y wizard. Reusa `fiscal-db.ts` (`leerFiscalDocs`, `asegurarFiscalDoc`, `persistirFiscalDoc`, `reencolarFiscalDoc`, `leerWizardPorTenant`, `guardarWizard`) y deja la memoria particionada como fallback solo cuando `dbVivaTenant()` devuelve `null`. La excepción de ADR-0052 (lectura fiscal en memoria ante `BaseNoDisponible`) queda dentro del repositorio y no en las rutas.

## Qué cambia

`src/lib/repos/fiscal.ts`; rutas `fiscal/*` sin `store`; `tests/pers2-fiscal.test.ts` con arch-test y tests contra Postgres local.

## Alternativa descartada

Hacer que las rutas llamen directo a `fiscal-db.ts`: deja la memoria y el fallback repartidos en 8 archivos.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.

## Evidencia de aceptación (2026-10-13)

- Commits: 7d66902.
- `npm test`: 768 passed, 2 failed (caja-c11 preexistentes), 7 skipped.
- Tests PG con Postgres local (`PG_TEST_URL_A/B`): 8/8 en `tests/pers2-fiscal.test.ts`. El comprobante de A queda en `fiscal_documents` de A, B no lo ve en `history` y el wizard de A no aparece en B.
- AT2 de `tests/iso-fiscal-tenant.test.ts` se ajustó para leer por el repositorio (`listarFiscalDocs(t.tenantId)`).
- `tsc --noEmit`: 1 error preexistente. `npm run build`: OK.
- Rutas en `src/pages/api` que importan `store`: 66 → 58.
