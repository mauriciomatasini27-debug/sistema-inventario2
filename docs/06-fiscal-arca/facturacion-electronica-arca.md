> Origen: `PRD - Facturación Electrónica ARCA para Sistema de Inventario.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/fiscal`, `src/pages/api/fiscal/*`, `src/db/schema-fiscal.ts`

---

# PRD - Facturación Electrónica ARCA para Sistema de Inventario

Principio rector: todo se opera al 100% desde un celular. Activar la facturación (incluida la guía de delegación en ARCA), facturar una venta, emitir una nota de crédito y compartir la factura se hacen completos desde el celular. Lo único que necesita conexión es la autorización en ARCA: sin conexión la venta se registra igual y la factura se pide al sincronizar.

Qué cambia respecto del ticket. El ticket de venta del PRD de Ticket sigue siendo un documento interno y no fiscal ("DOCUMENTO NO VÁLIDO COMO FACTURA"). La factura electrónica es un documento distinto, con su propia numeración fiscal (la de ARCA), su CAE y su QR, vinculado a la venta y al ticket. Este PRD reemplaza la nota "fuera de alcance" de TV7.5 del PRD de Ticket. Este documento no modifica el PRD de Ticket: los ajustes que propone están en 4.13.

El tipo de comprobante lo define el emisor. La letra sale de la condición fiscal del comercio (emisor) y, en B/A, de la condición del receptor. Un kiosco monotributista emite solo C aunque el cliente pida una "A" (ARCA: "Deberán emitir comprobantes tipo 'C', a excepción de que se trate de una operación de exportación").

Datos externos: todo dato de ARCA citado se verificó el 9/10/2026 contra la fuente primaria (ver Fuentes). Lo marcado [a verificar] no se pudo confirmar y lleva el motivo. Las semanas de desarrollo son estimaciones.

## 1. Resumen / visión general

### 1.1 Problema

Hoy el sistema emite un ticket de venta no fiscal. Los kioscos y comercios chicos, en su mayoría monotributistas, tienen que facturar sus ventas en ARCA. ARCA dice que "todos los monotributistas, sin importar la categoría en la que estén encuadrados, deberán emitir factura electrónica para todas sus operaciones con consumidores finales". Para cumplir usan otra herramienta: "Comprobantes en línea", el "Facturador" de la app de ARCA o un software de terceros. Eso implica cargar dos veces cada venta, errores de importes, facturas que no coinciden con la caja ni con el stock, y devoluciones sin su nota de crédito.

### 1.2 Visión

Que cada venta registrada en el sistema pueda convertirse en una factura electrónica válida ante ARCA en un toque o de forma automática, desde el celular, con o sin conexión en el momento de vender, y que cada devolución genere su nota de crédito vinculada, sin que el comerciante tenga que entender de web services, certificados ni numeración fiscal.

### 1.3 Propuesta de valor

Una sola carga: la venta del Modo venta es la factura. Stock, caja, ticket y factura cuadran siempre.

Activación guiada sin certificados del lado del comercio: el comercio delega el servicio "Facturación Electrónica" en la CUIT del proveedor y nosotros firmamos con un único certificado nuestro, cifrado en el servidor.

Resistente a cortes: si se cae internet o ARCA, la venta no se frena; la factura sale cuando se puede, sin números repetidos ni salteados.

Devoluciones correctas: la nota de crédito se arma sola a partir del documento de devolución (TV13 del PRD de Ticket, C14 del PRD de Caja).

### 1.4 Alcance del módulo (por etapas)

Los códigos de comprobante están confirmados en la validación 10007 del manual WSFEv1 v4.7 de ARCA.

## 2. Objetivos y no-objetivos

### 2.1 Objetivos

Emitir Factura C/B/A y sus NC/ND por WSFEv1 con CAE, a partir de las ventas y devoluciones del sistema, con numeración correlativa sin huecos ni duplicados por punto de venta y tipo.

Que un comercio monotributista active la facturación desde el celular en menos de 20 minutos de su tiempo (meta, a validar en Fase 0), guiado paso a paso.

Cero facturas duplicadas ante timeouts o reintentos (idempotencia con FECompConsultar / FECompUltimoAutorizado).

Facturar las ventas hechas offline al sincronizar, respetando las reglas de fecha de ARCA.

QR de la RG 4892/2020 en toda representación de la factura.

Informar CondicionIVAReceptorId (RG 5616) en todos los comprobantes desde el día 1.

Separar los ambientes de homologación y producción por comercio, con pruebas automáticas contra homologación.

### 2.2 No-objetivos (fuera de alcance, al menos en las etapas 1 a 3)

Factura de exportación (E, wsfexv1), factura con detalle de ítems (wsmtxca), Factura de Crédito Electrónica MiPyMEs (201/206/211 y siguientes), comprobantes M, bienes usados (49) y Liquidación electrónica mensual.

Remitos R con CAI, remito electrónico cárnico (wsremcarne) y harinero (wsremharina) y la emisión del COT: en la Etapa 4 solo se detecta si aplican y se avisa.

Libro IVA Digital, declaraciones juradas, recategorización del monotributo y cálculo de percepciones o retenciones.

CAEA como modalidad principal: desde la RG 5782/2025 es solo para contingencias. Queda como opción avanzada (FE14, Fase 4).

Facturar con el certificado propio de cada comercio (alternativa a la delegación): no está en el MVP (ver 7.2).

Facturas recibidas de proveedores (las maneja el PRD de Facturas de Proveedores).

Asesoramiento impositivo: el sistema guía, pero la condición fiscal la declara el comercio.

## 3. Usuarios

### 3.1 Dueño/a (rol Dueño)

Activa la facturación, declara su condición fiscal, hace los trámites en ARCA con su clave fiscal (delegación y punto de venta) guiado por el wizard, elige si factura todas las ventas en automático o a demanda, ve las facturas rechazadas y las resuelve. Es el único que cambia la configuración fiscal (con reautenticación, AU10 del PRD de Autenticación).

### 3.2 Empleado/a (rol Empleado)

Vende y, según la configuración del comercio, la factura sale sola o la pide con un toque. Carga los datos del cliente cuando corresponde (DNI/CUIT). Genera la nota de crédito al registrar una devolución si tiene ese permiso (C14.9 del PRD de Caja). No ve ni cambia la configuración fiscal.

### 3.3 Cliente del comercio (receptor, no usuario)

Recibe la factura por WhatsApp, link o impresión. Puede pedir que lo identifiquen con DNI o CUIT.

### 3.4 Administrador de la plataforma (equipo propio)

Administra el computador fiscal del proveedor (certificado), acepta las delegaciones de cada comercio en ARCA y les asigna el computador fiscal (paso obligatorio del lado del proveedor, ver FE2), monitorea la cola, los rechazos y los vencimientos del certificado, y da soporte.

## 4. Funcionalidades

### 4.0 Priorización

### FE1. Configuración fiscal del comercio (P0)

Descripción: datos fiscales del emisor con los que se arma cada comprobante.

### Requerimientos:

FE1.1 Datos del emisor: CUIT (validada con dígito verificador), razón social, domicilio comercial, condición frente al IVA (Monotributo, IVA Exento, Responsable Inscripto), número de Ingresos Brutos y fecha de inicio de actividades (para la representación impresa [a verificar la lista exacta de datos obligatorios del Anexo II de la RG 1415 con un contador]).

FE1.2 Punto de venta fiscal: número (1 a 99998, validación 10004 del manual) del punto de venta de tipo web service dado de alta por el comercio en "Administración de Puntos de Venta y Domicilios": "Factura Electrónica - Monotributo - Webservices", "Factura Electrónica - RI IVA - Aplicativo y Webservices" o el de exentos. El sistema valida con FEParamGetPtosVenta que exista y no esté bloqueado.

FE1.3 El punto de venta del sistema no puede ser el mismo que usa el comercio en "Comprobantes en línea" ni en otro software: la numeración es única por punto de venta y tipo, y otro sistema emitiendo en el mismo punto rompería la correlatividad. El wizard lo explica.

FE1.4 Ambiente por comercio: homologacion o produccion. Un comercio nuevo arranca en producción después del wizard; homologación es solo para el equipo y las pruebas automáticas (FE12).

FE1.5 Modo de facturación: "Facturar todas las ventas automáticamente" (recomendado y preseleccionado para monotributo, por el texto de ARCA citado en 1.1) o "Facturar a pedido". [a verificar con un contador: si el modo "a pedido" es admisible para cada condición].

FE1.6 Cambiar CUIT, condición IVA o punto de venta es una acción sensible: solo el Dueño, desde la web, con reautenticación (AU10.1 del PRD de Autenticación ya incluye "Cambiar datos del comercio que afectan la facturación"). Los cambios se versionan y no alteran comprobantes ya emitidos.

FE1.7 Si el comercio cambia de condición (por ejemplo, de monotributo a RI), a partir de la fecha de cambio se emite la nueva letra. Las NC de facturas anteriores se emiten con la misma clase de la factura original [a verificar con un contador].

### Criterios de aceptación:

☐ Cargo una CUIT con dígito verificador inválido y el sistema la rechaza antes de guardar.

☐ Cargo el punto de venta 3 y el sistema confirma contra ARCA que existe y es de tipo web service; si cargo uno de "Comprobantes en línea", me avisa que no sirve.

☐ Un Empleado no ve la pantalla de configuración fiscal y la API le responde 403.

☐ Cambiar la condición IVA me pide reautenticación con Google y queda en la auditoría con el valor anterior y el nuevo.

### FE2. Wizard de activación y delegación (P0)

Descripción: guía en pantalla, pensada para el celular, que lleva al dueño desde "quiero facturar" hasta la primera factura real. Decisión del producto: cada comercio delega el web service "Facturación Electrónica" en la CUIT del proveedor y nosotros firmamos con un único certificado (computador fiscal) cifrado en el servidor.

Mecanismo de delegación verificado (y corrección a la decisión original). La delegación funciona, pero la verificación muestra que no termina con el paso del comercio. Según el documento técnico oficial de ARCA "Delegación de Webservices con el Administrador de Relaciones" (Situación 2: Tercerización del Servicio):

El comercio, en el "Administrador de Relaciones de Clave Fiscal" (clave fiscal nivel 3): "Nueva Relación" → ARCA → WebServices → "Facturación Electrónica" → Representante: CUIT del proveedor → Confirmar. ARCA emite el F3283/E y avisa que el autorizado todavía tiene que operar.

El proveedor (nosotros), en su propio Administrador de Relaciones: acepta la designación y crea una "Nueva Relación" con representado = el comercio, servicio "Facturación Electrónica" y representante = nuestro computador fiscal (el alias de nuestro certificado). "Solo puede elegir un Computador Fiscal": no se puede encadenar a otra empresa. Recién ahí "el servicio SÍ se encuentra disponible".

Desde ese momento, el TA que nos da el WSAA lista la CUIT del comercio como representada y en cada llamada a WSFEv1 se manda Auth.Cuit = CUIT del comercio ("Cuit contribuyente (representado o Emisora)"; error 601 "CUIT representada no incluida en token").

Impacto: el paso 2 es manual, por cada comercio y del lado nuestro (no encontré un web service para automatizarlo [a verificar]). El wizard tiene que contemplar un estado "esperando confirmación del proveedor" con un SLA operativo. Además, un TA ya emitido podría no incluir un comercio recién delegado hasta que se renueve [a verificar en homologación; es una inferencia del manual del WSAA].

### Requerimientos:

FE2.1 Paso 0, requisitos: CUIT, clave fiscal nivel 3 y condición fiscal. Si no tiene nivel 3, el wizard explica cómo subirlo y permite pausar y retomar.

FE2.2 Paso 1, condición fiscal: el dueño elige monotributo, exento o RI. En la Etapa 1 el wizard solo habilita monotributo y exento (C); los RI quedan en lista de espera hasta la Etapa 2.

FE2.3 Paso 2, punto de venta: instrucciones con capturas para dar de alta en "Administración de Puntos de Venta y Domicilios" un punto de venta del tipo correcto ("Factura Electrónica - Monotributo - Webservices" para monotributo) con un número que no use en otro sistema. Se carga el número en el sistema. Aviso de la RG 5866/2026: un punto de venta dado de baja no se puede volver a usar.

FE2.4 Paso 3, delegación: instrucciones paso a paso del punto 1 del recuadro, mostrando nuestra CUIT con botón de copiar y aclarando que el aviso rojo de "Computador Fiscal" es esperable. El dueño marca "Ya lo hice".

FE2.5 Paso 4, confirmación del proveedor: el comercio queda en estado delegacion_pendiente_proveedor y se genera una tarea en el Control Plane para que el equipo acepte la designación y asigne el computador fiscal (punto 2 del recuadro). El dueño ve "Estamos confirmando tu alta en ARCA (normalmente en menos de X horas hábiles)" [SLA a definir] y recibe un aviso por WhatsApp o email cuando está listo.

FE2.6 Paso 5, prueba técnica: el servicio de facturación ejecuta FEDummy (estado de los servidores), FEParamGetPtosVenta (el punto de venta existe para esa CUIT) y FECompUltimoAutorizado (último número de C para ese punto de venta) con Auth.Cuit = CUIT del comercio. Si da 601 / coe.notAuthorized, el wizard indica cuál paso falta (delegación del comercio o asignación nuestra).

FE2.7 Paso 6, primera factura: se propone facturar la próxima venta real (o una venta de prueba de importe mínimo con su NC de anulación inmediata, a elección del dueño [a verificar con un contador si conviene]). El wizard muestra la factura con CAE y QR.

FE2.8 Revocación: si el comercio revoca la delegación en ARCA ("Consultar" → "Revocar"), el próximo pedido da error de autorización; el comercio pasa a delegacion_revocada, se frena la cola de ese comercio y se avisa al dueño.

FE2.9 El wizard se puede hacer completo desde el celular: los enlaces abren el sitio de ARCA en el navegador y el dueño vuelve a la PWA. El progreso se guarda por paso.

FE2.10 Integración con el onboarding: se propone un paso opcional "Activá la facturación electrónica" en el checklist (ON8 del PRD de Onboarding, P1). No se modifica ese PRD desde acá.

### Criterios de aceptación:

☐ Desde el celular completo los pasos 0 a 3, cierro la app y al volver el wizard sigue en el paso 4.

☐ Al marcar "Ya lo hice" en la delegación, aparece una tarea en el Control Plane con mi CUIT; cuando el equipo la marca hecha, el sistema corre la prueba técnica sola y me avisa.

☐ Si la prueba técnica da "CUIT representada no incluida en token", veo "Falta que confirmes la delegación en ARCA o que nosotros terminemos el alta" y no "Error 601".

☐ Un RI que intenta activar en la Etapa 1 ve "Todavía no disponible para Responsables Inscriptos" y puede anotarse en la lista de espera.

☐ Si revoco la delegación en ARCA, la siguiente factura no se emite, la cola de mi comercio se pausa y recibo un aviso.

### FE3. Determinación del tipo de comprobante (P0)

Descripción: la letra la decide el sistema, no el usuario.

### Requerimientos:

FE3.1 Emisor monotributo o exento → clase C siempre (Factura 11, ND 12, NC 13), cualquiera sea el receptor. No hay manera de elegir otra letra.

FE3.2 (Etapa 2) Emisor RI y receptor con condición 4, 5, 7, 8, 9, 10 o 15 (exento, consumidor final, no categorizado, proveedor del exterior, cliente del exterior, IVA liberado Ley 19.640, no alcanzado) → clase B (6/7/8).

FE3.3 (Etapa 3) Emisor RI y receptor con condición 1, 6, 13 o 16 (RI, monotributo, monotributista social, monotributo trabajador independiente promovido) → clase A (1/2/3). La tabla de validez CondicionIVAReceptorId × clase sale del anexo del manual WSFEv1 v4.7.

FE3.4 Si el cliente pide "Factura A" a un monotributista, el sistema explica: "Como monotributista solo podés emitir Factura C. Le podés hacer una C a su CUIT."

FE3.5 La tabla de tipos se carga y se refresca desde FEParamGetTiposCbte y FEParamGetCondicionIvaReceptor (job diario), no se hardcodea.

### Criterios de aceptación:

☐ Un comercio monotributista factura a un cliente que dice ser RI: sale Factura C (11) a su CUIT, con CondicionIVAReceptorId = 1.

☐ La pantalla de venta de un monotributista no muestra ningún selector de letra.

☐ (Etapa 2) Un RI factura a consumidor final y sale Factura B (6) con CondicionIVAReceptorId = 5.

### FE4. Emisión de la factura desde la venta (P0)

Descripción: al confirmar una venta en el Modo venta (PRD principal, PRD de Ticket TV1), se crea el comprobante fiscal vinculado.

### Requerimientos:

FE4.1 En modo automático (FE1.5), cada venta confirmada encola un pedido de factura en la misma transacción que crea la venta y el ticket (outbox fiscal, ver 6.3). En modo a pedido, el botón "Facturar" está en la venta y en el ticket.

FE4.2 El importe de la factura es el total cobrado de la venta (neto de descuentos, TV4 del PRD de Ticket). Para C: ImpTotal = ImpNeto, sin array de IVA (validación 1443) y sin discriminar IVA. Moneda PES, cotización 1. Concepto 1 (productos); si el comercio vende servicios, concepto 2 o 3 con fechas de servicio (P1).

FE4.3 Una venta tiene como máximo una factura autorizada (restricción única en la base). Facturar dos veces la misma venta es imposible.

FE4.4 La factura se muestra en la venta con su estado: "Facturando…", "Factura C 00003-00000123 ✓" o "Rechazada: ver detalle".

FE4.5 Las ventas anteriores a la activación no se facturan en automático. El Dueño puede facturarlas a pedido si su fecha cumple las reglas de FE10.3.

FE4.6 La caja no cambia: facturar no crea movimientos de caja (C8 del PRD de Caja). El stock tampoco cambia.

FE4.7 Promos, combos y descuentos en el comprobante (RT12 del PRD de Rotación; TV2.9 y TV4 del PRD de Ticket):

FE4.7.1 Importe informado a ARCA: WSFEv1 no lleva detalle de ítems (el detalle por ítem es wsmtxca, fuera de alcance, 2.2), así que a ARCA se informa solo el total cobrado, ya neto de promociones, combos y descuentos manuales (de línea y del ticket): ImpTotal (y ImpNeto en C) = total del ticket. No se informa el precio de lista ni el descuento como importe aparte.

FE4.7.2 Representación (FE7): el detalle de lo vendido muestra las mismas líneas que el ticket: cada producto con su precio de lista, la línea de promoción con su importe negativo ("Promo 2x1 Jorgito −$900,00"), el combo con su nombre, sus componentes y su precio ("Combo merienda $2.000,00: Alfajor Jorgito + Coca-Cola 500 ml"), los descuentos manuales de línea y del ticket, y el total. El total de la representación coincide al centavo con el ImpTotal autorizado.

FE4.7.3 Clase B/A (Etapas 2 y 3): la base imponible por alícuota se arma con lo efectivamente cobrado por línea, después de prorratear la promoción o el combo entre sus líneas (RT12.7) y el descuento del ticket (TV4.5), con el método del mayor resto; así un combo con componentes de alícuotas distintas reparte su precio entre ellas y la suma de bases + IVA da el total al centavo. [a verificar con un contador el tratamiento de las bonificaciones en la representación de la Factura A].

FE4.7.4 Las unidades "gratis" de un 2x1 figuran en el detalle con su cantidad y la línea de promoción que las compensa.

FE4.8 Venta a cuenta (fiado): vender "A cuenta (fiado)" (C18 del PRD de Caja) no cambia las obligaciones de facturación: la venta se factura igual que una venta cobrada, en el momento de la venta (en modo automático, se encola al confirmarla, FE4.1), por el total de la venta, aunque la plata entre después. El cobro de fiado posterior es un ingreso de caja, no una venta: no genera otra factura ni modifica la emitida. En la representación, la condición de venta figura como "Cuenta corriente" en lugar de "Contado" [a verificar con un contador si la condición de venta es dato obligatorio de la representación]. Si se devuelve una venta a cuenta facturada, la NC se emite igual (FE8) y el reintegro baja la deuda del cliente según el "PRD - Fiado y Cuenta Corriente de Clientes" (en redacción).

### Criterios de aceptación:

☐ Con modo automático, vendo $2.660 y en menos de 10 s (con conexión y ARCA disponible) la venta muestra "Factura C 00003-00000124" con CAE y vencimiento.

☐ Toco dos veces "Facturar" rápido en modo a pedido y se emite una sola factura.

☐ El total de la factura coincide al centavo con el total cobrado del ticket, descuentos incluidos.

☐ Vendo 2 Jorgito con la promo 2x1 y un combo merienda: a ARCA se informa solo el total cobrado; el PDF muestra la línea "Promo 2x1 Jorgito −$900,00", el combo con sus componentes y el mismo total que el ImpTotal autorizado.

☐ Vendo $5.000 "A cuenta (fiado)" con modo automático: la Factura C se emite al confirmar la venta, por $5.000; cuando el cliente paga al otro día, no se emite ninguna factura nueva.

### FE5. Identificación del receptor (P0)

Descripción: a quién se le factura y con qué datos.

### Requerimientos:

FE5.1 Por defecto el receptor es Consumidor Final anónimo: DocTipo 99, DocNro 0, CondicionIVAReceptorId 5 y leyenda "A CONSUMIDOR FINAL" en la representación.

FE5.2 Umbral de identificación: si el total es igual o superior a $10.000.000 (RG 5700/2025, mantenido por la RG 5866/2026), la venta exige identificar al consumidor final con DNI, CUIL o CDI (extranjeros: documento del país o pasaporte). Nombre y domicilio pueden ir como "NR" o en cero. El valor del umbral es un parámetro de la base de control, no está hardcodeado.

FE5.3 CUIT a pedido: según la RG 5866/2026, si el comprador lo pide para deducir en Ganancias, se lo identifica con su CUIT sin importar el monto. Botón "Agregar DNI o CUIT del cliente" disponible siempre.

FE5.4 Si se identifica con CUIT, el receptor elige su condición IVA (en las Etapas 1 y 2, declarada; en la Etapa 3, desde el padrón, FE5.6). El sistema valida la combinación condición × clase antes de enviar (FE3).

FE5.5 Los clientes identificados se guardan en la base del comercio para reutilizarlos (búsqueda por DNI/CUIT/nombre).

FE5.6 (Etapa 3) Consulta al padrón: ws_sr_constancia_inscripcion (el ex Alcance 5) o ws_sr_padron_a13 con el computador fiscal del proveedor, para traer razón social, domicilio y condición IVA a partir de la CUIT [a verificar: qué servicio de padrón asociar y si alcanza con asociarlo a nuestro certificado sin delegación de cada comercio].

### Criterios de aceptación:

☐ Una venta de $3.500 sin datos del cliente sale con DocTipo 99, DocNro 0 y la leyenda "A CONSUMIDOR FINAL".

☐ Una venta de $10.000.000 exactos no se puede facturar sin DNI/CUIL/CDI: el sistema lo pide antes de confirmar (online) o deja la factura "en espera de datos" (offline, FE10.6).

☐ Una venta de $800 a un cliente que pide factura a su CUIT sale con DocTipo 80 y su CUIT.

☐ Cambiar el umbral en la base de control cambia el comportamiento sin desplegar código.

### FE6. Servicio de facturación: cola, lock e idempotencia (P0)

Descripción: el componente que habla con ARCA. Ver el detalle técnico en 6.2 a 6.5.

### Requerimientos:

FE6.1 Proceso aislado (servicio de facturación), único que accede a la clave privada y al TA. La web y el bot solo encolan pedidos y leen resultados.

FE6.2 Cola de trabajos persistente (pg-boss en la base de control [a decidir en Fase 0]). Un trabajo = un comprobante.

FE6.3 Lock por (CUIT, punto de venta, tipo de comprobante): solo un trabajo a la vez por combinación, porque el número tiene que ser exactamente el último autorizado + 1 (validación 10016) y la fecha no puede ser anterior a la del último comprobante.

FE6.4 Idempotencia: cada comprobante tiene un idempotency_key (derivado de sale_id o return_id y el tipo). Ante una respuesta perdida (timeout, corte), antes de reintentar se consulta FECompConsultar con el número asignado y, si ARCA ya lo autorizó con los mismos datos, se toma el CAE sin volver a pedirlo. Así lo indica la "Operatoria ante errores" del manual.

FE6.5 Caché del TA por (computador fiscal, servicio, ambiente), compartido por todos los workers, con renovación anticipada. Nunca se pide un TA con otro vigente (coe.alreadyAuthenticated).

FE6.6 Un comprobante por pedido a FECAESolicitar (en C es obligatorio: CbteHasta = CbteDesde). Lotes solo para B en P2.

FE6.7 Métricas: latencia de ARCA, tasa de rechazo por código, cola por comercio y antigüedad del pendiente más viejo, con alertas en el Control Plane.

### Criterios de aceptación:

☐ 20 ventas simultáneas del mismo comercio, desde 3 celulares, salen con números consecutivos del 125 al 144, sin huecos ni duplicados.

☐ Simulo un timeout después de que ARCA autorizó el 145: el reintento consulta FECompConsultar, recupera el CAE y no emite un 146 duplicado.

☐ Dos workers arrancan a la vez y uno solo pide el TA; el otro lo lee del caché.

☐ Ningún log ni respuesta de API contiene la clave privada, el token ni el sign.

### FE7. Representación de la factura y QR (P0)

### Requerimientos:

FE7.1 Representación en pantalla, link público con token aleatorio (como el link del ticket, TV8 del PRD de Ticket), PDF (A4 y formato angosto de 80 mm) y compartir por WhatsApp.

FE7.2 Contenido mínimo: "FACTURA" con la letra y el código ("C" / "COD. 11"), punto de venta y número (00003-00000124), fecha, datos del emisor (FE1.1), datos del receptor o "A CONSUMIDOR FINAL", detalle de lo vendido, total, CAE y fecha de vencimiento del CAE y el QR. [a verificar con un contador la lista completa de datos obligatorios de la RG 1415 y de la RG 4892/2020].

FE7.3 QR (RG 4892/2020): texto del QR = https://www.arca.gob.ar/fe/qr/?p= + JSON versión 1 en Base64, con los campos ver, fecha (RFC3339 full-date), cuit, ptoVta, tipoCmp, nroCmp, importe, moneda, ctz, tipoDocRec y nroDocRec (si corresponde), tipoCodAut ("E" = CAE, "A" = CAEA) y codAut (14 dígitos), según la especificación https://www.afip.gob.ar/fe/qr/documentos/QRespecificaciones.pdf. El ejemplo de ese PDF todavía usa https://www.afip.gob.ar/fe/qr/; la URL base es un parámetro de configuración [a verificar en homologación que el lector de ARCA valide las dos].

FE7.4 La factura no reemplaza al ticket: el ticket sigue existiendo como documento interno. Si la venta tiene factura, el ticket muestra "Factura C 00003-00000124" con link a la factura (propuesta para el PRD de Ticket en 4.13). El ticket nunca muestra el CAE ni la letra como si fuera la factura (TV7.2).

FE7.5 Una factura rechazada o pendiente no se puede compartir como factura: se comparte el ticket.

### Criterios de aceptación:

☐ Escaneo el QR de una factura con la app de ARCA y la valida con el CAE correcto.

☐ El PDF A4 y el de 80 mm muestran CAE, vencimiento del CAE y QR legibles.

☐ Desde el celular toco "Enviar por WhatsApp" y el cliente recibe el link de la factura.

### FE8. Nota de Crédito desde la devolución (P0)

Descripción: cada devolución de una venta facturada genera una NC vinculada a la factura original.

### Requerimientos:

FE8.1 Al registrar una devolución (TV13 del PRD de Ticket, C14 del PRD de Caja) sobre una venta con factura autorizada, se encola una Nota de Crédito de la misma clase (NC C, código 13) por el importe devuelto.

FE8.2 La NC lleva CbtesAsoc con la factura original (tipo, punto de venta, número, CUIT emisor y fecha), obligatoria en NC/ND según la validación 10197 del manual (o, en casos excepcionales, PeriodoAsoc).

FE8.3 Devolución parcial: NC por lo devuelto. Varias devoluciones de la misma venta generan varias NC, y la suma nunca supera el total facturado (validación propia antes de enviar).

FE8.4 Si la venta no estaba facturada, la devolución sigue el flujo actual (comprobante de devolución interno) y no se emite NC.

FE8.5 Si la factura original está pendiente (por ejemplo, venta offline sin sincronizar), la NC espera a que la factura tenga CAE y se emite después, en orden.

FE8.6 Anular una factura no existe en ARCA: "anular" en la interfaz equivale a emitir una NC por el total. El texto lo explica.

FE8.7 El receptor de la NC es el mismo de la factura original.

FE8.8 Medio de reintegro elegido por el operador y auditado (C14.2 del PRD de Caja): el operador (Dueño o Empleado) elige el medio de reintegro entre los 5 medios; viene preseleccionado con el medio de la venta original, pero la elección es libre. El medio elegido, el medio original, quién lo eligió y cuándo quedan en el log de auditoría (C7.6 del PRD de Caja y F3 del PRD principal). La NC no depende del medio de reintegro: se emite igual por el importe devuelto.

FE8.9 Devolución de una venta con promo o combo: la NC es por lo efectivamente cobrado por las unidades devueltas, con el prorrateo de RT12.7 y RT12.11 del PRD de Rotación (devolver una unidad de un 2x1 genera una NC por lo cobrado por esa unidad, no por el precio de lista). La suma de las NC nunca supera el total facturado (FE8.3).

### Criterios de aceptación:

☐ Devuelvo 1 de 3 productos de una venta con Factura C 00003-00000124 y sale la NC C 00003-00000010 con CbtesAsoc apuntando a la 124 y el importe del producto devuelto.

☐ Intento devolver más que lo facturado y el sistema lo impide antes de llamar a ARCA.

☐ "Anular factura" emite una NC por el total y deja la venta como "Facturada y anulada por NC".

☐ Devuelvo un producto cobrado con QR y elijo reintegrar en efectivo: la NC se emite por el importe devuelto y la auditoría muestra el medio original (QR), el elegido (Efectivo), quién lo eligió y cuándo.

☐ Devuelvo 1 de las 2 unidades de un 2x1: la NC es por lo cobrado por esa unidad según el prorrateo, no por el precio de lista.

### FE9. Nota de Débito (P0 básico)

### Requerimientos:

FE9.1 ND C (código 12) manual, solo para el Dueño, desde la factura original (por ejemplo, un recargo cobrado después), con CbtesAsoc obligatorio.

FE9.2 La ND requiere un movimiento de caja asociado si hubo un cobro (registro en la Caja, C8) [a definir con el PRD de Caja].

### Criterios de aceptación:

☐ Emito una ND C de $500 sobre la factura 124 y queda vinculada con su CAE.

### FE10. Facturación de ventas offline al sincronizar (P0)

Descripción: decisión del producto: las ventas hechas sin conexión se facturan cuando se sincronizan. CAEA queda como opción avanzada (FE14).

### Requerimientos:

FE10.1 Offline, la venta se registra igual (OF2 del PRD de Offline) con ticket provisional (TV3.3). La factura queda en el dispositivo como pendiente_de_sync. El ticket compartido offline nunca dice "factura".

FE10.2 Al sincronizar la venta (outbox con op_id, 6.4 del PRD de Offline), el servidor crea el pedido de factura en la misma transacción en la que registra la venta (idempotente por op_id).

FE10.3 Regla de fecha (manual WSFEv1, CbteFch): para concepto 1 (productos), la fecha del comprobante puede ser hasta 5 días anterior o posterior a la fecha del pedido, dentro del mismo mes, y no puede ser anterior a la fecha del último comprobante autorizado para ese punto de venta y tipo. Por eso:

FE10.3.a Las ventas pendientes de un comercio se facturan en orden cronológico de la venta, dentro del lock del punto de venta.

FE10.3.b Si la fecha de la venta es válida, la factura lleva la fecha de la venta.

FE10.3.c Si no lo es (más de 5 días, mes anterior, o anterior al último comprobante ya emitido), la factura sale con la fecha del día y la representación aclara la fecha real de la venta. [a verificar con un contador si esto es admisible o si, en cambio, corresponde CAEA].

FE10.4 Se usa la hora del servidor, no la del dispositivo, para decidir la fecha de la factura. Si el reloj del dispositivo estaba mal (OF8.4), la venta se marca y se factura con la fecha del día.

FE10.5 Punto de venta de facturación diferida (P1, a validar): opción de usar un punto de venta separado para las ventas offline, para que no se mezclen con las online en la regla de fechas. [a verificar con un contador].

FE10.6 Si una venta offline supera el umbral de FE5.2 sin DNI, la factura queda "en espera de datos" y aparece en la bandeja del Dueño.

FE10.7 Aviso al dueño: "Tenés N ventas sin facturar porque estuviste sin conexión. Se facturan solas cuando vuelve internet."

### Criterios de aceptación:

☐ Vendo 5 veces sin conexión, vuelvo a tener internet y se emiten 5 facturas C en el orden de las ventas, con la fecha de cada venta.

☐ Una venta offline del 30/9 sincronizada el 2/10 sale con fecha 2/10 (porque cambió el mes) y la representación dice "Venta del 30/9/2026".

☐ Sincronizo dos veces el mismo op_id y se emite una sola factura.

### FE11. Errores de ARCA, reintentos y bandeja de pendientes (P0)

### Requerimientos:

FE11.1 Clasificación de errores:

Transitorios (timeout, HTTP 5xx, errores de infraestructura del manual, FEDummy caído): se reintenta con backoff exponencial (30 s, 2 min, 10 min, 30 min, luego cada hora) previo FECompConsultar (FE6.4).

De autorización (WSAA coe.notAuthorized, cms.cert.expired, error 600 o 601): se pausa la cola de ese comercio o de todos (si es el certificado), con alerta al Control Plane y aviso al dueño cuando corresponde.

De negocio (Resultado = "R" con observaciones, por ejemplo 10016 número, 10015 documento, CondicionIVAReceptorId inválido): no se reintenta; queda Rechazada con el código y un texto en castellano, y aparece en la bandeja.

FE11.2 Bandeja "Facturas pendientes" para el Dueño: muestra rechazadas, en espera de datos y pendientes hace más de 1 hora, con una acción por caso (completar datos, reintentar, marcar como "no facturar" con motivo).

FE11.3 Detección de huecos: un job diario compara, por punto de venta y tipo, el último número de la base con FECompUltimoAutorizado. Si ARCA tiene un número que el sistema no conoce, lo trae con FECompConsultar y lo concilia o lo marca "emitido fuera del sistema".

FE11.4 Error 10016 (número no correlativo): se resincroniza el número con FECompUltimoAutorizado y se reintenta una vez; si persiste, alerta.

FE11.5 Después de los errores de WSAA que no son alreadyAuthenticated, se respeta la espera recomendada (60 s) antes de volver a pedir un TA.

FE11.6 La venta y la caja nunca se bloquean por un error de facturación.

### Criterios de aceptación:

☐ Con ARCA caído 2 horas, las ventas siguen y al volver se facturan en orden sin intervención.

☐ Una factura rechazada por CondicionIVAReceptorId muestra "La condición fiscal del cliente no es válida para Factura C" y permite corregir y reenviar.

☐ Si alguien emite en el mismo punto de venta desde "Comprobantes en línea", el job diario lo detecta y lo informa.

### FE12. Homologación y producción (P0)

### Requerimientos:

FE12.1 Dos computadores fiscales del proveedor: uno de homologación (certificado de WSASS) y uno de producción (certificado de "Administración de Certificados Digitales").

FE12.2 Endpoints por ambiente (tabla 6.7), seleccionados por la configuración del comercio y nunca por el cliente.

FE12.3 Un comercio de prueba propio en homologación, con pruebas automáticas (6.9) en cada despliegue.

FE12.4 La representación de un comprobante de homologación lleva una marca de agua "PRUEBA - SIN VALIDEZ FISCAL".

### Criterios de aceptación:

☐ El pipeline de CI emite una Factura C y su NC en homologación y verifica el CAE.

☐ No hay forma de mandar a producción un pedido de un comercio configurado en homologación.

### FE13. Historial fiscal, búsqueda y exportación (P0 básico)

### Requerimientos:

FE13.1 Listado de comprobantes con filtros por fecha, tipo, estado, receptor, importe y número.

FE13.2 Los comprobantes autorizados son inmutables (como el ticket, F3 del PRD principal); las correcciones se hacen con NC/ND.

FE13.3 Se guarda el pedido y la respuesta de ARCA de cada comprobante (sin el token ni el sign), para auditoría.

FE13.4 (P1) Exportación CSV/Excel mensual para el contador, con totales por tipo.

FE13.5 Conservación: se guardan los comprobantes por al menos 10 años [a verificar el plazo exacto de conservación con un contador].

### Criterios de aceptación:

☐ Busco la factura 00003-00000124 por número y la abro con su CAE y su QR.

☐ Ningún usuario puede editar el importe de una factura autorizada.

### FE14. CAEA de contingencia (Fase 4, opcional)

Descripción: desde la RG 5782/2025, el CAEA es solo para contingencias (validaciones 15016 a 15018 del manual) y en las solicitudes por CAEA el campo CbteFchHsGen es obligatorio.

### Requerimientos:

FE14.1 Opción avanzada, desactivada por defecto, solo después de validarla con un contador.

FE14.2 Pedido quincenal del CAEA (FECAEASolicitar), distribución del código a los dispositivos, numeración local por punto de venta CAEA e informe de los comprobantes (FECAEARegInformativo) dentro del plazo, incluido el informe "sin movimiento".

FE14.3 [a verificar: requisitos exactos de la contingencia, el plazo de informe y si se necesita un punto de venta propio para CAEA].

### Criterios de aceptación:

☐ (Fase 4) Con el CAEA activo, una venta offline sale con el CAEA y se informa a ARCA dentro del plazo.

### FE15. Constancia de entrega interna y chequeo de regímenes de remito (Etapa 4)

### Requerimientos:

FE15.1 Constancia de entrega interna, no fiscal, con la leyenda "DOCUMENTO NO VÁLIDO COMO REMITO" [a verificar con un contador la leyenda]. No se llama "remito" ni usa la letra R: el remito R necesita CAI (RG 5678/2025, "Remitos – Código de Autorización de Impresión") y WSFEv1 no autoriza remitos.

FE15.2 Chequeo de régimen por comercio, con un cuestionario: si traslada mercadería con documentación, que lo haga con remito R con CAI (imprenta autorizada); si vende carne (remito electrónico cárnico, RG 5259, wsremcarne) o harina (remito electrónico harinero, RG 5264, wsremharina); si traslada bienes en la provincia de Buenos Aires por encima de los umbrales del COT de ARBA (4.500 kg o $9.529.691, según ARBA) u otro régimen provincial.

FE15.3 El chequeo solo avisa; el sistema no emite remitos fiscales ni COT en esta etapa.

### Criterios de aceptación:

☐ La constancia de entrega no contiene la palabra "remito" en el título ni la letra R.

☐ Un comercio que marca "vendo carne al por mayor" ve el aviso del remito electrónico cárnico con el link a ARCA.

### FE16. Seguridad del certificado y del TA (P0)

### Requerimientos:

FE16.1 La clave privada del computador fiscal se guarda cifrada (KMS del proveedor de nube o equivalente, cifrado por envoltura) y solo la descifra el servicio de facturación, en memoria. Nunca en el repositorio, en variables de entorno de texto plano ni en la base de cada cliente. (Contraste: odoo-argentina-ce guarda la clave en un campo de texto plano, que es justo lo que se quiere evitar.)

FE16.2 El TA (token y sign) se guarda cifrado en la base de control, con su vencimiento (expirationTime, hoy 12 h según ARCA).

FE16.3 Vencimiento del certificado: alerta 60, 30 y 7 días antes; procedimiento de renovación documentado (nuevo CSR, nuevo certificado en "Administración de Certificados Digitales", asociación al mismo alias para no perder las relaciones) [a verificar en Fase 0 que al renovar con el mismo alias se mantengan las delegaciones].

FE16.4 Acceso a la consola del certificado y al Administrador de Relaciones del proveedor: solo 2 personas, con clave fiscal nivel 3 o superior y registro de cada acción.

FE16.5 Compromiso del certificado: procedimiento de revocación, nuevo certificado y reasignación a todos los comercios. Se documenta en un runbook.

### Criterios de aceptación:

☐ Un volcado de la base de control no permite leer la clave privada ni el TA sin la KMS.

☐ Con el certificado a 30 días de vencer, el Control Plane muestra una alerta roja.

### 4.13 Propuestas de integración con otros PRDs (sin editar esos documentos)

PRD de Ticket: reemplazar TV7.5 ("facturación ARCA fuera de alcance") por una referencia a este PRD; agregar en el ticket la mención "Factura C 00003-00000124" con link cuando exista; mantener TV7.2 (el ticket nunca dice "Factura" ni lleva CAE).

PRD de Caja: en C14, cuando la venta original tenía factura, la devolución dispara FE8. Definir el vínculo ND–movimiento de caja (FE9.2).

PRD de Offline: sumar a 6.4 el tipo de operación "pedido de factura" derivado de la venta, sin una operación nueva en el outbox. Mencionar FE10.3 en OF8.4.

PRD de Autenticación: agregar el permiso "Emitir NC/ND" a la matriz AU4 (Dueño sí; Empleado configurable).

PRD de Onboarding: paso opcional "Activá la facturación electrónica" en ON8 (P1).

PRD de Costos: agregar el costo del servicio de facturación y, si se elige, de la API de terceros.

## 5. Flujos de usuario

### Flujo 1: Onboarding fiscal y delegación (wizard, desde el celular)

El Dueño entra a Configuración → "Facturación electrónica" → "Activar". Reautenticación (AU10).

Paso 0: confirma que tiene clave fiscal nivel 3 (si no, ve cómo subirla y pausa).

Paso 1: elige "Monotributo". Carga CUIT, razón social, domicilio, IIBB e inicio de actividades.

Paso 2: el wizard abre ARCA → "Administración de Puntos de Venta y Domicilios" y le muestra cómo crear el punto "Factura Electrónica - Monotributo - Webservices" con un número libre (por ejemplo, 3). Vuelve y carga el 3.

Paso 3: el wizard abre ARCA → "Administrador de Relaciones de Clave Fiscal" → "Nueva Relación" → ARCA → WebServices → "Facturación Electrónica" → Representante: pega nuestra CUIT (botón copiar) → Confirmar. Marca "Ya lo hice".

Paso 4: el comercio queda en delegacion_pendiente_proveedor. En el Control Plane aparece la tarea. Un administrador entra al Administrador de Relaciones del proveedor, acepta la designación y crea la relación representado = comercio → representante = nuestro computador fiscal, y marca la tarea como hecha.

Paso 5: el servicio de facturación corre FEDummy, FEParamGetPtosVenta y FECompUltimoAutorizado (C, PV 3) con Auth.Cuit = CUIT del comercio. Si da OK, el comercio pasa a activo y recibe "¡Listo! Ya podés facturar".

Paso 6: elige el modo (automático recomendado) y factura la próxima venta.

Alternativas: 601 en el paso 5 → "Falta confirmar la delegación" con un botón para ver el paso 3 de nuevo. El punto de venta no existe o no es web service → vuelve al paso 2.

### Flujo 2: Venta → Factura C (online)

El Empleado registra la venta en Modo venta y cobra (como hoy). Se crea la venta, el ticket y, en modo automático, el pedido de factura en la misma transacción.

El servicio toma el trabajo, adquiere el lock (CUIT, PV 3, tipo 11), obtiene el TA del caché, pide FECompUltimoAutorizado (o usa la secuencia local verificada) y asigna N + 1.

Llama a FECAESolicitar con un solo comprobante: concepto 1, DocTipo 99, DocNro 0, CbteDesde = CbteHasta = N + 1, CbteFch = hoy, ImpTotal = ImpNeto, sin IVA, MonId PES, CondicionIVAReceptorId 5.

Resultado "A": guarda el CAE y su vencimiento, libera el lock y marca la factura como autorizada. La venta muestra "Factura C 00003-00000124 ✓".

El Empleado toca "Enviar por WhatsApp" y el cliente recibe el link de la factura con el QR.

### Flujo 3: Consumidor final por encima del umbral

El Empleado carga una venta de $10.200.000.

Al cobrar, el sistema avisa: "Para ventas de $10.000.000 o más tenés que identificar al cliente (DNI, CUIL o CDI)".

Carga el DNI (nombre y domicilio opcionales). Se factura con DocTipo 96, el DNI y CondicionIVAReceptorId 5.

Variante: el cliente pide factura a su CUIT por una compra de $1.200 → botón "Agregar DNI o CUIT" → DocTipo 80 y la condición IVA declarada; sigue siendo Factura C.

Variante offline: la venta se registra y la factura queda "en espera de datos" si no se cargó el documento (FE10.6).

### Flujo 4: Devolución → Nota de Crédito C

El Empleado busca la venta (o escanea el ticket) y registra la devolución de 1 producto (TV13 / C14). El operador elige el medio de reintegro (viene preseleccionado el de la venta original, pero puede elegir cualquiera de los 5; C14.2 del PRD de Caja), la elección queda en la auditoría y vuelve el stock (como hoy).

Como la venta tiene la Factura C 00003-00000124 autorizada, se encola una NC C (13) por el importe devuelto.

El servicio emite la NC con CbtesAsoc = {Tipo 11, PtoVta 3, Nro 124, Cuit emisor, CbteFch de la factura}. Resultado "A": queda vinculada a la factura y a la devolución.

El comprobante de devolución muestra "Nota de Crédito C 00003-00000010" con link.

### Flujo 5: Venta offline → facturada al sincronizar

Sin conexión, el Empleado vende. La venta y el ticket provisional se guardan en SQLite (OF2, TV3.3), y la factura queda pendiente_de_sync.

El ticket se puede compartir como ticket; la app avisa "La factura se emite cuando vuelva la conexión".

Al volver la conexión, el outbox sube la venta (op_id). El servidor la registra y crea el pedido de factura (idempotente).

El servicio factura las ventas pendientes del comercio en orden cronológico, con la fecha de la venta si cumple la regla de CbteFch o con la fecha del día si no (FE10.3).

El dispositivo recibe el estado y la venta muestra la factura. El dueño ve "Se facturaron 5 ventas pendientes".

### Flujo 6: Error de ARCA y reintento

El servicio llama a FECAESolicitar para el número 145 y la conexión se corta (timeout).

El trabajo queda respuesta_incierta, con el lock retenido para ese PV y tipo.

Reintento a los 30 s: primero FECompConsultar (tipo 11, PV 3, número 145).

Si existe y coincide (importe, documento y fecha): se guarda el CAE y se marca la factura autorizada. No se reenvía.

Si no existe: se reenvía el mismo pedido con el número 145.

Si existe pero no coincide (otro sistema emitió en ese PV): alerta crítica, se pausa la cola del PV y se resuelve a mano.

Si ARCA sigue caído, backoff (FE11.1). Las ventas siguen; la bandeja muestra "N facturas pendientes por ARCA no disponible".

Si la respuesta es un rechazo de negocio (resultado "R"), la factura queda rechazada con el motivo en castellano y el Dueño la corrige desde la bandeja.

## 6. Notas técnicas

### 6.1 Principios

La facturación nunca bloquea la venta ni la caja.

El servidor es la única fuente de verdad del número fiscal. El dispositivo nunca asigna números de factura.

Toda comunicación con ARCA pasa por el servicio de facturación. Los códigos de ARCA se guardan sin traducir y se muestran traducidos.

Todo lo que dice ARCA se parametriza (umbral, URL del QR, endpoints, tablas de parámetros), para no desplegar código ante un cambio normativo.

### 6.2 WSAA y caché del TA

Pedido: TRA (loginTicketRequest, uniqueId, generationTime = ahora − 10 min, expirationTime = ahora + 10 min, service = wsfe) firmado como CMS SignedData con el certificado y la clave del computador fiscal, en Base64, a loginCms. Se firma en el servicio con node-forge o con openssl cms [a decidir en Fase 0].

Duración: el TA vale 12 h (manual WSFEv1; "actualmente, 12 horas" según la arquitectura general de ARCA). Se renueva cuando falta menos de 1 h o ante un 600/601 inesperado.

Clave de caché: (computador fiscal, servicio, ambiente), no por comercio: con delegación hay un solo certificado y el TA lista las CUIT representadas; el comercio se elige en cada llamada con Auth.Cuit. Así se evita coe.alreadyAuthenticated, que pasaría si cada comercio pidiera su TA.

Concurrencia: el pedido del TA se hace con un lock (advisory lock global en la base de control) y doble verificación del caché. Los demás workers esperan y leen.

Nueva delegación: si un comercio recién delegado da 601 con un TA vigente, se fuerza la renovación del TA [a verificar en homologación cómo se comporta un TA vigente con una delegación nueva; si no la incluye, el alta de un comercio puede demorar hasta 12 h].

Errores: coe.alreadyAuthenticated → leer el caché (otro worker lo tiene); otros → esperar 60 s antes de reintentar; cms.cert.expired → alerta crítica.

### 6.3 Servicio de facturación, cola y lock por PV y tipo

Outbox fiscal: la venta (o la devolución) y el fiscal_documents en estado pendiente se crean en la misma transacción en la base del cliente. Un dispatcher publica el trabajo en la cola de la base de control (fiscal_jobs), con tenant_id y fiscal_document_id.

Worker: toma el trabajo y abre una transacción en la base del cliente con pg_advisory_xact_lock(hash(cuit, pto_vta, tipo_cbte)). Dentro del lock: lee fiscal_sequences, verifica contra FECompUltimoAutorizado si la secuencia no está "confirmada", asigna el número, marca enviando (con número y payload) y confirma en la base antes de llamar a ARCA. Después llama a ARCA y guarda el resultado.

El lock se mantiene a nivel lógico (fila de fiscal_sequences con in_flight_document_id) mientras haya un comprobante en enviando o respuesta_incierta: el siguiente número no se pide hasta resolver el anterior.

Paralelismo: entre comercios y entre PV/tipo distintos; dentro de una combinación, estrictamente serial. Límite global de concurrencia hacia ARCA configurable [a verificar si ARCA publica límites de tasa por CUIT o por certificado].

Cliente SOAP: soap (npm) o XML a mano con fetch [a decidir en Fase 0]; timeouts de 30 s.

### 6.4 Idempotencia y estados

Estados de fiscal_documents: pendiente_de_sync (solo en el dispositivo) → pendiente → enviando → autorizado | rechazado | respuesta_incierta → (autorizado | pendiente); además en_espera_de_datos y no_facturar.

idempotency_key = sale:{sale_id}:{tipo} o return:{return_id}:{tipo}, con índice único. Reencolar el mismo pedido no hace nada.

Recuperación (respuesta_incierta): FECompConsultar(tipo, pv, nro). Coincide en ImpTotal, DocTipo, DocNro y CbteFch → autorizado con el CAE devuelto. No existe → reenviar con el mismo número. Existe y difiere → alerta y pausa.

Conciliación diaria con FECompUltimoAutorizado (FE11.3).

### 6.5 Mapeo de Factura C a FECAESolicitar

### 6.6 QR

Se genera en el servidor a partir del comprobante autorizado (JSON v1 → Base64 → URL de FE7.3) y se renderiza como imagen en la representación web y en el PDF. El texto del QR se guarda en fiscal_documents.qr_payload.

### 6.7 Endpoints

(WSDL agregando ?WSDL. Los dominios técnicos siguen siendo afip.gov.ar.)

### 6.8 Modelo de datos

### Base de control:

fiscal_computers (id, ambiente, alias, cuit_proveedor, cert_pem, key_ciphertext, kms_key_id, not_after, estado).

arca_tokens (fiscal_computer_id, servicio, ambiente, token_ciphertext, sign_ciphertext, generation_time, expiration_time), con clave única (fiscal_computer_id, servicio, ambiente).

tenant_fiscal_links (tenant_id, cuit, ambiente, fiscal_computer_id, estado: delegacion_pendiente_comercio | delegacion_pendiente_proveedor | activo | delegacion_revocada | pausado, fechas de cada paso, tarea del Control Plane).

fiscal_params (clave, valor, vigencia): umbral CF, URL del QR, tablas cacheadas de FEParamGet*.

fiscal_jobs (cola: id, tenant_id, fiscal_document_id, estado, intentos, próximo intento, último error).

### Base de cada cliente:

fiscal_settings (cuit, razón social, domicilio, condición IVA, IIBB, inicio de actividades, modo de facturación; versionado).

fiscal_points_of_sale (pto_vta, tipo ARCA, uso: online | diferido | caea, activo).

fiscal_sequences (pto_vta, cbte_tipo, last_number, last_cbte_fch, confirmed_at, in_flight_document_id); PK (pto_vta, cbte_tipo).

fiscal_documents (id, idempotency_key único, sale_id o return_id, cbte_tipo, pto_vta, cbte_nro, cbte_fch, concepto, doc_tipo, doc_nro, condicion_iva_receptor_id, fiscal_customer_id, imp_total, imp_neto, moneda, estado, cae, cae_vto, resultado, observaciones jsonb, request jsonb, response jsonb, qr_payload, cbtes_asoc jsonb, created_at, authorized_at). Únicos: (pto_vta, cbte_tipo, cbte_nro) cuando hay número; una factura autorizada por venta.

fiscal_customers (doc_tipo, doc_nro, nombre, domicilio, condición IVA, origen: declarado | padrón).

delivery_notes (Etapa 4: constancias de entrega internas).

### 6.9 Pruebas y homologación

Suite automática contra homologación en cada despliegue: Factura C, NC C con CbtesAsoc, ND C, consumidor final ≥ umbral, FECompConsultar tras un timeout simulado, 20 emisiones concurrentes, error 10016 provocado y TA vencido.

Pruebas unitarias de las reglas de CbteFch, del armado del QR y de la tabla condición × clase.

Antes de producción: un comercio piloto real con su contador (Fase 0).

### 6.10 Desarrollo propio vs. API de terceros

Referencias de código revisadas: pyafipws (LGPL-3.0-or-later; caché del TA en archivo con TTL de 5 h) y ingadhoc/odoo-argentina-ce (módulos l10n_ar_afipws y l10n_ar_afipws_fe hasta la 18.0; clave privada en texto plano). Recomendación: desarrollo propio por el volumen esperado de comercios y para no pagar por CUIT, con una abstracción FiscalProvider para poder usar una API de terceros si el piloto lo necesita.

## 7. Riesgos y preguntas abiertas

### 7.1 Riesgos

### 7.2 Preguntas abiertas

¿El modo "facturar a pedido" es admisible para los monotributistas, o hay que facturar todo en automático? (contador)

Ventas offline de días o meses anteriores: ¿la factura con la fecha del día alcanza o corresponde CAEA de contingencia? ¿Conviene un punto de venta separado para la facturación diferida? (contador, FE10)

¿Se puede automatizar la aceptación de la delegación y la asignación del computador fiscal, o queda manual? ¿Qué SLA prometemos?

¿Un TA vigente incluye a las CUIT delegadas después de emitido? (prueba en homologación)

¿Desde cuándo ARCA rechaza comprobantes sin CondicionIVAReceptorId? Fuentes secundarias dicen 1/12/2026, el manual oficial v4.7 no lo trae. (Lo informamos desde el día 1, así que no bloquea.)

Lista exacta de datos obligatorios en la representación impresa (RG 1415 Anexo II y RG 4892) y leyendas.

¿Qué servicio de padrón usar en la Etapa 3 y si alcanza con asociarlo a nuestro certificado?

Clase de la NC cuando el comercio cambió de condición después de la factura original.

¿La constancia de entrega interna necesita una leyenda específica? ¿Qué comercios del público objetivo trasladan mercadería sujeta a COT o a remito electrónico?

Precios finales: ¿se cobra la facturación como un add-on? (PRD de Costos)

¿Se ofrece como alternativa que el comercio use su propio certificado (sin delegación) para clientes que no quieran delegar?

Plazo de conservación de los comprobantes y de los XML de pedido y respuesta.

## 8. Plan por fases (estimaciones)

Todas las semanas son estimaciones de un equipo de 1–2 desarrolladores, a validar al cierre de la Fase 0.

### Hitos y métricas:

Fin de la Etapa 1: 5 comercios piloto facturando en producción durante 2 semanas, 0 duplicados, 0 huecos, más del 99 % de las facturas autorizadas en menos de 1 minuto con conexión.

Activación: mediana de menos de 20 minutos de tiempo del dueño y menos de 1 día hábil hasta la primera factura (incluida la aceptación nuestra).

## Fuentes (consultadas el 9/10/2026)

Manual del desarrollador WSFEv1 v4.7 (rev. 1/9/2026): https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf · página: https://www.afip.gob.ar/ws/documentacion/ws-factura-electronica.asp

WSAA: https://www.afip.gob.ar/ws/documentacion/wsaa.asp · especificación 1.2.2: https://www.afip.gob.ar/ws/WSAA/Especificacion_Tecnica_WSAA_1.2.2.pdf · manual: https://www.afip.gob.ar/ws/WSAA/WSAAmanualDev.pdf · arquitectura: https://www.afip.gob.ar/ws/documentacion/arquitectura-general.asp

Certificados: https://www.afip.gob.ar/ws/documentacion/certificados.asp · https://www.afip.gob.ar/ws/WSAA/WSAA.ObtenerCertificado.pdf · https://www.afip.gob.ar/ws/WSAA/wsaa_obtener_certificado_produccion.pdf · https://www.afip.gob.ar/ws/WSAA/wsaa_asociar_certificado_a_wsn_produccion.pdf

Delegación de web services con el Administrador de Relaciones: https://www.afip.gob.ar/ws/WSAA/ADMINREL.DelegarWS.pdf

Puntos de venta: https://www.arca.gob.ar/facturacion/documentos/puntos-de-venta.pdf

Monotributo, comprobantes: https://www.afip.gob.ar/facturacion/monotributo/comprobantes.asp

QR: https://www.afip.gob.ar/fe/qr/documentos/QRespecificaciones.pdf · https://www.afip.gob.ar/fe/qr/vigencia-y-aplicacion.asp

RG 5700/2025: https://www.boletinoficial.gob.ar/detalleAviso/primera/326006/1 · RG 5866/2026: https://www.boletinoficial.gob.ar/detalleAviso/primera/343656/20260629

RG 5678/2025 (remitos, CAI): https://biblioteca.afip.gob.ar/dcp/REAG09005678_2025_04_16

Remito electrónico cárnico: https://www.arca.gob.ar/ws/remitoElecCarnico/Manual_Desarrollador_WSREMCARNE_v3_5.pdf · harinero: https://arca.gob.ar/ws/remitoHTSDMT/Manual_Desarrollador_WSREMHARINA_v2.9.pdf

COT ARBA: https://web.arba.gov.ar/preguntas-frecuentes/que-es-el-cot-quienes-y-bajo-que-condiciones-estan-obligados-generarlo-en-que

Catálogo de web services (padrón): https://www.afip.gob.ar/ws/documentacion/catalogo.asp

Código de referencia: https://github.com/ingadhoc/odoo-argentina-ce · https://github.com/reingart/pyafipws · https://github.com/AfipSDK/afip.js

Precios: https://afipsdk.com/pricing · https://www.tusfacturas.app/precios

Fuente secundaria (pendiente de confirmación oficial) sobre CondicionIVAReceptorId: https://www.signature.ar/novedades/actualizaci%C3%B3n-arca%3A-condici%C3%B3n-frente-al-iva-del-receptor-ser%C3%A1-obligatoria-en-wsfev1

Investigación verificada completa: investigacion-arca-facturacion.md (sección 8, Verificación)

## Anexo A. Glosario

ARCA: Agencia de Recaudación y Control Aduanero (ex AFIP).

CAE: Código de Autorización Electrónico; ARCA lo devuelve por cada comprobante autorizado, con fecha de vencimiento.

CAEA: CAE Anticipado; código quincenal que desde la RG 5782/2025 se usa solo para contingencias.

WSAA: web service de autenticación y autorización de ARCA; entrega el TA.

TA (Ticket de Acceso): token + sign, válido 12 h, para llamar a un web service de negocio.

WSFEv1: web service de factura electrónica (A, B, C, M) sin detalle de ítems.

Computador fiscal: el alias de un certificado digital dado de alta en ARCA.

Delegación: relación en el Administrador de Relaciones por la que un contribuyente autoriza a otra CUIT a usar un web service en su nombre.

Punto de venta fiscal: número dado de alta en ARCA para un tipo de emisión; la numeración es por punto de venta y tipo.

CondicionIVAReceptorId: campo de la RG 5616 que informa la condición del receptor frente al IVA.

Homologación: ambiente de pruebas de ARCA, sin validez fiscal.

COT: Código de Operación de Traslado (ARBA, provincia de Buenos Aires).

CAI: Código de Autorización de Impresión, requerido por el remito R.

Campo | Detalle
--- | ---
Producto | Facturación electrónica ARCA (Factura, Nota de Crédito y Nota de Débito clases C, B y A por web service WSFEv1) del Sistema de Inventario para Kioscos y Comercios (web y app móvil PWA)
Autor | Mauricio Matasini
Estado | Borrador v1
Fecha | 9 de octubre de 2026
Documentos relacionados | "PRD - Sistema de Inventario para Kioscos y Comercios" (PRD principal: https://docs.google.com/document/d/1yqHU3xK1EYQle8J5Gag0wweTs9llCHH_X8uo4_km_AA/edit; F3 historial inmutable, F8 cuentas, F10 devoluciones, F11 celular, 6.4 multi-tenant), "PRD - Ticket de Venta para Sistema de Inventario" (PRD de Ticket, en redacción: https://docs.google.com/document/d/1dA4AIxaHbLXS8ZoATx9Bh4fmBhXKfHA4oWnXprku4cM/edit; TV3 numeración, TV7 leyenda no fiscal y TV7.5 "facturación ARCA fuera de alcance", TV13 devoluciones), "PRD - Caja Digital para Sistema de Inventario" (PRD de Caja: https://docs.google.com/document/d/14hdf2BbXewzSkjKE25zC8NEMJsDsy2ObI0IKBSt6u0U/edit; C8 ventas, C14 devoluciones), "PRD - Modo Offline para Sistema de Inventario" (PRD de Offline: https://docs.google.com/document/d/1NvVipeJhXBgH5oae8D2SWzpqzBLybEaQ5Tc77G03Vw4/edit; OF2 venta offline, OF4 y 6.4 outbox y sincronización, OF8.4 reloj del dispositivo), "PRD - Autenticación y Gestión de Usuarios para Sistema de Inventario" (PRD de Autenticación: https://docs.google.com/document/d/18v4qo1sCDIfs31L1atBI3lxcaVC_2mlp9OpI4E1i2RM/edit; AU4 matriz de permisos, AU10 reautenticación), "PRD - Onboarding de Nuevos Clientes para Sistema de Inventario" (PRD de Onboarding: https://docs.google.com/document/d/136yVOwjMHnROHSavhJMdA4rPNWCzTcFrUfq7G71A6Qc/edit; ON8 checklist) y la investigación verificada investigacion-arca-facturacion.md (9/10/2026)
Terminología | La de los documentos relacionados (comercio/tenant, base de control, roles Dueño/Empleado, Modo venta, ticket, devolución, dispositivo, outbox, op_id, idempotency_key). Términos fiscales nuevos (CAE, CAEA, TA, WSAA, WSFEv1, punto de venta fiscal, computador fiscal, delegación, CondicionIVAReceptorId) en el Anexo A.
Stack | Astro + TypeScript (PWA: la misma app en el celular y en la PC), PostgreSQL con una base de datos por cliente más una base de control, base SQLite local en el dispositivo para el modo offline, "Iniciar sesión con Google". Nuevo: un servicio de facturación (Node/TS) con su cola de trabajos.

Etapa | Comprobantes | Para quién
--- | --- | ---
1 | Factura C (11), Nota de Débito C (12), Nota de Crédito C (13) | Monotributistas (y exentos en IVA, que también emiten C)
2 | Factura B (6), Nota de Débito B (7), Nota de Crédito B (8) | Responsables inscriptos que venden a consumidor final, exentos o no categorizados
3 | Factura A (1), Nota de Débito A (2), Nota de Crédito A (3), con consulta de CUIT en el padrón de ARCA y alícuotas de IVA completas | Responsables inscriptos que venden a RI o monotributistas
4 | Constancia de entrega interna no fiscal (no es un remito R) y chequeo por comercio de si le aplica un régimen de remito (CAI, cárnico, harinero) o el COT provincial | Comercios que entregan mercadería

ID | Funcionalidad | P0 (Etapa 1) | Después
--- | --- | --- | ---
FE1 | Configuración fiscal del comercio | Condición IVA, CUIT, punto de venta, ambiente | Varios puntos de venta (P1)
FE2 | Wizard de activación y delegación | Delegación, punto de venta, prueba, factura de prueba | Detección automática del estado de la delegación (P1)
FE3 | Determinación del tipo de comprobante | C para monotributo/exento | B (Etapa 2), A (Etapa 3)
FE4 | Emisión de la factura desde la venta | Automática o a demanda | Facturación agrupada de B (P2)
FE5 | Identificación del receptor | CF anónimo, DNI, CUIT a pedido, umbral | Padrón (Etapa 3)
FE6 | Servicio de facturación: cola, lock, idempotencia | P0 | —
FE7 | Representación de la factura y QR | Pantalla, link, PDF, WhatsApp | Térmica (P2, como TV15)
FE8 | Nota de Crédito desde la devolución | NC C total o parcial | NC B/A (Etapas 2 y 3)
FE9 | Nota de Débito | ND C manual | ND B/A
FE10 | Facturación de ventas offline al sincronizar | P0 | Punto de venta de facturación diferida (P1, a validar)
FE11 | Errores de ARCA, reintentos y bandeja de pendientes | P0 | —
FE12 | Homologación y producción | P0 | —
FE13 | Historial fiscal, búsqueda y exportación | P0 básico | Export para el contador (P1)
FE14 | CAEA de contingencia | — | Fase 4 (opcional)
FE15 | Constancia de entrega interna y chequeo de regímenes de remito | — | Etapa 4
FE16 | Seguridad del certificado y del TA | P0 | Rotación automatizada (P1)

Campo | Valor
--- | ---
FeCabReq.CantReg / PtoVta / CbteTipo | 1 / PV del comercio / 11, 12 o 13
Concepto | 1 (productos); 2 o 3 con FchServDesde, FchServHasta, FchVtoPago (P1)
DocTipo / DocNro | 99 / 0 (CF anónimo); 96 DNI; 80 CUIT; 86 CUIL
CbteDesde = CbteHasta | N + 1 (en C tienen que ser iguales)
CbteFch | yyyymmdd, regla FE10.3
ImpTotal = ImpNeto | total cobrado, neto de promociones, combos y descuentos (FE4.7); ImpTotConc, ImpOpEx, ImpIVA = 0; ImpTrib si hay tributos (P2)
Iva | no se informa en C
MonId / MonCotiz | PES / 1
CondicionIVAReceptorId | según el receptor (5 CF; 1 RI; 6 monotributo; 4 exento…)
CbtesAsoc | obligatorio en NC/ND (Tipo, PtoVta, Nro; Cuit y CbteFch recomendados)

Servicio | Homologación | Producción
--- | --- | ---
WSAA loginCms | https://wsaahomo.afip.gov.ar/ws/services/LoginCms | https://wsaa.afip.gov.ar/ws/services/LoginCms
WSFEv1 | https://wswhomo.afip.gov.ar/wsfev1/service.asmx | https://servicios1.afip.gov.ar/wsfev1/service.asmx

Opción | Ventajas | Desventajas | Costo (verificado 9/10/2026)
--- | --- | --- | ---
Propio (WSAA + WSFEv1 directo, con delegación) | Sin costo por comprobante, control total, un solo certificado | Más desarrollo (6–8 semanas C + B, estimación), mantenimiento normativo | Gratis del lado de ARCA ("sin aplicar ningún cargo")
Afip SDK (API) | Rápido (2–3 semanas, estimación), resuelve WSAA | Costo por CUIT y por pedido; dependencia | Pro USD 25/mes (10 CUIT, 10k pedidos, USD 10 por CUIT extra); Growth USD 80; Startup USD 250 (https://afipsdk.com/pricing)
TusFacturas (API) | Rápido, incluye representación | Costo por comercio; dependencia | Desde $13.992/mes; API desde $34.980/mes para 1.000 pedidos [a verificar si cubre varias CUIT] (https://www.tusfacturas.app/precios)

# | Riesgo | Probabilidad / impacto | Mitigación
--- | --- | --- | ---
R1 | Aceptación manual de la delegación del lado del proveedor (un paso por comercio) que no escala o demora el alta | Alta / medio | Tarea en el Control Plane con SLA, runbook, 2 operadores; investigar automatización (P4 de la investigación)
R2 | Un TA vigente no incluye a un comercio recién delegado → el alta demora hasta 12 h | Media / bajo | Probar en homologación (Fase 0); comunicar "hasta 12 h" si se confirma
R3 | Compromiso o vencimiento del certificado único: frena la facturación de todos los comercios | Baja / crítico | KMS, alertas de vencimiento, runbook de rotación (FE16)
R4 | Numeración rota porque el comercio usa el mismo punto de venta en otro sistema | Media / alto | Wizard (FE1.3), conciliación diaria (FE11.3)
R5 | Ventas offline tardías: la regla de CbteFch obliga a facturar con la fecha del día | Media / medio | FE10.3.c y validación con un contador; CAEA de contingencia en Fase 4
R6 | Cambios normativos (CondicionIVAReceptorId obligatorio, umbral, nuevas RG) | Alta / medio | Parámetros en la base de control, CondicionIVAReceptorId desde el día 1, seguimiento mensual del manual
R7 | ARCA caído o lento en horas pico | Media / bajo | Cola con backoff; la venta no se bloquea
R8 | Responsabilidad del proveedor como representante ante ARCA | Baja / alto | Términos y condiciones, revisión legal
R9 | Desfase entre ticket y factura (el ticket dice una cosa y la factura otra) | Baja / medio | Mismo total por construcción; tests

Fase | Contenido | Estimación
--- | --- | ---
Fase 0: preparación y validación | Certificados de homologación (WSASS) y producción, delegación de prueba con un comercio piloto, prueba de TA con delegación nueva (R2), decisiones de librerías (SOAP, firma CMS, cola), validación con un contador de las preguntas 1, 2 y 6 | 1–2 semanas
Etapa 1: Factura C + NC/ND C | FE1–FE13 y FE16 para clase C: wizard, servicio de facturación, cola, lock, idempotencia, QR, representación, NC desde la devolución, ventas offline, bandeja, homologación, Control Plane | 5–7 semanas
Etapa 2: Factura B | FE3.2, B para RI a consumidor final, alícuotas de IVA básicas (21 % y 10,5 %) en el producto, discriminación de IVA en el Iva de FECAESolicitar | ~1 semana (más si el catálogo no tiene alícuota por producto)
Total C + B |  | 6–8 semanas desarrollo propio · 2–3 semanas con una API de terceros (Afip SDK o TusFacturas), sin contar la Fase 0
Etapa 3: Factura A | Padrón (FE5.6), todas las alícuotas, validación condición × clase, NC/ND A | 2–3 semanas
Etapa 4: entrega y regímenes | FE15: constancia de entrega interna y chequeo de régimen | ~1 semana
Fase 4 opcional: CAEA de contingencia | FE14 | 2–3 semanas
