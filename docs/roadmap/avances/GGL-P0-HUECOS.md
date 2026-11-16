---
item: GGL-P0-HUECOS
estado: pendiente
adr: ADR-0103
prd: PRD-GMAIL-01
fecha: 2026-11-15
---
GGL-P0-HUECOS pendiente: cerrar los cinco huecos P0 de la ingesta Gmail que la auditoría 2026-11-15 encontró entre ADR-0103 y el código, antes de abrir la ingesta a más comercios: dedupe explícita por `messageId` (el webhook lo descarta, `src/pages/api/gmail/webhook.ts:51-57`; la cola deduplica por `(connection_id, history_id)`, `src/lib/repos/gmail-cola.ts:45-47`), evento en `gmail_connection_events` al cambiar filtros (hoy solo conexión/desconexión/error, `src/lib/repos/google-conexiones.ts:171,446`), label elegible para `users.watch` (hoy `INBOX` fijo, `src/jobs/gmail.ts:212`), rechazo de la casilla ya activa en otro comercio al conectar (el 409 salta recién al registrar el watch, `src/lib/repos/gmail-watch.ts:51-53`) y scheduler del watch (`src/pages/api/jobs/gmail-poll.ts` renueva con <12 h de vida pero nada lo invoca cada 24 h).
