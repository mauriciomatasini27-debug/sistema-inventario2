-- P10-90 (autorizado por Mauri 2026-11-21 03:34): el job de retención puede
-- anonimizar SOLO actor y detalle en auth_events, gmail_connection_events y
-- admin_audit_log. DELETE y cualquier otro UPDATE siguen bloqueados. El UPDATE
-- pasa solo con SET LOCAL modoops.retencion = 'on' (lo fija el job dentro de
-- su transacción) y si las demás columnas no cambian.
-- Idempotente: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.

--> statement-breakpoint
CREATE OR REPLACE FUNCTION "retencion_append_only_guard"() RETURNS trigger AS $$
DECLARE
  resto_old jsonb;
  resto_new jsonb;
  col text;
BEGIN
  IF TG_OP = 'UPDATE' AND current_setting('modoops.retencion', true) = 'on' THEN
    resto_old := to_jsonb(OLD);
    resto_new := to_jsonb(NEW);
    FOREACH col IN ARRAY TG_ARGV LOOP
      resto_old := resto_old - col;
      resto_new := resto_new - col;
    END LOOP;
    IF resto_old = resto_new THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'append-only: % no admite UPDATE/DELETE', TG_TABLE_NAME;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "auth_events_no_update" ON "auth_events";
--> statement-breakpoint
CREATE TRIGGER "auth_events_no_update"
  BEFORE UPDATE OR DELETE ON "auth_events"
  FOR EACH ROW EXECUTE FUNCTION "retencion_append_only_guard"('actor', 'detalle');
--> statement-breakpoint
DROP TRIGGER IF EXISTS "gmail_connection_events_no_update" ON "gmail_connection_events";
--> statement-breakpoint
CREATE TRIGGER "gmail_connection_events_no_update"
  BEFORE UPDATE OR DELETE ON "gmail_connection_events"
  FOR EACH ROW EXECUTE FUNCTION "retencion_append_only_guard"('actor');
--> statement-breakpoint
DROP TRIGGER IF EXISTS "admin_audit_log_no_update" ON "admin_audit_log";
--> statement-breakpoint
CREATE TRIGGER "admin_audit_log_no_update"
  BEFORE UPDATE OR DELETE ON "admin_audit_log"
  FOR EACH ROW EXECUTE FUNCTION "retencion_append_only_guard"('actor_google_sub', 'detalle');
