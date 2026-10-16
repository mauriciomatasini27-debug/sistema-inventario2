---
id: PRD-UI-07
tipo: prd
estado: propuesto
modulos: []
depende_de: [ADR-0002, ADR-0038, PRD-UI-01, PRD-UI-06]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# PRD-UI-07 - Revisión y stress automatizado (R2)

Fuente: `.agents/skills/better-interface/SKILL.md`, `.agents/skills/interface-review/SKILL.md`, `.agents/skills/break/SKILL.md`, `.agents/skills/break-ui/SKILL.md`, `.agents/skills/state-machine/SKILL.md`, `.agents/skills/variant/SKILL.md`, `.agents/skills/build-design/SKILL.md`, `.agents/skills/explain-interface/SKILL.md`, `.agents/skills/web-design-guidelines/SKILL.md`. Fecha extracción: 2026-10-12. Restringido por ADR-0038, ADR-0002.

## Épica UI-E13. Orquestación con una sola tabla

Requisito UI13: `better-interface` rutea a los 6 dominios en orden `a11y, layout, writing, typography, colors, ui` con máximo 15 hallazgos.

- Historia UI-S26. Review única rankeada. AC: Given corro revisión When obtengo scope más cobertura por dominio más tabla única ordenada por severidad y alcance con `path:line` más `Before/After`, verificación con comando exacto y veredicto Then no hay reglas duplicadas y cada fila tiene dueño. ADR: 0038. Talla M. Depende de: nada.
- Historia UI-S27. Gate por PR. AC: Given abro PR con cambio visual When resuelvo scope `HEAD` contra `merge-base` con blast-radius 1 hop (2 hops solo tokens, máximo 5 consumidores), clasifico `Introduced/Regression/Pre-existing` con `blame`, y marco `Not verified` sin preview barato Then el PR no mergea con `HIGH` abierto. ADR: 0038. Talla M. Depende de: UI-S26.

## Épica UI-E14. Stress antes de merge

Requisito UI14: cada componente nuevo sobrevive a datos peores realistas y a todos sus estados en harness temporal.

- Historia UI-S28. Worst-case con toggle. AC: Given tomo 1 componente When armo fixture misma forma y tipo que demo con fallas por fila según `schema/Zod/migración`, toggle dev-only `?data=worst`, y verifico a 360px, zoom 200%, dark y RTL Then el reporte lista `What broke` con causa y fix por fila más `What held up`. ADR: 0038. Talla M. Depende de: UI-S26.
- Historia UI-S29. Estados y variantes. AC: Given tomo 1 pieza When levanto `/states/<comp>` con `?__state=` y 3 variantes con `?__variant=` sobre floor `better-interface` idéntico, y al elegir construyo la elegida y borro resto con `grep` limpio Then cada estado y variante tiene URL linkeable. ADR: 0038. Talla M. Depende de: UI-S26.
- Historia UI-S30. Figma y guidelines. AC: Given recibo frames o imagen When mapeo variable a token mismo nombre, raw igual a token usa token, raw sin token usa nearest con `Rounded`, y corro `web-design-guidelines` y `writing-guidelines` con fetch fresco más `file:line` Then no hay token nuevo ni valor arbitrario. ADR: 0038. Talla M. Depende de: UI-S28, UI-S29.
- Historia UI-S31. Harness aislado. AC: Given creo rutas `src/pages/_internal/` When verifico excluidas de precache y build PWA, toggles solo con `import.meta.env.DEV` más URL params, y limpieza con `grep` más diff limpio Then ningún harness llega a producción. ADR: 0038, 0002. Talla S. Depende de: UI-S28, UI-S29, UI-S30.

## Dependencias externas

UI-S26 no espera a nadie. UI-S28 y UI-S29 esperan a UI-S26. UI-S31 espera a UI-S28, UI-S29 y UI-S30. Todo el PRD espera a PRD-UI-01 a PRD-UI-06 como floor.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Harness con peor dato | `?data=worst` a 360px | Breaks listados con fix por fila |
| Fallo | Harness en build | Ruta `_internal` en precache | Bloqueo en revisión |
| Regresión | PR visual sin gate | PR con cambio visual | Gate `interface-review` corrido con veredicto |

Arch-tests: AT1 sin harness en build de producción (lint: falla si `_internal` aparece en precache). AT2 variantes y estados con URLs linkeables y limpieza verificada (test con `grep` y diff).
