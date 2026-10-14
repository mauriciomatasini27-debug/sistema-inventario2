> Origen: `PRD - Consumos de Servicios para Sistema de Inventario.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/utilities`, `src/pages/api/utility-bills/*`, `src/db/schema-servicios.ts`

---

# PRD - Consumos de Servicios para Sistema de Inventario

Nota sobre datos externos: lo marcado [a verificar] (Gmail API, verificación de apps OAuth de Google, Google Photos Library API, WhatsApp Cloud API, motores de OCR, dominios remitentes de las empresas de servicios) debe confirmarse en la documentación oficial antes de implementar. Lo marcado [fuente: Google] se tomó de la documentación para desarrolladores de Google consultada el 9/10/2026 y puede cambiar.

## 1. Resumen / visión general

### 1.1 Problema

Además de la mercadería, el kiosco paga todos los meses (o cada dos meses) una lista de servicios e impuestos: la luz (Edenor, Edesur, EPEC, etc.), el gas (Metrogas, Naturgy, Camuzzi), el agua (AySA u organismo provincial), internet y teléfono, las tasas municipales (ABL, seguridad e higiene) y las obligaciones de ARCA (monotributo, autónomos, planes de pago). Hoy:

Las facturas llegan por email, mezcladas con promociones y otros correos, y muchas veces nadie las abre hasta que llega el aviso de corte o el recargo.

El dueño no sabe cuánto gasta por mes en cada servicio ni si la luz subió 30% respecto del mes pasado (tarifas que cambian seguido, consumo de heladeras y freezers).

Los pagos de servicios se registran en la caja tarde, con la categoría equivocada o directamente no se registran, así que el resultado del mes en la caja no es real.

El comprobante no queda guardado en un lugar fácil de encontrar cuando lo pide el contador, el locador o la distribuidora.

Los vencimientos se cargan a mano en la agenda de la caja (C9), si es que se cargan.

### 1.2 Visión

El dueño conecta una sola vez, con su permiso explícito, la casilla de email donde recibe las facturas de servicios. A partir de ahí, el bot:

Detecta en esa casilla, solo entre los mensajes de remitentes de servicios conocidos o que el dueño marcó, las facturas de luz, gas, tasas municipales, ARCA y otros servicios (agua, internet, teléfono).

Clasifica cada factura por tipo de servicio y guarda el comprobante en el Google Photos del comercio, en el álbum de ese tipo de servicio (mismo patrón que el PRD de caja y el PRD de facturas).

Lee con OCR/parsing la fecha, el monto, el proveedor del servicio, el vencimiento y el número de cuenta o cliente, y se los propone al dueño por WhatsApp como sugerencia: el dueño confirma con un toque o corrige.

Una vez confirmado, registra el gasto en la caja bajo su categoría (Luz, Gas, Servicios, Impuestos > ARCA, Impuestos > Tasas municipales): como egreso si ya está pagado, o como vencimiento pendiente con su fecha (C9 del PRD de caja) si todavía no se pagó.

Si el dueño quiere, prepara una orden de pago (PRD de órdenes de pago) con el monto, el vencimiento y los datos para pagar. El bot nunca paga ni tiene credenciales del banco ni de Mercado Pago: el dueño paga por su canal habitual y confirma.

En la web hay un panel de consumos con todos los gastos de servicios por tipo, historial, totales por categoría y período, comparación mes contra mes y gráficos.

Si el dueño no quiere conectar su email, o una factura llega en papel, le saca una foto (o reenvía el PDF) al bot y sigue el mismo flujo.

### 1.3 Propuesta de valor

"Las facturas de luz, gas, ARCA y servicios se cargan solas desde tu email: vos confirmás con un toque, quedan guardadas, entran en la caja y ves mes a mes cuánto te cuesta cada servicio."

### 1.4 Alcance del módulo

Es un módulo del mismo producto: misma app Astro, mismos usuarios y roles, misma base de datos por comercio, mismo bot de WhatsApp, misma conexión de Google Photos que la caja y las facturas de proveedores.

Cubre facturas y boletas de servicios e impuestos (gastos fijos del local). Las facturas de mercadería siguen el PRD de facturas; el alquiler sigue cargándose como vencimiento o egreso de la caja (C9/C3), salvo que llegue por email y el dueño lo agregue como servicio personalizado (P1).

No es un sistema contable ni fiscal, ni una herramienta de pago (ver no-objetivos).

## 2. Objetivos y no-objetivos

### 2.1 Objetivos

### 2.2 No-objetivos (fuera de alcance, al menos en el MVP)

No paga servicios ni impuestos: no se conecta con el home banking, Mercado Pago, Pago Mis Cuentas, Link ni Banelco, y nunca guarda credenciales bancarias ni de Mercado Pago. Como mucho, prepara una orden de pago (PRD de órdenes de pago) que el dueño ejecuta por su cuenta.

No lee todo el email del dueño: solo procesa mensajes que pasan los filtros de remitentes de servicios (ver CS1). No indexa, no resume y no guarda correos no relacionados.

No envía, borra, archiva ni marca emails: acceso de solo lectura.

No valida facturas ni deudas contra ARCA, las distribuidoras o los municipios (no consulta CAE, deuda ni estado de cuenta en sus sistemas).

No liquida impuestos, no calcula el monotributo ni recategorizaciones, no lleva libros contables (igual que el PRD de caja).

No reclama a la distribuidora ni gestiona débitos automáticos o adhesiones a factura electrónica.

Ningún dato leído se registra solo: sin el toque de confirmación no hay egreso, vencimiento ni orden de pago (mismo principio que el PRD de facturas).

No soporta Outlook/Hotmail, Yahoo ni otros proveedores de email en el MVP (P2).

## 3. Usuarios

Se usan los mismos roles del PRD principal.

### 3.1 Dueño/a (rol Dueño)

Perfil: el del PRD principal; recibe las facturas en su Gmail personal o del negocio, paga por home banking o Mercado Pago, tiene algún servicio con débito automático.

Necesidades: no olvidarse de ningún vencimiento, saber cuánto gasta en cada servicio y si subió, tener los comprobantes a mano, que la caja muestre el resultado real del mes.

Permisos: total: conectar y desconectar el email y Google Photos, elegir los remitentes y servicios que se procesan, confirmar, corregir y descartar facturas, registrar pagos, preparar órdenes de pago, anular facturas confirmadas, ver el panel de consumos.

### 3.2 Empleado/a (rol Empleado)

Perfil: atiende el mostrador; a veces recibe la boleta en papel de la municipalidad o del agua.

Permisos por defecto (configurables por el dueño): mandar la foto de una boleta al bot y confirmar los datos leídos. No conecta el email, no ve el panel de consumos ni los montos de otros servicios, no registra pagos (salvo que el dueño le habilite las categorías correspondientes en la caja, como en el PRD de caja) y no prepara órdenes de pago. La boleta cargada por un empleado queda como vencimiento pendiente y el bot le avisa al dueño.

Nunca recibe avisos de facturas detectadas en el email del dueño.

### 3.3 Proveedor de servicios (no usuario)

Empresa distribuidora, prestadora, ARCA o municipio que emite la factura o boleta. No interactúa con el sistema.

### 3.4 Administrador de la plataforma

Igual que en el PRD principal: opera desde el Control Plane, ve métricas agregadas (facturas detectadas, acierto del clasificador y del OCR, costos, conexiones activas y revocadas) y nunca ve emails, comprobantes ni montos de un comercio sin consentimiento explícito y registro.

Mantiene el catálogo global de remitentes de servicios (dominios y direcciones conocidas por tipo de servicio) en la base de control.

## 4. Funcionalidades

### 4.0 Priorización

### CS1. Conexión del email con opt-in explícito (P0)

Descripción: el dueño conecta su casilla de Gmail desde la web, con un consentimiento claro sobre qué se lee y para qué. El acceso es de solo lectura y se limita a los mensajes que parecen facturas de servicios.

### Requerimientos:

CS1.1 La conexión se inicia solo desde la web (Configuración → Consumos de servicios → "Conectar mi email"), con el Dueño autenticado. Nunca desde un link recibido por el bot sin sesión.

CS1.2 Antes del OAuth, la web muestra una pantalla de consentimiento propia con: qué se lee (solo mensajes de los remitentes de servicios elegidos), qué se guarda (solo los datos de la factura y el comprobante), qué no se hace (no se envían, borran ni marcan emails; no se guardan emails no relacionados), cómo desconectar y link a la política de privacidad. El dueño marca la casilla "Autorizo leer las facturas de servicios de mi email" y se guarda fecha, hora, usuario y versión del texto aceptado.

CS1.3 OAuth 2.0 de Google con el scope mínimo que permita leer el contenido y los adjuntos de los mensajes filtrados: https://www.googleapis.com/auth/gmail.readonly [fuente: Google; es un scope restringido]. No se piden scopes de envío, modificación ni borrado. Se pide acceso offline (refresh token) para la lectura periódica.

CS1.4 Filtros de ingesta (aplicados en la consulta a la API, antes de descargar cualquier contenido):

Lista de remitentes conocidos por tipo de servicio, del catálogo global (dominios de distribuidoras eléctricas y de gas, prestadoras de internet y telefonía, empresas de agua, ARCA, municipios) [a verificar dominios y direcciones reales de cada emisor].

Remitentes que agrega el dueño ("la municipalidad me manda desde tasas@...").

Opcional: una etiqueta de Gmail que el dueño elige (ej.: "Servicios"), para que solo se procese lo que él etiqueta.

Ventana temporal: en la conexión inicial, solo los últimos 90 días (configurable entre 0 y 12 meses); después, solo mensajes nuevos.

CS1.5 El dueño ve y edita la lista de remitentes activos y puede pausar o desactivar cada tipo de servicio.

CS1.6 Revocación: botón "Desconectar mi email" en la web y comando "desconectar email" en el bot (con confirmación). Al desconectar: se revoca el token en Google, se borra el refresh token, se detiene la suscripción de notificaciones y se descarta la cola pendiente. Las facturas ya confirmadas se conservan (son datos del comercio). El sistema también detecta la revocación hecha desde la cuenta de Google (error invalid_grant) y marca la conexión como revocada, con aviso al dueño.

CS1.7 Una sola casilla conectada por comercio en el MVP (P2: hasta 2, por ejemplo personal y del negocio).

CS1.8 (P1) Alternativa sin OAuth: dirección de reenvío propia del comercio (ej. servicios-<código>@<dominio-del-producto>); el dueño configura en Gmail un reenvío automático con filtro, o reenvía a mano. No requiere scopes restringidos (ver riesgos).

### Criterios de aceptación:

☐ Desde la web toco "Conectar mi email", leo la pantalla de consentimiento, acepto y, tras el OAuth de Google, la conexión queda "Activa" con la lista de remitentes por defecto.

☐ La pantalla de permisos de Google muestra solo lectura (sin envío ni borrado).

☐ En la conexión inicial con 90 días, solo se procesan mensajes de los remitentes filtrados; un email de promoción de una tienda no genera ningún registro ni log con contenido.

☐ Agrego el remitente de mi municipalidad y la siguiente boleta de tasas se detecta.

☐ Toco "Desconectar mi email" y en menos de 1 minuto la conexión queda revocada en Google y en el sistema; no se procesan más mensajes.

☐ Si revoco el acceso desde mi cuenta de Google, la próxima sincronización marca la conexión como revocada y recibo un aviso.

☐ Un empleado no ve la opción de conectar el email.

### CS2. Detección y clasificación por tipo de servicio (P0)

Descripción: cada mensaje que pasa los filtros se analiza para decidir si contiene una factura o boleta de servicio y de qué tipo.

### Requerimientos:

CS2.1 Tipos de servicio predefinidos (service_types) y su categoría de egreso en la caja (C5 del PRD de caja):

CS2.2 Clasificación en dos capas, como el parser del PRD del bot:

Capa 1, reglas: remitente del catálogo (dominio → tipo de servicio), palabras clave del asunto y del cuerpo ("factura", "boleta", "vencimiento", "liquidación", "VEP", "monotributo", "kWh", "m³") y presencia de adjunto PDF o imagen.

Capa 2, modelo (LLM con salida estructurada validada con Zod) solo si la capa 1 no alcanza. Recibe el texto mínimo necesario del mensaje filtrado (asunto, remitente y texto del adjunto) y devuelve {es_factura, tipo_servicio, confianza}. Nunca recibe datos de otros comercios. Proveedor y costo [a verificar].

CS2.3 Resultados posibles: factura de servicio (pasa a CS3/CS4), no es factura (aviso de pago recibido, publicidad de la empresa, encuesta: se descarta sin guardar contenido, solo el id del mensaje para no reprocesarlo) o dudoso (se le pregunta al dueño en el mismo mensaje de confirmación: "¿Esto es una factura de servicio?").

CS2.4 La factura puede venir en un adjunto PDF, en una imagen, en el cuerpo HTML o solo como link a la web de la empresa. Si solo hay link: el sistema no sigue links ni inicia sesión en sitios de terceros; registra lo que se pueda leer del cuerpo (monto, vencimiento) y guarda como comprobante una imagen generada del cuerpo del email (ver CS3.4).

CS2.5 El dueño puede corregir el tipo de servicio al confirmar; la corrección se asocia a la cuenta de servicio (CS8) para que las facturas siguientes del mismo remitente y número de cuenta se clasifiquen igual.

### Criterios de aceptación:

☐ Un email de la distribuidora eléctrica con la factura en PDF se clasifica como Luz con confianza alta.

☐ Un VEP o una boleta de monotributo de ARCA se clasifica como ARCA.

☐ Un email de "Recibimos tu pago" de la prestadora de internet se descarta como "no es factura" y no se guarda su contenido.

☐ Corrijo una factura de "Otros servicios" a "Internet" y la del mes siguiente del mismo remitente llega clasificada como Internet.

### CS3. Guardado del comprobante en Google Photos (P0)

Descripción: mismo patrón que el PRD de caja (C3.7) y el PRD de facturas (FP2): el comprobante se sube al Google Photos del comercio mediante la Google Photos Library API, con la misma conexión OAuth que ya usan la caja y las facturas de proveedores, y queda asociado al tipo de servicio.

### Requerimientos:

CS3.1 Conexión única por comercio (FP2.1 del PRD de facturas): si Google Photos ya está conectado, no se pide de nuevo. La conexión de Gmail (CS1) y la de Google Photos son consentimientos separados: el dueño puede tener una sin la otra.

CS3.2 Un álbum por tipo de servicio, creado por la app: "Consumos – Luz – Kiosco La Esquina", "Consumos – ARCA – Kiosco La Esquina", etc. Descripción del media item: "Luz · Edenor · Cuenta 1234567 · Vence 20/10/2026 · $48.000".

CS3.3 Imágenes (JPEG/PNG/HEIC de una foto o adjunto): se suben tal cual.

CS3.4 PDF y facturas en el cuerpo del email: Google Photos acepta solo imágenes y videos, no PDF [a verificar formatos soportados por la Library API]. Propuesta para el MVP:

Se renderiza la primera página (o hasta 3) del PDF a JPEG en el servidor (pdf.js/poppler) y esa imagen se sube a Google Photos.

El PDF original se guarda en el almacenamiento de objetos del producto (S3 compatible, PRD principal 6.3), cifrado, con URL firmada, descargable desde la ficha de la factura.

Para facturas que vienen solo en el cuerpo del email, se genera una imagen (captura del HTML saneado) como comprobante.

Pregunta abierta (8.2): alternativa de guardar los PDF en el Google Drive del comercio (carpeta "Consumos de servicios", scope drive.file) en lugar de nuestro almacenamiento.

CS3.5 Se guarda el mediaItemId (y el álbum); la URL de visualización se pide de nuevo cada vez que se muestra, porque las URLs de contenido de Google Photos son temporales (igual que FP2.4).

CS3.6 El OCR/parsing se hace sobre los bytes originales (PDF o imagen) descargados del email o de WhatsApp, antes o en paralelo con la subida (igual que FP2.5).

CS3.7 Si Google Photos no está conectado o la subida falla, la factura se puede confirmar igual: el comprobante queda en el almacenamiento del producto y se reintenta la subida; el dueño recibe el link para conectar Google Photos (igual que FP2.6).

Verificar antes de construir: los scopes y políticas de la Google Photos Library API cambiaron en 2025 (desde el 31/3/2025 las apps solo pueden leer y administrar los medios y álbumes que ellas mismas crearon; se retiraron los scopes de lectura y uso compartido de toda la biblioteca y la selección de fotos existentes pasó a la Google Photos Picker API) [a verificar scopes vigentes, por ejemplo photoslibrary.appendonly, photoslibrary.readonly.appcreateddata y photoslibrary.edit.appcreateddata, cuotas y requisitos de verificación de la app OAuth]. Implicancias: la app solo referencia comprobantes que subió ella; si el dueño borra la foto desde Google Photos, la app no puede recuperarla (por eso se conserva el original en el almacenamiento del producto, ver 6.6).

### Criterios de aceptación:

☐ Con Google Photos conectado, una factura de luz en PDF detectada en el email aparece como imagen en el álbum "Consumos – Luz" del Google Photos del dueño, con la descripción del proveedor, la cuenta, el vencimiento y el monto.

☐ Desde la ficha de la factura en la web veo la imagen (aunque hayan pasado semanas) y puedo descargar el PDF original.

☐ Sin Google Photos conectado, confirmo la factura igual; al conectarlo, el comprobante se sube solo al álbum correcto.

☐ Ningún refresh token (Gmail ni Photos) aparece en logs; ambos se guardan cifrados.

### CS4. OCR/parsing como sugerencia y confirmación en un toque por WhatsApp (P0)

Descripción: se extraen los datos de la factura y se le proponen al dueño por WhatsApp; el dueño confirma con un toque o corrige. Es el mismo patrón "sugerencia + confirmación en un toque" del PRD de facturas (FP3): nada leído se registra solo.

### Requerimientos:

CS4.1 Campos que se leen:

Obligatorios para confirmar: tipo de servicio, proveedor del servicio, monto total y fecha de emisión.

Muy recomendados: fecha de vencimiento (primer vencimiento) y número de cuenta / cliente / partida / CUIT (según el servicio).

Opcionales (P1): período facturado (desde-hasta), segundo vencimiento y su monto, consumo (kWh, m³) y código de pago electrónico o número de referencia para pagar.

CS4.2 Orden de extracción: (1) texto embebido del PDF si es digital (más confiable que el OCR); (2) OCR si es imagen o PDF escaneado; (3) datos del cuerpo del email como respaldo. Para emisores frecuentes, plantillas de parsing por emisor (P1).

CS4.3 Cada campo tiene confianza (alta / media / baja); los de confianza media se muestran con "⚠ revisá" y el botón "Confirmar" queda disponible igual (igual que FP3.2).

CS4.4 Mensaje de sugerencia por WhatsApp con botones: [Confirmar] [Editar] [Descartar] (máximo 3 botones [fuente: Meta]). "Editar" abre una lista con los campos (Tipo, Proveedor, Monto, Emisión, Vencimiento, N° de cuenta) y el dueño corrige escribiendo el valor ("monto 48500", "vence 22/10").

CS4.5 Después de confirmar los datos, el bot pregunta el estado de pago: [Ya la pagué] [Pendiente] [Orden de pago] (ver CS5 y CS6). Si la cuenta está marcada como débito automático (CS8), propone registrarla como pagada en la fecha de vencimiento con el medio habitual.

CS4.6 Formatos argentinos: fechas dd/mm/aaaa, montos con punto de miles y coma decimal; "48.000,00", "48000" y "$ 48.000" se normalizan al mismo valor en centavos (igual que FP3.4).

CS4.7 Validaciones (advertencias, no bloqueos): monto mayor a 0; vencimiento no anterior a la emisión; vencimiento ya pasado ("Esta factura venció el 05/10"); monto más de 50% por encima o por debajo del promedio de los últimos 3 períodos de esa cuenta ("Es 62% más que el promedio"); CUIT con dígito verificador inválido.

CS4.8 Hasta confirmar, la factura es un borrador: no aparece en la caja ni en los totales del panel (solo en la bandeja "Por confirmar"). Los borradores se recuerdan una vez a las 24 h y, si tienen vencimiento, también 2 días antes de vencer; a los 30 días pasan a "Sin confirmar", sin efecto.

CS4.9 Los mensajes respetan la ventana de 24 h del PRD del bot: si está cerrada, el aviso de factura detectada usa la plantilla de utilidad consumo_detectado [a aprobar por Meta]; el resto de la conversación usa mensajes interactivos. También se puede confirmar desde la web (bandeja "Por confirmar").

CS4.10 Si se detectan varias facturas a la vez (por ejemplo, en la conexión inicial con 90 días de historial), el bot no manda un mensaje por factura: manda un resumen ("Encontré 7 facturas de servicios de los últimos 3 meses") con [Revisar en la web] [Ver una por una], y las anteriores al mes en curso se pueden confirmar en lote desde la web.

### Criterios de aceptación:

☐ Llega por email la factura de luz de $48.000 que vence el 20/10 y recibo por WhatsApp "Luz · Edenor · Cuenta 1234567 · $48.000 · Vence 20/10" con [Confirmar] [Editar] [Descartar]; toco "Confirmar" y queda confirmada con un toque.

☐ El OCR leyó $84.000 en lugar de $48.000; toco "Editar" → "Monto", escribo 48000 y el bot me muestra el resumen corregido para confirmar.

☐ Un campo leído con confianza media aparece con "⚠ revisá".

☐ Ninguna factura genera un egreso, un vencimiento ni una orden de pago sin que alguien toque "Confirmar".

☐ En la conexión inicial, con 7 facturas detectadas, recibo un solo mensaje de resumen y no 7 mensajes.

☐ Una factura de gas un 62% más cara que el promedio de los últimos 3 períodos muestra la advertencia antes de confirmar.

### CS5. Registro en la caja bajo la categoría del servicio (P0)

Descripción: al confirmar, la factura impacta en la caja según su estado de pago, con las reglas del PRD de caja (inmutabilidad, centavos, transacción única, idempotencia).

### Requerimientos:

CS5.1 Ya pagada ([Ya la pagué]): el bot pide el medio de pago (Efectivo, Débito, Mercado Pago, Transferencia bancaria; precargado con el medio habitual de la cuenta) y la fecha de pago (por defecto hoy). Se genera un egreso en la caja (C3) con la categoría del tipo de servicio (CS2.1), origen consumo_servicio, referencia a la factura de servicio y nota automática ("Edenor · Cuenta 1234567 · Vto. 20/10").

CS5.2 Pendiente ([Pendiente]): se crea un vencimiento en la agenda de la caja (C9, cash_due_items) con concepto, categoría, monto (el de la factura, no estimado), fecha de vencimiento y medio habitual, vinculado a la factura. Aparece en "Próximos vencimientos" y dispara los avisos de C9.4 / C10.2.

CS5.3 Al pagar un vencimiento creado desde una factura ("Registrar pago" de C9.3, o [Ya la pagué] desde el aviso del bot), el egreso queda vinculado al vencimiento y a la factura, y la factura pasa a Pagada.

CS5.4 La confirmación de la factura y la creación del egreso o del vencimiento ocurren en una misma transacción de la base del comercio, con idempotency_key derivada de la factura (doble toque, reintentos del bot o de la cola offline no duplican).

CS5.5 Reversión: si se revierte el egreso en la caja (C7), la factura vuelve a Pendiente y, si tenía vencimiento, este vuelve a "pendiente", en la misma transacción.

CS5.6 Si el dueño ya había cargado ese gasto a mano en la caja (egreso de la misma categoría, monto igual o parecido, en los últimos 10 días), el bot lo sugiere: "¿Es este egreso que ya cargaste? Luz $48.000 del 18/10" [Sí, vincular] [No, es otro]. Con "Sí, vincular", la factura se asocia al egreso existente sin crear uno nuevo.

CS5.7 Si el dueño ya tenía un vencimiento cargado a mano para ese servicio y mes, se ofrece reemplazar el monto estimado por el de la factura (registrado en la auditoría de la caja) en lugar de crear otro.

CS5.8 Los empleados sin permiso de egresos en esas categorías solo pueden dejar la factura como Pendiente.

### Criterios de aceptación:

☐ Confirmo la factura de luz con [Ya la pagué] por Mercado Pago y la caja muestra el egreso "Luz — Edenor — Cuenta 1234567, $48.000, Mercado Pago"; el saldo de Mercado Pago baja $48.000.

☐ Confirmo la boleta de tasas municipales con [Pendiente] y aparece en "Próximos vencimientos" con su fecha y monto; tres días antes recibo el aviso por WhatsApp (C10.2).

☐ Toco "Registrar pago" en ese vencimiento y la factura queda "Pagada" con el egreso vinculado.

☐ Revierto el egreso y la factura vuelve a "Pendiente" con su vencimiento activo.

☐ Toco dos veces "Confirmar" muy rápido y se crea un solo egreso.

☐ Si ya había cargado a mano "Luz $48.000", el bot me propone vincular y no se duplica el gasto.

☐ El monotributo confirmado como pagado aparece en el reporte del mes dentro de Impuestos y desglosado como ARCA.

### CS6. Integración con órdenes de pago (P0 básico, según el PRD de órdenes de pago)

Descripción: para una factura pendiente, el bot puede preparar una orden de pago con el modelo del PRD de órdenes de pago (OP2, OP5). Rige el principio "el bot prepara, el comerciante paga" (OP1): el sistema no ejecuta pagos y no pide ni guarda credenciales de bancos, Mercado Pago, ARCA (clave fiscal) ni empresas de servicios.

### Requerimientos:

CS6.1 Una factura de servicio confirmada como Pendiente crea un vencimiento en la caja (CS5.2); ese vencimiento es la fuente de la orden según OP5 del PRD de órdenes de pago (tipo luz / gas / servicios / impuestos, con su categoría de egreso). Además, el Dueño puede pedirla en el momento: [Orden de pago] en la confirmación, en el aviso de vencimiento o en la ficha de la factura (web).

CS6.2 La factura aporta a la orden los datos confirmados: beneficiario (la cuenta de servicio se vincula a un beneficiario payees del PRD de órdenes de pago, tipo servicio o impuesto), concepto, monto real (no estimado), vencimiento, referencia (número de cuenta/cliente/partida, período y, si se leyó, código de pago electrónico) y medio sugerido (el habitual de la cuenta). El resto (estados, revisión con [Confirmar] [Editar] [Cancelar], entrega de la instrucción, "Ya pagué") lo define el PRD de órdenes de pago.

CS6.3 Con el monto y el vencimiento de la factura, la orden puede nacer en Lista para pagar; si falta un dato obligatorio (por ejemplo, la página oficial de pago del beneficiario), queda en Borrador con el faltante indicado (OP2.2).

CS6.4 Links de pago: la instrucción usa solo la página oficial de pago del beneficiario elegida de la allowlist (OP6.2, OP8). Un link o QR que venga en la factura o en el email no se envía si su dominio no está en la allowlist (OP8.5) y nunca reemplaza datos de cobro de la ficha (OP3.5).

CS6.5 ARCA: el VEP lo genera el propio comerciante con su clave fiscal; el bot no accede a ARCA (OP5.4). Si la boleta de ARCA llega por email, sus datos alimentan el recordatorio y la orden.

CS6.6 Al marcar la orden Pagada ("Ya pagué", OP9), en una misma transacción quedan: el egreso en la caja con la categoría del tipo de servicio, el vencimiento "pagado" con movimiento_pago_id y la factura de servicio Pagada con el mismo cash_movement_id. Nunca se crean dos egresos para la misma factura (una orden activa por vencimiento, OP2.6, más la idempotencia de CS5.4).

CS6.7 Si la factura se anula (CS11), la orden activa se cancela con motivo "factura anulada"; si se revierte el egreso (C7), la orden vuelve a Enviada al comerciante o Vencida (regla de reversión del PRD de órdenes de pago) y la factura a Pendiente.

CS6.8 Las cuentas con débito automático no generan orden con instrucción de pago; como en OP5.4, se puede crear un recordatorio de control ("verificá que se debitó").

### Criterios de aceptación:

☐ Desde la factura de gas pendiente toco "Orden de pago" y se crea una orden "Lista para pagar" por el monto y el vencimiento de la factura, con el número de cliente como referencia, vinculada a la factura y a su vencimiento.

☐ Toco [Ya pagué] y confirmo Transferencia bancaria: la caja muestra un solo egreso en Gas, y la orden, el vencimiento y la factura quedan pagados y vinculados a ese egreso.

☐ Si el email de la factura trae un link de pago de un dominio fuera de la allowlist, el bot no me lo manda.

☐ No existe ningún campo, pantalla ni configuración donde se pidan usuario, clave, token, clave fiscal ni credenciales del banco, de Mercado Pago o de la empresa de servicios.

☐ No puedo crear dos órdenes activas para la misma factura ni para su vencimiento.

### CS7. Panel de consumos (web) (P0)

Descripción: pantalla "Consumos" (menú Caja → Consumos de servicios) con todos los gastos de servicios del comercio.

### Requerimientos:

CS7.1 Resumen del período (selector: este mes, mes anterior, últimos 3/6/12 meses, año, rango personalizado): total de servicios, total por tipo de servicio, pendiente de pago y vencido.

CS7.2 Tarjeta por tipo de servicio: último monto, próximo vencimiento, estado (pagada / pendiente / vencida) y variación contra el período anterior (▲ 18% en rojo, ▼ 5% en verde).

CS7.3 Comparación mes contra mes: tabla con los últimos 12 meses en columnas y los tipos de servicio en filas, con total por mes y variación porcentual. Los servicios bimestrales (luz y gas en muchas distribuidoras) se muestran según el criterio de imputación (CS7.6).

CS7.4 Gráficos: barras apiladas por mes y tipo de servicio; línea por servicio con su evolución; barras horizontales con la participación de cada servicio en el total del período. Accesibles (buen contraste, valores en tooltip y en tabla).

CS7.5 Historial: lista de facturas con filtros por tipo, cuenta, estado, origen (email / WhatsApp / web) y período; cada fila con fecha, proveedor, monto, vencimiento, estado y acceso al comprobante y al movimiento de caja.

CS7.6 Criterio de imputación: en el MVP los totales se calculan por fecha de emisión de la factura (alternativa: por fecha de pago, que es lo que muestra la caja). En P1, si se leyó el período facturado, se puede ver "por período de consumo" con prorrateo de bimestres. La pantalla indica siempre qué criterio usa.

CS7.7 Los totales se calculan desde las facturas confirmadas (no anuladas); un indicador muestra la conciliación con la caja ("Pagado según la caja en el período: $X") para detectar diferencias.

CS7.8 Exportación CSV/Excel del período filtrado con enlaces a los comprobantes (P0); reporte PDF mensual (P1, junto con el reporte mensual de C11.4).

CS7.9 (P1) Alerta de aumento anómalo cuando una factura supera en más de X% (configurable, por defecto 40%) el promedio de los últimos 3 períodos de la cuenta. (P1) Consumo por unidad (kWh, m³) y costo por unidad.

CS7.10 Solo el Dueño ve el panel por defecto (configurable para empleados, igual que los saldos de C6.6).

### Criterios de aceptación:

☐ Con facturas de luz, gas, internet y ARCA confirmadas en septiembre y octubre, el panel de "Este mes" muestra el total por tipo y la variación contra septiembre.

☐ La tabla de 12 meses suma exactamente, al centavo, el total de cada mes y el total general.

☐ El gráfico de barras apiladas muestra un color por tipo de servicio y, al tocar una barra, el monto exacto.

☐ Filtro "Pendientes" y veo solo las facturas no pagadas, con las vencidas en rojo.

☐ Desde una fila del historial abro el comprobante y el egreso de la caja.

☐ El export del período coincide al centavo con el total de la pantalla.

☐ Un empleado sin permiso no ve el panel.

### CS8. Cuentas de servicio (P0)

Descripción: cada combinación proveedor + número de cuenta/cliente es una cuenta de servicio (por ejemplo, "Luz · Edenor · Cuenta 1234567"), que agrupa sus facturas y guarda preferencias.

### Requerimientos:

CS8.1 La cuenta se crea automáticamente al confirmar la primera factura con un proveedor y número de cuenta nuevos (sugerencia confirmada junto con la factura).

CS8.2 Datos: tipo de servicio, proveedor, número de cuenta/cliente/partida, alias ("Luz del local"), remitentes de email asociados, medio de pago habitual, débito automático (sí/no), beneficiario vinculado para órdenes de pago (payees, CS6.2), activa.

CS8.3 Se guardan solo los datos necesarios para identificar la cuenta; no se copian a la base el domicilio de suministro ni el titular (quedan solo en el comprobante).

CS8.4 Desde la web el dueño edita alias, medio habitual y débito automático, y puede desactivar una cuenta (sus facturas se conservan).

### Criterios de aceptación:

☐ Confirmo la primera factura de internet y se crea la cuenta "Internet · Telecom · Cliente 998877"; la del mes siguiente se asocia sola a esa cuenta.

☐ Marco la cuenta de luz como débito automático y las facturas siguientes me proponen registrarlas como pagadas con el medio habitual.

### CS9. Detección de duplicados (P0)

Descripción: la misma factura puede llegar dos veces (reenvío del email, recordatorio de la empresa, foto de la boleta en papel además del PDF). Se evita registrarla y pagarla dos veces.

### Requerimientos:

CS9.1 Mismo mensaje: el id de mensaje de Gmail (y el id del adjunto) se procesa una sola vez (restricción única); igual con el wamid de WhatsApp (FP1.5 del PRD de facturas).

CS9.2 Mismo archivo: hash exacto (SHA-256) del PDF o de la imagen, y hash perceptual de la imagen renderizada → "Esta factura ya está cargada (Luz, $48.000, Pagada)".

CS9.3 Duplicado seguro: misma cuenta de servicio + mismo número de comprobante (o mismo código de pago) → no se permite confirmar de nuevo (restricción única en la base).

CS9.4 Posible duplicado: misma cuenta + mismo monto + vencimiento a ±5 días, o misma cuenta + mismo período facturado → advertencia con [Es otra factura] [Es la misma].

CS9.5 Entre canales: la detección se aplica igual si una factura llega por email y otra por foto al bot.

CS9.6 Recordatorios y segundas emisiones: un "recordatorio de vencimiento" o la misma factura con segundo vencimiento se asocia a la factura existente (sin crear una nueva) y, si cambia el monto por recargo, se le pregunta al dueño si actualiza el vencimiento pendiente.

CS9.7 Las facturas anuladas no cuentan para la detección.

### Criterios de aceptación:

☐ Reenvío a mi propio email la factura de gas ya cargada y el sistema no crea un borrador nuevo.

☐ Mando al bot la foto de la boleta de tasas que ya llegó por email y me dice que ya está cargada, con la original.

☐ Un recordatorio de vencimiento de la misma factura no genera un segundo vencimiento en la caja.

☐ Una factura del mismo monto y cuenta del mes anterior (período distinto) no se marca como duplicada.

### CS10. Carga manual por el bot (fallback) (P0)

Descripción: si el dueño no conectó el email, la factura llegó en papel o el sistema no la detectó, manda la foto o el PDF al bot de WhatsApp y sigue el mismo flujo.

### Requerimientos:

CS10.1 El bot acepta imágenes (JPEG/PNG) y documentos PDF; un texto acompañante ("luz", "ABL", "monotributo") sirve como pista del tipo de servicio.

CS10.2 El bot distingue si el comprobante es una factura de proveedor de mercadería (flujo del PRD de facturas) o una factura de servicio (este PRD). Si no está seguro, pregunta: [Servicio] [Proveedor] [Otro].

CS10.3 Después de clasificar, el flujo es idéntico: Google Photos (CS3), sugerencia y confirmación (CS4), caja (CS5), orden de pago opcional (CS6), duplicados (CS9).

CS10.4 Acuse en menos de 3 segundos y resultado en menos de 20 segundos (igual que FP1.4).

CS10.5 (P1) Carga desde la web (subir archivo) con el mismo flujo.

### Criterios de aceptación:

☐ Sin email conectado, mando la foto de la boleta de ABL y el bot me propone "Tasas municipales · $23.400 · Vence 15/10" para confirmar.

☐ Reenvío al bot el PDF de la factura de internet que me llegó a otra casilla y queda registrada igual que si se hubiera detectado en el email.

☐ Mando la foto de una factura de una distribuidora de golosinas y el bot la deriva al flujo de facturas de proveedores.

### CS11. Inmutabilidad, anulación y auditoría (P0)

### Requerimientos:

CS11.1 Una factura de servicio confirmada no se edita ni se borra; los errores se corrigen anulándola (motivo obligatorio) y cargando una nueva, igual que FP10 del PRD de facturas.

CS11.2 Al anular una factura pagada, se revierte su egreso en la caja (C7); si tenía vencimiento, se marca "descartado"; si tenía orden de pago activa, se cancela según el PRD de órdenes de pago.

CS11.3 Log de auditoría: mensaje detectado (solo id, dominio del remitente y fecha; sin contenido), clasificación y confianza, datos sugeridos y confirmados, confirmación, vínculos con caja y órdenes de pago, anulaciones, conexiones y desconexiones de Gmail y Google Photos, cambios de filtros y remitentes; con usuario, origen (email / bot / web), fecha y hora.

CS11.4 Solo el Dueño anula facturas.

### Criterios de aceptación:

☐ No existe botón ni endpoint para editar o borrar una factura de servicio confirmada (tests automáticos).

☐ Anulo una factura pagada con motivo "era del mes pasado" y en la caja aparece la reversión de su egreso.

☐ En la auditoría veo que el OCR sugirió $84.000 y confirmé $48.000.

### CS12. Avisos (P0 básicos / P1)

### Requerimientos:

CS12.1 (P0) Factura detectada: mensaje de sugerencia de CS4 (plantilla consumo_detectado si la ventana de 24 h está cerrada) [a aprobar por Meta].

CS12.2 (P0) Vencimiento próximo y del día: los emite la caja (C10.2) a partir del vencimiento creado; incluyen [Ya la pagué] [Orden de pago] cuando la ventana permite mensajes interactivos.

CS12.3 (P0) Factura sin confirmar: un recordatorio a las 24 h y otro 2 días antes del vencimiento (CS4.8).

CS12.4 (P0) Conexión caída: token de Gmail revocado o vencido, o Google Photos desconectado: aviso con link a la web.

CS12.5 (P1) Resumen mensual de consumos el primer día hábil del mes (total del mes anterior por servicio y variación) y alerta de aumento anómalo (CS7.9).

CS12.6 Los avisos respetan el opt-in, el opt-out ("BAJA"), los horarios de silencio y las preferencias del PRD del bot (B2), y van solo al Dueño (y a quien él autorice).

### Criterios de aceptación:

☐ Con la ventana cerrada, recibo la plantilla de factura detectada y, al tocar un botón, la conversación sigue con mensajes interactivos.

☐ Si dejo una factura sin confirmar, recibo un solo recordatorio a las 24 h.

☐ Si revoco el acceso a Gmail desde Google, recibo el aviso de conexión caída al día siguiente como máximo.

## 5. Flujos de usuario

### Flujo 1: conexión del email (opt-in)

El dueño entra en la web a Configuración → Consumos de servicios y toca "Conectar mi email".

Lee la pantalla de consentimiento (qué se lee, qué se guarda, cómo desconectar), marca "Autorizo leer las facturas de servicios de mi email" y continúa.

Google le muestra el pedido de permiso de solo lectura; acepta.

La web muestra la lista de remitentes por defecto (luz, gas, agua, internet, teléfono, ARCA, municipios) y le ofrece agregar los suyos. Elige buscar facturas de los últimos 90 días.

Si todavía no conectó Google Photos, la web se lo ofrece (consentimiento separado).

A los pocos minutos, el bot le escribe:

Bot: Listo, conecté tu email. Encontré 7 facturas de servicios de los últimos 3 meses:

Luz (2) · Gas (1) · Internet (3) · ARCA (1).

Las de meses anteriores las podés confirmar todas juntas en la web.

[Revisar en la web] [Ver una por una]

### Flujo 2: factura de luz detectada en el email → confirmación en un toque → vencimiento pendiente

Bot: 📄 Llegó una factura de servicio a tu email:

Luz · Edenor · Cuenta 1234567

Emitida: 08/10/2026 · Vence: 20/10/2026

Total: $48.000,00

La guardé en Google Photos (álbum "Consumos – Luz").

[Confirmar] [Editar] [Descartar]

Dueño: (toca Confirmar)

Bot: ¿Ya la pagaste?

[Ya la pagué] [Pendiente] [Orden de pago]

Dueño: (toca Pendiente)

Bot: Listo. Quedó en próximos vencimientos de la caja: Luz $48.000, vence el martes 20/10. Te aviso 3 días antes.

### Flujo 3: corrección de un dato leído

Bot: 📄 Factura de servicio:

Gas · Metrogas · Cuenta 556677

Vence: 22/10/2026 · Total: $84.300,00 ⚠ revisá

[Confirmar] [Editar] [Descartar]

Dueño: (toca Editar → Monto)

Dueño: 48300

Bot: Corregido:

Gas · Metrogas · Cuenta 556677 · Vence 22/10 · Total $48.300,00

[Confirmar] [Editar] [Descartar]

Dueño: (toca Confirmar → Ya la pagué → Mercado Pago)

Bot: Registré el egreso en la caja: Gas $48.300 por Mercado Pago.

### Flujo 4: aviso de vencimiento → orden de pago → pago por fuera → registro en la caja

Tres días antes del vencimiento de la boleta de tasas municipales (cargada desde el email y confirmada como Pendiente), el bot presenta la orden preparada según el PRD de órdenes de pago:

Bot: ⏰ Pago para revisar — vence en 3 días

Municipalidad · Tasas municipales (ABL) · Partida 12-345

Período: octubre · $23.400 · Vence 15/10

Medio sugerido: Transferencia bancaria

[Confirmar] [Editar] [Cancelar]

Dueño: (toca Confirmar)

Bot: Para pagar la tasa:

Página oficial de pago: https://<sitio-oficial-del-municipio>

Partida:

12-345

Monto:

23400

Pagás vos desde tu app. Nunca te voy a pedir claves ni códigos.

[Ya pagué] [Más tarde] [Cancelar]



El dueño paga desde su home banking (el bot no interviene en el pago).

Vuelve al chat, toca [Ya pagué], confirma monto, medio (Transferencia bancaria) y fecha.

En una misma transacción: la orden pasa a Pagada, el vencimiento a "Pagado", la factura de servicio a "Pagada" y la caja registra un único egreso en Impuestos > Tasas municipales.

### Flujo 5: monotributo (ARCA) con débito automático

Bot: 📄 Llegó una boleta de ARCA a tu email:

ARCA · Monotributo octubre · CUIT 20-12345678-9

Vence: 20/10/2026 · Total: $41.200,00

Esta cuenta está en débito automático.

[Confirmar] [Editar] [Descartar]

Dueño: (toca Confirmar)

Bot: ¿La registro como pagada el 20/10 por Transferencia bancaria (débito automático)?

[Sí] [Pendiente] [Otro medio]

Dueño: (toca Sí)

Bot: Listo: egreso Impuestos > ARCA $41.200 registrado con fecha 20/10.



Si el débito automático no se hizo (por ejemplo, por falta de fondos), el dueño revierte el egreso desde la caja (C7) y la factura vuelve a Pendiente.

### Flujo 6: carga manual por foto (sin email conectado)

Dueño: (manda la foto de la boleta de agua) "agua"

Bot: Recibí la boleta, la estoy leyendo…

Bot: 📄 Agua · AySA · Cuenta 7788990

Emitida: 01/10/2026 · Vence: 17/10/2026

Total: $19.850,00

[Confirmar] [Editar] [Descartar]

Dueño: (toca Confirmar → Pendiente)

Bot: Quedó en próximos vencimientos: Agua $19.850, vence el 17/10.

Tip: si conectás tu email desde la web, estas facturas se cargan solas.

### Flujo 7: duplicado entre canales

Dueño: (manda la foto de la factura de internet)

Bot: Esta factura ya está cargada: Internet · Telecom · Cliente 998877 · $32.500 · vence 18/10 (llegó por email el 06/10, Pendiente).

[Ver factura] [Es otra factura]

### Flujo 8: consulta del panel de consumos

A fin de mes, el dueño entra a Caja → Consumos de servicios.

Ve el total de octubre ($231.250), la tarjeta de Luz con "▲ 18% vs. septiembre" en rojo y la de Internet sin cambios.

Cambia a "Últimos 12 meses" y ve el gráfico de barras apiladas: los meses de invierno tienen más gas.

Toca la fila de Luz en la tabla mes contra mes, abre la factura de octubre y ve el comprobante desde Google Photos.

### Flujo 9: desconexión del email

Dueño: desconectar email

Bot: ¿Querés que deje de leer las facturas de tu email? Las facturas ya cargadas se mantienen.

[Sí, desconectar] [Cancelar]

Dueño: (toca Sí, desconectar)

Bot: Listo, desconecté tu email y revoqué el acceso en Google. Podés seguir mandándome fotos de las facturas cuando quieras.



## 6. Notas técnicas

### 6.1 Principios

Mismo backend, misma lógica: el módulo usa la misma API/capa de servicios que la web Astro, el bot y la caja (Zod, Drizzle, transacciones). El bot no tiene reglas de negocio propias.

Una base de datos por cliente, como ModoOps, más la base de control: facturas, cuentas de servicio, conexiones y logs de ingesta viven en la base del comercio (sin tenant_id). En la base de control solo vive lo necesario para enrutar las notificaciones de Gmail a la base correcta y el catálogo global de remitentes.

Mínimo acceso y mínimo dato: filtrar en la consulta a la API, descargar solo lo filtrado, guardar solo lo que corresponde a una factura.

Nada se registra sin confirmación (patrón del PRD de facturas).

### 6.2 Modelo de datos

Relaciones clave: utility_bills 1 → 0..1 cash_due_items (si quedó pendiente); 1 → 0..1 cash_movements (egreso del pago, que también referencia al vencimiento y a la orden si existen); 1 → 0..1 payment_orders activa. Índices únicos: gmail_message_id + gmail_attachment_id, wamid, archivo_sha256 (facturas no anuladas), service_account_id + numero_comprobante (no anuladas), idempotency_key.

Reglas de integridad: montos en centavos enteros (bigint), nunca float (6.3 del PRD de caja); facturas confirmadas inmutables (trigger que rechaza UPDATE de campos confirmados y todo DELETE; solo se permiten los cambios de estado a anulada y de estado_pago dentro de las transacciones del dominio); confirmación + egreso/vencimiento en una misma transacción; restricción que impide estado_pago = pagada sin cash_movement_id cuando la caja está activa.

### 6.3 Pipeline de ingesta

Gmail del dueño ──(users.watch → Cloud Pub/Sub push)──► Webhook de ingesta (Hono, TypeScript)

│                                                     │

└──(fallback: polling con history.list cada 15 min)───┤

├─ resuelve dirección → tenant (base de control: gmail_watch_routes)

└─ encola un job por comercio (pg-boss / Inngest)

│

Job de ingesta (en la base del comercio)  ◄────────────────────────────┘

1. history.list desde gmail_history_id → ids de mensajes nuevos

2. consulta con filtros (remitentes / dominios / etiqueta) → solo ids que pasan

3. descarta ids ya vistos (email_ingestion_log)

4. pide encabezados; si la capa 1 no descarta, descarga cuerpo y adjuntos (PDF / imagen)

5. clasificación (reglas → modelo) ──► no es factura: log mínimo y fin (sin guardar contenido)

6. extracción (texto del PDF → OCR → cuerpo) + validaciones

7. detección de duplicados (CS9)

8. guardado: original en almacenamiento de objetos; render JPEG → Google Photos (álbum del tipo)

9. borrador en utility_bills + evento consumo_detectado en notification_events (outbox)

10. el bot de WhatsApp envía la sugerencia → confirmación → transacción con caja / orden de pago



Notificaciones push de Gmail: users.watch con un tópico de Cloud Pub/Sub; la notificación trae la dirección de email y un historyId, no el contenido [fuente: Google; a verificar detalles]. El watch vence y debe renovarse al menos cada 7 días (job diario de renovación) [a verificar]. Polling como respaldo si el push falla.

Filtro en la API: la consulta usa el parámetro de búsqueda de Gmail (from: por remitente o dominio, label: si se eligió etiqueta, newer_than: en la carga inicial) para que el backend no descargue mensajes fuera del filtro. El filtro se arma desde email_ingestion_filters.

Lectura mínima: primero los encabezados (remitente, asunto, fecha); el cuerpo y los adjuntos solo si la capa 1 no descarta el mensaje.

Procesamiento en memoria: el contenido del email se procesa en memoria del worker; solo se persiste lo que corresponde a una factura. Los temporales se borran al terminar el job.

OCR: texto embebido del PDF con pdf.js/poppler; OCR para imágenes con un motor gestionado (Google Cloud Vision, AWS Textract, Azure Document Intelligence) o un modelo multimodal con salida estructurada [a verificar costo, precisión en facturas argentinas y residencia de datos]; mismo componente que el PRD de facturas.

Render de PDF: primera página (hasta 3) a JPEG de 150-200 dpi, comprimido, para Google Photos y la vista previa.

Plantillas por emisor (P1): reglas de extracción específicas para los emisores más frecuentes (posición del total, formato del número de cuenta, código de pago).

Idempotencia y orden: gmail_message_id, wamid e idempotency_key de confirmación; procesamiento secuencial por comercio para evitar carreras entre push y polling.

Carga por WhatsApp (CS10): entra por el webhook del bot (PRD del bot 6.2), descarga el media de la Cloud API y se une al pipeline en el paso 5.

Costos: OCR/modelo por factura y mensajes de WhatsApp por aviso (PRD del bot 6.4) se miden por comercio en el Control Plane.

Migraciones: mismo runner del PRD principal (base de control + todas las bases de clientes).

### 6.4 Integración con caja, bot y órdenes de pago

Las transacciones de confirmación (factura → egreso o vencimiento) usan las funciones de dominio de la caja (no inserts directos), para mantener categorías, centavos, idempotencia y auditoría en un solo lugar.

Los avisos salen por el outbox de la caja (notification_events) y los entrega el bot según el PRD del bot (plantillas, ventana de 24 h, opt-in).

Las órdenes de pago se crean con el servicio del PRD de órdenes de pago (OP5: a partir del vencimiento de la caja); este módulo aporta los datos confirmados de la factura y su comprobante, y la transacción de "Ya pagué" (OP9) marca también la factura de servicio como Pagada con el mismo egreso. El origen del egreso (consumo_servicio u orden_pago) se unifica con la pregunta abierta 1 del PRD de órdenes de pago.

El bot nunca accede directo a la base del comercio: llama a la API con un token de corta duración del usuario vinculado (PRD del bot 6.2).

### 6.5 Rendimiento y calidad

Del email recibido al aviso por WhatsApp: menos de 5 minutos con push (menos de 20 minutos con polling).

Panel de consumos: carga inicial menor a 1 s con 5 años de facturas (agregados por mes y tipo con índices o vista materializada, verificada contra las facturas).

Tests: corpus de facturas reales anonimizadas de los principales emisores (meta: más de 95% de clasificación correcta y más de 85% de monto y vencimiento correctos sin edición); tests que verifican que los mensajes descartados no dejan contenido en la base ni en logs; tests de aislamiento entre comercios (una notificación de Gmail del comercio A nunca escribe en la base del comercio B); tests de que no hay UPDATE/DELETE sobre facturas confirmadas; tests end-to-end (Playwright) de los flujos 2, 4 y 6.

### 6.6 Retención

Comprobantes y datos de facturas confirmadas: mientras el comercio esté activo (son datos del comercio; se exportan o eliminan con su base, Ley 25.326).

Original en el almacenamiento del producto: se conserva aunque esté en Google Photos (la app no puede recuperar una foto que el dueño borró); retención configurable, por defecto 5 años [a verificar criterio contable y legal].

Borradores descartados o vencidos: comprobante borrado a los 30 días; queda solo el registro mínimo para no reprocesar.

email_ingestion_log: 12 meses.

## 7. Seguridad y privacidad

Consentimiento explícito y separado: Gmail y Google Photos se conectan por separado, desde la web, con texto de consentimiento versionado y registrado. Sin consentimiento no hay lectura.

Mínimo privilegio: scope de solo lectura de Gmail; ningún scope de envío, modificación ni borrado. Filtros por remitente/etiqueta aplicados en la consulta a la API. Solo se pide lo que la funcionalidad necesita, y así se documenta en la verificación de Google.

No guardar emails no relacionados: los mensajes que no son facturas de servicios no se guardan (ni asunto, ni cuerpo, ni adjuntos); solo su id y el dominio del remitente para no reprocesarlos. Los contenidos nunca van a logs, Sentry ni métricas.

Uso limitado de los datos: los datos de Gmail se usan solo para detectar y registrar facturas de servicios del propio comercio; no se usan para publicidad, no se venden, no se usan para entrenar modelos generales y no se comparten con terceros salvo los subprocesadores necesarios (OCR/modelo), declarados en la política de privacidad, en línea con la Google API Services User Data Policy y sus requisitos de uso limitado [a verificar texto vigente].

Sin lectura humana por defecto: nadie del equipo lee emails ni comprobantes de un comercio, salvo consentimiento explícito del dueño para soporte, con registro (mismo criterio de acceso auditado del PRD principal), o por obligación legal.

Tokens: refresh tokens cifrados en la base del comercio con una clave del gestor de secretos/KMS; nunca en logs; rotación de claves; los workers obtienen el token solo durante el job.

Revocación completa: la desconexión desde la web o el bot revoca el token en Google, detiene el watch y borra el token y la ruta en la base de control. Detección de revocación externa (invalid_grant).

Sin credenciales de pago: el sistema no pide ni almacena usuario, clave ni token de bancos, Mercado Pago, ARCA (clave fiscal) ni empresas de servicios; las órdenes de pago son solo links oficiales o datos para que el dueño pague desde su app (OP1 del PRD de órdenes de pago). La conexión de Gmail es de solo lectura y no da acceso a ninguna cuenta de pago.

Aislamiento: una base por cliente; la base de control solo guarda el hash de la dirección de Gmail para enrutar; tests de aislamiento en CI.

Seguridad del contenido: los adjuntos se procesan en un worker aislado (salida de red solo a las APIs necesarias), con límite de tamaño y tipo; el HTML del email se sanea antes de renderizarlo; no se siguen links del email.

Permisos por rol aplicados en el backend (empleados sin acceso al panel ni a las conexiones).

Datos personales: Ley 25.326 (número de cuenta, CUIT, domicilio que pueda aparecer en el comprobante); actualización de términos y política de privacidad; derechos de acceso y supresión (exportar o borrar la base del comercio y revocar conexiones).

Auditoría de conexiones, desconexiones, cambios de filtros, confirmaciones y anulaciones.

## 8. Riesgos y preguntas abiertas

### 8.1 Riesgos

### 8.2 Preguntas abiertas

Verificación de Google: ¿cuál es hoy el costo y el plazo de la evaluación CASA para gmail.readonly y qué nivel nos corresponde? ¿Conviene lanzar primero con la dirección de reenvío (CS1.8) y sumar OAuth después? ¿Existe un scope más acotado que permita leer adjuntos de mensajes filtrados? (gmail.metadata no da acceso al cuerpo ni a los adjuntos y también es restringido [a verificar].)

PDF y Google Photos: ¿alcanza con subir a Google Photos la imagen de la primera página y guardar el PDF en nuestro almacenamiento, o conviene guardar los PDF en el Google Drive del comercio (scope drive.file [a verificar clasificación y verificación requerida])? ¿Cómo lo perciben los dueños ("¿dónde está mi factura?")?

Cambios 2025 de la Google Photos Library API: ¿qué scopes siguen disponibles para crear álbumes y subir medios, qué cuotas aplican y qué verificación requiere la app? (Compartida con el PRD de caja y el PRD de facturas.)

Subcategorías de la caja: ¿se agregan Servicios > Agua, Servicios > Internet y Servicios > Teléfono como subcategorías predefinidas en el PRD de caja (hoy son ejemplos dentro de "Servicios"), o se usa solo "Servicios" y el desglose lo da el tipo de servicio?

Criterio de imputación del panel: ¿por fecha de emisión (MVP), por fecha de pago (como la caja) o por período de consumo con prorrateo de bimestres?

Órdenes de pago: ¿la orden de un servicio se crea siempre al entrar el vencimiento en la ventana de anticipación (OP11) o solo cuando el Dueño la pide? ¿Qué origen lleva el egreso en la caja cuando se paga por orden (consumo_servicio u orden_pago, pregunta abierta 1 del PRD de órdenes de pago)?

Catálogo de remitentes: ¿quién lo mantiene y con qué cobertura inicial (AMBA, Córdoba, Rosario)? ¿Cómo se manejan los municipios, cada uno con su dominio?

ARCA: ¿qué llega realmente por email (VEP, aviso de vencimiento, constancia) y qué está solo en el sitio de ARCA? ¿Alcanza con la carga por foto o PDF para el monotributo?

Carga inicial: ¿90 días por defecto es lo correcto? ¿Las facturas viejas ya pagadas se registran como egresos con fecha anterior (afectando los saldos acumulados de la caja, C6.2) o solo cuentan para el panel de consumos?

Varias casillas: ¿cuántos dueños reciben las facturas en más de un email? ¿Hace falta en el MVP?

Empleados: ¿pueden cargar boletas por foto por defecto?

Plan: ¿el módulo va en todos los planes o es diferencial del plan Pro (por el costo de OCR y de la verificación)?

Legal: textos de consentimiento, política de privacidad y declaración de uso limitado para Google.

Decisiones tomadas: acceso de solo lectura con opt-in explícito y filtros; nada se registra sin confirmación; el bot prepara órdenes de pago pero nunca paga ni guarda credenciales bancarias o de Mercado Pago; comprobantes en el Google Photos del comercio con la misma conexión que la caja y las facturas de proveedores; montos en centavos enteros; facturas confirmadas inmutables con anulación; una base de datos por cliente más base de control, como ModoOps.

## 9. Plan por fases

### Fase 0: validación y trámites (semanas 1 y 2)

Entrevistas con 5 a 8 dueños: qué servicios pagan, cómo les llegan las facturas (email, papel, app), cuántas casillas usan, qué tan cómodos se sienten conectando el email.

Corpus de 100 a 200 facturas reales anonimizadas (luz, gas, agua, internet, teléfono, tasas, ARCA) para el clasificador y el OCR.

Inicio de la verificación de la app OAuth de Google (marca, política de privacidad, uso limitado, video de demostración) y cotización de la evaluación CASA; confirmación de scopes vigentes de Gmail y Google Photos (todo lo marcado [a verificar]).

Acordar con el PRD de caja las subcategorías y la extensión de cash_due_items, y con el PRD de órdenes de pago la interfaz de creación y cierre de órdenes.

Plantilla consumo_detectado enviada a aprobación de Meta.

### Fase 1: MVP (semanas 3 a 7)

CS10 carga manual por foto o PDF al bot, disponible para todos desde el primer día (no depende de Google).

CS2 clasificación, CS3 Google Photos con render de PDF, CS4 sugerencia y confirmación en un toque, CS8 cuentas de servicio, CS9 duplicados, CS11 inmutabilidad y auditoría.

CS5 registro en la caja (egreso o vencimiento) y CS6 orden de pago básica.

CS7 panel de consumos con totales, mes contra mes, gráficos, historial y exportación.

CS1 conexión de Gmail con filtros y revocación, en beta cerrada con usuarios de prueba (dentro del tope de una app no verificada) mientras avanza la verificación.

CS12 avisos básicos.

Hito: beta con 5 a 10 comercios del piloto; métricas de acierto del OCR y de confirmación sin edición.

### Fase 2: disponibilidad general y comodidad (meses 2 a 4)

Conexión de Gmail para todos los comercios, una vez aprobadas la verificación de Google y la evaluación de seguridad.

Dirección de reenvío propia como alternativa sin OAuth (CS1.8).

Plantillas de parsing por emisor, período facturado, segundo vencimiento y consumo por unidad.

Alertas de aumento anómalo y resumen mensual de consumos por WhatsApp.

Carga desde la web; tipos de servicio personalizados (alarma, seguro, alquiler por email); órdenes de pago como borrador automático para cuentas recurrentes.

Decisión y, si corresponde, implementación de la alternativa Google Drive para PDF.

### Fase 3: inteligencia y más canales (meses 5 a 12)

Outlook / Microsoft 365 y otras casillas; hasta 2 casillas por comercio.

Aprendizaje de clasificación a partir de correcciones; detección de facturas faltantes ("este mes no llegó la factura de internet").

Presupuesto por servicio y proyección de gastos fijos del mes en la caja.

Reporte PDF mensual de consumos para el contador, integrado al reporte mensual de la caja.

## Anexo A: glosario

Campo | Detalle
--- | ---
Producto | Módulo Consumos de Servicios del Sistema de Inventario para Kioscos y Comercios
Autor | Mauricio Matasini
Estado | Borrador v1
Fecha | 9 de octubre de 2026
Documentos relacionados | "PRD - Sistema de Inventario para Kioscos y Comercios" (en adelante, PRD principal), "PRD - Caja Digital para Sistema de Inventario" (PRD de caja: movimientos C3, categorías C5, reversión C7, vencimientos C9, notificaciones C10, foto del comprobante en Google Photos C3.7), "PRD - Bot de WhatsApp para Sistema de Inventario" (PRD del bot: vinculación B1, opt-in B2, mensajes interactivos, ventana de 24 h), "PRD - Facturas de Proveedores para Sistema de Inventario" (PRD de facturas: patrón foto en Google Photos + OCR como sugerencia + confirmación en un toque, FP2/FP3/FP9) y "PRD - Órdenes de Pago para Sistema de Inventario" (PRD de órdenes de pago: principio "el bot prepara, el comerciante paga", OP1; órdenes desde vencimientos de servicios e impuestos, OP5; beneficiarios y allowlist de páginas oficiales, OP6/OP8). Este documento usa la misma terminología.
Stack | Astro + TypeScript, PostgreSQL, una base de datos por cliente más una base de control (igual que ModoOps)

# | Objetivo | Cómo se mide
--- | --- | ---
OS1 | Que ninguna factura de servicio se pierda | % de facturas de servicios detectadas en el email sobre el total que el dueño reconoce en entrevistas o carga a mano después (meta: más de 90% en los remitentes soportados)
OS2 | Registrar un servicio en un toque | % de facturas confirmadas sin editar ningún campo (meta: más de 80%); tiempo de interacción hasta la confirmación (mediana menor a 1 minuto)
OS3 | Que la caja refleje los gastos fijos | % de egresos de categorías Luz, Gas, Servicios e Impuestos con factura de servicio vinculada (meta: más de 70% a los 3 meses)
OS4 | Evitar recargos | % de facturas con vencimiento confirmadas antes de la fecha; vencimientos pagados en término
OS5 | Saber cuánto cuesta cada servicio | Comercios que abren el panel de consumos al menos una vez por mes
OS6 | Cero duplicados | Gastos de servicios duplicados en la caja (meta: 0)
OS7 | Confianza en la privacidad | 0 emails no relacionados almacenados (verificado por auditoría); desconexiones del email por motivos de privacidad (encuesta de salida)

Prioridad | Significado
--- | ---
P0 - MVP | Imprescindible para el lanzamiento del módulo
P1 - Post-MVP cercano | Dentro de los 2 a 3 meses posteriores
P2 - Futuro | Según demanda

# | Funcionalidad | MVP (P0) | Más adelante (P1/P2)
--- | --- | --- | ---
CS1 | Conexión del email con opt-in | Gmail por OAuth con scope de solo lectura, filtros por remitentes de servicios, revocación | Dirección de reenvío propia del comercio como alternativa sin OAuth (P1), Outlook/Microsoft 365 (P2)
CS2 | Detección y clasificación por tipo de servicio | Luz, Gas, Agua, Internet, Teléfono, Tasas municipales, ARCA, Otros servicios; reglas por remitente + contenido | Tipos personalizados (alquiler, alarma, seguro) (P1), aprendizaje por correcciones (P2)
CS3 | Guardado del comprobante en Google Photos | Imagen en el álbum del tipo de servicio; PDF convertido a imagen + original en almacenamiento del producto | Alternativa de guardado en Google Drive del comercio (P1, según pregunta abierta)
CS4 | OCR/parsing como sugerencia y confirmación en un toque | Fecha, monto, proveedor, vencimiento, número de cuenta; confirmación por WhatsApp | Período facturado y consumo (kWh, m³) (P1), segundo vencimiento con recargo (P1)
CS5 | Registro en la caja | Egreso si está pagado; vencimiento pendiente (C9) si no; categoría según el tipo de servicio | Detección automática de débito automático (P1)
CS6 | Órdenes de pago | Orden preparada desde el vencimiento de la factura o con "Orden de pago", según el PRD de órdenes de pago (el bot prepara, el comerciante paga) | Recurrencia con C9.5 / OP5.7 (P1)
CS7 | Panel de consumos (web) | Totales por tipo y período, historial, mes contra mes, gráficos | Alertas de aumento anómalo (P1), consumo por unidad (P1), presupuesto por servicio (P2)
CS8 | Cuentas de servicio | Alta automática al confirmar la primera factura (proveedor + número de cuenta) | Varias sucursales (P2)
CS9 | Detección de duplicados | Por mensaje de email, por archivo, por cuenta + período + monto, entre canales | —
CS10 | Carga manual por el bot | Foto o PDF al bot de WhatsApp con el mismo flujo | Carga desde la web (P1)
CS11 | Inmutabilidad, anulación y auditoría | Facturas confirmadas inmutables, anulación con motivo, log | —
CS12 | Avisos | Factura detectada, vencimiento próximo (vía C10), factura sin confirmar, conexión caída | Resumen mensual de consumos (P1)

Tipo de servicio | Categoría de egreso en la caja
--- | ---
Luz | Luz
Gas | Gas
Agua | Servicios > Agua (subcategoría a acordar con el PRD de caja; ver 8.2)
Internet | Servicios > Internet
Teléfono (fijo y celular) | Servicios > Teléfono
Tasas municipales | Impuestos > Tasas municipales
ARCA (monotributo, autónomos, planes de pago, VEP) | Impuestos > ARCA
Otros servicios (alarma, cable, cochera, etc.) | Servicios

Tabla | Dónde | Campos principales
--- | --- | ---
service_types | Base del comercio | id, código (luz, gas, agua, internet, telefono, tasas_municipales, arca, otros), nombre, cash_category_id (categoría de egreso de la caja, C5), photos_album_id (álbum en Google Photos, nullable), ícono, color (gráficos), es_sistema, activo, orden
service_accounts | Base del comercio | id, service_type_id, proveedor_nombre, emisor_cuit (nullable), numero_cuenta, alias, remitentes_email (lista), metodo_habitual_id (cash_payment_methods), debito_automatico, payee_id (beneficiario payees del PRD de órdenes de pago, nullable), activa, created_at. Único (proveedor normalizado, numero_cuenta)
utility_bills | Base del comercio | id (UUID), service_type_id, service_account_id, estado (borrador / confirmada / descartada / anulada), estado_pago (pendiente / pagada), origen (email / whatsapp / web), fecha_emision, vence_el, periodo_desde y periodo_hasta (P1), segundo_vencimiento_el y monto_segundo_centavos (P1), monto_centavos (bigint, mayor a 0), numero_comprobante, codigo_pago (nullable), consumo_cantidad y consumo_unidad (P1), ocr_sugerencia (JSON con valor y confianza por campo), clasificacion_confianza, photos_album_id, archivo_original_key (almacenamiento de objetos), archivo_sha256, imagen_phash, gmail_message_id y gmail_attachment_id (nullable), wamid (nullable), cash_due_item_id (vencimiento, nullable), cash_movement_id (egreso de pago, nullable), payment_order_id (orden de pago, nullable), confirmado_por, confirmado_at, anulada_por, motivo_anulacion, idempotency_key (único), created_at
utility_bill_files | Base del comercio | utility_bill_id, orden (página), tipo (pdf / imagen / html_render), archivo_key, sha256, photos_media_item_id
google_connections | Base del comercio | id, tipo (gmail / photos), cuenta_email (cifrado), scopes otorgados, refresh_token (cifrado con clave del gestor de secretos / KMS), estado (activa / revocada / error), consentimiento_version, consentimiento_at, consentido_por, gmail_history_id, watch_expira_at, ventana_inicial_dias, etiqueta_filtro (nullable), revocada_at. La conexión photos es la misma que usan la caja y las facturas de proveedores
email_ingestion_filters | Base del comercio | id, tipo (remitente / dominio / etiqueta), valor, service_type_id (nullable), origen (catálogo / dueño), activo
email_ingestion_log | Base del comercio | gmail_message_id (único), recibido_at, remitente_dominio, decision (factura / no_factura / dudoso / error), utility_bill_id (nullable), motivo, created_at. Sin asunto, cuerpo ni adjuntos de los mensajes descartados
gmail_watch_routes | Base de control | hash HMAC de la dirección de Gmail, tenant_id, estado. Solo para enrutar notificaciones push a la base del comercio; sin tokens ni contenido
service_sender_catalog | Base de control | dominio o dirección, service_type (código), proveedor sugerido, provincia, activo. Catálogo global mantenido por la plataforma [a verificar remitentes reales]
cash_movements (extensión) | Base del comercio | origen suma consumo_servicio; ref_tipo = utility_bill, ref_id = factura
cash_due_items (extensión) | Base del comercio | utility_bill_id (nullable, único); monto real de la factura en lugar del estimado
payment_orders y payees (del PRD de órdenes de pago) | Base del comercio | Sin cambios de esquema obligatorios: la orden de un servicio sale del vencimiento (cash_due_item_id) creado por la factura; la factura guarda payment_order_id para navegar. Tipos, estados y beneficiarios según ese PRD
notification_events (extensión) | Base del comercio | nuevos tipos: consumo_detectado, consumo_sin_confirmar, conexion_email_caida, resumen_consumos (P1)
utility_audit_log (o el audit_log común) | Base del comercio | entidad, entidad_id, acción, valor_anterior, valor_nuevo (JSON), user_id, origen, created_at

Riesgo | Impacto | Probabilidad | Mitigación
--- | --- | --- | ---
Verificación de scopes restringidos de Google: gmail.readonly es un scope restringido; requiere la verificación de la app OAuth y, como los datos se procesan en nuestros servidores, una evaluación de seguridad anual (CASA) con un evaluador aprobado por Google, que puede llevar semanas y tiene costo [fuente: Google; a verificar costo, nivel de evaluación y plazos]. Sin verificar, la app queda limitada a usuarios de prueba (tope de 100) y muestra la pantalla de "app no verificada" | Muy alto | Alta | Iniciar la verificación en la Fase 0; beta con usuarios de prueba; política de privacidad y uso limitado listos; arquitectura de mínimo dato que facilite la evaluación; plan B con dirección de reenvío (CS1.8) que no requiere scopes restringidos; evaluar un intermediario de email ya verificado
Rechazo de la verificación o requisitos más estrictos en el futuro | Alto | Media | Plan B de reenvío y carga por foto o PDF (CS10), que funcionan sin la Gmail API
Google Photos no acepta PDF y los cambios de 2025 de la Library API (solo medios creados por la app, scopes retirados) | Medio | Alta | Render a JPEG + original en almacenamiento propio; verificar scopes y cuotas vigentes; alternativa Google Drive con drive.file (pregunta abierta)
Desconfianza del dueño ("¿van a leer todos mis mails?") | Alto | Alta | Consentimiento claro, filtros visibles y editables, opción de etiqueta, desconexión en un toque, no se guardan emails no relacionados, alternativa sin email
Emisores que no mandan la factura por email (solo papel o solo link a su web) | Medio | Alta | Carga por foto al bot; registrar lo que se lea del cuerpo; (P1) aviso si una cuenta no recibió factura en el período esperado
Errores de OCR/parsing (monto o vencimiento equivocado) | Alto | Media | Texto embebido del PDF antes que OCR, confianza por campo, confirmación obligatoria, advertencias por desvío respecto del promedio, plantillas por emisor (P1)
Clasificación equivocada (un aviso de pago tomado como factura) | Medio | Media | Capa de reglas, estado "dudoso" con pregunta al dueño, aprendizaje por cuenta de servicio
Duplicados (recordatorios, reenvíos, foto + email) | Alto | Alta | CS9 con varios niveles y restricciones únicas
Doble registro con egresos cargados a mano en la caja | Medio | Media | Sugerencia de vínculo con egresos (CS5.6) y vencimientos existentes (CS5.7)
Costos de OCR/modelo y de mensajes de WhatsApp por factura | Medio | Media | Texto del PDF sin OCR cuando se puede, resumen en lote en la carga inicial, medición de costo por comercio
Cambios en la Gmail API (push, cuotas, watch) | Medio | Baja | Polling de respaldo, monitoreo de la renovación del watch
Facturas con datos personales de terceros (titular distinto del dueño) | Medio | Media | Guardar solo lo necesario, comprobante en el Google Photos del propio dueño, política de privacidad
Confusión con un servicio de pago ("¿el sistema me paga la luz?") | Medio | Media | Mensajes claros ("Preparé la orden; pagala desde tu banco o Mercado Pago"), no-objetivo explícito

Término | Definición
--- | ---
Consumo de servicio | Gasto de un servicio o impuesto del local (luz, gas, agua, internet, teléfono, tasas municipales, ARCA, otros)
Factura de servicio | Factura, boleta o VEP de un consumo de servicio, detectada en el email o cargada por foto o PDF
Tipo de servicio | Clasificación de la factura (Luz, Gas, Agua, Internet, Teléfono, Tasas municipales, ARCA, Otros servicios), asociada a una categoría de la caja
Cuenta de servicio | Proveedor + número de cuenta/cliente/partida que agrupa las facturas de un mismo servicio
Borrador | Factura detectada o cargada que todavía no se confirmó; no impacta en la caja
Confirmación en un toque | Botón "Confirmar" del bot que acepta los datos sugeridos por el OCR
Vencimiento | Pago con fecha límite en la agenda de la caja (C9)
Orden de pago | Preparación de un pago concreto con los datos para pagar (PRD de órdenes de pago); el bot prepara, el comerciante paga desde su app
Filtro de ingesta | Remitente, dominio o etiqueta que define qué emails se procesan
Panel de consumos | Pantalla web con totales, historial, comparación mes contra mes y gráficos de los consumos de servicios
