---
id: ADR-0091
tipo: adr
estado: propuesto
modulos: [bot]
depende_de: [ADR-0041, ADR-0042]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Cierra P9-3. El número central se da de alta con la Cloud API directa de Meta. Si la verificación del
  negocio o las plantillas se traban más de 4 semanas, se pasa a un BSP sin tocar el núcleo (ADR-0042).
---
# ADR-0091 - Alta del número central de WhatsApp: Meta directo o BSP

Estado: propuesto. Fecha: 2026-10-18. Fuentes: ADR-0041 (Cloud API oficial), ADR-0042 (WhatsAppTransport), PRD-BOT-02 (BOT2-E2), `docs/01-fundacion/costos-por-cliente.md` (número central), P9-3. Decisión propuesta para aprobación de Mauri.

## Decisión

El número central se da de alta con la Cloud API directa de Meta, como en ADR-0041, y no con un BSP. Si la verificación del negocio o la aprobación de las plantillas se traban más de 4 semanas desde el alta, se pasa a un BSP como 360dialog. Cambiar de BSP no toca el núcleo porque toda salida y entrada pasa por `WhatsAppTransport` (ADR-0042).

## Por qué

La API directa cobra la tarifa de Meta sin el margen de un intermediario por mensaje, y el número central es de un solo proveedor. Un BSP agrega una capa y su costo, pero también acelera el alta, la verificación y el soporte cuando Meta demora. La fecha de la verificación del negocio no depende de nosotros, así que conviene fijar de antemano la salida por BSP en lugar de esperar sin límite. El transporte intercambiable ya soporta ese cambio.

## Qué cambia

Nada de código todavía. Al aprobarse, P9-3 deja de estar bloqueado por decisión y pasa a ejecución por PRD-BOT-03. `cliente-cloud.ts` sigue siendo el adaptador productivo. Si se pasa a BSP, se agrega un adaptador nuevo sin tocar `router.ts` ni `consulta.ts`.

## Pendientes

Alta del negocio en Meta y verificación. Plantillas de utilidad aprobadas para consulta de stock y alertas. Verificar la tarifa vigente de Meta en la fuente oficial antes de fijar cupos de plan.
