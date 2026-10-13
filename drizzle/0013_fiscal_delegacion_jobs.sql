-- Control U4: tareas fiscales con clave texto (delegacion-confirmada).
-- Aditivo e idempotente: IF NOT EXISTS. La cola de aprovisionamiento
-- (provision_jobs) nunca aloja tareas fiscales: cada una vive acá con su
-- clave `delegacion:<tenant>:<cuit>`, estable ante reintento.
CREATE TABLE IF NOT EXISTS "fiscal_jobs" (
  "clave" text PRIMARY KEY,
  "tenant_id" text NOT NULL,
  "estado" text DEFAULT 'pendiente' NOT NULL,
  "intentos" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
