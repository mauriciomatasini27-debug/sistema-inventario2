---
item: ALR-S2
estado: parcial
adr: ADR-0043
prd: PRD-ALR-01
fecha: 2026-10-23
---
ALR-S2 parcial: `POST /api/jobs/whatsapp-aviso` ya tiene memoria durable de alertas: antes de calcular lee de `notification_events` las claves `alerta_stock:<tenant>:<sku>:<día>` (`clave_alerta_stock` de `src/modules/alertas/stock-bajo.ts`) y las pasa como `enAlertaPrevia`; cuando el aviso sale, `registrarAlertasStock` (`src/lib/repos/whatsapp.ts`) inserta una fila por ítem (tipo `alerta_stock`, ref producto/sku, estado `enviado`, `onConflictDoNothing` sobre `dedupe_key`) y, sin DB o ante fallo, queda en memoria sin cortar el job; una segunda corrida el mismo día no reenvía un ítem no urgente y lo urgente (stock 0, crítico o menos de la mitad del umbral) sigue las reglas de `calcular_matutino`; `tests/alr-memoria-durable.test.ts` cubre clave ausente, clave registrada, urgente y PG; sin pg_cron, sin columna ni SQL nuevos y sin secretos; queda pendiente el `pg_cron` real (fuera del repo).
