-- GGL-P0-HUECOS / ADR-0103: los cinco huecos P0 de la ingesta Gmail de la
-- auditoría 2026-11-15 que tocan schema.
--   Hueco 3: google_connections.labels (label elegible para users.watch, hoy
--   INBOX fijo en src/jobs/gmail.ts; default '{INBOX}' como en schema TS).
--   Hueco 1: gmail_ingestion_jobs.message_id nullable (dedupe explícita por
--   messageId; los jobs viejos quedan NULL) + unique index parcial de apoyo.
-- Idempotente: IF NOT EXISTS.

--> statement-breakpoint
ALTER TABLE "google_connections" ADD COLUMN IF NOT EXISTS "labels" text[] NOT NULL DEFAULT '{INBOX}';
--> statement-breakpoint
ALTER TABLE "gmail_ingestion_jobs" ADD COLUMN IF NOT EXISTS "message_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gmail_ingestion_jobs_message_id_unique" ON "gmail_ingestion_jobs" ("message_id");
