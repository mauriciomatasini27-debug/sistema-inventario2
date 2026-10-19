---
id: PRECIOS-DEFAULTS
tipo: spec
estado: propuesto
modulos: [precios, bot, fiscal]
depende_de: [PRD-PLAN-02, ADR-0047, ADR-0018]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Defaults de precio por plan con la aritmética de costos de PRD-PLAN-02 y la regla de margen de 4 veces.
  Marca qué default cumple la regla y qué falta confirmar antes de publicar.
---
# Precios default por plan

Estos valores son el default que se aplica mientras Mauri no fije los montos finales. No se publican hasta que existan persistencia real, número de Meta y cobro con Mercado Pago (PLAN2-S4).

## Insumos

| Insumo | Valor | Estado |
|---|---|---|
| Tipo de cambio BNA venta | 1.535 ARS/USD | Del 2026-10-12. Se recalcula el día de cierre de lista |
| WhatsApp utility Argentina | USD 0,0260 por mensaje | Sin verificar en la página oficial de Meta |
| WhatsApp service Argentina | USD 0,0260 después de 1.000 gratis por número y mes, compartidos | Sin verificar en la página oficial de Meta |
| LLM barato | USD 0,10 por millón de entrada y USD 0,50 por millón de salida | Verificado el 2026-10-12 en la página de Anthropic |
| Supabase Pro | USD 25 por mes | Verificado el 2026-10-12 |
| Hosting por tenant | USD 0,60 por mes | Supuesto de 50 tenants sobre Supabase más servidor |
| Comisión de Mercado Pago | Sin dato | Pendiente de confirmar |
| IVA e IIBB | Sin dato | Pendiente de confirmar |

La tarifa de Meta es la que más mueve el costo por plan. La página oficial devolvió 400 desde este entorno el 2026-10-19, así que el valor de 0,0260 queda como supuesto heredado de `PRD-PLAN-02` y no como dato verificado.

## Costo operativo por plan

| Plan | Plantillas | Service | IA | Hosting | Total USD |
|---|---|---|---|---|---|
| Básico | 100 mensajes incluidos: USD 2,60 | 0 | 0 | 0,60 | 3,20 |
| Plus | 65: USD 1,69 | 200: USD 5,20 | 0,10 | 0,60 | 7,59 |
| Pro | 65: USD 1,69 | 400: USD 10,40 | 0,50 | 0,60 | 13,19 |

Sin la IA del Plan Pro, el costo baja a USD 12,69. El costo no incluye comisión de Mercado Pago, IVA ni IIBB.

## Regla de margen

`PRD-PLAN-02` fija precio mayor o igual a 4 veces el costo operativo medido.

| Plan | Precio default USD | Costo USD | Múltiplo | Cumple 4x |
|---|---|---|---|---|
| Básico | 17 | 3,20 | 5,31 | Sí |
| Plus | 33 | 7,59 | 4,35 | Sí |
| Pro sin IA en producción | No se publica | 12,69 | No aplica | No aplica |
| Pro con IA en producción | 59 | 13,19 | 4,47 | Sí |

El default que había quedado anotado para Pro era USD 49. No cumple la regla: 49 / 13,19 = 3,71. Tampoco cumple sin IA, 49 / 12,69 = 3,86. Para sostener USD 49 haría falta bajar el cupo de service de 400 a unos 340 mensajes (costo 11,63, múltiplo 4,21) o aceptar un margen menor. El default queda en 59 condicionado a que la IA esté en producción; hasta entonces Pro no se publica.

## Precio en pesos

Conversión provisoria a 1.535 ARS/USD. No es el precio de lista: falta el tipo de cambio del día de cierre y el redondeo comercial.

| Plan | USD | ARS provisorio |
|---|---|---|
| Básico | 17 | 26.095 |
| Plus | 33 | 50.655 |
| Pro con IA | 59 | 90.565 |

Los precios se publican en ARS más IVA. El ajuste periódico y la fecha de la fuente quedan registrados en la tabla `plans`, nunca a mano en la landing.

## Condiciones de publicación

- Básico a USD 20 solo con factura ARCA en producción. Mientras ARCA no esté, el default es 17.
- Plus a 33. El rango 30 a 35 es válido, pero 30 queda en 3,95 y no cumple la regla de 4x.
- Pro a 59 solo con el asistente IA en producción. Sin IA, Pro no se publica o baja el cupo.
- Ningún plan pago antes de persistencia real, número de Meta y cobro con Mercado Pago.
- Ningún precio hardcodeado en `src/`. La tabla pública se genera desde `plans` y la configuración de tarifas.

## Lo que falta de Mauri

- Confirmar los tres montos finales.
- Confirmar comisión y plazos de Mercado Pago.
- Definir si el precio incluye o suma IVA, y cómo se factura la suscripción.
- Verificar la tarifa de Meta en la página oficial o autorizar el número para consultarla.
