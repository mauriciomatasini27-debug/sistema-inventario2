---
item: PLAN-S10
estado: hecho
adr: ADR-0047
prd: PRD-PLAN-01
fecha: 2026-10-30
---
PLAN-S10 hecho: `registrarConsultaBot` upsertea `usage_counters` (`bot_consulta`) en la misma transacción que `whatsapp_usage` (wamid duplicado no suma); el cupo de `/panel/plan` sigue en `whatsapp_usage` y admin lee el agregado; tests `plan-s10-bot-contador.test.ts`.
