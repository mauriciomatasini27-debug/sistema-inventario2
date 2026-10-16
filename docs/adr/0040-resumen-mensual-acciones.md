---
id: ADR-0040
tipo: adr
estado: propuesto
modulos: [bot]
depende_de: [PRD-BOT-01]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0040 - Resumen mensual y acciones propuestas

Estado: propuesto. Fecha: 2026-10-12. Fuentes: PRD-BOT-01 (BOT-S7/S8), `src/jobs/whatsapp-resumen.ts`, NE1-NE17, OP1-OP13.

## Decisión

Job mensual día 1 09:00 TZ tenant, mismo runner que viernes/lunes/cierre: WA + email con un snapshot, clave `tenant+mes+canal`. Hasta 3 acciones deterministas por módulo; cada botón crea borrador, nunca ejecuta.

## Por qué

Hoy solo hay diario y semanal. Principio OP: `el bot prepara, el comerciante confirma`. Sin IA en P1 para que sea auditable y testeable.

## Qué cambia

`src/jobs/resumen-mensual.ts`, plantillas `resumen_mensual` WA + email, `/api/jobs/resumen-mensual`.

## Alternativa descartada

Acciones automáticas sin confirmar: se descarta por riesgo sobre caja/pagos y Ley 25.326.

## Pendientes

BOT-S7/S8 + test idempotencia + aprobación plantilla Meta.