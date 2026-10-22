# Venta offline + sync

/venta lets a counter clerk scan a SKU, charge it, survive a network cut as a queued provisorio ticket, and retry sync without duplicating the sale.

## Sub-features

- `venta-cobro` charges online and shows a definitive `T-` ticket plus balanced `#balance`.
- `venta-offline` queues `provisorio <device>-<seq>` in `localStorage slice0-outbox:<tenant>` (legada global solo sin login) when offline. P10-14.
- `venta-sync` retries with the same `op_id` and reports `sync intentado (1)` without duplicating.

## How to get to it (user POV)

- Open `/venta` (also linked `Ventas` from `/panel`).
- Fill SKU/cantidad/medio, choose `Cobrar`, then `Reintentar sync` after a cut.

## Driving it with Playwright

Preconditions:

- Doctor OK at `http://localhost:4321`; `/venta` shows `#sku #cobrar #sync #estado`.
- `localStorage slice0-outbox:<tenant>` starts as `[]`; la legada `slice0-outbox` se drena en `#sync` y se borra al vaciarse.

- **Cobro feliz.** Go `/venta`, fill `#sku=demo-sku-1`, `#qty=1`, select `#medio=Efectivo`, click `#cobrar`. `#estado` contains `201` and `T-`; `#balance` is not `Balance: —`.
- **Corte offline.** Reload `/venta`, `context.setOffline(true)`, fill `#sku`, click `#cobrar`. `#estado` contains `provisorio`; `slice0-outbox:<tenant>` has 1 entry with `op_id`.
- **Sync sin duplicar.** `context.setOffline(false)`, click `#sync`. `#estado` contains `sync intentado (1)`; replay uses same `Idempotency-Key`.
- **Proof.** Screenshot + `#estado`/`#balance` text to `artifacts/venta-offline-sync/`.

## Gotchas

- `#precio` defaults `15000` centavos; changing it changes `#balance` expectations.
- `seq` comes from `localStorage slice0-seq:<tenant>` (hereda el valor legado al primer arranque); stale values change the provisorio label.
- `sync` clears the outbox even on failed pushes; assert the `sync intentado (1)` text, not queue length after.
- `fullyParallel: false`, `retries: 0` — order matters, no auto-retry.
