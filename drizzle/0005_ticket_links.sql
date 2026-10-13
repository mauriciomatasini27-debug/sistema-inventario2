-- 0005 TV9 links públicos con token (8.Ticket salida).
--
-- MANUAL: drizzle-kit generate 0.31.11 crashea con
-- `TypeError: Do not know how to serialize a BigInt` en diffSchemasOrTables
-- (preexistente: crashea igual sin estas tablas; causa: defaults bigint con
-- sql`0` en el schema). Revisar contra src/db/schema-tickets.ts
-- (ticketLinks, ticketLinkRevocations) antes de aplicar.
-- NO APLICADA. Journal saneado a idx 0-7 el 2026-10-12.
-- Aplicada a la base de desarrollo el 2026-10-13 (Slice D PERS-S4).
-- Corresponde a: POST/GET/DELETE /api/tickets/link + GET /t/:token.

CREATE TABLE "ticket_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "idempotency_key" text NOT NULL CONSTRAINT "ticket_links_idempotency_key_unique" UNIQUE,
  "sale_id" uuid NOT NULL,
  "token_hash" text NOT NULL CONSTRAINT "ticket_links_token_hash_unique" UNIQUE,
  "expira_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ticket_links_expira_futuro" CHECK ("expira_at" > "created_at")
);
CREATE INDEX "ticket_links_sale_idx" ON "ticket_links" ("sale_id", "created_at");

CREATE TABLE "ticket_link_revocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "idempotency_key" text NOT NULL CONSTRAINT "ticket_link_revocations_idempotency_key_unique" UNIQUE,
  "link_id" uuid NOT NULL,
  "sale_id" uuid NOT NULL,
  "actor" text NOT NULL,
  "motivo" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "ticket_link_revocations_link_idx" ON "ticket_link_revocations" ("link_id");
CREATE INDEX "ticket_link_revocations_sale_idx" ON "ticket_link_revocations" ("sale_id");

-- Inmutabilidad runtime: REVOKE + trigger anti-UPDATE/DELETE (mismo patrón
-- que 0001_admin_panel.sql). Revocar = INSERT, nunca UPDATE.
REVOKE UPDATE, DELETE ON "ticket_links" FROM PUBLIC;
REVOKE UPDATE, DELETE ON "ticket_link_revocations" FROM PUBLIC;

CREATE OR REPLACE FUNCTION "ticket_append_only_guard"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only: % no admite UPDATE/DELETE', TG_TABLE_NAME;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ticket_links_no_update"
  BEFORE UPDATE OR DELETE ON "ticket_links"
  FOR EACH ROW EXECUTE FUNCTION "ticket_append_only_guard"();
CREATE TRIGGER "ticket_link_revocations_no_update"
  BEFORE UPDATE OR DELETE ON "ticket_link_revocations"
  FOR EACH ROW EXECUTE FUNCTION "ticket_append_only_guard"();
