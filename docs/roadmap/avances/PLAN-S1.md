---
item: PLAN-S1
estado: hecho
adr: ADR-0047
prd: PRD-PLAN-01
fecha: 2026-10-16
---
PLAN-S1 hecho: `src/lib/repos/planes.ts` persiste planes/suscripciones/usage_counters en DB (catálogo desde `plans`+`plan_features` con fallback a `PLANES_EJEMPLO`, `ProveedorCobroDb` con reemplazo atómico de la activa, `planIncluye` como único resolvedor, upsert de contadores por tenant/mes/feature) con espejo memoria del corte 19 y `ProveedorCobroFake` intacto; sin migraciones nuevas.
