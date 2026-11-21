---
item: WA-AVISOS-1
estado: hecho
adr: ADR-0041
prd: PRD-CH-01
fecha: 2026-11-21
---
Avisos de cuenta por WhatsApp: job `POST /api/jobs/enviar-avisos-whatsapp` (X-Job-Secret, sin agendar) que manda el cierre de cuenta (`cuenta_cerrada_v1`, P10-91) y el aviso previo al borrado (`retencion_aviso_v1`, P10-90) como plantilla de Meta (`type: template`, es_AR) al número verificado del dueño, también en comercios cerrados. Sin migración: las filas siguen en `email_outbox` y el job de mails las saltea.
