---
id: PRD-ON-01
tipo: prd
estado: aceptado
modulos: [onboarding, panel]
depende_de: [ADR-0011, ADR-0115]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  PRD del diálogo post-login en /panel para el Dueño: checklist ON8 visible, cierre persistente en localStorage, «No tengo empleados» sin invitación.
  Complementa ON1–ON8 sin duplicar el alta ni pedir ficha fiscal o de comercio extra.
---
# PRD-ON-01 - Bienvenida del panel

Fuente: issue #90, issue #94, `docs/02-identidad-onboarding/onboarding-parte-1.md`. Restringido por ADR-0115 y ADR-0009.

## Problema

El Dueño cae en `/panel` después del login sin orientación. La checklist ON8 existe en API pero no tiene ventana dedicada en el hub. No debe repetirse el alta ni bloquearse la pantalla entera.

## Épica ON-E9. Bienvenida en el panel

- Historia **BIEN-S2**. Diálogo de primer ingreso al panel. AC: Given soy Dueño y no tengo marca `bienvenida:panel:<tenant>:<sub>` en localStorage When abro `/panel` Then veo un diálogo con el nombre del comercio y los pasos de `checklist.pasos` del GET de onboarding; When cierro el diálogo Then la marca se guarda y al recargar no vuelve; Given otro tenant sin marca Then sí veo el diálogo. ADR: 0115. Talla M. Depende de: conteos reales en GET (#91 / P1-26).

- Historia **BIEN-S3**. Reglas de contenido y empleados. AC: Given el diálogo When lo inspecciono Then no hay inputs de dirección, CUIT, moneda ni cantidad de empleados; Given toco «No tengo empleados» When el POST checklist responde ok Then el paso empleado figura como no aplica y no se crea invitación; Given soy empleado When abro `/panel` Then no veo el diálogo. ADR: 0115. Talla S. Depende de: BIEN-S2.

## Dependencias externas

Ninguna. Usa sesión Google existente y APIs onboarding ya desplegadas.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Dueño primera visita | Sin marca localStorage | Diálogo visible con checklist |
| Feliz | Cierre | Clic cerrar | Marca guardada, diálogo oculto al recargar |
| Rol | Empleado | membership empleado | Sin nodo `data-bienvenida-panel` |
| Regresión | Campos prohibidos | HTML del componente | Sin dirección/CUIT/moneda/cantidad empleados |
| Feliz | No tengo empleados | POST saltar empleado | Paso «No aplica», sin invitación |
