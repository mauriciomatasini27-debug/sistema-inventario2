-- P1-96 (ADR-0122): correlativo D-* por comercio en la Postgres compartida (ADR-0116).
-- sale_returns no tenia tenant_id y numero_devolucion era UNIQUE global: en una
-- sola base el segundo comercio chocaba al emitir D-000001. Aditivo e idempotente.
ALTER TABLE "sale_returns" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
-- El dueño de la fila es el de su venta; sin venta conocida no se inventa tenant
-- y el SET NOT NULL de abajo falla: se revisa antes de aplicar en la base real.
UPDATE "sale_returns" sr SET "tenant_id" = s."tenant_id"
FROM "sales" s
WHERE sr."sale_id" = s."id" AND sr."tenant_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "sale_returns" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "sale_returns" DROP CONSTRAINT IF EXISTS "sale_returns_numero_devolucion_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sale_returns_tenant_numero_devolucion_unique" ON "sale_returns" ("tenant_id", "numero_devolucion");
--> statement-breakpoint
-- Serie devolucion por comercio: mismo lock FOR UPDATE que el resto de correlativos (ADR-0080).
-- GREATEST conserva un contador ya avanzado si la fila existia (nunca retrocede).
INSERT INTO "ticket_counters" ("tenant_id", "id", "ultimo")
SELECT sr."tenant_id", 'devolucion',
       COALESCE(MAX((substring(sr."numero_devolucion" from '^D-([0-9]+)$'))::integer), 0)
FROM "sale_returns" sr
GROUP BY sr."tenant_id"
ON CONFLICT ("tenant_id", "id")
DO UPDATE SET "ultimo" = GREATEST("ticket_counters"."ultimo", EXCLUDED."ultimo");
