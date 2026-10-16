-- =====================================================================
-- 0025_planes_suscripciones  (PRD-PLAN-01 PLAN-S1/S10, ADR-0047, ADR-0003)
-- Qué hace: crea plans, plan_features, subscriptions y usage_counters;
--   siembra Básico/Plus/Pro con los valores de EJEMPLO de
--   src/modules/planes/catalogo.ts (PLANES_EJEMPLO, no contractuales).
-- Código que lo usa: src/modules/planes/catalogo.ts (PlanId, Feature, cupos),
--   src/modules/planes/proveedor.ts (Suscripcion{id,tenantId,planId,estado
--   'activa'|'cancelada'}; hoy ProveedorCobroFake en memoria, PR #117).
--   Aún no hay schema Drizzle ni adaptador DB: habría que agregar
--   src/db/schema-planes.ts al implementar.
-- Nota: tenants.plan (text, default 'demo') sigue existiendo; no se toca.
-- Reversible: sí, sin pérdida mientras no haya datos reales
--   (DROP TABLE usage_counters, subscriptions, plan_features, plans;).
-- Riesgo: bajo (solo tablas nuevas, no bloquea tablas existentes).
-- =====================================================================
CREATE TABLE IF NOT EXISTS "plans" (
	"id" text PRIMARY KEY NOT NULL,              -- 'basico' | 'plus' | 'pro'
	"nombre" text NOT NULL,
	"precio_mensual_usd_centavos" bigint NOT NULL,
	"ejemplo" boolean DEFAULT true NOT NULL,     -- datos no contractuales
	"modulos_rubro" text[] DEFAULT '{}'::text[] NOT NULL, -- ADR-0039
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plans_id_check" CHECK ("id" IN ('basico','plus','pro'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_features" (
	"plan_id" text NOT NULL,
	"feature" text NOT NULL,
	"incluida" boolean NOT NULL,
	"cupo_mensual" integer,                      -- NULL = sin techo definido
	CONSTRAINT "plan_features_pk" PRIMARY KEY ("plan_id","feature"),
	CONSTRAINT "plan_features_feature_check" CHECK ("feature" IN
	  ('nucleo','alertas_email','bot_consulta','alertas_whatsapp','bot_rubro','asistente_ia')),
	CONSTRAINT "plan_features_cupo_check" CHECK ("cupo_mensual" IS NULL OR "cupo_mensual" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"estado" text DEFAULT 'activa' NOT NULL,
	"desde" timestamp DEFAULT now() NOT NULL,
	"hasta" timestamp,
	"plan_programado" text,                      -- cambio de plan al próximo ciclo
	"proveedor" text DEFAULT 'manual' NOT NULL,  -- manual | mercadopago (pendiente)
	"proveedor_ref" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_estado_check" CHECK ("estado" IN ('activa','cancelada'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE RESTRICT ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_programado_plans_id_fk" FOREIGN KEY ("plan_programado") REFERENCES "public"."plans"("id") ON DELETE SET NULL ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_tenant_id_idx" ON "subscriptions" ("tenant_id");
--> statement-breakpoint
-- Una sola suscripción activa por tenant.
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_tenant_activa_uq" ON "subscriptions" ("tenant_id") WHERE "estado" = 'activa';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_counters" (
	"tenant_id" uuid NOT NULL,
	"mes" text NOT NULL,                         -- 'AAAA-MM'
	"feature" text NOT NULL,
	"usado" integer DEFAULT 0 NOT NULL,
	"costo_centavos" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usage_counters_pk" PRIMARY KEY ("tenant_id","mes","feature"),
	CONSTRAINT "usage_counters_mes_check" CHECK ("mes" ~ '^\d{4}-\d{2}$')
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TABLE "plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_features" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Semilla de EJEMPLO (PLANES_EJEMPLO). Idempotente.
INSERT INTO "plans" ("id","nombre","precio_mensual_usd_centavos","ejemplo","modulos_rubro") VALUES
 ('basico','Básico',1500,true,'{}'),
 ('plus','Plus',3500,true,'{quiosco}'),
 ('pro','Pro',5900,true,'{quiosco,pyme,fabrica}')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "plan_features" ("plan_id","feature","incluida","cupo_mensual") VALUES
 ('basico','nucleo',true,NULL),('basico','alertas_email',true,NULL),('basico','bot_consulta',true,100),
 ('basico','alertas_whatsapp',false,NULL),('basico','bot_rubro',false,NULL),('basico','asistente_ia',false,NULL),
 ('plus','nucleo',true,NULL),('plus','alertas_email',true,NULL),('plus','bot_consulta',true,NULL),
 ('plus','alertas_whatsapp',true,NULL),('plus','bot_rubro',true,NULL),('plus','asistente_ia',true,NULL),
 ('pro','nucleo',true,NULL),('pro','alertas_email',true,NULL),('pro','bot_consulta',true,NULL),
 ('pro','alertas_whatsapp',true,NULL),('pro','bot_rubro',true,NULL),('pro','asistente_ia',true,NULL)
ON CONFLICT ("plan_id","feature") DO NOTHING;
-- ROLLBACK 0025:
-- DROP TABLE IF EXISTS "usage_counters"; DROP TABLE IF EXISTS "subscriptions";
-- DROP TABLE IF EXISTS "plan_features"; DROP TABLE IF EXISTS "plans";
