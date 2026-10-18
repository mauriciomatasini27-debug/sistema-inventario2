---
id: ADR-0034
tipo: adr
estado: aceptado
modulos: []
depende_de: [PRD-DS-01, PRD-UI-03]
reemplaza: []
reemplazado_por: ""
resumen: |
  Exigir un color igual un significado, contraste medido en par real y dark propio según PRD-UI-03. PRD:
  diseno/PRD-UI-03-color-contraste.md.
---
# ADR-0034 - Color semántico y contraste

Estado: propuesto. Fecha: 2026-10-12. Fuentes: `.agents/skills/better-colors/SKILL.md`, PRD-DS-01 DS-S1 a DS-S5.

## Decisión

Exigir un color igual un significado, contraste medido en par real y dark propio según PRD-UI-03. PRD: `diseno/PRD-UI-03-color-contraste.md`.

## Por qué

Sin roles el CTA pierde jerarquía y el contraste estimado falla en mostrador con luz real.

## Qué cambia

Rampa neutral más acento más estados, semánticos en componentes, medición AA light y dark, email papel 600px.

## Alternativa descartada

Dark como light invertido: se descarta porque lava la llama y rompe ambiente POS.

## Pendientes

UI-S9→S12 + tests AA con valor medido en ambos temas.
