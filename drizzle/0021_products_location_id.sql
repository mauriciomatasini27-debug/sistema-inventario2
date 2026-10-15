-- CAT-S5 (PRD-CAT-01): products.location_id nullable hacia locations.
-- Aditivo e idempotente: la columna, la FK (SET NULL al borrar la
-- ubicación) y el índice se crean solo si faltan. Sin backfill: la
-- ubicación vive en el espejo en memoria hasta la asignación masiva.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "location_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_location_id_idx" ON "products" ("location_id");
