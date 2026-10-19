---
id: ADR-0096
tipo: adr
estado: aceptado
modulos: [bot, compras]
depende_de: [ADR-0005, ADR-0091, ADR-0093, ADR-0094, ADR-0095]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  El bot recibe facturas de proveedores por WhatsApp, pero no de números desconocidos en frío: el Dueño
  genera un código de invitación de un solo uso y con eso el teléfono queda atado al comercio como contacto
  pendiente. La identidad del proveedor sale del CUIT que lee el OCR, no del teléfono.
---
# ADR-0096 - Recepción de facturas de proveedores por WhatsApp

Estado: aceptado. Fecha: 2026-10-19. Aprobado por Mauri el 2026-10-19 (eligió el mecanismo de entrada por código de invitación del comercio). Fuentes: ADR-0005 (OCR), ADR-0091 (número central), ADR-0093/0094/0095 (borrador OCR, correcciones y edición por texto), `docs/05-compras-servicios-pagos/facturas-proveedores.md` (FP1.2, FP2.2), `docs/07-canales-whatsapp-email/bot-whatsapp-parte-2.md` (opt-in del proveedor, ventana de 24 h).

## Decisión

El bot recibe facturas de proveedores por WhatsApp, pero no de números desconocidos en frío. El Dueño genera desde la web un código de invitación de un solo uso para un proveedor; el proveedor manda ese código en su primer mensaje al número central. Con el código, el bot ata ese teléfono al comercio del Dueño como contacto de proveedor en estado pendiente, y desde ahí el borrador de la factura entra a la cola de revisión del comercio.

- El comercio se resuelve solo por el código de invitación, nunca por el contenido del mensaje: se mantiene la regla de `src/modules/whatsapp/resolucion.ts`.
- La identidad del proveedor se toma del CUIT que lee el OCR de la factura, no del teléfono. El bot matchea ese CUIT contra la lista de proveedores del comercio y, si no existe, propone crearlo.
- Todo borrador de proveedor nace pendiente y solo el Dueño lo confirma. Las correcciones reusan ADR-0094 y ADR-0095.
- Se mantiene el número central (ADR-0091). No se pasa a un número por comercio.
- El código es de un solo uso, con vencimiento, y el contacto se puede revocar. Cada número tiene un cupo de mensajes.

## Por qué

Los proveedores mandan las facturas por WhatsApp, no por email, así que el camino útil es el que ya usa la gente. Con un número central, un remitente desconocido no resuelve comercio, y la regla de `resolucion.ts` prohíbe deducir el comercio del contenido: sin una señal externa no hay a quién asignar la factura. Un número por comercio resolvería la tenencia directo, pero revierte ADR-0091 y sube el costo por cliente. El código de invitación aporta la señal que falta, reusa el patrón de vinculación de usuarios (`VINCULAR`) y no le abre la puerta a desconocidos. Tomar la identidad del CUIT leído, y no del teléfono, evita la suplantación: el teléfono es un vínculo, el CUIT es el proveedor.

## Qué cambia

Código nuevo: un estado de contacto de proveedor (pendiente/verificado/revocado) por comercio; el webhook reconoce el código antes de la puerta de identidad; una variante de origen para el job de OCR; el alta de proveedor por CUIT leído; la web del Dueño genera el código. El spec `docs/05-compras-servicios-pagos/facturas-proveedores.md` cambia en FP1.2 y FP2.2 (el proveedor pasa a poder mandar; el email sigue fuera). Nada de esto se implementa sin PRD-PROV-01.

## Pendientes

Verificar en fuente oficial la ventana de 24 h y el costo de las plantillas para los avisos fuera de ventana. Definir el opt-in del proveedor (pregunta abierta en `docs/07-canales-whatsapp-email/bot-whatsapp-parte-2.md`). Política de retención de datos del proveedor (Ley 25.326). Cupo de mensajes por número y bloqueo. UI del código en `/panel/proveedores`.
