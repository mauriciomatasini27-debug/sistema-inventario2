---
id: PRD-ROAD-01
tipo: prd
estado: propuesto
modulos: []
depende_de: [ADR-0065, ADR-0073, ADR-0076]
reemplaza: []
reemplazado_por: ""
resumen: |
  Cada PR de implementación edita docs/ROADMAP.md para marcar su avance. Dos PRs abiertos a la vez tocan las
  mismas líneas (la cabecera de "Actualización" y las filas de la tabla), así que el segundo en fusionarse
  siempre choca y hay que mergear main a mano.
---
# PRD-ROAD-01 - Avances del roadmap sin conflictos entre PRs

Fuente: conflictos repetidos en `docs/ROADMAP.md` entre PRs concurrentes (merge `f93c70d`, "conflicto ROADMAP" entre #31 y #32). Uso en este sistema: proceso de desarrollo, sin código de producto. Restringido por ADR-0076, ADR-0065 y ADR-0073. Tipo proceso.

## Problema

Cada PR de implementación edita `docs/ROADMAP.md` para marcar su avance. Dos PRs abiertos a la vez tocan las mismas líneas (la cabecera de "Actualización" y las filas de la tabla), así que el segundo en fusionarse siempre choca y hay que mergear `main` a mano. Los agentes de OpenCode lo repiten porque la regla les pide actualizar el roadmap.

## Épica ROAD1-E1. Un archivo de avance por PR y una sección generada

Requisito ROAD1-R1: ningún PR de implementación edita `docs/ROADMAP.md`; el estado se arma desde archivos de avance que nunca chocan.

- Historia ROAD1-S1. Cada PR agrega `docs/roadmap/avances/<número-ADR>.md` con front-matter `item`, `estado`, `adr`, `prd`, `fecha` y una línea de texto. AC: Given un archivo sin `item` o con `fecha` que no es `AAAA-MM-DD` When corro `npm run roadmap` Then sale con código 1 y nombra el archivo. ADR: 0076. Talla S. Depende de: nada.
- Historia ROAD1-S2. `npm run roadmap` (`scripts/roadmap.mjs`) regenera la sección entre `<!-- roadmap:avances:inicio -->` y `<!-- roadmap:avances:fin -->` con una fila por archivo, ordenada por fecha descendente y ADR; el resto del archivo (estructura a mano) queda byte a byte igual. Si los marcadores faltan, los inserta antes de `## Decisiones registradas`. Es idempotente. `--check` no escribe y sale 1 si la sección está desactualizada. AC: Given dos corridas seguidas Then la segunda no cambia nada; Given un archivo nuevo When corro `--check` Then sale 1. ADR: 0076. Talla S. Depende de: ROAD1-S1.
- Historia ROAD1-S3. CI en PR: falla si el PR edita `docs/ROADMAP.md` y toca algo fuera de la herramienta del roadmap (`docs/ROADMAP.md`, `docs/roadmap/**`, `scripts/roadmap*.mjs`, `tests/roadmap*.test.ts`, `.github/workflows/roadmap*.yml`); falla si algún archivo de avance es inválido; falla si la sección generada de `main` (base del PR) está desactualizada. Un workflow en push a `main` corre `npm run roadmap` y, si cambió, commitea con `GITHUB_TOKEN` (`contents: write`). AC: Given un PR que toca `src/` y `docs/ROADMAP.md` Then el check falla; Given un PR solo de avance Then pasa. ADR: 0076. Talla S. Depende de: ROAD1-S2.
- Historia ROAD1-S4. Reglas de `.opencode/` y `AGENTS.md`: los agentes escriben un archivo de avance, nunca editan `docs/ROADMAP.md`. AC: Given las reglas Then mencionan `docs/roadmap/avances/` y prohíben editar el roadmap. ADR: 0076. Talla S. Depende de: nada.

## Dependencias externas

Ninguna. El commit automático usa `GITHUB_TOKEN` del workflow; el repo no tiene protección de rama.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Fallo | Avance inválido | falta `estado` | código 1, nombra el archivo |
| Feliz | Regenerar | dos avances | tabla con dos filas, resto igual |
| Borde | Sin marcadores | roadmap sin marcadores | los inserta antes de Decisiones |
| Regresión | Idempotencia | dos corridas | segunda sin cambios |
| Fallo | Guarda de PR | `src/x.ts` + `docs/ROADMAP.md` | falla |
| Feliz | Guarda de PR | solo `docs/roadmap/avances/0099.md` | pasa |
