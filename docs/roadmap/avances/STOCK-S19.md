---
item: STOCK-S19
estado: hecho
adr: ADR-0114
prd: PRD-STOCK-03-escaner
fecha: 2026-11-14
---
STOCK-S19 hecho: en /panel/stock hay un formulario Agregar producto (nombre, código opcional, precio y cantidad inicial), atajo desde código desconocido e importación, y en /venta el precio editable al escanear un producto nuevo sin precio en catálogo. El alta por código desconocido y la Alta de catálogo (creación explícita e importación) ya no están alineadas a `crear_productos` ni dependen de `pendiente_revision`: la sesión y la membership siguen delimitando el Comercio (ADR-0066).