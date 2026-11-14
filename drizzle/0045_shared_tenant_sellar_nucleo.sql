-- ADR-0116 cierre: backfill determinista de tenant_id, NOT NULL y uniques (tenant_id, …).
-- Regla backfill (documentada):
--   n=0 tenants → sin UPDATE; NOT NULL en tablas vacías OK.
--   n=1 → ese uuid en toda fila NULL del núcleo y pricing.
--   n>1 → inferir por relación (products.sku, sales.id, stock_counts.id, mp_preapproval, payload OCR);
--         resto → fallback = primer tenants.es_demo por creado_en, si no el tenant más viejo.
--   Si queda NULL con filas en la tabla → EXCEPTION con tabla.
-- Idempotente: IF NOT EXISTS en índices; DROP CONSTRAINT IF EXISTS.
-- Sin DROP de datos. Una transacción lógica por bloque DO.

--> statement-breakpoint
DO $bf$
DECLARE
  n_tenants int;
  tid_unico uuid;
  tid_fallback uuid;
  n_null int;
  n_dup int;
BEGIN
  SELECT count(*)::int INTO n_tenants FROM tenants;
  tid_unico := NULL;
  tid_fallback := NULL;
  IF n_tenants = 1 THEN
    SELECT id INTO tid_unico FROM tenants LIMIT 1;
    tid_fallback := tid_unico;
  ELSIF n_tenants > 1 THEN
    SELECT id INTO tid_fallback FROM tenants WHERE es_demo = true ORDER BY created_at ASC LIMIT 1;
    IF tid_fallback IS NULL THEN
      SELECT id INTO tid_fallback FROM tenants ORDER BY created_at ASC LIMIT 1;
    END IF;
  END IF;

  IF n_tenants > 0 THEN
  -- Núcleo: padres
    UPDATE products SET tenant_id = COALESCE(tid_unico, tid_fallback)
    WHERE tenant_id IS NULL;
    UPDATE sales SET tenant_id = COALESCE(tid_unico, tid_fallback)
    WHERE tenant_id IS NULL;

    UPDATE ticket_lines tl SET tenant_id = s.tenant_id
    FROM sales s WHERE tl.sale_id = s.id AND tl.tenant_id IS NULL AND s.tenant_id IS NOT NULL;
    UPDATE tickets t SET tenant_id = s.tenant_id
    FROM sales s WHERE t.sale_id = s.id AND t.tenant_id IS NULL AND s.tenant_id IS NOT NULL;
    UPDATE ticket_payments tp SET tenant_id = s.tenant_id
    FROM sales s WHERE tp.sale_id = s.id AND tp.tenant_id IS NULL AND s.tenant_id IS NOT NULL;

    UPDATE product_codes pc SET tenant_id = p.tenant_id
    FROM products p WHERE pc.sku = p.sku AND pc.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
    UPDATE stock_lots sl SET tenant_id = p.tenant_id
    FROM products p WHERE sl.sku = p.sku AND sl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
    UPDATE stock_movements sm SET tenant_id = p.tenant_id
    FROM products p WHERE sm.sku = p.sku AND sm.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
    UPDATE product_photos pp SET tenant_id = p.tenant_id
    FROM products p WHERE pp.sku = p.sku AND pp.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

    UPDATE stock_count_lines scl SET tenant_id = sc.tenant_id
    FROM stock_counts sc WHERE scl.count_id = sc.id AND scl.tenant_id IS NULL AND sc.tenant_id IS NOT NULL;

    UPDATE cash_movements cm SET tenant_id = s.tenant_id
    FROM sales s WHERE cm.sale_id = s.id AND cm.tenant_id IS NULL AND s.tenant_id IS NOT NULL;

    UPDATE cost_history ch SET tenant_id = p.tenant_id
    FROM products p WHERE ch.sku = p.sku AND ch.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
    UPDATE product_markups pm SET tenant_id = p.tenant_id
    FROM products p WHERE pm.sku = p.sku AND pm.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
    UPDATE price_overrides po SET tenant_id = p.tenant_id
    FROM products p WHERE po.sku = p.sku AND po.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
    UPDATE pricing_audit_log pal SET tenant_id = pa.tenant_id
    FROM price_adjustments pa
    WHERE pal.ajuste_id = pa.id AND pal.tenant_id IS NULL AND pa.tenant_id IS NOT NULL;
    UPDATE pricing_audit_log pal SET tenant_id = p.tenant_id
    FROM products p WHERE pal.sku = p.sku AND pal.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
    UPDATE price_adjustments adj SET tenant_id = sub.tid
    FROM (SELECT tenant_id AS tid FROM products WHERE tenant_id IS NOT NULL LIMIT 1) sub
    WHERE adj.tenant_id IS NULL AND sub.tid IS NOT NULL
      AND (SELECT count(DISTINCT tenant_id) FROM products WHERE tenant_id IS NOT NULL) = 1;

    UPDATE ocr_eventos e SET tenant_id = j.tenant_id
    FROM ocr_jobs j
    WHERE e.payload->>'job_id' = j.id::text AND e.tenant_id IS NULL AND j.tenant_id IS NOT NULL;

    UPDATE mp_webhook_events e SET tenant_id = v.tenant_id
    FROM mp_preapproval_tenants v
    WHERE e.preapproval_id = v.preapproval_id AND e.tenant_id IS NULL;

    UPDATE devices SET tenant_id = COALESCE(tid_unico, tid_fallback) WHERE tenant_id IS NULL;
    UPDATE device_pins SET tenant_id = COALESCE(tid_unico, tid_fallback) WHERE tenant_id IS NULL;
    UPDATE ticket_counters SET tenant_id = COALESCE(tid_unico, tid_fallback) WHERE tenant_id IS NULL;
    UPDATE inventory_counts SET tenant_id = COALESCE(tid_unico, tid_fallback) WHERE tenant_id IS NULL;
    UPDATE stock_counts SET tenant_id = COALESCE(tid_unico, tid_fallback) WHERE tenant_id IS NULL;
    UPDATE stock_imports SET tenant_id = COALESCE(tid_unico, tid_fallback) WHERE tenant_id IS NULL;
    UPDATE locations SET tenant_id = COALESCE(tid_unico, tid_fallback) WHERE tenant_id IS NULL;
    UPDATE cash_qr_receipts SET tenant_id = COALESCE(tid_unico, tid_fallback) WHERE tenant_id IS NULL;
    UPDATE cash_due_items SET tenant_id = COALESCE(tid_unico, tid_fallback) WHERE tenant_id IS NULL;
    UPDATE outbox SET tenant_id = COALESCE(tid_unico, tid_fallback) WHERE tenant_id IS NULL;
    UPDATE id_mappings SET tenant_id = COALESCE(tid_unico, tid_fallback) WHERE tenant_id IS NULL;
    UPDATE ocr_jobs SET tenant_id = COALESCE(tid_unico, tid_fallback) WHERE tenant_id IS NULL;
    UPDATE price_settings SET tenant_id = COALESCE(tid_unico, tid_fallback) WHERE tenant_id IS NULL;
    UPDATE pricing_audit_log SET tenant_id = COALESCE(tid_unico, tid_fallback) WHERE tenant_id IS NULL;

    UPDATE ticket_lines SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE tickets SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE ticket_payments SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE product_codes SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE stock_lots SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE stock_movements SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE product_photos SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE stock_count_lines SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE cash_movements SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE cost_history SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE product_markups SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE price_overrides SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE price_adjustments SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE pricing_audit_log SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE ocr_eventos SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE mp_webhook_events SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE sales SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE products SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
  END IF;

  -- Duplicados que impedirían uniques compuestos (sólo si hay filas)
  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, sku FROM products GROUP BY tenant_id, sku HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0045: duplicados (tenant_id, sku) en products: % grupos', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, device_code FROM devices GROUP BY tenant_id, device_code HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0045: duplicados (tenant_id, device_code) en devices: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, idempotency_key FROM sales GROUP BY tenant_id, idempotency_key HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0045: duplicados (tenant_id, idempotency_key) en sales: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, definitivo FROM tickets WHERE definitivo IS NOT NULL
    GROUP BY tenant_id, definitivo HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0045: duplicados (tenant_id, definitivo) en tickets: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, idempotency_key FROM cash_movements GROUP BY tenant_id, idempotency_key HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0045: duplicados (tenant_id, idempotency_key) en cash_movements: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, codigo FROM product_codes GROUP BY tenant_id, codigo HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0045: duplicados (tenant_id, codigo) en product_codes: %', n_dup; END IF;
END
$bf$;
--> statement-breakpoint
-- NULL restantes por tabla (sólo si hay tenants; tablas vacías pasan)
DO $nullguard$
DECLARE
  rec record;
  n_null int;
BEGIN
  FOR rec IN
    SELECT unnest(ARRAY[
      'products','inventory_counts','devices','device_pins','sales','tickets','ticket_counters',
      'ticket_lines','cash_movements','outbox','id_mappings','product_codes','stock_lots','stock_movements',
      'stock_imports','product_photos','locations','stock_counts','stock_count_lines','cash_qr_receipts',
      'cash_due_items','ticket_payments','ocr_jobs','ocr_eventos','mp_webhook_events',
      'cost_history','product_markups','price_settings','price_overrides','price_adjustments','pricing_audit_log'
    ]) AS tabla
  LOOP
    EXECUTE format('SELECT count(*)::int FROM %I WHERE tenant_id IS NULL', rec.tabla) INTO n_null;
    IF n_null > 0 THEN
      RAISE EXCEPTION '0045: tabla % tiene % filas con tenant_id NULL tras backfill', rec.tabla, n_null;
    END IF;
  END LOOP;
END
$nullguard$;
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_sku_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_tenant_sku_uq" ON "products" ("tenant_id", "sku");
--> statement-breakpoint
ALTER TABLE "devices" DROP CONSTRAINT IF EXISTS "devices_device_code_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "devices_tenant_device_code_uq" ON "devices" ("tenant_id", "device_code");
--> statement-breakpoint
ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "sales_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sales_tenant_idempotency_uq" ON "sales" ("tenant_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_definitivo_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tickets_tenant_definitivo_uq" ON "tickets" ("tenant_id", "definitivo") WHERE "definitivo" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "cash_movements" DROP CONSTRAINT IF EXISTS "cash_movements_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_movements_tenant_idempotency_uq" ON "cash_movements" ("tenant_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "inventory_counts" DROP CONSTRAINT IF EXISTS "inventory_counts_idem_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_counts_tenant_idem_uq" ON "inventory_counts" ("tenant_id", "idem_key");
--> statement-breakpoint
ALTER TABLE "stock_imports" DROP CONSTRAINT IF EXISTS "stock_imports_idem_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stock_imports_tenant_idem_uq" ON "stock_imports" ("tenant_id", "idem_key");
--> statement-breakpoint
ALTER TABLE "stock_counts" DROP CONSTRAINT IF EXISTS "stock_counts_idem_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stock_counts_tenant_idem_uq" ON "stock_counts" ("tenant_id", "idem_key");
--> statement-breakpoint
ALTER TABLE "cash_qr_receipts" DROP CONSTRAINT IF EXISTS "cash_qr_receipts_numero_operacion_unique";
--> statement-breakpoint
ALTER TABLE "cash_qr_receipts" DROP CONSTRAINT IF EXISTS "cash_qr_receipts_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_qr_receipts_tenant_numero_uq" ON "cash_qr_receipts" ("tenant_id", "numero_operacion");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_qr_receipts_tenant_idempotency_uq" ON "cash_qr_receipts" ("tenant_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "ocr_jobs" DROP CONSTRAINT IF EXISTS "ocr_jobs_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ocr_jobs_tenant_idempotency_uq" ON "ocr_jobs" ("tenant_id", "idempotency_key");
--> statement-breakpoint
DROP INDEX IF EXISTS "locations_nombre_lower_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "locations_tenant_nombre_lower_uq" ON "locations" ("tenant_id", lower("nombre"));
--> statement-breakpoint
ALTER TABLE "product_codes" DROP CONSTRAINT IF EXISTS "product_codes_pkey";
--> statement-breakpoint
ALTER TABLE "product_codes" ADD CONSTRAINT "product_codes_pkey" PRIMARY KEY ("tenant_id", "codigo");
--> statement-breakpoint
ALTER TABLE "device_pins" DROP CONSTRAINT IF EXISTS "device_pins_pkey";
--> statement-breakpoint
ALTER TABLE "device_pins" ADD CONSTRAINT "device_pins_pkey" PRIMARY KEY ("tenant_id", "device_code");
--> statement-breakpoint
ALTER TABLE "ticket_counters" DROP CONSTRAINT IF EXISTS "ticket_counters_pkey";
--> statement-breakpoint
ALTER TABLE "ticket_counters" ADD CONSTRAINT "ticket_counters_pkey" PRIMARY KEY ("tenant_id", "id");
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "inventory_counts" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "devices" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "device_pins" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ticket_counters" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ticket_lines" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "cash_movements" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "outbox" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "id_mappings" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "product_codes" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_lots" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_imports" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "product_photos" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "locations" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_counts" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_count_lines" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "cash_qr_receipts" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "cash_due_items" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ticket_payments" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ocr_jobs" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ocr_eventos" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "mp_webhook_events" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "cost_history" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "product_markups" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "price_settings" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "price_overrides" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "price_adjustments" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "pricing_audit_log" ALTER COLUMN "tenant_id" SET NOT NULL;

-- ROLLBACK 0045: no soportado sin backup; requiere revertir PKs y uniques a mano.