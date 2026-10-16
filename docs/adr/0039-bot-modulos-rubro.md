---
id: ADR-0039
tipo: adr
estado: propuesto
modulos: [bot]
depende_de: [ADR-0012, PRD-BOT-01]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0039 - Bot único con módulos activables por rubro

Estado: propuesto. Fecha: 2026-10-12. Fuentes: PRD-BOT-01 (BOT-S1/S2/S3-S6), ADR-0012, B1-B15, `src/modules/whatsapp/router.ts`.

## Decisión

Un solo bot (número central WABA) con módulos activables por tenant según rubro (`quiosco`, `pyme`, `fabrica`, `logistica`). Tabla `tenant_bot_modules`; el router filtra intenciones por módulo activo.

## Por qué

Reusa vinculación (código 6 dígitos), opt-in y plantillas Meta ya aprobadas. Un bot por tenant multiplica números, verificación Meta y costo por plantilla.

## Qué cambia

Tablas `tenant_bot_modules`, `production_orders`, `deliveries`; rubro en onboarding; toggle en `/panel`; `router.ts` consulta módulos.

## Alternativa descartada

Bot por tenant: se descarta por costo WABA, alta Meta por número y mantenimiento N veces.

## Pendientes

BOT-S1→S6 + tests módulo apagado. Fábrica/logística detrás de flag hasta validar con 1 cliente real.