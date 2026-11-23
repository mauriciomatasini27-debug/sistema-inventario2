# Migraciones aplicadas en la base real

Generado por `npm run docs:migraciones` desde `docs/roadmap/migraciones/<tag>.json`. No editar a mano.

Fuente de verdad para `scripts/cadena/puede-mergear.mjs`: un PR que agrega `drizzle/*.sql` solo se mergea si existe el registro de su tag en la rama base.

- 0000_sweet_krista_starr
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0001_admin_panel
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0002_bot_wa_b4b15
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0003_fiscal_d8_d7_t3
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0004_auth_append_only
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0005_ticket_links
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0006_pin_mostrador
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0007_sync_state_grants
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0008_ticket_counter
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0009_customer_id_text
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0010_fiscal_wizard
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0011_fiscal_sequences_pk
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0012_provision_claim
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0013_fiscal_delegacion_jobs
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0014_ops_outbox_claim
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0015_fiscal_tenant_id
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0016_fiscal_settings_tenant
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0017_locations_photos_counts
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0018_ocr_jobs_eventos
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0019_return_counter
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0020_mp_webhook_events
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0021_products_location_id
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0022_cash_qr_receipts
<!-- 2026-10-15: Bootstrap: aplicada en la base real -->
- 0023_cash_due_items
- 0024_device_sync_avisos
- 0025_planes_suscripciones
- 0026_ai_usage
- 0027_products_min_stock
- 0028_tenant_bot_modules
- 0029_products_sector
- 0030_google_integrations
- 0031_gmail_ingestion
- 0032_tenant_location_seeds
<!-- 2026-10-20: 0032 aplicada vía conector Supabase (execute_sql); backup /workspace/backups/pre-0032-schema-20261020-1050.json -->
- 0033_products_origen
<!-- 2026-10-21: 0033 aplicada vía conector Supabase (execute_sql); backup /workspace/backups/pre-0033-schema-20261021-0144.json -->
- 0034_tenant_product_seeds
<!-- 2026-10-21: 0034 aplicada vía conector Supabase (execute_sql); backup /workspace/backups/pre-0034-schema-20261021-0153.json -->
- 0035_stock_imports
<!-- 2026-10-21: 0035 aplicada vía conector Supabase (execute_sql); fila de journal id 37 agregada vía conector Supabase (hash sha256 del archivo, created_at 1792538873372 del journal; el migrador ordena por created_at, así que 0036 sigue siendo la última); backup de la fila en /home/mauri/backups/pre-0035row-schema-20261021-0247.json; backup /home/mauri/backups/pre-0035-schema-20261021-0053.json -->
- 0036_stock_inicial_unico
<!-- 2026-10-21: 0036 aplicada vía conector Supabase (execute_sql); backup /workspace/backups/pre-0036-schema-20261021-0227.json -->
- 0037_admin_resumen
<!-- 2026-10-22: 0037 verificada aplicada en la base real; fila de journal id 38 con hash igual al archivo y created_at 1792802400000 (del journal); estructura de platform_admins/migration_rollouts/tenant_daily_usage verificada contra el archivo (columnas, PKs, defaults); aprobada por Mauri; backup /home/mauri/backups/pre-0037-0038-schema-20261022-0058.sql -->
- 0038_analytics_snapshot
<!-- 2026-10-22: 0038 verificada aplicada en la base real; fila de journal id 39 con hash igual al archivo y created_at 1792845600000 (del journal); estructura de rotation_settings/rotation_snapshots/promo_intents verificada contra el archivo; aplicada junto con 0037 por drizzle-kit; aprobada por Mauri; backup /home/mauri/backups/pre-0037-0038-schema-20261022-0058.sql -->
- 0039_ticket_lines_costo
<!-- 2026-10-23: 0039 aplicada con db:migrate el 2026-10-23. ticket_lines.costo_centavos es bigint, not null, default 0. Fila de journal id 40, created_at 1792888800000, hash sha256 5d6e625cfe8b794afcb89944476d719989fc66f3ab1a7a2a0b7ebb42ce2f364d igual al archivo; aprobada por Mauri; backup /home/mauri/backups/pre-0039-schema-20261023-1857.sql -->
- 0040_bot_turnos_canal_alerta
<!-- 2026-10-23: 0040 quedó en la base real el 2026-10-23. db:migrate la reejecutó después de 0039 y escribió la fila de journal id 41, created_at 1792932000000, hash sha256 930fd69b02d244d361bd42f2daaa40d9f1ff73f7f72310a67df2a480b7a14faf igual al archivo. Un segundo db:migrate no agregó filas (el journal sigue en 41). bot_turnos y notification_preferences.canal ya estaban, y el SQL idempotente los dejó igual; aprobada por Mauri; backup /home/mauri/backups/pre-0040-schema-20261023-1817.sql -->
- 0041_busqueda_trgm
<!-- 2026-10-23: 0041 aplicada con db:migrate el 2026-10-23. Fila de journal id 42, created_at 1792975200000, hash sha256 ebfe5f0163dd755d98d1090a8a8a116ec36336cc43d0db444e9d98a396c67730 igual al archivo. Quedaron public.f_norm, las extensiones pg_trgm y unaccent, y los índices products_nombre_trgm_idx y product_aliases_alias_trgm_idx; aprobada por Mauri; backup /home/mauri/backups/pre-0041-schema-20261024-0012.sql -->
- 0042_proveedores_durable
<!-- 2026-11-14: Aplicada en la base real del piloto (2026-11-14). Confirmación de Mauri; aprobada por Mauri -->
- 0043_shared_tenant_nucleo
<!-- 2026-11-14: Aplicada en la base real del piloto (2026-11-14). Confirmación de Mauri (ADR-0116 C1: tenant_id nullable en núcleo); aprobada por Mauri -->
- 0044_piloto_schema_tenant_precios
<!-- 2026-11-15: Aplicada en la base real del piloto el 2026-11-15 con npm run db:migrate (session pooler :5432). Journal pasó de 44 a 48; fila id 47 hash sha256 07f0ed8ec8114e4ea52c9518362b4c6b796dbd77007fb862564c2f5b131b68d9 igual al archivo. Tablas platform_feedback_reports, inventory_counts, fiscal_customers, product_flags, report_exports y mp_preapproval_tenants presentes. db:migrate:check: nada pendiente. Cierra #199; aprobada por Mauri -->
- 0045_shared_tenant_sellar_nucleo
<!-- 2026-11-15: Aplicada en la base real del piloto el 2026-11-15 con npm run db:migrate (session pooler :5432), tras 0044. Fila de journal id 48 hash sha256 0fff62c757c1df39b4f4a93e50b631c62161ffc1f5380c16e576dee064552c54 igual al archivo. 69 statements, 0 salteados; aprobada por Mauri -->
- 0046_tenants_rubro
<!-- 2026-11-15: Aplicada en la base real del piloto el 2026-11-15 con npm run db:migrate (session pooler :5432), tras 0045. Fila de journal id 49 hash sha256 75a7ef2174a65946d8733599fb352ed52b80aa7537721bfdb4183543329fa386 igual al archivo. Columna tenants.rubro presente. 1 statement, 0 salteados; aprobada por Mauri -->
- 0047_shared_tenant_periferia
<!-- 2026-11-15: Aplicada en la base real del piloto el 2026-11-15 con npm run db:migrate (session pooler :5432), tras 0046. Fila de journal id 50 hash sha256 7abb631d2a052abdb997b5be1b21b6fa4fbde62ce2479a62b79aab960f8c3cf7 igual al archivo. 118 statements, 0 salteados. Journal final 48/48; db:migrate:check: nada pendiente; aprobada por Mauri -->
- 0048_ggl_p0_huecos
<!-- 2026-11-17: Aprobada por Mauri en la sesión de cierre de GGL-P0-HUECOS (gate duro de verify). Aplicada con npm run db:migrate (wrapper P1-69) en las bases locales de test pers_tenant_a y pers_tenant_b el 2026-11-17: 0048 ok run=3 skip=0, db:migrate:check journal=49 aplicadas=49 pendientes=0. Aplicada en la base real del piloto (Supabase pooler ca-central-1) el 2026-11-18 tras el merge de PR #240: previo journal=49 aplicadas=48 pendientes=1 (0048), 0048 ok run=3 skip=0, posterior db:migrate:check journal=49 aplicadas=49 pendientes=0; verificado por información de columnas: google_connections.labels, gmail_ingestion_jobs.message_id e índice único gmail_ingestion_jobs_message_id_unique presentes; aprobada por Mauri -->
- 0049_tenants_onboarding_wizard
<!-- 2026-11-20: Aprobada por Mauri en la sesión del fix de onboarding (gate duro de verify). Columnas aditivas en tenants (wizard_completado boolean default false, wizard_paso integer default 0) y backfill de tenants preexistentes a wizard_completado = true. Los tenants backfillados quedan en wizard_paso = 5 (PASOS_WIZARD.length) para reflejar que ya completaron el recorrido; los nuevos quedan en 0. Aplicada con npm run db:migrate en las bases locales de test; db:migrate:check queda sin pendientes; aprobada por Mauri -->
- 0050_tenants_wizard_respuestas
<!-- 2026-11-21: Aprobada por Mauri en la sesión del fix de onboarding (ticket 12, persistencia durable de las respuestas del cuestionario). Columna aditiva en tenants (wizard_respuestas jsonb NOT NULL DEFAULT '{}'), sin modificar la 0049. Creada en el worktree local; queda pendiente de aplicar en la base real por Mauri; aprobada por Mauri -->
- 0051_ggl_p240_gmail_dedupe_tenant
<!-- 2026-11-21: Autorizada explícitamente para acompañar el merge de PR #363 (GGL-P240-FIX). Reemplaza gmail_ingestion_jobs_message_id_unique (0048) por gmail_ingestion_jobs_tenant_message_unique parcial (tenant_id, message_id) WHERE message_id IS NOT NULL. Número 0051 porque el PR #364 abierto reserva drizzle/0050_tenants_wizard_respuestas. Pendiente de aplicar en cualquier base (piloto pooler :5432 incluido): npm run db:migrate con TENANT_DATABASE_URL; validar con npm run db:migrate:check (journal=51, pendientes=0 tras aplicar); aprobada por Mauri -->
- 0052_retencion_anonimiza_auditoria
<!-- 2026-11-22: Aplicada el 2026-11-22 en el proyecto Supabase rpdrzvrmuuglfavynyph con autorización explícita de Mauricio (la autorización original del 2026-11-21 03:34 está registrada en el SQL) y el SQL exacto de drizzle/0052_retencion_anonimiza_auditoria.sql mediante Supabase MCP apply_migration. Verificado después de aplicar: la función retencion_append_only_guard existe y los triggers auth_events_no_update, gmail_connection_events_no_update y admin_audit_log_no_update están activos en sus tablas. El historial de Supabase registra 0052_retencion_anonimiza_auditoria (version 20261122003457). No se hizo ningún UPDATE ni DELETE sobre datos; aprobada por Mauri; backup Sin dump previo: el cambio es CREATE OR REPLACE FUNCTION y DROP/CREATE TRIGGER, sin modificación de filas. -->
- 0053_servicios_pagos_tenant
<!-- 2026-11-22: Aplicada el 2026-11-22 en el proyecto Supabase rpdrzvrmuuglfavynyph con autorización explícita de Mauricio (la autorización original del 2026-11-21 03:56 está registrada en el SQL) y el SQL exacto de drizzle/0053_servicios_pagos_tenant.sql mediante Supabase MCP apply_migration. Verificado después de aplicar: columna tenant_id presente en service_accounts, utility_bills, payees y payment_orders, con los cuatro índices service_accounts_tenant_idx, utility_bills_tenant_idx, payees_tenant_idx y payment_orders_tenant_idx. Las cuatro tablas tenían 0 filas, así que el backfill no movió datos. El historial de Supabase registra 0053_servicios_pagos_tenant (version 20261122003511); aprobada por Mauri; backup Sin dump previo: columnas nullable agregadas con ADD COLUMN IF NOT EXISTS sobre tablas vacías. -->
- 0054_devolucion_por_comercio
<!-- 2026-11-22: Aplicada el 2026-11-22 en el proyecto Supabase rpdrzvrmuuglfavynyph (Postgres compartida, 4 comercios) con el SQL exacto de drizzle/0054_devolucion_por_comercio.sql, mediante Supabase MCP apply_migration (name 0054_devolucion_por_comercio) con autorización explícita de Mauricio. Verificado después de aplicar: sale_returns.tenant_id uuid NOT NULL; el índice global sale_returns_numero_devolucion_unique fue reemplazado por sale_returns_tenant_numero_devolucion_unique (tenant_id, numero_devolucion); el historial de migraciones de Supabase registra 0054_devolucion_por_comercio (version 20261122002827). La base real tenía 0 filas en sale_returns, así que el backfill no movió datos y la siembra no creó contadores nuevos; la fila legacy 'devolucion' de ticket_counters quedó intacta. El ledger drizzle.__drizzle_migrations sigue en 52: las migraciones 0052 y 0053 permanecen pendientes y NO se aplicaron en este paso; aprobada por Mauri; backup Sin dump previo: sale_returns tenía 0 filas y el cambio es aditivo (columna + índice compuesto). -->
- 0055_unicidad_por_comercio
<!-- 2026-11-22: Aplicada el 2026-11-22 en el proyecto Supabase rpdrzvrmuuglfavynyph (Postgres compartida, ADR-0116) con autorización explícita de Mauri y el SQL exacto de drizzle/0055_unicidad_por_comercio.sql mediante Supabase MCP apply_migration (name 0055_unicidad_por_comercio). Verificado después de aplicar: los tres índices globales utility_bills_message_id_unique, payment_orders_numero_unique y payment_orders_idempotency_key_unique ya no existen; en su lugar están los tres compuestos utility_bills_tenant_message_id_unique, payment_orders_tenant_numero_unique y payment_orders_tenant_idempotency_key_unique, más los tres parciales utility_bills_message_id_legacy_unique, payment_orders_numero_legacy_unique y payment_orders_idempotency_key_legacy_unique con WHERE tenant_id IS NULL. El historial de Supabase registra 0055_unicidad_por_comercio (version 20261122030934). utility_bills y payment_orders tenían 0 filas, así que el backfill no movió datos y no se borró ni reasignó ninguna fila. El ledger drizzle.__drizzle_migrations sigue en 52: las migraciones 0052, 0053 y 0054 permanecen fuera del ledger, igual que antes de este paso; aprobada por Mauri; backup Sin dump previo: la migración solo completa tenant_id donde la fuente es inequívoca, dropea tres constraints globales y crea seis índices nuevos; las tablas estaban vacías, así que no se reescribió ninguna fila. -->
- 0056_products_por_peso
<!-- 2026-11-21: Aplicada el 2026-11-22 en el proyecto Supabase rpdrzvrmuuglfavynyph con autorización explícita de Mauri (tarjeta 'Aplicá todo') mediante Supabase MCP execute_sql, en una sola transacción junto con 0057/0058/0059 y las filas de journal de 0052-0055. Agrega products.por_peso boolean NOT NULL DEFAULT false. Verificado: la columna está presente. El journal drizzle.__drizzle_migrations pasó de 52 a 60 filas; aprobada por Mauri -->
- 0057_email_outbox_cifrado
<!-- 2026-11-22: Aplicada el 2026-11-22 en el proyecto Supabase rpdrzvrmuuglfavynyph con autorización explícita de Mauri (tarjeta 'Aplicá todo') mediante Supabase MCP execute_sql, en una sola transacción junto con 0056/0058/0059 y las filas de journal de 0052-0055. Renombra email_outbox.html a html_ciphertext y texto a texto_ciphertext (el código de main ya las espera cifradas). Verificado: ambas columnas *_ciphertext presentes. El journal drizzle.__drizzle_migrations pasó de 52 a 60 filas; aprobada por Mauri -->
- 0058_devices_nombre
<!-- 2026-11-22: Aplicada el 2026-11-22 en el proyecto Supabase rpdrzvrmuuglfavynyph con autorización explícita de Mauri (tarjeta 'Aplicá todo') mediante Supabase MCP execute_sql, en una sola transacción junto con 0056/0057/0059 y las filas de journal de 0052-0055. Verificado: devices.nombre text DEFAULT NULL presente. El journal drizzle.__drizzle_migrations pasó de 52 a 60 filas; aprobada por Mauri -->
- 0059_whatsapp_estados
<!-- 2026-11-22: Autorizada explícitamente por Mauri el 2026-11-22 para el pipeline de estados del webhook de WhatsApp (sent/delivered/read/failed) que necesita el panel de envíos. Tag reservado antes del merge del PR que trae el .sql, igual que 0056 y 0058. Aplicada el 2026-11-22 en el proyecto Supabase rpdrzvrmuuglfavynyph en la misma transacción que 0056/0057/0058 (ver docs/roadmap/migraciones/0058_devices_nombre.json); el journal drizzle.__drizzle_migrations pasó de 52 a 60 filas. Verificada además con el splitter y el filtro reales de scripts/db-migrate-lib.mjs sobre PGlite (4 ALTER, 0 salteados, idempotente); aprobada por Mauri -->
- 0060_fiscal_computers_alias_unico
<!-- 2026-11-23: Aprobada por Mauri el 2026-11-23. Verificada aplicada el 2026-11-23: el índice único (ambiente, alias) ya existía en la base real y fiscal_computers tiene 0 filas, así que la migración es no-op (CREATE UNIQUE INDEX IF NOT EXISTS). Se registró la fila del journal (id 61, created_at 1796083200000) vía MCP de Supabase; no hubo cambio de datos; aprobada por Mauri -->
- 0061_campos_huerfanos
<!-- 2026-11-23: Aprobada por Mauri el 2026-11-23 junto con el rescope de AUD-FIX-S3..S7. Aplicada vía MCP de Supabase el 2026-11-23: cash_movements.nota (text nullable), products.controla_vencimiento (boolean NOT NULL DEFAULT false) y fiscal_wizard.modo_primera_factura (text nullable), con IF NOT EXISTS y sin tocar filas existentes. Columnas verificadas en information_schema y fila del journal registrada (id 62, created_at 1796169600000); aprobada por Mauri -->
