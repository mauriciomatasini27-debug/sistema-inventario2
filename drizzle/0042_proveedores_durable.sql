-- #68 PROV-durable: invitaciones, contactos y cupo sobreviven al reinicio.
-- Aditiva. El número es global (PK) y el comercio queda en tenant_id.
-- No se aplica en la base real hasta que Mauri tome el backup.
CREATE TABLE IF NOT EXISTS "proveedor_contactos" (
	"numero_e164" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"supplier_cuit" text,
	"estado" text NOT NULL,
	"creado_en" timestamptz NOT NULL,
	CONSTRAINT "proveedor_contactos_estado_check" CHECK ("estado" IN ('pendiente', 'verificado', 'revocado'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proveedor_contactos_tenant_idx" ON "proveedor_contactos" ("tenant_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proveedor_invitaciones" (
	"codigo_hash" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"supplier_cuit" text,
	"expira_en_ms" bigint NOT NULL,
	"usado" boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proveedor_cupo" (
	"numero_e164" text PRIMARY KEY,
	"marcas_ms" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"aviso" boolean NOT NULL DEFAULT false
);

-- ROLLBACK 0042:
-- DROP TABLE IF EXISTS "proveedor_cupo";
-- DROP TABLE IF EXISTS "proveedor_invitaciones";
-- DROP INDEX IF EXISTS "proveedor_contactos_tenant_idx";
-- DROP TABLE IF EXISTS "proveedor_contactos";
