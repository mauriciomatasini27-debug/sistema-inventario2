-- ADR-0116 C1: tenant_id nullable en tablas núcleo de comercio.
-- Uniques globales se mantienen. NOT NULL + compuestos van en cierre.
-- Aditivo e idempotente. Sin backfill (filas previas quedan NULL).

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_tenant_id_idx" ON "products" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_counts_tenant_id_idx" ON "inventory_counts" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "devices_tenant_id_idx" ON "devices" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "device_pins" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_pins_tenant_id_idx" ON "device_pins" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_tenant_id_idx" ON "sales" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_tenant_id_idx" ON "tickets" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "ticket_counters" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_counters_tenant_id_idx" ON "ticket_counters" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "ticket_lines" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_lines_tenant_id_idx" ON "ticket_lines" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_movements_tenant_id_idx" ON "cash_movements" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_tenant_id_idx" ON "outbox" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "id_mappings" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "id_mappings_tenant_id_idx" ON "id_mappings" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "product_codes" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_codes_tenant_id_idx" ON "product_codes" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "stock_lots" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_lots_tenant_id_idx" ON "stock_lots" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_tenant_id_idx" ON "stock_movements" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "stock_imports" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_imports_tenant_id_idx" ON "stock_imports" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "product_photos" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_photos_tenant_id_idx" ON "product_photos" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "locations_tenant_id_idx" ON "locations" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "stock_counts" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_counts_tenant_id_idx" ON "stock_counts" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_count_lines_tenant_id_idx" ON "stock_count_lines" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "cash_qr_receipts" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_qr_receipts_tenant_id_idx" ON "cash_qr_receipts" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "cash_due_items" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_due_items_tenant_id_idx" ON "cash_due_items" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "ticket_payments" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_payments_tenant_id_idx" ON "ticket_payments" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "ocr_jobs" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ocr_jobs_tenant_id_idx" ON "ocr_jobs" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "ocr_eventos" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ocr_eventos_tenant_id_idx" ON "ocr_eventos" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "mp_webhook_events" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mp_webhook_events_tenant_id_idx" ON "mp_webhook_events" ("tenant_id");

-- ROLLBACK 0043:
-- DROP INDEX IF EXISTS "mp_webhook_events_tenant_id_idx";
-- ALTER TABLE "mp_webhook_events" DROP COLUMN IF EXISTS "tenant_id";
-- (repetir por cada tabla en orden inverso)
