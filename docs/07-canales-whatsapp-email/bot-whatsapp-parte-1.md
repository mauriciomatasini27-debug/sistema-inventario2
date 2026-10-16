---
id: MOD-07-BOT-WHATSAPP-PARTE-1
tipo: spec
estado: propuesto
modulos: [bot, email]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: |
  El dueño de un kiosco vive en WhatsApp: ahí habla con los preventistas, con los proveedores y con los
  empleados. Abrir una app web para preguntar "¿cuántos Milka me quedan?" o para armar un pedido mientras
  atiende el mostrador es fricción.
---
> Origen: `PRD - Bot de WhatsApp para Sistema de Inventario.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/whatsapp`, `src/pages/api/whatsapp/*`, `src/db/schema-whatsapp.ts`

---

# PRD - Bot de WhatsApp para Sistema de Inventario - Parte 1 de 2

Documento dividido en 2 partes por tamaño. Parte 1 (este documento): secciones 1 a 4 (resumen, objetivos, usuarios y funcionalidades B1 a B15). Parte 2: secciones 5 (Flujos de usuario) a 8 (Plan por fases) y Anexo A (glosario), en "PRD - Bot de WhatsApp para Sistema de Inventario - Parte 2": https://docs.google.com/document/d/1g7Jr2uByeLXEzNLRQ7bhK7t2tkoDVteb6q-i1PKHjV0/edit. La numeración de secciones y requisitos se mantiene igual que en el documento completo; las referencias a las secciones 5 a 8 y al Anexo A están en la Parte 2.

Nota sobre datos externos: los datos de la WhatsApp Business Platform (Cloud API) que figuran como [a verificar] deben confirmarse en la documentación oficial de Meta antes de implementar. Los que llevan [fuente: Meta] se tomaron de la documentación para desarrolladores de Meta consultada el 9/10/2026, y pueden cambiar.

Actualización 9/10/2026 (decisión del dueño): notificaciones por WhatsApp y email. Las notificaciones proactivas clave (aviso matutino de stock bajo, resumen semanal del viernes y resumen de cierre de caja) se le envían al dueño por los dos canales a la vez: WhatsApp y email (ver el PRD de notificaciones por email). El dueño configura cuáles recibe y con qué frecuencia; cuando una está activada, se usan siempre ambos canales. El bot sigue siendo el canal para lo que el comerciante le escribe (consultas, pedidos, fotos de facturas y confirmaciones). Costo: cada notificación proactiva por WhatsApp es una plantilla de utilidad paga (~USD 0,026 por mensaje en Argentina, cobrada incluso dentro de la ventana de 24 h desde el 1/10/2026); el email no tiene ese costo por mensaje. Arquitectura de WhatsApp: un único número central de WhatsApp Business, con WABA y número propios del proveedor (nosotros), para todos los comercios, con el cupo gratuito de mensajes de servicio compartido entre todos los clientes (ver el documento de costos).

## 1. Resumen / visión general

### 1.1 Problema

El dueño de un kiosco vive en WhatsApp: ahí habla con los preventistas, con los proveedores y con los empleados. Abrir una app web para preguntar "¿cuántos Milka me quedan?" o para armar un pedido mientras atiende el mostrador es fricción. Además, los avisos de stock bajo que se ven solo dentro de la web se pierden si el dueño no entra todos los días, y el pedido semanal se termina armando a las apuradas el lunes a la mañana, mirando la góndola.

### 1.2 Visión

Un bot de WhatsApp separado, que el comerciante usa directamente desde su celular, conectado en vivo al mismo sistema de inventario que la web. El bot es el canal del día a día:

A la mañana le avisa qué productos quedaron bajos en los últimos días (por WhatsApp y por email).

Lo urgente se pide en el momento, desde el mismo chat; lo no urgente se guarda para el viernes.

El viernes le manda un resumen semanal de lo que se vendió y lo que falta (por WhatsApp y por email), para que el pedido salga el lunes, y el pedido se puede hacer desde ese mismo mensaje.

Responde consultas en texto libre ("cuántos Milka tengo", "precio del Jorgito").

Manda los pedidos a los proveedores por email o WhatsApp usando los contactos ya cargados.

Al cerrar la caja le manda el resumen de cierre (PRD de caja, C12), por WhatsApp y por email, si el dueño lo activó.

Le sugiere qué productos promocionar (dormidos, por vencer, sobrestock o candidatos a combo), con una promo concreta y su escenario económico, dentro del resumen del viernes (B15). Es solo una sugerencia: la promo la crea el dueño.

Notificaciones proactivas y bot: las notificaciones clave que inicia la plataforma (puntos 1, 3 y 6) salen por WhatsApp y por email a la vez; el dueño elige cuáles recibe y con qué frecuencia (ver B2 y el PRD de notificaciones por email). El bot es, además, el canal para lo que el comerciante le escribe: consultas, pedidos, fotos de facturas de proveedores (PRD de facturas) y confirmaciones. Todo funciona sobre un único número central de WhatsApp de la plataforma.

La web (Astro) queda para lo que necesita pantalla: fotos y configuración. El bot queda para lo que se hace con una mano mientras se atiende.

### 1.3 Propuesta de valor

"Tu inventario te habla por WhatsApp: te avisa qué falta, le pedís al proveedor con dos toques y le preguntás el stock como a un empleado."

### 1.4 División de trabajo web / bot

Regla general: si necesita pantalla grande, fotos o carga de muchos datos, va a la web; si es una decisión rápida o una pregunta, va al bot. Cuando el bot no puede resolver algo, responde con un link directo a la pantalla correspondiente de la web.

## 2. Objetivos y no-objetivos

### 2.1 Objetivos

### 2.2 No-objetivos (fuera de alcance, al menos en MVP del bot)

No reemplaza a la web: no se sacan ni suben fotos de productos (las fotos de facturas de proveedores sí se mandan al bot, ver PRD de facturas), no se dan de alta productos completos ni proveedores, no se configuran umbrales masivamente desde el bot.

No es un punto de venta ni registra ventas una por una desde el chat en el MVP (registrar movimientos por texto queda para P1).

No es un bot de atención a clientes finales del kiosco: lo usan solo el dueño y sus empleados.

No hace compras automáticas: todo pedido se confirma explícitamente antes de enviarse (igual que en el PRD principal).

No usa el WhatsApp personal del dueño ni librerías no oficiales: solo la WhatsApp Business Platform (Cloud API) oficial de Meta.

No mantiene una copia propia del stock: no hay caché de números de inventario en el bot.

No manda mensajes de marketing ni promociones a los comerciantes por este número. (Las recomendaciones de promociones de B15 no son publicidad de la plataforma: son sugerencias sobre el inventario del propio comercio, para que el dueño decida si arma una promo para sus clientes.)

No usa un número de WhatsApp ni una WABA por comercio: hay un único número central de la plataforma (ver 6.4 y el documento de costos).

## 3. Usuarios

### 3.1 Dueño/a del comercio (rol Dueño)

Es el usuario principal del bot. Usa WhatsApp todo el día, desde un Android de gama media.

Puede: recibir avisos matutinos, alertas, resumen del viernes y resumen de cierre de caja (las notificaciones clave, por WhatsApp y por email a la vez, según lo que active); consultar stock, precio, costo y margen; armar, ajustar, confirmar y enviar pedidos; posponer productos al viernes; activar o desactivar notificaciones.

Es quien vincula su número desde la web y quien autoriza a los empleados a usar el bot.

### 3.2 Empleado/a (rol Empleado)

Usa el bot desde su propio celular, una vez que el dueño lo habilita y el empleado vincula su número.

Puede (por defecto): consultar stock y precio de venta; ver alertas; agregar productos a la lista del viernes; armar un borrador de pedido.

No puede (por defecto): ver costos ni márgenes, confirmar ni enviar pedidos, cambiar preferencias del comercio. Igual que en el PRD principal, es configurable por el dueño ("empleado con permiso para confirmar pedidos").

No recibe el aviso matutino ni el resumen del viernes salvo que el dueño lo active para ese empleado.

### 3.3 Proveedor / preventista (destinatario, no usuario)

Recibe los pedidos por email o por WhatsApp. No interactúa con el bot en el MVP (portal del proveedor y confirmación de pedidos quedan para fases posteriores, como en el PRD principal).

### 3.4 Administrador de la plataforma (equipo propio)

Gestiona desde el Control Plane el número central de WhatsApp de la plataforma (WABA y número propios del proveedor), las plantillas, la calidad del número, los límites de mensajería y los costos. Puede ver métricas del bot por comercio, pero nunca contenido de conversaciones ni datos de stock sin consentimiento y registro (mismo criterio de "impersonación" auditada del PRD principal).

## 4. Funcionalidades

### 4.0 Priorización

### B1. Vinculación del número, seguridad y roles (P0)

Descripción: solo un número de WhatsApp verificado y asociado a un usuario activo de un comercio puede usar el bot. El bot resuelve a qué comercio (y por lo tanto a qué base de datos) pertenece cada mensaje a partir del número, consultando la base de control.

### Requerimientos:

B1.1 La vinculación se inicia desde la web, con el usuario ya autenticado, en dos puntos de entrada: (a) la pantalla de alta del comercio del onboarding, justo después del primer login con Google (ON1 y ON2 del "PRD - Onboarding de Nuevos Clientes para Sistema de Inventario"; para el empleado invitado, su propio onboarding, ON11.3), y (b) Configuración → WhatsApp, para vincular más tarde (por ejemplo, si eligió "Verificar después"), cambiar el número o sumar otro. El usuario ingresa su número; el sistema lo normaliza a E.164 (+54 9 ..., sin 0 ni 15, mismo criterio que F6) y genera un código de un solo uso (6 dígitos, vence en 10 minutos) para el mensaje VINCULAR.

B1.2 Verificación de posesión del número (decidido por el dueño el 9/10/2026; ya no es una recomendación):

Método principal, iniciado por el usuario (VINCULAR): la web muestra un botón (en el celular, un link wa.me) o un QR (en la computadora) que abre WhatsApp con el mensaje precargado VINCULAR 123456 hacia el número central de la plataforma (el mismo para todos los comercios). El comerciante lo envía; al recibirlo, el backend comprueba que el número remitente coincide con el ingresado y que el código es válido, no venció y no se usó. Es gratis (no usa plantilla paga) y el mensaje entrante del usuario abre la ventana de atención de 24 h, así que la confirmación y la bienvenida salen como mensajes interactivos libres. Es el método por defecto en la web y en el onboarding.

Respaldo, código por plantilla de autenticación: cuando el principal no se puede usar (por ejemplo, el usuario se registra desde una computadora donde no puede escanear el QR, o el envío del VINCULAR falla o no llega), la web ofrece "Recibí un código": el bot envía al número ingresado un código de 6 dígitos distinto del de VINCULAR (nunca se muestra en la web) con la plantilla de autenticación codigo_verificacion, y el usuario lo escribe en la web. Vence en 10 minutos, es de un solo uso, se guarda como hash, admite 5 intentos por código y 3 envíos por número por hora. Es pago (plantilla de autenticación, ~USD 0,026 en Argentina, estimado) y requiere la aprobación de Meta [a verificar costo, formato y requisitos de la categoría de autenticación]. Como el usuario no escribió primero, no abre la ventana de 24 h (la bienvenida, si corresponde, va por plantilla de utilidad con opt-in; ON5 del PRD de onboarding). Si la plantilla no está aprobada o está pausada, la opción no se muestra.

En los dos casos, al verificar se invalidan todos los códigos pendientes del número y se registra el método usado (vincular o codigo) en la identidad (B1.3).

B1.3 En la base de control se guarda la identidad de WhatsApp: número E.164, wa_id, usuario, comercio (tenant), rol, estado (pendiente, verificado, revocado), método de verificación (vincular o codigo), fecha de verificación y fecha de opt-in.

B1.4 Resolución del comercio: cada mensaje entrante se resuelve número → identidad verificada → usuario + comercio → conexión a la base de datos de ese comercio, siempre del lado del servidor, igual que la web resuelve la base desde el usuario autenticado. Nunca se toma un identificador de comercio desde el contenido del mensaje.

B1.5 Un número no vinculado recibe solo un mensaje genérico ("Este número no está vinculado a ningún comercio. Vinculalo desde la web: ") sin ningún dato de stock. La excepción es el mensaje VINCULAR <código>, que se procesa según B1.2 antes de la resolución del comercio.

B1.6 Si un número está vinculado a más de un comercio (P1), el bot pide elegir con una lista y recuerda el comercio activo durante la sesión; cada respuesta indica el nombre del comercio.

B1.7 Roles: los permisos son los mismos del PRD principal (F8). El backend aplica los permisos en cada operación; el bot solo oculta opciones, nunca es la única barrera.

B1.8 El dueño puede ver y revocar los números vinculados de su comercio desde la web. Desactivar un usuario (F8.2) revoca automáticamente su acceso al bot.

B1.9 Confirmación antes de enviar: ningún pedido sale a un proveedor sin un paso de confirmación explícito con el resumen final (proveedor, líneas, total estimado, canal).

B1.10 Si el comercio está suspendido por mora (solo lectura, patrón ModoOps), el bot permite consultas pero no envío de pedidos, y explica cómo regularizar.

### Criterios de aceptación:

☐ Desde la web en el celular (pantalla de alta o Configuración → WhatsApp) ingreso mi número, toco "Vincular por WhatsApp", se abre WhatsApp con VINCULAR 482913, lo envío y en menos de 10 segundos el bot me confirma "Listo, este número quedó vinculado a Kiosco La Esquina como Dueño".

☐ En la computadora veo un QR; lo escaneo con el celular, envío el VINCULAR y la web pasa sola a "Verificado".

☐ Vincular con VINCULAR no envía ninguna plantilla: en whatsapp_usage no hay una plantilla de autenticación y la confirmación del bot es un mensaje libre.

☐ Al dar de alta un comercio nuevo, la vinculación aparece en la pantalla de alta del onboarding, sin tener que ir a Configuración → WhatsApp.

☐ Si el mensaje VINCULAR llega desde un número distinto al ingresado, o con el código vencido, la vinculación falla y no se revela a qué comercio correspondía el código.

☐ Respaldo: toco "Recibí un código", me llega por WhatsApp un código de 6 dígitos con la plantilla de autenticación (distinto del que aparece en el link o el QR), lo escribo en la web y el número queda verificado; un código vencido, usado o equivocado 5 veces no verifica, y no puedo pedir más de 3 por hora.

☐ Si la plantilla de autenticación no está aprobada o está pausada, no veo la opción de código y puedo vincular con VINCULAR.

☐ Un número no vinculado que escribe "cuántos Milka tengo" no recibe ningún dato de stock.

☐ Un empleado que pregunta "cuánto me cuesta el Milka" recibe "No tenés permiso para ver costos" si el dueño no se lo habilitó.

☐ Un empleado sin permiso no ve el botón "Confirmar y enviar"; si igual envía la orden por texto, el backend la rechaza.

☐ Si el dueño desactiva a un empleado en la web, el siguiente mensaje de ese empleado al bot ya no accede a datos.

☐ Tests automáticos verifican que un mensaje de un número vinculado al comercio A nunca lee ni escribe en la base del comercio B.

### B2. Opt-in y preferencias de notificación (P0)

Descripción: el bot solo envía mensajes iniciados por la plataforma (avisos, alertas, resumen) a usuarios que dieron su consentimiento explícito, como exige la política de WhatsApp Business [a verificar texto exacto de la política de opt-in]. Las notificaciones proactivas clave (aviso matutino, resumen del viernes y resumen de cierre de caja) se envían por WhatsApp y por email a la vez: el dueño decide cuáles recibe y con qué frecuencia, no el canal.

### Requerimientos:

B2.1 Opt-in explícito al vincular: casilla en la web "Quiero recibir avisos de stock y resúmenes por WhatsApp y por email de [Producto]" con explicación del tipo y frecuencia de mensajes. Se guarda fecha, hora, usuario y texto aceptado.

B2.2 Preferencias configurables (web y bot): qué notificaciones clave recibe el dueño (activar/desactivar aviso matutino, resumen semanal y resumen de cierre de caja) y con qué frecuencia (hora del aviso matutino, por defecto 8:00; día y hora del resumen semanal, por defecto viernes 18:00; resumen de cierre en cada cierre o semanal, según el PRD de caja C10.8). Canal: cuando una notificación clave está activada se envía siempre por los dos canales, WhatsApp y email (decisión del dueño, 9/10/2026; reemplaza la opción anterior de elegir "WhatsApp, email o ambos"). El email se arma según el PRD de notificaciones por email. Zona horaria del comercio (por defecto America/Buenos_Aires).

B2.3 Opt-out: escribir "BAJA" (o "STOP", "no quiero más avisos") desactiva todos los mensajes iniciados por la plataforma por WhatsApp; el usuario puede seguir consultando. "ALTA" los reactiva. El opt-out de WhatsApp es obligatorio por la política de Meta; la baja del email se maneja según el PRD de notificaciones por email (link de baja en cada email y preferencias en la web).

B2.4 Si el usuario no tiene opt-in de WhatsApp o lo revocó, las notificaciones que tenga activadas se mandan solo por email (y la web muestra que el canal WhatsApp está inactivo, con la opción de reactivarlo); si también desactivó el email, no se mandan.

B2.5 Pausa temporal: "pausar avisos 7 días" (vacaciones, comercio cerrado). La pausa aplica a los dos canales.

B2.6 Costo de las notificaciones por WhatsApp: cada notificación proactiva enviada por WhatsApp es una plantilla de utilidad paga de Meta: ~USD 0,026 por mensaje en Argentina, que se cobra incluso dentro de la ventana de 24 h desde el 1/10/2026 y no entra en el cupo gratuito de mensajes de servicio [a verificar contra la tarifa oficial vigente]. Cada envío se contabiliza por comercio (whatsapp_usage) y la pantalla de preferencias de la web muestra una estimación de cuántas notificaciones por WhatsApp va a recibir por mes con la configuración elegida. El email no tiene ese costo por mensaje. Detalle en el documento de costos.

B2.7 Lo que escribe el comerciante sigue en el bot: consultas, pedidos, fotos de facturas y confirmaciones se hacen en el chat del bot (número central); las notificaciones por email incluyen links para continuar en el bot o en la web, pero no reemplazan esas interacciones.

### Criterios de aceptación:

☐ Sin opt-in registrado, el sistema no envía ninguna plantilla a ese número (verificado en logs de envío).

☐ Escribo "BAJA" y el bot responde "Listo, no te voy a mandar más avisos. Podés seguir consultando cuando quieras. Para volver a activarlos escribí ALTA."; al día siguiente no recibo el aviso matutino.

☐ Cambio el aviso matutino a las 7:30 desde el bot y el siguiente llega a las 7:30 hora del comercio.

☐ Con el aviso matutino activado, me llega por WhatsApp y por email con el mismo contenido; no existe la opción de recibir una notificación clave por un solo canal (reemplaza el criterio anterior de "solo email").

☐ Desactivo el resumen semanal y el viernes no me llega ni por WhatsApp ni por email; lo vuelvo a activar y cambio el día a sábado 10:00, y llega por los dos canales a esa hora.

☐ Escribo "BAJA": dejo de recibir las notificaciones por WhatsApp pero las sigo recibiendo por email mientras estén activadas.

☐ Cada notificación enviada por WhatsApp queda registrada en whatsapp_usage como plantilla de utilidad paga (~USD 0,026), y la web me muestra cuántas por mes estimo recibir.

### B3. Consultas de stock en texto libre (P0)

Descripción: el usuario escribe como le habla a un empleado y el bot responde con datos en vivo de la base de su comercio.

### Requerimientos:

B3.1 Interpretación de intención para, como mínimo: consultar stock ("cuántos Milka tengo", "me quedan Marlboro?", "hay coca de 2,25?"), consultar precio ("a cuánto vendo el Jorgito"), consultar costo/margen (solo con permiso), ver alertas ("qué me falta"), ver la lista del viernes, ver pedidos ("qué le pedí a Distribuidora X"), pedir ("pedile 2 cajas de Águila a Carlos"), ayuda.

B3.2 Enfoque en capas: (1) reglas y palabras clave para las intenciones frecuentes; (2) si no alcanza, un modelo de lenguaje con salida estructurada (intención + entidades: producto, cantidad, unidad, proveedor) sin acceso directo a la base, cuyo resultado se valida contra el esquema y los permisos antes de ejecutar nada.

B3.3 Búsqueda difusa de productos en la base del comercio, reutilizando la búsqueda de F1.5 (pg_trgm + unaccent): sin distinguir mayúsculas ni tildes, tolerante a errores de tipeo ("milca", "jorjito"), plurales y abreviaturas comunes ("coca" → Coca-Cola, "pucho"/"atado" → cigarrillos). Tabla de alias por comercio editable en la web.

B3.4 Desambiguación: si hay varios candidatos con puntaje parecido, el bot muestra una lista interactiva (hasta 10 opciones [fuente: Meta]) con nombre y stock; si hay más, pide afinar ("Encontré 14 productos 'Milka'. ¿Cuál? Probá con 'Milka oreo' o 'Milka 100 g'"). Si hay un único candidato claro, responde directo.

B3.5 La respuesta incluye: nombre, stock actual en unidades (y en cajas si aplica), umbral, si está en alerta, y precio de venta. Costo y margen solo para quien tenga permiso.

B3.6 Datos en vivo: cada respuesta consulta el backend en el momento; no hay caché de stock en el bot.

B3.7 Si no entiende, responde con ejemplos y el menú, nunca con un dato inventado.

B3.8 (P2) Mensajes de audio: transcripción y mismo flujo [a verificar costo y calidad].

### Criterios de aceptación:

☐ Escribo "cuántos Milka tengo" con dos productos Milka cargados y recibo una lista con "Milka leche 100 g - 6 u." y "Milka oreo 100 g - 0 u. ⚠" para elegir; elijo uno y recibo el detalle.

☐ Escribo "cuantos jorjito me quedan" y recibo "Alfajor Jorgito: 14 u. (umbral 10). Precio: $900." sin pasos intermedios.

☐ Registro en la web un egreso de 2 unidades y, al volver a consultar por el bot inmediatamente, el stock ya refleja el cambio.

☐ Una consulta sobre un producto inexistente responde "No encontré 'yerba Playadito'. ¿Querés buscar otra cosa?" y ofrece el link para darlo de alta en la web.

☐ El tiempo desde que llega el mensaje hasta la respuesta es menor a 3 segundos en el 95% de las consultas simples.

☐ Un empleado nunca recibe costos ni márgenes en una respuesta si no tiene permiso.

### B4. Alertas de stock bajo con umbral (P0)

Descripción: las alertas son las mismas del PRD principal (F4): un producto entra en alerta cuando su stock es menor o igual a su umbral. El bot las lleva al WhatsApp y permite actuar sobre ellas.

### Requerimientos:

B4.1 El bot usa el umbral por producto definido en la web (F4.1); un producto con umbral 0 nunca genera alerta.

B4.2 Las alertas se agrupan por proveedor (como F4.4); los productos sin proveedor van al grupo "Sin proveedor" y el bot pide asignarlo en la web antes de pedir.

B4.3 Cada alerta permite, con botones interactivos (hasta 3 por mensaje [fuente: Meta]): "Pedir ahora", "Guardar para el viernes", "Ver detalle". Al tocar "Pedir ahora" se abre el pedido de reposición de ese proveedor precargado con sus productos en alerta (equivalente a F4.5).

B4.4 Clasificación sugerida de urgencia (MVP, por reglas): urgente si el stock es 0, o si el producto está marcado como "crítico" por el dueño, o si el stock está por debajo de la mitad del umbral; no urgente en el resto de los casos. El usuario siempre puede cambiar la decisión.

B4.5 "Qué me falta" muestra en cualquier momento las alertas vigentes (datos en vivo).

B4.6 (P1) Alerta inmediata (no esperar al día siguiente) solo para productos marcados como críticos, con límite de una alerta por producto por día para no saturar.

### Criterios de aceptación:

☐ Con umbral 3, cuando el stock del Chocolate Águila llega a 3 el producto aparece en el siguiente aviso matutino y en "qué me falta".

☐ Si se repone y el stock vuelve a superar el umbral antes del aviso, el producto no aparece.

☐ Al tocar "Pedir ahora" en la alerta de Distribuidora X recibo el borrador de pedido con todos sus productos en alerta y sus cantidades sugeridas.

☐ Un producto sin proveedor aparece en "Sin proveedor" con el link a la web para asignarlo, y no se puede pedir desde el bot hasta asignarlo.

### B5. Aviso matutino (P0)

Descripción: cada mañana, a la hora configurada, el bot envía a los usuarios con opt-in un aviso de los productos que quedaron bajos en los últimos días (por defecto, desde el aviso anterior o en los últimos 3 días), por WhatsApp y por email a la vez (decisión del dueño, 9/10/2026; antes decía "por WhatsApp o por email"). El dueño decide si lo recibe y a qué hora; si está activado, usa los dos canales.

### Requerimientos:

B5.1 Job programado por comercio, en la zona horaria del comercio. Solo se envía si hay al menos una novedad (producto que entró en alerta y sigue en alerta, o urgente).

B5.2 Por WhatsApp, el aviso se envía con una plantilla aprobada de categoría utilidad (fuera de la ventana de 24 h solo se pueden enviar plantillas [fuente: Meta]), con variables (nombre del comercio, cantidad de productos, cantidad de urgentes) y botones de respuesta rápida ("Ver y pedir", "Guardar para el viernes", "Pausar avisos") [a verificar cantidad y tipo de botones admitidos en plantillas].

B5.3 Cuando el usuario toca un botón, su respuesta abre la ventana de atención de 24 h y el bot continúa con mensajes interactivos (listas y botones) con el detalle por proveedor.

B5.4 En paralelo, por email, el mismo contenido (según el PRD de notificaciones por email) desde el proveedor transaccional del PRD principal (Resend/Postmark/SES, sección 6.7), con links a la web y un link "Pedir por WhatsApp" que abre el chat con el bot.

B5.5 El contenido de la plantilla debe ser transaccional (estado del inventario del usuario), sin promociones, para que Meta la acepte como utilidad [a verificar criterios de categorización; Meta puede recategorizar plantillas].

B5.6 Los dos canales se envían de forma independiente: si el envío por WhatsApp falla (número sin WhatsApp, plantilla rechazada o pausada, límite de mensajería), se reintenta y el email sale igual; si falla el email, el WhatsApp sale igual. Queda registro del fallo por canal.

B5.7 Costo: cada aviso matutino por WhatsApp es una plantilla de utilidad paga (~USD 0,026 en Argentina, cobrada también dentro de la ventana desde el 1/10/2026). Como solo se envía si hay novedades (B5.1), con un aviso diario son hasta ~30 plantillas por usuario por mes (ver documento de costos).

### Ejemplo (plantilla, texto tentativo a aprobar):

Buen día, Kiosco La Esquina 👋

En los últimos días quedaron 7 productos con stock bajo (2 urgentes, sin stock).

¿Qué querés hacer?

[Ver y pedir]  [Guardar p/ viernes]  [Pausar avisos]



### Criterios de aceptación:

☐ Con 7 productos en alerta, a las 8:00 (hora del comercio) recibo el aviso por WhatsApp y por email; con 0 productos en alerta no recibo nada por ningún canal.

☐ Al tocar "Ver y pedir" recibo en menos de 5 segundos una lista por proveedor con los urgentes primero.

☐ El email del aviso tiene los mismos productos y cantidades que el WhatsApp.

☐ El aviso nunca muestra un producto que ya se repuso al momento del envío (los datos se calculan al enviar, no la noche anterior).

☐ Si el número dejó de tener WhatsApp, el fallo queda registrado y el aviso igual llega por email.

### B6. Urgente ya / no urgente al viernes (P0)

Descripción: desde el aviso matutino o desde cualquier alerta, el dueño decide por producto: lo urgente se pide en el momento; lo no urgente se guarda en la lista del viernes.

### Requerimientos:

B6.1 "Pedir ahora" crea (o reutiliza) un pedido en borrador por proveedor con los productos urgentes y pasa al armado (B7).

B6.2 "Guardar para el viernes" agrega los productos a la lista del viernes: un borrador de pedido por proveedor marcado como "semanal", guardado en la base del comercio con la misma entidad de pedidos del PRD principal (purchase_orders, estado Borrador, con una marca de pedido semanal).

B6.3 Se puede decidir producto por producto (lista interactiva) o todo el grupo de un proveedor de una vez.

B6.4 Un producto que está en la lista del viernes y se vuelve urgente (llega a 0) se avisa en el aviso matutino siguiente con la opción "Pedir ahora".

B6.5 Un producto que se repone antes del viernes sale de la lista automáticamente (o queda marcado "ya repuesto") al armar el resumen.

B6.6 "Lista del viernes" o "qué guardé para el viernes" muestra el contenido en cualquier momento.

B6.7 La lista del viernes también se ve y se edita en la web, en la pantalla de pedidos.

### Criterios de aceptación:

☐ En el aviso matutino toco "Guardar p/ viernes" y los 5 productos no urgentes quedan en la lista del viernes; los 2 urgentes siguen pendientes de decisión.

☐ Escribo "lista del viernes" y veo los productos guardados agrupados por proveedor.

☐ Si un producto guardado se repone el miércoles, el viernes no aparece como faltante.

☐ Un producto no queda duplicado si lo guardo dos veces.

### B7. Armado y ajuste del pedido (P0)

Descripción: el pedido desde el bot respeta las mismas reglas de F5: un pedido por proveedor, cantidad sugerida hasta el stock objetivo, unidad de pedido por producto (unidad, caja o monto) y total estimado.

### Requerimientos:

B7.1 El bot muestra el borrador: proveedor, líneas con nombre, stock actual, cantidad sugerida en la unidad de pedido del producto ("3 cajas (72 u.)", "20 u.", "$50.000") y total estimado según costos (el total en pesos solo para quien puede ver costos).

B7.2 Botones: "Confirmar", "Cambiar cantidades", "Cancelar". "Cambiar cantidades" abre una lista interactiva con las líneas (hasta 10 por mensaje; si hay más, se pagina [fuente: Meta]).

B7.3 Al elegir una línea, el bot ofrece botones según la unidad de pedido: por caja, "−1 caja / +1 caja / Otra cantidad"; por unidad, "−5 / +5 / Otra cantidad"; por monto, "Otro monto". "Otra cantidad" acepta texto ("4", "4 cajas", "30 unidades", "$20.000", "0" o "sacar").

B7.4 También se aceptan cambios en texto libre sobre el pedido abierto: "poné 3 cajas de Águila", "sacá el Jorgito", "agregá 2 cajas de Beldent".

B7.5 Agregar productos que no estaban en alerta (búsqueda difusa de B3, con desambiguación).

B7.6 Cada cambio actualiza el borrador en el backend (el mismo borrador que se ve en la web) y el bot reenvía el resumen actualizado.

B7.7 Un borrador abierto en la web y en el bot a la vez se resuelve con "última escritura gana" por línea y aviso de cambios (MVP); bloqueo optimista con versión del pedido para no perder cambios.

B7.8 (P1) Formulario de cantidades con WhatsApp Flows (pantalla tipo formulario dentro de WhatsApp) para editar varias líneas de una vez [a verificar disponibilidad y costo de Flows].

B7.9 Si la ventana de 24 h se cierra con un borrador abierto, el borrador queda guardado y se retoma desde el bot (cuando el usuario vuelva a escribir) o desde la web.

### Ejemplo:

Pedido a Distribuidora X (borrador)

1. Chocolate Águila 100 g — 3 cajas (72 u.) · stock 3

2. Alfajor Jorgito — 20 u. · stock 4

3. Cigarrillos — $50.000

Total estimado: $142.000

[Confirmar]  [Cambiar cantidades]  [Cancelar]



### Criterios de aceptación:

☐ Un producto "por caja de 24" muestra "3 cajas (72 u.)"; uno "por monto" muestra "$50.000".

☐ Toco "Cambiar cantidades", elijo "Chocolate Águila", toco "+1 caja" y el resumen pasa a "4 cajas (96 u.)" con el total recalculado.

☐ Escribo "sacá el Jorgito" y la línea desaparece del borrador, tanto en el bot como en la web.

☐ Una cantidad en 0 no se incluye en el mensaje al proveedor.

☐ Un empleado ve el borrador sin totales en pesos si no puede ver costos.

☐ Si dejo el borrador a medias y vuelvo al día siguiente, lo encuentro igual.

### B8. Envío del pedido al proveedor (P0)

Descripción: al confirmar, el pedido se envía al proveedor usando los contactos cargados en la web (F6): email y/o WhatsApp.

### Requerimientos:

B8.1 Confirmación obligatoria: antes de enviar, el bot muestra el mensaje final que va a recibir el proveedor, el canal y el destinatario ("Se envía por email a ventas@distribuidorax.com.ar"), con botones "Enviar" y "Volver".

B8.2 Email (P0): se envía desde la dirección transaccional de la plataforma con "Responder a" = email del comercio (mismo esquema de F6.5). El bot confirma "Enviado" cuando el proveedor de email acepta el mensaje, y avisa si rebota (webhook).

B8.3 WhatsApp, MVP (P0): como el proveedor no dio opt-in al número central de la plataforma, el bot le devuelve al dueño el pedido ya armado y un link wa.me al chat del proveedor con el texto precargado (mismo formato que F6.4), para enviarlo desde su propio WhatsApp con un toque. El pedido queda "Enviado (WhatsApp manual)".

B8.4 WhatsApp directo, P1/P2: envío del pedido desde el número central de la plataforma al proveedor (no hay números por comercio; ver 6.4) con una plantilla de utilidad, previo opt-in del proveedor [a verificar requisitos de opt-in de terceros, categoría de plantilla y costo por mensaje en Argentina]. Corresponde a F6.7 del PRD principal.

B8.5 Si el proveedor no tiene ni email ni WhatsApp cargados, el bot no permite enviar y manda el link a la ficha del proveedor en la web.

B8.6 Al confirmar, el pedido pasa a estado Confirmado/Enviado con fecha, hora, usuario, canal y origen "bot" (igual que F5.6/F5.7).

B8.7 Pedido mínimo del proveedor (F6.1): si no se alcanza, el bot avisa antes de confirmar ("El pedido mínimo de Distribuidora X es $150.000; te faltan $8.000").

### Criterios de aceptación:

☐ Confirmo un pedido a un proveedor con email; el proveedor lo recibe en menos de 1 minuto y, si responde, la respuesta le llega al email del comercio.

☐ Confirmo un pedido a un proveedor con solo WhatsApp; recibo el link wa.me, lo toco, se abre el chat del proveedor con el pedido escrito y el pedido queda "Enviado (WhatsApp manual)".

☐ No hay forma de que un pedido salga sin haber tocado "Enviar" en la pantalla de confirmación final.

☐ El mensaje respeta las unidades de pedido (unidad, caja, monto) y es idéntico al que generaría la web para el mismo pedido.

☐ Un empleado sin permiso no puede enviar; el bot le ofrece "Avisarle al dueño", que le manda el borrador al dueño para que lo confirme.

### B9. Resumen semanal del viernes (P0)

Descripción: el viernes, a la hora configurada (por defecto 18:00), el bot envía un resumen de la semana: lo que se vendió y lo que falta, más el pedido sugerido para hacer el lunes. El pedido se puede confirmar desde ese mismo mensaje. Si el resumen está activado, se envía por WhatsApp y por email a la vez.

### Requerimientos:

B9.1 Contenido: top de productos vendidos de la semana (según movimientos de "egreso por venta" del historial F3, lunes a viernes o últimos 7 días), cantidad total de unidades vendidas, productos en alerta, productos sin stock y la lista del viernes consolidada por proveedor.

B9.2 Se envía con una plantilla de utilidad con botones de respuesta rápida: "Ver pedido sugerido", "Programar para el lunes", "Ver resumen completo" [a verificar]. En paralelo se envía el mismo resumen por email (PRD de notificaciones por email), con links a la web y para abrir el pedido sugerido en el bot.

B9.3 "Ver pedido sugerido" abre los borradores por proveedor (B7), ya con la lista del viernes y las alertas vigentes, para ajustar y enviar en el momento si el dueño quiere.

B9.4 "Programar para el lunes": el dueño revisa y deja el pedido confirmado para salir el lunes a la hora elegida (por defecto 8:00). El lunes, antes de enviar, el sistema recalcula con stock en vivo y, si algo cambió (un producto ya repuesto, nuevos faltantes), le pide al dueño que vuelva a confirmar; si nada cambió, se envía y se avisa.

B9.5 Recordatorio el lunes a la mañana si quedaron pedidos semanales sin confirmar.

B9.6 Resumen completo en la web (link) para el detalle por producto.

B9.7 La hora y el día son configurables por comercio (algunos proveedores visitan otros días); el valor por defecto está pensado para que el dueño mire el resumen el fin de semana y pida el lunes.

B9.8 Costo: cada resumen por WhatsApp es una plantilla de utilidad paga (~USD 0,026 en Argentina, ~4,3 por mes con un resumen semanal); los recordatorios del lunes y "pedido programado para confirmar" también son plantillas pagas.

B9.9 (P1) Recomendación de promociones dentro del resumen: cuando hay sugerencias de B15, el resumen del viernes suma una línea corta ("💡 2 productos para promocionar") con el botón "Ver promos"; no se manda ninguna plantilla adicional para eso (ver B15).

### Ejemplo (plantilla, texto tentativo a aprobar):

Resumen semanal de Kiosco La Esquina (5 al 9/10)

Vendiste 1.240 unidades. Lo más vendido: Coca-Cola 500 ml (96), Alfajor Jorgito (80), Beldent (64).

Te faltan 12 productos de 3 proveedores. El pedido sugerido ya está armado para el lunes.

[Ver pedido sugerido]  [Programar p/ lunes]  [Resumen completo]



### Criterios de aceptación:

☐ El viernes a las 18:00 recibo el resumen por WhatsApp y por email con los más vendidos según los egresos por venta de la semana, coincidiendo con el historial de la web.

☐ Toco "Ver pedido sugerido" y veo un borrador por proveedor con la lista del viernes más las alertas vigentes.

☐ Toco "Programar p/ lunes", confirmo, y el lunes a las 8:00 el pedido sale; si el domingo se repuso un producto, el lunes el bot me pide reconfirmar sin ese producto.

☐ Si el lunes a las 10:00 todavía no confirmé, recibo un recordatorio.

☐ Un comercio sin ventas registradas en la semana recibe el resumen igual, con la aclaración "No hay ventas registradas esta semana" y los faltantes.

### B10. Gestión del día a día (P0 parcial / P1)

### Requerimientos:

B10.1 (P0) "Pedidos" o "qué pedí": lista de pedidos en borrador, programados y enviados en los últimos 14 días, con estado y canal.

B10.2 (P0) "Últimos movimientos de Milka": los últimos 5 movimientos del producto (tipo, cantidad, usuario, fecha), con link al historial completo en la web.

B10.3 (P1) Registrar ingresos y egresos por texto: "vendí 3 Milka", "se rompieron 2 Coca de vidrio", "entraron 2 cajas de Águila". Siempre con confirmación ("¿Registro egreso por venta −3 Milka leche 100 g? Stock quedaría en 3") y con los mismos motivos de F1.7.

B10.4 (P1) Recepción del pedido (F5.8): "llegó el pedido de Distribuidora X" → el bot muestra lo pedido, se marca lo recibido (con diferencias) y se genera el ingreso de stock.

B10.5 (P1) Reenviar o cancelar un pedido enviado (con aviso al proveedor).

### Criterios de aceptación:

☐ Escribo "qué le pedí a Distribuidora X" y veo el último pedido con fecha, estado y líneas.

☐ (P1) Escribo "vendí 3 Milka", confirmo, y en la web aparece el movimiento "Egreso por venta −3" con mi usuario y origen "bot".

☐ (P1) Ningún movimiento se registra sin el paso de confirmación.

### B11. Auditoría (P0)

### Requerimientos:

B11.1 Todo cambio de stock originado en el bot genera un movimiento en el historial de movimientos (F3) con origen "bot WhatsApp", usuario, fecha y hora, igual que cualquier otro origen. Los movimientos siguen siendo inmutables.

B11.2 Todo cambio en pedidos (crear, editar líneas, programar, confirmar, enviar, cancelar) queda registrado en el audit_log con usuario, origen "bot", valor anterior y nuevo.

B11.3 Log del bot en la base del comercio: mensaje entrante (id de WhatsApp, número, tipo, intención detectada, entidades), acción ejecutada, resultado y mensaje saliente (id, plantilla usada, estado de entrega: enviado, entregado, leído, fallido). Retención configurable (por defecto 12 meses).

B11.4 En la base de control solo se guardan métricas agregadas (cantidad de mensajes, costos por plantilla) por comercio, sin contenido.

B11.5 Sin PII ni contenido de mensajes en los logs de aplicación (Sentry, logs estructurados), igual que el PRD principal.

### Criterios de aceptación:

☐ Un pedido confirmado desde el bot muestra en la web "Confirmado por Mauricio vía WhatsApp, 09/10/2026 08:14".

☐ Cada mensaje enviado tiene su estado de entrega registrado a partir de los webhooks de estado.

☐ No existe forma de cambiar stock o pedidos desde el bot sin que quede rastro.

### B12. Ayuda, menú y manejo de errores (P0)

### Requerimientos:

B12.1 "Hola", "menú" o "ayuda" muestran un menú con lista interactiva: Qué me falta, Consultar stock, Lista del viernes, Mis pedidos, Avisos y preferencias, Abrir la web.

B12.2 Mensajes cortos, en castellano rioplatense, con "vos", sin tecnicismos.

B12.3 Errores claros: "No pude conectarme con tu inventario, probá en un minuto" (nunca un número viejo como respuesta de respaldo).

B12.4 Tipos de mensaje no soportados (fotos de productos, stickers, ubicación, audios en MVP; las fotos de facturas de proveedores sí se procesan, ver PRD de facturas FP1) reciben una respuesta amable explicando qué se puede hacer, y, para fotos, el link a la web.

B12.5 Límites por usuario (rate limiting) para evitar abusos y costos inesperados.

### Criterios de aceptación:

☐ Escribo "hola" y recibo el menú en menos de 3 segundos.

☐ Si mando una foto de un producto, el bot me explica que las fotos se cargan desde la web y me manda el link a la ficha.

☐ Si el backend no responde, el bot avisa el error y no muestra datos de stock.

### B13. Escala para catálogos grandes (P0)

Descripción: el bot tiene que responder igual de rápido con un catálogo de 8.000 productos que con uno de 200. Las consultas puntuales usan índices de la base del comercio, y las consultas generales ("qué se está acabando", "qué me falta", "lista del viernes", resumen semanal) nunca devuelven la lista completa: se ordenan por urgencia y se paginan de a 10.

### Requerimientos:

B13.1 Las consultas de stock por código usan el índice único (btree) sobre el código de producto en la base del comercio (product_codes, igual que el PRD principal).

B13.2 Las consultas por nombre (búsqueda difusa de B3) usan índices sobre el nombre normalizado: trigramas (pg_trgm, índice GIN/GiST) sobre el nombre sin tildes (unaccent), y opcionalmente búsqueda de texto completo (tsvector en español) para consultas de varias palabras. Nunca se recorre la tabla entera de productos para responder un mensaje.

B13.3 Consultas generales paginadas: "qué se está acabando", "qué me falta", "sin stock", "lista del viernes" y el detalle del aviso matutino y del resumen del viernes muestran los 10 productos más urgentes primero y un botón "Ver más" (o el texto "ver más") para traer los 10 siguientes, hasta agotar la lista. Cada página indica el avance ("10 de 47").

B13.4 Ranking de urgencia: se ordena por un puntaje que combina el stock relativo al umbral (stock / umbral; 0 = sin stock primero), la velocidad de venta (egresos por venta promedio por día de las últimas 2 a 4 semanas, desde el historial F3) y los días estimados de cobertura (stock / velocidad de venta). Desempate: productos marcados como críticos, luego por nombre. Los pesos exactos se calibran en la beta.

B13.5 Filtros sobre las listas generales en texto libre: por proveedor ("qué se está acabando de Distribuidora X") o categoría ("qué falta de golosinas"), con la misma paginación.

B13.6 La paginación es estable: si mientras el usuario pagina cambia el stock de algún producto, "Ver más" no repite ni saltea productos de la lista que está recorriendo (paginación por cursor sobre el orden calculado).

B13.7 Los mensajes respetan los límites de largo de WhatsApp (ver 6.11): cada página entra en un único mensaje (lista interactiva de hasta 10 filas o texto corto); si no entra, se recorta la descripción, nunca se parte un producto en dos mensajes.

B13.8 Los avisos programados (matutino y viernes) calculan el ranking en la base del comercio con consultas agregadas indexadas, en un job por comercio, sin afectar el rendimiento de la web.

### Criterios de aceptación (objetivos de rendimiento, a validar en la beta):

☐ Objetivo: con 8.000 productos activos, "cuántos Milka tengo" responde en menos de 3 segundos de punta a punta (desde que llega el mensaje hasta que sale la respuesta) en el 95% de los casos, y la búsqueda en la base tarda menos de 300 ms.

☐ Objetivo: con 8.000 productos activos, una consulta por código exacto resuelve en la base en menos de 50 ms.

☐ Objetivo: con 8.000 productos y 300 en alerta, "qué se está acabando" devuelve los 10 primeros en menos de 3 segundos de punta a punta.

☐ Escribo "qué se está acabando" con 47 productos en alerta y recibo los 10 más urgentes (los sin stock y de mayor venta primero), con el texto "10 de 47" y el botón "Ver más".

☐ Toco "Ver más" cuatro veces y recorro los 47 productos sin repetidos ni faltantes, aunque en el medio se registre una venta.

☐ Con menos de 10 productos en alerta, la lista no muestra el botón "Ver más".

☐ Ningún mensaje del bot es rechazado por la API por superar el largo máximo (verificado en logs de envío con catálogos de prueba de 8.000 productos).

☐ El plan de ejecución de las consultas de búsqueda y de alertas usa los índices (verificado con EXPLAIN en tests de rendimiento con un catálogo sintético de 8.000 productos).

### B14. Resumen de cierre de caja por WhatsApp y email (P1)

Descripción: cuando se cierra la jornada de la caja (cierre manual o automático, PRD de caja C12), el dueño recibe el resumen de cierre por WhatsApp y por email a la vez, si lo activó. El contenido y los números salen del snapshot del cierre del PRD de caja (C10.1, C10.8); este documento define la entrega por el bot.

### Requerimientos:

B14.1 Se dispara con el evento de cierre de la caja (manual o automático), una sola vez por jornada (C12.4), en la zona horaria del comercio.

B14.2 El dueño configura si lo recibe y con qué frecuencia (en cada cierre o un resumen semanal, según C10.8); cuando está activado se envía siempre por los dos canales.

B14.3 Por WhatsApp se envía con la plantilla de utilidad resumen_cierre_caja (ingresos y egresos por medio, resultado, saldo total, apertura y cierre con usuario o "automático") y un botón "Ver detalle" que abre la web; por email, el mismo contenido según el PRD de notificaciones por email.

B14.4 Solo lo recibe el Dueño (o un empleado al que el dueño le habilite ver saldos, C6.6).

B14.5 Los números son exactamente los del snapshot del cierre: el bot no recalcula nada.

B14.6 Costo: cada resumen de cierre por WhatsApp es una plantilla de utilidad paga (~USD 0,026 en Argentina, cobrada también dentro de la ventana desde el 1/10/2026); con un envío por cierre son ~30 por mes, con la frecuencia semanal ~4,3. La pantalla de preferencias muestra esa diferencia.

### Criterios de aceptación:

☐ Con el resumen de cierre activado, al cerrar la caja recibo el resumen por WhatsApp y por email, con los mismos números que la app.

☐ Si lo desactivo, no llega por ninguno de los dos canales; si elijo frecuencia semanal, llega una vez por semana por los dos canales.

☐ Un cierre automático después de un cierre manual no genera un segundo envío.

☐ Un empleado sin permiso para ver saldos no recibe el resumen.

☐ Cada envío por WhatsApp queda contabilizado como plantilla paga en whatsapp_usage.

### B15. Recomendación de promociones (P1)

Descripción: el bot le sugiere al dueño qué productos conviene promocionar y con qué promo concreta, con el escenario económico de cada sugerencia, para liberar plata inmovilizada o evitar pérdidas por vencimiento. Es solo una sugerencia: nada se crea ni cambia de precio sin que el dueño toque "Crear promo" y confirme en la web. La lógica de selección, los tipos de promoción y las fórmulas (ganancia por unidad, punto de equilibrio, escenarios, comparación con la pérdida por vencimiento, resultado real) están definidos en el PRD de rotación (https://docs.google.com/document/d/1ABXzORmd9_o3oYxmBm6878l2VZufCKgrIyAXTifdPeQ/edit; marcado para promoción RT9 y productos dormidos RT4); este PRD define solo cómo se entregan por WhatsApp.

### Requerimientos:

B15.1 Candidatos: productos de baja rotación (dormidos), productos próximos a vencer, productos con sobrestock (cobertura muy por encima de lo normal) y candidatos a combo (por ejemplo, un dormido que se puede combinar con uno de alta rotación), según las reglas del PRD de rotación. Como máximo 3 sugerencias por resumen, ordenadas por impacto económico.

B15.2 Promo concreta sugerida por producto, entre los tipos definidos en el PRD de rotación: 2x1, NxM (por ejemplo, 3x2), segunda unidad al X% de descuento o combo con otro producto.

B15.3 Escenario económico de cada sugerencia (calculado con las fórmulas del PRD de rotación, solo para quien puede ver costos):

ganancia por unidad antes y con la promo;

cuánto se pierde si las ventas no suben (mismas unidades que hoy, con el precio promocional);

cuántas unidades extra hacen falta para quedar igual (punto de equilibrio);

ganancia esperada en tres escenarios: pesimista, base y optimista, basados en las promos anteriores del propio comercio cuando existen o, si no, en supuestos por defecto, rotulados como tales ("Estimación con supuestos por defecto: todavía no hay promos tuyas para comparar");

para productos próximos a vencer, la comparación con la pérdida del stock que vence si no se hace nada ("Si no vendés estas 12 u. antes del 20/10 perdés $14.400; con la promo, en el escenario base, perdés $3.100").

B15.4 Mensajes cortos: por WhatsApp va una sola línea de resumen por sugerencia (producto, promo y resultado del escenario base) y el botón "Ver detalle", que abre la web con el escenario completo (antes/con promo, pérdida si no suben las ventas, punto de equilibrio, los tres escenarios y su origen, vencimiento). Ejemplo: "Shampoo sachet: 2da unidad al 50%. Escenario base: +$4.200 en 2 semanas (supuestos por defecto)." [Crear promo] [Ahora no] [Ver detalle]. Los botones respetan los límites de Meta (hasta 3, de hasta 20 caracteres).

B15.5 Botones: "Crear promo" responde con el link a la funcionalidad de descuentos/promociones de la web (PRD principal, vía RT9 del PRD de rotación) con la promo precargada; el dueño la confirma ahí. "Ahora no" descarta la sugerencia de ese producto por un período (por defecto, 2 semanas) y queda registrado. "Ver detalle" abre el escenario en la web.

B15.6 Entrega dentro del resumen del viernes: las sugerencias van dentro del resumen semanal (B9.9), sin plantilla adicional: el botón "Ver promos" del resumen es un mensaje del usuario que abre la ventana, y las sugerencias se mandan como mensajes interactivos. En el email del resumen (PRD de notificaciones por email) va el mismo bloque con links a la web.

B15.7 Alerta urgente de vencimiento (opcional): si el dueño la activa en las preferencias de notificación (por defecto, desactivada), cuando un producto con stock significativo está por vencer antes del próximo resumen, el bot manda una alerta propia con la plantilla de utilidad alerta_vencimiento_promo (paga, ~USD 0,026 por mensaje en Argentina [a verificar]), con la misma línea corta y los botones de B15.4. Respeta el opt-in, "BAJA" y la pausa (B2), y como máximo una por día.

B15.8 Resultado al terminar la promo: cuando termina la vigencia de una promo creada desde una sugerencia, el bot informa el resultado real contra el pronóstico (unidades y ganancia reales vs. el escenario base, y en qué escenario cayó), con la fórmula del PRD de rotación: una línea corta y "Ver detalle". Va dentro del siguiente resumen del viernes (sin plantilla adicional). Los resultados alimentan los escenarios de las próximas sugerencias del comercio.

B15.9 Permisos y auditoría: las sugerencias con costos, márgenes y escenarios solo las ve quien puede ver costos (Dueño, F8); al Empleado no se le envían. Cada sugerencia, "Crear promo", "Ahora no" y resultado quedan en el log del bot (B11) sin datos de otros comercios.

B15.10 Cálculo determinista: los números salen de las fórmulas del PRD de rotación (SQL/código), nunca de un modelo de lenguaje; el bot solo arma el mensaje.

### Criterios de aceptación:

☐ Con un producto dormido según las reglas del PRD de rotación, el resumen del viernes trae la línea "💡 1 producto para promocionar" y, al tocar "Ver promos", recibo una sugerencia con la promo concreta (por ejemplo, "2da unidad al 50%") y los botones "Crear promo", "Ahora no" y "Ver detalle".

☐ La sugerencia por WhatsApp ocupa una línea de resumen por producto; "Ver detalle" abre la web con la ganancia por unidad antes y con la promo, la pérdida si las ventas no suben, las unidades extra para el punto de equilibrio y los escenarios pesimista, base y optimista.

☐ Si el comercio no tiene promos anteriores, los escenarios aparecen rotulados como "supuestos por defecto"; después de una promo terminada, el rótulo indica que se basan en mis promos anteriores.

☐ Para un producto por vencer, el detalle compara el resultado de la promo con la pérdida del stock que vence si no hago nada.

☐ Los números del bot y de la web coinciden con los que da la fórmula del PRD de rotación para los mismos datos.

☐ Toco "Crear promo" y se abre la web con la promo precargada; no se crea ninguna promo ni cambia ningún precio hasta que la confirmo ahí.

☐ Toco "Ahora no" y ese producto no se me vuelve a sugerir durante 2 semanas.

☐ Las sugerencias del resumen del viernes no generan ninguna plantilla adicional en whatsapp_usage.

☐ Con la alerta urgente de vencimiento desactivada (por defecto) no recibo ninguna alerta fuera del resumen; si la activo, recibo como máximo una por día, registrada como plantilla de utilidad paga.

☐ Al terminar una promo creada desde una sugerencia, el siguiente resumen me informa el resultado real contra el pronóstico (unidades y ganancia, y en qué escenario cayó).

☐ Un empleado no recibe sugerencias con costos, márgenes ni escenarios.

Continúa en la Parte 2 (secciones 5 a 8 y Anexo A): https://docs.google.com/document/d/1g7Jr2uByeLXEzNLRQ7bhK7t2tkoDVteb6q-i1PKHjV0/edit

Campo | Detalle
--- | ---
Producto | Bot de WhatsApp del Sistema de Inventario para Kioscos y Comercios (nombre comercial a definir)
Autor | Mauricio Matasini
Estado | Borrador v1
Fecha | 9 de octubre de 2026
Documento relacionado | "PRD - Sistema de Inventario para Kioscos y Comercios" (en adelante, PRD principal). Este documento usa su misma terminología (comercio/tenant, movimiento, umbral de stock bajo, stock objetivo, unidad de pedido, roles Dueño/Empleado) y sus funcionalidades F1 a F8.
Documentos relacionados (notificaciones y costos) | "PRD - Notificaciones por Email para Sistema de Inventario" (en adelante, PRD de notificaciones por email: https://docs.google.com/document/d/1RUZ1PY_98eE0cvmL5lL5Ij39cO0nC627I0qAgICf4W0/edit), "Costos estimados por cliente - Sistema de Inventario" (en adelante, documento de costos), "PRD - Caja Digital para Sistema de Inventario" (PRD de caja) y "PRD - Facturas de Proveedores para Sistema de Inventario" (PRD de facturas), todos en la misma carpeta. También "PRD - Reportes de Rotación de Productos para Sistema de Inventario" (en adelante, PRD de rotación: https://docs.google.com/document/d/1ABXzORmd9_o3oYxmBm6878l2VZufCKgrIyAXTifdPeQ/edit), que define la lógica, los tipos de promoción y las fórmulas de la recomendación de promociones (B15).
Arquitectura de datos | Una base de datos por cliente (por comercio), igual que ModoOps, más una base de control del Control Plane. El bot no tiene datos propios de stock: lee y escribe siempre a través del mismo backend que la web.

Tarea | Web (Astro) | Bot de WhatsApp
--- | --- | ---
Fotos de productos | ✔ (cámara/galería, compresión en el cliente, F1.3) | ✘
Configuración: alta y edición de productos, códigos, carga del catálogo con escáner (F1, F2) | ✔ | ✘ (solo consulta)
Configuración: proveedores y contactos (F6), umbrales y stock objetivo (F4), unidades de pedido (F5), costos y precios (F7) | ✔ | ✘ (solo consulta)
Usuarios, roles, suscripción, vinculación del número de WhatsApp, preferencias de notificaciones (F8) | ✔ | Solo confirmar la vinculación y opt-in/opt-out
Historial completo con filtros (F3) | ✔ | Resumen corto ("últimos movimientos de X")
Alertas de stock bajo | Panel (F4) | ✔ Aviso matutino y alertas (el aviso matutino también llega por email)
Pedidos de reposición | ✔ Edición completa (F5) | ✔ Armar, ajustar cantidades, confirmar y enviar
Envío del pedido al proveedor | ✔ (F6) | ✔
Consultas de stock y precio | ✔ Búsqueda | ✔ Texto libre
Resumen semanal | Reportes (fase posterior del PRD principal) | ✔ Resumen del viernes (también llega por email)
Resumen de cierre de caja | ✔ Caja (PRD de caja, C12) | ✔ Por WhatsApp y por email, si el dueño lo activa (B14)
Fotos de facturas de proveedores | Carga desde la web (P1, PRD de facturas) | ✔ El comerciante manda la foto al bot (PRD de facturas, FP1)

# | Objetivo | Cómo se mide
--- | --- | ---
OB1 | Que el dueño se entere de los faltantes sin entrar a la web | % de avisos matutinos abiertos/respondidos
OB2 | Reducir quiebres de stock de productos clave | Alertas urgentes resueltas con un pedido en menos de 24 h
OB3 | Pedido al proveedor desde el chat en menos de 1 minuto | Tiempo desde el aviso hasta el pedido enviado
OB4 | Ordenar la compra semanal: pedido listo el lunes | % de comercios que confirman el pedido semanal entre viernes y lunes
OB5 | Respuestas correctas a consultas en texto libre | % de consultas resueltas sin desambiguar más de una vez; % de "no entendí"
OB6 | Datos siempre en vivo | 0 respuestas con stock desactualizado (verificado contra la base del comercio)
OB7 | Adopción del bot como canal diario | % de comercios pagos con número vinculado; usuarios activos semanales en el bot

Prioridad | Significado
--- | ---
P0 - MVP del bot | Imprescindible para lanzar el bot
P1 - Post-MVP cercano | Dentro de los 2 a 3 meses posteriores al lanzamiento del bot
P2 - Futuro | Según demanda

# | Funcionalidad | MVP (P0) | Más adelante (P1/P2)
--- | --- | --- | ---
B1 | Vinculación del número, seguridad y roles | Vinculación desde la web (pantalla de alta del onboarding o Configuración → WhatsApp) con VINCULAR por wa.me/QR como método principal y código por plantilla de autenticación como respaldo, resolución número → comercio vía Control Plane, roles Dueño/Empleado | Varios comercios por número con selector (P1), desvinculación remota de dispositivos perdidos (P1)
B2 | Opt-in y preferencias de notificación | Opt-in explícito, opt-out con "BAJA", horarios; el dueño elige qué notificaciones clave recibe y con qué frecuencia, y las activadas salen por WhatsApp y email a la vez | Preferencias por empleado (P1)
B3 | Consultas de stock en texto libre | Intención + búsqueda difusa + desambiguación con lista | Consultas compuestas y por categoría/proveedor (P1), mensajes de audio (P2)
B4 | Alertas de stock bajo con umbral | Alertas incluidas en el aviso matutino, con botones para pedir | Alerta inmediata para productos marcados como críticos (P1)
B5 | Aviso matutino | Plantilla diaria por WhatsApp y, a la vez, email con lo que quedó bajo en los últimos días | Sugerencia de urgencia por rotación (P2)
B6 | Urgente ya / no urgente al viernes | Botones "Pedir ahora" y "Guardar para el viernes"; lista del viernes por proveedor | Recordatorio el día de visita del proveedor (P1)
B7 | Armado y ajuste del pedido | Lista interactiva, cantidades por unidad, caja o monto, total estimado | Formulario de cantidades con WhatsApp Flows (P1, a verificar)
B8 | Envío del pedido al proveedor | Email transaccional y mensaje listo para reenviar por WhatsApp (link wa.me) | Envío directo al proveedor por Cloud API con plantilla (P1/P2)
B9 | Resumen semanal del viernes | Vendido en la semana + faltantes + pedido sugerido listo para el lunes, por WhatsApp y email a la vez | Comparación contra semanas anteriores (P1)
B10 | Gestión del día a día | Consultar pedidos en curso, ver últimos movimientos | Registrar ingresos/egresos por texto (P1), recepción del pedido (P1)
B11 | Auditoría | Todo cambio queda en el historial de movimientos (F3) y en un log del bot | Exportación del log (P1)
B12 | Ayuda, menú y errores | Menú, "ayuda", mensajes claros, link a la web | Onboarding guiado dentro del chat (P1)
B13 | Escala para catálogos grandes | Búsquedas indexadas (código y nombre), listas generales paginadas: top 10 más urgentes + "Ver más" | Ranking con estacionalidad (P2)
B14 | Resumen de cierre de caja | — (los eventos de caja están disponibles desde el MVP de la caja, PRD de caja C10) | Envío del resumen de cierre al dueño por WhatsApp y email a la vez, si lo activa, con la frecuencia elegida (P1, según el PRD de caja C12)
B15 | Recomendación de promociones | — | Sugerencia de qué productos promocionar (dormidos, por vencer, sobrestock, candidatos a combo) con promo concreta, escenario económico, botones "Crear promo" / "Ahora no" dentro del resumen del viernes; alerta urgente de vencimiento opcional (plantilla de utilidad paga); resultado real vs. pronóstico al terminar la promo (P1, lógica y fórmulas en el PRD de rotación)
