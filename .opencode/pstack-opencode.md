# pstack on OpenCode — adaptation layer (always loaded via opencode.json "instructions")

pstack skills were written for Cursor. Desde ADR-0113 el repo no trae copia de pstack: las skills pstack (`poteto-mode`, `principle-*`, `how`, `tdd`, etc.) vienen del plugin oficial (`cursor/plugins`, `pstack/skills`). En Cursor las carga el plugin; en OpenCode instalalas a nivel usuario en `~/.config/opencode/skills/` (p.ej. `git clone --depth 1 --filter=blob:none --sparse https://github.com/cursor/plugins && git -C plugins sparse-checkout set pstack/skills` y copiá/enlazá cada carpeta). `.agents/skills/` solo tiene skills del proyecto. When a skill names a Cursor-only thing, use the OpenCode equivalent below.

## Modelos

- Modelo por skill y agente: `.opencode/modelos-por-skill.json` (perfiles `codigo`, `razon`, `juez`, `prosa`, `rapido`, `largo`, ADR-0109). `node .opencode/modelos.mjs elegir <skill>` da el primero disponible; si cae, avisa y anota en `.opencode/modelos-caidos.log`. `space-bunny-free` (2026-10-20) y `muse-spark-1.3-contributor-free` (2026-10-17) ya no existen en Zen.
- Los roles son subagentes en `opencode.json` `agent` (`pstack-worker`, `pstack-judge`; `poteto-agent` y `comment-sicko` se quitaron, ADR-0113), cada uno con su `model`; la tabla rol→agente vive en `.opencode/pstack-models.md`.
- `pstack-worker` usa `opencode-go/deepseek-v4.1-flash`; `pstack-judge` usa `opencode-go/kimi-k2.7-code` (otra familia = cross-family judging). Privacidad: los endpoints pagos de Go no entrenan con datos por default (docs/console/go/#privacy), así que los primarios Go van en sinRetencion; las cadenas free de Zen quedan como fallback (el primero de cada cadena free es sin retención); beam retiene 30 días; mimo, big-pickle y nemotron pueden entrenar y quedan de último respaldo.
- Cada modelo tiene `limit.context = 250000` y `compaction.auto` on: partí tareas grandes por área. `.opencode/pstack-run.sh` reintenta una sesión fallida, trabada (`PSTACK_SESSION_TIMEOUT`, default 700 s) o con cuota con el siguiente modelo del perfil de la skill (marca el caído por 10 min para no gastar reintentos); reinicia `opencode serve` si le falta el token de GitHub.

## Tools

- `Task` / `generalPurpose` -> `task` con `subagent_type`: `general`, `explore`, o un rol pstack.
- Task `model` -> no soportado: elegí el rol (`pstack-worker` o `pstack-judge`); modelos distintos = cross-family judging.
- `AskQuestion` -> `question` en la TUI interactiva; en `opencode run` (headless) no existe: elegí el default y seguí (principle-never-block-on-the-human).
- `create-skill` (skill del proyecto) -> `.agents/skills/<name>/SKILL.md` con frontmatter `name` = nombre de carpeta (lowercase-hyphen) y `description`. Verificá con `~/.local/bin/opencode debug skill`.
- `control-ui`/`control-cli` (`cursor-team-kit`) no están instalados: donde una skill poteto pide "the matching control skill" para la PWA o la web, usá la skill local `/control-app` (`scripts/control-app/control-app.mjs`, ADR-0111).
- Worktrees -> `git worktree add ../si-wt-<slug> -b wt/<slug>` y borralo al terminar.

## GitHub

- `origin` = `mauriciomatasini27-debug/sistema-inventario2` (privado); `gh` autentica con `GH_TOKEN` del entorno (nunca imprimirlo).
- `gh pr view/diff/checks` y `gh api` sirven para why, blast-radius y correct. Code scanning no está habilitado (CodeQL deja SARIF como artefacto): `gh api .../code-scanning` da 403, saltealo.
- `gh pr view N` pelado falla (necesita scopes que el token no tiene): pasá `--json <fields>` o usá `gh pr diff N`.
- MCP: `~/.local/bin/opencode mcp list </dev/null` (no hay carpeta `mcps/`). No llames MCP de Supabase desde skills pstack: es data viva, no historial. Registralo como "not used by policy".
- Arena/why/architect: los `task` del mismo mensaje corren concurrentes (no hay `run_in_background`). `opencode run` headless rechaza `external_directory` (p.ej. `/tmp`): candidatos y notas van en `.pstack-tmp/<slug>/` (gitignored); borralo al terminar.

## Paths

- `~/.cursor/rules/*.mdc` -> `.opencode/*.md` en `opencode.json` `instructions`, o `AGENTS.md`.
- `~/.cursor/rules/pstack-models.mdc` -> `.opencode/pstack-models.md`.
- `~/.cursor/skills/`, `~/.cursor/plugins/` -> `~/.config/opencode/skills/` (pstack del plugin oficial, usuario) o `.agents/skills/` (solo skills del proyecto).
- Transcripts (`~/.cursor/projects/*/agent-transcripts/`, usados por reflect/recall/automate-me/show-me-your-work) -> sesiones OpenCode:
  - listar: `~/.local/bin/opencode session list --format json -n 20`
  - leer: `~/.local/bin/opencode export <id>` -> `{info, messages}` (cada mensaje con `parts`)
  - buscar: `for id in $(~/.local/bin/opencode session list --format json -n 50 | jq -r '.[].id'); do ~/.local/bin/opencode export $id | jq -r '.messages[].parts[]?.text // empty' | grep -il "<term>" >/dev/null && echo $id; done`
  - store crudo (solo si hay `sqlite3`): `~/.local/share/opencode/opencode.db` (read-only, nunca escribir). Logs: `~/.local/share/opencode/log/`. Costos: `~/.local/bin/opencode stats`.
  - Siempre pasá `</dev/null`.
- setup-pstack: detectá modelos con `~/.local/bin/opencode models opencode`; la tabla rol→agente se escribe en `.opencode/pstack-models.md` (no en `~/.cursor/rules`). Los cambios aplican a sesiones nuevas; chequeá con `~/.local/bin/opencode debug config`.
- OpenCode guarda el estado en un SQLite: corré una sesión `opencode run` a la vez o attachá al server con `.opencode/pstack-run.sh` (paralelas fallan con "database is locked").

## Estado y docs

- Estado rápido: `docs/ESTADO.md` (autogenerado; no editar a mano).
- Para trabajar un PRD/ADR o un módulo: `npm run docs:context <tema|modulo|id>` primero y leé solo los rangos que cita. Nunca leas `docs/archivo/` (histórico deprecado).
- No edites `docs/ROADMAP.md` a mano: lo regenera `npm run verify` (o `npm run roadmap`). Agregá el avance en `docs/roadmap/avances/<id>.md` y validá con `npm run roadmap -- --validate`. Detalle y formato en `AGENTS.md` y `docs/roadmap/avances/README.md`.

## Errores recurrentes (ADR de errores LLM)

Cada error tiene un guard estructural; la doc es el último recurso. E1: nunca escribir en `/tmp` (pstack-run.sh exporta `TMPDIR="$PWD/.pstack-tmp"`, cubierto por `tests/arch/pstack-run.test.ts`). E2: citar salida real verbatim con `npm run evidencia` (`scripts/evidencia.mjs`, `tests/evidencia.test.ts`), nunca parafrasear conteos. E3: comentarios que dicen "no existe/sin tabla" los verifica `tests/arch/sin-comentario-falso.test.ts`. E4: día de Argentina vía `FechaAR` (fase 1, AT1). E5: nunca renormalizar finales de línea de un archivo entero (`.gitattributes` + AT3, fase 1). E6: tests con base viva solo vía Postgres de servicio (fase 3). E7: errores tragados (`catch {}` vacío o `.catch(() => null)`) solo en la allowlist de `tests/arch/sin-errores-tragados.test.ts`: loguear o relanzar. E8: `online` nunca como literal en repos/rutas, solo desde `src/lib/offline-gate.ts` (`tests/arch/sin-online-literal.test.ts`). E9: los imports terminan en `.js` pero las fuentes son `.ts`, así que un "File not found" para `x.js` significa leer `x.ts`; antes de afirmar que un archivo o tabla falta, correr `glob`/`rg` y citar la salida del comando; los nombres de skill son nombres de carpeta (`poteto-mode`). E10: sin casts para callar tipos en tests, usar el helper `ctx()` (fase 1, AT2). E11: nunca `not.toContain(<PIN>)` sobre hash/sal/uuid ni sobre `JSON.stringify` (flake ~1/1000 por sal aleatoria); comparar campos exactos (`tests/auth-pin.test.ts`), guard en `tests/arch/sin-substring-sobre-hash.test.ts`.

## Cadena: lock y merge

- El lock es `/workspace/.cadena.lock` (solo el PID dueño), administrado con `node scripts/cadena/lock.mjs acquire|release --pid <pid>`; nunca lo escribas a mano. Para un comando suelto, `scripts/cadena/con-lock.sh <cmd>`.
- Dentro de la cadena el ORQUESTADOR ya tomó el lock: la sesión de OpenCode NO lo adquiere ni lo libera, y no hace push ni merge.
- Gate de merge (lo corre el orquestador): `npm run verify` (Node 22, Postgres A/B) verde y `node scripts/cadena/puede-mergear.mjs <PR>` exit 0. GitHub Actions quedó manual-only (`workflow_dispatch`, ADR-0086); el gate real es `npm run verify`.
- Las migraciones solo se aplican con aprobación de Mauri y se registran en `docs/roadmap/migraciones/<tag>.json` antes del merge; el `.md` es derivado (`npm run docs:migraciones`). Tests: `tests/cadena-lock.test.ts`, `tests/cadena-puede-mergear.test.ts`, `tests/cadena-con-lock.test.ts`.

## Verificación formal

- `/create-formal-verification-skill` para una promesa nueva donde un bug cuesta plata o datos y los tests llegan poco (concurrencia, reintentos, máquinas de estado); `/maintain-formal-verification-skill` después de merges o refactors que tocaron código verificado sin re-chequear; `/verify-venta-sync` antes de cerrar cualquier cambio en la cola offline de `/venta`, `cola-venta.ts`, `empujarOperacion` o la tabla `outbox`. El chequeo formal es `npm run verificar:formal` (Java 17+, opcional, fuera de `verify`; ver `verificacion/tla/README.md`).
