---
item: AUD-FIX-S1
estado: hecho
adr: ADR-0125
prd: PRD-AUD-01
fecha: 2026-11-23
---
AUD-FIX-S1: las 14 divergencias `corregir-schema` del triage quedan alineadas en `src/db/schema*.ts` (timestamptz, `fiscal_jobs` duplicada fuera, índice no único de `customers` y FK compuestas de `product_codes`/`stock_lots`/`product_photos`); `audit:db` baja de 23 a 9 hallazgos y los 9 que quedan son los 5 de la migración (AUD-FIX-S2).
