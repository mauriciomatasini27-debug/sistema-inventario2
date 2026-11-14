-- P1-81 / ADR-0116: tenant_id NOT NULL, backfill y uniques (tenant_id, …) en
-- datos periféricos (fiado, caja meta, proveedores, email, alertas, fiscal).
-- Idempotente: IF NOT EXISTS; DROP CONSTRAINT IF EXISTS.
-- Backfill: misma regla que 0045 (n=0, n=1, n>1 + joins + fallback demo/viejo).

--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_tenant_id_idx" ON "customers" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "customer_movements" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_movements_tenant_id_idx" ON "customer_movements" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "cash_days" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_days_tenant_id_idx" ON "cash_days" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "closing_summaries" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "closing_summaries_tenant_id_idx" ON "closing_summaries" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "shift_handovers" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shift_handovers_tenant_id_idx" ON "shift_handovers" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "handover_counts" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "handover_counts_tenant_id_idx" ON "handover_counts" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "cash_drawer_drops" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_drawer_drops_tenant_id_idx" ON "cash_drawer_drops" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "cash_reversals" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_reversals_tenant_id_idx" ON "cash_reversals" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "cash_audit_log" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_audit_log_tenant_id_idx" ON "cash_audit_log" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suppliers_tenant_id_idx" ON "suppliers" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_tenant_id_idx" ON "purchase_orders" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_order_lines_tenant_id_idx" ON "purchase_order_lines" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "supplier_drafts" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_drafts_tenant_id_idx" ON "supplier_drafts" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoices_tenant_id_idx" ON "supplier_invoices" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_payments_tenant_id_idx" ON "supplier_payments" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "supplier_match_log" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_match_log_tenant_id_idx" ON "supplier_match_log" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "proveedor_cupo" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proveedor_cupo_tenant_id_idx" ON "proveedor_cupo" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_deliveries_tenant_id_idx" ON "notification_deliveries" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "delivery_status" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_status_tenant_id_idx" ON "delivery_status" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "fiscal_customers" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fiscal_customers_tenant_id_idx" ON "fiscal_customers" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "fiscal_sequences" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fiscal_sequences_tenant_id_idx" ON "fiscal_sequences" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "product_aliases" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_aliases_tenant_id_idx" ON "product_aliases" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "whatsapp_usage" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_usage_tenant_id_idx" ON "whatsapp_usage" ("tenant_id");
--> statement-breakpoint
DO $bf$
DECLARE
  n_tenants int;
  tid_unico uuid;
  tid_fallback uuid;
  n_dup int;
BEGIN
  SELECT count(*)::int INTO n_tenants FROM tenants;
  tid_unico := NULL;
  tid_fallback := NULL;
  IF n_tenants = 1 THEN
    SELECT id INTO tid_unico FROM tenants LIMIT 1;
    tid_fallback := tid_unico;
  ELSIF n_tenants > 1 THEN
    SELECT id INTO tid_fallback FROM tenants WHERE es_demo = true ORDER BY created_at ASC, id ASC LIMIT 1;
    IF tid_fallback IS NULL THEN
      SELECT id INTO tid_fallback FROM tenants ORDER BY created_at ASC, id ASC LIMIT 1;
    END IF;
  END IF;

  IF n_tenants > 0 THEN
    UPDATE customer_movements cm SET tenant_id = s.tenant_id
    FROM sales s WHERE cm.sale_id = s.id AND cm.tenant_id IS NULL AND s.tenant_id IS NOT NULL;
    UPDATE customer_movements cm SET tenant_id = c.tenant_id
    FROM customers c WHERE cm.customer_id = c.id::text AND cm.tenant_id IS NULL AND c.tenant_id IS NOT NULL;
    UPDATE customers SET tenant_id = COALESCE(tid_unico, tid_fallback) WHERE tenant_id IS NULL;

    UPDATE cash_reversals cr SET tenant_id = cm.tenant_id
    FROM cash_movements cm WHERE cr.movimiento_id = cm.id AND cr.tenant_id IS NULL AND cm.tenant_id IS NOT NULL;
    UPDATE cash_audit_log cal SET tenant_id = cm.tenant_id
    FROM cash_movements cm WHERE cal.movimiento_id = cm.id AND cal.tenant_id IS NULL AND cm.tenant_id IS NOT NULL;

    UPDATE handover_counts hc SET tenant_id = sh.tenant_id
    FROM shift_handovers sh WHERE hc.handover_id = sh.id AND hc.tenant_id IS NULL AND sh.tenant_id IS NOT NULL;

    UPDATE purchase_order_lines pol SET tenant_id = po.tenant_id
    FROM purchase_orders po WHERE pol.order_id = po.id AND pol.tenant_id IS NULL AND po.tenant_id IS NOT NULL;

    UPDATE notification_deliveries nd SET tenant_id = ne.tenant_id
    FROM notification_events ne WHERE nd.event_id = ne.id AND nd.tenant_id IS NULL AND ne.tenant_id IS NOT NULL;
    UPDATE delivery_status ds SET tenant_id = eo.tenant_id
    FROM email_outbox eo WHERE ds.outbox_id = eo.id AND ds.tenant_id IS NULL AND eo.tenant_id IS NOT NULL;

    UPDATE fiscal_documents SET tenant_id = COALESCE(tenant_id, tid_fallback::text)
    WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE fiscal_settings SET tenant_id = COALESCE(tenant_id, tid_fallback::text)
    WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;

    UPDATE customer_movements SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE customers SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE cash_days SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE closing_summaries SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE shift_handovers SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE handover_counts SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE cash_drawer_drops SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE cash_reversals SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE cash_audit_log SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE suppliers SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE purchase_orders SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE purchase_order_lines SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE supplier_drafts SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE supplier_invoices SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE supplier_payments SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE supplier_match_log SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE proveedor_cupo SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE notification_events SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE email_outbox SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE notification_deliveries SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE delivery_status SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE fiscal_customers SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE fiscal_sequences SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE product_aliases SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE whatsapp_usage SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE notification_preferences SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
  END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, cuit FROM suppliers GROUP BY tenant_id, cuit HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0047: duplicados (tenant_id, cuit) en suppliers: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, idempotency_key FROM customer_movements GROUP BY tenant_id, idempotency_key HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0047: duplicados (tenant_id, idempotency_key) en customer_movements: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, dedupe_key FROM notification_events GROUP BY tenant_id, dedupe_key HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0047: duplicados (tenant_id, dedupe_key) en notification_events: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, idempotency_key FROM email_outbox GROUP BY tenant_id, idempotency_key HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0047: duplicados (tenant_id, idempotency_key) en email_outbox: %', n_dup; END IF;
END
$bf$;

--> statement-breakpoint
DO $nullguard$
DECLARE
  rec record;
  n_null int;
BEGIN
  FOR rec IN
    SELECT unnest(ARRAY[
      'customers','customer_movements','cash_days','closing_summaries','shift_handovers',
      'handover_counts','cash_drawer_drops','cash_reversals','cash_audit_log',
      'suppliers','purchase_orders','purchase_order_lines','supplier_drafts','supplier_invoices',
      'supplier_payments','supplier_match_log','proveedor_cupo',
      'notification_events','notification_deliveries','email_outbox','delivery_status',
      'fiscal_customers','fiscal_sequences','product_aliases','whatsapp_usage','notification_preferences'
    ]) AS tabla
  LOOP
    IF to_regclass(format('public.%I', rec.tabla)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*)::int FROM %I WHERE tenant_id IS NULL', rec.tabla) INTO n_null;
    IF n_null > 0 THEN
      RAISE EXCEPTION '0047: tabla % tiene % filas con tenant_id NULL tras backfill', rec.tabla, n_null;
    END IF;
  END LOOP;
END
$nullguard$;

--> statement-breakpoint
ALTER TABLE "customer_movements" DROP CONSTRAINT IF EXISTS "customer_movements_idempotency_key_unique";
--> statement-breakpoint
ALTER TABLE "customer_movements" DROP CONSTRAINT IF EXISTS "customer_movements_revierte_a_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_movements_tenant_idempotency_uq" ON "customer_movements" ("tenant_id", "idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_movements_tenant_revierte_uq" ON "customer_movements" ("tenant_id", "revierte_a") WHERE "revierte_a" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "cash_days" DROP CONSTRAINT IF EXISTS "cash_days_fecha_jornada_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_days_tenant_fecha_uq" ON "cash_days" ("tenant_id", "fecha_jornada");
--> statement-breakpoint
ALTER TABLE "closing_summaries" DROP CONSTRAINT IF EXISTS "closing_summaries_idempotency_key_unique";
--> statement-breakpoint
ALTER TABLE "closing_summaries" DROP CONSTRAINT IF EXISTS "closing_summaries_fecha_jornada_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "closing_summaries_tenant_idempotency_uq" ON "closing_summaries" ("tenant_id", "idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "closing_summaries_tenant_fecha_uq" ON "closing_summaries" ("tenant_id", "fecha_jornada");
--> statement-breakpoint
ALTER TABLE "shift_handovers" DROP CONSTRAINT IF EXISTS "shift_handovers_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shift_handovers_tenant_idempotency_uq" ON "shift_handovers" ("tenant_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "cash_drawer_drops" DROP CONSTRAINT IF EXISTS "cash_drawer_drops_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_drawer_drops_tenant_idempotency_uq" ON "cash_drawer_drops" ("tenant_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "cash_reversals" DROP CONSTRAINT IF EXISTS "cash_reversals_idempotency_key_unique";
--> statement-breakpoint
ALTER TABLE "cash_reversals" DROP CONSTRAINT IF EXISTS "cash_reversals_revierte_a_unique";
--> statement-breakpoint
ALTER TABLE "cash_reversals" DROP CONSTRAINT IF EXISTS "cash_reversals_movimiento_id_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_reversals_tenant_idempotency_uq" ON "cash_reversals" ("tenant_id", "idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_reversals_tenant_revierte_uq" ON "cash_reversals" ("tenant_id", "revierte_a");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_reversals_tenant_movimiento_uq" ON "cash_reversals" ("tenant_id", "movimiento_id");
--> statement-breakpoint
ALTER TABLE "suppliers" DROP CONSTRAINT IF EXISTS "suppliers_cuit_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_tenant_cuit_uq" ON "suppliers" ("tenant_id", "cuit");
--> statement-breakpoint
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_orders_tenant_idempotency_uq" ON "purchase_orders" ("tenant_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "supplier_drafts" DROP CONSTRAINT IF EXISTS "supplier_drafts_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_drafts_tenant_idempotency_uq" ON "supplier_drafts" ("tenant_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "supplier_invoices" DROP CONSTRAINT IF EXISTS "supplier_invoices_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_invoices_tenant_idempotency_uq" ON "supplier_invoices" ("tenant_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "supplier_payments" DROP CONSTRAINT IF EXISTS "supplier_payments_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_payments_tenant_idempotency_uq" ON "supplier_payments" ("tenant_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "notification_events" DROP CONSTRAINT IF EXISTS "notification_events_dedupe_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_events_tenant_dedupe_uq" ON "notification_events" ("tenant_id", "dedupe_key");
--> statement-breakpoint
ALTER TABLE "notification_deliveries" DROP CONSTRAINT IF EXISTS "notification_deliveries_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_deliveries_tenant_idempotency_uq" ON "notification_deliveries" ("tenant_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "email_outbox" DROP CONSTRAINT IF EXISTS "email_outbox_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_outbox_tenant_idempotency_uq" ON "email_outbox" ("tenant_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "fiscal_documents" DROP CONSTRAINT IF EXISTS "fiscal_documents_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_documents_tenant_idempotency_uq" ON "fiscal_documents" ("tenant_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "fiscal_sequences" DROP CONSTRAINT IF EXISTS "fiscal_sequences_pkey";
--> statement-breakpoint
ALTER TABLE "fiscal_sequences" ADD CONSTRAINT "fiscal_sequences_pkey" PRIMARY KEY ("tenant_id", "punto_venta", "cbte_tipo");
--> statement-breakpoint
ALTER TABLE "proveedor_contactos" DROP CONSTRAINT IF EXISTS "proveedor_contactos_pkey";
--> statement-breakpoint
ALTER TABLE "proveedor_contactos" ADD CONSTRAINT "proveedor_contactos_pkey" PRIMARY KEY ("tenant_id", "numero_e164");
--> statement-breakpoint
ALTER TABLE "proveedor_cupo" DROP CONSTRAINT IF EXISTS "proveedor_cupo_pkey";
--> statement-breakpoint
ALTER TABLE "proveedor_cupo" ADD CONSTRAINT "proveedor_cupo_pkey" PRIMARY KEY ("tenant_id", "numero_e164");
--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "customer_movements" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "cash_days" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "closing_summaries" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "shift_handovers" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "handover_counts" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "cash_drawer_drops" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "cash_reversals" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "cash_audit_log" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "suppliers" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "supplier_drafts" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "supplier_invoices" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "supplier_payments" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "supplier_match_log" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "proveedor_cupo" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_events" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_outbox" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "delivery_status" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "fiscal_customers" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "fiscal_sequences" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "product_aliases" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "whatsapp_usage" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "tenant_id" SET NOT NULL;

-- ROLLBACK 0047: no soportado sin backup; requiere revertir PKs y uniques a mano.