-- TB-165 [tenant]: espejo durable de wizardRespuestas. Aditiva e idempotente;
-- no modifica la 0049 (wizard_completado / wizard_paso siguen intactas).
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "wizard_respuestas" jsonb NOT NULL DEFAULT '{}'::jsonb;
