---
id: ADR-0092
tipo: adr
estado: aceptado
modulos: [precios]
depende_de: [ADR-0047, PRD-PLAN-01]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Cierra P9-5. La suscripción se cobra con Mercado Pago en ARS y débito automático. La transferencia queda
  como excepción manual. La landing no publica precios hasta que haya persistencia real, número Meta y cobro.
---
# ADR-0092 - Proveedor de cobro de la suscripción

Estado: aceptado. Fecha: 2026-10-18. Aprobado por Mauri el 2026-10-18. Fuentes: ADR-0047 (cobro por plan mensual), PRD-PLAN-01, PRD-PLAN-02 (rangos y supuestos), `src/pages/api/billing/webhooks/mercadopago.ts`, P9-5.

## Decisión

La suscripción se cobra con Mercado Pago en pesos y débito automático sobre una suscripción o preaprobación. La transferencia bancaria queda como excepción manual para comercios que la pidan. El webhook existente en `src/pages/api/billing/webhooks/mercadopago.ts` es la base del cobro, con firma HMAC e idempotencia ya esbozadas.

Los precios se publican en pesos sobre el rango de PRD-PLAN-02, y la tabla pública se genera desde la tabla `plans`, nunca a mano. Ningún precio se publica antes de que existan la persistencia real, el número de Meta y el cobro.

## Por qué

Mercado Pago es lo que el comerciante argentino usa y ya hay un webhook empezado en el repo. Cobrar en pesos evita el problema del tipo de cambio y del medio de pago local. Stripe complica el cobro en pesos y el alta del comercio. La transferencia no da débito automático ni conciliación, así que queda como salida manual y no como vía principal. ADR-0047 ya previó Mercado Pago o transferencia, pero no eligió.

## Qué cambia

Nada de código todavía. Al aprobarse, P9-5 deja de estar bloqueado por decisión y pasa a ejecución por PRD-PLAN-03. Se registran las credenciales de Mercado Pago como bloqueo de credencial externa. La tabla `plans` y `subscriptions` de PRD-PLAN-01 pasan a ser la fuente del precio publicado.

## Pendientes

Confirmar la comisión y los plazos de acreditación vigentes. Abrir la cuenta y cargar las credenciales. Confirmar el rango final por plan con PRD-PLAN-02 antes de publicar. Definir si la suscripción se factura por ARCA y quién la emite.
