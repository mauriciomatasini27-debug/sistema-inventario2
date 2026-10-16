---
id: ADR-0047
tipo: adr
estado: aceptado
modulos: []
depende_de: [ADR-0003, ADR-0006, ADR-0039, ADR-0045, PRD-PLAN-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Se cobra una suscripción mensual por plan (Básico, Plus, Pro). El plan define qué módulos están encendidos y
  qué cupos mensuales tiene el tenant (mensajes de WhatsApp, consultas al asistente IA). No se venden módulos
  sueltos.
---
# ADR-0047 - Cobro por plan mensual, no por módulo

Estado: aceptado (2026-10-12, decisión del dueño). Fecha: 2026-10-12. Fuentes: PRD-PLAN-01, `docs/01-fundacion/costos-por-cliente.md` (Básico 15 / Plus 35 / Pro 59 USD, WhatsApp dentro del precio del plan), `docs/03-inventario-precios/inventario-parte-1.md:49` (suscripción mensual ARS o USD por Mercado Pago o transferencia), `docs/03-inventario-precios/inventario-parte-2.md` (F8.4 mora 14 días), ADR-0006 (PA6, PA12 flags por tenant/plan), ADR-0039, ADR-0045.

## Decisión

Se cobra una suscripción mensual por plan (Básico, Plus, Pro). El plan define qué módulos están encendidos y qué cupos mensuales tiene el tenant (mensajes de WhatsApp, consultas al asistente IA). No se venden módulos sueltos. Los toggles de `tenant_bot_modules` (ADR-0039) se mueven solo dentro de lo que el plan habilita.

## Por qué

Decisión confirmada por el dueño (2026-10-12). Un precio por plan es más fácil de explicar al kiosquero, de mostrar en la landing y de cobrar con débito automático. El costo variable real (WhatsApp por mensaje, LLM por token) se controla con cupos por plan, que es lo que pide `costos-por-cliente.md` ("mantener un cupo de mensajes del bot y cobrar el excedente"). Por módulo multiplica combinaciones, precios y casos de prorrateo.

## Qué cambia

Tablas de control `plans`, `plan_features`, `subscriptions` y `usage_counters` en la base de control (ADR-0003). Un resolvedor `planIncluye(tenant, feature)` en servidor es la única fuente para ocultar o mostrar módulos en `/panel` (DASH-S12) y para el router del bot. Cupos de `whatsapp_usage` y `ai_usage` se leen contra el plan.

## Alternativa descartada

Cobro por módulo: más flexible, pero complica la landing, el soporte y el prorrateo, y deja el costo de WhatsApp sin techo por cliente. Freemium permanente: descartado por costo de WhatsApp sin cobro; queda la prueba gratis de 14 días ya prevista en onboarding.

## Pendientes

Confirmar precios vigentes y moneda (ARS con ajuste o USD), proveedor de cobro (Mercado Pago pendiente), cupos exactos por plan con precios oficiales de Meta y del LLM, facturación ARCA de la suscripción.
