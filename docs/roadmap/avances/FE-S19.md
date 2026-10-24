---
item: FE-S19
estado: hecho
adr: ADR-0018
prd: PRD-FE-01
fecha: 2026-10-24
---
FE-S19: tras un timeout el worker espera 30 s, consulta el mismo número y solo reenvía si no existe. Si difiere, pausa la cola. El 10016 resincroniza y reintenta una vez. El job diario compara la base con FECompUltimoAutorizado.
