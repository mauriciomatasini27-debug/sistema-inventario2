---
item: IA-S4
estado: hecho
adr: ADR-0039
prd: PRD-IA-01
fecha: 2026-10-19
---
IA-S4 hecho: `POST /api/asistente` (tenant y rol de la sesión, body zod, cupo del plan, `fuera_de_plan` 403 antes de crear el proveedor), acceso mínimo en `/panel` y el canal WhatsApp contesta con el asistente después de los flujos existentes cuando el plan incluye `asistente_ia`; `ventas_periodo`, `por_vencer`, `deudores`, `stock_bajo` y `caja_dia` leen datos reales del tenant, y `top_productos`, `margen_producto` (solo Dueño) y `rotacion_lenta` responden que todavía no pueden leer ese dato, sin llamar al LLM ni registrar uso; sin `ASSISTANT_LLM_KEY` (proveedor fake) la ruta responde 503 `asistente_no_configurado` y WhatsApp sigue el flujo actual, así nunca se muestra el prompt crudo.
