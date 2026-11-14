-- Issue #93 / P1-78: el rubro elegido en el alta vive en control.tenants para
-- que la plantilla de stock lo recupere tras un reinicio. Aditiva e idempotente;
-- sin backfill destructivo (NULL → fallback "otro" en lectura).
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "rubro" text;