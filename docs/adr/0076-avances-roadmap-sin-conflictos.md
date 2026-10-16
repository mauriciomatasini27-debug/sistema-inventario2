---
id: ADR-0076
tipo: adr
estado: aceptado
modulos: []
depende_de: [ADR-0065, ADR-0073, PRD-ROAD-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Los PRs de implementación dejan de editar docs/ROADMAP.md. Cada uno agrega
  docs/roadmap/avances/<número-ADR>.md con front-matter (item, estado, adr, prd, fecha) y una línea de texto.
---
# ADR-0076 - Avances del roadmap por archivo y sección generada

Estado: aceptado (2026-10-14, evidencia: `tests/roadmap.test.ts` 18/18, commit `3b640f3`). Fecha: 2026-10-14. Fuentes: PRD `diseno/PRD-ROAD-01-avances-sin-conflictos.md`, merge `f93c70d` (conflicto ROADMAP entre #31 y #32), ADR-0065, ADR-0073.

## Decisión

Los PRs de implementación dejan de editar `docs/ROADMAP.md`. Cada uno agrega `docs/roadmap/avances/<número-ADR>.md` con front-matter (`item`, `estado`, `adr`, `prd`, `fecha`) y una línea de texto. `scripts/roadmap.mjs` (`npm run roadmap`) regenera solo la sección entre `<!-- roadmap:avances:inicio -->` y `<!-- roadmap:avances:fin -->`; la estructura a mano no se toca. Un workflow en push a `main` corre el script y commitea el cambio con `GITHUB_TOKEN` (`contents: write`). Un check de PR (`roadmap-guard`) falla si el PR edita `docs/ROADMAP.md` fuera de un PR solo de herramienta del roadmap, si un avance es inválido o si la sección de la base está desactualizada.

## Qué cambia

- Dos PRs concurrentes agregan archivos distintos: no hay conflicto.
- La tabla "Avances por PR (generado)" del roadmap la escribe solo el script.
- `.opencode/` y `AGENTS.md` piden un archivo de avance en vez de editar el roadmap.
- Si `main` aún no tiene marcadores, el script los inserta antes de `## Decisiones registradas` y el check de base lo informa sin fallar.

## Alternativa descartada

Regenerar en cada PR y exigir la sección al día en el PR: vuelve a tocar las mismas líneas y reintroduce el conflicto. Un `merge=union` en `.gitattributes`: mezcla líneas de tabla sin orden y oculta errores.

## Consecuencias

Las secciones a mano (Pendientes priorizados, Ya implementado) se actualizan en PRs de docs dedicados, no en los de implementación. Tras cada fusión, `main` recibe un commit automático del bot; los commits con `GITHUB_TOKEN` no disparan otros workflows.

## Pendientes

Migrar las líneas "Actualización ..." históricas de la cabecera a archivos de avance, en un PR de docs.

## Evidencia de aceptación (2026-10-14)

- Commits: 3b640f3. Sin migración; suite contra Postgres local (127.0.0.1:54329, bases A y B); no se tocó Supabase.
- `npm run evidencia` con `PG_TEST_URL_A/B` locales:
  - tsc: 0 errores
  - vitest: `Test Files  134 passed (134)`
  - vitest: `Tests  960 passed (960)`
  - build: `11:05:15 [build] Complete!`
  - sha: `3b640f3`
- `npm run check:arch`: `Test Files  11 passed (11)`, `Tests  22 passed (22)`.
- `node scripts/roadmap.mjs` dos veces sobre una copia: la primera inserta los marcadores antes de `## Decisiones registradas` (10 líneas), la segunda "sin cambios"; `--check` "sección de avances al día". `docs/ROADMAP.md` no se edita en este PR: lo regenera `roadmap.yml` al fusionar.
