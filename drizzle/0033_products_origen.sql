-- PRD-STOCK-01 STOCK-S2, ADR-0106: origen del producto. "alta_al_vender" al
-- darlo de alta al vender; "plantilla_rubro" cuando viene de la plantilla.
-- Nullable: los productos existentes quedan NULL. Aditiva e idempotente.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "origen" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_origen_check" CHECK ("origen" IS NULL OR "origen" IN ('alta_al_vender','plantilla_rubro'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ROLLBACK 0033:
-- ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_origen_check";
-- ALTER TABLE "products" DROP COLUMN IF EXISTS "origen";
