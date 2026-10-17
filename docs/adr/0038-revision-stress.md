---
id: ADR-0038
tipo: adr
estado: propuesto
modulos: []
depende_de: [PRD-UI-07]
reemplaza: []
reemplazado_por: ""
resumen: |
  Automatizar pipeline build → variant → states → worst-case → gate en harness internal dev-only según
  PRD-UI-07. PRD: diseno/PRD-UI-07-revision-stress.md.
---
# ADR-0038 - Revisión y stress automatizado

Estado: propuesto. Fecha: 2026-10-12. Fuentes: `.agents/skills/better-interface/SKILL.md`, `.agents/skills/interface-review/SKILL.md`, `.agents/skills/break-ui/SKILL.md`, `.agents/skills/state-machine/SKILL.md`, `.agents/skills/variant/SKILL.md`.

## Decisión

Automatizar pipeline `build → variant → states → worst-case → gate` en harness `_internal` dev-only según PRD-UI-07. PRD: `diseno/PRD-UI-07-revision-stress.md`.

Nota 2026-10-17: con GitHub Actions manual-only (ADR-0086), el gate `interface-review` por PR vive en el guard local `scripts/cadena/puede-mergear.mjs`.

## Por qué

Sin harness el peor dato real rompe en producción y cada PR discute gusto en vez de evidencia.

## Qué cambia

Rutas `src/pages/_internal/` fuera de precache, toggles `?data=worst`, `?__state=`, `?__variant=`, gate `interface-review` por PR.

## Alternativa descartada

Revisión manual ad hoc: se descarta porque no deja veredicto auditable ni URLs.

## Pendientes

UI-S26→S31 + tests harness fuera de build y gate con `HIGH` cero.
