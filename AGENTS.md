# AGENTS.md

Reglas cortas para agentes en este repo.

## Roadmap

Nunca edites `docs/ROADMAP.md` en un PR de implementación. El workflow lo regenera en `main`.

Agregá tu avance en `docs/roadmap/avances/<número-ADR>.md` con front-matter `item`, `estado`, `adr`, `prd`, `fecha` (`AAAA-MM-DD`) y una línea de texto. Formato y ejemplo en `docs/roadmap/avances/README.md`.

Ítems chicos (sin decisión de arquitectura nueva) llevan solo `docs/roadmap/avances/<id>.md` con id `P<n>-<m>` (p.ej. `P1-6`) y una sección `## Decisión` de 5–10 líneas, sin ADR ni PRD; PRD + ADR completos solo para decisiones reales de arquitectura o producto.

Antes de abrir el PR corré `npm run roadmap -- --validate`.

## Cadena de implementación

- Lock: `/workspace/.cadena.lock` (contenido: solo el PID dueño). Tomar con `node scripts/cadena/lock.mjs acquire --pid <pid>` (atómico, espera hasta 20 min a un dueño vivo), liberar con `release --pid <pid>`: solo se libera el propio o uno stale. Stale = PID muerto (`kill -0` falla), con o sin >2h; `lock.mjs check` lo libera y lo loguea en `/workspace/cadena-log.tsv`.
- Antes de cualquier squash-merge, correr `node scripts/cadena/puede-mergear.mjs <PR>`. Si falla (exit ≠ 0), no mergear y avisar a Mauri. Bloquea si el título/cuerpo dice "No mergear"/"DO NOT MERGE", o si el PR agrega `drizzle/*.sql` cuyo tag no figura en `docs/roadmap/migraciones-aplicadas.md` de `main` (el box no llega a la base real; esa lista es el marcador explícito de migraciones aplicadas y solo se actualiza tras aplicarla).
