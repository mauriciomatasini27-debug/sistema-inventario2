---
id: PRD-PROV-01
tipo: prd
estado: propuesto
modulos: [bot, compras]
depende_de: [ADR-0096]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Los proveedores mandan sus facturas al número del bot. El Dueño habilita a cada proveedor con un código de
  invitación, el teléfono queda atado al comercio como contacto pendiente, y la factura entra como borrador
  que solo el Dueño confirma. La identidad del proveedor sale del CUIT que lee el OCR.
---
# PRD-PROV-01 - Recepción de facturas de proveedores por WhatsApp

Fuente: ADR-0096. Restringido por ADR-0096.

## Problema

Los proveedores mandan la factura por WhatsApp al comercio. Hoy el bot solo acepta mensajes de números vinculados (Dueño o Empleado), así que la factura de un proveedor no puede entrar: el comerciante la reenvía a mano o la carga en la web. Con un número central compartido, un remitente desconocido no resuelve comercio, y el borrador no tiene a qué comercio pertenecer. Queremos que el proveedor le mande la factura al número del bot y que el borrador llegue al comercio correcto, sin abrir la puerta a desconocidos.

## Épica PROV-E1. Alta del contacto de proveedor por invitación

Requisito PROV-R1: el Dueño habilita a un proveedor con un código de invitación, y ese código ata el teléfono del proveedor al comercio.

- Historia PROV-S1. El Dueño genera un código de invitación para un proveedor desde `/panel/proveedores`. AC: Given un Dueño autenticado When pide el código de un proveedor Then ve un código de un solo uso con vencimiento y ese proveedor queda marcado como invitado. ADR: 0096. Talla M. Depende de: nada.
- Historia PROV-S2. El proveedor manda el código al número central y el bot lo ata al comercio. AC: Given un proveedor con un código válido When envía el código como primer mensaje Then el bot crea el contacto en estado pendiente atado a ese comercio y responde pidiendo la factura. ADR: 0096. Talla M. Depende de: PROV-S1.
- Historia PROV-S3. Un código inválido o vencido no ata nada. AC: Given un número sin código válido When escribe al bot Then el bot responde el genérico y no crea contacto ni borrador. ADR: 0096. Talla S. Depende de: PROV-S2.
- Historia PROV-S4. El Dueño aprueba o revoca el contacto. AC: Given un contacto pendiente When el Dueño aprueba Then pasa a verificado; When revoca Then el número deja de poder mandar. ADR: 0096. Talla M. Depende de: PROV-S2.

## Épica PROV-E2. Ingesta de la factura del proveedor

Requisito PROV-R2: una factura que manda un contacto de proveedor verificado entra como borrador del comercio.

- Historia PROV-S5. El borrador entra al comercio del contacto. AC: Given un contacto verificado When manda una foto o un PDF Then el OCR arma un borrador del comercio de ese contacto, con el origen de proveedor. ADR: 0096. Talla M. Depende de: PROV-S2.
- Historia PROV-S6. La identidad del proveedor sale del CUIT leído. AC: Given una factura con CUIT When el OCR lo lee Then el bot matchea el proveedor del comercio por CUIT o propone crear uno. ADR: 0096. Talla M. Depende de: PROV-S5.
- Historia PROV-S7. El teléfono queda como vínculo secundario. AC: Given un proveedor con CUIT ya cargado When un teléfono nuevo manda Then el bot no duplica el proveedor y ata el teléfono al existente. ADR: 0096. Talla S. Depende de: PROV-S6.

## Épica PROV-E3. Revisión y confirmación del Dueño

Requisito PROV-R3: el borrador de proveedor no toca nada hasta que el Dueño lo confirma, y las correcciones son las de ADR-0094 y ADR-0095.

- Historia PROV-S8. Aviso al Dueño. AC: Given un borrador pendiente de proveedor When se crea Then el Dueño recibe el aviso con los botones de Descartar, Confirmar y Editar. ADR: 0096. Talla M. Depende de: PROV-S5.
- Historia PROV-S9. Correcciones con el núcleo existente. AC: Given un borrador cuya suma no cierra When el Dueño corrige por texto Then vale lo de ADR-0095 sin cambios. ADR: 0096. Talla S. Depende de: PROV-S8.
- Historia PROV-S10. El alta del proveedor queda de la confirmación. AC: Given un CUIT no cargado When el Dueño confirma el borrador y acepta crear el proveedor Then el proveedor queda en la lista con el CUIT de la factura. ADR: 0096. Talla M. Depende de: PROV-S6.

## Épica PROV-E4. Control de abuso

Requisito PROV-R4: el canal de proveedores no se puede usar para spamear el comercio.

- Historia PROV-S11. Cupo por número. AC: Given un contacto When supera el cupo de mensajes por ventana Then el bot deja de aceptar hasta que se reponga o el Dueño lo habilite. ADR: 0096. Talla M. Depende de: PROV-S2.
- Historia PROV-S12. Estado revocado. AC: Given un contacto revocado When manda un mensaje Then el bot lo trata como no vinculado y no crea nada. ADR: 0096. Talla S. Depende de: PROV-S4.

## Dependencias externas

- Cloud API de Meta: ventana de 24 h y plantillas aprobadas para los avisos fuera de ventana (a verificar en fuente oficial).
- Opt-in del proveedor (pregunta abierta en `docs/07-canales-whatsapp-email/bot-whatsapp-parte-2.md`).
- Ley 25.326: retención y tratamiento de los datos del proveedor.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Proveedor invitado manda factura | Código válido más foto con CUIT | Contacto pendiente, borrador del comercio, aviso al Dueño |
| Feliz | Proveedor ya cargado vuelve a mandar | Teléfono atado más CUIT existente | No duplica proveedor, crea un borrador nuevo |
| Fallo | Código vencido | Código expirado | Respuesta genérica, sin contacto ni borrador |
| Fallo | Número no invitado | Foto sin código | Respuesta genérica, sin borrador |
| Fallo | Spam | Mensajes sobre el cupo | El bot corta hasta reponer |
| Fallo | Contacto revocado | Factura de un contacto revocado | Se trata como no vinculado |
