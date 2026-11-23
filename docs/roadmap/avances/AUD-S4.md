---
item: AUD-S4
estado: hecho
adr: ADR-0126
prd: PRD-AUD-02
fecha: 2026-11-23
---
AUD-S4: round-trip por módulo crítico en 31 tablas (ventas, caja, inventario, fiado, fiscal); el harness inserta todas las columnas del schema, relee por PK y compara valor y tipo, con bigint > 2^53 y timestamp con milisegundos: 0 hallazgos.
