-- Auth AU9-AU14 P0: reauth (AU10), flag de bot (AU11) y append-only de
-- auth_events (AU12.1, mismo criterio que stock_movements/admin_audit_log:
-- REVOKE + trigger en migración, nunca en el schema tipado).
-- Aditivo e idempotente: IF NOT EXISTS / OR REPLACE / DROP IF EXISTS.

ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "reauth_at" timestamp;
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "puede_usar_bot" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "auth_events" FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "auth_append_only_guard"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only: % no admite UPDATE/DELETE', TG_TABLE_NAME;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "auth_events_no_update" ON "auth_events";
--> statement-breakpoint
CREATE TRIGGER "auth_events_no_update"
  BEFORE UPDATE OR DELETE ON "auth_events"
  FOR EACH ROW EXECUTE FUNCTION "auth_append_only_guard"();
