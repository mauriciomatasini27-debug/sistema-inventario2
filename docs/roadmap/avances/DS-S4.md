---
item: DS-S4
estado: hecho
adr: ADR-0008
prd: PRD-DS-01
fecha: 2026-10-17
---
DS-S4: tema claro/oscuro por dispositivo con `src/styles/tema.css` (roles `--tema-*` y `--estado-*`), `src/lib/tema.ts`, `TemaInicial.astro` (sin flash) y `TemaToggle.astro` (44px, `aria-pressed`); sistema por defecto en `/venta`, `/panel` y el shell, sin ambiente radial (decisión de Mauri), con trinquete en `tests/tema.test.ts` y e2e `tests/e2e/tema.spec.ts`.
