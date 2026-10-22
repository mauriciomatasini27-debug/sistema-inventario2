-- P10-19: tablas de reportes declaradas en src/db/schema-analytics.ts que
-- ninguna migración creaba. Los reportes siguen funcionando con el espejo en
-- memoria; las tablas quedan listas para el cutover. Idempotente y aditiva.
-- No incluye product_flags ni report_exports (otra decisión de alcance).
CREATE TABLE IF NOT EXISTS "rotation_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ventana_cobertura_dias" integer DEFAULT 28 NOT NULL,
	"dormido_n" integer DEFAULT 30 NOT NULL,
	"dormido_x" integer DEFAULT 60 NOT NULL,
	"cobertura_reponer_dias" integer DEFAULT 7 NOT NULL,
	"abc_corte_a_bp" integer DEFAULT 8000 NOT NULL,
	"abc_corte_b_bp" integer DEFAULT 9500 NOT NULL,
	"abc_min_dias" integer DEFAULT 30 NOT NULL,
	"markup_min_bp" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp
);

CREATE TABLE IF NOT EXISTS "rotation_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text NOT NULL,
	"desde" text NOT NULL,
	"hasta" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"origen" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rotation_snapshots_dedupe_key_unique" UNIQUE("dedupe_key")
);

CREATE TABLE IF NOT EXISTS "promo_intents" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"skus" jsonb NOT NULL,
	"pct" integer NOT NULL,
	"estado" text DEFAULT 'confirmada' NOT NULL,
	"creado_por" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- ROLLBACK 0038:
-- DROP TABLE IF EXISTS "promo_intents";
-- DROP TABLE IF EXISTS "rotation_snapshots";
-- DROP TABLE IF EXISTS "rotation_settings";
