-- PERS-S1 (ADR-0024): contador de ticket mostrador sin huecos.
-- Aditivo e idempotente: IF NOT EXISTS + ON CONFLICT DO NOTHING.
-- La fila se bloquea con FOR UPDATE dentro de la tx de venta.
-- Incluye ticket_payments: el schema la define pero ninguna migración la
-- creaba (el write-through best-effort tragaba el error en silencio).
CREATE TABLE IF NOT EXISTS "ticket_counters" (
  "id" text PRIMARY KEY,
  "ultimo" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
INSERT INTO "ticket_counters" ("id", "ultimo") VALUES ('mostrador', 0)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sale_id" uuid NOT NULL,
  "metodo" text NOT NULL,
  "monto_centavos" bigint NOT NULL,
  "cash_movement_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);
