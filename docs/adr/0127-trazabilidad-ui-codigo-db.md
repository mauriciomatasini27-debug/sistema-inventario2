---
id: ADR-0127
tipo: adr
estado: propuesto
modulos: [design-system, persistencia]
depende_de: []
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Cada campo de pantalla se traza en un registro pantalla-handler-repo-columna; los hallazgos se vuelcan como issues y la auditoría es re-corrible.
---
# ADR-0127 - Trazabilidad UI ↔ código ↔ base de datos

Estado: propuesto. Fecha: 2026-11-22. Fuentes: PRD-AUD-03.

## Decisión

La funcionalidad de UI/UX se audita con un registro de trazabilidad por módulo (`docs/roadmap/auditorias/trazabilidad-<modulo>.md`) que mapea cada campo o pantalla a su handler, su repo y su columna. Un campo sin columna, o una columna sin pantalla, es un hallazgo. Los hallazgos se vuelcan como issues de GitHub bloqueados por la épica correspondiente.

## Por qué

"Está funcional" solo se puede afirmar si el dato existe en la base, lo mueve el código y lo muestra la UI (y viceversa). Sin trazabilidad, un campo puede quedar a mitad de camino y nadie lo ve. El registro da una evidencia revisable y re-corrible.

## Qué cambia

- Agrega el formato del registro de trazabilidad y un checklist de navegación por pantalla.
- Cada hallazgo se convierte en issue (bloqueado por la épica de su PRD) hasta quedar cerrado con evidencia.
- La auditoría se re-corre en cada iteración de diseño y el registro se versiona en el repo.

## Pendientes

- Definir la lista de pantallas de la primera pasada (panel, venta, caja, stock, proveedores, servicios, pagos, fiscal).
- Acordar el nivel de detalle del registro (campo a campo vs pantalla a pantalla).
