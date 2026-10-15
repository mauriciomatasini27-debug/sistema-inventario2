# ADR-0085 - Test de conformidad del cableado pstack

Estado: propuesto. Fecha: 2026-10-15. Fuentes: `tests/pstack-wiring.test.ts`, `opencode.json`, `.opencode/pstack-models.md`, PRD `diseno/PRD-PS-01-pstack-opencode.md`.

## Decisión

`tests/pstack-wiring.test.ts` fija el contrato entre `opencode.json` y el sheet. Exige el puntero en `instructions`, los agentes `pstack-worker` y `pstack-judge` declarados, roles mapeados a esos agentes y cero filas con `inherit-parent`.

## Por qué

El cableado vive en dos archivos que cambian por separado. Sin test un edit rompe el puntero o mete un alias y nadie lo nota hasta el smoke. El test usa `arrayContaining` en vez de igualdad total para no frenar evolución de `opencode.json`.

## Qué cambia

`tests/pstack-wiring.test.ts` corre en CI con `npm test`. Verde exige base conforme. Rojo con exit 1 exige fixture rota o regresión real. La variable `PSTACK_TEST_ROOT` permite correrlo contra espejos sin tocar el checkout.

## Alternativa descartada

Igualdad total sobre `opencode.json` entero. Se descarta porque cada clave nueva ajena a pstack rompería el test sin defecto real.

## Pendientes

Ninguno. El test corre en verde sobre espejo de `main` y en rojo sobre fixture rota medido 2026-10-15.
