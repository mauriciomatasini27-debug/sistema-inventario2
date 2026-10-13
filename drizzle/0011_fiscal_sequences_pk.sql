-- PERS-S4 G2c: PK compuesta en fiscal_sequences para un claim exacto por clave.
-- Aditivo e idempotente: el bloque DO solo agrega la PK si falta.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_sequences_pkey') THEN
    ALTER TABLE "fiscal_sequences" ADD PRIMARY KEY ("punto_venta", "cbte_tipo");
  END IF;
END $$;
--> statement-breakpoint
