-- P1-74 / AUD-PILOTO-2026-11-14: tablas del schema sin CREATE, tenant_id en
-- pricing, vínculo durable preapproval→tenant para MP webhooks. Aditivo e
-- idempotente. Sin DROP de datos.

CREATE TABLE IF NOT EXISTS "platform_feedback_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nombre_comercio" text NOT NULL,
	"autor_google_sub" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"tipo" text NOT NULL,
	"texto" text NOT NULL,
	"estado" text DEFAULT 'recibido' NOT NULL,
	"contexto" jsonb NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_feedback_reports_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_counts" (
	"tenant_id" uuid,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sector" text NOT NULL,
	"idem_key" text NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_counts_idem_key_unique" UNIQUE("idem_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_counts_tenant_id_idx" ON "inventory_counts" ("tenant_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fiscal_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_tipo" text NOT NULL,
	"doc_nro" text NOT NULL,
	"nombre" text NOT NULL,
	"domicilio" text,
	"cond_iva" text DEFAULT '5' NOT NULL,
	"origen" text DEFAULT 'declarado' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" text NOT NULL,
	"flag" text NOT NULL,
	"detalle" jsonb,
	"creado_por" text NOT NULL,
	"origen" text DEFAULT 'tablero' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"formato" text NOT NULL,
	"filtros" jsonb NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"row_count" integer,
	"creado_por" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "report_exports_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mp_preapproval_tenants" (
	"preapproval_id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mp_preapproval_tenants_tenant_id_idx" ON "mp_preapproval_tenants" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "cost_history" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cost_history_tenant_id_idx" ON "cost_history" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "product_markups" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_markups_tenant_id_idx" ON "product_markups" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "price_settings" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_settings_tenant_id_idx" ON "price_settings" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "price_overrides" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_overrides_tenant_id_idx" ON "price_overrides" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "price_adjustments" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_adjustments_tenant_id_idx" ON "price_adjustments" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "pricing_audit_log" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pricing_audit_log_tenant_id_idx" ON "pricing_audit_log" ("tenant_id");
--> statement-breakpoint
UPDATE "cost_history" AS ch
SET "tenant_id" = p."tenant_id"
FROM "products" AS p
WHERE ch."sku" = p."sku" AND ch."tenant_id" IS NULL AND p."tenant_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "product_markups" AS pm
SET "tenant_id" = p."tenant_id"
FROM "products" AS p
WHERE pm."sku" = p."sku" AND pm."tenant_id" IS NULL AND p."tenant_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "price_overrides" AS po
SET "tenant_id" = p."tenant_id"
FROM "products" AS p
WHERE po."sku" = p."sku" AND po."tenant_id" IS NULL AND p."tenant_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "pricing_audit_log" AS pal
SET "tenant_id" = pa."tenant_id"
FROM "price_adjustments" AS pa
WHERE pal."ajuste_id" = pa."id" AND pal."tenant_id" IS NULL AND pa."tenant_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "pricing_audit_log" AS pal
SET "tenant_id" = p."tenant_id"
FROM "products" AS p
WHERE pal."sku" = p."sku" AND pal."tenant_id" IS NULL AND p."tenant_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "price_adjustments" AS adj
SET "tenant_id" = sub."tid"
FROM (SELECT "tenant_id" AS tid FROM "products" WHERE "tenant_id" IS NOT NULL LIMIT 1) AS sub
WHERE adj."tenant_id" IS NULL
  AND (SELECT COUNT(DISTINCT "tenant_id") FROM "products" WHERE "tenant_id" IS NOT NULL) = 1;
--> statement-breakpoint
UPDATE "price_settings" AS ps
SET "tenant_id" = sub."tid"
FROM (SELECT "tenant_id" AS tid FROM "products" WHERE "tenant_id" IS NOT NULL LIMIT 1) AS sub
WHERE ps."tenant_id" IS NULL
  AND (SELECT COUNT(DISTINCT "tenant_id") FROM "products" WHERE "tenant_id" IS NOT NULL) = 1;
--> statement-breakpoint
ALTER TABLE "product_markups" DROP CONSTRAINT IF EXISTS "product_markups_sku_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_markups_tenant_sku_uq" ON "product_markups" ("tenant_id", "sku");
--> statement-breakpoint
ALTER TABLE "price_overrides" DROP CONSTRAINT IF EXISTS "price_overrides_sku_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "price_overrides_tenant_sku_uq" ON "price_overrides" ("tenant_id", "sku");
--> statement-breakpoint
ALTER TABLE "price_adjustments" DROP CONSTRAINT IF EXISTS "price_adjustments_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "price_adjustments_tenant_idempotency_uq" ON "price_adjustments" ("tenant_id", "idempotency_key");
--> statement-breakpoint
UPDATE "mp_webhook_events" AS e
SET "tenant_id" = v."tenant_id"
FROM "mp_preapproval_tenants" AS v
WHERE e."preapproval_id" = v."preapproval_id" AND e."tenant_id" IS NULL;

-- ROLLBACK 0044: no soportado sin pérdida; revertir solo con backup previo.