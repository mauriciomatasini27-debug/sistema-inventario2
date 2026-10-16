#!/usr/bin/env bash
# Corre <cmd> con el lock de la cadena tomado; lo libera al salir (trap EXIT, también con error/señal).
# Uso: scripts/cadena/con-lock.sh <cmd> [args...]
# Env opcional: CADENA_LOCK (default /workspace/.cadena.lock), CADENA_LOG (default /workspace/cadena-log.tsv),
#               CADENA_WAIT_MIN (default 20). Exit: el de <cmd>; 3 si no se pudo tomar el lock.
set -u
if [ "$#" -eq 0 ]; then echo "uso: con-lock.sh <cmd> [args...]" >&2; exit 2; fi
dir="$(cd "$(dirname "$0")" && pwd)"
lock="${CADENA_LOCK:-/workspace/.cadena.lock}"
log="${CADENA_LOG:-/workspace/cadena-log.tsv}"
node "$dir/lock.mjs" acquire --pid $$ --lock "$lock" --log "$log" --wait-min "${CADENA_WAIT_MIN:-20}" || exit 3
trap 'node "$dir/lock.mjs" release --pid $$ --lock "$lock" --log "$log" >&2' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"$@"
