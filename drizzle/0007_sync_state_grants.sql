-- Sync offline SYNC-S1/S3/S5: cursores pull + heartbeat + grants (PRD-SYNC-01).
-- Aditivo e idempotente: IF NOT EXISTS. Copia durable best-effort; la fuente
-- de verdad en monoproceso sigue siendo la memoria (store.deviceSync,
-- control.devices, control.offlineGrants).
CREATE TABLE IF NOT EXISTS "device_sync_state" (
  "device_code" text PRIMARY KEY,
  "tenant_id" text,
  "ultima_vista_en" timestamp DEFAULT now() NOT NULL,
  "pendientes" integer DEFAULT 0 NOT NULL,
  "ultima_op_hlc" text,
  "actualizado_en" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "sync_state" (
  "tenant_id" text NOT NULL,
  "device_code" text NOT NULL,
  "cursor" text DEFAULT '0' NOT NULL,
  "actualizado_en" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "sync_state_tenant_device_pk" PRIMARY KEY ("tenant_id", "device_code")
);
CREATE TABLE IF NOT EXISTS "offline_grants" (
  "grant_id" text PRIMARY KEY,
  "token_hash" text NOT NULL,
  "tenant_id" text NOT NULL,
  "google_sub" text NOT NULL,
  "device_code" text NOT NULL,
  "alcance" text NOT NULL,
  "expira_en" timestamp NOT NULL,
  "revocado_en" timestamp,
  "creado_en" timestamp DEFAULT now() NOT NULL
);
