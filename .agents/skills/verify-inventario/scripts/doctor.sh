#!/usr/bin/env bash
# Read-only health check. No servers started, no state mutated.
set -u
BASE="${BASE_URL:-http://localhost:4321}"
fail() { echo "DOCTOR FAIL: $1" >&2; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/venta" || true)
[ "$code" = "200" ] || fail "/venta http=$code (start: npm run dev)"
html=$(curl -s "$BASE/venta")
for id in sku cobrar sync estado balance; do
  echo "$html" | grep -q "id=\"$id\"" || fail "/venta missing #$id"
done
curl -s "$BASE/api/auth/sesion-actual" | grep -q logueado || fail "/api/auth/sesion-actual unreachable"
if [ -n "${ARCA_CUIT_PROVEEDOR:-}" ] || [ -n "${ARCA_CERT_PEM:-}" ] || [ -n "${ARCA_KEY_PEM:-}" ]; then
  fail "ARCA_* set; unset them to use homo-fake"
fi
echo "DOCTOR OK: $BASE (/venta + sesion-actual, fake mode)"
