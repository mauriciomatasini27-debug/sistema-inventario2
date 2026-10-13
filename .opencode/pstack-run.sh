#!/usr/bin/env bash
# Run OpenCode prompts against ONE shared server to avoid "database is locked".
#   .opencode/pstack-run.sh "prompt" [extra opencode run args...]
# Starts `opencode serve` on 127.0.0.1:4096 if not running, then `opencode run --attach`.
set -euo pipefail
OC=${OPENCODE_BIN:-$HOME/.local/bin/opencode}; PORT=${PSTACK_PORT:-4096}; URL=http://127.0.0.1:$PORT
cd "$(dirname "$0")/.."
if ! curl -fsS -o /dev/null "$URL/doc" 2>/dev/null; then
  setsid nohup "$OC" serve --hostname 127.0.0.1 --port "$PORT" </dev/null >/tmp/opencode-serve.log 2>&1 &
  for _ in $(seq 1 30); do curl -fsS -o /dev/null "$URL/doc" 2>/dev/null && break; sleep 1; done
fi
p=$1; shift
exec "$OC" run --attach "$URL" --dir "$PWD" "$@" "$p" </dev/null
