---
item: DOCS-GATE-CHECK
estado: hecho
adr: ADR-0086
prd: —
fecha: 2026-11-15
---
DOCS-GATE-CHECK hecho: `npm run verify` corre `docs-estado --check`, `docs-index --check`, `docs:migraciones --check` y `roadmap --check` antes de los writers, así el gate falla nombrando el comando para regenerar en vez de regenerar callado; en rama de trabajo los cuatro se omiten con aviso (`modoChequeo` en `scripts/rama-lib.mjs`) porque los generados los regenera `main`, y la guarda `docs:generados` de ADR-0086 sigue cubriendo que la rama no los traiga.
