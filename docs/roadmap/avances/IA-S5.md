---
item: IA-S5
estado: hecho
adr: ADR-0045
prd: PRD-IA-01
fecha: 2026-10-16
---
IA-S5 hecho: `src/lib/repos/ia-uso.ts` persiste una fila por consulta en `ai_usage` (tenant, mes, proveedor, modelo, tokens, costo) con `usoDelMes` por SQL y contador `usage_counters/asistente_ia` en la misma transacción, `RegistroUsoIA` async con `crearRegistroUsoIA` como única elección memoria-vs-DB y espejo memoria del corte 19; el asistente espera al registro y el cupo por mes sigue bloqueando; sin migraciones nuevas.
