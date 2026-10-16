-- =====================================================================
-- 0026_ai_usage  (PRD-IA-01 IA-S5, ADR-0045, ADR-0044)
-- Qué hace: registro por consulta al asistente IA: tokens de entrada/salida
--   y costo estimado en centavos, por tenant y mes, para cupo mensual.
-- Código que lo usa: src/modules/ia/registro.ts (UsoIA{tenantId, mes,
--   tokensEntrada, tokensSalida, costoCentavos}; hoy RegistroUsoIAMemoria),
--   src/modules/ia/proveedor.ts (ResultadoLLM tokens; ProveedorLLMFake, PR #118),
--   src/modules/ia/asistente.ts. Sin schema Drizzle aún.
--   Una fila = una consulta (usoDelMes cuenta filas como "consultas").
-- Reversible: sí (DROP TABLE). Perder filas = perder historial de consumo.
-- Riesgo: bajo (tabla nueva, append-only lógico; sin FK a usage_counters).
-- =====================================================================
CREATE TABLE IF NOT EXISTS "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"mes" text NOT NULL,                         -- 'AAAA-MM' (como UsoIA.mes)
	"proveedor" text,                            -- anthropic | openai | fake
	"modelo" text,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"costo_centavos" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_mes_check" CHECK ("mes" ~ '^\d{4}-\d{2}$'),
	CONSTRAINT "ai_usage_tokens_check" CHECK ("tokens_in" >= 0 AND "tokens_out" >= 0 AND "costo_centavos" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_tenant_mes_idx" ON "ai_usage" ("tenant_id","mes");
--> statement-breakpoint
ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;
-- Opcional (patrón 0001/0004): REVOKE UPDATE, DELETE ON "ai_usage" FROM PUBLIC;
-- ROLLBACK 0026: DROP TABLE IF EXISTS "ai_usage";
