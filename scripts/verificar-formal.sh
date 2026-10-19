#!/usr/bin/env bash
set -euo pipefail

TLA_VERSION="1.7.4"
TLA_URL="https://github.com/tlaplus/tlaplus/releases/download/v${TLA_VERSION}/tla2tools.jar"
TLA_SHA256="936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88"
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/sistema-inventario/tla"
JAR="$CACHE_DIR/tla2tools-${TLA_VERSION}.jar"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR_TLA="$RAIZ/verificacion/tla"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

mensaje_sin_java="verificar:formal: falta Java 17+ (en Ubuntu/WSL: sudo apt install -y openjdk-17-jre-headless). No se verificó nada."
mensaje_java_viejo="verificar:formal: Java %s es menor a 17 (se necesita 17+). En Ubuntu/WSL: sudo apt install -y openjdk-17-jre-headless. No se verificó nada."
mensaje_sin_descarga="verificar:formal: no pude descargar tla2tools.jar ${TLA_VERSION} (sin red, sin curl/wget o URL caída). No se verificó nada."
mensaje_sin_sha="verificar:formal: falta sha256sum o shasum para verificar el jar. No se verificó nada."
mensaje_sha_malo="verificar:formal: el SHA256 de tla2tools.jar ${TLA_VERSION} no coincide (se esperaba ${TLA_SHA256}). Borré la descarga."

java_bin() {
  if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    printf '%s\n' "$JAVA_HOME/bin/java"
    return 0
  fi
  command -v java 2>/dev/null || true
}

version_mayor() {
  local linea raw mayor
  linea="$("$1" -version 2>&1 | head -n 1)"
  raw="$(printf '%s\n' "$linea" | sed -n 's/.*version "\([^"]*\)".*/\1/p')"
  if [ -z "$raw" ]; then
    printf '0\n'
    return 0
  fi
  mayor="${raw%%.*}"
  if [ "$mayor" = "1" ]; then
    mayor="$(printf '%s\n' "$raw" | cut -d. -f2)"
  fi
  printf '%s\n' "$mayor"
}

sha256_de() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    return 1
  fi
}

descargar_jar() {
  local destino="$1" tmp="$1.tmp"
  rm -f "$tmp"
  mkdir -p "$CACHE_DIR"
  if command -v curl >/dev/null 2>&1; then
    if ! curl -fsSL "$TLA_URL" -o "$tmp"; then
      rm -f "$tmp"
      printf '%s\n' "$mensaje_sin_descarga"
      return 2
    fi
  elif command -v wget >/dev/null 2>&1; then
    if ! wget -q "$TLA_URL" -O "$tmp"; then
      rm -f "$tmp"
      printf '%s\n' "$mensaje_sin_descarga"
      return 2
    fi
  else
    printf '%s\n' "$mensaje_sin_descarga"
    return 2
  fi
  local obtenido
  if ! obtenido="$(sha256_de "$tmp")"; then
    rm -f "$tmp"
    printf '%s\n' "$mensaje_sin_sha"
    return 3
  fi
  if [ "$obtenido" != "$TLA_SHA256" ]; then
    rm -f "$tmp"
    printf '%s\n' "$mensaje_sha_malo"
    return 1
  fi
  mv -f "$tmp" "$destino"
}

preparar_jar() {
  if [ -f "$JAR" ]; then
    local actual
    if actual="$(sha256_de "$JAR")" && [ "$actual" = "$TLA_SHA256" ]; then
      return 0
    fi
    rm -f "$JAR"
  fi
  descargar_jar "$JAR"
}

correr_tlc() {
  local cfg="$1" salida="$2" metadir
  metadir="$(mktemp -d "$TMP_ROOT/meta.XXXXXX")"
  "$JAVA" -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
    -workers 1 -nowarning -cleanup -metadir "$metadir" \
    -config "$cfg" VentaSync.tla >"$salida" 2>&1 || true
}

estados_distintos() {
  sed -n 's/.*distinct states found,.*/&/p' "$1" | sed -n 's/.* \([0-9][0-9]*\) distinct states found.*/\1/p' | tail -n 1
}

estados_traza() {
  grep -cE '^State [0-9]+: ' "$1" || true
}

ultimas() {
  tail -n 40 "$1"
}

JAVA="$(java_bin)"
if [ -z "$JAVA" ]; then
  printf '%s\n' "$mensaje_sin_java"
  exit 0
fi

MAYOR="$(version_mayor "$JAVA")"
if [ -z "$MAYOR" ] || [ "$MAYOR" -lt 17 ]; then
  printf "$mensaje_java_viejo\n" "${MAYOR:-desconocida}"
  exit 0
fi

# Sin red o sin herramientas: aviso y exit 0. Checksum distinto: exit 1.
if preparar_jar; then
  :
else
  rc=$?
  if [ "$rc" -eq 1 ]; then exit 1; fi
  exit 0
fi

cd "$DIR_TLA"

if [ "${1:-}" = "--traza" ]; then
  cfg="${2:-}"
  if [ -z "$cfg" ]; then
    printf 'verificar:formal: uso: bash scripts/verificar-formal.sh --traza <cfg>\n' >&2
    exit 2
  fi
  cfg="${cfg%.cfg}"
  if [ ! -f "$cfg.cfg" ]; then
    printf 'verificar:formal: no existe %s.cfg\n' "$cfg" >&2
    exit 2
  fi
  salida="$TMP_ROOT/traza-$cfg.txt"
  correr_tlc "$cfg.cfg" "$salida"
  printf '== %s ==\n' "$cfg"
  cat "$salida"
  exit 0
fi

fallo=0

correr_ok() {
  local cfg="$1"
  local leyes="$2"
  local salida
  salida="$TMP_ROOT/$cfg.txt"
  correr_tlc "$cfg.cfg" "$salida"
  if grep -q "No error has been found" "$salida"; then
    printf 'ok  %s: se cumplen %s (%s estados distintos)\n' "$cfg" "$leyes" "$(estados_distintos "$salida")"
  else
    printf 'FALLA %s: se esperaba "No error has been found" y TLC dijo otra cosa\n' "$cfg"
    ultimas "$salida"
    fallo=1
  fi
}

correr_quiebre() {
  local cfg="$1"
  local ley="$2"
  local salida
  salida="$TMP_ROOT/$cfg.txt"
  correr_tlc "$cfg.cfg" "$salida"
  if grep -q "Invariant $ley is violated" "$salida"; then
    printf 'ok  %s: TLC encontró la violación esperada de %s (traza de %s estados)\n' "$cfg" "$ley" "$(estados_traza "$salida")"
  else
    printf 'FALLA %s: se esperaba "Invariant %s is violated" y TLC dijo otra cosa\n' "$cfg" "$ley"
    ultimas "$salida"
    fallo=1
  fi
}

correr_ok "venta-sync" "NoVentaPerdida, AlMasUnaFila, NoAtascada"
correr_quiebre "quiebre-limpia-todo" "NoVentaPerdida"
correr_quiebre "quiebre-sigue-tras-fallo" "NoAtascada"
correr_quiebre "quiebre-sin-pk" "AlMasUnaFila"

exit "$fallo"
