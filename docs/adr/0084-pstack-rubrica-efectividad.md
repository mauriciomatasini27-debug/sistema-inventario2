---
id: ADR-0084
tipo: adr
estado: propuesto
modulos: []
depende_de: [PRD-PS-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Pstack es efectivo en opencode solo si pasa esta rubrica de 5 criterios. Cada criterio se mide sobre receipts
  y archivos. Sin excepciones.
---
# ADR-0084 - Rubrica de efectividad pstack en opencode

Estado: propuesto. Fecha: 2026-10-15. Fuentes: `playbooks/eval.md`, `references/provider-dispatch.md` seccion Completion, `.opencode/pstack-models.md`, PRD `diseno/PRD-PS-01-pstack-opencode.md`.

## Decisión

Pstack es efectivo en opencode solo si pasa esta rubrica de 5 criterios. Cada criterio se mide sobre receipts y archivos. Sin excepciones.

## Rubrica

1. Cableado. `opencode.json` trae en `instructions` al sheet y `agent` declara `pstack-worker` y `pstack-judge` en modo subagente.
2. Roles nombrados. El sheet mapea cada rol a `pstack-worker` o `pstack-judge`, con ruteo a `poteto-agent` y `comment-sicko`.
3. Sin alias. Ninguna fila usa `inherit-parent` o `auto`. Los alias reducen diversidad del panel y el sheet nombrado la exige.
4. Modelo verificado. Cada receipt trae `modelVerified true` con `modelEvidence provider-report`, salvo Codex con `reportedModel null` y `modelEvidence pinned-argv` que tambien vale.
5. Salida util. Cada `output` reservado existe y trae bytes no vacios. Un rerun sin cambios deja hoja y puntero con bytes identicos.

## Por qué

Los 5 puntos separan config de ruta y ruta de resultado. Sin receipts no hay prueba. Sin salidas no hay trabajo. Sin rerun identico no hay estabilidad.

## Qué cambia

El veredicto vive con los receipts del smoke. Se guarda fecha, host, descriptores, elapsed, tokens y costo cuando el CLI lo expone. Un dropout con receipt se registra y no se sustituye por otro proveedor en silencio.

## Alternativa descartada

Hoja solo con `inherit-parent` en todos los roles. Se descarta porque pierde diversidad de familias y contradice el sheet nombrado ya cableado en `.opencode`.

## Pendientes

Definir juez ciego por etiqueta sanitizada para el smoke. Guardar sintesis con acuerdo o desacuerdo contra el juez.
