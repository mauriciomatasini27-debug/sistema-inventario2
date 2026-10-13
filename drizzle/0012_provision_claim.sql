-- Control durable U1: claim de provision_jobs por job (reclamo + reaper).
-- Aditivo e idempotente: ADD COLUMN IF NOT EXISTS + indice parcial solo si falta.
-- request_key sigue nullable; el indice parcial unico solo cubre no-nulos, seguro en tablas vacias.
ALTER TABLE "provision_jobs" ADD COLUMN IF NOT EXISTS "claimed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "provision_jobs" ADD COLUMN IF NOT EXISTS "claimed_by" text;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'provision_jobs_request_key_uidx') THEN
    CREATE UNIQUE INDEX "provision_jobs_request_key_uidx" ON "provision_jobs" ("request_key") WHERE "request_key" IS NOT NULL;
  END IF;
END $$;
