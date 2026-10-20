-- ON4-SEED / ON4-5 (PR #217/#218): registro persistido de que las ubicaciones
-- del tenant se sembraron desde la plantilla de rubro. Antes vivía solo en
-- control.events (memoria) y el aviso de /panel/stock se perdía al reiniciar.
-- Aditiva e idempotente. Una fila por tenant; tenant_id en texto (mismo valor
-- que control.events.tenantId) sin FK. RLS habilitado sin policies.
CREATE TABLE IF NOT EXISTS "tenant_location_seeds" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"rubro" text NOT NULL,
	"plantilla_version" text NOT NULL,
	"cantidad" integer DEFAULT 0 NOT NULL,
	"sembrado_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_location_seeds" ENABLE ROW LEVEL SECURITY;

-- ROLLBACK 0032:
-- DROP TABLE IF EXISTS "tenant_location_seeds";
