---
item: AUD-VTA-05-T05
estado: hecho
adr: ADR-0123
prd: —
fecha: 2026-11-22
---
AUD-VTA-05-T05: la devolución recupera del Historial los Lotes consumidos por la clave de idempotencia de la venta, reparte el reingreso proporcionalmente por SKU con el sobrante por redondeo en el Lote de vencimiento más cercano, y lo escribe con el escritor único dentro de la misma transacción que `sale_returns`; sin Lote identificado reingresa al Lote genérico, sin tocar el formulario ni el núcleo puro de devolución.
