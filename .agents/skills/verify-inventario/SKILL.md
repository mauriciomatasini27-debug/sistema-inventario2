---
name: verify-inventario
description: "Drive the sistema-inventario Astro PWA (Playwright, :4321) to verify offline sale+sync, multi-tenant login/switch, and ARCA fiscal flows with the in-memory fake. Use when proving user-visible behavior end to end."
---

# Verify Inventario

Astro PWA (`output: server`, `@astrojs/node`) at `http://localhost:4321`.
Harness: Playwright (`playwright.config.ts`: `testDir tests/e2e`, single project
`mobile-360` = Pixel 5 360x800, `baseURL http://localhost:4321`, `webServer: undefined`).
Specs: `tests/e2e/venta.spec.ts` (cobro feliz + corte offline), `tests/e2e/landing.spec.ts`.

Env rule: placeholder names only (see `.env.example` keys). Never read, print, or
export values from `.env`. Fiscal: with no `ARCA_*` vars set the server uses
`crear_homo_fake()` in-memory (`src/modules/fiscal/homo-fake.ts`); do not set them.

## Launch

- `npm run dev` serves `:4321`. Config has no `webServer`, so start it yourself in
  the background, capture its PID to `/tmp/verify-inventario.pid`, wait until
  `curl -s -o /dev/null -w '%{http_code}' http://localhost:4321/venta` returns 200.
- Do not start a second instance if `:4321` already answers; refuse instead of
  double-driving shared state.
- Teardown: `kill $(cat /tmp/verify-inventario.pid)` then `rm` the pid file.

## Doctor

Run first whenever anything looks off:

```sh
.agents/skills/verify-inventario/scripts/doctor.sh
```

Read-only: port answers, `/venta` contains `#sku #cobrar #sync #estado #balance`,
`/api/auth/sesion-actual` answers JSON, confirms `ARCA_*` unset (fake mode).
Fails fast otherwise.

## Drive

```sh
.agents/skills/verify-inventario/scripts/drive-one.sh venta
npx playwright test tests/e2e/venta.spec.ts --project=mobile-360
npx playwright test --project=mobile-360
```

Recipe uses real handles only: `#sku #qty #precio #medio #cobrar #sync #estado #balance`;
routes `/venta /panel /`, APIs `/api/sales /api/sync/push /api/cash/balance
/api/fiscal/emitir /api/auth/sesion-actual /api/auth/login?prompt=select_account`.
Offline: `context.setOffline(true)` -> `provisorio <device>-<seq> encolado` in
`localStorage slice0-outbox` (`Idempotency-Key: op_id`); `setOffline(false)` + `#sync`
-> `sync intentado (1)` without duplicating (`same op_id`). See `features/` map for
per-feature steps.

## Evidence

Run `npm run evidencia` and paste its output verbatim (tsc / vitest / build
summary lines plus sha) into the report; never paraphrase counts.

Write under `.agents/skills/verify-inventario/artifacts/<feature>/`: Playwright
report + one screenshot + captured `#estado`/`#balance` text (and `doc_id`/`cae` for
fiscal). Prove the real path (click `#cobrar`/`#sync`, real `fetch`), action plus
resulting state plus side effect (`/api/cash/balance`, `/api/fiscal/history`).
Mocks only at the existing boundary: homo-fake (no `ARCA_*`).

## Cleanup

Kill only the PID you started; clear `slice0-outbox`/`slice0-seq` localStorage in
the driven context; remove `/tmp/verify-inventario.pid`. Never delete `artifacts/`.

## Helpers

- `scripts/doctor.sh` — read-only health check (see Doctor).
- `scripts/drive-one.sh <venta|landing>` — runs the matching spec file on
  `mobile-360` and echoes the artifact dir. Both are executable.

## Gotchas (verified 2026-10-13)

- `npm run dev` is currently broken for driving: `/venta` returns a JS module instead of HTML and `src/pages/index.astro` logs `Expected "}" but found ":"` (same on Node 20 and 22). Drive the production build instead:
  `npx astro build && HOST=127.0.0.1 PORT=4321 node dist/server/entry.mjs` (placeholder `CONTROL_DATABASE_URL`/`TENANT_DATABASE_URL`, no `ARCA_*`).
- On the build: both `venta.spec.ts` tests pass (cobro feliz, offline provisorio + sync without duplicate); `/api/fiscal/history` shows fake-CAE docs created by those sales.
- `landing.spec.ts` (3 tests) times out at 30s on the build; investigate before trusting it.
- Multi-tenant login needs real Google OAuth (`/api/auth/login`); without credentials only `sesion-actual -> {"logueado":false}` is checkable. Tenant switch cannot be driven end to end with placeholders.
