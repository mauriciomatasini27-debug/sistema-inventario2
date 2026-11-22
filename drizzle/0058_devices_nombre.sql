-- #357 / P10-34: nombre legible que el Dueño asigna a un dispositivo.
-- Nullable con default null: las filas existentes siguen válidas y el nombre
-- solo aparece cuando la ruta de nombrado lo escribe.
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "nombre" text DEFAULT NULL;
