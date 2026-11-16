---
item: DOCS-GATE-CHECK
estado: propuesto
adr: ADR-0086
prd: —
fecha: 2026-11-15
---
DOCS-GATE-CHECK propuesto: sumar al gate de merge los guardas `--check` de docs generados (`node scripts/docs-estado.mjs --check`, `docs-index.mjs --check`, `docs-migraciones.mjs --check` y `npm run roadmap -- --check`), porque la auditoría 2026-11-15 encontró los cuatro en rojo en `main` sin que nada los detecte y el drift acumuló un mes (generados congelados en 2026-10-21 mientras los avances avanzaban 11 tags de migración); extiende el gate existente de ADR-0086, costo en segundos, scripts ya idempotentes en `main`.
