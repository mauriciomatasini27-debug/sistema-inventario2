---
id: ADR-0040
tipo: adr
estado: aceptado
modulos: [bot]
depende_de: [PRD-BOT-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Job mensual día 1 09:00 TZ tenant, mismo runner que viernes/lunes/cierre: WA + email con un snapshot, clave
  tenant+mes+canal. Hasta 3 acciones deterministas por módulo; cada botón crea borrador, nunca ejecuta.
---
# ADR-0040 - Resumen mensual y acciones propuestas

Estado: aceptado (2026-10-16). Fecha: 2026-10-12. Fuentes: PRD-BOT-01 (BOT-S7/S8), `src/jobs/whatsapp-resumen.ts`, NE1-NE17, OP1-OP13.

## Decisión

Job mensual día 1 09:00 TZ tenant, mismo runner que viernes/lunes/cierre: WA + email con un snapshot, clave `tenant+mes+canal`. Hasta 3 acciones deterministas por módulo; cada botón crea borrador, nunca ejecuta.

## Por qué

Hoy solo hay diario y semanal. Principio OP: `el bot prepara, el comerciante confirma`. Sin IA en P1 para que sea auditable y testeable.

## Qué cambia

`src/jobs/resumen-mensual.ts`, plantillas `resumen_mensual` WA + email, `/api/jobs/resumen-mensual`.

## Alternativa descartada

Acciones automáticas sin confirmar: se descarta por riesgo sobre caja/pagos y Ley 25.326.

## Pendientes

BOT-S7 hecho 2026-10-16 (`src/jobs/resumen-mensual.ts`, `POST /api/jobs/resumen-mensual`, test de idempotencia por canal; sin migración). BOT-S8 hecho 2026-10-19 (`src/modules/bot/acciones-propuestas.ts` con hasta 3 acciones deterministas, sección `Acciones sugeridas` en el snapshot, botones `acc:` por WhatsApp y despacho en el webhook; `reponer` deja OC abierta, `cobrar` devuelve el recordatorio + `wa.me`; sin migración). Pendientes: BOT-S5/S6 (por migración), aprobación de la plantilla Meta `resumen_mensual`, cron que llame al job el día 1 desde las 09:00 y zona horaria por tenant (hoy America/Argentina/Buenos_Aires).