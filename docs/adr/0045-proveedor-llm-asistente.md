---
id: ADR-0045
tipo: adr
estado: propuesto
modulos: [compras]
depende_de: [ADR-0044, PRD-IA-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Interfaz LlmProvider con dos adaptadores: Claude (Anthropic) por defecto con modelo chico, GPT (OpenAI) como
  alternativa. Ambos con function calling. Cupo mensual de consultas por plan y registro aiusage(tenantid,
  tokensin, tokensout, costocentavos); cupo agotado = no se llama.
---
# ADR-0045 - Proveedor LLM del asistente y cupo por plan

Estado: propuesto. Fecha: 2026-10-12. Fuentes: PRD-IA-01 (IA-S5), ADR-0044, `docs/01-fundacion/costos-por-cliente.md`.

## Decisión

Interfaz `LlmProvider` con dos adaptadores: Claude (Anthropic) por defecto con modelo chico, GPT (OpenAI) como alternativa. Ambos con function calling. Cupo mensual de consultas por plan y registro `ai_usage(tenant_id, tokens_in, tokens_out, costo_centavos)`; cupo agotado = no se llama.

## Por qué

Las dos APIs son de pago por uso y soportan tools; con catálogo cerrado la tarea es simple y un modelo chico alcanza. La interfaz evita quedar atado y permite cambiar si cambian precios. Claude por defecto por seguimiento de instrucciones con tools; se confirma con evaluación.

## Qué cambia

`src/modules/asistente/llm.ts`, adaptadores `anthropic.ts`/`openai.ts`, variable de clave por proveedor, tabla `ai_usage`.

## Alternativa descartada

Modelo grande por defecto: más caro sin ganancia en preguntas cerradas. Modelo local: costo de infraestructura y operación desproporcionado.

## Pendientes

Evaluación con las 8-12 preguntas en ambos proveedores (precisión de tool y costo por consulta); fijar cupo por plan con precios vigentes de fuente oficial.