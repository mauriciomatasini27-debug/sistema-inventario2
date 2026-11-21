---
item: AUD-VTA-04
estado: hecho
adr: ADR-0063
prd: MOD-04-TICKET-VENTA-PARTE-1
fecha: 2026-11-21
---
AUD-VTA-04: la devolución bloquea la fila de la venta (FOR UPDATE), relee dentro de la tx el acumulado y las unidades devueltas, y escribe stock inverso y egreso de caja en la misma tx que `sale_returns`; dos devoluciones simultáneas ya no superan el total ni dejan una devolución sin caja.
