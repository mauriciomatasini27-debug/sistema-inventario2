---
item: SYNC-S7
estado: hecho
adr: ADR-0023
prd: PRD-SYNC-01
fecha: 2026-10-16
---
SYNC-S7 hecho: sensibles solo online con OPERACIONES_SOLO_ONLINE (cambio_tope/plazo, baja_fiado, ajuste_stock/precio, reversion, export); push acepta lote {ops} y responde necesita_conexion sin persistir, encolar lanza NecesitaConexionError ("Necesita conexión", visible en sync de venta.astro), tests/sync-s7-solo-online.test.ts 5/5 (memoria + PG).
