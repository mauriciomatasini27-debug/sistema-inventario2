---
id: ADR-0033
tipo: adr
estado: aceptado
modulos: []
depende_de: [PRD-DS-01, PRD-UI-02]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fijar escala con line-height unitless, medida 60-75ch y truncado siempre con retorno según PRD-UI-02. PRD:
  diseno/PRD-UI-02-tipografia-escala.md.
---
# ADR-0033 - Tipografía y escala

Estado: propuesto. Fecha: 2026-10-12. Fuentes: `.agents/skills/better-typography/SKILL.md`, PRD-DS-01 DS-S6.

## Decisión

Fijar escala con line-height unitless, medida 60-75ch y truncado siempre con retorno según PRD-UI-02. PRD: `diseno/PRD-UI-02-tipografia-escala.md`.

## Por qué

Sin escala exacta el mostrador pierde legibilidad a distancia y los precios saltan de ancho.

## Qué cambia

Niveles `1.5rem/700` a `14px`, `tabular-nums` en precios, `balance/pretty`, `rem/em`, `lang/dir/bdi`.

## Alternativa descartada

Px fijos por vista: se descarta porque rompe zoom y traducción.

## Pendientes

UI-S5→S8 + tests truncado con retorno y sizes en `rem`.
