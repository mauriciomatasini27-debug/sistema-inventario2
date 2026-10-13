-- PIN de mostrador P1-3: hash por dispositivo + bloqueo local.
-- Aditivo e idempotente: IF NOT EXISTS. Solo hash, nunca el plano.
CREATE TABLE IF NOT EXISTS "device_pins" (
  "device_code" text PRIMARY KEY,
  "pin_hash" text NOT NULL,
  "bloqueado" boolean DEFAULT false NOT NULL,
  "actualizado_en" timestamp DEFAULT now() NOT NULL
);
