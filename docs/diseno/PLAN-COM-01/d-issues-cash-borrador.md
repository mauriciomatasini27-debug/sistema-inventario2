---
id: PLAN-COM-01-D
tipo: plan
estado: hecho
modulos: [caja]
depende_de: [PLAN-COM-01, ADR-0064]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Índice de los tres issues de deuda técnica del módulo caja, publicados en GitHub el 2026-11-21.
---
# PLAN-COM-01-D — Deuda publicada en `src/modules/cash/`

Borrador local hasta el 2026-11-21. Los tres issues se publicaron al resolver #276 del mapa wayfinder #271; este documento pasa a ser su índice y ya no es un borrador.

Patrón común: un marcador temporal ("Slice-0", "P1", "no agrega migración") explicaba un atajo y el comentario se copiaba junto con el código. Los tres se borraron en la poda de `cash/` (TB-166); la deuda quedó registrada acá y en los issues.

## Issue 1 — Auth en la ruta de movimientos de caja

- **Issue:** [#290 — cash: auth en la ruta de movimientos de caja](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/290) (`ready-for-agent`).
- **Origen:** `src/modules/cash/registro_movimiento.ts:59` (comentario eliminado: *"Slice-0 sin auth en esta ruta; el permiso vive en el núcleo"*).
- **Hecho verificado:** `src/pages/api/cash/movements.ts` no recibe rol/actor y `reglasDominio` rechaza sueldos y retiros sin comprobar quién llama.
- **Arreglo propuesto:** resolver sesión y membership en la ruta, pasar `rol` y `actor` al repositorio, y no dejar el permiso solo en el núcleo.
- **Talla:** M.

## Issue 2 — Filtro por fecha en el historial

- **Issue:** [#291 — cash: filtro por fecha en el historial](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/291) (`ready-for-agent`).
- **Origen:** `src/modules/cash/historial.ts:40-41` (comentario eliminado: marcador `P1`).
- **Hecho verificado (actualizado al publicar):** `FiltroHistorial` solo expone `tipo`, `medio` y `origen`. El borrador original decía que `StoredMovement` no guardaba fecha, pero `src/lib/store.ts:37` ya tiene `ocurrido_en` y se puebla en `src/modules/cash/registro_movimiento.ts:38` y en el repo de caja. Lo que falta es exponer el filtro con conversión a `America/Argentina/Buenos_Aires` (ADR-0004 C2/C12).
- **Arreglo propuesto:** filtrar por rango sobre `ocurrido_en` convertido a hora local, para que `fecha_jornada` coincida con la jornada.
- **Talla:** M (bajó de L: el campo ya existe, no hace falta tocar `POST /movements` ni la sync offline).

## Issue 3 — Auditoría de ubicaciones sin tabla

- **Issue:** [#292 — cash: auditoría de ubicaciones sin tabla](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/292) (`ready-for-human`).
- **Origen:** `src/modules/cash/reversion.ts:33-37` (comentario eliminado: *"Esta talla no agrega migración nueva para auditoría"*).
- **Hecho verificado:** la asignación de ubicación escribe la lista de auditoría en memoria y no deja `stock_movements`.
- **Arreglo propuesto:** migrar `AuditoriaUbicacion` a una tabla con `tenant_id`, o reutilizar la tabla de auditoría existente si la hay; borrar la lista en memoria.
- **Talla:** M. Requiere aprobación de Mauri para la migración.
