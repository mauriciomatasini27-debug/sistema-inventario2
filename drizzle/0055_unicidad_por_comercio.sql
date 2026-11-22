-- ADR-0123 (autorizada por Mauri 2026-11-22): unicidad por comercio de
-- utility_bills.message_id y payment_orders.numero / idempotency_key.
-- En la Postgres compartida (ADR-0116) el aislamiento es por fila: dos comercios
-- pueden compartir el message-id de un correo o el correlativo OP-####.
-- Las filas cuyo comercio no se pudo resolver en 0053 conservan la protección
-- global con un índice parcial. Aditiva, idempotente y sin borrar filas.

UPDATE "payment_orders" po SET "tenant_id" = d.tenant_id
FROM (
  SELECT o.id, min(x.tenant_id::text)::uuid AS tenant_id
  FROM "payment_orders" o
  JOIN (
    SELECT o2.id AS orden_id, cm.tenant_id FROM "payment_orders" o2 JOIN "cash_movements" cm ON cm.id = o2.cash_movement_id
    UNION ALL
    SELECT o3.id, si.tenant_id FROM "payment_orders" o3 JOIN "supplier_invoices" si ON si.id::text = o3.supplier_invoice_id
  ) x ON x.orden_id = o.id
  WHERE o.tenant_id IS NULL AND x.tenant_id IS NOT NULL
  GROUP BY o.id
  HAVING count(DISTINCT x.tenant_id) = 1
) d
WHERE po.id = d.id AND po.tenant_id IS NULL;
--> statement-breakpoint
UPDATE "utility_bills" ub SET "tenant_id" = d.tenant_id
FROM (
  SELECT x.message_id, min(x.tenant_id::text)::uuid AS tenant_id
  FROM (
    SELECT message_id, tenant_id FROM "email_ingestion_drafts" WHERE message_id IS NOT NULL
    UNION ALL
    SELECT message_id, tenant_id FROM "gmail_ingestion_jobs" WHERE message_id IS NOT NULL
  ) x
  GROUP BY x.message_id
  HAVING count(DISTINCT x.tenant_id) = 1
) d
WHERE ub.message_id = d.message_id AND ub.tenant_id IS NULL;
--> statement-breakpoint
ALTER TABLE "utility_bills" DROP CONSTRAINT IF EXISTS "utility_bills_message_id_unique";
--> statement-breakpoint
ALTER TABLE "payment_orders" DROP CONSTRAINT IF EXISTS "payment_orders_numero_unique";
--> statement-breakpoint
ALTER TABLE "payment_orders" DROP CONSTRAINT IF EXISTS "payment_orders_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "utility_bills_tenant_message_id_unique" ON "utility_bills" ("tenant_id", "message_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_orders_tenant_numero_unique" ON "payment_orders" ("tenant_id", "numero");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_orders_tenant_idempotency_key_unique" ON "payment_orders" ("tenant_id", "idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "utility_bills_message_id_legacy_unique" ON "utility_bills" ("message_id") WHERE "tenant_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_orders_numero_legacy_unique" ON "payment_orders" ("numero") WHERE "tenant_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_orders_idempotency_key_legacy_unique" ON "payment_orders" ("idempotency_key") WHERE "tenant_id" IS NULL;
