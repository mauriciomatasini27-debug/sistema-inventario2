---
id: MOD-02-ONBOARDING-PARTE-1
tipo: spec
estado: propuesto
modulos: [auth, onboarding]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: |
  El dueño de un kiosco, almacén, despensa o librería decide probar el sistema en un rato libre, muchas veces
  desde el celular y con clientes entrando.
---
> Origen: `PRD - Onboarding de Nuevos Clientes para Sistema de Inventario.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/onboarding`, `src/modules/tenants`, `src/pages/api/onboarding/*`

---

# PRD - Onboarding de Nuevos Clientes para Sistema de Inventario - Parte 1 de 2

Documento dividido en 2 partes por tamaño. Parte 1 (este documento): secciones 1 a 4 (resumen, objetivos, usuarios y funcionalidades ON1 a ON13). Parte 2: secciones 5 (Flujos de usuario) a 9 (Plan por fases) y Anexo A (glosario), en "PRD - Onboarding de Nuevos Clientes para Sistema de Inventario - Parte 2": https://docs.google.com/document/d/1Kc3bx3JOONR-p3TnTQ4Dv2OKvsgVbqYEDwK1aQHXz_c/edit. La numeración de secciones y requisitos se mantiene igual que en el documento completo; las referencias a las secciones 5 a 9 y al Anexo A están en la Parte 2.

Convención: igual que en los demás PRD, lo marcado [a verificar] son datos externos (políticas y precios de Meta, licencias de librerías, plataformas de video) que hay que confirmar en la fuente oficial antes de implementar. Este documento no modifica los otros PRD: cuando detecta algo que habría que alinear allá, lo deja como pregunta abierta o como propuesta en la sección 4.12.

## 1. Resumen / visión general

### 1.1 Problema

El dueño de un kiosco, almacén, despensa o librería decide probar el sistema en un rato libre, muchas veces desde el celular y con clientes entrando. Si en los primeros minutos se encuentra con pantallas vacías, formularios largos o pasos que no entiende (crear la base, configurar WhatsApp, cargar cientos de productos), abandona antes de ver el valor. Además, el producto tiene varias piezas (inventario, ventas, caja, bot de WhatsApp, facturas de proveedores, órdenes de pago, consumos de servicios) y el comerciante no sabe por dónde empezar.

Hoy el PRD principal describe el alta solo a grandes rasgos (Flujo 1 y Flujo 13: "Iniciar sesión con Google", nombre y rubro del comercio, aprovisionamiento de la base y un asistente con tres caminos). Falta definir con detalle qué se pide, cómo se crea la base sin que el usuario espere a ciegas, cómo se vincula el WhatsApp, cómo se presenta el producto y cómo se mide si el cliente quedó activado.

### 1.2 Visión

En menos de 5 minutos desde que toca "Iniciar sesión con Google", el dueño tiene su comercio creado, su WhatsApp vinculado, el bot le escribió desde el número central y ya hizo su primera acción real (una consulta al bot, un producto escaneado o una venta). Todo se puede hacer desde el celular, sin ninguna computadora en el kiosco (principio del dueño, ON13). Después, una checklist corta, un video de 2 minutos y un tour guiado dentro de la app lo llevan de la mano hasta dejar el comercio funcionando: los primeros 10 productos, umbrales de stock bajo, un proveedor y un empleado invitado.

### 1.3 Propuesta de valor

Para el dueño: "Entrás con tu cuenta de Google, ponés el nombre del kiosco y tu WhatsApp, y en un minuto el bot ya te está hablando". Sin contraseñas, sin cuenta de WhatsApp Business propia, sin configurar nada técnico.

Para el negocio: más pruebas gratis que se convierten en clientes pagos, menos soporte humano (proyecto paralelo a ModoOps, con poca disponibilidad de los fundadores) y un costo de alta acotado y medido.

### 1.4 Alcance del módulo

Incluye: la pantalla de alta posterior al login con Google, la verificación del número de WhatsApp (mensaje VINCULAR enviado por el usuario como método principal y código por plantilla como respaldo), el aprovisionamiento de la base del cliente con su pantalla de estado, las plantillas iniciales por rubro (ubicaciones vacías editables), el mensaje de bienvenida del bot, el video de bienvenida, el tour guiado interactivo, la checklist de primeros pasos, los estados vacíos, los datos de ejemplo y el onboarding del empleado invitado.

No incluye: el diseño del login con Google en sí (PRD principal F8 / PRD de autenticación), la lógica del bot (PRD del bot), la caja, facturas, órdenes de pago ni consumos de servicios, más allá de cómo se presentan en el onboarding.

## 2. Objetivos y no-objetivos

### 2.1 Objetivos

### 2.2 No-objetivos (fuera de alcance, al menos en el MVP)

No se importan catálogos completos en el alta (la importación Excel/CSV es P1 del PRD principal).

No se piden CUIT, datos fiscales, medio de pago ni tarjeta en el alta (la prueba gratis es sin tarjeta; el CUIT es opcional y se pide más adelante, en Suscripción).

No se piden permisos de Google más allá de openid, email y profile. Google Photos (facturas, caja) y Gmail (consumos de servicios, verificación de pagos de Mercado Pago) se conectan después, con consentimiento incremental y explícito, cuando el usuario usa esa función.

No se crea un número ni una cuenta de WhatsApp Business por kiosco (decisión del número central).

No hay arqueo diario; la entrega de turno es opcional y cuenta solo efectivo (Caja C17). El onboarding no pregunta "cuánto efectivo hay".

No se emite factura electrónica de ARCA: el "ticket" del video es un comprobante no fiscal (ver ON6.4 y 8.2).

No hay onboarding asistido por una persona (llamada, videollamada) como parte del producto; el soporte humano por WhatsApp queda como excepción.

No se hacen campañas de marketing por WhatsApp a los clientes en prueba (serían plantillas de marketing, más caras y con más riesgo de bloqueo).

## 3. Usuarios

### 3.1 Dueño/a nuevo/a (rol Dueño)

Perfil: dueño de un kiosco, almacén, despensa, librería u otro comercio chico; usa WhatsApp todo el día, tiene cuenta de Google (casi siempre la del celular Android) y poco tiempo. Puede haber llegado por recomendación, por un anuncio o por un link de wa.me.

Necesidades: ver rápido para qué sirve, no perder tiempo configurando, poder cortar y retomar después sin perder lo hecho.

Dispositivos: el celular (PWA) es el dispositivo principal y tiene que alcanzar solo: muchos kioscos no tienen computadora. La PC del mostrador con lector de códigos es un extra en algunos.

### 3.2 Empleado/a invitado/a (rol Empleado)

Perfil: atiende el mostrador por turnos; recibe la invitación por email del dueño (F8.9 del PRD principal).

Necesidades: aprender a vender, buscar productos y su ubicación, y usar el bot para consultas, sin ver datos financieros.

Onboarding propio: no pasa por la pantalla de alta ni por el aprovisionamiento; tiene un tour adaptado al rol (sin pasos de caja ni financieros) y la vinculación opcional de su WhatsApp.

### 3.3 Administrador de la plataforma (equipo propio)

Necesidades: ver en el Control Plane las altas en curso, las fallidas y su motivo, reintentar el aprovisionamiento, ver el embudo de activación y el costo de WhatsApp del onboarding.

## 4. Funcionalidades

### 4.0 Priorización

### ON1. Pantalla de alta del comercio (P0)

Descripción: después del login con Google, si el usuario no tiene membership ni invitación pendiente (6.12 del PRD principal), la primera pantalla le pide solo tres datos: el nombre del kiosco, el rubro y el número de WhatsApp.

### Requerimientos:

ON1.1 La pantalla aparece solo para usuarios autenticados sin comercio (resolución del PRD principal 6.12 / PRD de autenticación). Si el usuario tiene una invitación pendiente que coincide con su email verificado, entra por ON11 y no ve esta pantalla.

ON1.2 Campos:

Nombre del kiosco/comercio (obligatorio, 2 a 60 caracteres; placeholder: "Kiosco La Esquina").

Rubro (obligatorio, una opción): Kiosco, Almacén, Despensa, Librería, Otro. Con "Otro" aparece un campo de texto opcional ("¿Qué vendés?") que se guarda para análisis y para sumar rubros en el futuro.

Número de WhatsApp (obligatorio por defecto, ver ON1.5): con prefijo +54 por defecto (editable para números extranjeros), normalizado a E.164 con el mismo criterio que F6 y B1.1 (+54 9 ..., sin 0 ni 15). Ejemplo: "11 5555-1234" → "+54 9 11 5555 1234".

Casilla de opt-in (B2.1 del PRD del bot): "Quiero recibir por WhatsApp avisos de stock y resúmenes de [Producto]", con el detalle del tipo y la frecuencia de mensajes. Viene sin marcar: la marca el usuario.

ON1.3 Valores por defecto sin preguntar: zona horaria America/Argentina/Buenos_Aires, moneda ARS, nombre del dueño tomado de Google (editable en "Mi cuenta"). El CUIT (opcional en F8.1) se pide más adelante, en Suscripción.

ON1.4 Al tocar "Crear mi comercio" se registra el comercio en la base de control (estado aprovisionando), se encola el job de aprovisionamiento (ON3) y, en paralelo, arranca la verificación del WhatsApp (ON2): la pantalla de estado muestra el botón "Vincular por WhatsApp" (link wa.me) en el celular o un QR en la computadora. El usuario no espera a que termine una cosa para empezar la otra.

ON1.5 Escape: si el usuario no tiene el celular a mano o no puede verificar ni con VINCULAR ni con el código de respaldo, puede tocar "Verificar después": el comercio se crea igual, el número queda pendiente y la verificación pasa a ser el primer ítem de la checklist (ON8). Sin número verificado no hay bienvenida por WhatsApp ni avisos del bot.

ON1.6 Doble envío: tocar "Crear mi comercio" dos veces (o en dos pestañas) crea un solo comercio (clave de idempotencia por usuario y envío, ver 6.2).

ON1.7 Si el usuario abandona la pantalla y vuelve a iniciar sesión, retoma donde quedó: el formulario con los datos ya cargados o, si el comercio ya se estaba creando, la pantalla de estado.

ON1.8 La pantalla funciona en celular (PWA) con un campo por línea, teclado numérico en el número y sin scroll horizontal.

### Criterios de aceptación:

☐ Inicio sesión con Google por primera vez y lo primero que veo es una pantalla con nombre del kiosco, rubro y WhatsApp; no me pide contraseña, CUIT ni tarjeta.

☐ Escribo "11 5555-1234" y el sistema lo muestra como "+54 9 11 5555 1234".

☐ Elijo "Otro" y puedo escribir "Dietética"; el rubro queda "Otro" con ese texto guardado.

☐ Toco "Crear mi comercio" dos veces seguidas y en la base de control queda un solo comercio.

☐ Cierro el navegador en la pantalla de alta, vuelvo a entrar con Google y encuentro los datos que había cargado.

☐ Si tengo una invitación pendiente como empleado, no veo esta pantalla y entro directo al comercio que me invitó.

☐ Toco "Verificar después" y entro igual a mi comercio; la checklist me muestra "Verificá tu WhatsApp" como primer paso.

### ON2. Verificación del número de WhatsApp: VINCULAR iniciado por el usuario (principal) y código por plantilla (respaldo) (P0)

Descripción: decisión del dueño (9/10/2026; resuelve la pregunta abierta 3, ver 8.2 "Decisiones tomadas"). El método principal es el iniciado por el usuario: la web muestra un botón (en el celular, un link wa.me) o un QR (en la computadora) que abre WhatsApp con el mensaje precargado VINCULAR <código> hacia el número central; el comerciante lo envía y el backend verifica que el número remitente coincide con el ingresado y que el código es válido y no venció. Es gratis (no usa ninguna plantilla paga) y abre la ventana de atención de 24 h, así que la bienvenida sale como mensaje interactivo libre (ON5). El respaldo es el código de 6 dígitos que el bot envía con una plantilla de autenticación y el comerciante escribe en la web (por ejemplo, cuando se registra desde una computadora donde no puede escanear el QR, o cuando el envío del VINCULAR falla); es pago y requiere la aprobación de Meta. En los dos casos el número queda vinculado al dueño (identidad de WhatsApp verificada en la base de control, B1.3 del PRD del bot).

### Requerimientos:

ON2.1 Código de vinculación (método principal): al crear el comercio (y cada vez que se cambia el número), el sistema genera un código de 6 dígitos atado al número ingresado y al usuario, válido 10 minutos, de un solo uso y guardado solo como hash. Ese código viaja en el link wa.me y en el QR, por eso la prueba de posesión es que el mensaje llegue desde el número ingresado, no el código en sí.

ON2.2 Botón o QR según el dispositivo:

En el celular, la acción principal es el botón "Vincular por WhatsApp": link https://wa.me/<número central>?text=VINCULAR%20<código> que abre WhatsApp con el mensaje precargado; el comerciante toca "Enviar" y vuelve al navegador.

En la computadora, se muestra un QR con ese mismo link para escanearlo con la cámara del celular que tiene el WhatsApp del número ingresado, y debajo el mismo botón (para quien usa WhatsApp Web o de escritorio con ese número en la computadora).

ON2.3 Validación del VINCULAR: al recibir el mensaje, el backend comprueba que (a) el número remitente (wa_id, normalizado a E.164) coincide con el ingresado en la web y (b) el código existe, corresponde a ese número y no venció ni se usó. Si todo coincide, verifica el número; el bot confirma en el chat ("Listo, este número quedó vinculado a Kiosco La Esquina como Dueño") y la web pasa sola a "WhatsApp verificado ✓" (actualización de la pantalla de estado, 6.4). Si no coincide (otro número, código vencido, usado o inexistente), no verifica y responde con un mensaje genérico, sin revelar a qué comercio corresponde el código. Máximo 5 intentos fallidos por código.

ON2.4 Costo y ventana del método principal: el VINCULAR lo envía el usuario, así que no usa plantilla paga, y abre la ventana de atención de 24 h: la confirmación del bot y la bienvenida (ON5) salen como mensajes libres de servicio, sin plantilla [a verificar tarifa vigente de los mensajes de servicio y su cupo gratuito, ver el documento de costos].

ON2.5 Respaldo: código enviado por el bot con plantilla de autenticación. Debajo del botón/QR, la web ofrece "¿No podés escanear el QR o abrir WhatsApp? Recibí un código"; la opción también se destaca sola si a los 2 minutos de mostrar el botón/QR no llegó el VINCULAR, o si el usuario toca "No pude enviarlo". Al pedirlo, el bot envía al número ingresado un código de 6 dígitos distinto del de VINCULAR (nunca se muestra en la web) con la plantilla de categoría autenticación codigo_verificacion (ya prevista en 6.4 del PRD del bot), con botón "Copiar código" [a verificar formato vigente de las plantillas de autenticación de Meta, idioma es_AR y costo para Argentina], y el comerciante lo escribe en la web. Válido 10 minutos, de un solo uso, guardado solo como hash; máximo 5 intentos por código y máximo 3 envíos por número por hora (anti-abuso y control de costo). Es pago (~USD 0,026 por plantilla de autenticación en Argentina, estimado, ver el documento de costos) y requiere que Meta apruebe la plantilla: si no está aprobada o está pausada, la opción no se muestra y quedan VINCULAR y "Verificar después" (ON1.5).

ON2.6 Con el respaldo, el usuario no le escribió al bot: la ventana de 24 h no se abre y la bienvenida sigue la regla de ON5.1 (plantilla de utilidad con opt-in, o "Probar el bot ahora").

ON2.7 Al verificar (por cualquiera de los dos métodos), en la base de control se crea o actualiza whatsapp_identities (número E.164, wa_id, user_id, tenant_id, rol Dueño, estado verificado, verificado_at, método de verificación vincular o codigo, opt_in_at si marcó la casilla), igual que B1.3; todos los códigos pendientes de ese número se invalidan. La identidad queda asociada al tenant aunque su base todavía se esté creando; el bot no responde con datos hasta que el tenant esté activo.

ON2.8 Si el número ya está vinculado a otro comercio, en el MVP no se permite vincularlo a un segundo comercio (multi-comercio es P1, B1.6): se muestra "Este número ya está vinculado a otro comercio. Usá otro número o pedí ayuda", sin revelar de qué comercio se trata.

ON2.9 El usuario puede cambiar el número antes de verificar ("¿Te equivocaste? Cambiar número"); los códigos anteriores (el de VINCULAR y el de respaldo, si lo hubo) se invalidan y se generan un link y un QR nuevos.

ON2.10 Se registran en el log del bot (sin los códigos) los VINCULAR recibidos (aceptados o rechazados, con el motivo) y los envíos, entregas y fallas de la plantilla de respaldo (webhooks de estado, 6.4 del PRD del bot), y el costo en whatsapp_usage.

### Criterios de aceptación:

☐ En el celular, después de "Crear mi comercio", veo el botón "Vincular por WhatsApp"; lo toco, se abre WhatsApp con VINCULAR 482913 hacia el número central, lo envío y en menos de 10 segundos el bot me confirma la vinculación y la web muestra "WhatsApp verificado ✓".

☐ En la computadora veo un QR; lo escaneo con el celular, envío el VINCULAR y la pantalla de la computadora pasa sola a "WhatsApp verificado ✓".

☐ Si mando VINCULAR desde un número distinto del que ingresé, o con un código vencido (más de 10 minutos), ya usado o inexistente, no se verifica y el bot no revela a qué comercio corresponde.

☐ Verificar con VINCULAR no envía ninguna plantilla: en whatsapp_usage no figura una plantilla de autenticación para mi alta y la bienvenida figura como mensaje libre (ON5).

☐ Respaldo: toco "¿No podés escanear el QR o abrir WhatsApp? Recibí un código", en menos de 15 segundos me llega por WhatsApp, desde el número central, un código de 6 dígitos (plantilla de autenticación); lo escribo en la web y veo "WhatsApp verificado ✓".

☐ El código de respaldo no aparece en ninguna parte de la web y es distinto del código del VINCULAR.

☐ Un código de respaldo vencido (más de 10 minutos), ya usado o equivocado 5 veces no verifica el número.

☐ No puedo pedir más de 3 códigos de respaldo por hora para el mismo número.

☐ Si la plantilla de autenticación no está aprobada o está pausada, no veo la opción de código y puedo verificar con VINCULAR o tocar "Verificar después".

☐ En la base de control mi identidad de WhatsApp queda con estado verificado, mi usuario, mi comercio, rol Dueño, el método usado (vincular o codigo) y la fecha del opt-in (si lo marqué).

☐ Un número ya vinculado a otro comercio no se puede vincular al mío y el mensaje no dice cuál es el otro comercio.

### ON3. Aprovisionamiento de la base del cliente y pantalla de estado (P0)

Descripción: al crear el comercio, el sistema crea su propia base de datos, le aplica las migraciones, carga las plantillas del rubro y la registra en el catálogo de la base de control (6.4 del PRD principal). Mientras tanto, el usuario ve una pantalla de estado con el avance, puede terminar de verificar su WhatsApp y mirar el video.

### Requerimientos:

ON3.1 El aprovisionamiento corre como job idempotente en la cola de jobs (detalle en 6.2): crear base → aplicar migraciones → sembrar plantillas del rubro (ON4) → registrar en el catálogo → crear la membership de Dueño → marcar el tenant como activo.

ON3.2 Pantalla de estado ("Estamos preparando Kiosco La Esquina") con los pasos en lenguaje simple y su estado (pendiente / en curso / listo): "Creando tu base de datos", "Preparando tus ubicaciones", "Conectando tu WhatsApp", "¡Listo!". Se actualiza sola (SSE o polling cada 2 s).

ON3.3 En la misma pantalla: la verificación del WhatsApp (ON2: botón "Vincular por WhatsApp" en el celular o QR en la computadora, y el ingreso del código de respaldo si se pidió), si todavía no se verificó, y el video de bienvenida (ON6), para aprovechar la espera.

ON3.4 Cuando todo está listo, aparece el botón "Entrar a mi comercio" (no se saca al usuario de golpe si está mirando el video), con un aviso visual suave.

ON3.5 Falla parcial: si un paso falla, el job reintenta solo (hasta 3 veces con espera creciente). Si sigue fallando, hace rollback de lo creado en ese intento (ver 6.3), deja el tenant en estado error_aprovisionamiento, avisa al Control Plane y le muestra al usuario: "Tuvimos un problema creando tu comercio. Ya estamos avisados. [Reintentar]". Nunca queda una membership activa apuntando a una base incompleta.

ON3.6 El usuario no puede entrar a la app (ni el bot responder con datos) hasta que el tenant esté activo.

ON3.7 Si el usuario cierra la pantalla, el job sigue; al volver a entrar con Google, ve la pantalla de estado o, si ya terminó, entra directo.

ON3.8 El Control Plane lista las altas por estado (aprovisionando, activo, error), con el paso que falló, el error técnico y un botón "Reintentar" para el administrador.

### Criterios de aceptación:

☐ Después de "Crear mi comercio" veo la pantalla de estado con los pasos avanzando y, en condiciones normales, el botón "Entrar a mi comercio" aparece en menos de 30 segundos.

☐ Mientras se crea la base puedo verificar mi WhatsApp (con VINCULAR o con el código de respaldo) y mirar el video sin que se corte nada.

☐ Si simulo una falla en la carga de plantillas, el job reintenta; si la falla persiste, la base creada en ese intento se elimina, el comercio queda en "error", veo el mensaje con "Reintentar" y el Control Plane muestra el paso que falló.

☐ Toco "Reintentar" y el alta termina bien, con una sola base y un solo registro en el catálogo.

☐ Ejecutar el job dos veces para el mismo comercio deja exactamente una base, una membership y las ubicaciones del rubro sin duplicar.

☐ Cierro el navegador durante la creación, vuelvo a entrar a los 2 minutos y paso directo a mi comercio.

### ON4. Plantillas por rubro: ubicaciones por defecto (P0)

Descripción: al sembrar la base, el sistema crea ubicaciones vacías por defecto según el rubro (F9 del PRD principal), para que el dueño no arranque de cero al cargar productos. Son editables: las puede renombrar, archivar o sumar otras.

### Requerimientos:

ON4.1 Ubicaciones por rubro (propuesta, a validar con comerciantes del piloto):

ON4.2 Las ubicaciones se crean vacías (sin productos) y se comportan igual que cualquier ubicación de F9: nombre único entre las activas, renombrar, archivar, reactivar, todo registrado en el log de auditoría con origen "Sistema (plantilla de rubro)".

ON4.3 Se siembra un umbral de stock bajo sugerido (por ejemplo, 3 unidades) que el formulario de alta de producto propone y el dueño cambia; no se aplica a ningún producto sin que el dueño lo confirme.

ON4.4 Las plantillas viven versionadas en el código (no en la base de cada cliente), así un cambio de plantilla afecta solo a las altas nuevas.

ON4.5 La primera vez que el dueño entra a "Ubicaciones" ve el aviso "Estas ubicaciones las armamos según tu rubro. Cambiales el nombre para que coincidan con tu local".

ON4.6 (P1) Categorías de productos sugeridas por rubro y una lista de productos típicos para cargar con un toque (sin stock; el dueño confirma cantidades).

### Criterios de aceptación:

☐ Doy de alta un comercio con rubro Kiosco y en "Ubicaciones" veo Mostrador, Góndola 1, Heladera 1, Exhibidor de golosinas, Estante detrás del mostrador y Depósito, todas sin productos.

☐ Renombro "Heladera 1" a "Heladera Coca" y el historial muestra el cambio con mi usuario.

☐ Con rubro Librería no aparecen Heladera ni Freezer.

☐ La plantilla no crea ningún producto ni movimiento de stock.

### ON5. Mensaje de bienvenida por WhatsApp desde el número central (P0)

Descripción: cuando la base está lista y el número está verificado, el bot le escribe al dueño desde el número central para que lo pruebe en el momento, con una consulta sugerida y botones. Como el método principal de verificación es VINCULAR (ON2), el dueño normalmente ya le escribió al número central: la ventana de 24 h está abierta y la bienvenida sale gratis, como mensaje libre interactivo (sin plantilla paga).

### Requerimientos:

ON5.1 Regla de envío (ventana de 24 h, 6.4 del PRD del bot):

Si el usuario escribió primero al número central en las últimas 24 h (el caso normal: verificó con VINCULAR desde el botón wa.me o el QR, ON2.2; o tocó "Probar el bot ahora" en la pantalla de estado, que abre un link wa.me con el texto precargado "Hola"), la ventana está abierta y la bienvenida va como mensaje libre interactivo (texto + botones de respuesta). No necesita plantilla aprobada ni es una plantilla paga, porque responde a un mensaje del usuario.

Si el usuario no escribió (caso de respaldo: verificó con el código que mandó el bot por plantilla de autenticación, ON2.5, lo ingresó en la web y no le escribió al bot), la bienvenida va como plantilla de utilidad aprobada (por ejemplo, bienvenida_comercio_listo), y solo si marcó el opt-in (B2.1). Sin opt-in, no se manda nada por WhatsApp y la web le ofrece "Probar el bot ahora" (wa.me).

ON5.2 Por eso, si el usuario verificó con el código de respaldo (o todavía no verificó), la pantalla de estado muestra como acción principal "Probar el bot ahora" (link wa.me): que el usuario escriba primero abre la ventana, evita depender de la plantilla y no consume el límite de mensajería de usuarios únicos fuera de ventana (0.1 del documento de costos). Si verificó con VINCULAR, la ventana ya está abierta y este botón queda como opción secundaria. Si no lo toca en los 5 minutos posteriores a "listo", se manda la plantilla (con opt-in).

ON5.3 Contenido propuesto (respetando los límites de Meta: hasta 3 botones de hasta 20 caracteres, cuerpo interactivo de hasta 1.024 caracteres, según el PRD del bot):

"¡Hola, Mauricio! 👋 Kiosco La Esquina ya está listo. Soy el bot de [Producto]: te aviso cuando algo se está acabando y te ayudo a armar los pedidos. Probá preguntarme: ¿qué ubicaciones tengo?"

Botones: [Cargar un producto] [Qué puedo hacer] [Ver el video]

ON5.4 La consulta sugerida tiene que funcionar con el catálogo vacío: "¿qué ubicaciones tengo?" responde con las ubicaciones del rubro (ON4). Cuando el comercio ya tiene productos, la sugerencia pasa a "¿cuántos [producto cargado] tengo?".

ON5.5 Botones: Cargar un producto responde con el link a la web en Modo carga (escaneo con la cámara del celular); Qué puedo hacer muestra el menú de ayuda del bot (B12); Ver el video manda el link del video (ON6). Tocar un botón de respuesta rápida es un mensaje del usuario y abre (o renueva) la ventana de 24 h.

ON5.6 La plantilla tiene que ser de utilidad y describir el estado de la cuenta del usuario ("Tu comercio ya está listo"), sin promociones; Meta puede recategorizarla como marketing (más cara) [a verificar criterios de categorización vigentes]. Se envía en es_AR [a verificar idioma disponible].

ON5.7 Una sola bienvenida por comercio (idempotencia por tenant y número): reintentos del job o un segundo VINCULAR no la repiten.

ON5.8 Costo y cupos: la verificación (ON2: sin plantilla con VINCULAR; una plantilla de autenticación solo si se usa el código de respaldo), la bienvenida y las respuestas del bot durante las primeras 24 h desde el alta no descuentan del cupo de mensajes del plan del cliente (con un tope, por ejemplo, de 30 mensajes); son costo de adquisición y se registran en whatsapp_usage con la marca onboarding. Con las tarifas para Argentina del documento de costos (~USD 0,026 por plantilla de utilidad, autenticación o mensaje de servicio), el costo esperado es de ~USD 0,05 a 0,10 por alta (estimado), y menor en las altas verificadas con VINCULAR, que no usan plantilla de autenticación ni de bienvenida.

ON5.9 (P1) Un único recordatorio de activación a las 48 h si el comercio no cargó ningún producto, como plantilla de utilidad, solo con opt-in, desactivable con "BAJA" (B2.3).

### Criterios de aceptación:

☐ Verifico con VINCULAR (o toco "Probar el bot ahora" y mando "Hola") y, cuando la base está lista, recibo la bienvenida con 3 botones como mensaje libre; en el log figura como mensaje de servicio, no como plantilla.

☐ Verifico con el código de respaldo, marco el opt-in y no le escribo al bot: a los 5 minutos de "listo" recibo la plantilla de bienvenida con los botones; en el log figura como plantilla de utilidad.

☐ Sin opt-in y sin haber escrito, no recibo ningún mensaje por WhatsApp; la web me ofrece "Probar el bot ahora".

☐ Escribo "¿qué ubicaciones tengo?" y el bot me lista las ubicaciones de mi rubro.

☐ Toco "Cargar un producto" y recibo un link que abre la web en Modo carga de mi comercio.

☐ La bienvenida llega una sola vez aunque el job se reintente o mande VINCULAR dos veces.

☐ Los mensajes del onboarding no descuentan de mi cupo de mensajes del plan y aparecen en whatsapp_usage con la marca onboarding.

### ON6. Video de bienvenida (~2 minutos) (P0)

Descripción: un video corto que muestra cómo se usa el producto en el día a día de un kiosco. Nota: el dueño pidió "cinco temas" pero enumeró seis (ventas, el bot, caja y resumen diario, stock, facturación y pedidos a proveedores); se incluyen los seis y queda para confirmar si alguno se recorta (8.2).

### Requerimientos:

ON6.1 Duración objetivo: ~120 segundos (tolerancia ±15 s), grabado con la pantalla real de la app en el celular (el uso principal, ON13) y tomas del mostrador, con locución en castellano rioplatense y subtítulos en es-AR (muchos lo miran sin sonido). Se reproduce bien en vertical en el celular.

ON6.2 Se muestra en la pantalla de estado (ON3), en la tarjeta de bienvenida del inicio, en "Ayuda > Ver video" y por link desde el bot (ON5). Se puede pausar, cerrar y volver a ver.

ON6.3 Guion por escenas (esbozo):

ON6.4 Facturación (aclaración obligatoria): el ticket que se muestra es un comprobante de venta no fiscal (no es factura electrónica de ARCA) y así tienen que decirlo el video y el propio ticket. La facturación fiscal se podría sumar más adelante. Este ticket no está definido en ninguno de los otros PRD (el PRD principal define la venta como movimiento de stock y la caja registra el ingreso, pero no hay comprobante para el cliente): queda como pregunta abierta (8.2). Si no se define antes de grabar, la escena 5 se reemplaza por una toma del historial de ventas del día y los 14 s se reparten entre ventas y stock.

ON6.5 Todo lo que muestra el video tiene que existir en el MVP o estar rotulado "Próximamente". En particular: el aviso de stock bajo por WhatsApp (B4/B5 del PRD del bot), la lectura de facturas (FP1–FP8) y el ticket (ON6.4) dependen de que esos módulos lleguen al lanzamiento.

ON6.6 Hosting (detalle en 6.6): en el MVP, YouTube no listado con reproductor embebido de privacidad mejorada; como alternativa, autohospedado. Se mide la reproducción (inicio, 50%, fin) con eventos propios.

ON6.7 El guion se versiona; cuando cambia la UI de una escena, se regraba esa escena.

### Criterios de aceptación:

☐ El video dura entre 105 y 135 segundos y cubre los seis temas en el orden del guion.

☐ Tiene subtítulos en castellano y se entiende sin sonido.

☐ En la escena de facturación se lee claramente "Comprobante no válido como factura".

☐ Lo puedo ver en la pantalla de estado mientras se crea la base, desde "Ayuda > Ver video" y desde el botón del bot.

☐ Lo puedo ver completo en el celular, con datos móviles, sin que se corte la pantalla de estado.

☐ El reproductor no muestra videos recomendados de otros canales al terminar (o se usa autohospedado).

☐ El Control Plane muestra cuántas altas iniciaron y terminaron el video.

### ON7. Tour guiado interactivo de la web app (P0)

Descripción: en el primer ingreso, la pantalla se oscurece con un overlay y se resalta un elemento de la interfaz por vez con un tooltip que explica qué hacer ("Acá escaneás el producto", "Acá ves el stock"). El tour recorre los flujos principales: ventas, stock, caja, proveedores y el bot. Se adapta al rol (el empleado no ve los pasos de caja ni financieros) y está diseñado primero para el celular (PWA); la versión de escritorio es una adaptación.

### Requerimientos:

ON7.1 Inicio: se ofrece automáticamente en el primer ingreso a la app de cada usuario (después de "Entrar a mi comercio" o de aceptar la invitación), con una tarjeta "¿Te mostramos la app en 1 minuto? [Empezar] [Ahora no]". "Ahora no" lo deja disponible en "Ayuda > Ver tour" y en la checklist.

ON7.2 Overlay y resaltado: oscurece la pantalla, deja visible solo el elemento del paso (con un recorte y un borde) y muestra el tooltip con título corto, una o dos líneas de texto y los controles. Mientras el tour está activo, los toques fuera del elemento resaltado no hacen nada.

ON7.3 Controles: Siguiente, Anterior, contador de pasos ("3 de 11"), Saltar tour visible en todos los pasos y cierre con la cruz o con Esc. En el último paso, "Terminar". En el celular los botones tienen al menos 44 × 44 px y quedan al alcance del pulgar.

ON7.4 Pasos del rol Dueño (propuesta):

ON7.5 Pasos del rol Empleado: sin los pasos de caja ni financieros (7 y 8), sin proveedores (9, porque no los edita, F8.8) y sin costos ni márgenes en los textos. Quedan: inicio, escanear y vender (el cobro se explica como "elegí cómo te pagan", sin saldos), stock y ubicaciones ("Acá buscás un producto y ves dónde está"), alta de producto solo si el dueño se lo habilitó, el bot (consultas) y Ayuda. Los pasos se filtran con los mismos permisos del backend que el resto de la app, no con una lista aparte.

ON7.6 Celular primero (PWA): el conjunto de pasos principal es el del celular: se anclan a la barra de navegación inferior y a los botones principales; el tooltip se muestra como hoja inferior (bottom sheet) que no tapa el elemento; se recalcula al rotar la pantalla o cuando aparece el teclado. Si un elemento no está visible, el tour hace scroll hasta él o, si está en otra pantalla, navega primero. En escritorio se usa una variante con tooltips flotantes junto al elemento.

ON7.7 Elementos ausentes: si un elemento de un paso no existe (módulo desactivado, permiso faltante, cambio de UI), el paso se salta sin romper el tour y se registra un evento de error para corregirlo.

ON7.8 Datos vacíos: con el catálogo vacío, los pasos resaltan el estado vacío (ON9) y su botón de acción, no una lista inexistente.

ON7.9 Progreso por usuario: se guarda por usuario y por comercio (versión del tour, último paso visto, completado o saltado, fecha). Si cierra a mitad, al volver a "Ayuda > Ver tour" puede retomar desde el último paso o empezar de nuevo. Un tour completado o saltado no se vuelve a ofrecer solo.

ON7.10 Repetir más tarde: "Ayuda > Ver tour" siempre disponible, para dueños y empleados.

ON7.11 Accesibilidad: foco atrapado dentro del tooltip mientras está abierto (focus trap), Esc cierra (equivale a "Saltar", guardando el progreso), Tab y Enter para los controles, flechas para anterior/siguiente, el texto del paso se anuncia a lectores de pantalla (role="dialog", aria-live), contraste suficiente en el overlay y respeto de prefers-reduced-motion (sin animaciones).

ON7.12 El tour no ejecuta acciones reales (no vende, no crea productos ni abre la caja): solo muestra. Las acciones las hace el usuario después, guiado por la checklist y por la primera venta guiada (ON13.5).

ON7.13 (P1) Tours cortos por módulo (al entrar por primera vez a Facturas, Órdenes de pago o Consumos) y un tour de "novedades" cuando cambia la versión de la UI.

### Criterios de aceptación:

☐ En mi primer ingreso como dueño veo la oferta del tour; toco "Empezar", la pantalla se oscurece y queda resaltado solo el botón de escaneo con el texto "Acá escaneás el producto…".

☐ Veo el contador "1 de 11" y puedo ir a Siguiente y Anterior; en cualquier paso puedo tocar "Saltar tour".

☐ Como empleado, el tour no me muestra pasos de caja, saldos, resumen diario, proveedores ni costos.

☐ En el celular, los tooltips aparecen como hoja inferior y no tapan el elemento resaltado; al rotar la pantalla, el resaltado se reacomoda.

☐ Hago el tour completo en un Android de gama media con una sola mano, sin hacer zoom ni scroll horizontal.

☐ Salgo del tour en el paso 5 con Esc (o la cruz); después entro a "Ayuda > Ver tour" y puedo retomar desde el paso 5 o empezar de nuevo.

☐ Completo el tour y no me lo vuelven a ofrecer solo; lo puedo repetir desde Ayuda.

☐ Con el teclado puedo recorrer todo el tour (en escritorio) sin mouse; el foco no se escapa del tooltip y el lector de pantalla lee el texto de cada paso.

☐ Si desactivo un módulo y el elemento de un paso no está, el tour salta ese paso y sigue.

☐ El progreso del tour es por usuario: si el empleado lo completa, al dueño se le sigue ofreciendo el suyo.

### ON8. Checklist de primeros pasos (P0)

Descripción: una lista corta y visible en el inicio con lo que hace falta para que el comercio empiece a dar valor. El avance se calcula con datos reales (no se tilda a mano). Todos los pasos se pueden completar desde el celular.

### Requerimientos:

ON8.1 Pasos del MVP (más "Verificá tu WhatsApp" arriba de todo si quedó pendiente, ON1.5, e "Instalá la app en tu celular" como paso opcional, ON13.6):

Cargá tus primeros 10 productos (con contador "4 de 10"; acceso directo al Modo carga por escaneo con la cámara, F2).

Configurá los umbrales de stock bajo (completo cuando al menos 5 productos, o todos si hay menos, tienen umbral; acceso a la asignación de umbral, F4).

Agregá un proveedor (completo con 1 proveedor, F6; se puede elegir de los contactos del celular si el navegador lo permite [a verificar soporte de la Contact Picker API]).

Invitá a un empleado (completo con 1 invitación enviada, F8.9; "No tengo empleados" lo marca como no aplica).

ON8.2 Progreso: barra y texto ("2 de 4 listos") en el inicio; cada paso muestra su estado (pendiente, en curso con contador, listo ✓, saltado).

ON8.3 Saltar: cada paso tiene "Saltar"; también se puede "Ocultar la lista" entera. Lo saltado se puede retomar.

ON8.4 Retomar: la checklist se vuelve a abrir desde "Ayuda > Primeros pasos" y desde un indicador chico en el menú mientras quede algo pendiente. El estado sobrevive a cerrar sesión y a cambiar de dispositivo.

ON8.5 Los pasos son del comercio (se completan con datos del comercio, los haga quien los haga); ocultar o saltar es por usuario. Al empleado se le muestra una checklist propia corta (ver el tour, buscar un producto, hacer una venta de prueba en Modo ejemplo si está activo).

ON8.6 Al completar los 4 pasos: mensaje de felicitación en la web y, si la ventana de 24 h está abierta, una línea dentro de la próxima respuesta del bot (sin mandar una plantilla aparte, para ahorrar mensajes, 7.3 del documento de costos).

ON8.7 (P1) Pasos opcionales por módulo: "Abrí la caja por primera vez", "Mandá una factura de proveedor al bot", "Conectá Google Photos" (con consentimiento incremental), "Cargá un vencimiento".

### Criterios de aceptación:

☐ Al entrar a mi comercio nuevo veo la checklist con 4 pasos y "0 de 4 listos".

☐ Cargo 4 productos y el primer paso muestra "4 de 10"; al cargar el décimo se tilda solo.

☐ Agrego un proveedor desde Proveedores (sin pasar por la checklist) y el paso igual queda listo.

☐ Salto "Invitá a un empleado" y lo veo como saltado; lo puedo retomar desde "Ayuda > Primeros pasos".

☐ Oculto la checklist, cierro sesión, entro desde otro dispositivo y la puedo volver a abrir con el progreso intacto.

☐ Completo los 4 pasos usando solo el celular.

☐ Los datos de ejemplo (ON10) no cuentan para la checklist.

### ON9. Estados vacíos (P0)

Descripción: cada pantalla que arranca vacía explica qué va a haber ahí y ofrece la acción principal, en lugar de una tabla en blanco.

### Requerimientos:

ON9.1 Estados vacíos mínimos:

ON9.2 Los estados vacíos respetan los permisos del rol (un empleado no ve "Invitar empleado" ni "Abrir el día" si no tiene permiso) y tienen el atributo de anclaje para el tour (ON7.8).

ON9.3 Textos en castellano rioplatense, cortos, sin jerga técnica, legibles en una pantalla de celular sin scroll.

### Criterios de aceptación:

☐ En un comercio nuevo, ninguna pantalla principal muestra una tabla vacía sin explicación.

☐ Desde el estado vacío de Productos llego al Modo carga con la cámara en un toque.

☐ Como empleado no veo acciones para las que no tengo permiso.

### ON10. Datos de ejemplo (P0 web / P1 bot)

Descripción: el usuario puede probar con datos de ejemplo (un kiosco ficticio con productos, ubicaciones, stock, ventas, alertas y un proveedor) para ver cómo se ve la app llena, sin mezclar nada con sus datos reales.

### Requerimientos:

ON10.1 Los datos de ejemplo viven en un comercio de ejemplo separado (base propia creada desde una plantilla de demo, marcada es_demo), no dentro de la base real. Motivo: el historial de movimientos y el log de auditoría son append-only (F3, 6.11 del PRD principal) y no se pueden "borrar" datos de ejemplo de una base real sin romper esa regla.

ON10.2 Se activa desde los estados vacíos o desde Ayuda: "Ver con datos de ejemplo". Se muestra una banda fija "Estás viendo datos de ejemplo · [Volver a mi comercio]"; nada de lo que se haga ahí afecta al comercio real.

ON10.3 El comercio de ejemplo se crea solo la primera vez que se pide (clonado desde la plantilla) y se elimina solo a los 14 días o con "Descartar datos de ejemplo".

ON10.4 El contenido depende del rubro (ej.: kiosco con golosinas y bebidas; librería con cuadernos y lapiceras), usa las ubicaciones de ON4 y productos de marcas genéricas o ficticias.

ON10.5 Los eventos del comercio de ejemplo no cuentan para la checklist, la activación ni las métricas de uso, y no envían mensajes por WhatsApp ni emails a proveedores (envíos simulados).

ON10.6 (P1) El bot puede responder sobre el comercio de ejemplo si el usuario escribe "modo ejemplo", con cada respuesta marcada "(ejemplo)".

### Criterios de aceptación:

☐ Toco "Ver con datos de ejemplo" y veo un kiosco con productos, stock, alertas y ventas, con la banda "Estás viendo datos de ejemplo".

☐ Vendo un producto en el ejemplo y, al volver a mi comercio, mi stock y mi historial no cambiaron.

☐ Un pedido armado en el ejemplo no se manda a ningún proveedor real.

☐ Toco "Descartar datos de ejemplo" y la base de ejemplo se elimina; mi comercio real queda igual.

### ON11. Onboarding del empleado invitado (P0)

Descripción: el empleado entra por la invitación del dueño (Flujo 14 del PRD principal) y tiene un onboarding corto propio, pensado para su celular.

### Requerimientos:

ON11.1 Al aceptar la invitación e iniciar sesión con Google (con el email invitado, F8.9), entra directo al comercio, sin pantalla de alta ni aprovisionamiento.

ON11.2 Ve el tour del rol Empleado (ON7.5), una checklist corta (ON8.5) y la sugerencia de instalar la app (ON13.6).

ON11.3 Se le ofrece vincular su WhatsApp (opcional) con el mismo mecanismo de ON2 (VINCULAR por wa.me o QR como método principal y el código del bot por plantilla como respaldo), con rol Empleado y opt-in propio; el dueño ve el número en Configuración → WhatsApp y lo puede revocar (B1.8).

ON11.4 Si el empleado vinculó el WhatsApp y escribió primero, recibe una bienvenida corta como mensaje libre ("¡Hola, Juan! Ya podés consultarme el stock de Kiosco La Esquina. Probá: ¿dónde está el Jorgito?"). No se le manda plantilla de bienvenida (ahorro de mensajes).

### Criterios de aceptación:

☐ Acepto la invitación desde el celular, inicio sesión con Google y veo el tour sin pasos de caja ni financieros.

☐ Vinculo mi WhatsApp con VINCULAR (o con el código de respaldo) y el dueño ve mi número como Empleado en Configuración → WhatsApp.

☐ No veo la pantalla de alta del comercio ni la de estado.

### ON12. Medición del embudo de onboarding (P0)

### Requerimientos:

ON12.1 Eventos (en la base de control, sin datos de negocio): login_google_primera_vez, alta_formulario_completo, whatsapp_vincular_mostrado (con variante: botón wa.me o QR), whatsapp_vincular_recibido (con resultado: verificado, número distinto, código vencido o inválido), whatsapp_codigo_respaldo_solicitado (con motivo: no puede escanear el QR, no llegó el VINCULAR, no pudo enviarlo), whatsapp_codigo_respaldo_enviado (con estado de entrega), whatsapp_verificado (con método: vincular o codigo), whatsapp_verificar_despues, aprovisionamiento_inicio/fin/error (con duración y paso), bienvenida_enviada (libre o plantilla), bienvenida_respondida, primer_ingreso_app, tour_inicio/paso/saltado/completado, video_inicio/50/fin, checklist_paso_completado, modo_ejemplo_activado, pwa_sugerencia_mostrada/aceptada/descartada, pwa_instalada, primer_producto, decimo_producto, primer_umbral, primer_proveedor, primera_invitacion, primera_venta (con método: cámara, lector, búsqueda manual), primera_consulta_bot. Cada evento lleva el tipo de dispositivo (celular / tablet / PC) y si corre como PWA instalada.

ON12.2 Panel en el Control Plane con el embudo, el TTFV (mediana y p75), la tasa de activación a 7 días por cohorte semanal, por rubro y por dispositivo, las fallas de aprovisionamiento, el % de verificaciones por método (VINCULAR / código de respaldo / pendiente) y por variante (botón / QR), y el costo de WhatsApp del onboarding por alta (con las plantillas de autenticación del respaldo aparte).

### Criterios de aceptación:

☐ Para cada alta puedo ver en el Control Plane los tiempos entre login, formulario, verificación, base lista y primer valor.

☐ El panel muestra la tasa de activación a 7 días por semana de alta, por rubro y por dispositivo (celular / PC).

☐ El panel muestra qué % de las altas verificó con VINCULAR (botón o QR) y qué % con el código de respaldo, y cuántas plantillas de autenticación se pagaron por mes.

### ON13. Celular primero: onboarding completo desde el teléfono y PWA instalable (P0)

Descripción: principio del dueño: el sistema tiene que poder operarse entero desde un celular, sin ninguna computadora en el kiosco. El onboarding se diseña primero para el teléfono: el registro con Google, la primera pantalla, la verificación del WhatsApp, el tour (layout de celular), la primera venta con el escáner de la cámara y una sugerencia para instalar la PWA en la pantalla de inicio. La PC con lector de códigos es un extra, nunca un requisito.

### Requerimientos:

ON13.1 Ningún paso del onboarding requiere una computadora. Cada pantalla (alta, estado, verificación, checklist, tour, estados vacíos, datos de ejemplo, invitación de empleados) se diseña primero para un ancho de 360 px y se prueba en un Android de gama media y en un iPhone; la versión de escritorio es una adaptación.

ON13.2 Registro con Google en el celular: el botón "Iniciar sesión con Google" funciona en Chrome (Android) y Safari (iOS). Si la página se abrió dentro de un navegador integrado de otra app (por ejemplo, al tocar un link desde WhatsApp, Instagram o Facebook), Google puede bloquear el login en esas vistas embebidas [a verificar comportamiento vigente de Google con webviews]: el sistema lo detecta y muestra "Para entrar con Google, abrí esta página en Chrome/Safari" con un botón para abrirla en el navegador (y copiar el link como alternativa).

ON13.3 Primera pantalla en el celular: un campo por línea, teclado adecuado para cada campo (texto para el nombre, numérico para el WhatsApp), botón principal fijo abajo, sin scroll horizontal, y nada que dependa de pasar el mouse por encima.

ON13.4 Verificación en el mismo teléfono: el método principal es un solo toque: "Vincular por WhatsApp" (ON2.2) abre WhatsApp con VINCULAR <código>, el usuario envía y vuelve al navegador. El estado del alta se guarda en el servidor y sobrevive a que el sistema operativo cierre la pestaña; al volver, la pantalla ya muestra "WhatsApp verificado ✓". Si usa el código de respaldo (ON2.5), al volver el campo del código queda enfocado y acepta pegar el código (botón "Copiar código" de la plantilla) con autocompletado de código de un solo uso cuando el teclado lo ofrece.

ON13.5 Primera venta guiada con el escáner de la cámara: cuando el comercio tiene al menos un producto con código de barras, la checklist y el estado vacío de Ventas ofrecen "Hacé tu primera venta":

Antes del pedido de permiso del navegador, una pantalla explica para qué se usa la cámara ("La usamos solo para leer códigos de barras y sacar fotos de productos").

Se abre el Modo venta con la cámara trasera, un recuadro de enfoque, botón de linterna (si el equipo lo permite) y confirmación con vibración y sonido al leer el código.

Muestra el producto con su ubicación (F9), elige el medio de pago y confirma: el stock baja y, si Caja Digital está activo, el ingreso entra a la caja (F2.10 del PRD principal).

Si la cámara no lee el código en unos segundos, ofrece escribir el número del código o buscar el producto por nombre (venta de respaldo por búsqueda manual, F2.12).

Si el usuario negó el permiso de cámara, explica cómo habilitarlo en el navegador o en la app instalada, y ofrece la búsqueda manual mientras tanto. La primera venta es real (el kiosco está vendiendo); si fue de prueba, se anula con un movimiento compensatorio como cualquier venta (F3). Para practicar sin tocar el stock real, se ofrece el Modo ejemplo (ON10).

ON13.6 Sugerencia de instalar la PWA en la pantalla de inicio:

Se muestra después del primer valor (primera venta, primer producto o primera respuesta del bot), no en la primera pantalla, como tarjeta: "Instalá [Producto] en tu celular y abrilo como una app, sin buscar el link."

Android (Chrome y compatibles): botón "Instalar" que dispara el diálogo de instalación del navegador (evento beforeinstallprompt).

iPhone (Safari): como no hay diálogo automático, instrucciones con dibujo: "Tocá Compartir → Agregar a inicio" [a verificar pasos y nombres vigentes en iOS].

Navegador integrado de otra app: explica que hay que abrir la página en Chrome/Safari para poder instalarla.

Si se descarta, se vuelve a ofrecer como máximo 2 veces más, con 7 días de diferencia, y siempre queda en "Ayuda > Instalar la app" y como paso opcional de la checklist.

No se muestra si la app ya corre instalada (modo standalone).

ON13.7 Después de instalar: la app instalada abre en el inicio del comercio con la sesión iniciada cuando el navegador comparte la sesión; si no la comparte (por ejemplo, en algunos casos de iOS, donde la app de la pantalla de inicio tiene su propio almacenamiento [a verificar]), pide "Iniciar sesión con Google" una vez y retoma el onboarding donde estaba (el estado vive en el servidor).

ON13.8 Rendimiento con datos móviles: la pantalla de alta y la de estado cargan en menos de 3 s en 4G en un Android de gama media; el video y la librería del tour se cargan en diferido; si se corta la conexión durante el alta, se reintenta sin perder lo cargado.

ON13.9 Prueba en dispositivos reales como parte de la definición de terminado: el camino completo del Flujo 9 (sección 5) se prueba antes de cada versión en al menos un Android de gama media, un Android de gama baja y un iPhone.

### Criterios de aceptación:

☐ Hago el alta completa (login con Google, primera pantalla, verificación del WhatsApp, pantalla de estado, tour y primera venta con la cámara) usando solo un celular Android de gama media, sin tocar una computadora.

☐ Lo mismo funciona en un iPhone con Safari.

☐ Abro el link de la landing desde un chat de WhatsApp (navegador integrado) y el sistema me indica abrirlo en Chrome/Safari antes de iniciar sesión con Google, con un botón para hacerlo.

☐ Toco "Vincular por WhatsApp", envío el mensaje en WhatsApp, vuelvo al navegador y el formulario y la pantalla de estado siguen donde estaban, con el número ya verificado (o, si pedí el código de respaldo, con el campo del código listo para pegar).

☐ En el celular, "Vincular por WhatsApp" es la acción principal de la verificación y vincula el número con un solo envío.

☐ Toco "Hacé tu primera venta", acepto el permiso de cámara, apunto al código de un producto cargado y en menos de 3 segundos lo veo con su ubicación; confirmo el cobro y el stock baja en 1.

☐ Con poca luz, prendo la linterna desde el escáner; si el código no se lee, puedo escribirlo o buscar el producto por nombre.

☐ Si niego el permiso de cámara, veo cómo habilitarlo y puedo vender igual con la búsqueda manual.

☐ Después de mi primera venta veo la sugerencia de instalar la app; en Android, "Instalar" abre el diálogo del navegador y el ícono queda en mi pantalla de inicio; en iPhone veo las instrucciones de "Agregar a inicio".

☐ Descarto la sugerencia y no la vuelvo a ver hasta 7 días después; nunca más de 3 veces en total; siempre la encuentro en "Ayuda > Instalar la app".

☐ Abro la app instalada y entro a mi comercio (o, si me pide iniciar sesión con Google una vez, retomo el onboarding donde estaba).

☐ Con la app ya instalada no me vuelve a aparecer la sugerencia.

☐ La pantalla de alta carga en menos de 3 segundos con 4G en un Android de gama media.

### 4.12 Integración con los demás PRD

Continúa en la Parte 2 (secciones 5 a 9 y Anexo A): https://docs.google.com/document/d/1Kc3bx3JOONR-p3TnTQ4Dv2OKvsgVbqYEDwK1aQHXz_c/edit

Campo | Detalle
--- | ---
Producto | Onboarding de nuevos clientes del Sistema de Inventario para Kioscos y Comercios (nombre comercial a definir)
Autor | Mauricio Matasini
Estado | Borrador v1
Fecha | 9 de octubre de 2026
Documentos relacionados | "PRD - Sistema de Inventario para Kioscos y Comercios" (en adelante, PRD principal: https://docs.google.com/document/d/1yqHU3xK1EYQle8J5Gag0wweTs9llCHH_X8uo4_km_AA/edit), "PRD - Bot de WhatsApp para Sistema de Inventario" (https://docs.google.com/document/d/1lp7TnN3MiX60OJihJdv7h_26XEAZdmyPtwjwSGEgPv8/edit), "PRD - Caja Digital para Sistema de Inventario" (https://docs.google.com/document/d/14hdf2BbXewzSkjKE25zC8NEMJsDsy2ObI0IKBSt6u0U/edit), "PRD - Facturas de Proveedores para Sistema de Inventario" (https://docs.google.com/document/d/1I38DsgM56HRIyXimafn9wAGPNasTfV8sA4b4Fceoo50/edit), "PRD - Órdenes de Pago para Sistema de Inventario" (https://docs.google.com/document/d/1bXI3SwTzhnZDqViAAPUOsnU_2zL3zc0UopNElLiE_ik/edit), "PRD - Consumos de Servicios para Sistema de Inventario" (https://docs.google.com/document/d/1LbXg794HQq7DFq7CvhDosut8wYHlpldKNhzsJg9RWqE/edit), "Costos estimados por cliente - Sistema de Inventario" (https://docs.google.com/document/d/1h7YaBE-1ZcDfQxt7HWNG-qh5LEraybFIvSngqOnM1pA/edit) y PRD de autenticación de usuarios (en redacción; mientras tanto, la referencia vigente es F8 y 6.12 del PRD principal)
Arquitectura de datos | Una base de datos por cliente (por comercio) más una base de control del Control Plane, igual que en el resto de los PRD. Frontend y backend en Astro + TypeScript. Ingreso con Google (OAuth 2.0 / OpenID Connect), sin contraseñas.
WhatsApp | Un único número central de WhatsApp Business, con WABA y número del proveedor (nosotros). Los kioscos no necesitan su propia cuenta de WhatsApp Business. Cupos de mensajes del bot por plan (ver el documento de costos).

# | Objetivo | Meta inicial (a validar en el piloto)
--- | --- | ---
O1 | Time-to-first-value (TTFV) corto: tiempo desde el login con Google hasta el primer evento de valor (primera consulta respondida por el bot, primer producto cargado o primera venta registrada) | Mediana ≤ 5 minutos; p75 ≤ 15 minutos
O2 | Alta rápida y sin fricción | ≥ 85% de los que inician sesión con Google completan la pantalla de alta; mediana ≤ 90 s para completarla (incluida la verificación del número)
O3 | Aprovisionamiento confiable | Base lista en ≤ 30 s (p50) y ≤ 90 s (p95); ≥ 99,5% de altas sin intervención manual
O4 | WhatsApp vinculado en el alta | ≥ 80% de los dueños verifican su número en el alta; ≥ 60% responden al mensaje de bienvenida dentro de las 24 h
O5 | Activación (definición en 7.1): comercio con ≥ 10 productos, ≥ 1 umbral configurado y ≥ 1 uso real (venta o consulta al bot) dentro de los 7 días | ≥ 50% de las altas activadas a los 7 días
O6 | Checklist completa | ≥ 35% completan los 4 pasos de la checklist en los 14 días de prueba gratis
O7 | Conversión | Prueba gratis (14 días sin tarjeta, PRD principal) → pago ≥ 25% entre los activados
O8 | Costo de alta acotado | Costo de WhatsApp del onboarding ≤ USD 0,10 por alta (verificación + bienvenida + primeras respuestas; con VINCULAR la verificación no usa plantilla paga), medido en whatsapp_usage
O9 | Celular primero: el alta completa y la primera venta se pueden hacer solo con el teléfono | 100% de los pasos del onboarding disponibles en el celular; tasas del embudo en celular no más de 5 puntos por debajo de la PC

Prioridad | Significado
--- | ---
P0 - MVP | Imprescindible para el lanzamiento
P1 - Post-MVP cercano | Dentro de los 2 a 3 meses posteriores al lanzamiento
P2 - Futuro | Según demanda

# | Funcionalidad | MVP (P0) | Más adelante (P1/P2)
--- | --- | --- | ---
ON1 | Pantalla de alta del comercio | Nombre del kiosco, rubro (kiosco, almacén, despensa, librería, otro) y número de WhatsApp en una sola pantalla, después del login con Google | Prellenado desde un link de campaña o de referido (P1)
ON2 | Verificación del WhatsApp: VINCULAR (principal) y código (respaldo) | Principal: botón wa.me (celular) o QR (computadora) que abre WhatsApp con VINCULAR <código> hacia el número central; el backend valida número remitente y código (gratis, abre la ventana de 24 h). Respaldo: código de 6 dígitos enviado por el bot con plantilla de autenticación e ingresado en la web (pago, requiere aprobación de Meta). Vínculo número ↔ dueño en la base de control, opt-in | Verificación por llamada de voz (P2, a verificar)
ON3 | Aprovisionamiento de la base y pantalla de estado | Job idempotente con reintentos y rollback, pantalla de estado con pasos | Base pre-creada desde plantilla para altas instantáneas (P1)
ON4 | Plantillas por rubro | Ubicaciones vacías por defecto según rubro (editables), umbral sugerido por defecto | Categorías y productos sugeridos por rubro (P1), catálogo de códigos sugeridos (P2, PRD principal)
ON5 | Mensaje de bienvenida por WhatsApp | Bienvenida desde el número central con una consulta sugerida y botones; mensaje libre si el usuario escribió primero (lo normal, porque verificó con VINCULAR), plantilla de utilidad si no (verificó con el código de respaldo y no le escribió al bot) | Recordatorio de activación a las 48 h, con opt-in (P1)
ON6 | Video de bienvenida (~2 min) | Seis temas, guion por escenas, subtítulos, visible en la pantalla de estado y desde Ayuda | Videos cortos por módulo (P1), versión vertical para WhatsApp (P2)
ON7 | Tour guiado interactivo | Overlay que resalta un elemento por vez con tooltip, anterior/siguiente, contador, saltar, repetir desde "Ayuda > Ver tour", progreso por usuario, adaptado al rol y al celular | Tours por módulo y "novedades" al cambiar la UI (P1)
ON8 | Checklist de primeros pasos | 4 pasos (10 productos, umbrales, proveedor, empleado), progreso, saltar, retomar | Pasos opcionales por módulo: caja, facturas, órdenes de pago, consumos (P1)
ON9 | Estados vacíos | Cada pantalla vacía explica qué va ahí y ofrece la acción principal | Ilustraciones y tips por rubro (P1)
ON10 | Datos de ejemplo | Comercio de ejemplo aislado ("Modo ejemplo") que se activa y se descarta sin tocar los datos reales | El bot responde en modo ejemplo (P1)
ON11 | Onboarding del empleado invitado | Primer ingreso por invitación, tour del rol Empleado, vinculación opcional del WhatsApp | –
ON12 | Medición del embudo | Eventos de onboarding y activación en la base de control, panel en el Control Plane | Experimentos A/B del onboarding (P2)
ON13 | Celular primero y PWA instalable | Alta, primera pantalla, verificación, tour y primera venta con la cámara, todo desde el teléfono; detección de navegadores integrados; sugerencia de instalar la PWA en la pantalla de inicio | Atajos de la PWA y widgets (P2)

Rubro | Ubicaciones creadas
--- | ---
Kiosco | Mostrador, Góndola 1, Heladera 1, Exhibidor de golosinas, Estante detrás del mostrador, Depósito
Almacén | Mostrador, Góndola 1, Góndola 2, Heladera 1, Freezer, Depósito
Despensa | Mostrador, Estantería 1, Estantería 2, Heladera 1, Depósito
Librería | Mostrador, Estante 1, Vitrina, Exhibidor, Depósito
Otro | Mostrador, Estante 1, Depósito

# | Escena / tema | Seg. aprox. | Qué se ve y qué se dice
--- | --- | --- | ---
0 | Apertura | 6 | Kiosco abriendo la persiana. "Con [Producto] tenés el stock, la caja y los pedidos de tu kiosco en el celular, y un bot que te avisa por WhatsApp."
1 | Ventas | 20 | Se escanea un alfajor con la cámara del celular (y, si hay, con un lector). Aparece "Alfajor Jorgito · Exhibidor de golosinas". Se cobra: el stock baja solo de 24 a 23 y la plata entra a la caja en el medio de pago elegido (efectivo, Mercado Pago, débito).
2 | El bot | 20 | Llega el aviso de stock bajo al WhatsApp ("Se están acabando: Coca 500, Jorgito"). El dueño toca "Urgente ya", el bot arma el pedido para el proveedor y pide confirmación antes de mandarlo.
3 | Caja y resumen diario | 18 | Apertura del día, cobros y pagos registrados solos desde ventas y pedidos, saldos por medio de pago. Al final del día, el resumen de cierre con los números ya calculados. "No tenés que contar ni hacer cuentas." (No hay arqueo.)
4 | Stock | 20 | Alta de un producto nuevo: se escanea el código de barras con la cámara, se saca la foto, se cargan nombre, costo, precio, cantidad y ubicación ("Heladera 1"). Se ve en el listado con su stock.
5 | Facturación | 14 | Al cobrar, se genera un ticket con cantidad, descripción, precio unitario y total, que se puede mostrar o compartir por WhatsApp. Leyenda visible: "Comprobante no válido como factura". (Ver ON6.4.)
6 | Pedidos a proveedores | 18 | Llega el preventista; el dueño le saca una foto a la factura y se la manda al bot. El bot la lee, la cruza con el pedido y con el stock ("Coca 500: pediste 24, llegaron 24") y, con un toque, suma la mercadería al stock y deja el pago anotado.
7 | Cierre | 4 | "Empezá cargando tus primeros 10 productos." Logo y botón "Empezar".
 | Total | 120 | 

# | Módulo | Elemento resaltado | Texto del tooltip
--- | --- | --- | ---
1 | Inicio | Checklist de primeros pasos | "Acá ves lo que te falta para dejar tu kiosco andando."
2 | Ventas | Botón de escaneo del Modo venta | "Acá escaneás el producto para venderlo, con la cámara del celular."
3 | Ventas | Total y botón Cobrar | "Acá elegís cómo te pagan. El stock baja solo y la plata entra a la caja."
4 | Stock | Listado de productos (o su estado vacío) | "Acá ves el stock de cada producto y dónde está."
5 | Stock | Botón "Nuevo producto" | "Acá cargás un producto nuevo con su foto y su código de barras."
6 | Stock | Alertas de stock bajo | "Acá aparecen los productos que se están acabando."
7 | Caja | Apertura del día y saldos | "Acá abrís el día y ves cuánto hay en cada medio de pago."
8 | Caja | Resumen diario / cierre | "Acá ves el resumen del día, ya calculado. No hace falta contar."
9 | Proveedores | Botón "Agregar proveedor" | "Acá cargás a tus proveedores para mandarles los pedidos."
10 | El bot | Configuración → WhatsApp | "Acá ves tu WhatsApp vinculado. El bot te avisa lo que falta y te ayuda con los pedidos."
11 | Ayuda | Menú Ayuda | "Si querés ver esto de nuevo, entrá a Ayuda > Ver tour."

Pantalla | Texto | Acción principal
--- | --- | ---
Productos / stock | "Todavía no cargaste productos. Escaneá el primero con la cámara y en 10 segundos lo tenés." | [Escanear producto] [Cargar a mano] [Ver con datos de ejemplo]
Alertas de stock bajo | "Cuando un producto llegue a su umbral, lo vas a ver acá y te avisamos por WhatsApp." | [Configurar umbrales]
Proveedores | "Cargá a tus proveedores para mandarles pedidos por WhatsApp o email." | [Agregar proveedor]
Pedidos de reposición | "Acá van a aparecer tus pedidos. Los podés armar desde las alertas o desde el bot." | [Ver alertas]
Ventas del día / historial | "Todavía no hay ventas hoy. Escaneá un producto en Modo venta para registrar la primera." | [Hacer mi primera venta]
Caja | "Abrí el día para empezar a registrar cobros y pagos." (sin pedir conteo de efectivo) | [Abrir el día]
Facturas de proveedores | "Sacale una foto a la factura del proveedor y mandásela al bot." | [Abrir WhatsApp]
Usuarios | "Invitá a tus empleados con su email de Google." | [Invitar empleado]
Ubicaciones | Muestra las del rubro (ON4) con el aviso de ON4.5 | [Nueva ubicación]

Documento | Cómo se integra el onboarding | Qué habría que alinear allá (propuesta, sin editar ese PRD)
--- | --- | ---
PRD principal | ON1 detalla el paso 2 del Flujo 1 y el paso 4 del Flujo 13; el aprovisionamiento usa 6.4 (una base por cliente + base de control, migraciones Drizzle, catálogo); las ubicaciones por rubro son ubicaciones de F9; la checklist usa F1/F2 (productos, escaneo), F4 (umbrales), F6 (proveedores) y F8.9 (invitaciones); la primera venta guiada usa el Modo venta con cámara (F2.10) y la búsqueda manual (F2.12); el empleado entra por el Flujo 14; la PWA es la del PRD principal. | El "asistente de bienvenida con tres caminos" (Flujo 1, paso 3) pasa a ser la checklist + tour + estados vacíos + primera venta guiada de este PRD. El criterio de F8 "registrarse y crear el primer producto en menos de 3 minutos" se mantiene como meta, ahora medida en el celular. F8.1 pide CUIT opcional y zona horaria en el alta: acá se difieren o se toman por defecto. El Flujo 1 menciona el lector USB como primera opción: con el principio "solo celular", la cámara pasa a ser el camino por defecto del onboarding. Definir el ticket no fiscal (8.2).
PRD de autenticación (en redacción) | El onboarding empieza después del callback OIDC: usuario sin membership ni invitación → /onboarding; con invitación → ON11. Usa la sesión del lado del servidor (cookie HttpOnly, Secure, SameSite=Lax), CSRF en el formulario y solo los scopes openid email profile. El middleware de Astro redirige a la pantalla de estado mientras el tenant esté aprovisionando o en error. | Que el PRD de autenticación contemple: estado "usuario sin comercio" y retomar un alta abandonada; limpieza de usuarios/tenants abandonados; consentimiento incremental posterior (Google Photos, Gmail) separado del login; login desde navegadores integrados de otras apps (ON13.2); sesión en la PWA instalada, sobre todo en iOS (ON13.7); estado del tour y de la checklist por usuario en la base de control.
PRD del bot de WhatsApp | ON2 reutiliza B1 (vinculación, whatsapp_identities, normalización E.164, VINCULAR por wa.me) y B2 (opt-in); ON5 sigue 6.4 (ventana de 24 h, plantillas de utilidad, botones). | Alineado (9/10/2026): el PRD del bot ya suma la pantalla de alta como punto de entrada de la vinculación (B1.1) y confirma VINCULAR como método principal, con el código por plantilla de autenticación como respaldo explícito (B1.2), según la decisión del dueño (8.2, "Decisiones tomadas"); codigo_verificacion figura en su 6.4 solo para el respaldo. Queda sumar bienvenida_comercio_listo a la lista de 6.4 de ese PRD.
PRD de Caja Digital | El tour y el video muestran apertura del día (C2), cobros por medio de pago (C4), saldos (C6) y resumen de cierre (C12), sin arqueo. El empleado no ve los pasos de saldos ni resumen (permisos de 3.2 de ese PRD). La primera venta guiada registra el ingreso en la caja si el módulo está activo. | Pregunta abierta 5 de ese PRD (C6.2): ¿se piden saldos iniciales por medio en el onboarding? Este PRD propone no pedirlos en el alta (empezar en cero) y ofrecerlos como paso opcional P1 de la checklist.
PRD de Facturas de Proveedores | La escena 6 del video muestra FP1 (foto al bot), FP3 (OCR con confirmación), FP7/FP8 (cruce con pedidos y stock). | La conexión con Google Photos (FP2) no se pide en el alta: se pide con consentimiento incremental la primera vez que se manda una factura.
PRD de Órdenes de Pago | No forma parte del onboarding del MVP; aparece como paso opcional P1 ("Mirá cómo el bot te prepara los pagos"). | Ninguno.
PRD de Consumos de Servicios | No forma parte del onboarding del MVP; la conexión del email (CS1, opt-in explícito) se ofrece después, nunca en el alta. | Ninguno.
Costos por cliente | El onboarding usa el número central (sin WABA por kiosco); su costo de WhatsApp se registra en whatsapp_usage con la marca onboarding y no descuenta del cupo del plan (ON5.8). La verificación con VINCULAR (método principal) hace que en la mayoría de las altas el usuario escriba primero: evita la plantilla de autenticación y la de bienvenida y reduce el uso del límite de mensajería. | Sumar el costo de alta (~USD 0,05–0,10 por alta, estimado) como costo de adquisición. Confirmar qué cupo de mensajes tiene la prueba gratis (8.2).
