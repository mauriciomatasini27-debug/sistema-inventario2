---
id: PLAN-COM-01-D
tipo: plan
estado: propuesto
modulos: [caja]
depende_de: [PLAN-COM-01, ADR-0064]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Borrador local de los tres issues de deuda técnica del módulo caja; todavía no publicados en GitHub.
---
# PLAN-COM-01-D — Borrador de issues: deuda en `src/modules/cash/`

Borrador local. Fecha: 2026-11-21. No publicado: ADR-0064 y PRD-COM-01 (COM-S7) exigen issues reales antes de activar el lint de marcadores temporales, así que ese paso sigue pendiente.

Patrón común: un marcador temporal ("Slice-0", "P1", "no agrega migración") explicaba un atajo y el comentario se copiaba junto con el código. Los tres se borraron en este PR; la deuda queda registrada acá.

## Issue 1 — Auth en la ruta de movimientos de caja

- **Origen:** `src/modules/cash/registro_movimiento.ts:59` (comentario eliminado: *"Slice-0 sin auth en esta ruta; el permiso vive en el núcleo"*).
- **Hecho verificado:** `src/pages/api/cash/movements.ts` no recibe rol/actor y `reglasDominio` rechaza sueldos y retiros sin comprobar quién llama.
- **Arreglo propuesto:** resolver sesión y membership en la ruta, pasar `rol` y `actor` al repositorio, y no dejar el permiso solo en el núcleo.
- **Talla:** M.

## Issue 2 — Filtro por `fecha_jornada` en el historial

- **Origen:** `src/modules/cash/historial.ts:40-41` (comentario eliminado: marcador `P1`).
- **Hecho verificado:** `StoredMovement` no guarda fecha; agregarla toca `POST /movements` y la sync offline.
- **Arreglo propuesto:** agregar el campo de ocurrencia al contrato de movimiento y propagarlo por la ruta y el outbox; recién entonces exponer el filtro.
- **Talla:** L.

## Issue 3 — Auditoría de ubicaciones sin tabla

- **Origen:** `src/modules/cash/reversion.ts:33-37` (comentario eliminado: *"Esta talla no agrega migración nueva para auditoría"*).
- **Hecho verificado:** la asignación de ubicación escribe la lista de auditoría en memoria y no deja `stock_movements`.
- **Arreglo propuesto:** migrar `AuditoriaUbicacion` a una tabla con `tenant_id`, o reutilizar la tabla de auditoría existente si la hay; borrar la lista en memoria.
- **Talla:** M. Requiere aprobación de Mauri para la migración.
