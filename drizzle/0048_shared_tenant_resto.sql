-- P1-83 / ADR-0116 / #207: tenant_id NOT NULL en tickets auxiliares, pagos,
-- servicios, analytics, whatsapp_sessions; fiscal_documents/settings a uuid.
-- Aditiva e idempotente. ROLLBACK: no soportado sin backup.

ALTER TABLE "ticket_discounts" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_discounts_tenant_id_idx" ON "ticket_discounts" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "sale_returns" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sale_returns_tenant_id_idx" ON "sale_returns" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "ticket_payment_corrections" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_payment_corrections_tenant_id_idx" ON "ticket_payment_corrections" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "ticket_links" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_links_tenant_id_idx" ON "ticket_links" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "ticket_link_revocations" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_link_revocations_tenant_id_idx" ON "ticket_link_revocations" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "service_accounts" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_accounts_tenant_id_idx" ON "service_accounts" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "utility_bills" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "utility_bills_tenant_id_idx" ON "utility_bills" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "email_ingestion_filters" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_ingestion_filters_tenant_id_idx" ON "email_ingestion_filters" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "email_ingestion_log" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_ingestion_log_tenant_id_idx" ON "email_ingestion_log" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "payees" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payees_tenant_id_idx" ON "payees" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_orders_tenant_id_idx" ON "payment_orders" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "payment_order_events" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_order_events_tenant_id_idx" ON "payment_order_events" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "rotation_settings" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rotation_settings_tenant_id_idx" ON "rotation_settings" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "product_flags" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_flags_tenant_id_idx" ON "product_flags" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "rotation_snapshots" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rotation_snapshots_tenant_id_idx" ON "rotation_snapshots" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "report_exports" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_exports_tenant_id_idx" ON "report_exports" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "promo_intents" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promo_intents_tenant_id_idx" ON "promo_intents" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "whatsapp_sessions" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_sessions_tenant_id_idx" ON "whatsapp_sessions" ("tenant_id");

--> statement-breakpoint
DO $bf$
DECLARE
  n_tenants int;
  tid_fallback uuid;
  n_dup int;
BEGIN
  SELECT count(*)::int INTO n_tenants FROM tenants;
  tid_fallback := NULL;
  IF n_tenants = 1 THEN
    SELECT id INTO tid_fallback FROM tenants LIMIT 1;
  ELSIF n_tenants > 1 THEN
    SELECT id INTO tid_fallback FROM tenants WHERE es_demo = true ORDER BY created_at ASC, id ASC LIMIT 1;
    IF tid_fallback IS NULL THEN
      SELECT id INTO tid_fallback FROM tenants ORDER BY created_at ASC, id ASC LIMIT 1;
    END IF;
  END IF;

  IF n_tenants > 0 THEN
    -- sales ya tiene tenant_id (0045). El resto de padres nace en esta migración.
    UPDATE ticket_discounts td SET tenant_id = s.tenant_id
      FROM sales s WHERE td.sale_id = s.id AND td.tenant_id IS NULL AND s.tenant_id IS NOT NULL;
    UPDATE sale_returns sr SET tenant_id = s.tenant_id
      FROM sales s WHERE sr.sale_id = s.id AND sr.tenant_id IS NULL AND s.tenant_id IS NOT NULL;
    UPDATE ticket_payment_corrections tpc SET tenant_id = s.tenant_id
      FROM sales s WHERE tpc.sale_id = s.id AND tpc.tenant_id IS NULL AND s.tenant_id IS NOT NULL;
    UPDATE ticket_links tl SET tenant_id = s.tenant_id
      FROM sales s WHERE tl.sale_id = s.id AND tl.tenant_id IS NULL AND s.tenant_id IS NOT NULL;
    UPDATE ticket_link_revocations tlr SET tenant_id = s.tenant_id
      FROM sales s WHERE tlr.sale_id = s.id AND tlr.tenant_id IS NULL AND s.tenant_id IS NOT NULL;

    UPDATE service_accounts SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE payees SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;

    UPDATE utility_bills ub SET tenant_id = sa.tenant_id
      FROM service_accounts sa WHERE ub.account_id = sa.id AND ub.tenant_id IS NULL AND sa.tenant_id IS NOT NULL;
    UPDATE email_ingestion_log eil SET tenant_id = sa.tenant_id
      FROM service_accounts sa WHERE eil.account_id = sa.id AND eil.tenant_id IS NULL AND sa.tenant_id IS NOT NULL;
    UPDATE payment_orders po SET tenant_id = p.tenant_id
      FROM payees p WHERE po.payee_id = p.id AND po.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
    UPDATE payment_order_events poe SET tenant_id = po.tenant_id
      FROM payment_orders po WHERE poe.payment_order_id = po.id AND poe.tenant_id IS NULL AND po.tenant_id IS NOT NULL;

    UPDATE ticket_discounts SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE sale_returns SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE ticket_payment_corrections SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE ticket_links SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE ticket_link_revocations SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE utility_bills SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE email_ingestion_filters SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE email_ingestion_log SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE payment_orders SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE payment_order_events SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE rotation_settings SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE product_flags SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE rotation_snapshots SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE report_exports SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE promo_intents SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
    UPDATE whatsapp_sessions SET tenant_id = tid_fallback WHERE tenant_id IS NULL AND tid_fallback IS NOT NULL;
  END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, idempotency_key FROM sale_returns WHERE tenant_id IS NOT NULL
    GROUP BY tenant_id, idempotency_key HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0048: duplicados (tenant_id, idempotency_key) en sale_returns: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, numero_devolucion FROM sale_returns WHERE tenant_id IS NOT NULL
    GROUP BY tenant_id, numero_devolucion HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0048: duplicados (tenant_id, numero_devolucion) en sale_returns: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, numero FROM payment_orders WHERE tenant_id IS NOT NULL
    GROUP BY tenant_id, numero HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0048: duplicados (tenant_id, numero) en payment_orders: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, idempotency_key FROM payment_orders WHERE tenant_id IS NOT NULL
    GROUP BY tenant_id, idempotency_key HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0048: duplicados (tenant_id, idempotency_key) en payment_orders: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, idempotency_key FROM ticket_payment_corrections WHERE tenant_id IS NOT NULL
    GROUP BY tenant_id, idempotency_key HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0048: duplicados (tenant_id, idempotency_key) en ticket_payment_corrections: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, idempotency_key FROM ticket_links WHERE tenant_id IS NOT NULL
    GROUP BY tenant_id, idempotency_key HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0048: duplicados (tenant_id, idempotency_key) en ticket_links: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, idempotency_key FROM ticket_link_revocations WHERE tenant_id IS NOT NULL
    GROUP BY tenant_id, idempotency_key HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0048: duplicados (tenant_id, idempotency_key) en ticket_link_revocations: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, message_id FROM utility_bills WHERE tenant_id IS NOT NULL
    GROUP BY tenant_id, message_id HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0048: duplicados (tenant_id, message_id) en utility_bills: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, message_id FROM email_ingestion_log WHERE tenant_id IS NOT NULL
    GROUP BY tenant_id, message_id HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0048: duplicados (tenant_id, message_id) en email_ingestion_log: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, dedupe_key FROM rotation_snapshots WHERE tenant_id IS NOT NULL
    GROUP BY tenant_id, dedupe_key HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0048: duplicados (tenant_id, dedupe_key) en rotation_snapshots: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, idempotency_key FROM report_exports WHERE tenant_id IS NOT NULL
    GROUP BY tenant_id, idempotency_key HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0048: duplicados (tenant_id, idempotency_key) en report_exports: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, idempotency_key FROM promo_intents WHERE tenant_id IS NOT NULL
    GROUP BY tenant_id, idempotency_key HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0048: duplicados (tenant_id, idempotency_key) en promo_intents: %', n_dup; END IF;

  SELECT count(*)::int INTO n_dup FROM (
    SELECT tenant_id, numero_e164 FROM whatsapp_sessions WHERE tenant_id IS NOT NULL
    GROUP BY tenant_id, numero_e164 HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN RAISE EXCEPTION '0048: duplicados (tenant_id, numero_e164) en whatsapp_sessions: %', n_dup; END IF;
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
      'ticket_discounts','sale_returns','ticket_payment_corrections','ticket_links','ticket_link_revocations',
      'service_accounts','utility_bills','email_ingestion_filters','email_ingestion_log',
      'payees','payment_orders','payment_order_events',
      'rotation_settings','product_flags','rotation_snapshots','report_exports','promo_intents',
      'whatsapp_sessions'
    ]) AS tabla
  LOOP
    IF to_regclass(format('public.%I', rec.tabla)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*)::int FROM %I WHERE tenant_id IS NULL', rec.tabla) INTO n_null;
    IF n_null > 0 THEN
      RAISE EXCEPTION '0048: tabla % tiene % filas con tenant_id NULL tras backfill', rec.tabla, n_null;
    END IF;
  END LOOP;
END
$nullguard$;

--> statement-breakpoint
ALTER TABLE "sale_returns" DROP CONSTRAINT IF EXISTS "sale_returns_idempotency_key_unique";
--> statement-breakpoint
ALTER TABLE "sale_returns" DROP CONSTRAINT IF EXISTS "sale_returns_numero_devolucion_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sale_returns_tenant_idempotency_uq" ON "sale_returns" ("tenant_id", "idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sale_returns_tenant_numero_uq" ON "sale_returns" ("tenant_id", "numero_devolucion");
--> statement-breakpoint
ALTER TABLE "ticket_payment_corrections" DROP CONSTRAINT IF EXISTS "ticket_payment_corrections_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_payment_corrections_tenant_idempotency_uq" ON "ticket_payment_corrections" ("tenant_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "ticket_links" DROP CONSTRAINT IF EXISTS "ticket_links_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_links_tenant_idempotency_uq" ON "ticket_links" ("tenant_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "ticket_link_revocations" DROP CONSTRAINT IF EXISTS "ticket_link_revocations_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_link_revocations_tenant_idempotency_uq" ON "ticket_link_revocations" ("tenant_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "utility_bills" DROP CONSTRAINT IF EXISTS "utility_bills_message_id_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "utility_bills_tenant_message_uq" ON "utility_bills" ("tenant_id", "message_id");
--> statement-breakpoint
ALTER TABLE "email_ingestion_log" DROP CONSTRAINT IF EXISTS "email_ingestion_log_message_id_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_ingestion_log_tenant_message_uq" ON "email_ingestion_log" ("tenant_id", "message_id");
--> statement-breakpoint
ALTER TABLE "payment_orders" DROP CONSTRAINT IF EXISTS "payment_orders_idempotency_key_unique";
--> statement-breakpoint
ALTER TABLE "payment_orders" DROP CONSTRAINT IF EXISTS "payment_orders_numero_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_orders_tenant_idempotency_uq" ON "payment_orders" ("tenant_id", "idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_orders_tenant_numero_uq" ON "payment_orders" ("tenant_id", "numero");
--> statement-breakpoint
ALTER TABLE "rotation_snapshots" DROP CONSTRAINT IF EXISTS "rotation_snapshots_dedupe_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rotation_snapshots_tenant_dedupe_uq" ON "rotation_snapshots" ("tenant_id", "dedupe_key");
--> statement-breakpoint
ALTER TABLE "report_exports" DROP CONSTRAINT IF EXISTS "report_exports_idempotency_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "report_exports_tenant_idempotency_uq" ON "report_exports" ("tenant_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "promo_intents" DROP CONSTRAINT IF EXISTS "promo_intents_pkey";
--> statement-breakpoint
ALTER TABLE "promo_intents" ADD CONSTRAINT "promo_intents_pkey" PRIMARY KEY ("tenant_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "whatsapp_sessions" DROP CONSTRAINT IF EXISTS "whatsapp_sessions_numero_e164_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_sessions_tenant_numero_uq" ON "whatsapp_sessions" ("tenant_id", "numero_e164");

--> statement-breakpoint
ALTER TABLE "ticket_discounts" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "sale_returns" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ticket_payment_corrections" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ticket_links" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ticket_link_revocations" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "service_accounts" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "utility_bills" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_ingestion_filters" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_ingestion_log" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "payees" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_orders" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_order_events" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "rotation_settings" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "product_flags" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "rotation_snapshots" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "report_exports" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "promo_intents" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "whatsapp_sessions" ALTER COLUMN "tenant_id" SET NOT NULL;

--> statement-breakpoint
-- fiscal_documents y fiscal_settings: text nullable pasa a uuid NOT NULL. Un uuid canónico se conserva.
-- NULL o texto inválido cae al fallback. Si eso chocaría un unique, aborta.
-- fiscal_wizard queda text PK (P6): 0010 no garantiza que la clave sea uuid.
DO $fiscal_uuid$
DECLARE
  n_tenants int;
  tid_fallback uuid;
  tipo text;
  n_bad int;
  n_dup int;
  n_null int;
  uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  SELECT count(*)::int INTO n_tenants FROM tenants;
  tid_fallback := NULL;
  IF n_tenants = 1 THEN
    SELECT id INTO tid_fallback FROM tenants LIMIT 1;
  ELSIF n_tenants > 1 THEN
    SELECT id INTO tid_fallback FROM tenants WHERE es_demo = true ORDER BY created_at ASC, id ASC LIMIT 1;
    IF tid_fallback IS NULL THEN
      SELECT id INTO tid_fallback FROM tenants ORDER BY created_at ASC, id ASC LIMIT 1;
    END IF;
  END IF;

  IF to_regclass('public.fiscal_documents') IS NOT NULL THEN
    SELECT data_type INTO tipo FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fiscal_documents' AND column_name = 'tenant_id';
    IF tipo = 'text' THEN
      SELECT count(*)::int INTO n_bad FROM fiscal_documents
        WHERE tenant_id IS NULL OR tenant_id !~* uuid_re;
      IF n_bad > 0 AND tid_fallback IS NULL THEN
        RAISE EXCEPTION '0048: fiscal_documents tiene % filas sin uuid y no hay tenant fallback', n_bad;
      END IF;
      SELECT count(*)::int INTO n_dup FROM (
        SELECT idempotency_key,
          CASE WHEN tenant_id ~* uuid_re THEN lower(tenant_id) ELSE tid_fallback::text END AS tid
        FROM fiscal_documents
        GROUP BY 1, 2
        HAVING count(*) > 1
      ) d;
      IF n_dup > 0 THEN
        RAISE EXCEPTION '0048: duplicados (tenant_id, idempotency_key) en fiscal_documents: %', n_dup;
      END IF;
      UPDATE fiscal_documents SET tenant_id = tid_fallback::text
        WHERE tid_fallback IS NOT NULL AND (tenant_id IS NULL OR tenant_id !~* uuid_re);
      ALTER TABLE fiscal_documents ALTER COLUMN tenant_id TYPE uuid USING tenant_id::uuid;
    END IF;
    SELECT count(*)::int INTO n_null FROM fiscal_documents WHERE tenant_id IS NULL;
    IF n_null > 0 THEN
      RAISE EXCEPTION '0048: fiscal_documents tiene % filas con tenant_id NULL', n_null;
    END IF;
    ALTER TABLE fiscal_documents ALTER COLUMN tenant_id SET NOT NULL;
  END IF;

  IF to_regclass('public.fiscal_settings') IS NOT NULL THEN
    SELECT data_type INTO tipo FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fiscal_settings' AND column_name = 'tenant_id';
    IF tipo = 'text' THEN
      SELECT count(*)::int INTO n_bad FROM fiscal_settings
        WHERE tenant_id IS NULL OR tenant_id !~* uuid_re;
      IF n_bad > 0 AND tid_fallback IS NULL THEN
        RAISE EXCEPTION '0048: fiscal_settings tiene % filas sin uuid y no hay tenant fallback', n_bad;
      END IF;
      -- 0016: unique (tenant_id). Dos filas sin uuid no pueden compartir el fallback.
      SELECT count(*)::int INTO n_dup FROM (
        SELECT CASE WHEN tenant_id ~* uuid_re THEN lower(tenant_id) ELSE tid_fallback::text END AS tid
        FROM fiscal_settings
        GROUP BY 1
        HAVING count(*) > 1
      ) d;
      IF n_dup > 0 THEN
        RAISE EXCEPTION '0048: duplicados tenant_id en fiscal_settings tras normalizar: %', n_dup;
      END IF;
      UPDATE fiscal_settings SET tenant_id = tid_fallback::text
        WHERE tid_fallback IS NOT NULL AND (tenant_id IS NULL OR tenant_id !~* uuid_re);
      ALTER TABLE fiscal_settings ALTER COLUMN tenant_id TYPE uuid USING tenant_id::uuid;
    END IF;
    SELECT count(*)::int INTO n_null FROM fiscal_settings WHERE tenant_id IS NULL;
    IF n_null > 0 THEN
      RAISE EXCEPTION '0048: fiscal_settings tiene % filas con tenant_id NULL', n_null;
    END IF;
    ALTER TABLE fiscal_settings ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END
$fiscal_uuid$;

-- ROLLBACK 0048: no soportado sin backup.
