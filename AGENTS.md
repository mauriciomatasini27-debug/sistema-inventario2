# AGENTS.md

Reglas cortas para agentes en este repo.

## Estado y lectura de docs

- Estado rápido: `docs/ESTADO.md` (autogenerado con `npm run docs:estado`; no editar a mano). En rama de trabajo, `npm run docs:estado` imprime el estado en stdout y no escribe el archivo.
- Para trabajar un PRD/ADR o un módulo: `npm run docs:context <tema|modulo|id>` y leé solo los docs y rangos de líneas que cita (más `docs/INDEX.md` para ubicar algo). No leas docs completos "por las dudas".
- Nunca leas `docs/archivo/` (histórico deprecado) salvo pedido explícito.
- Al crear o modificar un doc: frontmatter según `docs/README.md` (plantillas `docs/adr/_PLANTILLA-ADR.md`, `docs/diseno/_PLANTILLA-PRD.md`) y después `npm run docs:check`. Los generados (`docs/ESTADO.md`, `docs/INDEX.md`, `docs/graph.json`, `docs/roadmap/migraciones-aplicadas.md`) los regenera `main`, no la rama.

## Roadmap

- Nunca edites `docs/ROADMAP.md` a mano ni commitees los generados (`docs/ESTADO.md`, `docs/ROADMAP.md`, `docs/INDEX.md`, `docs/graph.json`, `docs/roadmap/migraciones-aplicadas.md`) en una rama: los regenera `main` con `npm run docs:estado` / `docs:index` / `roadmap`, que en una rama de trabajo no escriben (usá `--forzar` para previsualizar). Así el PR no queda CONFLICTING por esos archivos cuando otro PR se mergeó antes.
- `npm run verify` corre la guarda `docs:generados` y falla, nombrando el archivo y el comando para quitarlo, si la rama trae un generado.
- Agregá tu avance en `docs/roadmap/avances/<número-ADR>.md` con front-matter `item`, `estado`, `adr`, `prd`, `fecha` (`AAAA-MM-DD`) y una línea de texto. Formato y ejemplo en `docs/roadmap/avances/README.md`.
- Ítems chicos (sin decisión nueva de arquitectura): solo `docs/roadmap/avances/<id>.md` con id `P<n>-<m>` (p.ej. `P1-6`) y una sección `## Decisión` de 5–10 líneas, sin ADR ni PRD; PRD + ADR solo para decisiones reales de arquitectura o producto.
- Antes de abrir el PR: `npm run roadmap -- --validate`.

## Regla de cada PR

- Una rama por ítem (`mauri/<tema>`), nunca commit ni push a `main`; el agente no mergea: el merge lo hace Mauri.
- Seguí la política de comentarios de ADR-0064 y su sección «Procedimiento»: un comentario `//` solo se escribe si explica un porqué que el código no puede decir, en una de tres clases — plataforma/navegador (`[plataforma]`), regla fiscal o legal con referencia (`[fiscal]`), o invariante de seguridad/aislamiento por tenant (`[tenant]`) — y nombra el id del ítem. Para podar un alcance usá el skill `/delete-comment` (`.agents/skills/delete-comment/SKILL.md`): cinco categorías, test de Excusa y los tres criterios de ADR; las decisiones van a un ADR o `decisions.tsv`, los gotchas de runtime a `docs/guias/gotchas-<área>.md` y `GLOSSARY.md` solo define términos del dominio. Todo lo demás se elimina; un parche temporal se refactoriza o se registra como issue, nunca se explica en un comentario (PRD-COM-01, PLAN-COM-01). Los marcadores en líneas nuevas necesitan `#<issue>` en la misma línea (COM-S7). `scripts/check-comment-ids.mjs` verifica id, clase y marcadores en líneas nuevas de `src/` (base `merge-base` con `origin/main`) en `verify`. La ejecución por área sigue `docs/diseno/PLAN-COM-01/e-ejecucion.md` (PLAN-COM-01-E). No JSDoc. Agregá también el avance de Roadmap de arriba y la línea `> Estado al` del PRD que toca el ítem. Sin tocar los generados ni `docs/ROADMAP.md`.
- La descripción del PR explica comportamiento, diseño, tests y cómo verificarlo (comandos concretos).
- Tests de bordes sacados de los AC del PRD/ADR (cambio de día, otro tenant, fallo de base, permisos por rol, estado vacío), y comprobá que cada uno falla si rompés el comportamiento que cubre.
- Antes del PR: `npm run verify` en verde (ya corre `typecheck`, `check:arch`, la suite completa, el gate de skips y `astro build`, además de los gates de docs): no corras `npm test` por separado. No hay ESLint/Biome/Prettier: `verify` es el lint.
- Si una suite se saltea por falta de `PG_TEST_URL_A/B`, corré `bash scripts/pg-local.sh start` y reportá su salida antes de declarar el entorno sin Postgres. `verify` bootea Postgres local solo.
- Si `git status --short` muestra cambios ajenos al ítem, re-leé cada archivo justo antes de editarlo y contrastalo con `git diff HEAD`: el working tree puede mutar a mitad de sesión y una lectura vieja lleva a decidir sobre código que ya no está.
- Antes de commitear cada ticket, releé sus acceptance criteria del issue y declará cuál pasa y cuál se desvía y por qué; las desviaciones se enmiendan visiblemente en el issue (comment), no en silencio.

## Agent skills

### Issue tracker

GitHub. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

single-context. See `docs/agents/domain.md`.
- Sin `drizzle/*.sql` salvo pedido explícito de Mauri (ver migraciones abajo). Nunca edites un `drizzle/*.sql` ya aplicado en alguna base: el cambio va en un tag nuevo. `npm run db:migrate` usa el wrapper P1-69 (pendientes por idx del journal; saltea tablas ausentes); `db:migrate:kit` queda el drizzle-kit crudo.

## Gate de merge

- `npm run verify` (Node 22, Postgres A/B) verde y `node scripts/cadena/puede-mergear.mjs <PR>` exit 0; después squash-merge y borrar la rama.
- GitHub Actions quedó manual-only (`workflow_dispatch`, ADR-0086): el gate real es `npm run verify`.
- `puede-mergear.mjs` bloquea si el título/cuerpo dice "No mergear"/"DO NOT MERGE", o si el PR agrega `drizzle/*.sql` cuyo tag no tiene `docs/roadmap/migraciones/<tag>.json` en `main`.
- Las migraciones solo se aplican con aprobación de Mauri y se registran en `docs/roadmap/migraciones/<tag>.json` antes del merge del PR que las trae; `docs/roadmap/migraciones-aplicadas.md` es derivado (`npm run docs:migraciones`). Aplicar en una base: `TENANT_DATABASE_URL=… npm run db:migrate` (o `--check` / `db:migrate:check` para listar pendientes sin escribir).

## Cadena: lock

- El lock es `/workspace/.cadena.lock` (solo el PID dueño). Se toma y libera con `node scripts/cadena/lock.mjs acquire|release --pid <pid>`; nunca lo escribas a mano.
- Orquestador: keeper que viva toda la corrida (`setsid nohup sleep infinity >/dev/null 2>&1 &`, PID en H), `acquire --pid $H` (espera hasta 20 min; exit 3 = otro dueño vivo: loguear `skip` en `/workspace/cadena-log.tsv`, `kill $H` y terminar), `trap 'node scripts/cadena/lock.mjs release --pid $H; kill $H' EXIT`. Nunca el `$$` de una shell de herramienta. Un dueño muerto (stale) lo libera `acquire`/`check` y queda logueado.
- Dentro de la cadena, el ORQUESTADOR ya tomó el lock: la sesión de OpenCode NO lo adquiere ni lo libera, y no hace push ni merge.
- Para un comando suelto: `scripts/cadena/con-lock.sh <cmd>` (toma y libera al salir). Tests: `tests/cadena-lock.test.ts`, `tests/cadena-puede-mergear.test.ts`, `tests/cadena-con-lock.test.ts`.

## Desarrollo local (fuera del box)

- Windows: WSL2 Ubuntu con Node 22 y Postgres 17; guía en `docs/guias/desarrollo-windows-opencode.md`. Windows nativo no corre `npm run verify` completo (scripts bash).
- Fuera del box no hay `/workspace/.cadena.lock`: no tomes el lock; rama propia (`mauri/<tema>`), nunca push a `main`, PR + `npm run verify` + `puede-mergear.mjs`. La Cadena del box saltea los PRs que no abrió.

## OpenCode (modelos)

- Skills (ADR-0113): pstack (`poteto-mode`, `principle-*`, `how`, `tdd`, …) viene del plugin oficial (`cursor/plugins`, `pstack/skills`), no del repo. `.agents/skills/` guarda solo skills del proyecto (`control-app`, `verify-*`, `prototype`, `state-machine`, diseño); no vuelvas a copiar skills pstack ahí. En OpenCode instalá pstack en `~/.config/opencode/skills/`.
- Config en `opencode.json`: primario `opencode-go/deepseek-v4.1-flash` (suscripción OpenCode Go, actual 2026-11-15); agente `pstack-judge` usa `opencode-go/kimi-k2.7-code` (cross-family). Los primarios son endpoints pagos que no entrenan con datos por default (docs/console/go/#privacy); las cadenas free de Zen quedan como fallback y los que pueden entrenar solo de último respaldo. Sin key de Go el resolvedor cae solo a la cadena free. Detalle y roles en `.opencode/pstack-models.md` / `.opencode/pstack-opencode.md`.
- Modelo por skill (ADR-0109): `.opencode/modelos-por-skill.json` + `node .opencode/modelos.mjs elegir <skill>`. Si el asignado no está, cae al siguiente del perfil, avisa por stderr y anota en `.opencode/modelos-caidos.log`; `pstack-run.sh` lo usa solo. Si cambiás un agente en `opencode.json`, cambiá su perfil en el JSON (lo chequea `tests/opencode-modelos.test.ts`).

## Verificación formal

- Verificación de UI con `/control-app`: `node scripts/control-app/control-app.mjs` levanta el entorno local, siembra el tenant, entra como Dueño o empleado, navega y deja PNG más JSON en `.agents/skills/control-app/artifacts/` (ADR-0111).
- `/create-formal-verification-skill` para una promesa nueva donde un bug cuesta plata o datos y los tests llegan poco (concurrencia, reintentos, máquinas de estado); `/maintain-formal-verification-skill` después de merges o refactors que tocaron código verificado sin re-chequear; `/verify-venta-sync` antes de cerrar cualquier cambio en la cola offline de `/venta`, `cola-venta.ts`, `empujarOperacion` o la tabla `outbox`. El chequeo formal es `npm run verificar:formal` (Java 17+, opcional, fuera de `verify`; ver `verificacion/tla/README.md`).
