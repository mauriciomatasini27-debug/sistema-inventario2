---
item: AUD-VTA-05-T07
estado: hecho
adr: ADR-0123
prd: —
fecha: 2026-11-22
---
AUD-VTA-05-T07: modelo TLA+ separado `StockLotes.tla` con las cuatro leyes de Lotes y stock —invariante de los tres números sin la sobreventa marcada, sin espejo tras fallo de base, devolución al Lote original por idempotencia con sobrante al vencimiento más cercano y toda baja con su movimiento— más la config de quiebre que reproduce el espejo tras fallo de base; corre solo en `npm run verificar:formal`, fuera de `npm run verify`.
