---
id: ADR-0015
tipo: adr
estado: aceptado
modulos: []
depende_de: [ADR-0001, ADR-0005, PRD-SK-02]
reemplaza: []
reemplazado_por: ""
resumen: "Toda decisión one-way-door pasa por architect con dos candidatos y síntesis antes de implementar."
---
# ADR-0015 - Diseño con architect

Estado: aceptado. Fecha: 2026-10-10. Fuente: PRD-SK-02.
Tipo: estándar de proceso, no ADR de arquitectura. Exento de R1 diseño aplicado.

## Decisión

Toda decisión one-way-door pasa por architect con dos candidatos y síntesis antes de implementar.

## Qué se adopta

Cinco fases con todolist previo. Sketch en arena con mínimo dos formas estructuralmente distintas, filtro de red flags y victoria a la interfaz más profunda. Checkpoint solo explícito. Desvíos del sketch se registran, no se absorben en silencio. Scrap ante patrón de fricción con rediseño desde principios y resta antes de suma.

## Uso probado

ADR-0001 con monolito modular frente a servicios con RLS. ADR-0005 con PaddleOCR propio frente a nube. Cada uno con candidatos y síntesis citados.

## Alternativa descartada

Un solo diseño directo a código. Se descarta porque fija la forma equivocada antes de comparar y viola el principio de agotar el espacio de diseño.

## Consecuencias

Ningún ADR sin dos candidatos. Ningún sketch condenado que siga parchado.
