-- ADR-0108: importación de stock por CSV/XLSX. Una fila por importación,
-- idempotencia por idem_key y auditoría de contadores. Vive en la base del
-- tenant, sin tenant_id. Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS "stock_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idem_key" text NOT NULL,
	"archivo_nombre" text NOT NULL,
	"archivo_sha256" text NOT NULL,
	"formato" text NOT NULL,
	"filas_total" integer NOT NULL,
	"filas_importadas" integer NOT NULL,
	"filas_nuevas" integer NOT NULL,
	"filas_existentes" integer NOT NULL,
	"filas_error" integer NOT NULL,
	"movimientos" integer NOT NULL,
	"creado_por" text NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stock_imports_idem_key_unique" UNIQUE("idem_key")
);
--> statement-breakpoint
-- ROLLBACK 0035:
-- DROP TABLE IF EXISTS "stock_imports";
