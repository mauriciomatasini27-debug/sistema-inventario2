---
id: PRD-UI-06
tipo: prd
estado: en curso
modulos: []
depende_de: [ADR-0002, ADR-0008, ADR-0037, PRD-DS-01, PRD-UI-05]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: .agents/skills/better-ui/SKILL.md, .agents/skills/emil-design-eng/SKILL.md,
  .agents/skills/animate/SKILL.md, .agents/skills/review-animations/SKILL.md,
  .agents/skills/improve-animations/SKILL.md, .agents/skills/find-animation-opportunities/SKILL.md,
---
# PRD-UI-06 - Polish y motion (R2)

Fuente: `.agents/skills/better-ui/SKILL.md`, `.agents/skills/emil-design-eng/SKILL.md`, `.agents/skills/animate/SKILL.md`, `.agents/skills/review-animations/SKILL.md`, `.agents/skills/improve-animations/SKILL.md`, `.agents/skills/find-animation-opportunities/SKILL.md`, `.agents/skills/animation-performance/SKILL.md`, `.agents/skills/pick-ui-library/SKILL.md`, `.agents/skills/mobile-native/SKILL.md`. Fecha extracción: 2026-10-12. Restringido por ADR-0037, ADR-0008, ADR-0002.

## Épica UI-E11. Superficies e iconos exactos

Requisito UI11: radio exterior igual a interior más padding más borde, e iconos con `currentColor`.

- Historia UI-S21. Radius, sombras e iconos. AC: Given inspecciono superficies When verifico radio ext igual a int más padding más borde, sombra por elevación y borde por estructura más `border transparent` para forced-colors, outline en imágenes `black/white 10%`, e iconos `currentColor` con stroke según peso (`1.5px` en `400` hasta `2.5px` en `700`) Then cada valor coincide. ADR: 0037, 0008. Talla S. Depende de: nada.
- Historia UI-S22. Press y stagger. AC: Given interactúo When mido press `scale 0.96/150ms ease-out`, stagger `100ms/300ms ease-out` más `opacity+blur4px+translateY12px`, salida `150ms -12px`, y transiciones reversibles nunca `all` con hover solo en `@media(hover:hover)` Then cada duración y easing coincide. ADR: 0037. Talla S. Depende de: UI-S21.

## Épica UI-E12. Motion con restraint en POS

Requisito UI12: mostrador cobra a una mano con feedback menor a 300ms y sin jank en gama baja.

- Historia UI-S23. Presupuesto POS. AC: Given cobro y busco con teclado más de 100 veces por día When mido animaciones solo en `transform/opacity`, menores a `300ms`, `ease-out`, respuesta en `pointerdown` y `reduced-motion` más gateo `hover` incluidos Then el cobro nunca espera a motion. ADR: 0037, 0002. Talla M. Depende de: UI-S21.
- Historia UI-S24. Librerías en vez de invento. AC: Given reviso `package.json` When confirmo `Sonner` para toasts, `base-ui` para diálogos, `Virtuoso` para listas de más de 1000 filas y `NumberFlow` para precios, sin librería nueva sin veredicto Then no hay motion casero donde hay librería probada. ADR: 0037. Talla S. Depende de: UI-S23.
- Historia UI-S25. Auditoría y performance. AC: Given corro auditoría read-only When obtengo `recon` más `audit` más `plans/NNN-slug.md` con tabla `Elemento|Driver|Props`, `blur menor a 20px`, `overscroll-contain` en overlays y `will-change` al final Then cada hallazgo cita `file:line` con veredicto `Block/Approve`. ADR: 0037. Talla M. Depende de: UI-S23, UI-S24.

## Dependencias externas

UI-S21 espera a DS-S5 de PRD-DS-01. UI-S23 espera a UI-S21 más PRD-UI-05 por `reduced-motion`. UI-S25 espera a UI-S23 y UI-S24.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Press en POS | Cobro a una mano | Feedback menor a 300ms sin jank |
| Fallo | Motion prohibido | `transition all`, `scale(0)`, `ease-in` o más de 300ms | Bloqueo con `file:line` |
| Regresión | Animations a 10% | Panel Animations en browser | Todos los estados recorridos sin hover atascado |

Arch-tests: AT1 motion siempre con `reduced-motion` y sin `all` (lint). AT2 listas largas virtualizadas y precios con `tabular-nums` (test de rendimiento con evidencia).
