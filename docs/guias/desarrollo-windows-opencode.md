---
id: GUIA-DEV-01
tipo: spec
estado: aceptado
modulos: []
depende_de: [ADR-0086]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Cómo desarrollar en Windows con OpenCode (WSL2 Ubuntu), correr `npm run verify` con Postgres 17 local y abrir PRs sin chocar con la Cadena del box.
---
# Desarrollo en Windows con OpenCode

Guía práctica. Fecha: 2026-10-17. Fuentes: `scripts/verify.mjs`, `scripts/pg-local.sh`, `.opencode/pstack-run.sh`, `opencode.json`, `scripts/cadena/puede-mergear.mjs`, ADR-0086.

## Camino recomendado: WSL2 Ubuntu

Todo el tooling del repo asume Linux con bash: `scripts/pg-local.sh`, `.opencode/pstack-run.sh` (usa `pgrep`, `setsid`, `/proc`), `scripts/cadena/con-lock.sh` y los tests que lanzan `bash` (`tests/pstack-fallback.test.ts`, `tests/cadena-con-lock.test.ts`). En Windows nativo `verify` sale con exit 2 si no le das `PG_TEST_URL_A/B`, y aun con esas variables esos tests fallan. Por eso: **WSL2 Ubuntu 24.04** y el repo clonado dentro de WSL (`~/`), no en `/mnt/c` (lento, y rompe permisos y finales de línea).

Windows nativo sirve solo para `npm run dev`, `npm test -- <archivo>` sin Postgres y `npm run verify -- --docs-only` (no probado en Windows).

## Requisitos

- WSL2 con Ubuntu 24.04 y una terminal moderna (Windows Terminal).
- Node 22 (`verify` y Astro 7 piden 22.12 o más). El repo no trae `.nvmrc` ni `engines`.
- Postgres 17 (el box usa 17; Ubuntu 24.04 trae 16 por defecto, así que se instala desde el repo PGDG).
- `git`, `gh` (el gate usa `gh api`) y OpenCode **1.x**. No instales OpenCode 2, que usa el mismo comando.

## Setup, una sola vez

En PowerShell como admin: `wsl --install -d Ubuntu-24.04`, reiniciá y abrí Ubuntu. Después, dentro de WSL:

```bash
sudo apt update && sudo apt install -y git curl build-essential postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh   # repo PGDG
sudo apt install -y postgresql-17
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
source ~/.bashrc && nvm install 22 && nvm alias default 22
sudo apt install -y gh && gh auth login            # HTTPS, cuenta mauriciosoyastor
curl -fsSL https://opencode.ai/install | bash       # OpenCode 1.x
git clone https://github.com/mauriciosoyastor/sistema-inventario.git ~/sistema-inventario
cd ~/sistema-inventario && npm ci
npx playwright install --with-deps chromium         # solo si vas a correr e2e
```

En `~/.bashrc` agregá (el default de `pg-local.sh` es `/workspace/.pgdata`, que solo existe en el box):

```bash
export PGDATA_LOCAL="$HOME/.pgdata-inventario"
export OPENCODE_BIN="$(command -v opencode)"   # pstack-run.sh busca ~/.local/bin/opencode por defecto
```

Probá la base: `bash scripts/pg-local.sh start` tiene que imprimir `ok pers_tenant_a ...` y `ok pers_tenant_b ...` (puerto 54329, auth trust solo en 127.0.0.1, migra con drizzle). El cluster que Ubuntu arranca en 5432 no molesta.

### Variables de entorno

Copiá `.env.example` a `.env` y completalo vos; nunca subas ni pegues `.env` en un chat. Nombres:

- Base: `CONTROL_DATABASE_URL`, `TENANT_DATABASE_URL` (para dev local podés apuntar las dos a `postgres://postgres@127.0.0.1:54329/pers_tenant_a`).
- Login Google: `GOOGLE_LOGIN_CLIENT_ID`, `GOOGLE_LOGIN_CLIENT_SECRET`, `GOOGLE_LOGIN_REDIRECT`. Integraciones: `GOOGLE_INTEGRATIONS_*`.
- Admin y sesiones: `ADMIN_ALLOWLIST_SUBS`, `SUPERADMIN_SUBS` (deprecada), `SESSION_TTL_HOURS`, `JOBS_SECRET`.
- Fiscal: `ARCA_*`, `FISCAL_KMS_KEY_B64`, `FISCAL_KMS_KEY_ID`, `WSAA_BACKOFF_MS`. Dejalas vacías y se usa el fake en memoria.
- Landing: `PUBLIC_FORMSPREE_FORM_ID`.
- Herramientas: `GH_TOKEN` (opcional si hiciste `gh auth login`), `PW_CHANNEL` (opcional, Playwright).

`verify` no necesita `.env`: arma `PG_TEST_URL_A/B` solo con `pg-local.sh`. Dejá `PG_TEST_URL` sin exportar.

### OpenCode

1. `opencode` en la raíz del repo, `/connect`, elegí `opencode` (Zen) y pegá tu key.
2. `opencode.json` ya fija el modelo `opencode/deepseek-v4.1-flash-free` y carga `AGENTS.md` y `.opencode/pstack-*.md`. Chequeá con `opencode debug config` y `opencode models opencode`.
3. Skills del repo en `.agents/skills/` (`opencode debug skill`). Se invocan en el prompt: `/poteto-mode <tarea>`, `/tdd`, `/correct`, `/why`, `/interface-review`.
4. Sesiones headless: `.opencode/pstack-run.sh "prompt"`, que reintenta con otro modelo free si falla por cuota o timeout. Una sesión por vez (OpenCode usa SQLite; dos en paralelo dan "database is locked").
5. Modelos: cada skill tiene su modelo free (ver "Modelo por skill" abajo); `big-pickle` es inestable (último respaldo); `space-bunny-free` y `muse-spark-1.3-contributor-free` ya no existen en Zen.

### Modelo por skill y aviso de modelos caídos

`.opencode/modelos-por-skill.json` asigna a cada skill un perfil (`codigo`, `razon`, `juez`, `prosa`, `rapido`, `largo`) y cada perfil es una lista de modelos free en orden (ADR-0109, PRD-OPENCODE-01). Necesita solo Node 22 (sin npm install).

```bash
cd ~/sistema-inventario
node .opencode/modelos.mjs elegir poteto-mode     # modelo que va a usar
node .opencode/modelos.mjs lista technical-writing # cadena de respaldo disponible
node .opencode/modelos.mjs revivir <modelo>       # le borra la marca de caído
.opencode/pstack-run.sh "/poteto-mode <tarea>"    # elige por el /skill del prompt
.opencode/pstack-run.sh --skill tdd "<tarea>"     # o forzá la skill
tail -n 20 .opencode/modelos-caidos.log           # qué modelos cayeron y cuál se usó
```

- Si el asignado no figura en `opencode models opencode` o falló hace menos de 10 min, se usa el siguiente, sale un `⚠ pstack-modelos:` en la terminal y se agrega una línea al log (gitignored).
- Un `Error: Upstream` o `Error: {` cuenta como fallo solo si está al final de la salida (la última línea no vacía, o seguido únicamente por el JSON de ese mismo error). Si una herramienta leyó un log con ese texto en el medio y la sesión respondió bien al final, no se marca caído.
- `Error: Upstream` no marca el modelo caído: `.opencode/pstack-run.sh` reintenta el mismo modelo `PSTACK_UPSTREAM_REINTENTOS` veces (default 2) esperando `PSTACK_UPSTREAM_ESPERA` segundos (default 5, después 10) y avisa cada reintento por stderr. Agotados los reintentos, pasa al siguiente modelo solo para esa corrida y lo anuncia, sin tocar el log de caídos.
- Cualquier otra indisponibilidad (modelo ausente, acceso deshabilitado, fondos insuficientes, cuota/rate limit, `Error: {"...UnknownError...}` o timeout) sí marca caído como antes.
- El benchmark no tiene rutina periódica: se corre a demanda con `node scripts/opencode/bench-modelos.mjs <modelos...>`.
- Si un modelo quedó marcado caído por un falso positivo o ya se recuperó, `node .opencode/modelos.mjs revivir <modelo>` le borra la marca y vuelve a entrar en el orden.
- La lista de modelos se cachea 10 min en `~/.cache/pstack-modelos/estado.json` (`PSTACK_MODELOS_TTL_MIN` lo cambia); listar no gasta tokens.
- Si cambia el modelo de algún agente, `pstack-run.sh` reinicia `opencode serve` con `OPENCODE_CONFIG_CONTENT`. En la TUI (`opencode` a secas) los agentes usan lo de `opencode.json`: si ves el aviso, reabrí desde `pstack-run.sh` o editá el JSON.
- Privacidad: el primero de cada perfil es un modelo Zen sin retención; los que pueden entrenar con tus datos (mimo, big-pickle, nemotron) solo entran como último respaldo y el aviso te lo muestra.
- `-m <modelo>` o `PSTACK_FALLBACK_MODELS` siguen pisando todo.

## Comandos diarios

| Para | Comando |
|---|---|
| Servidor de desarrollo (:4321) | `npm run dev` |
| Un test | `npx vitest run tests/<archivo>.test.ts` (con Postgres: `PG_TEST_URL_A=$(bash scripts/pg-local.sh url pers_tenant_a) PG_TEST_URL_B=$(bash scripts/pg-local.sh url pers_tenant_b) npx vitest run ...`) |
| Contexto de un tema | `npm run docs:context <tema\|modulo\|id>` y leé solo los rangos que cita |
| Estado del proyecto | `docs/ESTADO.md` (lo genera `npm run docs:estado`) |
| Gate completo | `npm run verify` (typecheck, arch, tests, skips, build, roadmap, docs) |
| Solo docs | `npm run verify -- --docs-only` |
| E2E | `npm run dev` en otra terminal y `npm run test:e2e` |

## Flujo de un cambio

1. `git fetch && git switch -c mauri/<tema> origin/main`. Nunca commitees a `main` directo.
2. Trabajá con OpenCode. Si es un ítem del roadmap, agregá `docs/roadmap/avances/<id>.md` (formato en `docs/roadmap/avances/README.md`); `docs/ROADMAP.md`, `docs/INDEX.md` y `docs/ESTADO.md` no se editan a mano ni se commitean en la rama.
3. `git fetch && git rebase origin/main` y después `npm run verify`, que tiene que dar verde. Los generados (`docs/ESTADO.md`, `docs/ROADMAP.md`, `docs/INDEX.md`, `docs/graph.json`) los regenera `main`, no la rama, así el PR no queda CONFLICTING cuando otro se mergeó antes. Si la rama ya los trae, `verify` falla en la guarda `docs:generados` y te dice cómo quitarlos (`git checkout $(git merge-base origin/main HEAD) -- <archivo>`).
4. Commiteá y `git push -u origin mauri/<tema>`, después `gh pr create`.
5. PR visual (toca `src/**/*.astro|css|tsx|jsx`): el cuerpo lleva una sección `## interface-review` con `Veredicto: Approve` y ningún HIGH abierto. Chequealo antes de abrir el PR con `npm run review:gate -- --body-file <cuerpo.md>`.
6. `node scripts/cadena/puede-mergear.mjs <PR>` tiene que dar exit 0. Bloquea por "No mergear"/"DO NOT MERGE", por migraciones `drizzle/*.sql` sin `docs/roadmap/migraciones/<tag>.json` en `main` y por el gate visual.
7. Squash-merge (`gh pr merge <PR> --squash --delete-branch`). GitHub Actions es manual-only (ADR-0086): no esperes checks.

Migraciones: aplicalas vos sobre la base real y registrá `docs/roadmap/migraciones/<tag>.json` (PR aparte, antes del que trae el `.sql`). El `.md` lo regenera `main`.

## Convivir con la Cadena del box

- La Cadena corre en el box cada 3 h y después de cada merge. Usa `/workspace/.cadena.lock`, que existe solo en el box: en tu máquina no tomes lock ni uses `lock.mjs`/`con-lock.sh`.
- La Cadena solo trabaja y mergea PRs que abrió ella; los tuyos (`mauri/*`) los saltea. No reuses ramas de ella (`feat/*`, `docs/*`, `fix/*`) ni hagas push a ramas ajenas.
- `main` se mueve seguido: rebaseá antes de `verify` y de mergear. Si vas a tocar el mismo módulo que un PR abierto de la Cadena, esperá a que se mergee o cerralo vos.
- No hagas force-push a `main`.

## Verificación formal (TLA+)

El chequeo formal de la cola offline de venta es opcional y no entra a `npm run verify` (ADR-0097). Necesita Java 17+:

```bash
sudo apt install -y openjdk-17-jre-headless
java -version    # tiene que decir 17 o más
npm run verificar:formal
```

La primera vez descarga `tla2tools.jar` 1.7.4 (unos 2 MB) a `~/.cache/sistema-inventario/tla`, fuera del repo, y verifica su SHA256. La salida esperada son cuatro líneas `ok`: `venta-sync` cumple las tres leyes y cada quiebre encuentra su violación esperada.

Si dice "No se verificó nada" y sale 0, falta Java o la red: no es verde. Si dice `FALLA`, es un bug del código o un modelo desactualizado; seguí `/verify-venta-sync` y `/maintain-formal-verification-skill`. Detalle en `verificacion/tla/README.md`.

## Problemas comunes

- `verify: falta Postgres (PG_TEST_URL_A/B)`: estás en Windows nativo o falló `pg-local.sh start`. Mirá `$PGDATA_LOCAL/server.log`.
- `Falta Postgres: sudo apt-get install -y postgresql`: `pg-local.sh` no encontró `/usr/lib/postgresql/*/bin`. Instalá `postgresql-17` o exportá `PGBIN`.
- `initdb` no puede crear `/workspace/.pgdata`: falta `PGDATA_LOCAL` en `~/.bashrc`.
- Puerto 54329 ocupado: `export PG_LOCAL_PORT=<otro>` (`verify` respeta la variable).
- `pstack-run: opencode serve did not start`: revisá `OPENCODE_BIN` y `/tmp/opencode-serve.log`.
- `database is locked` en OpenCode: hay dos sesiones abiertas. Cerrá una o usá `pstack-run.sh`.
- `gh pr view N` falla por scopes: usá `gh pr view N --json title,body,state` o `gh api`.
- Tests lentos o archivos con CRLF: el repo está en `/mnt/c`. Clonalo en `~/`. `.gitattributes` fuerza LF; nunca renormalices un archivo entero.
