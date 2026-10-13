-- Panel Multi-Kiosco solo-gestión (ADR-0006/0011, PA1-PA14).
-- Separación Ley 25.326: tenant_id opaco, SIN REFERENCES a tenants.
-- Append-only (admin_audit_log, billing_ledger_entries): REVOKE + trigger,
-- mismo criterio que el resto del repo (el revoke vive en migración).

CREATE TABLE "admin_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_google_sub" text NOT NULL,
  "acto_kind" text NOT NULL,
  "tenant_id" uuid,
  "detalle" jsonb NOT NULL,
  "prev_hash" text,
  "hash" text NOT NULL CONSTRAINT "admin_audit_log_hash_unique" UNIQUE,
  "origen" text NOT NULL,
  "creado_en" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "admin_audit_log_tenant_idx" ON "admin_audit_log" ("tenant_id", "creado_en");

CREATE TABLE "tenant_health_signals" (
  "tenant_id" uuid PRIMARY KEY NOT NULL,
  "plan" text NOT NULL,
  "estado_visto" text NOT NULL,
  "tickets_hoy" integer DEFAULT 0 NOT NULL,
  "demos_purgadas" integer DEFAULT 0 NOT NULL,
  "cobros_centavos" bigint DEFAULT 0 NOT NULL,
  "ultima_senal_en" timestamp,
  "actualizado_en" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "billing_ledger_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "monto_centavos" bigint NOT NULL,
  "medio" text NOT NULL,
  "referencia_externa" text NOT NULL,
  "idempotency_key" text NOT NULL CONSTRAINT "billing_ledger_entries_key_unique" UNIQUE,
  "asiento_compensatorio_de" uuid,
  "creado_por" text NOT NULL,
  "creado_en" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "billing_ledger_tenant_idx" ON "billing_ledger_entries" ("tenant_id", "creado_en");

CREATE TABLE "dunning_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plan" text NOT NULL CONSTRAINT "dunning_policies_plan_unique" UNIQUE,
  "dias_gracia" integer NOT NULL,
  "dias_a_suspension" integer NOT NULL,
  "dias_a_baja" integer NOT NULL,
  "activa" boolean DEFAULT true NOT NULL,
  "actualizado_por" text,
  "actualizado_en" timestamp
);

CREATE TABLE "tenant_lifecycle_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "de_estado" text NOT NULL,
  "a_estado" text NOT NULL,
  "motivo" text NOT NULL,
  "actor" text NOT NULL,
  "idempotency_key" text CONSTRAINT "tenant_lifecycle_events_key_unique" UNIQUE,
  "creado_en" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "tenant_lifecycle_tenant_idx" ON "tenant_lifecycle_events" ("tenant_id", "creado_en");

CREATE TABLE "tenant_feature_overrides" (
  "tenant_id" uuid NOT NULL,
  "flag" text NOT NULL,
  "valor" boolean NOT NULL,
  "motivo" text NOT NULL,
  "expira_en" timestamp,
  "creado_por" text,
  "creado_en" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_feature_overrides_pkey" PRIMARY KEY ("tenant_id", "flag")
);

-- Inmutabilidad runtime: REVOKE + trigger anti-UPDATE/DELETE.
REVOKE UPDATE, DELETE ON "admin_audit_log" FROM PUBLIC;
REVOKE UPDATE, DELETE ON "billing_ledger_entries" FROM PUBLIC;

CREATE OR REPLACE FUNCTION "admin_append_only_guard"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only: % no admite UPDATE/DELETE', TG_TABLE_NAME;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "admin_audit_log_no_update"
  BEFORE UPDATE OR DELETE ON "admin_audit_log"
  FOR EACH ROW EXECUTE FUNCTION "admin_append_only_guard"();
CREATE TRIGGER "billing_ledger_no_update"
  BEFORE UPDATE OR DELETE ON "billing_ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION "admin_append_only_guard"();

-- Seed políticas de mora PA7: gracia 14d, suspensión día 15, baja día 45.
INSERT INTO "dunning_policies" ("plan", "dias_gracia", "dias_a_suspension", "dias_a_baja", "activa", "actualizado_por")
VALUES
  ('demo', 14, 15, 45, true, 'seed:0001'),
  ('base', 14, 15, 45, true, 'seed:0001'),
  ('plus', 14, 15, 45, true, 'seed:0001');
