---
id: ADR-0085
tipo: adr
estado: propuesto
modulos: []
depende_de: [ADR-0084, PRD-PS-01]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0085 - Test de conformidad del cableado pstack

Estado: propuesto. Fecha: 2026-10-15. Fuentes: `tests/pstack-wiring.test.ts`, `opencode.json`, `.opencode/pstack-models.md`, PRD `diseno/PRD-PS-01-pstack-opencode.md`.

## Decisión

`tests/pstack-wiring.test.ts` fija el contrato entre `opencode.json` y el sheet. Exige el puntero en `instructions`, los 4 agentes (`pstack-worker`, `pstack-judge`, `poteto-agent`, `comment-sicko`) con modo `subagent` y modelo no vacío, cero filas del sheet mapeadas a `inherit-parent` o `auto`, y el runner `.opencode/pstack-run.sh` presente.

## Por qué

El cableado vive en dos archivos que cambian por separado. Sin test un edit rompe el puntero o mete un alias y nadie lo nota hasta el smoke. El test usa `arrayContaining` en vez de igualdad total para no frenar evolución de `opencode.json`.

## Qué cambia

`tests/pstack-wiring.test.ts` corre en CI con `npm test`. Verde exige base conforme. Rojo con exit 1 exige fixture rota o regresión real. La variable `PSTACK_TEST_ROOT` permite correrlo contra espejos sin tocar el checkout. Los checks toman un root y hay fixtures rotas en proceso (sin puntero, rol a `inherit-parent`, rol a `auto`, sin `comment-sicko`) más un hijo con `PSTACK_TEST_ROOT` roto que debe salir distinto de cero. El `auto` de `compaction` no cuenta: el veto vale para roles del sheet y modelos de agentes.

## Alternativa descartada

Igualdad total sobre `opencode.json` entero. Se descarta porque cada clave nueva ajena a pstack rompería el test sin defecto real.

## Pendientes

PS-S4 (panel mínimo: probe read-only por rol con receipts `status complete` y output no vacío). PS-S5 (rúbrica ADR-0084 sobre receipts: efectivo o no efectivo). Los receipts de modelo (evidencia de qué modelo corrió cada agente).
