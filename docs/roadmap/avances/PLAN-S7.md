---
item: PLAN-S7
estado: hecho
adr: ADR-0047
prd: PRD-PLAN-01
fecha: 2026-10-19
---
PLAN-S7 hecho: `/panel/plan` queda solo para el Dueño (`GET /api/plan/resumen` responde 403 al empleado) y muestra la renovación del período en DD/MM/AAAA calculada con `finDeCicloMensual`, el cupo de WhatsApp del mes contra el de `bot_consulta` del plan, contando las consultas del bot del mes AR en `whatsapp_usage` (`contarConsultasBotDelMes`, la misma fuente de la tarjeta `Bot`; `usage_counters` todavía no lo alimenta nadie; "sin techo definido" cuando el plan no fija cupo, restante nunca negativo) con medidor `role="meter"` y texto, el cupo de IA existente y un botón por cada otro plan del catálogo; bajar programa la baja y recarga el resumen, cancelar manda el plan actual y subir muestra que necesita el cobro (409 `requiere_cobro`) con Sonner, sin `alert()`.
