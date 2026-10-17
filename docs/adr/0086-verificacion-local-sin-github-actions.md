---
id: ADR-0086
tipo: adr
estado: aceptado
modulos: []
depende_de: [ADR-0065]
reemplaza: []
reemplazado_por: ""
modifica: [PRD-ARQ-01]
modificado_por: []
resumen: GitHub Actions deja de ser el gate de merge. La verificación pasa a `npm run verify` en la caja, que corre los pasos de ci.yml y regenera ROADMAP/INDEX.
---
# ADR-0086 - Verificación local en la caja y GitHub Actions dormido

Estado: aceptado. Fecha: 2026-10-16. Fuentes: `scripts/verify.mjs`, `scripts/verify-lib.mjs`, `.github/workflows/*`, `scripts/cadena/puede-mergear-lib.mjs`.

## Decisión

El gate de merge es `npm run verify`, un script local que corre en la caja los mismos pasos de `ci.yml` (typecheck, trinquetes de arquitectura, tests con Postgres, check de skips, build) y después regenera `docs/ROADMAP.md` y `docs/INDEX.md` y corre `docs:check`. Los cuatro workflows (ci, roadmap, roadmap-guard, CodeQL) quedan en `workflow_dispatch`: no se disparan solos.

## Por qué

GitHub Actions dejó de arrancar por facturación ("recent account payments have failed") y Mauri no va a pagar. Los minutos gratis son 2000 por mes y self-hosted es gratis, pero el bloqueo por pago alcanza también a los jobs hospedados. El merge nunca dependió de Actions: `puede-mergear.mjs` mira título, cuerpo y migraciones, y el repo no tiene branch protection. Con `verify` el gate vive en la caja, que ya hospeda la cadena y Postgres local (`scripts/pg-local.sh`), sin minutos ni infra extra.

## Qué cambia

- `scripts/verify.mjs` corre los pasos de `ci.yml`; `--docs-only` corre solo la parte de docs.
- `docs/ROADMAP.md` y `docs/INDEX.md` se regeneran con `verify` y viajan en el PR, no en `main` por un workflow.
- `AGENTS.md` cambia el gate de "checks ci/analyze/guard verdes" a "`npm run verify` verde".
- Un arch-test (`tests/arch/workflows-dormant.test.ts`) fija que ningún workflow tenga disparadores automáticos.

## Pendientes

- Retirar `guardaPR` y `roadmap-guard.yml` cuando el modelo local esté asentado; hoy `roadmap --check` cubre su intención.
- CodeQL no corre; se compensa con `npm audit` y alertas de Dependabot.
- Si se rehabilita Actions, volver a `ubuntu-latest` o registrar un runner self-hosted.
