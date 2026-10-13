# ADR-0036 - Accesibilidad WCAG

Estado: aceptado (2026-10-12, evidencia: `src/styles/global.css:72`). Fecha: 2026-10-12. Fuentes: `.agents/skills/better-accessibility/SKILL.md`, PRD-DS-02 DS-S13 a DS-S17.

## Decisión

Exigir semántica nativa, teclado completo, foco visible 3:1 y reduced-motion según PRD-UI-05. PRD: `diseno/PRD-UI-05-accesibilidad.md`.

## Por qué

Sin a11y como gate el POS excluye teclado y lectores y el motion enferma en mostrador.

## Qué cambia

Nativos `button/a/label`, sin `tabindex mayor a 0`, trampa de foco, `title` por ruta, zoom 200% sin pérdida.

## Alternativa descartada

Auditar a11y al final: se descarta porque el retrofit cuesta más que el gate por PR.

## Pendientes

UI-S17→S20 + tests foco visible y reduced-motion con evidencia.
