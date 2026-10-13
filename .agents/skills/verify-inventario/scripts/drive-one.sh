#!/usr/bin/env bash
# Run one mapped spec on mobile-360. Requires `npm run dev` already answering :4321.
set -u
CASE="${1:-venta}"
case "$CASE" in
  venta) SPEC="tests/e2e/venta.spec.ts" ;;
  landing) SPEC="tests/e2e/landing.spec.ts" ;;
  *) echo "usage: drive-one.sh <venta|landing>" >&2; exit 2 ;;
esac
./.agents/skills/verify-inventario/scripts/doctor.sh || exit 1
npx playwright test "$SPEC" --project=mobile-360
echo "artifacts: .agents/skills/verify-inventario/artifacts/$CASE/ test-results/"
