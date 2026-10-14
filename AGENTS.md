# AGENTS.md

Reglas cortas para agentes en este repo.

## Roadmap

Nunca edites `docs/ROADMAP.md` en un PR de implementación. El workflow lo regenera en `main`.

Agregá tu avance en `docs/roadmap/avances/<número-ADR>.md` con front-matter `item`, `estado`, `adr`, `prd`, `fecha` (`AAAA-MM-DD`) y una línea de texto. Formato y ejemplo en `docs/roadmap/avances/README.md`.

Ítems chicos (sin decisión de arquitectura nueva) llevan solo `docs/roadmap/avances/<id>.md` con id `P<n>-<m>` (p.ej. `P1-6`) y una sección `## Decisión` de 5–10 líneas, sin ADR ni PRD; PRD + ADR completos solo para decisiones reales de arquitectura o producto.

Antes de abrir el PR corré `npm run roadmap -- --validate`.
