---
id: ADR-0035
tipo: adr
estado: propuesto
modulos: []
depende_de: [PRD-UI-04]
reemplaza: []
reemplazado_por: ""
resumen: |
  Unificar inventario de strings, errores con fix y destructivas con confirm o undo según PRD-UI-04. PRD:
  diseno/PRD-UI-04-copy-voz.md.
---
# ADR-0035 - Copy y voz

Estado: propuesto. Fecha: 2026-10-12. Fuentes: `.agents/skills/better-writing/SKILL.md`, `.agents/skills/writing-guidelines/SKILL.md`, `.agents/skills/ask-sonner/SKILL.md`.

## Decisión

Unificar inventario de strings, errores con fix y destructivas con confirm o undo según PRD-UI-04. PRD: `diseno/PRD-UI-04-copy-voz.md`.

## Por qué

Sin vocabulario único el kiosquero duda en caja; sin fix junto al campo el error se abandona.

## Qué cambia

`locales/**/*.json` único, botones verbo más objeto, `aria-invalid` con foco, `Sonner` con un `Toaster`.

## Alternativa descartada

Copy por pantalla: se descarta porque duplica términos y tonos.

## Pendientes

UI-S13→S16 + tests destructiva con confirm y strings ICU.
