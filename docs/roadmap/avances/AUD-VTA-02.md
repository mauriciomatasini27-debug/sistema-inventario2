---
item: AUD-VTA-02
estado: hecho
adr: ADR-0116
prd: MOD-04-TICKET-VENTA-PARTE-1
fecha: 2026-11-21
---
AUD-VTA-02: si la base falla a mitad de una venta en multi o shared, `registrar_venta` lanza `BaseNoDisponible` y `POST /api/sales` responde 503 en vez de confirmar la venta solo en memoria; single conserva el respaldo en memoria.
