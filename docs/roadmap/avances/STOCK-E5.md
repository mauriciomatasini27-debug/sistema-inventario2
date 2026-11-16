---
item: STOCK-E5
estado: propuesto
adr: ADR-0114
prd: PRD-STOCK-01
fecha: 2026-11-15
---
STOCK-E5 propuesto: gestión de `product_codes` en `/panel/stock` (alta/edición/baja de códigos por producto, dedupe por PK `(tenant_id, codigo)` con 409 claro y validación EAN); la auditoría 2026-11-15 encontró que los códigos solo se escriben al crear el producto (`src/lib/repos/catalogo.ts:403`) y no hay forma de asignar uno a un producto existente, que es el caso real de productos dados de alta a mano antes del escáner de STOCK-E4.
