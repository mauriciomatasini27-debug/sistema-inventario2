-- P10-90 (autorizado por Mauri 2026-11-21 03:56): tenant_id en service_accounts,
-- utility_bills, payees y payment_orders para que el job de retención borre las
-- de un comercio cerrado y los repos filtren por comercio.
-- Nullable: las filas viejas solo se completan cuando el comercio sale de una
-- relación con un único tenant posible; si no, quedan en null.
-- Idempotente: ADD COLUMN IF NOT EXISTS, UPDATE solo sobre tenant_id null.

--> statement-breakpoint
ALTER TABLE "service_accounts" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
ALTER TABLE "utility_bills" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
ALTER TABLE "payees" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
-- 1) payment_orders: por el egreso de caja (cash_movement_id) o la factura de
-- proveedor (supplier_invoice_id); solo si lo que se encuentra da un solo tenant.
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
-- 2) utility_bills: por el message-id de Gmail (borradores o cola de ingesta),
-- solo si ese mensaje lo tiene un único tenant.
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
-- 3) service_accounts: por sus facturas ya completadas, si todas son del mismo tenant.
UPDATE "service_accounts" sa SET "tenant_id" = d.tenant_id
FROM (
  SELECT account_id, min(tenant_id::text)::uuid AS tenant_id
  FROM "utility_bills"
  WHERE tenant_id IS NOT NULL
  GROUP BY account_id
  HAVING count(DISTINCT tenant_id) = 1
) d
WHERE sa.id = d.account_id AND sa.tenant_id IS NULL;
--> statement-breakpoint
-- 4) payees: por sus órdenes ya completadas, si todas son del mismo tenant.
UPDATE "payees" p SET "tenant_id" = d.tenant_id
FROM (
  SELECT payee_id, min(tenant_id::text)::uuid AS tenant_id
  FROM "payment_orders"
  WHERE tenant_id IS NOT NULL
  GROUP BY payee_id
  HAVING count(DISTINCT tenant_id) = 1
) d
WHERE p.id = d.payee_id AND p.tenant_id IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_accounts_tenant_idx" ON "service_accounts" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "utility_bills_tenant_idx" ON "utility_bills" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payees_tenant_idx" ON "payees" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_orders_tenant_idx" ON "payment_orders" ("tenant_id");
