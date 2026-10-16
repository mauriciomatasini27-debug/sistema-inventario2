-- BOT-S1/S2 (PRD-BOT-01, ADR-0039): módulos del bot por tenant.
-- Aditiva e idempotente. Una fila por (tenant, módulo) con su interruptor;
-- tenant sin filas = todos los módulos prendidos (regla de #135, sin siembra).
-- CHECK sobre modulo = MODULOS_BOT; RLS habilitado sin policies.
CREATE TABLE IF NOT EXISTS "tenant_bot_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"modulo" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_bot_modules_tenant_modulo_unique" UNIQUE("tenant_id","modulo"),
	CONSTRAINT "tenant_bot_modules_modulo_check" CHECK ("modulo" IN
	  ('rotacion','vencimientos','flujo_caja','cobranza','ordenes_produccion','entregas'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_bot_modules" ADD CONSTRAINT "tenant_bot_modules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TABLE "tenant_bot_modules" ENABLE ROW LEVEL SECURITY;
