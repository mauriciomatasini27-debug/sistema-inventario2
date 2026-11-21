---
item: AUD-VTA-03
estado: hecho
adr: ADR-0063
prd: MOD-04-TICKET-VENTA-PARTE-1
fecha: 2026-11-21
---
AUD-VTA-03: una devolución se rechaza con 422 si repone más unidades de un SKU que las vendidas en la venta menos las ya devueltas, o un producto que no estaba en la venta; `POST /api/returns` informa el SKU y lo disponible.
