---
id: PRD-XXX-00
# tipo: adr|prd|plan|spec|historico
tipo: prd
# estado: propuesto|aceptado|hecho|reemplazado|deprecado
estado: propuesto
modulos: []
depende_de: []
reemplaza: []
# reemplazado_por es obligatorio si estado=reemplazado
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Resumen factual del PRD en un máximo de 3 líneas.
---
# PRD-XXX-00 - Título

Fuente: ... Restringido por ADR-NNNN.

## Problema

...

## Épica XXX-E1. Nombre de la épica

Requisito XXX-R1: ...

- Historia XXX-S1. Descripción de la historia. AC: Given contexto When acción Then resultado. ADR: NNNN. Talla S. Depende de: nada.
- Historia XXX-S2. Descripción de la historia. AC: Given contexto When acción Then resultado. ADR: NNNN. Talla S. Depende de: XXX-S1.

## Dependencias externas

...

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Caso feliz | Entrada válida | Resultado esperado |
| Fallo | Caso de fallo | Entrada inválida | Error esperado |
