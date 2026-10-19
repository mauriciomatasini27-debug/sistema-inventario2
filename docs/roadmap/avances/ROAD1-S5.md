---
item: ROAD1-S5
estado: hecho
adr: ADR-0076
prd: PRD-ROAD-01
fecha: 2026-10-18
---
ROAD1-S5 hecho: los generados (`docs/ESTADO.md`, `docs/ROADMAP.md`, `docs/INDEX.md`, `docs/graph.json`) no se commitean en la rama; `npm run verify` los bloquea con la guarda `docs:generados` y `docs:estado` / `docs:index` / `roadmap` no escriben fuera de `main`, así el PR no queda CONFLICTING cuando otro se mergeó antes.
