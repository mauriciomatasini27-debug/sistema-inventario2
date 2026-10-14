-- P0-5: idempotencia durable del webhook de Mercado Pago (antes Set en memoria).
-- Aislamiento por base de tenant (sin tenant_id), igual que OCR (ADR-0079).
-- La PK sobre la clave `preapproval_id:estado` convierte el replay en 23505.
CREATE TABLE IF NOT EXISTS "mp_webhook_events" (
	"clave" text PRIMARY KEY NOT NULL,
	"preapproval_id" text NOT NULL,
	"estado" text NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL
);
