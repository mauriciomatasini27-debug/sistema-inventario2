---
item: STOCK-E5
estado: parcial
adr: ADR-0114
prd: PRD-STOCK-01
fecha: 2026-11-18
---
STOCK-E5 parcial: alta de códigos en `/panel/stock` (STOCK-S19) más edición/baja vía `PATCH /api/products` con `codigo` (dedupe por PK `(tenant_id, codigo)` con 409 y normalización a mayúsculas, `""` limpia, también en modo memoria); queda la UI de edición/baja en el panel y la validación EAN.
