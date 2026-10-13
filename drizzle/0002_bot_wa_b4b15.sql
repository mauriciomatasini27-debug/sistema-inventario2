-- Bot WA B4-B15 (segunda mitad): marca semanal + origen/canal en pedidos,
-- TTL de sesión corta y costo/estado en uso de plantillas.
-- Idempotente y aditivo: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "es_semanal" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "origen" text DEFAULT 'web' NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "canal" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_semanal_idx" ON "purchase_orders" ("supplier_cuit", "estado") WHERE "es_semanal" = true;
--> statement-breakpoint
ALTER TABLE "whatsapp_sessions" ADD COLUMN IF NOT EXISTS "expira_en" timestamp;
--> statement-breakpoint
ALTER TABLE "whatsapp_usage" ADD COLUMN IF NOT EXISTS "costo_centavos" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "whatsapp_usage" ADD COLUMN IF NOT EXISTS "estado" text DEFAULT 'enviado' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_usage_tenant_plantilla_idx" ON "whatsapp_usage" ("tenant_id", "plantilla", "created_at");
