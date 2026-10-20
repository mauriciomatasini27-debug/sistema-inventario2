ALTER TABLE "email_ingestion_drafts" ADD COLUMN IF NOT EXISTS "gmail_attachment_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gmail_ingestion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"history_id" text NOT NULL,
	"motivo" text DEFAULT 'push' NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"claimed_at" timestamp,
	"ultimo_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gmail_ingestion_jobs_estado_check" CHECK ("estado" IN ('pendiente','procesando','hecho','error')),
	CONSTRAINT "gmail_ingestion_jobs_motivo_check" CHECK ("motivo" IN ('push','poll','inicial')),
	CONSTRAINT "gmail_ingestion_jobs_connection_history_unique" UNIQUE("connection_id","history_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gmail_ingestion_jobs" ADD CONSTRAINT "gmail_ingestion_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gmail_ingestion_jobs_pendiente_idx" ON "gmail_ingestion_jobs" ("estado","run_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gmail_ingestion_jobs_tenant_idx" ON "gmail_ingestion_jobs" ("tenant_id","estado");

-- ROLLBACK 0030:
-- DROP TABLE IF EXISTS "gmail_ingestion_jobs";
-- ALTER TABLE "email_ingestion_drafts" DROP COLUMN IF EXISTS "gmail_attachment_id";
