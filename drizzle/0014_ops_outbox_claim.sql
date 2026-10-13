-- Control U5: reclamo de outbox de señales (no splice destructivo).
-- Aditivo e idempotente: ADD COLUMN IF NOT EXISTS. El drenaje reclama
-- (reclamada + claimed_by) y confirma (consumida) en vez de borrar a ciegas:
-- una caída a mitad de camino deja filas reclamadas que el próximo consumo
-- reanuda, nunca pierde la señal.
ALTER TABLE "ops_signals_outbox" ADD COLUMN IF NOT EXISTS "claimed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "ops_signals_outbox" ADD COLUMN IF NOT EXISTS "claimed_by" text;
