---
id: PRD-UI-01
tipo: prd
estado: en curso
modulos: [offline]
depende_de: [ADR-0002, ADR-0009, ADR-0032, PRD-DS-01, PRD-DS-02]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: .agents/skills/better-layout/SKILL.md, .agents/skills/mobile-native/SKILL.md,
  docs/diseno/PRD-DS-02-componentes.md (DS-S10 a DS-S12). Fecha extracción: 2026-10-12. Restringido por
  ADR-0032, ADR-0009, ADR-0002.
---
# PRD-UI-01 - Layout y base PWA 360px (R2)

Fuente: `.agents/skills/better-layout/SKILL.md`, `.agents/skills/mobile-native/SKILL.md`, `docs/diseno/PRD-DS-02-componentes.md` (DS-S10 a DS-S12). Fecha extracción: 2026-10-12. Restringido por ADR-0032, ADR-0009, ADR-0002.

## Épica UI-E1. Estructura que resiste resize y traducción

Requisito UI1: agrupación por espacio, alineación a bordes compartidos y una sola acción primaria por vista.

- Historia UI-S1. Agrupación y alineación. AC: Given abro hub, POS y listas When mido gap entre grupos mayor o igual a 2x gap intra grupo, alineación a bordes compartidos y orden visual igual a DOM sin `order` ni `row-reverse` Then cada vista cumple sin excepciones. ADR: 0032. Talla S. Depende de: nada.
- Historia UI-S2. Propiedades lógicas y medidas fluidas. AC: Given inspecciono estilos When verifico `inline-start/end` en vez de `left/right`, `100%` nunca `100vw`, `100dvh` nunca `100vh`, `min-height/max-width` nunca alto fijo para texto, y `scroll-padding` donde hay sticky Then no hay reglas físicas ni anchos fijos de texto. Quedan tres `100vw` en `AsistenteDrawer.astro`, `ChatLanding.astro` y `ConfirmDialog.astro`: pendiente. ADR: 0032. Talla S. Depende de: UI-S1.

## Épica UI-E2. Base instalada PWA a 360px

Requisito UI2: la web se siente instalada en celular gama baja con viewport 360px como base.

- Historia UI-S3. Viewport y touch. AC: Given abro la app en celular When verifico `viewport-fit=cover`, `100dvh/100svh`, inputs a `16px` en iOS, `-tap-highlight transparent`, `touch-action manipulation`, `overscroll none/contain` en overlays, `safe-area` y `theme-color` por esquema Then cada valor coincide y no hay zoom forzado en foco. `viewport-fit`, `100dvh` y `safe-area` están; `tap-highlight`, `touch-action` y `overscroll` siguen pendientes. ADR: 0032, 0002. Talla M. Depende de: UI-S1.
- Historia UI-S4. Anchos y espejo. AC: Given navego a 360px, 200% zoom y RTL When recorro hub, POS, login y listas Then no hay clip ni overlap, el truncado conserva vía al valor completo y el contenido tras scroll tiene cue visible. ADR: 0032. Talla M. Depende de: UI-S2, UI-S3.

## Dependencias externas

UI-S1 no espera a nadie. UI-S3 espera tokens DS-S7 de PRD-DS-01. UI-S4 espera a UI-S2 y UI-S3.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Vista a 360px | Hub, POS, login y listas a 360px | Sin scroll horizontal ni overlap |
| Fallo | Viewport fijo | `100vw` o `100vh` en estilos | Rechazo en revisión con evidencia |
| Regresión | Zoom 200% más RTL | Zoom 200% con espejo RTL | Sin clip y con cue de contenido oculto |

Arch-tests: AT1 sin `100vw/100vh` ni `left/right` físicos en componentes nuevos (lint de estilos). AT2 base 360px sin scroll horizontal (test de viewport con evidencia).
