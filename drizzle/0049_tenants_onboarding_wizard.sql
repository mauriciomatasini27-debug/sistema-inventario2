-- ONBOARDING: persistir wizardCompletado/wizardPaso en control.tenants para
-- que no se reseteen en cada deploy. Aditiva e idempotente.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "wizard_completado" boolean NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "wizard_paso" integer NOT NULL DEFAULT 0;
-- Backfill: tenants existentes se consideran onboarding completo (ya operaban).
UPDATE "tenants" SET "wizard_completado" = true WHERE "wizard_completado" = false AND "created_at" < now();
