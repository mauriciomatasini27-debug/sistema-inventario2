-- CAJA-S1 (PRD-CAJA-01, ADR-0027): comprobantes QR de bot+Gmail.
-- Aditiva e idempotente: la tabla, la FK (SET NULL al borrar el
-- movimiento) y el índice se crean solo si faltan. numero_operacion
-- único = dedupe 409; fecha_operacion nula = ingesta sin fecha.
CREATE TABLE IF NOT EXISTS "cash_qr_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero_operacion" text NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"idempotency_key" text NOT NULL,
	"fecha_operacion" timestamp,
	"origen" text DEFAULT 'manual' NOT NULL,
	"cash_movement_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cash_qr_receipts_numero_operacion_unique" UNIQUE("numero_operacion"),
	CONSTRAINT "cash_qr_receipts_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_qr_receipts" ADD CONSTRAINT "cash_qr_receipts_cash_movement_id_cash_movements_id_fk" FOREIGN KEY ("cash_movement_id") REFERENCES "public"."cash_movements"("id") ON DELETE SET NULL ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_qr_receipts_cash_movement_id_idx" ON "cash_qr_receipts" ("cash_movement_id");
