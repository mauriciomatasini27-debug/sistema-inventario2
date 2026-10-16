---
id: MOD-05-ORDENES-PAGO
tipo: spec
estado: propuesto
modulos: [compras, pagos]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: |
  El bot prepara y entrega; el comerciante paga desde su propia app. Sin ejecución de pagos ni credenciales, en
  todas las fases. Una base de datos por cliente más una base de control, como ModoOps; las órdenes viven en la
  base del comercio.
---
> Origen: `PRD - Órdenes de Pago para Sistema de Inventario.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/payments`, `src/pages/api/payment-orders/*`, `src/db/schema-pagos.ts`

---

# PRD - Órdenes de Pago para Sistema de Inventario

Principio rector (no negociable): el bot prepara la orden de pago y le entrega al comerciante lo que necesita para pagar; el que paga es siempre el comerciante, desde su propia app del banco o de Mercado Pago. El bot no ejecuta pagos y nunca tiene acceso a las credenciales de Mercado Pago, del home banking, de ARCA (clave fiscal) ni de las empresas de servicios del comerciante. Ver OP1 y la sección 7.

Nota sobre datos externos: los datos de terceros (ARCA, Mercado Pago, bancos, empresas de servicios, WhatsApp Business Platform) marcados [a verificar] deben confirmarse en la documentación oficial antes de implementar. Los nombres de dominios oficiales y de empresas que aparecen como ejemplo también son [a verificar].

## 1. Resumen / visión general

### 1.1 Problema

El dueño de un kiosco paga muchas cosas por semana y por mes: el preventista que trajo la mercadería, la distribuidora en cuenta corriente a 30 días, el alquiler, la luz, el gas, internet, la alarma, el monotributo o los impuestos de ARCA. Hoy:

La información para pagar está desparramada: el CBU del proveedor en un chat de WhatsApp, el monto en una factura en papel, el vencimiento en la boleta de la luz, el VEP del monotributo en el sitio de ARCA.

Cada pago implica buscar los datos, tipearlos en el home banking o en Mercado Pago y, si se acuerda, anotarlo en algún lado. Los errores de tipeo en un CBU o en un monto cuestan plata.

Se pasan vencimientos y se pagan recargos.

Aunque la caja digital (PRD de Caja) y el estado de pago de los pedidos (PRD principal, F5.10 a F5.16) ya registran el pago, el dueño igual tiene que armar el pago a mano y después volver a la app a marcarlo.

Proliferan las estafas: mensajes falsos de "pagá tu factura de luz acá", facturas adulteradas con un CBU cambiado y links que imitan a Mercado Pago o a ARCA.

### 1.2 Visión

El bot de WhatsApp prepara las órdenes de pago del comercio a partir de lo que el sistema ya sabe: las facturas de proveedores fotografiadas y leídas por OCR (guardadas en Google Photos, PRD de Facturas), los pedidos de reposición pendientes de pago (PRD principal, F5) y los gastos recurrentes y vencimientos (alquiler, luz, gas, servicios e impuestos; PRD de Caja, C9). Para cada pago junta beneficiario, monto, referencia de la factura, fecha de vencimiento y medio sugerido, y se lo presenta al dueño para revisar.

El dueño confirma con un toque (o edita antes) y el bot le manda un link de pago directo y oficial (por ejemplo, el link de Mercado Pago que le dio el proveedor o la página oficial de pago de la empresa de servicios o de ARCA) o los datos para transferir (CBU/CVU/alias, titular, referencia y monto). El dueño paga en su propia app. Cuando avisa que pagó (con un toque o mandando la foto del comprobante), el pedido de reposición pasa a Pagado y el egreso queda registrado en la caja, vinculado a la factura del proveedor.

### 1.3 Propuesta de valor

"El bot te arma los pagos de la semana con todos los datos; vos revisás, tocás y pagás desde tu app. Sin tipear CBU, sin olvidarte vencimientos y sin darle tus claves a nadie."

### 1.4 Alcance del módulo

Es un módulo del mismo producto: misma app Astro, mismo backend, mismos usuarios y roles, misma base de datos por comercio. El bot es el canal principal (PRD del bot); la web muestra y administra las órdenes.

No es un medio de pago ni una billetera, no es agregador de pagos ni procesa fondos de terceros. La plata nunca pasa por la plataforma.

Conecta tres piezas existentes: facturas de proveedores (origen y respaldo del pago), pedidos de reposición (estado de pago) y caja (egreso registrado).

## 2. Objetivos y no-objetivos

### 2.1 Objetivos

### 2.2 No-objetivos (fuera de alcance)

No ejecuta pagos ni transfiere plata, ni en el MVP ni en fases posteriores. No inicia transferencias, no debita cuentas, no "paga por vos".

No pide, recibe, guarda ni usa credenciales del comerciante: usuario y contraseña de home banking, Mercado Pago, clave fiscal de ARCA, cuentas de empresas de servicios, tokens, códigos de verificación, token de seguridad bancario ni datos de tarjeta.

No genera VEP ni declaraciones juradas en ARCA (requieren clave fiscal); solo recuerda, guía y deja el link oficial.

No es un sistema contable ni de tesorería: no hace conciliación bancaria completa ni libro IVA.

No emite facturas ni recibos (igual que el PRD principal y el PRD de Caja).

No negocia ni modifica condiciones con proveedores; no le avisa al proveedor por su cuenta que se pagó (P2 opcional, siempre con confirmación del dueño).

No reemplaza a la agenda de vencimientos de la caja (C9): la usa como fuente.

## 3. Usuarios

### 3.1 Dueño/a (rol Dueño)

Usuario principal. Recibe las órdenes preparadas por el bot, las revisa, edita, confirma, paga en su app y las marca como pagadas.

Es el único que puede cargar o cambiar los datos de cobro de un beneficiario (CBU/CVU/alias, link de pago), y siempre desde la web (ver OP6).

Usa Mercado Pago y home banking todos los días; desconfía (con razón) de cualquier cosa que le pida claves.

### 3.2 Empleado/a (rol Empleado)

Puede (por defecto): mandar al bot la foto de una factura del proveedor (que crea una orden en Borrador, según el PRD de Facturas) y ver que existe una orden pendiente de un proveedor, sin datos de cobro.

No puede (por defecto): ver montos totales adeudados, confirmar órdenes, recibir links o datos de pago, marcar órdenes como pagadas ni editar datos de cobro. Configurable por el Dueño ("empleado con permiso para pagos"), igual que el permiso para marcar pedidos como pagados del PRD principal (F5.14).

### 3.3 Beneficiario (proveedor, propietario del local, empresa de servicios, ARCA)

Destinatario del pago, no usuario. No interactúa con el bot. Sus datos de cobro se cargan en la ficha del proveedor (F6) o en la ficha de beneficiario (OP6).

### 3.4 Administrador de la plataforma

Mantiene, desde el Control Plane, la lista de dominios oficiales de pago (allowlist, sección 7.3) y las plantillas de WhatsApp. Nunca ve datos de cobro, montos ni órdenes de un comercio sin consentimiento y registro (mismo criterio de "impersonación" auditada del PRD principal).

## 4. Funcionalidades

### 4.0 Priorización

### OP1. Principio "el bot prepara, el comerciante paga" (P0, transversal)

Descripción: principio duro del producto y requisito de seguridad. Ninguna funcionalidad, integración ni fase posterior puede contradecirlo sin una decisión explícita documentada en este PRD.

### Requerimientos:

OP1.1 El sistema no ejecuta pagos: no inicia transferencias, no usa APIs de pago para debitar la cuenta del comerciante, no autoriza débitos ni opera como iniciador de pagos.

OP1.2 El sistema no solicita, recibe, almacena ni procesa credenciales de Mercado Pago, bancos, ARCA (clave fiscal) ni empresas de servicios, ni tokens de acceso de esas cuentas, códigos de verificación, coordenadas, PIN, token de seguridad bancario ni datos de tarjetas.

OP1.3 Si el comerciante manda al bot algo que parece una credencial (por ejemplo "mi clave de MP es ..."), el bot no la procesa: el contenido se redacta antes de guardarse en el log del bot, no se envía a ningún servicio (ni OCR ni LLM) y el bot responde con un aviso ("No necesito tus claves y nunca te las voy a pedir. Si la compartiste, te recomiendo cambiarla.").

OP1.4 La salida del módulo hacia el comerciante es solo: (a) un link a una página oficial de pago (o al link de pago generado por el beneficiario), o (b) datos de pago (CBU/CVU/alias, titular, CUIT, referencia, monto). El pago lo hace el comerciante en su propia app.

OP1.5 La integración de suscripción de la plataforma con Mercado Pago (PRD principal, 6.8) es otra cosa: cobra la suscripción del comercio a la plataforma y no se usa para nada de este módulo.

OP1.6 El principio se comunica en el onboarding del módulo, en cada mensaje con instrucciones de pago y en los términos del servicio.

### Criterios de aceptación:

☐ No existe en el código ni en la base ningún campo, tabla, secreto o variable de entorno para guardar credenciales de cuentas del comerciante (verificado por revisión de esquema y test automático sobre el modelo de datos).

☐ Ningún flujo del bot pide usuario, contraseña, clave fiscal, token ni código de verificación (verificado sobre el catálogo de mensajes y plantillas).

☐ Si mando "mi clave del banco es 1234", el bot me avisa que no la necesita y en el log del bot el contenido queda redactado.

☐ No hay ningún botón ni comando "Pagar ahora" que mueva plata: el único camino es link o datos → pago en mi app → "Ya pagué".

### OP2. Orden de pago y estados (P0)

Descripción: una orden de pago es la preparación de un pago concreto a un beneficiario, con todo lo necesario para pagarlo y su vínculo con el respaldo (factura, pedido o vencimiento) y con la caja.

### Requerimientos:

OP2.1 Cada orden tiene: número correlativo por comercio (ej.: OP-0042), beneficiario (proveedor de F6 u otro beneficiario de OP6), tipo (proveedor, alquiler, luz, gas, servicios, impuestos), concepto, monto (centavos enteros, ARS), referencia (número de factura, número de cliente o código de pago electrónico, período), fecha de vencimiento, medio de pago sugerido (uno de los cinco medios existentes de la caja: Efectivo, Débito, Mercado Pago, Transferencia bancaria y QR (QR de Mercado Pago o QR del postnet); el módulo no crea medios ni tipos de pago propios, ver OP2.11), instrucción de pago (link oficial, datos de transferencia, código de pago o efectivo contra entrega), categoría de egreso de la caja (C5; "Sin factura" para los gastos y pedidos sin factura, ver OP9.2), nota (texto libre; obligatoria cuando la categoría es "Sin factura"), origen (factura, pedido de reposición, vencimiento, manual) y vínculos opcionales a la factura del proveedor, al pedido de reposición y al vencimiento de la caja.

OP2.2 Estados:

OP2.3 Las transiciones las aplica solo el backend (máquina de estados en la capa de dominio), nunca el bot ni el cliente directamente. Cualquier transición no listada se rechaza.

OP2.4 Vencida la marca un job diario (y la evaluación al abrir la orden) cuando vence_el es anterior a la fecha de la jornada del comercio. Una orden Vencida se puede pagar igual; queda registrado que se pagó fuera de término.

OP2.5 Editar un dato obligatorio (monto, beneficiario, datos de cobro, vencimiento) incrementa la versión de la orden; si estaba Enviada al comerciante, vuelve a Lista para pagar y el link o los datos anteriores se marcan como reemplazados (el bot lo avisa).

OP2.6 Una orden activa por respaldo: un pedido de reposición, una factura del proveedor o un vencimiento no pueden estar en más de una orden activa (no Cancelada ni Pagada). Evita pagar dos veces lo mismo.

OP2.7 Posible duplicado: la detección de facturas duplicadas es la del PRD de Facturas (FP9); además, si se crea una orden con el mismo beneficiario y el mismo número de factura, o el mismo monto con vencimiento cercano (±3 días), que otra activa o Pagada en los últimos 60 días, se muestra la alerta "Posible pago duplicado" y se exige confirmación explícita.

OP2.8 Solo el Dueño (o un empleado con permiso para pagos) confirma, marca como pagada o cancela una orden.

OP2.9 (P1) Pagos parciales: alineado con F5.16 del PRD principal (seña y saldo), una orden puede registrar varios pagos; cada pago genera su egreso en la caja; la orden queda Pagada cuando la suma cubre el total.

OP2.10 Orden de cierre de cuenta corriente (P0): para proveedores en "Cuenta corriente" (FP5 y FP6 del PRD de Facturas), el día de cierre configurado el bot prepara una orden por el total de las facturas impagas hasta la fecha de cierre (la preselección de FP6.3; el Dueño puede quitar o agregar facturas antes de confirmar). Al pagarla se genera un solo pago a proveedor con su asignación a cada factura y un único egreso en la caja. (P1) Orden agrupada de varios pedidos sin factura del mismo proveedor.

OP2.11 Medios de pago (decisión): las órdenes usan solo los medios de pago existentes de la caja (cash_payment_methods del PRD de Caja): Efectivo, Débito, Mercado Pago, Transferencia bancaria y QR (QR de Mercado Pago o QR del postnet). Este módulo no crea un medio ni un tipo de pago nuevo; el medio sugerido, el medio editado (OP7.3) y el medio con que se marca Pagada (OP9.1) se eligen siempre entre esos cinco.

### Criterios de aceptación:

☐ Una orden creada desde una factura con todos los datos confirmados queda en "Lista para pagar"; si falta el CBU del proveedor, queda en "Borrador" con el faltante indicado.

☐ No puedo pasar una orden de "Borrador" a "Enviada al comerciante" sin pasar por "Lista para pagar".

☐ No puedo crear una segunda orden activa para el pedido #42 si ya existe OP-0042 para ese pedido.

☐ Una orden con vencimiento 10/10 no pagada aparece "Vencida" el 11/10 y la puedo marcar Pagada igual.

☐ Cancelar una orden exige motivo y queda en la auditoría.

☐ Si edito el monto de una orden Enviada, vuelve a "Lista para pagar" y el bot me avisa que el link o los datos anteriores ya no valen.

☐ El medio sugerido de cualquier orden es uno de los cinco medios de la caja (Efectivo, Débito, Mercado Pago, Transferencia bancaria o QR); no existe un medio ni un tipo de pago "Orden de pago".

### OP3. Preparación desde facturas de proveedores (P0)

Descripción: cuando el comerciante (o un empleado) fotografía una factura del proveedor y la manda al bot, el flujo del PRD de Facturas la guarda en el Google Photos del comercio, el OCR sugiere los valores y el usuario los confirma con un toque. Con la factura confirmada, el bot prepara la orden de pago.

### Requerimientos:

OP3.1 La orden depende del modo de pago de facturas del proveedor (FP5 del PRD de Facturas):

Cuenta corriente: la factura confirmada queda pendiente de pago; el bot prepara la orden según su vencimiento (OP11) o la incluye en la orden de cierre de cuenta corriente (OP2.10).

Pagar en el momento: si el comerciante elige "Pagar ahora" con Efectivo, el flujo de FP5.3 registra el pago directamente (no hace falta orden). Si elige otro de los medios de la caja (Transferencia bancaria, Mercado Pago, QR o Débito) y todavía no pagó, el bot ofrece "¿Te paso los datos para pagar?", que crea la orden y pasa directo a la entrega (OP8); el pago se registra recién con "Ya pagué" (OP9), nunca antes.

Configurable por comercio: preparar la orden automáticamente o preguntar "¿Preparo la orden de pago?".

OP3.2 Datos que se toman de la factura confirmada: proveedor (match por CUIT y, si no hay, por nombre), tipo y número de comprobante, fecha de emisión, fecha de vencimiento (si figura), importe total y datos de cobro impresos, si los hay (CBU/CVU/alias, QR o link de pago).

OP3.3 Datos que se completan desde el sistema: medio sugerido y plazo según las condiciones de pago del proveedor (F6.1), datos de cobro registrados en la ficha del proveedor (OP6) y pedido de reposición relacionado (si hay un pedido Pendiente de pago del mismo proveedor con monto similar, se sugiere vincularlo).

OP3.4 Si la factura no trae vencimiento, se calcula: fecha de emisión + N días de las condiciones de pago del proveedor; si es contado, vence hoy.

OP3.5 Regla anti-fraude: si los datos de cobro leídos de la factura no coinciden con los registrados en la ficha del proveedor, la orden queda en Borrador con la alerta "El CBU/alias de esta factura es distinto del que tenés cargado para Distribuidora X" y se usan los datos de la ficha hasta que el Dueño los cambie desde la web (OP6.3). Nunca se reemplazan datos de cobro a partir de una foto.

OP3.6 La orden guarda la referencia a la factura (supplier_invoice_id) y, a través de ella, al mediaItemId de Google Photos de la imagen.

OP3.7 Ningún valor del OCR pasa a "Lista para pagar" sin la confirmación de un usuario (ya confirmada en la factura o confirmada en la orden).

OP3.8 Si la factura se anula (FP10 del PRD de Facturas), la orden activa que la incluye se cancela con motivo "factura anulada" (o se recalcula, si es una orden de cierre con otras facturas). Las facturas son inmutables: la orden nunca modifica la factura, solo registra pagos asignados a ella.

### Criterios de aceptación:

☐ Mando la foto de la factura A 0003-00012345 de Distribuidora X por $182.500, confirmo los valores con un toque y el bot me ofrece la orden con proveedor, monto, número de factura, vencimiento a 30 días y "Transferencia bancaria" como medio sugerido.

☐ Desde la orden en la web abro la imagen de la factura guardada en Google Photos.

☐ Si la factura trae un CBU distinto del de la ficha, la orden queda en Borrador con la alerta y no usa el CBU de la factura.

☐ Si hay un pedido #42 Pendiente de pago a Distribuidora X por $185.000, el bot me sugiere vincular la factura y la orden a ese pedido.

### OP4. Preparación desde pedidos de reposición (P0)

Descripción: los pedidos de reposición en "Pendiente de pago" o "Facturado (pendiente de pago)" (PRD principal, F5.10 a F5.15; PRD de Facturas, FP7) son fuente de órdenes según las condiciones de pago del proveedor.

### Requerimientos:

OP4.1 Contado / transferencia contra entrega: cuando el pedido se marca Recibido (P1) o se registra la entrega, o el día de entrega configurado del proveedor, el bot prepara la orden con el total estimado (editable) y vencimiento hoy.

OP4.2 Cuenta corriente a N días: el bot prepara la orden con vencimiento = payment_due_at del pedido (fecha de envío o de recepción + N días) y la presenta según la anticipación configurada (OP11).

OP4.3 Pago anticipado: al confirmar y enviar el pedido (F5.7), el bot ofrece preparar la orden en el momento.

OP4.4 Monto: si hay factura vinculada (pedido "Facturado"), la orden se arma desde la factura (OP3) por su saldo, no desde el pedido; si no, el total estimado del pedido; siempre editable (el total real puede diferir, F5.12).

OP4.5 Si el pedido se marca Pagado por fuera de la orden (desde F5.12 en la web), la orden activa asociada se cierra como Pagada referenciando el mismo egreso de la caja (no se crea un segundo egreso). Hay una sola lógica de dominio "registrar pago", que usan F5.12, C9.3 y OP9.

OP4.6 Si el pedido se cancela, la orden asociada se cancela con motivo "pedido cancelado".

### Criterios de aceptación:

☐ Un pedido a un proveedor en cuenta corriente a 30 días enviado el 01/10 genera una orden con vencimiento 31/10.

☐ Un pedido "contra entrega" genera la orden el día de la entrega con vencimiento ese mismo día.

☐ Si marco el pedido #42 como pagado desde la web, la orden OP-0042 queda Pagada con el mismo movimiento de caja y en la caja hay un solo egreso.

☐ Si cancelo el pedido, la orden asociada queda Cancelada con motivo "pedido cancelado".

### OP5. Gastos recurrentes, servicios e impuestos (P0 simple / P1 recurrente)

Descripción: el bot también prepara órdenes para alquiler, luz, gas, servicios (internet, teléfono, alarma, limpieza) e impuestos (ARCA: monotributo, IVA, autónomos; ingresos brutos; tasas municipales), a partir de la agenda de vencimientos de la caja (PRD de Caja, C9, tabla cash_due_items).

### Requerimientos:

OP5.1 Cada vencimiento de la caja que entra en la ventana de anticipación (OP11) genera una orden en Borrador o Lista para pagar, con concepto, categoría (Alquiler, Luz, Gas, Servicios, Impuestos > ARCA, etc.), monto estimado y medio habitual del vencimiento.

OP5.2 Beneficiarios que no son proveedores (OP6): propietario del local (datos de transferencia), empresa de luz o gas (número de cliente o código de pago electrónico y página oficial de pago), ARCA (CUIT del contribuyente y página oficial).

OP5.3 Luz y gas: si el comerciante manda la foto de la boleta (P1, mismo pipeline de foto + Google Photos + OCR de facturas), se toman importe, vencimiento(s) y código de pago electrónico o número de cliente. Para pagar, el bot manda el link a la página oficial de pago de la empresa registrada en la allowlist, o los datos para pagar desde la app del banco o de Mercado Pago en la sección de pago de servicios [a verificar canales vigentes por empresa].

OP5.4 Impuestos ARCA (monotributo / VEP): el bot recuerda el vencimiento, informa el período y el monto estimado (cargado por el Dueño o el del período anterior) y manda el link a la página oficial de ARCA. El VEP lo genera el propio comerciante con su clave fiscal; el bot no accede a ARCA ni genera el VEP. El comerciante paga el VEP desde su home banking o los medios que habilite ARCA [a verificar: fecha de vencimiento mensual del monotributo, montos por categoría vigentes, medios de pago habilitados para VEP y si Mercado Pago figura entre ellos, URL oficial vigente de ARCA]. Si el comerciante tiene débito automático del monotributo, la orden se crea como recordatorio de control ("verificá que se debitó") y se marca Pagada a mano igual.

OP5.5 Alquiler: datos de transferencia del propietario (CBU/CVU/alias, titular, CUIT) cargados como beneficiario; el Dueño actualiza el monto cuando corresponde el ajuste del contrato.

OP5.6 Al marcar la orden Pagada, el vencimiento de la caja queda "pagado" y vinculado al egreso (mismo comportamiento que C9.3).

OP5.7 (P1) Recurrencia automática: con C9.5 (vencimientos recurrentes), el sistema crea el vencimiento del período siguiente y su orden; el monto se precarga con el último pagado.

### Criterios de aceptación:

☐ Con el vencimiento "Alquiler octubre, $450.000, vence 10/10" cargado en la caja, el 07/10 recibo la orden preparada con los datos de transferencia del propietario.

☐ La orden del monotributo me trae el link oficial de ARCA y el texto "El VEP lo generás vos con tu clave fiscal; yo no tengo acceso a ARCA".

☐ Al marcar Pagada la orden de la luz, el vencimiento de la caja queda "Pagado" y en la caja aparece el egreso en la categoría Luz con el medio que elegí.

☐ (P1) Mando la foto de la boleta de gas y el bot me prepara la orden con importe, vencimiento y código de pago electrónico, para que confirme los valores con un toque.

### OP6. Datos de cobro de beneficiarios (P0)

Descripción: los datos para pagar se guardan una vez, verificados por el Dueño, y son la única fuente que usa el bot para armar la instrucción de pago.

### Requerimientos:

OP6.1 Proveedores (extensión de F6.1): CBU o CVU (22 dígitos, con validación de dígitos verificadores [a verificar algoritmo vigente para CBU y CVU]), alias (formato y longitud válidos [a verificar reglas vigentes]), titular, CUIT del titular, banco o billetera (derivado del CBU/CVU cuando sea posible), link de pago del proveedor si lo provee (por ejemplo, un link de Mercado Pago) y medio preferido.

OP6.2 Otros beneficiarios (nueva entidad payees): propietario del local, empresas de servicios, ARCA, organismos provinciales o municipales y otros. Para empresas de servicios y organismos: número de cliente o cuenta, CUIT del comercio cuando aplique y página oficial de pago elegida de la allowlist (no se acepta una URL libre).

OP6.3 Alta y cambio de datos de cobro solo desde la web y solo por el Dueño, con reautenticación (repetir login o magic link) y registro en la auditoría (valor anterior y nuevo). Desde el bot se pueden consultar (enmascarados) pero no cambiar.

OP6.4 Al cambiar el CBU/CVU/alias o el link de un beneficiario, el bot avisa al Dueño por WhatsApp ("Se cambiaron los datos de cobro de Distribuidora X desde la web. Si no fuiste vos, avisanos") y las órdenes Enviadas de ese beneficiario vuelven a Lista para pagar para revisión.

OP6.5 Los datos de cobro se muestran enmascarados en listados (ej.: CBU …8901) y completos solo en la orden Enviada al comerciante y en la ficha, para el Dueño.

OP6.6 (P2, a verificar) Verificación asistida de titularidad: el bot le recuerda al comerciante que su app bancaria muestra el titular antes de confirmar la transferencia y que lo compare con el de la orden; no se consulta ninguna API de titularidad sin evaluación legal y técnica.

### Criterios de aceptación:

☐ Cargo en la web el alias "distri.x.pagos", el titular "Distribuidora X SRL" y su CUIT, y la próxima orden de ese proveedor los usa.

☐ Un CBU con dígito verificador inválido no se puede guardar.

☐ Desde el bot no hay forma de cambiar un CBU; si lo intento ("cambiá el CBU de Distribuidora X por ..."), el bot me manda el link a la ficha en la web.

☐ Al cambiar un CBU desde la web me pide reautenticarme, recibo el aviso por WhatsApp y el cambio queda en la auditoría con el valor anterior.

☐ Para la empresa de luz solo puedo elegir la página de pago de una lista de sitios oficiales; no puedo pegar una URL cualquiera.

### OP7. Revisión y confirmación con un toque (P0)

Descripción: el bot presenta la orden preparada; el Dueño la revisa y confirma con un toque, o la edita antes.

### Requerimientos:

OP7.1 Mensaje de revisión con: beneficiario, concepto, referencia (factura / pedido / período), monto, vencimiento ("vence hoy", "vence en 3 días" o "vencida"), medio sugerido, titular y datos de cobro enmascarados, y alertas (datos de cobro distintos, posible duplicado, OCR con baja confianza).

OP7.2 Botones de respuesta: [Confirmar] [Editar] [Cancelar] (hasta 3 botones con títulos de hasta 20 caracteres, según los límites de mensajes interactivos del PRD del bot [fuente: Meta]).

OP7.3 Editar desde el bot (MVP): monto, medio de pago (lista con los cinco medios de la caja: Efectivo, Débito, Mercado Pago, Transferencia bancaria y QR (QR de Mercado Pago o QR del postnet)) y fecha de vencimiento, un campo por mensaje ("¿Cuál es el monto? Escribí solo el número, ej.: 182500"), con la interpretación de montos del PRD del bot ("182 mil 500" → 182.500). Beneficiario y datos de cobro se editan solo en la web (link directo a la orden).

OP7.4 Después de editar, el bot muestra el resumen final y vuelve a pedir confirmación.

OP7.5 Lote: si hay varias órdenes listas (por ejemplo, el lunes), el bot manda una lista interactiva "Tenés 4 pagos para revisar" y cada fila abre su resumen; la confirmación es una por una (no hay "confirmar todo" en el MVP, para evitar errores).

OP7.6 Los botones llevan en su payload el id y la versión de la orden; un toque sobre un mensaje viejo (versión anterior) no confirma: el bot responde "Esta orden cambió, te mando la versión actualizada".

OP7.7 Fuera de la ventana de atención de 24 h, la orden se presenta con una plantilla de utilidad aprobada (orden_pago_para_revisar) con los mismos botones [a verificar categoría y aprobación de la plantilla].

### Criterios de aceptación:

☐ Recibo "Pago a Distribuidora X — Factura A 0003-00012345 — $182.500 — vence el 31/10 — Transferencia" con [Confirmar] [Editar] [Cancelar], y con un toque en Confirmar recibo los datos de pago.

☐ Toco Editar, cambio el monto a $180.000 y el resumen final muestra $180.000 antes de confirmar.

☐ Toco Editar → Medio y el bot me ofrece exactamente cinco opciones: Efectivo, Débito, Mercado Pago, Transferencia bancaria y QR; elijo QR y el resumen final muestra "QR".

☐ Si toco dos veces Confirmar, la orden se confirma una sola vez y recibo los datos una sola vez.

☐ Si toco Confirmar en un mensaje de una versión anterior, no se confirma y recibo la versión actualizada.

☐ Un empleado sin permiso que intenta confirmar recibe "No tenés permiso para pagos" y el backend rechaza la acción.

### OP8. Entrega del link o de los datos de pago (P0)

Descripción: al confirmar, el bot le manda al comerciante lo necesario para pagar en su propia app, usando solo fuentes oficiales.

### Requerimientos:

OP8.1 Tipos de instrucción:

Link de pago del beneficiario: por ejemplo, el link de Mercado Pago que generó el proveedor, cargado en su ficha. Solo se envía si su dominio está en la allowlist (sección 7.3).

Página oficial de pago: de la empresa de servicios, de ARCA o del organismo, elegida de la allowlist.

Datos de transferencia: CBU/CVU y/o alias, titular, CUIT, banco o billetera, monto exacto y referencia sugerida (ej.: "Fact 0003-00012345").

Código de pago: número de cliente o código de pago electrónico para pagar desde la sección de pago de servicios de la app del banco o de Mercado Pago [a verificar].

Efectivo contra entrega: recordatorio con monto y referencia para el preventista.

OP8.2 Formato pensado para copiar: el alias, el CBU/CVU y el monto van cada uno en su propia línea, sin otro texto, para copiarlos con un toque largo.

OP8.3 Cada mensaje con instrucciones de pago incluye el pie: "Pagás vos desde tu app. Nunca te voy a pedir claves ni códigos."

OP8.4 Los links se muestran con su dominio visible y completo, sin acortadores, salvo los dominios cortos oficiales del propio emisor que estén en la allowlist (por ejemplo, los links cortos de Mercado Pago [a verificar dominio vigente]).

OP8.5 Si un link de la ficha o leído de una factura (QR o texto) no está en la allowlist, no se envía como link: el bot ofrece los datos de transferencia de la ficha y avisa "Ese link no es de un sitio oficial que yo conozca; por seguridad no te lo paso".

OP8.6 El bot nunca manda links a páginas propias de la plataforma que pidan datos bancarios ni formularios para "completar el pago".

OP8.7 Al entregar, la orden pasa a Enviada al comerciante con fecha, hora, usuario, tipo de instrucción, dominio del link (si hubo) y wamid del mensaje.

OP8.8 Junto con los datos, botones [Ya pagué] [Más tarde] [Cancelar].

OP8.9 (P1, a verificar) Botón de URL en mensaje interactivo (CTA) para abrir el link oficial en lugar de un link en el texto [a verificar disponibilidad y límites en Cloud API].

### Criterios de aceptación:

☐ Confirmo la orden de Distribuidora X y recibo alias, CBU, titular, CUIT, monto y referencia, cada dato en su línea, y los copio desde WhatsApp sin editarlos.

☐ Confirmo la orden de un proveedor con link de Mercado Pago cargado y recibo ese link con el dominio de Mercado Pago visible.

☐ Una orden de la luz trae el link a la página oficial de pago de la empresa (de la allowlist) y el número de cliente.

☐ Si el QR de una factura apunta a un dominio fuera de la allowlist, el bot no me manda ese link y me ofrece los datos de transferencia de la ficha.

☐ Todos los mensajes con instrucciones de pago tienen el pie "Nunca te voy a pedir claves ni códigos".

☐ La orden queda "Enviada al comerciante" con hora y tipo de instrucción en la auditoría.

### OP9. Marcar como pagada y registro en la caja (P0 manual / P1 comprobante)

Descripción: cuando el comerciante pagó, lo indica y el sistema actualiza todo en una sola transacción: orden, pedido de reposición, factura del proveedor, vencimiento y caja.

### Requerimientos:

OP9.1 "Ya pagué" (P0): botón en el mensaje de la orden, texto libre ("ya le pagué a Distribuidora X") o botón en la web. El bot pide confirmar: monto pagado (precargado, editable), medio (precargado con el sugerido, editable entre los cinco medios de la caja: Efectivo, Débito, Mercado Pago, Transferencia bancaria y QR (QR de Mercado Pago o QR del postnet)), fecha (por defecto hoy) y nota (opcional, salvo en la categoría "Sin factura", donde es obligatoria; ver OP9.9). Luego [Confirmar pago].

OP9.2 Al confirmar el pago, en una misma transacción de la base del comercio:

La orden pasa a Pagada (fecha, monto, medio y usuario).

Con factura(s) del proveedor: se registra un pago a proveedor (supplier_payments, con los tipos existentes del PRD de Facturas: pago_manual, o cierre_cc para la orden de cierre de cuenta corriente; no se crea un tipo nuevo) con su asignación a cada factura (supplier_payment_allocations) y, desde ese pago, el egreso en la caja (regla "un solo egreso por pago" del PRD de Facturas, 6.3): categoría "Pago a proveedores > Mercadería", origen "factura_proveedor", ref_tipo = supplier_payment. Cada factura pasa a pagada (estado derivado de su saldo) y el egreso queda vinculado a la factura y a su foto en Google Photos.

Sin factura: se registra el egreso en la caja (cash_movements) con la categoría "Sin factura" y la nota obligatoria que aclara qué fue el gasto (ej.: "Pedido #63 Bebidas del Sur, pagado al preventista, sin factura") para pedidos y gastos manuales sin factura; las órdenes que salen de un vencimiento de la caja (OP5) mantienen su categoría (Alquiler, Luz, Gas, Servicios o Impuestos > ARCA). Se guardan medio elegido (uno de los cinco de la caja), monto, beneficiario/proveedor, origen existente de la caja (pedido_reposicion para pedidos, manual para gastos; no se crea un origen nuevo) y referencia a la orden (y al pedido, como en C8.3).

Si hay pedido de reposición vinculado (directo o a través de la factura), pasa de "Pendiente de pago" o "Facturado (pendiente de pago)" a Pagado, con el movimiento de caja vinculado (F5.12, F5.13; FP6.5).

Si hay vencimiento de la caja vinculado, queda "pagado" con movimiento_pago_id.

Se inserta el evento en el outbox (notification_events, tipo pago_proveedor o equivalente) para el aviso opcional de C10.4.

OP9.3 Si alguna parte falla, no se aplica ninguna: no puede quedar una orden Pagada sin egreso, un pedido Pagado sin egreso ni un egreso sin orden. Si el módulo Caja Digital no está activo, la orden y el pedido quedan Pagados sin egreso (mismo criterio que F5.13).

OP9.4 Reversión: si el egreso se revierte en la caja (C7), en la misma transacción la orden vuelve a Enviada al comerciante (o Vencida si ya pasó la fecha), las facturas vuelven a pendiente de pago, el pedido vuelve a "Facturado (pendiente de pago)" o a "Pendiente de pago" (F5.14, C8.5, FP6.6) y el vencimiento vuelve a pendiente.

OP9.5 No se puede marcar Pagada una orden Cancelada ni marcar dos veces la misma orden.

OP9.6 (P1) Comprobante de transferencia por foto: el comerciante manda la captura o foto del comprobante; se guarda en el Google Photos del comercio (mismo mecanismo que C3.7) y el OCR extrae monto, fecha y hora, destino (CBU/CVU/alias o titular) y número de operación. El bot sugiere la orden que coincide (beneficiario y monto) y el comerciante confirma con un toque. El comprobante queda asociado al egreso (comprobante_photos_media_item_id) y a la orden.

OP9.7 (P1) Validaciones del comprobante: si el monto difiere, se precarga el del comprobante y se marca la diferencia; si el destino del comprobante no coincide con los datos de cobro de la orden, se muestra la alerta "El destino del comprobante no coincide con el beneficiario" y se exige confirmación explícita; si el número de operación ya se usó en otra orden, se rechaza como duplicado.

OP9.8 Ningún valor del OCR marca una orden como Pagada sin confirmación del usuario.

OP9.9 Gasto sin factura (decisión): cuando el egreso va a la categoría "Sin factura", el campo nota (texto libre) es obligatorio: el bot lo pide antes de [Confirmar pago] ("¿Qué fue este gasto? Contámelo en una línea") y la web no deja guardar sin nota. La nota queda en el egreso de la caja y en la orden. También se puede registrar un gasto sin factura sin orden previa, directamente desde la caja o desde el bot ("pagué $15.000 de flete, sin factura"), con la misma categoría y la misma nota obligatoria.

OP9.10 Medio de pago: el medio con que se marca Pagada es siempre uno de los cinco medios existentes de la caja (Efectivo, Débito, Mercado Pago, Transferencia bancaria y QR (QR de Mercado Pago o QR del postnet)); el backend rechaza cualquier otro valor. No hay un medio ni un tipo de pago propio de las órdenes.

### Criterios de aceptación:

☐ Toco "Ya pagué" en la orden OP-0042 de $182.500 por transferencia, confirmo, y: la orden queda Pagada, el pedido #42 queda Pagado, la factura A 0003-00012345 queda pagada y en la caja aparece un único egreso "Pago a proveedores > Mercadería — Distribuidora X — Factura A 0003-00012345, $182.500, Transferencia bancaria" con mi usuario.

☐ Desde el egreso de la caja abro la orden, el pedido y la factura; desde la factura veo el pago.

☐ Si falla el alta del egreso, ni la orden ni el pedido quedan Pagados.

☐ Si reintento "Ya pagué" (doble toque o reintento del webhook), hay un solo egreso.

☐ Revierto el egreso en la caja y la orden vuelve a "Enviada al comerciante", la factura a pendiente de pago y el pedido a "Facturado (pendiente de pago)".

☐ Con 3 facturas impagas de Golosinas Sur ($40.000, $35.500 y $28.000), el viernes de cierre recibo una orden por $103.500; al pagarla, la caja muestra un único egreso vinculado a las 3 facturas, que pasan a "Pagada".

☐ Al pagar la orden del alquiler, el egreso va a la categoría Alquiler y el vencimiento de la caja queda "Pagado".

☐ (P1) Mando la captura del comprobante de Mercado Pago por $182.500 a "Distribuidora X SRL"; el bot me propone OP-0042, confirmo con un toque y el egreso queda con el comprobante en Google Photos.

☐ (P1) Un comprobante con un número de operación ya usado se rechaza como duplicado.

☐ Toco "Ya pagué" en la orden del pedido #63 de Bebidas del Sur (sin factura); el bot me pide la nota, escribo "Pedido #63, pagado al preventista, sin factura" y en la caja aparece el egreso en la categoría "Sin factura" con esa nota, el medio elegido y el vínculo a la orden y al pedido.

☐ Si intento confirmar un egreso "Sin factura" con la nota vacía (en el bot o en la web), no se registra y se me pide la nota.

☐ Al tocar "Cambiar medio" veo los cinco medios de la caja (Efectivo, Débito, Mercado Pago, Transferencia bancaria y QR) y ninguno más; si pago con el QR del postnet del proveedor y elijo QR, el egreso queda con el medio "QR".

☐ Al pagar una orden con factura, el pago a proveedor queda con un tipo existente (pago_manual o cierre_cc); no existe el tipo orden_pago.

### OP10. Detección de notificaciones bancarias / Mercado Pago (P2, a verificar)

Descripción: fase posterior, condicionada a verificación técnica y legal. La idea es que el sistema sugiera el "Ya pagué" cuando detecta un aviso de pago que coincide con una orden Enviada, sin acceder a las cuentas del comerciante.

### Requerimientos (propuestos, todos [a verificar]):

OP10.1 Opción A (preferida): el comerciante configura en su correo el reenvío de los emails de aviso de transferencia o de pago de su banco o de Mercado Pago a una dirección de reenvío exclusiva de su comercio en la plataforma. El sistema lee solo esos emails, extrae monto, fecha, destinatario y número de operación, y sugiere el match [a verificar: formato y estabilidad de los emails de cada banco y de Mercado Pago, y verificación del remitente con SPF/DKIM].

OP10.2 Opción B (a evaluar): APIs oficiales de solo lectura que el comerciante autorice expresamente, si existen. Solo se considera si es de solo lectura, no implica guardar contraseñas, se puede revocar en cualquier momento y su alcance no permite iniciar pagos. Requiere una decisión explícita en este PRD sobre su compatibilidad con OP1 antes de construir [a verificar disponibilidad, alcance y requisitos legales].

OP10.3 Descartado: cualquier mecanismo que requiera usuario y contraseña, scraping del home banking o de la app de Mercado Pago, o leer las notificaciones del celular del comerciante.

OP10.4 La detección solo sugiere: "Vi un pago de $182.500 a Distribuidora X SRL el 30/10 a las 10:14. ¿Es la orden OP-0042?" [Sí, marcar pagada] [No]. Nunca marca Pagada sin confirmación.

### Criterios de aceptación (para cuando se apruebe la fase):

☐ Un email reenviado de aviso de transferencia que coincide en monto y destinatario con una orden Enviada genera una sugerencia de match en menos de 5 minutos.

☐ Ninguna orden queda Pagada por una notificación sin mi confirmación.

☐ Un email que no pasa la verificación de remitente se descarta y queda registrado en el log.

### OP11. Recordatorios de vencimiento (P0)

Descripción: el bot avisa antes de que venzan los pagos, con la orden lista para confirmar.

### Requerimientos:

OP11.1 Anticipación configurable por tipo (por defecto: proveedores 2 días; alquiler, servicios e impuestos 3 días) y aviso el día del vencimiento, alineado con C9.4 y C10.2 del PRD de Caja. Un solo aviso por vencimiento: si el vencimiento tiene orden, el aviso de la caja se reemplaza por el de la orden, para no duplicar mensajes.

OP11.2 Los avisos respetan opt-in, opt-out y horario de silencio del PRD del bot (B2).

OP11.3 Contenido: "Mañana vence: Alquiler octubre $450.000" con [Revisar y pagar] [Ya lo pagué] [Recordame mañana].

OP11.4 Pagos de la semana (P0 simple): el lunes a la mañana (configurable), lista de órdenes que vencen en la semana con el total; puede ir dentro del aviso matutino del bot.

OP11.5 Al pasar a Vencida, aviso único: "Venció ayer: Luz $48.000. Si ya la pagaste, tocá Ya pagué".

OP11.6 No se mandan avisos de órdenes Pagadas o Canceladas; "Recordame mañana" pospone como máximo hasta el día del vencimiento.

OP11.7 Plantillas de utilidad a aprobar: orden_pago_para_revisar, recordatorio_vencimiento_pago, orden_pago_vencida, pagos_de_la_semana [a verificar aprobación y categoría].

### Criterios de aceptación:

☐ Con el alquiler venciendo el 10/10, recibo el aviso el 07/10 y el 10/10, y no recibo ninguno más si lo marqué Pagado el 08/10.

☐ No recibo dos avisos por el mismo vencimiento (uno de la caja y otro de la orden).

☐ Si estoy en horario de silencio, el aviso llega al terminar el silencio.

### OP12. Vista web, filtros y reportes (P0 simple)

### Requerimientos:

OP12.1 Pantalla "Pagos" en la web Astro: lista de órdenes con filtros por estado, tipo, beneficiario, vencimiento (esta semana, vencidas) y origen.

OP12.2 Detalle de la orden: datos, línea de tiempo de estados (quién, cuándo, desde dónde) y links al pedido, a la factura (imagen en Google Photos), al vencimiento y al egreso de la caja.

OP12.3 Totales: a pagar esta semana, vencido y pagado en el mes por categoría (coincide con la caja).

OP12.4 En la ficha del proveedor (F6.3), deuda pendiente = pedidos Pendientes de pago + órdenes activas sin pedido, sin contar dos veces lo mismo.

OP12.5 (P1) Exportación CSV; calendario de pagos.

### Criterios de aceptación:

☐ Filtro "Vencidas" y veo las órdenes vencidas con los días de atraso.

☐ El total "Pagado en octubre — Pago a proveedores" (incluida la subcategoría Mercadería) coincide al centavo con el de la caja.

☐ La deuda con Distribuidora X no cuenta dos veces un pedido que tiene orden.

☐ En el detalle de una orden pagada "Sin factura" veo la nota del gasto, y el total del mes de la categoría "Sin factura" coincide con el de la caja.

### OP13. Auditoría (P0)

### Requerimientos:

OP13.1 Toda transición de estado, edición de campos (valor anterior y nuevo), entrega de instrucciones de pago (tipo, dominio, wamid), cambio de datos de cobro y confirmación de pago queda en audit_log con usuario, fecha, hora y origen (web / bot / sistema).

OP13.2 El bot_message_log (PRD del bot, B11.3) registra los mensajes de órdenes con los datos de cobro enmascarados y sin credenciales (redacción, OP1.3).

OP13.3 El historial de cada orden se ve en la web (OP12.2).

### Criterios de aceptación:

☐ En la orden OP-0042 veo: "Creada por el bot desde factura (Juan, empleado) 28/10 18:02 → Lista para pagar → Confirmada por Mauricio vía WhatsApp 30/10 10:05 → Enviada (datos de transferencia) → Pagada por Mauricio 30/10 10:16".

☐ No existe forma de cambiar el estado o el monto de una orden sin que quede rastro.

## 5. Flujos de usuario

Convención: Bot = mensajes del bot de WhatsApp; Dueño = Mauricio, Dueño de Kiosco La Esquina; [Botón] = botón de respuesta. Nombres de empresas, CBU, CUIT y montos son ficticios.

### Flujo 1: factura del proveedor → orden → pago por transferencia

Juan (empleado) recibe la mercadería de Distribuidora X (en este ejemplo, configurada en "Cuenta corriente" a 30 días), le saca una foto a la factura y se la manda al bot. Según el PRD de Facturas, la foto queda en el Google Photos del comercio y el OCR sugiere: Distribuidora X SRL, Factura A 0003-00012345, $182.500, vence 31/10. Juan confirma los valores con un toque. El bot crea la orden OP-0042 vinculada al pedido #42.

El 29/10 (2 días antes del vencimiento), el bot le escribe al Dueño:

Bot: Pago para revisar 🧾

Distribuidora X SRL

Factura A 0003-00012345 · Pedido #42

Monto: $182.500

Vence: 31/10 (en 2 días)

Medio sugerido: Transferencia bancaria

Cuenta: alias distri.x.pagos · CBU …8901

[Confirmar] [Editar] [Cancelar]

Dueño: [Confirmar]

Bot: Listo. Pagás vos desde tu app del banco o de Mercado Pago:

Alias:

distri.x.pagos

CBU:

0000000000000000008901

Titular: Distribuidora X SRL · CUIT 30-00000000-0

Monto:

182500

Referencia: Fact 0003-00012345

Antes de confirmar en tu app, fijate que el titular sea Distribuidora X SRL.

Pagás vos desde tu app. Nunca te voy a pedir claves ni códigos.

[Ya pagué] [Más tarde] [Cancelar]



El Dueño paga desde su home banking y vuelve al chat:

Dueño: [Ya pagué]

Bot: ¿Confirmo el pago?

$182.500 · Transferencia bancaria · hoy 30/10

[Confirmar pago] [Cambiar monto] [Cambiar medio]

Dueño: [Confirmar pago]

Bot: ✅ Pagado. OP-0042 y el pedido #42 quedaron Pagados.

En la caja: Pago a proveedores > Mercadería — Distribuidora X — $182.500 (Transferencia bancaria).

La factura 0003-00012345 quedó pagada.



Variante: si en el paso 3 el Dueño pagó con otro medio, toca [Cambiar medio] y elige entre los cinco medios existentes de la caja (no hay un medio propio de las órdenes):

Dueño: [Cambiar medio]

Bot (lista): ¿Con qué pagaste?

- Efectivo

- Débito

- Mercado Pago

- Transferencia bancaria

- QR (Mercado Pago o postnet)

Dueño: (elige "QR (Mercado Pago o postnet)")

Bot: ¿Confirmo el pago?

$182.500 · QR · hoy 30/10

[Confirmar pago] [Cambiar monto] [Cambiar medio]

### Flujo 2: pedido contra entrega con link de Mercado Pago del proveedor (con edición previa)

Bot: Llegó el pedido #57 de Bebidas del Sur. Pago contra entrega:

Monto estimado: $96.300 · Medio sugerido: Mercado Pago

[Confirmar] [Editar] [Cancelar]

Dueño: [Editar]

Bot: ¿Qué querés cambiar? [Monto] [Medio] [Vencimiento]

Dueño: [Monto]

Bot: Escribí el monto, ej.: 96300

Dueño: 94 mil 800

Bot: Queda así: Bebidas del Sur · Pedido #57 · $94.800 · Mercado Pago · vence hoy

[Confirmar] [Editar] [Cancelar]

Dueño: [Confirmar]

Bot: Este es el link de pago de Bebidas del Sur (Mercado Pago, sitio oficial):

https://(dominio oficial de Mercado Pago)/… (link cargado en la ficha del proveedor)

Monto a pagar: $94.800 · Referencia: Pedido #57

Pagás vos desde tu app. Nunca te voy a pedir claves ni códigos.

[Ya pagué] [Más tarde] [Cancelar]



El Dueño paga en la app de Mercado Pago, toca [Ya pagué], confirma el medio "Mercado Pago" y el pedido #57 queda Pagado con el egreso en la caja.

### Flujo 3: luz con página oficial y número de cliente

Bot: En 3 días vence la luz ⚡

Empresa de luz (ejemplo) · Período sep-oct · Cliente N.º 1234567

Monto: $48.000 · Vence: 15/10 · Medio habitual: Mercado Pago

[Revisar y pagar] [Ya la pagué] [Recordame mañana]

Dueño: [Revisar y pagar]

Bot: Luz · $48.000 · vence 15/10 · Mercado Pago

[Confirmar] [Editar] [Cancelar]

Dueño: [Confirmar]

Bot: Podés pagarla así:

1) Desde la app de Mercado Pago o de tu banco, en "Pagar servicios", buscando la empresa con tu N.º de cliente:

1234567

2) O desde la página oficial de pago de la empresa:

https://(sitio oficial de la empresa, de la lista de sitios verificados)

Monto: $48.000

Pagás vos desde tu app. Nunca te voy a pedir claves ni códigos.

[Ya pagué] [Más tarde] [Cancelar]

### Flujo 4: monotributo (ARCA): el VEP lo genera el comerciante

Bot: Recordatorio: el 20/10 vence el Monotributo de octubre (Impuestos > ARCA) [a verificar fecha].

Monto estimado: $XX.XXX (el del mes pasado; revisalo en ARCA)

[Revisar y pagar] [Ya lo pagué] [Recordame mañana]

Dueño: [Revisar y pagar]

Bot: Para pagarlo:

1) Entrá a la página oficial de ARCA con tu clave fiscal:

https://www.arca.gob.ar/ [a verificar URL vigente]

2) Generá el VEP del período 10/2026.

3) Pagalo desde tu home banking o el medio que te habilite ARCA.

El VEP lo generás vos: yo no tengo acceso a ARCA ni a tu clave fiscal, y nunca te la voy a pedir.

[Ya pagué] [Más tarde] [Cancelar]

Dueño: [Ya pagué]

Bot: ¿Confirmo el pago? $XX.XXX · Transferencia bancaria · hoy

[Confirmar pago] [Cambiar monto] [Cambiar medio]

Dueño: [Confirmar pago]

Bot: ✅ Monotributo de octubre pagado. En la caja: Impuestos > ARCA. El vencimiento quedó Pagado.

### Flujo 5: lunes de pagos (lote)

Bot: Buen día 👋 Esta semana tenés 4 pagos por $781.500. [Ver pagos]

Dueño: [Ver pagos]

Bot (lista): Elegí uno para revisar

- Alquiler octubre — $450.000 — vence lun 12/10

- Distribuidora X — $182.500 — vence mié 14/10

- Internet — $32.000 — vence jue 15/10

- Bebidas del Sur — $117.000 — vence vie 16/10

Dueño: (elige "Alquiler octubre")

Bot: Alquiler octubre · Juan Pérez (propietario) · $450.000 · vence hoy · Transferencia bancaria

[Confirmar] [Editar] [Cancelar]



El Dueño confirma cada orden por separado (no hay "confirmar todo" en el MVP).

### Flujo 6 (P1): comprobante de transferencia por foto

Dueño: (manda la captura del comprobante de Mercado Pago)

Bot: Leí el comprobante 👀

Monto: $182.500 · 30/10 10:14 · Destino: Distribuidora X SRL · Operación 1234567890

¿Es el pago de OP-0042 (Distribuidora X, Factura 0003-00012345)?

[Sí, marcar pagada] [Es otra] [No es un pago]

Dueño: [Sí, marcar pagada]

Bot: ✅ Pagado. Guardé el comprobante en tu Google Photos y lo vinculé al egreso de la caja.

### Flujo 7: datos de cobro distintos en la factura (alerta anti-fraude)

Bot: ⚠ Ojo con esta factura de Distribuidora X:

el CBU impreso (…9876) es distinto del que tenés cargado (…8901).

Por seguridad, la orden usa el CBU que tenés cargado.

Si el proveedor te avisó que cambió de cuenta, confirmalo llamándolo a un número que ya conozcas y actualizalo desde la web:

https://(web del producto)/proveedores/distribuidora-x

[Entendido] [Cancelar orden]

### Flujo 8: el comerciante comparte una clave por error

Dueño: te paso la clave de mp así pagás vos: ********

Bot: No necesito tus claves y nunca te las voy a pedir: los pagos los hacés vos desde tu app.

No guardé ese mensaje. Si la compartiste con alguien, te recomiendo cambiarla.

¿Querés que te mande los datos para pagar la orden de Distribuidora X? [Sí] [No]

### Flujo 9: orden vencida

Bot: Venció ayer: Gas — $27.400 (empresa de gas, ejemplo).

Si ya lo pagaste, tocá Ya pagué. Si no, te paso los datos.

[Ya pagué] [Pasame los datos] [Cancelar]

### Flujo 10: pedido pagado sin factura (categoría "Sin factura" con nota obligatoria)

El preventista de Bebidas del Sur entrega el pedido #63 y no deja factura. El Dueño ya pagó con el QR del postnet del preventista:

Dueño: [Ya pagué]

Bot: ¿Confirmo el pago?

$38.200 · Mercado Pago · hoy

[Confirmar pago] [Cambiar monto] [Cambiar medio]

Dueño: [Cambiar medio]

Bot (lista): ¿Con qué pagaste?

- Efectivo

- Débito

- Mercado Pago

- Transferencia bancaria

- QR (Mercado Pago o postnet)

Dueño: (elige "QR (Mercado Pago o postnet)")

Bot: Este pago no tiene factura, así que va a la caja como "Sin factura".

¿Qué fue este gasto? Contámelo en una línea (es obligatorio).

Dueño: Pedido #63 bebidas, pagado al preventista, no dejó factura

Bot: ¿Confirmo el pago?

$38.200 · QR · hoy · Sin factura

Nota: Pedido #63 bebidas, pagado al preventista, no dejó factura

[Confirmar pago] [Cambiar monto] [Cambiar medio]

Dueño: [Confirmar pago]

Bot: ✅ Pagado. El pedido #63 quedó Pagado.

En la caja: Sin factura — Bebidas del Sur — $38.200 (QR), con tu nota.



Si el Dueño responde la nota vacía o con un emoji, el bot la vuelve a pedir y no registra el egreso hasta tenerla. Un gasto suelto sin orden ("pagué $15.000 de flete, sin factura") sigue el mismo camino: categoría "Sin factura", medio entre los cinco de la caja y nota obligatoria.

## 6. Notas técnicas

### 6.1 Principios

Mismo backend, misma lógica que la web y el bot (PRD principal, 6.3; PRD del bot, 6.1): Astro + TypeScript, servicio Hono, Zod, Drizzle, PostgreSQL gestionado, cola de jobs (pg-boss / Inngest / cron).

Una base de datos por cliente, como ModoOps, más una base de control. Las tablas de órdenes, beneficiarios y datos de cobro viven en la base de cada comercio (sin tenant_id). En la base de control solo viven la allowlist global de dominios oficiales y métricas agregadas sin contenido. Migraciones con el mismo runner (base de control + todas las bases de clientes, despliegue escalonado).

El bot resuelve la base del comercio desde el número de WhatsApp vía la base de control (PRD del bot, 6.3) y actúa con un token interno de corta duración en nombre del usuario; nunca accede directo a la base.

Una sola lógica de dominio "registrar pago", compartida por F5.12 (pedido), C9.3 (vencimiento) y OP9 (orden), para que no existan dos caminos que generen egresos distintos.

### 6.2 Modelo de datos

### 6.3 Reglas de integridad

Dinero en centavos enteros (bigint), igual que la caja (PRD de Caja, 6.3). Nunca float.

Máquina de estados en el dominio: función única transition(orden, evento, actor) que valida estado actual, rol y versión; cada transición inserta en payment_order_events y en audit_log en la misma transacción.

Una orden activa por respaldo: índices únicos parciales sobre purchase_order_id y cash_due_item_id en payment_orders, y sobre supplier_invoice_id en payment_order_invoices, donde el estado de la orden no es cancelada ni pagada.

Un solo egreso por pago (PRD de Facturas, 6.3): si la orden tiene facturas, el egreso se crea siempre desde supplier_payments; si el pedido se marca Pagado por otro camino (F5.12, C8, FP6), se usa la misma función de pago y la orden activa se cierra con ese pago.

Un egreso por orden: índice único sobre cash_movement_id; restricción CHECK que impide estado = 'pagada' sin cash_movement_id cuando el módulo de caja está activo (mismo patrón que F5.13).

Transacción de pago: OP9.2 se ejecuta en una sola transacción con bloqueo de fila (SELECT … FOR UPDATE) sobre la orden y, si existen, las facturas y el pedido; orden de bloqueo fijo (orden → facturas → pedido → vencimiento) para evitar deadlocks. La suma asignada a cada factura no puede superar su saldo.

Reversión: el manejador de reversión de la caja (C7.7) busca la orden por cash_movement_id y la devuelve a Enviada al comerciante o Vencida en la misma transacción, junto con el pedido, la factura y el vencimiento.

Nota obligatoria en "Sin factura": validación en el dominio (Zod) y restricción CHECK en cash_movements que impide guardar un egreso de la categoría "Sin factura" con nota vacía.

Medios de pago cerrados: metodo_sugerido_id y paid_method_id son claves foráneas a cash_payment_methods; el módulo no inserta medios nuevos.

Snapshot de la instrucción: lo que se le mandó al comerciante (datos de cobro, link, monto) se guarda inmutable por versión en instruccion_snapshot, para auditar exactamente qué se entregó aunque después cambie la ficha.

### 6.4 Idempotencia

Webhooks de WhatsApp: deduplicación por wamid (PRD del bot, 6.2).

Botones: el payload lleva payment_order_id + version + acción; la acción se aplica solo si la versión coincide y el estado lo permite; si ya se aplicó, se responde con el resultado anterior, sin efecto nuevo.

Registro de pago: idempotency_key del egreso derivada de la orden (payment_order:<id>:pago:<n>, con n = número de pago, 1 en el MVP); los reintentos del bot, de la cola o de la PWA offline no duplican egresos.

Creación de órdenes por jobs: clave única por origen (factura:<id>, cierre:<proveedor>:<fecha>, pedido:<id>, vencimiento:<id>) para que un job reejecutado no cree dos órdenes.

Comprobantes (P1): unicidad de comprobante_operacion_nro + medio dentro del comercio; hash de la imagen para detectar el mismo comprobante enviado dos veces.

### 6.5 Auditoría

audit_log (PRD principal) registra entidad, campo, valor anterior y nuevo, usuario, origen y fecha para órdenes, beneficiarios y datos de cobro.

payment_order_events da la línea de tiempo legible de cada orden (OP12.2, OP13).

cash_audit_log (PRD de Caja) registra las reversiones de egresos que afectan órdenes.

bot_message_log (PRD del bot) registra mensajes con datos de cobro enmascarados y credenciales redactadas.

Retención alineada con el PRD del bot (por defecto 12 meses para el log del bot; la auditoría de órdenes y de la caja se conserva mientras exista la base del comercio).

### 6.6 Jobs

Generación de órdenes: job diario por comercio (en su zona horaria) que revisa pedidos Pendientes de pago, facturas confirmadas sin orden y vencimientos próximos, y crea las órdenes que falten (idempotente).

Vencidas: job diario que pasa a Vencida las órdenes con vence_el pasado y emite el aviso único.

Recordatorios: a la hora configurada, respetando preferencias y horario de silencio del PRD del bot; deduplicados con los avisos de vencimientos de la caja (OP11.1).

Todos los envíos pasan por el outbox (notification_events) del PRD de Caja.

### 6.7 OCR e imágenes

Pipeline compartido con el PRD de Facturas: foto por WhatsApp → subida al Google Photos del comercio (Google Photos Library API, OAuth con consentimiento del Dueño, refresh token cifrado en la base del comercio) → OCR → valores sugeridos → confirmación con un toque.

Se guarda el mediaItemId como referencia; las URLs de contenido son temporales y se renuevan al mostrarlas. [a verificar los límites vigentes de la Google Photos Library API: desde 2025 las apps solo pueden leer los medios que ellas mismas subieron; scopes, cuotas y verificación de la app], igual que en el PRD de Caja (6.4).

Validación determinística después del OCR: dígitos verificadores de CBU/CVU, formato de alias y CUIT, montos. Si se usa un LLM para estructurar la salida, recibe solo la imagen o el texto del documento, nunca datos de otros comercios, y su salida se valida con Zod; proveedor y costo [a verificar].

Las imágenes no se guardan en el almacenamiento del producto, salvo un caché temporal para el OCR que se borra al terminar.

### 6.8 WhatsApp

Mensajes interactivos y plantillas según el PRD del bot (6.4): hasta 3 botones de respuesta y listas de hasta 10 filas [fuente: Meta]; plantillas de utilidad nuevas listadas en OP11.7 [a verificar]; costo por plantilla de utilidad, incluso dentro de la ventana abierta desde el 1/10/2026, según el PRD del bot [a verificar tarifa para Argentina].

Los links se envían en texto con el dominio visible; botón CTA de URL en P1 [a verificar].

Los datos de cobro viajan por servidores de Meta: se informa en los términos y la política de privacidad; se envían completos solo al Dueño (o a un empleado con permiso para pagos) y solo en el mensaje de la orden Enviada al comerciante.

## 7. Seguridad

### 7.1 Principio duro: sin ejecución de pagos y sin credenciales

SEC-1: el sistema no ejecuta pagos ni mueve fondos (OP1.1).

SEC-2: el sistema no solicita, recibe, almacena ni procesa credenciales de Mercado Pago, bancos, ARCA ni empresas de servicios (OP1.2). Se verifica con: revisión del esquema en cada migración (lista de campos prohibidos), test automático que falla si aparece un campo o secreto del tipo contraseña, clave o token asociado a cuentas del comerciante, y revisión del catálogo de mensajes del bot.

SEC-3: redacción de posibles credenciales en los mensajes entrantes antes de persistirlos o enviarlos a OCR/LLM (OP1.3), con un detector de patrones ("clave", "contraseña", "token", "código", secuencias numéricas cortas después de esas palabras) probado con un corpus.

Cualquier propuesta futura que toque este principio (por ejemplo, OP10 opción B) requiere revisión de seguridad y una decisión explícita registrada en este PRD.

### 7.2 Integridad de los datos de cobro (anti-fraude)

Alta y cambio de datos de cobro solo desde la web, solo por el Dueño, con reautenticación y auditoría (OP6.3); aviso por WhatsApp ante cada cambio (OP6.4).

Los datos de cobro nunca se toman de una foto, de un mensaje ni de un link sin pasar por la ficha (OP3.5).

Alerta cuando una factura o un comprobante muestra un destino distinto del registrado (fraude por factura adulterada o por falso "cambio de cuenta" del proveedor).

Recordatorio en cada pago de verificar el titular en la app del banco antes de confirmar la transferencia.

Snapshot inmutable de lo entregado (6.3).

### 7.3 Links oficiales y anti-phishing

Allowlist de dominios oficiales (official_payment_domains, base de control), mantenida por el equipo de la plataforma con verificación manual y fecha. A incluir y verificar: dominios de Mercado Pago (incluido su dominio de links cortos), de ARCA, de las empresas de luz y gas de cada zona y de los organismos provinciales y municipales más comunes [a verificar cada dominio].

Validación de URL: https obligatorio, host exacto o subdominio de un dominio de la allowlist (comparación después de normalizar IDN/punycode, para detectar dominios parecidos), sin credenciales embebidas en la URL y sin redirecciones abiertas conocidas.

Un link que no pasa la validación no se envía como link (OP8.5) y queda registrado.

El bot nunca pide claves ni códigos, nunca manda links de "verificá tu cuenta", nunca manda formularios de pago propios y nunca presiona con amenazas ("si no pagás hoy te cortan"). Los mensajes tienen un tono fijo y reconocible y el pie "Nunca te voy a pedir claves ni códigos".

El bot usa el número de la plataforma con perfil de empresa verificado (PRD del bot, 6.4) [a verificar disponibilidad de la insignia de verificación]; en el onboarding se comunica cuál es el único número oficial y que el bot solo escribe a números vinculados.

Educación en el onboarding del módulo: "El bot te prepara los pagos; vos pagás desde tu app; nunca te pide claves; si te llega algo raro, avisanos".

### 7.4 Acceso, aislamiento y privacidad

Permisos por rol aplicados en el backend (Dueño / empleado con permiso para pagos), nunca solo ocultando botones (PRD del bot, B1.7).

Aislamiento por base de datos por cliente, resolución de la base solo del lado del servidor y tests de aislamiento en CI (PRD principal, 6.4).

Datos de cobro enmascarados en listados y logs; sin montos, CBU, alias ni contenido de mensajes en Sentry ni en los logs de aplicación.

Cifrado en reposo del gestor de base de datos; refresh token de Google Photos cifrado a nivel de aplicación.

Rate limiting por número y por comercio en las acciones de pago (confirmar, ya pagué).

Ley 25.326 de Protección de Datos Personales: CBU, CUIT y datos de terceros (proveedores, propietarios) se tratan como datos personales; exportación y borrado por comercio (exportar o eliminar su base).

Soporte de la plataforma solo con consentimiento y registro (impersonación auditada).

### 7.5 Cumplimiento (a verificar)

Confirmar con asesoría legal que el módulo, al no mover fondos ni iniciar pagos, no encuadra como proveedor de servicios de pago ni requiere registros ante el BCRA [a verificar].

Revisar los términos de uso de Mercado Pago y de las empresas de servicios sobre el uso y la redistribución de links de pago [a verificar].

## 8. Riesgos y preguntas abiertas

### 8.1 Riesgos

### 8.2 Preguntas abiertas

Decisiones tomadas (antes preguntas 1 y 2): (1) Los gastos y pedidos sin factura se registran en la caja con la categoría "Sin factura" y un campo nota de texto libre, obligatorio en esa categoría, para aclarar qué fue el gasto (OP9.2, OP9.9). (2) Los pagos de las órdenes usan los medios de pago existentes de la caja (Efectivo, Débito, Mercado Pago, Transferencia bancaria y QR); no se crea un medio ni un tipo de pago nuevo (OP2.11, OP9.10).

Cierre de cuenta corriente: ¿el cierre de FP6.3 pasa siempre por una orden de pago, o la orden es opcional cuando se paga en efectivo?

Creación automática o a pedido: ¿el bot crea las órdenes solo y las presenta según el vencimiento, o pregunta "¿preparo la orden?" cada vez? ¿Configurable por comercio?

Empleados: ¿pueden ver órdenes y montos por defecto? ¿Un empleado con permiso puede pagarle en efectivo al preventista y marcar Pagada?

Comprobante por foto: ¿se adelanta al MVP si el OCR de facturas ya está en producción?

ARCA: ¿qué medios de pago del VEP usan más los kiosqueros (home banking, Mercado Pago, débito automático)? ¿Conviene una guía paso a paso por medio? [a verificar]

Allowlist: ¿quién la mantiene y con qué proceso? ¿El Dueño puede proponer un dominio nuevo, sujeto a revisión manual del equipo?

Detección de notificaciones (OP10): ¿la opción A (reenvío de emails) es viable con los bancos más usados? ¿La opción B es compatible con el principio OP1?

Plan: ¿el módulo está en todos los planes o es diferencial del plan Pro, junto con el bot?

Pagos agrupados (P1): ¿una transferencia que cubre varias facturas genera un egreso por factura o uno solo con detalle?

Legal: encuadre regulatorio y términos de uso de los links de pago de terceros.

### Decisiones tomadas:

El bot prepara y entrega; el comerciante paga desde su propia app. Sin ejecución de pagos ni credenciales, en todas las fases.

Una base de datos por cliente más una base de control, como ModoOps; las órdenes viven en la base del comercio.

Estados de la orden: Borrador → Lista para pagar → Enviada al comerciante → Pagada / Cancelada / Vencida.

Al pagar, en una sola transacción: orden Pagada, pedido Pagado, egreso en la caja y factura vinculada.

Solo links oficiales de la allowlist; datos de cobro solo desde la ficha.

Gastos y pedidos sin factura: egreso en la caja con la categoría "Sin factura" y nota de texto libre obligatoria que aclara qué fue el gasto.

Medios de pago: se usan los existentes de la caja (Efectivo, Débito, Mercado Pago, Transferencia bancaria y QR); no se crea un medio ni un tipo de pago nuevo (tampoco el tipo orden_pago en supplier_payments).

## 9. Plan por fases

Supuestos: el MVP del inventario (F1 a F8 del PRD principal, con estado de pago de los pedidos), el MVP de la caja (C1 a C11) y el MVP del bot (B1 a B12) están en producción o en beta. El pipeline de facturas (foto → Google Photos → OCR → confirmación) avanza en paralelo según su PRD.

### Fase 0: validación y diseño (1 a 2 semanas)

Entrevistas con 5 a 8 dueños: qué pagan, con qué medio, cómo reciben hoy los datos de cobro y qué intentos de estafa sufrieron.

Verificar todo lo marcado [a verificar]: dominios oficiales, medios de pago del VEP de ARCA, vencimiento del monotributo, canales de pago de servicios, plantillas de WhatsApp y su categoría, límites de la Google Photos Library API.

Consulta legal sobre el encuadre regulatorio.

Primera versión de la allowlist y guion de mensajes (flujos 1 a 5) probado por WhatsApp con dueños reales.

Acordar con los PRD de facturas, caja y bot los nombres de entidades, orígenes y eventos.

### Fase 1: MVP (4 a 6 semanas)

OP1 principio y controles de seguridad (SEC-1 a SEC-3).

OP2 órdenes y estados; OP4 desde pedidos de reposición; OP5 desde vencimientos de la caja (alquiler, luz, gas, servicios y ARCA como recordatorio con link oficial).

OP3 desde facturas de proveedores (si el pipeline de facturas está disponible; si no, se suma apenas lo esté).

OP6 datos de cobro (proveedores y beneficiarios) con allowlist; OP7 revisión y confirmación; OP8 entrega del link o de los datos.

OP9 "Ya pagué" manual con egreso en la caja, pedido Pagado y factura vinculada en una transacción; reversión.

OP11 recordatorios; OP12 vista web simple; OP13 auditoría.

Hito: beta con 5 comercios del piloto. Criterio de salida: 0 egresos duplicados, 0 links fuera de la allowlist y más del 80% de las órdenes Pagadas con egreso en la caja.

### Fase 2: comodidad (meses 2 y 3 del módulo)

Comprobante de transferencia por foto con OCR y match en un toque (OP9.6, OP9.7).

Recurrencia automática de gastos (con C9.5) y boletas de luz y gas por foto.

Pagos parciales (con F5.16) y órdenes agrupadas por proveedor.

Edición con WhatsApp Flows y botón de URL (a verificar); exportación CSV y calendario de pagos.

### Fase 3: detección y extensiones (meses 4 a 12, sujeto a verificación)

OP10 detección de pagos a partir de avisos reenviados por el comerciante (opción A), a verificar; evaluación de la opción B solo con una decisión explícita sobre OP1.

Aviso opcional al proveedor de que se pagó, con confirmación del Dueño.

Ampliación de la allowlist a más organismos provinciales y municipales.

## Anexo A: glosario

Campo | Detalle
--- | ---
Producto | Módulo Órdenes de Pago del Sistema de Inventario para Kioscos y Comercios (preparado y entregado por el bot de WhatsApp)
Autor | Mauricio Matasini
Estado | Borrador v1
Fecha | 9 de octubre de 2026
Documentos relacionados | "PRD - Sistema de Inventario para Kioscos y Comercios" (en adelante, PRD principal: https://docs.google.com/document/d/1yqHU3xK1EYQle8J5Gag0wweTs9llCHH_X8uo4_km_AA/edit), "PRD - Caja Digital para Sistema de Inventario" (en adelante, PRD de Caja: https://docs.google.com/document/d/14hdf2BbXewzSkjKE25zC8NEMJsDsy2ObI0IKBSt6u0U/edit), "PRD - Facturas de Proveedores para Sistema de Inventario" (en adelante, PRD de Facturas: https://docs.google.com/document/d/1I38DsgM56HRIyXimafn9wAGPNasTfV8sA4b4Fceoo50/edit) y "PRD - Bot de WhatsApp para Sistema de Inventario" (en adelante, PRD del bot: https://docs.google.com/document/d/1lp7TnN3MiX60OJihJdv7h_26XEAZdmyPtwjwSGEgPv8/edit). Los cuatro están en borrador; si cambian, este PRD se alinea a ellos.
Terminología | Se usa la misma de los documentos relacionados: comercio/tenant, base de control, roles Dueño/Empleado, pedido de reposición, estado de pago del pedido (Pendiente de pago → Facturado (pendiente de pago) → Pagado), caja, movimiento de caja, medio de pago (los cinco medios existentes de la caja: Efectivo, Débito, Mercado Pago, Transferencia bancaria y QR (QR de Mercado Pago o QR del postnet)), categoría ("Pago a proveedores > Mercadería"; "Sin factura", con nota obligatoria), vencimiento, reversión, factura del proveedor (pendiente de pago / pagada / anulada), modo de pago de facturas ("Pagar en el momento" / "Cuenta corriente"), cierre de cuenta corriente, pago a proveedor (supplier_payments)
Arquitectura de datos | Una base de datos por cliente (por comercio), igual que ModoOps, más una base de control del Control Plane. Todas las tablas de este módulo viven en la base de cada comercio.

# | Objetivo | Cómo se mide
--- | --- | ---
OP-O1 | Que pagar a un proveedor o un gasto lleve menos de 1 minuto desde el aviso hasta tener el link o los datos en la mano | Tiempo desde "Lista para pagar" hasta "Enviada al comerciante"
OP-O2 | Reducir pagos fuera de término | % de órdenes que llegan a "Vencida"; recargos evitados (encuesta)
OP-O3 | Que todo pago quede registrado en la caja y vinculado a su respaldo | % de órdenes Pagadas con egreso en la caja; % con factura asociada
OP-O4 | Eliminar errores de tipeo en CBU, alias y montos | Cantidad de pagos corregidos o revertidos por dato mal cargado
OP-O5 | Cero incidentes de seguridad por credenciales o phishing atribuibles al producto | 0 credenciales almacenadas; 0 links enviados fuera de la lista de dominios oficiales
OP-O6 | Adopción | % de comercios con bot vinculado que confirman al menos una orden por semana

Prioridad | Significado
--- | ---
P0 - MVP | Imprescindible para el lanzamiento del módulo
P1 - Post-MVP cercano | Dentro de los 2 a 3 meses posteriores al lanzamiento
P2 - Futuro | Fase 3 en adelante, según demanda y verificación

# | Funcionalidad | MVP (P0) | Más adelante (P1/P2)
--- | --- | --- | ---
OP1 | Principio "el bot prepara, el comerciante paga" | Sin ejecución de pagos ni credenciales, como requisito de producto y de seguridad | — (vale para todas las fases)
OP2 | Orden de pago y estados | Borrador → Lista para pagar → Enviada al comerciante → Pagada / Cancelada / Vencida; orden de cierre de cuenta corriente (varias facturas) | Pagos parciales (P1), orden agrupada de pedidos sin factura (P1)
OP3 | Preparación desde facturas de proveedores | Orden a partir de la factura fotografiada, guardada en Google Photos y leída por OCR | Detección de facturas duplicadas cruzada con órdenes (P1)
OP4 | Preparación desde pedidos de reposición | Orden a partir de pedidos en "Pendiente de pago" según las condiciones del proveedor | Orden a partir de la recepción del pedido (P1, con F5.8)
OP5 | Gastos recurrentes, servicios e impuestos | Alquiler, luz, gas, servicios e impuestos ARCA desde los vencimientos de la caja (C9) | Recurrencia automática (P1, con C9.5), boletas de servicios por foto y OCR (P1)
OP6 | Datos de cobro de beneficiarios | CBU/CVU/alias, titular, CUIT, link de pago, página oficial; cambios solo desde la web por el Dueño | Verificación de titularidad asistida (P2, a verificar)
OP7 | Revisión y confirmación con un toque | Resumen con botones Confirmar / Editar / Cancelar | Edición con WhatsApp Flows (P1, a verificar)
OP8 | Entrega del link o de los datos de pago | Link oficial (allowlist) o datos de transferencia listos para copiar; medidas anti-phishing | Botón de URL en mensaje interactivo (P1, a verificar)
OP9 | Marcar como pagada y registro en la caja | Un toque "Ya pagué": orden Pagada, pedido Pagado, egreso en la caja, factura vinculada | Foto del comprobante de transferencia con OCR (P1)
OP10 | Detección de notificaciones bancarias / Mercado Pago | — | P2, [a verificar]: sugerencia de match a partir de avisos que el comerciante reenvía
OP11 | Recordatorios de vencimiento | Aviso N días antes y el día del vencimiento; paso a Vencida | Resumen semanal de pagos ampliado (P1)
OP12 | Vista web, filtros y reportes | Lista de órdenes por estado, beneficiario y vencimiento; detalle con trazabilidad | Exportación CSV (P1), calendario de pagos (P1)
OP13 | Auditoría | Toda transición, edición, link enviado y cambio de datos de cobro queda registrado | Exportación del log (P1)

Estado | Significado | Pasa a
--- | --- | ---
Borrador | El bot la creó con datos parciales (por ejemplo, OCR con baja confianza, falta el CBU o el vencimiento) | Lista para pagar, Cancelada
Lista para pagar | Datos obligatorios completos y validados; espera la revisión y la confirmación del Dueño | Enviada al comerciante, Borrador (si se borra un dato obligatorio), Cancelada, Vencida
Enviada al comerciante | El Dueño confirmó y el bot le entregó el link o los datos de pago | Pagada, Lista para pagar (si se edita), Cancelada, Vencida
Pagada | El Dueño indicó que pagó; se registró el egreso en la caja y se actualizaron pedido, factura y vencimiento | Solo vuelve a Enviada al comerciante o Vencida si se revierte el egreso en la caja
Cancelada | Se descartó (pago duplicado, factura anulada, pedido cancelado, etc.); motivo obligatorio | Estado final
Vencida | Pasó la fecha de vencimiento sin marcarse Pagada | Pagada (pago fuera de término), Enviada al comerciante (al reenviar los datos), Cancelada

Tabla | Dónde | Campos principales
--- | --- | ---
payment_orders | Base del comercio | id (UUID), numero (correlativo por comercio), tipo (proveedor / alquiler / luz / gas / servicios / impuestos / otro), supplier_id (nullable), payee_id (nullable), concepto, categoria_id (cash_categories), monto_centavos (bigint > 0), moneda (ARS), vence_el, metodo_sugerido_id (cash_payment_methods: uno de los cinco medios existentes, Efectivo / Débito / Mercado Pago / Transferencia bancaria / QR; el módulo no agrega medios), instruccion_tipo (link_beneficiario / pagina_oficial / transferencia / codigo_pago / efectivo), instruccion_snapshot (JSON con los datos de cobro y el link entregados, inmutable por versión), link_dominio, referencia (nro. de factura, nro. de cliente, período), estado (borrador / lista_para_pagar / enviada / pagada / cancelada / vencida), version (entero, bloqueo optimista), origen (factura / pedido / vencimiento / manual), purchase_order_id (nullable), cash_due_item_id (nullable), supplier_payment_id (nullable, pago en supplier_payments cuando hay facturas), cash_movement_id (nullable), paid_at, paid_amount_centavos, paid_method_id (mismos cinco medios de cash_payment_methods), nota (texto; obligatoria si la categoría es "Sin factura"), comprobante_media_item_id (nullable, Google Photos), comprobante_ocr (JSON, nullable), comprobante_operacion_nro (nullable), confirmacion_origen (manual / comprobante / notificacion), alertas (JSON: datos_cobro_distintos, posible_duplicado, ocr_baja_confianza), creado_por, confirmado_por, enviado_at, enviado_wamid, cancelado_motivo, idempotency_key, created_at, updated_at
payment_order_invoices | Base del comercio | payment_order_id, supplier_invoice_id, monto_centavos (saldo de la factura incluido en la orden), estado_orden (desnormalizado para el índice único); una fila por factura (una en la orden común, varias en la de cierre de cuenta corriente)
payment_order_events | Base del comercio | payment_order_id, de_estado, a_estado, version, user_id, origen (web / bot / sistema), detalle (JSON), created_at
payees | Base del comercio | id, nombre, tipo (propietario / servicio / impuesto / otro), cuit, numero_cliente, official_domain_id (allowlist), cbu_cvu, alias, titular, cuit_titular, medio_preferido_id, activo, datos_cobro_actualizados_at, datos_cobro_actualizados_por
suppliers (extensión de F6) | Base del comercio | cbu_cvu, alias, titular, cuit_titular, link_pago_url, link_pago_dominio, datos_cobro_actualizados_at, datos_cobro_actualizados_por
supplier_invoices, supplier_invoice_photos (PRD de Facturas) | Base del comercio | Inmutables; se leen proveedor, tipo y número, fechas de emisión y de vencimiento, monto total, modo de pago y photos_media_item_id. El estado (pendiente de pago / pagada / anulada) se deriva del saldo y de las anulaciones.
supplier_payments, supplier_payment_allocations (PRD de Facturas) | Base del comercio | Inmutables; este módulo no agrega tipos: reutiliza pago_manual (y cierre_cc para la orden de cierre de cuenta corriente) y crea un pago con sus asignaciones al pagar una orden con facturas; la orden guarda supplier_payment_id; cash_movement_id único
purchase_orders (PRD principal) | Base del comercio | Sin campos nuevos obligatorios: se usan el estado de pago (pendiente_pago / facturado / pagado; estado_pago / payment_status, nombres a unificar), payment_due_at y el movimiento de pago (PRD principal, 6.3; PRD de Facturas, 6.2). La orden apunta al pedido.
cash_movements (PRD de Caja) | Base del comercio | Con facturas: origen factura_proveedor y ref_tipo = supplier_payment (PRD de Facturas). Sin facturas: categoría "Sin factura" con nota obligatoria (las órdenes de vencimientos mantienen su categoría), origen existente pedido_reposicion (pedidos) o manual (gastos), sin origen nuevo, ref_tipo = payment_order. medio_pago_id siempre uno de los cinco medios de cash_payment_methods. Siempre proveedor_id cuando aplica, idempotency_key y comprobante_photos_media_item_id
cash_categories, cash_payment_methods (PRD de Caja) | Base del comercio | Sin cambios de esquema en este módulo: se usa la categoría "Sin factura" y los cinco medios existentes (Efectivo, Débito, Mercado Pago, Transferencia bancaria, QR)
cash_due_items (PRD de Caja) | Base del comercio | Se usan movimiento_pago_id y estado; la orden apunta al vencimiento
official_payment_domains | Base de control | id, dominio, tipo (billetera / banco / servicio / organismo), entidad, url_pago_base, activo, verificado_por, verificado_at, notas
payment_usage | Base de control | tenant_id, mes, órdenes creadas y pagadas (solo cantidades, sin montos ni contenido)

Riesgo | Impacto | Probabilidad | Mitigación
--- | --- | --- | ---
Fraude por cambio de CBU (factura adulterada, mensaje falso del "proveedor") | Muy alto | Media | Datos de cobro solo desde la ficha, cambios con reautenticación y aviso, alerta por diferencias, verificación del titular en la app del banco
Phishing que imita al bot o a la plataforma | Alto | Media | Número oficial único, tono y pie fijos, nunca pedir claves, educación en el onboarding, allowlist de links
Error de OCR que lleva a pagar un monto o beneficiario equivocado | Alto | Media | Confirmación con un toque obligatoria, validación determinística, alertas de baja confianza, monto editable
Doble pago (dos órdenes para lo mismo, doble toque, reintento) | Alto | Media | Una orden activa por respaldo, detección de duplicados, idempotencia, versión en los botones
El comerciante paga pero no toca "Ya pagué" (caja desactualizada) | Medio | Alta | Recordatorio de órdenes Enviadas sin pago, paso a Vencida, comprobante por foto (P1), detección por notificaciones (P2)
Presión de clientes para que "el bot pague solo" | Medio | Media | Principio OP1 documentado como no negociable; comunicar la ventaja de seguridad
Cambios en dominios o flujos de pago de ARCA, Mercado Pago o empresas de servicios | Medio | Media | Allowlist mantenida y revisada mensualmente, monitoreo de links rotos
Costo de mensajes de WhatsApp por recordatorios | Medio | Alta | Un aviso por vencimiento, pagos de la semana agrupados, medición de costo por comercio (PRD del bot)
Dependencia del PRD de Facturas y de la Google Photos Library API | Medio | Media | Las órdenes desde pedidos y vencimientos funcionan sin facturas; verificar los límites de la API antes de construir
Encuadre regulatorio como servicio de pagos | Alto | Baja | No mover fondos ni iniciar pagos; consulta legal en la fase 0
Datos sensibles (CBU, montos) en servidores de Meta | Medio | Alta | Envío solo al Dueño y solo en la orden Enviada; informado en la política de privacidad

Término | Definición
--- | ---
Orden de pago | Preparación de un pago concreto a un beneficiario, con monto, referencia, vencimiento, medio sugerido e instrucción de pago; la paga el comerciante desde su app
Beneficiario | Quien recibe el pago: proveedor, propietario del local, empresa de servicios, ARCA u otro organismo
Datos de cobro | CBU/CVU, alias, titular y CUIT del beneficiario, o su link de pago o página oficial de pago
Instrucción de pago | Lo que el bot le entrega al comerciante para pagar: link oficial, datos de transferencia, código de pago o recordatorio de efectivo
Medio de pago | Uno de los cinco medios existentes de la caja: Efectivo, Débito, Mercado Pago, Transferencia bancaria y QR (QR de Mercado Pago o del postnet); las órdenes no tienen un medio propio
Sin factura | Categoría de la caja para gastos y pedidos pagados sin factura; exige una nota de texto libre que aclare qué fue el gasto
Allowlist de dominios oficiales | Lista de dominios de pago verificados, mantenida por la plataforma; el bot solo envía links de esos dominios
Factura del proveedor | Comprobante fotografiado, guardado en Google Photos y leído por OCR, con valores confirmados con un toque (PRD de Facturas)
Pedido de reposición / estado de pago | Igual que en el PRD principal y el PRD de Facturas (Pendiente de pago, Facturado (pendiente de pago), Pagado)
Cierre de cuenta corriente | Pago de las facturas impagas de un proveedor hasta la fecha de cierre (PRD de Facturas, FP6); en este módulo, una orden de cierre
Caja / movimiento de caja / egreso / reversión / vencimiento | Igual que en el PRD de Caja
VEP | Volante Electrónico de Pago de ARCA, que genera el contribuyente con su clave fiscal
Comercio / tenant / base de control | Igual que en el PRD principal
