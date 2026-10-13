-- ISO-S3: dueño del comprobante para aislamiento por tenant (ADR-0050).
-- Aditivo e idempotente: nullable para filas previas (sin backfill acá).
ALTER TABLE "fiscal_documents" ADD COLUMN IF NOT EXISTS "tenant_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fiscal_documents_tenant_id_idx" ON "fiscal_documents" ("tenant_id");
