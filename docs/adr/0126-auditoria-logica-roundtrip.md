---
id: ADR-0126
tipo: adr
estado: propuesto
modulos: [persistencia]
depende_de: []
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: La lógica se verifica con un check estático de columnas referenciadas y tests de round-trip por módulo, no con revisión a ojo del código.
---
# ADR-0126 - Auditoría de lógica por round-trip y check de columnas

Estado: propuesto. Fecha: 2026-11-22. Fuentes: PRD-AUD-02.

## Decisión

La lógica código ↔ base se verifica en dos capas: (1) un check estático que confirma que cada tabla o columna referenciada en `src/` (repos y queries) existe en `src/db/schema*.ts`; (2) tests de round-trip por módulo crítico que insertan, leen y comparan un registro sin pérdida de datos ni de tipos.

## Por qué

El código puede compilar y aun así referenciar columnas que no existen en la base, o escribir campos que después no se leen. Comparar solo el esquema (ADR-0125) no cubre qué hace el código con ese esquema. El round-trip es la evidencia mínima de que un dato sobrevive el camino completo.

## Qué cambia

- Agrega un check de referencias estático a `scripts/` y lo suma a `verify`.
- Agrega tests de round-trip para los módulos críticos (ventas, caja, inventario, fiado, fiscal) sobre Postgres de test A/B.
- Los hallazgos se triagean a issues con el módulo afectado.

## Pendientes

- Definir la lista exacta de módulos críticos de la primera pasada.
- Decidir si el check estático falla `verify` ante una referencia inexistente o solo avisa.
