-- Sync SYNC-S3/S4 durable: marcas idempotentes de aviso en device_sync_state (PRD-SYNC-01).
-- Aditivo e idempotente: IF NOT EXISTS. El heartbeat limpia las marcas al
-- registrar (nuevo ciclo); el job reclama un nivel por corrida con un UPDATE
-- condicional ... RETURNING (sin doble aviso ante corridas concurrentes).
ALTER TABLE "device_sync_state" ADD COLUMN IF NOT EXISTS "aviso_24_en" timestamp;
--> statement-breakpoint
ALTER TABLE "device_sync_state" ADD COLUMN IF NOT EXISTS "aviso_60_en" timestamp;
--> statement-breakpoint
ALTER TABLE "device_sync_state" ADD COLUMN IF NOT EXISTS "aviso_72_en" timestamp;
