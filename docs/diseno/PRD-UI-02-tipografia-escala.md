# PRD-UI-02 - Tipografía y escala (R2)

Fuente: `.agents/skills/better-typography/SKILL.md`, `docs/diseno/PRD-DS-01-tokens-tema-papel.md` (DS-S6). Fecha extracción: 2026-10-12. Restringido por ADR-0033, ADR-0008, ADR-0002.

## Épica UI-E3. Escala exacta y legible en mostrador

Requisito UI3: mismos niveles DS6 con line-height unitless, medida y peso verificables.

- Historia UI-S5. Niveles y ritmo. AC: Given reviso textos When comparo pila `Montserrat, Segoe UI, system-ui, sans-serif` con hub `1.5rem/700`, subtítulo `.875rem`, login brand `1.65rem/600`, listas `.875rem`, onboarding `20px/700` y body `14px`, más `line-height` display `1.1`, headings `1.2-1.3`, body `1.5-1.6` y peso mínimo `400` bajo `18px` Then cada nivel coincide. ADR: 0033, 0008. Talla S. Depende de: nada.
- Historia UI-S6. Medida y números cambiantes. AC: Given leo párrafos y precios When mido medida `60-75ch`, inputs `16px` en iOS y `tabular-nums` en valores que cambian Then no hay líneas fugadas ni saltos de ancho en precio. ADR: 0033. Talla S. Depende de: UI-S5.

## Épica UI-E4. Wrapping y truncado con retorno

Requisito UI4: ningún truncado esconde información sin vía de acceso al valor completo.

- Historia UI-S7. Balance y truncado. AC: Given recorro headings y párrafos When verifico `balance` solo en headings, `pretty` en párrafos y truncado de 1 o N líneas siempre con tooltip, expansión o detalle Then todo truncado tiene retorno declarado. ADR: 0033. Talla S. Depende de: UI-S5.
- Historia UI-S8. Unidades y lengua. AC: Given inspecciono estilos y markup When confirmo `rem` para size, `em` para tracking, `lang/dir/bdi` donde hay nombre propio o código, y smoothing solo en root Then no hay `font-variation-settings` directo ni px fijos de texto. ADR: 0033. Talla S. Depende de: UI-S5.

## Dependencias externas

UI-S5 espera a DS-S6 de PRD-DS-01. UI-S7 y UI-S8 esperan a UI-S5.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Escala completa | Todos los niveles de texto | Cada size, peso y line-height coincide |
| Fallo | Truncado sin retorno | Texto truncado sin tooltip ni expansión | Rechazo en revisión con evidencia |
| Regresión | Strings reales largos | Nombres de producto y códigos a 360px | Sin clip y con vía al valor completo |

Arch-tests: AT1 truncado siempre con retorno (lint: falla si hay `line-clamp` o `ellipsis` sin `title` ni expansión). AT2 sizes en `rem` y tracking en `em` (test de estilos).
