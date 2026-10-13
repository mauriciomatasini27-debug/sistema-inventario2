# ADR-0046 - Chat de landing: LLM barato, solo FAQ, aislado del sistema

Estado: propuesto. Fecha: 2026-10-12. Fuentes: PRD-LP-04 (LP4-S2, LP4-S4, LP4-S5), ADR-0010, ADR-0022, ADR-0045.

## Decisión

El chat usa el modelo más barato disponible del proveedor elegido en ADR-0045, sin tools, con contexto fijo de FAQ, planes públicos y rubros. Endpoint `/api/landing-chat` aislado: no importa `src/lib/db.ts` ni `store.ts`, clave LLM propia con tope de gasto, 20 mensajes por IP/sesión por día, sin guardar datos personales salvo contacto voluntario.

## Por qué

Las dudas de visitantes son repetitivas y públicas; un modelo barato alcanza. El aislamiento impide que una inyección de prompt llegue a datos de comercios. Clave separada acota el gasto si hay abuso.

## Qué cambia

`src/pages/api/landing-chat.ts`, `src/data/faq.ts`, widget en la landing, variable `LANDING_LLM_KEY`.

## Alternativa descartada

Reusar el asistente interno: mezcla datos internos con público. Widget de terceros (Intercom, etc.): costo fijo mensual alto para el volumen esperado.

## Pendientes

FAQ cerrada (PRD-LP-02), número comercial real (Landing E13), arch-tests AT1/AT2.