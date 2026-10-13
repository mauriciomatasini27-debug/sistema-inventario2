# Fiscal ARCA con fake

Emision fiscal authorizes a sale document and marks it `PRUEBA - SIN VALIDEZ FISCAL` when no `ARCA_*` vars are set (homo-fake, no network/certificate).

## Sub-features

- `fiscal-emitir` authorizes via `POST /api/fiscal/emitir` (`fiscal_estado: autorizado`, `cae`, `cbte_nro`).
- `fiscal-history` serves the doc from memory/DB via `GET /api/fiscal/history`.
- `fiscal-settings` configures CUIT via `POST /api/fiscal/settings` (valid `20-93333172-6`, `123` -> 422).
- `fiscal-retry` reports `pendiente`/`respuesta_incierta`/`difiere`/`ocupado` instead of duplicating.

## How to get to it (user POV)

- Sell in `/venta` (creates the fiscal doc), then emit with the doc id; check history.
- API-direct: `POST /api/fiscal/emitir {fiscal_document_id, cuit?}`, `GET /api/fiscal/history`.

## Driving it with Playwright

Preconditions:

- Doctor OK with `ARCA_*` unset (`crear_homo_fake` active); a known-good CUIT
  (`20933331726`, padrón fake `RI Homo SA`) or a `fiscal_settings` row.
- One authorized doc id from a `/venta` cobro or `POST /api/fiscal/settings`.

- **Emitir.** `POST /api/fiscal/emitir {fiscal_document_id, cuit:"20-93333172-6"}`. Expect 200, `fiscal_estado=autorizado`, 14-digit `cae`.
- **History.** `GET /api/fiscal/history`. Expect the doc with same `doc_id`/`cae`.
- **CUIT invalido.** Emit with `cuit:"123"` or no CUIT configured -> 422 (`sin cuit fiscal configurado` / validation).
- **Proof.** Emit response JSON + history excerpt to `artifacts/fiscal-arca-fake/`.

## Gotchas

- Setting any `ARCA_*` switches to the real `ArcaProvider` (WSAA/WSFE, needs cert/key); keep them unset.
- `cae` from fake is derived (`10000000000000+cbteHasta`, 14 digits) — assert shape, not a fixed value.
- `ultimo_autorizado` is per `(ptoVta, cbteTipo)`; cross-series numbers do not collide.
- Re-emit of an authorized doc -> 409 (`documento ya emitido`), not a second CAE.
