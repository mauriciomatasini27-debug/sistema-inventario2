#!/usr/bin/env bash
# Run OpenCode prompts against ONE shared server to avoid "database is locked".
#   .opencode/pstack-run.sh "prompt" [extra opencode run args...]
# Starts `opencode serve` on 127.0.0.1:4096 if not running, then `opencode run --attach`.
set -euo pipefail
OC=${OPENCODE_BIN:-$HOME/.local/bin/opencode}; PORT=${PSTACK_PORT:-4096}; URL=http://127.0.0.1:$PORT
cd "$(dirname "$0")/.."
mkdir -p "$PWD/.pstack-tmp"
export TMPDIR="$PWD/.pstack-tmp"
# A server started without GH_TOKEN leaves every session's `gh` unauthenticated
# (why/blast-radius need `gh pr view`). Restart it if this shell has the token and it doesn't.
spid=$(pgrep -f "opencode serve .*--port $PORT" | head -1 || true)
if [ -n "${GH_TOKEN:-}" ] && [ -n "$spid" ] && ! tr '\0' '\n' < /proc/$spid/environ 2>/dev/null | grep -q '^GH_TOKEN='; then
  echo "pstack-run: restarting opencode serve to pick up GH_TOKEN" >&2
  kill "$spid"; for _ in $(seq 1 10); do curl -fsS --max-time 5 -o /dev/null "$URL/doc" 2>/dev/null || break; sleep 1; done
fi
if ! curl -fsS --max-time 5 -o /dev/null "$URL/doc" 2>/dev/null; then
  setsid nohup "$OC" serve --hostname 127.0.0.1 --port "$PORT" </dev/null >/tmp/opencode-serve.log 2>&1 &
  for _ in $(seq 1 30); do curl -fsS --max-time 5 -o /dev/null "$URL/doc" 2>/dev/null && break; sleep 1; done
  curl -fsS --max-time 5 -o /dev/null "$URL/doc" 2>/dev/null || { echo "opencode serve did not start, see /tmp/opencode-serve.log" >&2; exit 1; }
  # Known issue (OpenCode 1.19.0): the first attach after a cold start can hang. Burn it on a throwaway warm-up.
  timeout 45 "$OC" run --attach "$URL" --dir "$PWD" "Reply OK" </dev/null >/dev/null 2>&1 || true
fi
[ $# -ge 1 ] || { echo "usage: $0 \"prompt\" [opencode run args]" >&2; exit 2; }
p=$1; shift
# Fallback de modelo: si la sesión falla por cuota o rate limit, reintenta con el
# siguiente modelo gratis de Zen. Orden: -m pedido (o el default), luego
# PSTACK_FALLBACK_MODELS. Un intento colgado corta a PSTACK_SESSION_TIMEOUT s (default 700). Cada sesión arranca de nuevo con el mismo prompt.
pedido=""; args=()
while [ $# -gt 0 ]; do
  case "$1" in -m|--model) pedido=$2; shift 2 ;; *) args+=("$1"); shift ;; esac
done
FALLBACK=${PSTACK_FALLBACK_MODELS:-"opencode/big-pickle opencode/space-bunny-free opencode/longcat-2.5-preview-free"}
modelos=("${pedido:-opencode/muse-spark-1.3-contributor-free}")
for m in $FALLBACK; do [ "$m" = "${modelos[0]}" ] || modelos+=("$m"); done
out=$(mktemp); trap 'rm -f "$out"' EXIT
for m in "${modelos[@]}"; do
  echo "pstack-run: model=$m" >&2
  set +e
  timeout "${PSTACK_SESSION_TIMEOUT:-700}" "$OC" run --attach "$URL" --dir "$PWD" -m "$m" "${args[@]}" "$p" </dev/null >"$out" 2>&1
  rc=$?
  set -e
  # Por qué solo eventos de error: el texto de la sesión (código, tests) puede
  # contener "quota" o "429" y no es un fallo del modelo.
  if [ $rc -eq 0 ] && ! grep -E '^\{"type":"error"' "$out" | grep -qiE 'rate.?limit|quota|insufficient|too many requests|429|exhausted' && ! { grep -q '"type":"error"' "$out" && ! grep -q '"type":"text"' "$out"; }; then
    cat "$out"; echo "pstack-run: done model=$m" >&2; exit 0
  fi
  echo "pstack-run: model=$m failed (rc=$rc), trying next" >&2
done
cat "$out"; exit 1
