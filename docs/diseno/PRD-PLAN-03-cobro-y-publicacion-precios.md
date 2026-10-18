---
id: PRD-PLAN-03
tipo: prd
estado: propuesto
modulos: [precios]
depende_de: [ADR-0047, ADR-0092, PRD-PLAN-01, PRD-PLAN-02]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Plan que desbloquea P9-5. Persiste planes y suscripciones, cobra con Mercado Pago y publica la tabla de
  precios generada desde `plans`. Historias PLAN3-S1 a PLAN3-S6.
---
# PRD-PLAN-03 - Cobro de la suscripción y publicación de precios

Fuente: ADR-0047, ADR-0092, PRD-PLAN-01 (planes y suscripciones), PRD-PLAN-02 (rangos y supuestos), `src/pages/api/billing/webhooks/mercadopago.ts`, `docs/01-fundacion/costos-por-cliente.md`. Restringido por ADR-0047 y ADR-0092. Fecha extracción: 2026-10-18.

## Problema

Los planes y las suscripciones son un PRD sin código. El webhook de Mercado Pago es un esbozo sin suscripciones detrás. La landing no puede publicar precios porque no hay persistencia ni cobro. Sin cobro, ningún plan pago se puede vender.

## Épica PLAN3-E1. Persistencia de planes y suscripciones

Requisito PLAN3-1: la tabla `plans` es la única fuente del precio y del cupo por plan.

- Historia PLAN3-S1. Persistir planes y cupos. AC: Given los tres planes con su precio y cupo When migro Then `plans` y `plan_features` tienen los datos y el resolvedor `planIncluye` los lee. ADR: 0047. Talla M. Depende de: nada.
- Historia PLAN3-S2. Persistir la suscripción por tenant. AC: Given un comercio con prueba de 14 días vencida When se suscribe Then `subscriptions` guarda plan, estado y próxima fecha de cobro. ADR: 0047. Talla M. Depende de: PLAN3-S1.

## Épica PLAN3-E2. Cobro con Mercado Pago

Requisito PLAN3-2: el cobro es idempotente y el estado de la suscripción sigue al pago.

- Historia PLAN3-S3. Crear la suscripción o preaprobación. AC: Given un comercio que elige un plan When confirma Then se crea la preaprobación en Mercado Pago y queda el vínculo externo guardado. ADR: 0092. Talla M. Depende de: PLAN3-S2.
- Historia PLAN3-S4. Webhook de pago idempotente. AC: Given un pago repetido por reintento When llega el webhook Then el estado de la suscripción cambia una sola vez y el cobro se registra una sola vez. ADR: 0092. Talla M. Depende de: PLAN3-S3.
- Historia PLAN3-S5. Mora a 14 días. AC: Given un pago rechazado When pasan 14 días sin cobro Then el plan queda en mora y los módulos pagos se apagan sin borrar datos. ADR: 0047. Talla S. Depende de: PLAN3-S4.

## Épica PLAN3-E3. Publicación de precios

Requisito PLAN3-3: la tabla pública sale de `plans`, nunca a mano, y no se publica antes de que existan persistencia, número Meta y cobro.

- Historia PLAN3-S6. Generar la tabla pública. AC: Given `plans` con precios y el estado de las funciones When armo la landing Then la tabla sale de `plans` con tipo de cambio, fecha y fuente, y ningún plan se publica si le falta una función que su precio asume. ADR: 0047, 0092. Talla M. Depende de: PLAN3-S4, PLAN2-S4, BOT3-S2.

## Dependencias externas

Credenciales y cuenta de Mercado Pago aportadas por Mauri. Comisión y plazos vigentes. Factura ARCA de la suscripción, que depende de PRD-FE-02.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Alta de suscripción | Comercio elige Plus | Preaprobación creada y estado `activa` |
| Fallo | Pago rechazado | Webhook de rechazo | Estado `mora` tras 14 días, datos intactos |
| Fallo | Webhook repetido | Mismo id de pago dos veces | Un solo cambio de estado |
| Regresión | Precio a mano | Editar la landing sin `plans` | La tabla no cambia |

Arch-tests: AT1 ningún precio hardcodeado en `src/`. AT2 la tabla pública se genera desde `plans`. AT3 el plan apagado no borra datos.
