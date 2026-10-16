-- =====================================================================
-- 0027_products_min_stock  (PRD-ALR-01 ALR-S1, ADR-0026, ADR-0043)
-- Qué hace: agrega products.min_stock y products.reorder_qty (nullable,
--   sin default => sin backfill ni reescritura de tabla).
-- Código que lo usa: src/modules/alertas/stock-bajo.ts
--   umbral_efectivo(minimo, ventas7d): min_stock NULL/0 => fallback rotación
--   7d (PR #113). Falta agregar minStock/reorderQty a products en
--   src/db/schema.ts al implementar.
-- Nota: products no tiene tenant_id (base por tenant/aislamiento existente);
--   no se cambia el scoping.
-- Reversible: sí (DROP COLUMN), pero se pierden los mínimos cargados.
-- Riesgo: muy bajo. ADD COLUMN nullable sin default es solo metadata
--   (lock ACCESS EXCLUSIVE breve en products).
-- =====================================================================
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "min_stock" integer;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "reorder_qty" integer;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_min_stock_check" CHECK ("min_stock" IS NULL OR "min_stock" >= 0);
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_reorder_qty_check" CHECK ("reorder_qty" IS NULL OR "reorder_qty" > 0);
EXCEPTION WHEN duplicate_object THEN null; END $$;
-- ROLLBACK 0027:
-- ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_reorder_qty_check";
-- ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_min_stock_check";
-- ALTER TABLE "products" DROP COLUMN IF EXISTS "reorder_qty";
-- ALTER TABLE "products" DROP COLUMN IF EXISTS "min_stock";
