---
item: PLAN-S9
estado: hecho
adr: ADR-0047
prd: PRD-PLAN-01
fecha: 2026-10-24
---
PLAN-S9 hecho: `GET /api/panel/upsell` y el GET de `/api/asistente` responden 200 con la pantalla de upsell (qué hace, plan actual, plan que incluye el módulo, `Ver planes` para el Dueño y `Pedile al Dueño que lo active` para el empleado) en vez de 404; Básico abre el drawer del asistente con esa pantalla, `/panel/bot/*` sigue la pantalla real porque el bot está en Básico y solo se reemplaza si falta `bot_consulta`, y las alertas de WhatsApp muestran el upsell sin tapar el mail que Básico ya incluye.
