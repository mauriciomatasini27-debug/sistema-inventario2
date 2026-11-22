-- P10-93 / #385: flag de venta por peso. Tag nuevo, autorizado por Mauricio
-- en el grilling de la feature. No se editan migraciones ya aplicadas.
-- Idempotente: ADD COLUMN IF NOT EXISTS con default apagado.

--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "por_peso" boolean NOT NULL DEFAULT false;
