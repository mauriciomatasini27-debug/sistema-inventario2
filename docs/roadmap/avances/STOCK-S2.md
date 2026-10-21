---
item: STOCK-S2
estado: hecho
adr: ADR-0106
prd: PRD-STOCK-01
fecha: 2026-10-20
---
STOCK-S2 hecho: `/venta` en línea da de alta un SKU desconocido con nombre y precio; `registrar_venta` crea el producto con `origen = "alta_al_vender"` y stock 0 en la misma transacción, y la línea ya no se descarta de `ticket_lines`.
