---
item: FE-S3
estado: hecho
adr: ADR-0018
prd: PRD-FE-01
fecha: 2026-10-24
---
FE-S3 hecho: un cambio de CUIT, condición IVA o punto de venta lo confirma el Dueño con reauth Google (AU10), queda auditado con el valor anterior y el nuevo, y no reescribe comprobantes ya emitidos. El empleado recibe 403. La fila vigente de fiscal_settings sigue siendo una por tenant (índice único, ADR-0074) y la cadena de versiones vive en la memoria del proceso. Guardar ese historial en la base queda para cuando Mauri apruebe la migración.
