-- PRD-CAT-02 CAT-S7, ADR-0101. Default 'general' para las filas existentes.
-- PG 11+: ADD COLUMN con default constante no reescribe la tabla; el CHECK valida una vez.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sector" text DEFAULT 'general' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_sector_check" CHECK ("sector" ~ '^[a-z0-9][a-z0-9_-]{0,39}$');
EXCEPTION WHEN duplicate_object THEN null; END $$;
