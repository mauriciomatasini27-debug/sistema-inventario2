-- GGL-S1..S15 (PRD-GMAIL-01, ADR-0102/0099/0100): conexión Google,
-- ruteo del webhook de Gmail, auditoría de conexión y borradores de ingesta.
-- Aditiva e idempotente. google_connections, email_ingestion_drafts y
-- gmail_connection_events viven en la base del tenant; gmail_watch_routes
-- en control. El stream único crea todas las tablas en cada base; el handle
-- decide cuál se lee. Tokens solo cifrados; nunca texto plano.
CREATE TABLE IF NOT EXISTS "google_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"cuenta_email" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"refresh_token_cifrado" text,
	"refresh_token_iv" text,
	"refresh_token_tag" text,
	"cifrado_version" integer DEFAULT 1 NOT NULL,
	"kms_key_id" text,
	"estado" text DEFAULT 'activa' NOT NULL,
	"ultimo_error" text,
	"consentimiento_version" text NOT NULL,
	"consentimiento_at" timestamp NOT NULL,
	"consentido_por" text,
	"gmail_history_cursor" text,
	"watch_history_id" text,
	"watch_expira_at" timestamp,
	"photos_albumes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "google_connections_tenant_tipo_unique" UNIQUE("tenant_id","tipo"),
	CONSTRAINT "google_connections_tipo_check" CHECK ("tipo" IN ('gmail','photos')),
	CONSTRAINT "google_connections_estado_check" CHECK ("estado" IN ('activa','error','revocada'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TABLE "google_connections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gmail_watch_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hmac" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gmail_watch_routes" ADD CONSTRAINT "gmail_watch_routes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gmail_watch_routes_email_hmac_activo_idx" ON "gmail_watch_routes" ("email_hmac") WHERE "activo";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gmail_connection_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"evento" text NOT NULL,
	"actor" text,
	"motivo" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gmail_connection_events_evento_check" CHECK ("evento" IN ('conectada','desconectada','error','filtros_actualizados'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gmail_connection_events" ADD CONSTRAINT "gmail_connection_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TABLE "gmail_connection_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "gmail_connection_events" FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "gmail_connection_events_append_only_guard"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only: % no admite UPDATE/DELETE', TG_TABLE_NAME;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "gmail_connection_events_no_update" ON "gmail_connection_events";
--> statement-breakpoint
CREATE TRIGGER "gmail_connection_events_no_update"
  BEFORE UPDATE OR DELETE ON "gmail_connection_events"
  FOR EACH ROW EXECUTE FUNCTION "gmail_connection_events_append_only_guard"();
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_ingestion_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid,
	"message_id" text NOT NULL,
	"account_id" uuid,
	"canal" text DEFAULT 'gmail' NOT NULL,
	"periodo" text,
	"vencimiento" text,
	"monto_centavos" bigint,
	"origen" text NOT NULL,
	"confianza" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"vence_en" timestamp NOT NULL,
	"recordatorio_en" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_ingestion_drafts_tenant_message_unique" UNIQUE("tenant_id","message_id"),
	CONSTRAINT "email_ingestion_drafts_canal_check" CHECK ("canal" IN ('gmail','whatsapp','web','email_reenvio')),
	CONSTRAINT "email_ingestion_drafts_estado_check" CHECK ("estado" IN ('pendiente','confirmado','descartado','vencido'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_ingestion_drafts" ADD CONSTRAINT "email_ingestion_drafts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TABLE "email_ingestion_drafts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "utility_bills" ADD COLUMN IF NOT EXISTS "canal" text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "utility_bills" ADD COLUMN IF NOT EXISTS "gmail_attachment_id" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "utility_bills" ADD CONSTRAINT "utility_bills_canal_check" CHECK ("canal" IN ('manual','gmail','whatsapp','web','email_reenvio'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ROLLBACK 0029:
-- ALTER TABLE "utility_bills" DROP COLUMN IF EXISTS "gmail_attachment_id";
-- ALTER TABLE "utility_bills" DROP COLUMN IF EXISTS "canal";
-- DROP TABLE IF EXISTS "email_ingestion_drafts";
-- DROP TABLE IF EXISTS "gmail_connection_events";
-- DROP TABLE IF EXISTS "gmail_watch_routes";
-- DROP TABLE IF EXISTS "google_connections";
