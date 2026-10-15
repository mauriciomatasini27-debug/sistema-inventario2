-- CAJA-S3 (PRD-CAJA-01, ADR-0027): vencimientos de caja con aviso a 3d.
-- Aditiva e idempotente: la tabla, las columnas nuevas (avisado_el,
-- pagado_el, cash_movement_id), la FK (SET NULL al borrar el movimiento)
-- y el índice se crean solo si faltan. avisado_el nulo = aún sin aviso.
CREATE TABLE IF NOT EXISTS "cash_due_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concepto" text NOT NULL,
	"vence_el" timestamp NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"avisado_el" timestamp,
	"pagado_el" timestamp,
	"cash_movement_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_due_items" ADD COLUMN IF NOT EXISTS "avisado_el" timestamp;
--> statement-breakpoint
ALTER TABLE "cash_due_items" ADD COLUMN IF NOT EXISTS "pagado_el" timestamp;
--> statement-breakpoint
ALTER TABLE "cash_due_items" ADD COLUMN IF NOT EXISTS "cash_movement_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_due_items" ADD CONSTRAINT "cash_due_items_cash_movement_id_cash_movements_id_fk" FOREIGN KEY ("cash_movement_id") REFERENCES "public"."cash_movements"("id") ON DELETE SET NULL ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_due_items_estado_vence_el_idx" ON "cash_due_items" ("estado","vence_el");
