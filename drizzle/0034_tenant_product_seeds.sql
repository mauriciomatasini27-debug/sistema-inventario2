-- PRD-STOCK-01 STOCK-S8 / ADR-0107: registro persistido de que el catálogo de
-- productos del tenant se sembró desde la plantilla de rubro. Una fila por
-- tenant; tenant_id en texto sin FK. RLS habilitado sin policies. Aditiva e
-- idempotente.
CREATE TABLE IF NOT EXISTS "tenant_product_seeds" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"rubro" text NOT NULL,
	"plantilla_version" text NOT NULL,
	"cantidad" integer DEFAULT 0 NOT NULL,
	"sembrado_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_product_seeds" ENABLE ROW LEVEL SECURITY;

-- ROLLBACK 0034:
-- DROP TABLE IF EXISTS "tenant_product_seeds";
