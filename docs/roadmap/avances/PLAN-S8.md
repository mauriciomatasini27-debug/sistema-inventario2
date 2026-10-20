---
item: PLAN-S8
estado: hecho
adr: ADR-0047
prd: PRD-PLAN-01
fecha: 2026-10-20
---
PLAN-S8 hecho: `GET /api/panel/indice` suma `upsell` (ofertas por módulo fuera del plan, sin descartes) y `rol`, y `/panel` muestra como máximo una tarjeta `Asistente IA en Plus` en Básico con CTA `Ver planes` para el Dueño y `Pedile al Dueño que lo active` para el empleado; decisiones: el descarte vive en `localStorage` por 30 días, se elige el plan más barato del catálogo que incluye el módulo sin mostrar precio, una sola oferta por vista, sin suscripción activa no hay oferta, y los módulos incluidos o apagados dentro del plan siguen ocultos como en DASH-S12.
