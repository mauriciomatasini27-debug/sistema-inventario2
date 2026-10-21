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
# Modelos por skill (ADR-0109): .opencode/modelos.mjs resuelve el modelo de cada
# agente pstack; si el asignado salió de Zen o está marcado caído, avisa por
# stderr + .opencode/modelos-caidos.log y el server arranca con el reemplazo.
RES="$PWD/.opencode/modelos.mjs"
OV=""; command -v node >/dev/null && OV=$(node "$RES" overrides) || OV=""
[ -n "$OV" ] && export OPENCODE_CONFIG_CONTENT="$OV"
reiniciar=""
if [ -n "${GH_TOKEN:-}" ] && [ -n "$spid" ] && ! tr '\0' '\n' < /proc/$spid/environ 2>/dev/null | grep -q '^GH_TOKEN='; then
  reiniciar="to pick up GH_TOKEN"
fi
if [ -n "$OV" ] && [ -n "$spid" ] && ! tr '\0' '\n' < /proc/$spid/environ 2>/dev/null | grep -qxF "OPENCODE_CONFIG_CONTENT=$OV"; then
  reiniciar="para cambiar modelos de agentes"
fi
if [ -n "$reiniciar" ]; then
  echo "pstack-run: restarting opencode serve $reiniciar" >&2
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
pedido=""; skill=""; args=()
while [ $# -gt 0 ]; do
  case "$1" in -m|--model) pedido=$2; shift 2 ;; --skill) skill=$2; shift 2 ;; *) args+=("$1"); shift ;; esac
done
# Sin -m ni PSTACK_FALLBACK_MODELS, la cadena sale del perfil de la skill
# (--skill o el /skill con que empieza el prompt; default poteto-mode).
[ -n "$skill" ] || skill=$(printf '%s' "$p" | sed -nE '1s|^[[:space:]]*/([a-z0-9-]+).*|\1|p')
lista=""
if [ -z "$pedido" ] && [ -z "${PSTACK_FALLBACK_MODELS:-}" ] && command -v node >/dev/null; then
  lista=$(node "$RES" lista "${skill:-poteto-mode}") || lista=""
fi
if [ -n "$lista" ]; then
  read -ra modelos <<<"$lista"
else
  FALLBACK=${PSTACK_FALLBACK_MODELS:-"opencode/longcat-2.5-preview-free opencode/glm-5.3-flash-free opencode/big-pickle"}
  modelos=("${pedido:-opencode/deepseek-v4.1-flash-free}")
  for m in $FALLBACK; do [ "$m" = "${modelos[0]}" ] || modelos+=("$m"); done
fi
out=$(mktemp); trap 'rm -f "$out"' EXIT
# Por qué: un intento que falla (timeout, cuota) puede dejar el árbol a medio
# editar; relanzar otro modelo encima mezcla dos sesiones. Si el árbol cambió
# respecto del inicio, se corta con exit 4 y decide el orquestador.
estado_arbol() { git -C "$PWD" status --porcelain --untracked-files=all -- . ':(exclude).pstack-tmp' 2>/dev/null || true; }
inicial=$(estado_arbol)
# Un Error: del proveedor cuenta solo si está al final de la salida: es la
# última línea no vacía, o lo único que sigue es el JSON de ese mismo error.
# Si aparece en el medio (por ejemplo, el texto de un log que leyó una
# herramienta) y después hay respuesta normal, la sesión terminó bien.
# Imprime "upstream" o "json" cuando hay error del proveedor: Upstream se
# reintenta sin marcar caído; el resto de los errores marca caído.
clase_error_proveedor() {
  awk '
    { linea[NR] = $0 }
    END {
      ultima = 0
      for (i = NR; i >= 1; i--) if (linea[i] ~ /[^[:space:]]/) { ultima = i; break }
      if (ultima == 0) exit 1
      error = 0
      for (i = ultima; i >= 1; i--) if (linea[i] ~ /^Error:[ \t]*(Upstream|\{)/) { error = i; break }
      if (error == 0) exit 1
      if (linea[error] ~ /^Error:[ \t]*Upstream/) {
        if (error != ultima) exit 1
        print "upstream"
        exit 0
      }
      texto = linea[error]
      sub(/^Error:[ \t]*/, "", texto)
      for (i = error + 1; i <= ultima; i++) texto = texto "\n" linea[i]
      n = length(texto); i = 1
      while (i <= n && substr(texto, i, 1) ~ /[[:space:]]/) i++
      if (substr(texto, i, 1) != "{") exit 1
      hondo = 0; comilla = 0; escape = 0; cerrado = 0
      for (; i <= n; i++) {
        c = substr(texto, i, 1)
        if (comilla) {
          if (escape) escape = 0
          else if (c == "\\") escape = 1
          else if (c == "\"") comilla = 0
          continue
        }
        if (c == "\"") comilla = 1
        else if (c == "{") {
          if (cerrado) exit 1
          hondo++
        } else if (c == "}") {
          hondo--
          if (hondo < 0) exit 1
          if (hondo == 0) cerrado = 1
        } else if (hondo == 0 && c !~ /[[:space:]]/) exit 1
      }
      if (!(cerrado && hondo == 0 && !comilla)) exit 1
      print "json"
      exit 0
    }
  '
}
# Un intento deja rc y clase en variables globales. clase vacía = la sesión no
# terminó con un Error: del proveedor.
intentar() {
  echo "pstack-run: model=$1" >&2
  set +e
  timeout "${PSTACK_SESSION_TIMEOUT:-700}" "$OC" run --attach "$URL" --dir "$PWD" -m "$1" "${args[@]}" "$p" </dev/null >"$out" 2>&1
  rc=$?
  set -e
  clase=""
  if [ $rc -eq 0 ]; then
    sin_ansi=$(sed -E $'s/\x1b\\[[0-9;?]*[A-Za-z]//g' "$out")
    clase=$(printf '%s\n' "$sin_ansi" | clase_error_proveedor) || clase=""
    if [ -n "$clase" ]; then rc=5; fi
  fi
}
# Por qué solo eventos de error: el texto de la sesión (código, tests) puede
# contener "quota" o "429" y no es un fallo del modelo.
exito() {
  [ $rc -eq 0 ] || return 1
  if grep -E '^\{"type":"error"' "$out" | grep -qiE 'rate.?limit|quota|insufficient|too many requests|429|exhausted'; then return 1; fi
  if grep -qE '^\{"type":"error"' "$out" && ! grep -qE '^\{"type":"text"' "$out"; then return 1; fi
  return 0
}
cortar_si_arbol_cambio() {
  if [ "$(estado_arbol)" != "$inicial" ]; then
    cat "$out"; echo "pstack-run: model=$1 failed (rc=$rc) y el árbol tiene cambios: no relanzo con otro modelo (exit 4, decide el orquestador)" >&2; exit 4
  fi
  return 0
}
reintentos_upstream=${PSTACK_UPSTREAM_REINTENTOS:-2}
espera_upstream=${PSTACK_UPSTREAM_ESPERA:-5}
for m in "${modelos[@]}"; do
  intentar "$m"
  if exito; then
    cat "$out"; echo "pstack-run: done model=$m" >&2; exit 0
  fi
  if [ "$clase" = "upstream" ]; then
    n=0
    espera=$espera_upstream
    while [ "$n" -lt "$reintentos_upstream" ]; do
      cortar_si_arbol_cambio "$m"
      n=$((n + 1))
      echo "pstack-run: model=$m Error: Upstream (rc=$rc), reintento $n/$reintentos_upstream en ${espera}s" >&2
      [ "$espera" -gt 0 ] && sleep "$espera"
      espera=$((espera * 2))
      intentar "$m"
      if exito; then
        cat "$out"; echo "pstack-run: done model=$m" >&2; exit 0
      fi
      [ "$clase" = "upstream" ] || break
    done
    if [ "$clase" = "upstream" ]; then
      cortar_si_arbol_cambio "$m"
      echo "pstack-run: model=$m agotó $reintentos_upstream reintentos por Error: Upstream; paso al siguiente SIN marcarlo caído" >&2
      echo "⚠ pstack-run: $m dio Error: Upstream tras $reintentos_upstream reintentos; sigo con el siguiente modelo free (no lo marco caído)" >&2
      continue
    fi
  fi
  command -v node >/dev/null && node "$RES" caido "$m" "rc=$rc skill=${skill:-poteto-mode}" || true
  cortar_si_arbol_cambio "$m"
  echo "pstack-run: model=$m failed (rc=$rc), trying next" >&2
  echo "⚠ pstack-run: $m falló (rc=$rc); sigo con el siguiente modelo free. Ver .opencode/modelos-caidos.log" >&2
done
cat "$out"; exit 1
