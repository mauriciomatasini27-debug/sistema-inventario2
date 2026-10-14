-- PERS4-S1 (ADR-0079): trabajos y eventos de OCR que vivían solo en memoria.
-- Aislamiento por base de tenant (sin tenant_id). Unicidad de idempotency_key
-- sostiene el replay de Idempotency-Key (wamid/message-id). ocr_eventos es
-- append-only (log de ocr_borrador_listo / ocr_confirmado / ocr_descartado /
-- ocr_vencido / ocr_recuerdo). No cablea proveedor de OCR.
CREATE TABLE IF NOT EXISTS "ocr_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"origen" text NOT NULL,
	"bytes_ref" text NOT NULL,
	"emisor" text,
	"estado" text DEFAULT 'en_cola' NOT NULL,
	"borrador_id" text,
	"error" text,
	"creado_en" timestamp NOT NULL,
	"actualizado_en" timestamp NOT NULL,
	"recordado_en" timestamp,
	CONSTRAINT "ocr_jobs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ocr_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"payload" jsonb NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL
);
