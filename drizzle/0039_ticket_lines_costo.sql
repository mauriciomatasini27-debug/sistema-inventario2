-- P10-16 (GP4): agregar costo congelado a ticket_lines para saber el costo
-- del producto en el momento de la venta. Idempotente y aditiva.
ALTER TABLE "ticket_lines" ADD COLUMN IF NOT EXISTS "costo_centavos" bigint NOT NULL DEFAULT 0;

-- ROLLBACK 0039:
-- ALTER TABLE "ticket_lines" DROP COLUMN IF EXISTS "costo_centavos";
