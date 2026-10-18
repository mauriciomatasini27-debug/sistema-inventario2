---
id: PRD-UI-04
tipo: prd
estado: en curso
modulos: []
depende_de: [ADR-0002, ADR-0035]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: .agents/skills/better-writing/SKILL.md, .agents/skills/writing-guidelines/SKILL.md,
  .agents/skills/ask-sonner/SKILL.md (toasts). Fecha extracción: 2026-10-12. Restringido por ADR-0035, ADR-0002.
---
# PRD-UI-04 - Copy y voz (R2)

Fuente: `.agents/skills/better-writing/SKILL.md`, `.agents/skills/writing-guidelines/SKILL.md`, `.agents/skills/ask-sonner/SKILL.md` (toasts). Fecha extracción: 2026-10-12. Restringido por ADR-0035, ADR-0002.

## Épica UI-E7. Una voz y un vocabulario

Requisito UI7: inventario de strings único, mismo sustantivo y verbo en todo el flujo.

- Historia UI-S13. Inventario de strings. AC: Given audito copy When listo `t()`, `i18n`, `FormattedMessage` y `locales/**/*.json` con un solo término por concepto (`Continuar` o `Seguir`, nunca ambos) y capitalización única Then no hay duplicados ni dobles términos. ADR: 0035. Talla S. Depende de: nada.
- Historia UI-S14. Botones y links. AC: Given recorro acciones When verifico botones verbo más objeto, links que describen destino nunca `Click aquí`, y toggles que describen estado ON Then cada control dice qué hace. ADR: 0035. Talla S. Depende de: UI-S13.

## Épica UI-E8. Errores que enseñan y destructivas que confirman

Requisito UI8: todo error dice cómo arreglar junto al campo y toda destructiva confirma o deshace.

- Historia UI-S15. Errores con fix. AC: Given provoco cada error When verifico mensaje calmo junto al campo con cómo arreglar, sin `Oops`, sin `!`, sin `Please` y sin `successfully`, más foco al primer inválido Then cada error tiene vía de fix. ADR: 0035. Talla M. Depende de: UI-S13.
- Historia UI-S16. Confirmación y toasts. AC: Given ejecuto acción destructiva y operaciones con toast When verifico título acción más objeto, body con pérdida, botones verbo más objeto, pedido de nombre en destructiva crítica, `toast.success/error/promise` con un solo `Toaster` en root y `undo` preferido sobre confirmación Then ninguna destructiva pasa sin red. ADR: 0035. Talla M. Depende de: UI-S13, UI-S15.

## Dependencias externas

UI-S13 no espera a nadie. UI-S15 y UI-S16 esperan a UI-S13.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Error con fix | Cada formulario inválido | Mensaje junto al campo con cómo arreglar |
| Fallo | Destructiva sin confirm | Borrar producto o caja sin diálogo | Bloqueo en revisión |
| Regresión | Strings de servidor | Copy de CMS o servidor no visto | Marcado `Not verified` explícito |

Arch-tests: AT1 strings enteros con placeholders ICU más `Intl`, nunca concatenación (lint). AT2 destructiva siempre con confirm o undo (test de flujo con evidencia).
