# PRD-UI-03 - Color semántico y contraste (R2)

Fuente: `.agents/skills/better-colors/SKILL.md`, `docs/diseno/PRD-DS-01-tokens-tema-papel.md` (DS-S1 a DS-S5). Fecha extracción: 2026-10-12. Restringido por ADR-0034, ADR-0008, ADR-0002.

## Épica UI-E5. Un color igual un significado

Requisito UI5: CTA primario siempre en llama, ember solo en secundarias y separación de tono mayor a 15 grados entre estados.

- Historia UI-S9. Roles y primitivo prohibido. AC: Given inspecciono componentes When verifico rampa neutral más acento más estados, primitivos `--mo-*` nunca directos en componente salvo token semántico, y una sola acción primaria rellena por vista Then no hay `hex` literal ni `var(--mo-*)` crudo en componentes. ADR: 0034, 0008. Talla M. Depende de: nada.
- Historia UI-S10. Contraste medido en par real. AC: Given mido texto sobre fondo renderizado en light y dark con opacidad e imagen When comparo contra umbral AA Then cada par pasa y el valor medido queda registrado. ADR: 0034. Talla M. Depende de: UI-S9.

## Épica UI-E6. Dark real y compatibilidad

Requisito UI6: dark no es light invertido y el email hereda papel con CTA llama.

- Historia UI-S11. Dark ambiente propio. AC: Given abro POS en dark When verifico fondo propio con ambiente radial más linear, `text-on-dark #ffffff`, muted `72%`, y que ningún token claro aparece invertido Then el dark es diseño propio. ADR: 0034, 0008. Talla S. Depende de: UI-S9.
- Historia UI-S12. Email papel compatible. AC: Given abro email generado When verifico columna `600px` máximo, papel claro heredado, CTA llama, tablas a 360px y modo oscuro compatible sin imágenes pesadas salvo logo Then el email pasa en claro y oscuro. ADR: 0034, 0002. Talla S. Depende de: UI-S10, UI-S11.

## Dependencias externas

UI-S9 espera a DS-S1 y DS-S7 de PRD-DS-01. UI-S12 espera a UI-S10 y UI-S11.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Par medido | Texto sobre fondo en light y dark | Ratio AA con valor registrado |
| Fallo | Significado solo por color | Error o estado solo con color | Rechazo, exige texto o icono además |
| Regresión | CTA fuera de llama | CTA primario con ember | Rechazo en revisión visual |

Arch-tests: AT1 sin `hex/rgb/oklch` literal en componentes (lint de estilos). AT2 contraste AA medido en ambos temas (test con valor y umbral).
