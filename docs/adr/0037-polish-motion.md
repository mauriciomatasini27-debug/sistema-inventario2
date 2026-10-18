---
id: ADR-0037
tipo: adr
estado: aceptado
modulos: []
depende_de: [PRD-UI-06]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fijar polish exacto y motion con restraint menor a 300ms con librerías probadas según PRD-UI-06. PRD:
  diseno/PRD-UI-06-polish-motion.md.
---
# ADR-0037 - Polish y motion

Estado: propuesto. Fecha: 2026-10-12. Fuentes: `.agents/skills/better-ui/SKILL.md`, `.agents/skills/emil-design-eng/SKILL.md`, `.agents/skills/animation-performance/SKILL.md`, `.agents/skills/pick-ui-library/SKILL.md`.

## Decisión

Fijar polish exacto y motion con restraint menor a 300ms con librerías probadas según PRD-UI-06. PRD: `diseno/PRD-UI-06-polish-motion.md`.

## Por qué

Sin presupuesto el POS mete jank en gama baja y cada pantalla inventa su easing.

## Qué cambia

Radius por fórmula, press `0.96/150ms`, stagger `100ms/300ms`, `transform/opacity` solo, `Sonner/base-ui/Virtuoso/NumberFlow`.

## Alternativa descartada

Motion libre por vista: se descarta porque rompe cobro a una mano y reduced-motion.

## Pendientes

UI-S21→S25 + auditoría `plans/NNN` y test `Block/Approve` por diff.
