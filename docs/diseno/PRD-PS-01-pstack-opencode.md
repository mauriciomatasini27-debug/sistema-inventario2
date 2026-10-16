---
id: PRD-PS-01
tipo: prd
estado: propuesto
modulos: [caja]
depende_de: [ADR-0084]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# PRD-PS-01 - Pstack efectivo en opencode

Fuente: auditoria 2026-10-15 sobre `opencode.json` (agents `poteto-agent`, `comment-sicko`, `pstack-worker`, `pstack-judge`), `.opencode/pstack-models.md` (roles a agentes nombrados), `.opencode/pstack-opencode.md` y `.opencode/pstack-run.sh` en `main`. Gap: hay cableado sin spec de efectividad ni test de conformidad. El wiring ya existe medido hoy.

Data shape: `PstackSheet = { path, roles: RoleDescriptor[] }` con `descriptor` en subagente nombrado (`pstack-worker`, `pstack-judge`, `poteto-agent`, `comment-sicko`). `ProbeReceipt = { provider, model, effort, status, modelVerified, outputBytes }`. La hoja es la unica fuente de verdad. La entrada `instructions` es solo su puntero.

## Epica PS-E1. Diagnostico base

- PS-S1. Estado base. AC: Given `main` When leo `opencode.json` y `.opencode` Then consta `instructions` con el sheet, 4 agentes pstack y runner `pstack-run.sh`. Depende de: nada.

## Epica PS-E2. Conformidad cableada

- PS-S2. Test de conformidad. AC: Given base `main` When corro `tests/pstack-wiring.test.ts` Then pasa en verde con puntero al sheet y roles a worker y judge sin `inherit-parent`. Depende de: PS-S1.
- PS-S3. Sensibilidad al defecto. AC: Given fixture sin puntero o con `inherit-parent` When corro el test Then falla en rojo con exit distinto de cero. Depende de: PS-S2.

## Epica PS-E3. Smoke y veredicto

- PS-S4. Panel minimo. AC: Given hoja con agentes nombrados When lanzo un probe read-only por rol con `prompt`, `output` y `receipt` unicos Then cada receipt trae `status complete` y `output` no vacio. Depende de: PS-S3.
- PS-S5. Rubrica. AC: Given receipts del smoke When aplico ADR-0084 Then el veredicto es efectivo o no efectivo sin grises. Depende de: PS-S4.

## Prompt organico para el smoke

Pedir al candidato una tarea real de repo. Ejemplo. Revisa `src/pages/api/cash/balance.ts` y explica de donde sale `fuente`. No mencionar pstack ni rubrica.

## Estrategia prueba

| Tipo | Caso | Resultado |
|---|---|---|
| Config | puntero mas agentes | `instructions` trae el sheet y `agent` declara worker y judge |
| Contrato | `tests/pstack-wiring.test.ts` en base | verde 2 pasados |
| Defecto | fixture sin puntero o con alias | rojo con exit 1 |
| Corte | smoke mixto | receipts completos y outputs no vacios |
| Regresion | rerun sin cambios | hoja y puntero con bytes identicos |
