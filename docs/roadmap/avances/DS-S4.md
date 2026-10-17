---
item: DS-S4
estado: hecho
adr: ADR-0008
prd: PRD-DS-01
fecha: 2026-10-17
---
DS-S4: tema claro/oscuro por dispositivo con `src/styles/tema.css` (roles `--tema-*` y `--estado-*`), `src/lib/tema.ts`, `TemaInicial.astro` (sin flash) y `TemaToggle.astro` (44px, `aria-pressed`); sistema por defecto en `/venta`, `/panel` y el shell, sin ambiente radial (decisión de Mauri), con trinquete en `tests/tema.test.ts` y e2e `tests/e2e/tema.spec.ts`. Marca 2 (2026-10-17): `/admin` suma `TemaInicial`/`TemaToggle` y sus colores pasan a los roles `--tema-*` (claro y oscuro); el toggle muestra a qué tema lleva ("☾ Oscuro" en claro, "☀ Claro" en oscuro) sin perder `aria-pressed`, con el nombre accesible "Tema oscuro" / "Tema oscuro, cambiar a claro". En oscuro el segbar vacío de `/panel` ya no pinta un segmento blanco. E2e en `tests/e2e/tema.spec.ts` (ahora con `/admin`) y `tests/e2e/marca2.spec.ts`.
