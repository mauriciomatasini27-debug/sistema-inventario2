---
id: ADR-0044
tipo: adr
estado: propuesto
modulos: [inventario, persistencia]
depende_de: [ADR-0003, ADR-0006, PRD-IA-01]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0044 - Asistente IA: catálogo cerrado + function calling de solo lectura

Estado: propuesto. Fecha: 2026-10-12. Fuentes: PRD-IA-01 (IA-S1, IA-S2, IA-S3), ADR-0003, ADR-0006, `src/db/schema*.ts`.

## Decisión

El asistente solo responde un catálogo fijo de 8-12 preguntas. Cada una es una función tipada con zod, de solo lectura sobre Drizzle. El LLM elige función y parámetros y redacta; nunca escribe SQL ni produce números. `tenant_id` y rol los inyecta el servidor desde la sesión.

## Por qué

Bajo mantenimiento, resultados auditables y verificables contra SQL, sin riesgo de escritura ni fuga cross-tenant por prompt injection.

## Qué cambia

`src/modules/asistente/` con registro de funciones, esquema de tools y respuesta `Todavía no sé responder eso` fuera de catálogo.

## Alternativa descartada

Text-to-SQL libre: más flexible pero inseguro, no determinista y caro de mantener.

## Pendientes

Lista final de preguntas validada con 2-3 comercios; arch-tests AT1/AT2 del PRD.