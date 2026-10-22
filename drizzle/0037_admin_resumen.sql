-- P10-17 (PRD-OP-01 / ADR-0006): tablas declaradas en src/db/schema-admin.ts
-- que ninguna migración creaba. El panel admin sigue sirviendo del espejo en
-- memoria; esta migración deja las tablas listas para el cutover. Idempotente
-- y aditiva. No incluye `infra_hosts` (P10-17 la deja pendiente de decisión).
CREATE TABLE IF NOT EXISTS "platform_admins" (
	"google_sub" text PRIMARY KEY NOT NULL,
	"estado" text DEFAULT 'activo' NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "migration_rollouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "tenant_daily_usage" (
	"tenant_id" uuid NOT NULL,
	"dia" text NOT NULL,
	"tickets" integer DEFAULT 0 NOT NULL,
	"uso_wa" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tenant_daily_usage_tenant_id_dia_pk" PRIMARY KEY("tenant_id","dia")
);

-- ROLLBACK 0037:
-- DROP TABLE IF EXISTS "tenant_daily_usage";
-- DROP TABLE IF EXISTS "migration_rollouts";
-- DROP TABLE IF EXISTS "platform_admins";
