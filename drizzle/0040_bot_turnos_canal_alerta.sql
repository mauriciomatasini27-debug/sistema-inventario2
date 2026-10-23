-- DASH-S2 / DASH-S5: transcript del bot y canal elegido por el encargado.
-- Aditiva. No se aplica en la base real sin aprobación de Mauri.
CREATE TABLE IF NOT EXISTS "bot_turnos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"wamid" text NOT NULL,
	"numero_e164" text NOT NULL,
	"google_sub" text NOT NULL,
	"pregunta" text NOT NULL,
	"respuesta" text NOT NULL,
	"fuente" text NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bot_turnos_wamid_unique" UNIQUE("wamid"),
	CONSTRAINT "bot_turnos_fuente_check" CHECK ("fuente" IN ('db', 'memoria'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_turnos_tenant_creado_idx"
	ON "bot_turnos" ("tenant_id", "creado_en" DESC, "id" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_turnos_tenant_sub_creado_idx"
	ON "bot_turnos" ("tenant_id", "google_sub", "creado_en" DESC, "id" DESC);
--> statement-breakpoint
ALTER TABLE "notification_preferences"
	ADD COLUMN IF NOT EXISTS "canal" text NOT NULL DEFAULT 'email';
--> statement-breakpoint
UPDATE "notification_preferences" SET "canal" = 'ambos' WHERE "opt_in" = true AND "canal" = 'email';
--> statement-breakpoint
ALTER TABLE "notification_preferences"
	DROP CONSTRAINT IF EXISTS "notification_preferences_canal_check";
--> statement-breakpoint
ALTER TABLE "notification_preferences"
	ADD CONSTRAINT "notification_preferences_canal_check"
	CHECK ("canal" IN ('whatsapp', 'email', 'ambos'));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_tenant_sub_uidx"
	ON "notification_preferences" ("tenant_id", "google_sub");

-- ROLLBACK 0040:
-- DROP INDEX IF EXISTS "notification_preferences_tenant_sub_uidx";
-- ALTER TABLE "notification_preferences" DROP CONSTRAINT IF EXISTS "notification_preferences_canal_check";
-- ALTER TABLE "notification_preferences" DROP COLUMN IF EXISTS "canal";
-- DROP TABLE IF EXISTS "bot_turnos";
