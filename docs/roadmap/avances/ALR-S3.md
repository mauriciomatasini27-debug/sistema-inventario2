---
item: ALR-S3
estado: hecho
adr: ADR-0039
prd: PRD-ALR-01
fecha: 2026-10-24
---
ALR-S3 hecho: el job de stock manda la alerta al canal guardado en notification_preferences (WhatsApp, email o ambos); sin opt-in de WhatsApp el encargado recibe solo email, un canal pausado no recibe, el Dueño entra igual y el número de otro tenant no se usa (`tests/alr-s3-canal.test.ts`).
