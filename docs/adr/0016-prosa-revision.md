---
id: ADR-0016
tipo: adr
estado: aceptado
modulos: []
depende_de: [ADR-0008, PRD-DS-01, PRD-SK-03]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0016 - Prosa y revisión con technical-writing + unslop + interrogate

Estado: aceptado. Fecha: 2026-10-10. Fuente: PRD-SK-03.
Tipo: estándar de proceso, no ADR de arquitectura. Exento de R1 diseño aplicado.

## Decisión

Toda superficie de prosa pasa por technical-writing más unslop. Todo diseño one-way-door pasa por interrogate antes de cerrarse.

## Qué se adopta

Un documento un modo Diátaxis. Frases al lector con una instrucción por frase y condición antes del paso. Sin doble lectura. Unslop con reglas estables sobre todo lo escrito. Interrogate multi-modelo con veredicto Act on, Consider, Noted y Dismissed más mapa de acuerdos. Sin auto-aplicar cambios.

## Uso probado

PRD-DS-01 a 03 y ADR-0008/0009 con pipeline grounding, sketch, prosa y revisión. Emails NE12 y plantillas WA como superficies de prosa obligadas.

## Alternativa descartada

Escribir y revisar en un solo pase del mismo modelo. Se descarta porque deja tells de IA y pierde la señal adversarial del desacuerdo entre modelos.

## Consecuencias

Ningún PRD mezcla modos. Ningún doc con tells sin unslop. Ningún diseño one-way-door sin interrogate.
