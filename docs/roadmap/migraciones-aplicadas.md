# Migraciones aplicadas en la base real

Fuente de verdad para `scripts/cadena/puede-mergear.mjs`: el box no llega a Postgres de producción, así que un PR que agrega `drizzle/*.sql` solo se mergea si su tag figura acá. Agregá la línea **después** de aplicar la migración en la base real (lo confirma Mauri), nunca antes.

Formato: una línea `- <tag>` por migración (tag = nombre del archivo sin `.sql`).

<!-- bootstrap 2026-10-15: 0000 a 0023 aplicadas en la base real -->

- 0000_sweet_krista_starr
- 0001_admin_panel
- 0002_bot_wa_b4b15
- 0003_fiscal_d8_d7_t3
- 0004_auth_append_only
- 0005_ticket_links
- 0006_pin_mostrador
- 0007_sync_state_grants
- 0008_ticket_counter
- 0009_customer_id_text
- 0010_fiscal_wizard
- 0011_fiscal_sequences_pk
- 0012_provision_claim
- 0013_fiscal_delegacion_jobs
- 0014_ops_outbox_claim
- 0015_fiscal_tenant_id
- 0016_fiscal_settings_tenant
- 0017_locations_photos_counts
- 0018_ocr_jobs_eventos
- 0019_return_counter
- 0020_mp_webhook_events
- 0021_products_location_id
- 0022_cash_qr_receipts
- 0023_cash_due_items
- 0024_device_sync_avisos
- 0025_planes_suscripciones
- 0026_ai_usage
- 0027_products_min_stock
- 0028_tenant_bot_modules
