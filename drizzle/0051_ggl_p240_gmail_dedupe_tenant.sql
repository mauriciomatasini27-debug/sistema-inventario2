-- GGL-P240-FIX / ADR-0103: reemplaza el índice global de 0048 por dedupe por comercio.
-- Dos tenants pueden compartir el mismo message_id; el mismo tenant no duplica.
-- Idempotente: IF NOT EXISTS / IF EXISTS.

--> statement-breakpoint
DROP INDEX IF EXISTS "gmail_ingestion_jobs_message_id_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gmail_ingestion_jobs_tenant_message_unique" ON "gmail_ingestion_jobs" ("tenant_id", "message_id") WHERE "message_id" IS NOT NULL;