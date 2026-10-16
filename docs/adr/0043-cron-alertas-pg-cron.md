---
id: ADR-0043
tipo: adr
estado: propuesto
modulos: [bot, inventario]
depende_de: [ADR-0028, PRD-ALR-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Supabase pgcron dispara cada 2 h (y 08:00 por TZ de tenant) un pgnet.httppost a POST /api/jobs/alertas-stock
  con header JOBSSECRET. La lógica vive en la app (TypeScript), no en SQL. Idempotencia por clave
  tenant+producto+día registrada antes de enviar; mensaje agrupado de hasta 10 ítems por canal.
---
# ADR-0043 - Cron de alertas de stock con pg_cron + pg_net en Supabase

Estado: propuesto. Fecha: 2026-10-12. Fuentes: PRD-ALR-01 (ALR-S2, ALR-S4), `docs/migracion-supabase.md`, `src/jobs/whatsapp-aviso-matutino.ts`, `src/pages/api/jobs/*`, ADR-0028.

## Decisión

Supabase `pg_cron` dispara cada 2 h (y 08:00 por TZ de tenant) un `pg_net.http_post` a `POST /api/jobs/alertas-stock` con header `JOBS_SECRET`. La lógica vive en la app (TypeScript), no en SQL. Idempotencia por clave `tenant+producto+día` registrada antes de enviar; mensaje agrupado de hasta 10 ítems por canal.

## Por qué

Supabase ya es la base elegida y trae `pg_cron` en el plan gratis: no suma servicio de scheduler. Mantener la lógica en la app reusa núcleos puros y tests existentes.

## Qué cambia

Migración SQL que habilita `pg_cron`/`pg_net` y agenda el job; endpoint `alertas-stock`; tabla o clave idempotente en `notification_events`; `JOBS_SECRET` obligatorio.

## Alternativa descartada

Lógica completa en función SQL: difícil de testear y duplica núcleo. Scheduler externo (GitHub Actions, Vercel cron): otro servicio y otro secreto sin ganancia.

## Pendientes

Verificar en fuente oficial disponibilidad y límites de `pg_cron` en Free; proyecto pausado por inactividad corta el cron.