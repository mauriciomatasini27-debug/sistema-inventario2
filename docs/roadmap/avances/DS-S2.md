---
item: DS-S2
estado: hecho
adr: ADR-0008
prd: PRD-DS-01
fecha: 2026-10-17
---
DS-S2: tokens ember (`--color-ember-ambar/coral/rojo/vino`) en `global.css` y `tokens-papel.css` y el segbar del panel (`panel.astro`) en ámbar, coral y vino; ember queda solo en secundarias, nunca CTA primario. Marca 2 (2026-10-17, aprobado por Mauri): ember por módulo en `src/lib/panel-modulos.ts` (`EMBER_MODULO`, `emberModulo`, `ember` en `pillsPanel`) con punto decorativo en las pills (`TopPills.astro`), punto en las etiquetas de los KPI (`KpiStrip.astro`), borde superior ember en las cards secundarias de `/panel` y en `/panel/plan` (`.card-ember--<tono>` en `tema.css`), serie `--serie-ember` (vino en claro, ámbar en oscuro) en el gráfico de ventas y la dona, y el segmento "Mora" del segbar de `/admin` en coral. Trinquete en `tests/marca2.test.ts`.
