---
id: ADR-0014
tipo: adr
estado: aceptado
modulos: []
depende_de: [PRD-SK-01]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0014 - Grounding con how + why

Estado: aceptado. Fecha: 2026-10-10. Fuente: PRD-SK-01.
Tipo: estándar de proceso, no ADR de arquitectura. Exento de R1 diseño aplicado.

## Decisión

Ningún diseño arranca sin grounding salvo greenfield real. Runtime y ubicación con how, motivo y tradeoffs con why.

## Qué se adopta

How simple en un pase, how complejo con 2 a 4 exploradores más sintetizador. Salida fija con Overview, Key Concepts, How It Works, Where Things Live y Gotchas.

Why anclado en blame, log y PRs. Siete investigadores por categoría con MCP y nulos declarados. Síntesis que separa hallazgo, inferencia, hipótesis y desconocido. Cierre Preserve / Change / Avoid / Risk si sigue un cambio.

## Uso probado

Grounding de `modoops_core` SCSS antes de portar Tema papel. Linaje de mora 14 días y 1 DB por cliente antes de copiarlas al Panel.

## Alternativa descartada

Diseñar desde el nombre del archivo sin modelo trazado. Se descarta porque convierte el motivo en suposición y rompe lo que how y why prescriben.

## Consecuencias

Toda decisión heredada cita fuente o se marca `[a verificar]`. Ningún why sin Sources Consulted.
