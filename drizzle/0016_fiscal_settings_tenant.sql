-- SEC2-S3: dueño del setting fiscal por tenant (ADR-0074).
-- Aditivo e idempotente: nullable para filas previas (sin backfill acá);
-- una fila por tenant vía índice único (el POST hace upsert por tenant_id).
ALTER TABLE "fiscal_settings" ADD COLUMN IF NOT EXISTS "tenant_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_settings_tenant_id_unique" ON "fiscal_settings" ("tenant_id");
