---
id: PRD-BOT-03
tipo: prd
estado: propuesto
modulos: [bot]
depende_de: [ADR-0041, ADR-0042, ADR-0091, PRD-BOT-02]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Plan que desbloquea P9-3. Da de alta el número central en Meta y enciende el envío real del bot, hoy
  limitado al adaptador fake. Historias BOT3-S1 a BOT3-S5.
---
# PRD-BOT-03 - Alta y operación del número central en Meta

Fuente: ADR-0041, ADR-0042, ADR-0091, PRD-BOT-02, `docs/07-canales-whatsapp-email/bot-whatsapp-parte-1.md` y `bot-whatsapp-parte-2.md` (B1 vinculación, B3 consulta), `src/modules/whatsapp/cliente-cloud.ts`. Restringido por ADR-0041 y ADR-0091. Fecha extracción: 2026-10-18.

## Problema

El bot responde con el adaptador fake en tests y desarrollo. El envío real nunca se probó porque el número central no está dado de alta en Meta. Sin número, la consulta de stock por WhatsApp y las alertas no llegan a ningún comercio, y el plan Plus no se puede vender.

## Épica BOT3-E1. Alta del número central

Requisito BOT3-1: existe un número central verificado y el adaptador `cloud` envía y recibe con él.

- Historia BOT3-S1. Crear la app de Meta y el número. AC: Given la cuenta de negocio When configuro el número central Then obtengo `phone_number_id` y token de servidor. ADR: 0041. Talla M. Depende de: nada.
- Historia BOT3-S2. Verificar el negocio. AC: Given los datos del negocio When Meta revisa Then el número pasa a estado verificado y puede mandar a números que no son de prueba. ADR: 0091. Talla S. Depende de: BOT3-S1.
- Historia BOT3-S3. Aprobar las plantillas de utilidad. AC: Given la plantilla de alerta de stock bajo When Meta la aprueba Then el bot puede avisar fuera de la ventana de 24 h. ADR: 0041. Talla M. Depende de: BOT3-S2.
- Historia BOT3-S4. Enviar y recibir real. AC: Given el número verificado When un vendedor vinculado escribe `stock X` Then el adaptador `cloud` responde con el saldo y el webhook normaliza el mensaje entrante. ADR: 0042. Talla M. Depende de: BOT3-S2.

## Épica BOT3-E2. Operación del canal

Requisito BOT3-2: el canal central opera varios comercios sin mezclar datos.

- Historia BOT3-S5. Ventana de 24 h y cupo por plan. AC: Given un mensaje del vendedor dentro de la ventana When responde el bot Then va como mensaje de servicio y descuenta del cupo del plan. Given la ventana cerrada When el bot necesita avisar Then usa una plantilla aprobada. ADR: 0047. Talla S. Depende de: BOT3-S3, BOT3-S4.

## Dependencias externas

Alta del negocio y del número en Meta hecha por Mauri. Verificación del negocio. Aprobación de plantillas. Cuenta de Meta con método de pago.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Consulta real | `stock coca 500` desde un número vinculado | Saldo y precio, `fuente: db` |
| Fallo | Número no vinculado | Mensaje de un número sin vínculo | Pide vincular, cero datos |
| Fallo | Fuera de ventana sin plantilla | Aviso sin plantilla aprobada | El bot no envía, registra el bloqueo |
| Regresión | Núcleo sin adaptador | Tests del router | Pasan sin importar `cliente-cloud` |

Arch-tests: AT1 `router.ts` y `consulta.ts` no importan adaptadores. AT2 el token y `phone_number_id` salen de variables de servidor, nunca del cliente.
