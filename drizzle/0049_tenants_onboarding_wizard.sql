-- ON12: persistir wizardCompletado/wizardPaso en control.tenants para
-- que no se reseteen en cada deploy. Aditiva e idempotente.

--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "wizard_completado" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "wizard_paso" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
-- Backfill: tenants existentes se consideran onboarding completo (ya operaban).
UPDATE "tenants" SET "wizard_completado" = true, "wizard_paso" = 5 WHERE "wizard_completado" = false AND "created_at" < now();
