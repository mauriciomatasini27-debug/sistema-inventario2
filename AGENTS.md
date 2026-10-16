# AGENTS.md

Reglas cortas para agentes en este repo.

## Roadmap

Nunca edites `docs/ROADMAP.md` en un PR de implementación. El workflow lo regenera en `main`.

Agregá tu avance en `docs/roadmap/avances/<número-ADR>.md` con front-matter `item`, `estado`, `adr`, `prd`, `fecha` (`AAAA-MM-DD`) y una línea de texto. Formato y ejemplo en `docs/roadmap/avances/README.md`.

Ítems chicos (sin decisión de arquitectura nueva) llevan solo `docs/roadmap/avances/<id>.md` con id `P<n>-<m>` (p.ej. `P1-6`) y una sección `## Decisión` de 5–10 líneas, sin ADR ni PRD; PRD + ADR completos solo para decisiones reales de arquitectura o producto.

Antes de abrir el PR corré `npm run roadmap -- --validate`.

## Lectura de docs

Para trabajar un PRD/ADR o un módulo, primero corré `npm run docs:context <tema|modulo|id>`; leé solo los docs y rangos de líneas que cita (más `docs/INDEX.md` si hace falta ubicar algo). No leas docs completos "por las dudas".
Nunca leas `docs/archivo/` (histórico deprecado) salvo pedido explícito.
Al crear o modificar un doc: frontmatter según `docs/README.md` (plantillas `docs/adr/_PLANTILLA-ADR.md`, `docs/diseno/_PLANTILLA-PRD.md`), luego `npm run docs:index` y `npm run docs:check` antes del PR.

## Cadena de implementación

Procedimiento obligatorio de cada corrida (no hay otro mecanismo de lock; nunca un holder ad-hoc `bash -c` que escriba `/workspace/.cadena.lock` a mano):

1. Al inicio, creá un PID que viva toda la corrida: `setsid nohup sleep infinity >/dev/null 2>&1 &` y guardá su PID en H; después `node scripts/cadena/lock.mjs acquire --pid $H`. Exit 3 = otro dueño vivo tras 20 min: loguear `skip` en `/workspace/cadena-log.tsv`, matar H (`kill $H`) y terminar sin tocar nada. Un dueño muerto (stale) lo libera `acquire` solo y queda logueado. Nunca el `$$` de una shell de herramienta: cada llamada puede ser una shell nueva que muere y el lock queda stale.
2. Inmediatamente registrar la liberación: `trap 'node scripts/cadena/lock.mjs release --pid $H; kill $H' EXIT` (o `finally` equivalente). Para un comando suelto, `scripts/cadena/con-lock.sh <cmd>` ya está bien: su propio `$$` vive mientras corre el comando, toma y libera al salir (`tests/cadena-con-lock.test.ts`).
3. Antes de cualquier squash-merge: `node scripts/cadena/puede-mergear.mjs <PR>`. Exit ≠ 0 => no mergear, dejar el PR abierto, loguear y avisar a Mauri. Exit 0 y checks ci/analyze/guard verdes => `gh pr merge <PR> --squash --delete-branch`.
4. Al final: loguear en `/workspace/cadena-log.tsv` y `node scripts/cadena/lock.mjs release --pid $H` y `kill $H` (el trap lo cubre si la corrida corta antes).

- Lock: `/workspace/.cadena.lock` (contenido: solo el PID dueño). Tomar con `node scripts/cadena/lock.mjs acquire --pid <pid>` (atómico, espera hasta 20 min a un dueño vivo), liberar con `release --pid <pid>`: solo se libera el propio o uno stale. Stale = PID muerto (`kill -0` falla), con o sin >2h; `lock.mjs check` lo libera y lo loguea en `/workspace/cadena-log.tsv`.
- Antes de cualquier squash-merge, correr `node scripts/cadena/puede-mergear.mjs <PR>`. Si falla (exit ≠ 0), no mergear y avisar a Mauri. Bloquea si el título/cuerpo dice "No mergear"/"DO NOT MERGE", o si el PR agrega `drizzle/*.sql` cuyo tag no figura en `docs/roadmap/migraciones-aplicadas.md` de `main` (el box no llega a la base real; esa lista es el marcador explícito de migraciones aplicadas y solo se actualiza tras aplicarla).
