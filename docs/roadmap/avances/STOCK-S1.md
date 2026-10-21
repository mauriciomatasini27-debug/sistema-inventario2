---
item: STOCK-S1
estado: hecho
adr: ADR-0106
prd: PRD-STOCK-01
fecha: 2026-10-20
---
STOCK-S1 hecho: `/venta` offline encola el alta con la venta, suma el SKU a `offline:catalogo` con stock 0 y precio, y el push de la outbox crea el producto con `origen = "alta_al_vender"`.
