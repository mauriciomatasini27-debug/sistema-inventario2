-- WA-ESTADOS / panel de estados: guardar cada salto del mensaje, no solo el
-- estado actual. El webhook de estados de Meta (sent/delivered/read/failed) hoy
-- se descarta y whatsapp_usage.estado se queda en "enviado".
-- Nullable sin default: las filas existentes siguen válidas y el panel muestra
-- "sin confirmación" en vez de inventar una hora que nadie recibió.
ALTER TABLE "whatsapp_usage" ADD COLUMN IF NOT EXISTS "entregado_en" timestamp DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE "whatsapp_usage" ADD COLUMN IF NOT EXISTS "leido_en" timestamp DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE "whatsapp_usage" ADD COLUMN IF NOT EXISTS "fallo_codigo" integer DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE "whatsapp_usage" ADD COLUMN IF NOT EXISTS "fallo_motivo" text DEFAULT NULL;
