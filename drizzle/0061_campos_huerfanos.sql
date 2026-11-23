-- AUD-FIX-S3/S4/S7 [persistencia]: los tres campos huérfanos que ADR-0129
-- manda persistir. Nullable o con default para no romper filas existentes.
ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "nota" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "controla_vencimiento" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "fiscal_wizard" ADD COLUMN IF NOT EXISTS "modo_primera_factura" text;
