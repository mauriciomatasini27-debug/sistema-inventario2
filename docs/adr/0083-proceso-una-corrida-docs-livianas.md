# ADR-0083 - Una sola corrida de tests y docs livianas para ítems chicos

Estado: aceptado (2026-10-14, evidencia: `tests/roadmap.test.ts`, `tests/evidencia.test.ts`, `vitest.arch.config.ts`). Fecha: 2026-10-14. Fuentes: PRD `diseno/PRD-PROC-01-auditoria-proceso.md`, ADR-0076 (avances del roadmap), ADR-0082, `.github/workflows/ci.yml`, `vitest.config.ts`, `scripts/evidencia.mjs`, `scripts/roadmap-lib.mjs`, `AGENTS.md`, `.opencode/pstack-opencode.md`.

## Decisión

- `npm test` excluye `tests/arch/**` y `tests/pers2-arch.test.ts`; esos archivos corren solo en `npm run check:arch`, que sigue siendo su propio paso de CI. Ningún test corre dos veces en CI.
- `scripts/evidencia.mjs` reutiliza un reporte JSON de vitest si existe (`EVIDENCIA_VITEST_JSON`, por defecto `.pstack-tmp/vitest.json`) en vez de volver a correr la suite; si no existe, corre `vitest run --reporter=json` una vez y deja el reporte. Además lista los archivos de test nuevos o cambiados contra `origin/main` y los baselines de los trinquetes (`tests/arch/baselines.json`) en `origin/main` y en `HEAD`.
- Ítems chicos (sin decisión de arquitectura nueva) llevan solo un fragmento `docs/roadmap/avances/<id>.md` con id `P<n>-<m>` (p.ej. `P1-6`), sin ADR ni PRD: `adr` y `prd` son opcionales y el fragmento lleva una sección `## Decisión` de 5 a 10 líneas. PRD + ADR completos quedan para decisiones reales de arquitectura o producto.

## Alternativa descartada

Que CI corra todo con `npm test` y quitar el paso de arquitectura: se pierde el paso visible de trinquetes. Que `evidencia` siempre corra la suite: duplica el tiempo local. ADR+PRD para todo: el costo de doc supera al cambio en ítems chicos.

## Consecuencias

CI deja de correr los 11 archivos de arquitectura dos veces. La evidencia local usa una sola corrida. Los ítems chicos se documentan en un archivo. La tabla del roadmap muestra `—` en PRD/ADR para ítems chicos.

## Pendientes

Ninguno.

## Evidencia de aceptación (2026-10-14)

- Sin migración. `npm test` ya no incluye `tests/arch/**` ni `tests/pers2-arch.test.ts` (129 archivos, antes 140 = 129 + 11 de arquitectura).
- `npm run check:arch` (`vitest.arch.config.ts`): `Test Files  11 passed (11)`, `Tests  22 passed (22)`.
- `npm run evidencia` con `PG_TEST_URL_A/B` (Postgres local 127.0.0.1:54329), una sola corrida de la suite vía reporte JSON:
  - tsc: 0 errores
  - vitest: `Test Files  129 passed (129)`
  - vitest: `Tests  993 passed (993)`
  - build: `14:00:18 [build] Complete!`
  - test cambiado: `tests/evidencia.test.ts`, `tests/roadmap.test.ts`
  - baselines sin cambio: `asNeverHandlerRequest` 241, `asNeverTestsTotal` 443, `comentariosNoExiste` 7, `esModoMulti` 145, `storeRepos` 430.
- Revisión a mano: `numTotalTestSuites` del JSON de vitest cuenta bloques `describe` (442), no archivos; `resumirVitestJson` cuenta archivos desde `testResults` (test de regresión).
