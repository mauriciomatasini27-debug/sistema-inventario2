-- PERS-S4 Slice C (PRD-PERS-01): customer_id uuid -> text porque el contrato
-- es string libre (z.string min 1 max 64, p. ej. "cli-1"), no uuid.
-- USING convierte las filas existentes sin perder datos.
ALTER TABLE "customer_movements" ALTER COLUMN "customer_id" SET DATA TYPE text USING "customer_id"::text;
