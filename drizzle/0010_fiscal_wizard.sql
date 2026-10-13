-- PERS-S4 G2b-wizard: wizard fiscal por tenant (paso + delegacion + pausa).
-- Aditivo e idempotente: IF NOT EXISTS. Last-writer-wins por tenant_id.
CREATE TABLE IF NOT EXISTS "fiscal_wizard" (
  "tenant_id" text PRIMARY KEY,
  "paso" integer DEFAULT 0 NOT NULL,
  "delegacion" text DEFAULT 'pendiente' NOT NULL,
  "pausa_en" integer,
  "actualizado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
