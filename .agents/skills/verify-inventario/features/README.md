# Inventario verification map

Source for driving the Astro PWA at `http://localhost:4321` with Playwright
project `mobile-360` (Pixel 5, 360x800). Read this index, then the matching file.

## Baseline preconditions

- `npm run dev` answering `:4321` (started by this run, PID in `/tmp/verify-inventario.pid`).
- `scripts/doctor.sh` reports OK (fake fiscal mode: no `ARCA_*` vars set).
- Placeholder env names only; never read or print `.env` values.
- Never drive a `:4321` instance you did not start.

## Driving conventions

- Literal selectors: `#sku #qty #precio #medio #cobrar #sync #estado #balance`.
- Offline via `context.setOffline(true/false)`; idempotency via `Idempotency-Key: op_id`.
- Prefer visible text assertions (`#estado` contains `201`/`T-`/`provisorio`/`sync intentado (1)`).
- Proof per feature goes to `artifacts/<id>/` and survives cleanup.

## Proof and skip reporting

- Capture action + resulting state + side effect (`#balance`, `/api/fiscal/history`).
- Screenshot + `#estado` text with each artifact; record feature ID and entry point.
- Report unreachable paths with command + unmet precondition; never mark a skip as verified.

## Features

- [Venta offline + sync](./venta-offline-sync.md) covers happy-path cobro and offline queue/retry.
- [Login y cambio multi-tenant](./login-tenant-switch.md) covers Google login and user/tenant switch.
- [Fiscal ARCA con fake](./fiscal-arca-fake.md) covers emitir/history against homo-fake.
