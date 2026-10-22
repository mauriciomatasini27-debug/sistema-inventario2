---
id: PRD-UI-05
tipo: prd
estado: en curso
modulos: []
depende_de: [ADR-0002, ADR-0009, ADR-0036, PRD-DS-01, PRD-DS-02, PRD-UI-03]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: .agents/skills/better-accessibility/SKILL.md, docs/diseno/PRD-DS-02-componentes.md (DS-S13 a DS-S17).
  Fecha extracción: 2026-10-12. Restringido por ADR-0036, ADR-0009, ADR-0002.
---
# PRD-UI-05 - Accesibilidad WCAG (R2)

Fuente: `.agents/skills/better-accessibility/SKILL.md`, `docs/diseno/PRD-DS-02-componentes.md` (DS-S13 a DS-S17). Fecha extracción: 2026-10-12. Restringido por ADR-0036, ADR-0009, ADR-0002.

## Épica UI-E9. Nombre, teclado y foco

Requisito UI9: todo flujo completa solo con teclado y todo control anuncia nombre, rol y estado.

- Historia UI-S17. Semántica nativa. AC: Given inspecciono markup When verifico `button/a/label for` nativos, sin `div onClick`, sin `tabindex mayor a 0`, sin `outline none` sin reemplazo `:focus-visible` `3:1` Then cada control es nativo o tiene reemplazo medido. ADR: 0036. Talla M. Depende de: nada.
- Historia UI-S18. Foco y rutas. AC: Given navego solo con teclado When recorro overlays con trampa y restauración de foco, rutas SPA que actualizan `title` más foco, y formularios con `aria-invalid/describedby` más foco al primer inválido Then ningún flujo pierde el foco. ADR: 0036. Talla M. Depende de: UI-S17.

## Épica UI-E10. Motion y zoom sin pérdida

Requisito UI10: `prefers-reduced-motion` y zoom 200% sin pérdida de contenido a 360px.

- Historia UI-S19. Motion reducido. AC: Given activo `prefers-reduced-motion: reduce` When navego listas, login, panel, drawer del asistente y POS Then no hay transiciones ni animación de `width/margin`. ADR: 0036, 0002. Talla S. Depende de: UI-S17.
- Historia UI-S20. Zoom y color. AC: Given aplico zoom 200% y vista a 360px When verifico contenido sin `maximum-scale=1`, significado nunca solo por color y contraste AA en cada par Then no hay pérdida ni dependencia solo de color. ADR: 0036. Talla M. Depende de: UI-S18, UI-S19.

## Dependencias externas

UI-S17 no espera a nadie. UI-S19 espera a DS-S7 y DS-S8 de PRD-DS-01. UI-S20 espera a UI-S18 y UI-S19 más PRD-UI-03.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Flujo solo teclado | Venta completa sin mouse | Foco visible y orden correcto |
| Fallo | Control sin nombre | Lector anuncia sin nombre o rol | Bloqueo con criterio WCAG citado |
| Regresión | Motion reducido | `prefers-reduced-motion: reduce` | Sin transiciones en superficies listadas |

Arch-tests: AT1 sin `div onClick` ni `tabindex mayor a 0` (lint). AT2 foco visible `3:1` y `reduced-motion` verificado (test con evidencia).
