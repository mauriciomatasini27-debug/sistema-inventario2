-- PERS3-S1 (ADR-0078): tablas del esquema N1 que nunca tuvieron migración.
-- Aislamiento por base de tenant (sin tenant_id). sector en stock_counts
-- alinea el modelo en memoria (conteo por sector). Unicidad de locations
-- case-insensitive para no colar "Deposito"/"deposito".
CREATE TABLE IF NOT EXISTS "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"archivada" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "locations_nombre_lower_unique" ON "locations" (lower("nombre"));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"url" text NOT NULL,
	"ancho" integer DEFAULT 800 NOT NULL,
	"alto" integer DEFAULT 800 NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_photos" ADD CONSTRAINT "product_photos_sku_products_sku_fk" FOREIGN KEY ("sku") REFERENCES "public"."products"("sku") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idem_key" text NOT NULL,
	"sector" text DEFAULT 'general' NOT NULL,
	"estado" text DEFAULT 'en_curso' NOT NULL,
	"contado_por" text,
	"confirmado_por" text,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stock_counts_idem_key_unique" UNIQUE("idem_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_count_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"count_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"teorico" integer DEFAULT 0 NOT NULL,
	"fisico" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_id_stock_counts_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."stock_counts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
