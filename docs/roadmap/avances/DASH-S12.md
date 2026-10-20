---
item: DASH-S12
estado: hecho
adr: ADR-0020
prd: PRD-DASH-01
fecha: 2026-10-19
---
DASH-S12 hecho: el índice de `/panel` sale de una lista declarativa única (`MODULOS_INDICE` en `src/lib/panel-modulos.ts`) que alimenta pills y tarjetas, y `GET /api/panel/indice` devuelve solo los módulos encendidos según el plan; regla elegida: `bot` con `bot_consulta`, `alertas` con `alertas_email` o `alertas_whatsapp`, `asistente` con `asistente_ia`, y el núcleo (dashboard, ventas, caja, stock, precios, proveedores, consumos, fiado, reportes) siempre visible; si la ruta falla, el panel no oculta nada.
