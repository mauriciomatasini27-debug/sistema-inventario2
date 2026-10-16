---
id: MOD-07-BOT-WHATSAPP-PARTE-2
tipo: spec
estado: propuesto
modulos: [bot, email]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: |
  El bot usa el mismo backend que la web y una base de datos por cliente, como ModoOps; la base se resuelve
  desde el número de teléfono a través de la base de control del Control Plane. Las fotos y la configuración se
  hacen en la web; el bot es para el día a día. Ningún pedido sale sin confirmación explícita.
---
> Origen: `PRD - Bot de WhatsApp para Sistema de Inventario - Parte 2.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/whatsapp`, `src/pages/api/whatsapp/*`

---

# PRD - Bot de WhatsApp para Sistema de Inventario - Parte 2 de 2

Documento dividido en 2 partes por tamaño. Parte 1: secciones 1 a 4 (resumen, objetivos, usuarios y funcionalidades), en el documento original: https://docs.google.com/document/d/1lp7TnN3MiX60OJihJdv7h_26XEAZdmyPtwjwSGEgPv8/edit. Parte 2 (este documento): secciones 5 (Flujos de usuario) a 8 (Plan por fases) y Anexo A (glosario). La numeración de secciones y requisitos se mantiene igual que en el documento completo; las referencias cruzadas a las secciones 1 a 4 están en la Parte 1.

## 5. Flujos de usuario

### Flujo 1: vinculación del número y opt-in

El dueño llega a la vinculación desde la pantalla de alta del onboarding (primer ingreso, Flujo 11) o, más tarde, desde la web → Configuración → WhatsApp → "Vincular mi WhatsApp".

Ingresa 11 5555-1234; la web lo normaliza a +54 9 11 5555 1234, muestra la casilla de opt-in con el detalle de los avisos (que llegan por WhatsApp y por email) y el dueño la marca.

En el celular toca "Vincular por WhatsApp" (en la computadora, escanea el QR con el celular). Se abre el chat con el número central de la plataforma con el texto VINCULAR 482913. Lo envía (gratis: no usa plantilla, y abre la ventana de 24 h).

Bot: "¡Hola Mauricio! Listo, este número quedó vinculado a Kiosco La Esquina como Dueño. Te voy a mandar el aviso de faltantes todos los días a las 8:00 y el resumen semanal los viernes a las 18:00, por acá y por email. Podés cambiarlo escribiendo avisos. Para empezar, probá escribir cuántos Milka tengo."

La web muestra el número como "Verificado" y el registro de opt-in.

Variante con el código de respaldo: si está en una computadora y no puede escanear el QR (o el VINCULAR no llega), toca "Recibí un código"; le llega por WhatsApp la plantilla de autenticación codigo_verificacion con un código de 6 dígitos, lo escribe en la web y el número queda verificado. Como no escribió primero, el mensaje del paso 4 no se puede mandar como mensaje libre: la web le sugiere "Probar el bot ahora" y, si marcó el opt-in, la bienvenida del alta va por plantilla de utilidad (PRD de onboarding, ON5).

### Flujo 2: consulta de stock en texto libre con desambiguación

Dueño: "cuántos Milka tengo"

Bot (lista interactiva): "Encontré 3 productos. ¿Cuál querés ver?" → [Elegir]

Milka leche 100 g — 6 u.

Milka oreo 100 g — 0 u. ⚠

Milka almendras 45 g — 12 u.

Dueño toca "Milka oreo 100 g".

Bot: "Milka oreo 100 g: sin stock (umbral 4). Precio $2.300. Proveedor: Distribuidora X." [Pedir ahora] [Guardar p/ viernes] [Otra consulta]

Dueño toca "Guardar p/ viernes". Bot: "Listo, Milka oreo quedó en la lista del viernes de Distribuidora X."

Variante sin ambigüedad: Dueño: "me quedan jorjitos?" → Bot: "Alfajor Jorgito: 14 u. (umbral 10). Precio $900."

### Flujo 3: aviso matutino → urgente ya, el resto al viernes

8:00. Bot (plantilla de utilidad, paga; en paralelo llega el mismo aviso por email): "Buen día, Kiosco La Esquina 👋 En los últimos días quedaron 7 productos con stock bajo (2 urgentes, sin stock). ¿Qué querés hacer?" [Ver y pedir] [Guardar p/ viernes] [Pausar avisos]

Dueño toca "Ver y pedir".

Bot: "🔴 Urgentes (sin stock): Coca-Cola 500 ml (Distribuidora Coca), Milka oreo 100 g (Distribuidora X). 🟡 No urgentes: 5 productos de Distribuidora X y Golosinas Sur." [Pedir urgentes] [Elegir uno por uno] [Todo al viernes]

Dueño toca "Pedir urgentes".

Bot arma dos borradores, uno por proveedor, y muestra el primero: "Pedido a Distribuidora Coca: Coca-Cola 500 ml — 2 packs (24 u.). Total estimado $28.800." [Confirmar] [Cambiar cantidades] [Cancelar]

Dueño toca "Confirmar". Bot (confirmación final): "Se va a enviar por email a pedidos@districoca.com.ar: 'Hola Juan, te paso el pedido de Kiosco La Esquina: Coca-Cola 500 ml x 2 packs (24 u.)…'" [Enviar] [Volver]

Dueño toca "Enviar". Bot: "✅ Pedido enviado a Distribuidora Coca por email (08:03)." y pasa al borrador de Distribuidora X.

Al terminar los urgentes, Bot: "¿Los 5 no urgentes los guardo para el viernes?" [Sí, al viernes] [Pedir ahora también]

Dueño toca "Sí, al viernes". Bot: "Listo, quedaron en la lista del viernes."

### Flujo 4: ajustar cantidades de un pedido (unidad, caja, monto)

Bot muestra el borrador a Distribuidora X (3 líneas: Águila por caja, Jorgito por unidad, Cigarrillos por monto). Dueño toca "Cambiar cantidades".

Bot (lista): [Chocolate Águila — 3 cajas] [Alfajor Jorgito — 20 u.] [Cigarrillos — $50.000] [Agregar producto]

Dueño elige "Chocolate Águila". Bot: "Chocolate Águila 100 g, caja x24. Ahora: 3 cajas (72 u.)." [−1 caja] [+1 caja] [Otra cantidad]

Dueño toca "+1 caja". Bot: "Ahora: 4 cajas (96 u.). Total estimado: $166.000."

Dueño escribe "cigarrillos 80 mil". Bot: "Cigarrillos: $80.000. Total estimado: $196.000."

Dueño escribe "agregá 2 cajas de beldent". Bot: "Agregué Beldent menta x2 cajas (40 u.)." y reenvía el resumen con [Confirmar] [Cambiar cantidades] [Cancelar].

### Flujo 5: pedido por WhatsApp a un proveedor sin email (MVP)

Dueño confirma el pedido a Golosinas Sur, que solo tiene WhatsApp cargado.

Bot: "Golosinas Sur trabaja por WhatsApp. Te dejo el pedido listo: tocá el link y mandalo desde tu WhatsApp 👇 https://wa.me/5491144443333?text=Hola%20Carlos…"

Dueño toca el link, se abre el chat con Carlos con el pedido escrito y lo envía.

Bot: "¿Lo pudiste enviar?" [Sí, enviado] [Todavía no]

Dueño toca "Sí, enviado". El pedido queda "Enviado (WhatsApp manual)" con fecha, hora y usuario.

### Flujo 6: resumen del viernes → pedido programado para el lunes

Viernes 18:00. Bot (plantilla de utilidad, paga; en paralelo llega el mismo resumen por email): "Resumen semanal de Kiosco La Esquina (5 al 9/10). Vendiste 1.240 unidades. Lo más vendido: Coca-Cola 500 ml (96), Alfajor Jorgito (80), Beldent (64). Te faltan 12 productos de 3 proveedores. El pedido sugerido ya está armado para el lunes." [Ver pedido sugerido] [Programar p/ lunes] [Resumen completo]

Sábado a la mañana, el dueño toca "Ver pedido sugerido". (Si pasaron más de 24 h desde su último mensaje, el toque en el botón igual abre una nueva ventana de atención.)

Bot muestra el primer borrador (Distribuidora X, 6 líneas, lista del viernes + alertas). El dueño ajusta dos cantidades (Flujo 4).

Dueño toca "Confirmar" → Bot: "¿Lo envío ahora o el lunes?" [Enviar ahora] [Lunes 8:00] [Otro horario]

Dueño toca "Lunes 8:00". Bot: "Listo, el pedido a Distribuidora X sale el lunes 12/10 a las 8:00. Si algo cambia en el stock te pido confirmar de nuevo."

Lunes 7:45: el sistema recalcula con stock en vivo. Nada cambió → el pedido se envía a las 8:00 y el bot avisa "✅ Pedido a Distribuidora X enviado por email." Si algo cambió → Bot: "Desde el viernes se repuso Beldent menta. ¿Envío el pedido sin esa línea?" [Enviar así] [Revisar].

Lunes 10:00: si quedó algún pedido semanal sin confirmar, el bot manda un recordatorio.

### Flujo 7: empleado arma un pedido y se lo pasa al dueño

Empleado: "qué me falta"

Bot muestra las alertas (sin costos ni totales en pesos).

Empleado toca "Pedir ahora" en Distribuidora X, ajusta cantidades y toca "Avisarle al dueño" (no tiene permiso para enviar).

Bot al dueño (si la ventana de 24 h del dueño está abierta, mensaje interactivo; si no, plantilla de utilidad "Tenés un pedido para revisar"): "Lucas armó un pedido a Distribuidora X (4 líneas, total estimado $96.000)." [Ver y confirmar] [Descartar]

El dueño revisa, confirma y envía (Flujo 3, pasos 6 y 7). En el historial queda que lo armó Lucas y lo confirmó Mauricio.

### Flujo 8: opt-out y cambio de preferencias

Dueño: "avisos"

Bot (lista): [Aviso matutino: 8:00 ✅] [Resumen semanal: vie 18:00 ✅] [Resumen de cierre: cada cierre ✅] [Canales: WhatsApp + email] [Pausar 7 días] [Darme de baja]

Dueño elige "Aviso matutino" → "Otra hora" → escribe "7:30". Bot: "Listo, el aviso matutino te llega a las 7:30."

Otro día, el dueño escribe "BAJA". Bot: "Listo, no te voy a mandar más avisos. Podés seguir consultando cuando quieras. Para volver a activarlos escribí ALTA." (Los avisos activados siguen llegando por email; se desactivan desde la web o con el link de baja del email.)

Si toca "Canales: WhatsApp + email", el bot explica: "Los avisos que tengas activados te llegan siempre por WhatsApp y por email. Podés elegir cuáles recibís y cada cuánto."

### Flujo 9: "qué se está acabando" con catálogo grande

Dueño (8.000 productos cargados, 47 en alerta): "qué se está acabando"

Bot (lista interactiva): "Lo más urgente (10 de 47):" → [Ver lista]

Coca-Cola 500 ml — 0 u. · vende 14/día

Marlboro box 20 — 0 u. · vende 9/día

Alfajor Jorgito — 4 u. · ~1 día

… (hasta 10 filas) En un mensaje siguiente con botones (una lista interactiva y los botones de respuesta van en mensajes separados): [Ver más] [Pedir los urgentes] [Filtrar proveedor]

Dueño toca "Ver más". Bot: "Siguientes (20 de 47):" con los productos 11 a 20.

Dueño escribe "solo Distribuidora X". Bot: "Lo más urgente de Distribuidora X (10 de 12):" con la misma paginación.

Dueño toca "Pedir los urgentes" y sigue en el Flujo 3 (paso 5).

### Flujo 10: cierre de caja → resumen por WhatsApp y email (P1)

21:30. El dueño toca "Cerrar caja" en la web (o a la hora de corte se cierra sola).

El sistema genera el resumen de cierre (PRD de caja, C12) y, como el dueño lo tiene activado "en cada cierre", lo envía por los dos canales.

Bot (plantilla de utilidad resumen_cierre_caja, paga): "Cierre de caja de Kiosco La Esquina, 9/10. Ingresos $412.300, egresos $96.000, resultado $316.300. Abrió Mauricio 8:02, cerró Mauricio 21:30." [Ver detalle]

Al mismo tiempo llega el email con el mismo resumen y el link al detalle en la web.

Si el dueño cambia la frecuencia a "semanal", desde la semana siguiente recibe un solo resumen semanal por los dos canales.

### Flujo 11: vinculación durante el alta del comercio (onboarding)

Mauricio inicia sesión con Google por primera vez; la pantalla de alta (PRD de onboarding, ON1) le pide nombre del kiosco, rubro y WhatsApp, con la casilla de opt-in. Toca "Crear mi comercio".

Mientras se crea la base, la pantalla de estado muestra la vinculación: en el celular, el botón "Vincular por WhatsApp"; en la computadora, un QR.

Desde el celular toca el botón; se abre WhatsApp con VINCULAR 482913 hacia el número central y lo envía. El backend comprueba el número remitente y el código; el bot confirma "Listo, este número quedó vinculado a Kiosco La Esquina como Dueño" y la web muestra "WhatsApp verificado ✓". El bot no responde con datos hasta que el comercio está activo (B1.4).

Cuando la base está lista, el bot le manda la bienvenida como mensaje libre interactivo (la ventana está abierta porque escribió él): sin plantilla paga.

Variante desde una computadora sin poder escanear el QR: toca "¿No podés escanear el QR o abrir WhatsApp? Recibí un código"; el bot le manda la plantilla de autenticación codigo_verificacion con el código 731205; lo escribe en la web y queda verificado. La bienvenida va por plantilla de utilidad si marcó el opt-in (o la web le ofrece "Probar el bot ahora").

Si no puede verificar en ese momento, toca "Verificar después": la vinculación queda como primer paso de la checklist y la puede hacer más tarde desde Configuración → WhatsApp (Flujo 1).

### Flujo 12: recomendación de promociones en el resumen del viernes (P1)

Viernes 18:00. El resumen semanal (Flujo 6) trae una línea más: "💡 2 productos para promocionar" [Ver promos].

El dueño toca "Ver promos". Bot: "Shampoo sachet (sin ventas hace 45 días): 2da unidad al 50%. Escenario base: +$4.200 en 2 semanas (supuestos por defecto)." [Crear promo] [Ahora no] [Ver detalle]

Bot: "Yogur frutilla x12 (vence el 20/10): 2x1. Si no hacés nada perdés $14.400; con la promo, en el escenario base, perdés $3.100." [Crear promo] [Ahora no] [Ver detalle]

Toca "Ver detalle" en el yogur: se abre la web con la ganancia por unidad antes y con la promo, la pérdida si no suben las ventas, las unidades extra para el punto de equilibrio y los escenarios pesimista, base y optimista.

Vuelve al chat y toca "Crear promo": se abre la web con el 2x1 precargado; lo confirma. En el shampoo toca "Ahora no".

Al terminar la promo, el siguiente resumen del viernes trae: "Yogur 2x1: vendiste 11 de 12; perdiste $1.200 (pronóstico base: $3.100)." [Ver detalle]

## 6. Notas técnicas

### 6.1 Principios

Mismo backend, misma lógica: el bot es un canal más del mismo producto. No tiene reglas de negocio propias de stock ni de pedidos: llama a la misma capa de servicios / API que usa la web Astro (validación con Zod, Drizzle, transacciones de stock con bloqueo de fila del PRD principal, sección 6.3).

Datos en vivo: ninguna respuesta se arma con datos cacheados de stock, alertas ni pedidos. Los avisos programados calculan su contenido en el momento del envío.

Una base de datos por cliente, como ModoOps: el bot resuelve la base del comercio desde el número de teléfono a través del Control Plane; nunca existe una base compartida con datos de stock de varios comercios.

Stack TypeScript de punta a punta, mismo repositorio que la web.

### 6.2 Arquitectura

WhatsApp (usuario) ⇄ Meta Cloud API ⇄ Webhook del bot (Hono, TypeScript)

│

├─ verifica firma, deduplica, encola (pg-boss / Inngest)

├─ resuelve número → usuario + comercio + rol (base de control)

├─ interpreta intención (reglas → LLM con salida estructurada)

└─ llama a la API/servicios del backend con contexto de usuario y comercio

│

└─ base de datos del comercio (una por cliente)

Jobs programados (aviso matutino, resumen del viernes, resumen de cierre de caja, envíos del lunes) → mismo backend → Cloud API (número central) + email (notificaciones clave por los dos canales)



Servicio del bot: servicio Hono en TypeScript (o rutas /api/whatsapp/* del mismo despliegue), desplegado junto al backend.

Webhook: endpoint HTTPS con verificación del token en la suscripción (GET) y validación de la firma X-Hub-Signature-256 con el app secret en cada POST [a verificar detalles en la documentación de Meta]. Responder 200 rápido y procesar en cola.

Idempotencia: deduplicación por id de mensaje de WhatsApp (wamid), porque Meta puede reintentar webhooks.

Orden: procesamiento secuencial por usuario (cola con clave por número) para que los mensajes de una misma conversación no se procesen fuera de orden.

Llamada al backend: el bot actúa en nombre del usuario vinculado: obtiene un token interno de corta duración con user_id, tenant_id y rol, emitido por el backend a partir de la identidad verificada en la base de control. Los permisos se aplican igual que para la web. El bot nunca recibe credenciales de la base del comercio.

Estado de conversación: sesión corta por usuario (paso actual, pedido abierto, producto en desambiguación) en la base del comercio o en un almacén clave-valor con expiración, sin datos de stock.

### 6.3 Resolución del comercio (base de control)

Nueva entidad en la base de control: whatsapp_identities (número E.164, wa_id, user_id, tenant_id, rol, estado, verificado_at, opt_in_at, opt_out_at, preferencias).

Por mensaje: número → identidad verificada y activa → membership activa → tenant activo o en gracia → conexión a la base del comercio desde el catálogo (pooling por base, igual que la web).

Si la membership o el tenant están inactivos, se responde sin datos.

Caché de la resolución número → tenant solo de la identidad (no de datos de stock), con expiración corta (por ejemplo, 60 s) e invalidación al revocar.

### 6.4 WhatsApp Business Platform (Cloud API)

Número central de la plataforma: un único número de WhatsApp Business para todos los comercios, con la WABA y el número propios del proveedor (nosotros), con perfil de empresa verificado en Meta Business Manager. Los kioscos no necesitan su propia cuenta de WhatsApp Business ni cargar una tarjeta en Meta. Decisión del dueño del 9/10/2026; la alternativa de un número o una WABA por kiosco quedó descartada (ver el documento de costos, secciones 0.1 y 1.4). El comercio se resuelve siempre por el número del usuario que escribe (6.3), no por el número de destino. Directo con Cloud API o vía un BSP (360dialog, Twilio, Gupshup), a decidir por costo y soporte [a verificar].

Ventana de atención al cliente de 24 h: dentro de las 24 h posteriores al último mensaje del usuario se pueden enviar mensajes libres (texto, listas, botones); fuera de esa ventana solo se pueden enviar plantillas aprobadas [fuente: Meta]. Por eso todos los avisos programados (matutino, viernes, resumen de cierre de caja, lunes, "pedido para revisar") son plantillas, y el resto de la conversación usa mensajes interactivos una vez que el usuario responde.

Plantillas: categorías marketing, utilidad y autenticación [fuente: Meta]. Las del bot son de utilidad (avisos sobre el inventario del propio usuario), salvo codigo_verificacion (autenticación), que se usa solo para el código de respaldo de la vinculación (B1.2): el método principal, VINCULAR, lo inicia el usuario y no usa plantilla. Meta revisa y puede rechazar o recategorizar plantillas; se mantienen en español (es_AR o es) con variables y botones de respuesta rápida [a verificar idioma, límites de variables y botones].

Plantillas iniciales a aprobar: aviso_matutino_stock_bajo, resumen_semanal, pedido_programado_confirmar, pedido_para_revisar, pedido_enviado, resumen_cierre_caja (P1), alerta_vencimiento_promo (P1, utilidad, paga, solo si el dueño activa la alerta urgente de vencimiento de B15.7) y codigo_verificacion (autenticación, solo para el respaldo de B1.2; mismo nombre que en el PRD de onboarding, antes codigo_vinculacion).

Mensajes interactivos: botones de respuesta (hasta 3, títulos de hasta 20 caracteres) y listas (hasta 10 filas en total, títulos de fila de hasta 24 caracteres) [fuente: Meta]. El diseño de mensajes respeta esos límites (nombres de producto abreviados en títulos, detalle en la descripción de la fila).

Precios: Meta cobra por mensaje de plantilla entregado según categoría y país del destinatario (desde el 1/7/2025) [fuente: Meta]. Meta anunció que desde el 1/10/2026 también se cobran las plantillas de utilidad enviadas dentro de una ventana de atención abierta [fuente: Meta]; fuentes secundarias indican además que los mensajes de servicio (respuestas libres) pasan a tener un cupo gratuito mensual por número y luego se cobran [a verificar en la documentación oficial y en la tarifa vigente para Argentina]. Implicancia: cada aviso y cada respuesta tienen costo; hay que medir costo por comercio por mes y compararlo con el precio del plan.

Costo de las notificaciones proactivas (actualización 9/10/2026): cada notificación clave por WhatsApp (aviso matutino, resumen del viernes, resumen de cierre de caja) es una plantilla de utilidad paga, ~USD 0,026 por mensaje en Argentina, cobrada incluso dentro de la ventana de 24 h desde el 1/10/2026 y fuera del cupo gratuito. Las respuestas libres del bot (servicio) también cuestan ~USD 0,026 una vez agotado el cupo gratuito de 1.000 mensajes de servicio por mes por número; con el número central, ese cupo es compartido entre todos los clientes (a escala, despreciable por cliente). Tarifas de fuentes de terceros coincidentes [a verificar contra el archivo oficial de tarifas de Meta]. El email de las mismas notificaciones no tiene ese costo por mensaje. Estimaciones por cliente y medidas de ahorro en el documento de costos.

Calidad y límites: el número central tiene calificación de calidad y límites de mensajería iniciados por la empresa (usuarios únicos por 24 h, calculados por portfolio y compartidos entre todos los comercios; ver el documento de costos); muchos bloqueos o reportes bajan la calidad y pueden pausar plantillas [a verificar niveles actuales]. Mitigación: opt-in claro, avisos solo con novedades, opt-out fácil.

Webhooks de estado (enviado, entregado, leído, fallido) alimentan el log del bot y la métrica de costos.

WhatsApp Flows (formularios dentro de WhatsApp) para editar cantidades en P1 [a verificar disponibilidad, costo y soporte en Android de gama media].

### 6.5 Interpretación de mensajes

Capa 1, reglas: normalización (minúsculas, sin tildes, números escritos: "dos cajas" → 2 cajas, "80 mil" → 80.000), palabras clave por intención ("cuántos", "me quedan", "hay" → stock; "a cuánto", "precio" → precio; "pedile", "pedí" → pedido; "falta" → alertas).

Capa 2, LLM con salida estructurada (JSON validado con Zod) solo cuando la capa 1 no alcanza. El modelo recibe el mensaje y, como mucho, nombres candidatos de productos ya filtrados por la búsqueda de la base del comercio; nunca recibe costos ni datos de otros comercios y no ejecuta acciones: devuelve intención y entidades, y el backend decide. Proveedor del modelo y costo [a verificar]; se puede lanzar el MVP solo con reglas + búsqueda difusa.

Búsqueda difusa: la misma de F1.5 en la base del comercio (pg_trgm + unaccent), más tabla product_aliases (alias por comercio) y sinónimos comunes del rubro precargados. Umbral de similitud y margen entre el primer y el segundo candidato para decidir si responder directo o desambiguar.

Acciones con efecto (pedidos, movimientos en P1) siempre pasan por un mensaje de confirmación con botones.

### 6.6 Jobs programados

Cola de jobs del PRD principal (pg-boss / Inngest / cron), con un job por comercio y tipo de aviso, en la zona horaria del comercio.

Aviso matutino: a la hora configurada; calcula productos que entraron en alerta desde el aviso anterior (o en los últimos 3 días) y siguen en alerta.

Resumen del viernes: a la hora configurada; agrega egresos por venta de la semana desde el historial (F3), alertas vigentes y lista del viernes.

Envíos programados del lunes: recalculan en vivo antes de enviar; si hay diferencias, piden reconfirmación en lugar de enviar.

Resumen de cierre de caja (P1): se dispara con el evento de cierre del PRD de caja (C12), según la frecuencia elegida por el dueño.

Dos canales por notificación: cada job de notificación clave encola dos envíos independientes (WhatsApp y email) con el mismo contenido calculado una sola vez; cada uno con su clave de idempotencia (notificación + canal + destinatario + fecha) para no duplicar en reintentos, y su propio estado de entrega. El canal WhatsApp se omite solo si no hay opt-in vigente (B2.4).

Distribución de envíos en el tiempo (no todos los comercios a las 8:00 en punto) para respetar límites de mensajería.

### 6.7 Email

Mismo proveedor transaccional del PRD principal (Resend/Postmark/SES, dominio con SPF, DKIM y DMARC) para avisos por email y para pedidos a proveedores por email, con Reply-To del comercio. Las notificaciones clave por email (aviso matutino, resumen del viernes, resumen de cierre de caja) se definen en el PRD de notificaciones por email (plantillas, link de baja, entregabilidad); salen siempre junto con el WhatsApp cuando la notificación está activada.

Envío de avisos por email también desde Gmail del comercio queda fuera del MVP (opción a evaluar: que el pedido salga desde la cuenta de Gmail del dueño vía OAuth) [a verificar requisitos de verificación de Google].

### 6.8 Modelo de datos (agregados respecto del PRD principal)

stock_movements.origen suma el valor "bot WhatsApp"; audit_log registra el origen.

Migraciones con el mismo runner del PRD principal (base de control + todas las bases de clientes).

### 6.9 Seguridad y privacidad

Validación de firma de webhooks, HTTPS, secretos en el gestor de secretos del hosting, rotación del token de acceso de Meta.

Permisos aplicados en el backend (nunca solo en el bot).

Confirmación explícita antes de todo envío a proveedores.

Rate limiting por número y por comercio; protección ante mensajes masivos.

Datos personales (números de teléfono) tratados según la Ley 25.326; los mensajes con datos del comercio pasan por servidores de Meta (incluirlo en términos y política de privacidad).

Sin contenido de mensajes ni PII en Sentry/logs.

### 6.10 Calidad y observabilidad

Tests unitarios (Vitest) del parser de intenciones con un corpus de mensajes reales de kiosqueros (meta: >90% de intención correcta en el corpus).

Tests de integración del webhook con payloads de ejemplo y de aislamiento entre comercios.

Métricas: latencia de respuesta, % de "no entendí", % de desambiguaciones, entregas fallidas por canal (WhatsApp / email), costo por comercio por mes (plantillas de notificaciones proactivas aparte de las respuestas del bot), opt-outs.

### 6.11 Escala: índices, paginación y límites de mensajes

Volumen objetivo: catálogos de hasta 8.000 productos activos por comercio (y cientos de miles de movimientos) sin degradar el tiempo de respuesta del bot.

### Índices en la base de cada comercio:

Índice único btree sobre el código en product_codes (búsqueda exacta por código de unidad o caja).

Índice GIN con gin_trgm_ops (pg_trgm) sobre una columna de nombre normalizado (minúsculas + unaccent, generada o mantenida por trigger) para la búsqueda difusa; opcional tsvector en español con índice GIN para consultas de varias palabras. Mismo índice para product_aliases.

Índice parcial sobre productos activos en alerta (por ejemplo, WHERE archivado = false AND umbral > 0 AND stock_actual <= umbral) para las listas de faltantes.

Índice compuesto en stock_movements por (product_id, tipo, created_at) para calcular la velocidad de venta y el resumen semanal sin escanear todo el historial.

Velocidad de venta precalculada: un job diario (o la misma transacción del movimiento, de forma incremental) guarda por producto la venta promedio diaria de las últimas semanas, para que el ranking de urgencia no recalcule agregados sobre todo el historial en cada mensaje. El stock y el umbral se leen siempre en vivo; solo la velocidad de venta puede tener hasta 24 h de antigüedad (aclarado en el ranking).

Paginación por cursor (keyset), no por OFFSET: el orden es (puntaje de urgencia, product_id); "Ver más" envía en el id del botón un cursor opaco con el último (puntaje, product_id) mostrado y la versión de la consulta (filtros). Para que la lista sea estable mientras el usuario pagina, la primera página guarda una instantánea liviana del orden (lista de ids, con expiración, por ejemplo 30 minutos) en la sesión del bot; las páginas siguientes leen stock en vivo de esos ids.

Límites de largo de WhatsApp [a verificar valores vigentes]: cuerpo de mensaje de texto de hasta 4.096 caracteres; cuerpo de mensajes interactivos de hasta 1.024 caracteres [fuente: Meta]; listas de hasta 10 filas con títulos de 24 caracteres y descripciones de 72 [fuente: Meta]; botones de hasta 20 caracteres [fuente: Meta]; plantillas con límites propios de cuerpo y variables [a verificar]. Por eso cada página es de 10 productos, el nombre va abreviado en el título de la fila y el stock/venta en la descripción.

Rendimiento objetivo: búsqueda por nombre menor a 300 ms y por código menor a 50 ms en la base con 8.000 productos; respuesta del bot de punta a punta menor a 3 s (p95), incluyendo la latencia de la Cloud API. Tests de carga en CI/staging con un catálogo sintético de 8.000 productos y EXPLAIN ANALYZE de las consultas críticas.

Pooling: las consultas del bot usan el mismo pool por base del comercio que la web; los jobs masivos (aviso matutino, resumen del viernes) se reparten en el tiempo y por comercio para no saturar conexiones.

## 7. Riesgos y preguntas abiertas

### 7.1 Riesgos

### 7.2 Preguntas abiertas

Número: ¿un número de la plataforma para todos los comercios (MVP) o, en el plan Pro, un número propio del comercio? ¿Cloud API directo o BSP? Resuelta en parte (9/10/2026): un único número central (WABA y número del proveedor) para todos los comercios; el número propio por comercio quedó descartado (documento de costos, 1.4). Queda abierto Cloud API directo vs BSP.

Costos: ¿cuál es la tarifa vigente por mensaje de utilidad y de servicio para Argentina después del 1/10/2026? (Estimación actual: ~USD 0,026 ambos, a confirmar contra la tarifa oficial; ver documento de costos.) ¿El bot va en todos los planes o solo en Pro? ¿Cupo mensual de mensajes?

Roadmap relativo al PRD principal: el PRD principal ubica la WhatsApp Business API en fases posteriores; ¿se adelanta el bot a la fase 2 del producto?

Envío directo a proveedores por Cloud API: ¿cómo se obtiene el opt-in del proveedor? ¿Vale la pena frente al link wa.me desde el WhatsApp del dueño, que el proveedor ya conoce?

Criterio de urgencia: ¿alcanza con las reglas del MVP (stock 0, crítico, menos de la mitad del umbral) o hace falta usar la rotación y los días de visita del proveedor desde el principio?

Horario del resumen: ¿viernes 18:00 es el mejor momento, o conviene viernes al mediodía o sábado a la mañana? Validar en entrevistas.

LLM: ¿se lanza el MVP solo con reglas + búsqueda difusa y se suma el LLM después, según el % de "no entendí"? ¿Qué proveedor y qué costo por consulta?

Empleados: ¿por defecto pueden usar el bot o el dueño los habilita uno por uno? ¿Reciben alertas?

Email desde la cuenta del dueño (Gmail): ¿hace falta, o alcanza con la dirección transaccional con Reply-To?

Audios: ¿qué tan pedidos van a ser los mensajes de voz en el rubro? ¿Prioridad P1 o P2?

Legal: actualización de términos y política de privacidad por el tratamiento de mensajes vía Meta.

### Decisiones tomadas:

El bot usa el mismo backend que la web y una base de datos por cliente, como ModoOps; la base se resuelve desde el número de teléfono a través de la base de control del Control Plane.

Las fotos y la configuración se hacen en la web; el bot es para el día a día.

Ningún pedido sale sin confirmación explícita.

(9/10/2026) Las notificaciones proactivas clave (aviso matutino, resumen del viernes, resumen de cierre de caja) se envían al dueño por WhatsApp y por email a la vez; el dueño elige cuáles y con qué frecuencia. El bot queda para lo que el comerciante le escribe (consultas, pedidos, fotos de facturas, confirmaciones).

(9/10/2026) Un único número central de WhatsApp (WABA y número del proveedor) para todos los comercios, con el cupo gratuito de servicio compartido; cada notificación por WhatsApp es una plantilla de utilidad paga (~USD 0,026 en Argentina).

(9/10/2026) Recordatorio de costo: las plantillas de WhatsApp de las notificaciones clave son pagas (~USD 0,026 por mensaje en Argentina) [a verificar contra la tarifa oficial vigente]; detalle de las notificaciones por email en el PRD de notificaciones por email (https://docs.google.com/document/d/1RUZ1PY_98eE0cvmL5lL5Ij39cO0nC627I0qAgICf4W0/edit).

(9/10/2026) Recomendación de promociones (B15): el bot sugiere qué productos promocionar con promo concreta y escenario económico, dentro del resumen del viernes (sin plantilla adicional); la alerta urgente de vencimiento es una plantilla de utilidad paga y solo si el dueño la activa. Es solo una sugerencia; la lógica y las fórmulas están en el PRD de rotación.

(9/10/2026) Verificación del número: el método principal es VINCULAR, iniciado por el usuario desde un botón wa.me (celular) o un QR (computadora) hacia el número central; el backend verifica que el número remitente coincide con el ingresado y que el código es válido y no venció. Es gratis y abre la ventana de 24 h. El respaldo es el código de 6 dígitos enviado con la plantilla de autenticación codigo_verificacion e ingresado en la web (pago, requiere aprobación de Meta). La vinculación se ofrece en la pantalla de alta del onboarding y en Configuración → WhatsApp (B1.1, B1.2).

## 8. Plan por fases

Supuesto: el MVP de la web (F1 a F8 del PRD principal, con pedidos, proveedores y alertas en la app) está en producción o en beta cuando arranca el bot.

### Fase 0: preparación y validación (semanas 1 y 2)

Alta y verificación de la empresa en Meta Business Manager, número central de la plataforma (WABA del proveedor), elección Cloud API directo vs BSP.

Redacción y envío a aprobación de las plantillas iniciales (aviso matutino, resumen semanal, pedido programado, pedido para revisar, pedido enviado) y, para P1, resumen_cierre_caja; codigo_verificacion (autenticación, solo para el respaldo de la vinculación; el lanzamiento no depende de su aprobación, porque el principal es VINCULAR); coordinar los textos con los emails equivalentes del PRD de notificaciones por email.

Confirmar tarifas vigentes para Argentina y límites de mensajería (todo lo marcado [a verificar]).

Recolección de 200 a 300 mensajes reales de consulta de 5 a 10 kiosqueros para armar el corpus del parser.

Prototipo de conversaciones (guion de los flujos 2, 3, 4 y 6) probado con dueños reales por WhatsApp.

### Fase 1: MVP del bot (semanas 3 a 8)

B1 Vinculación (VINCULAR por botón wa.me o QR como método principal y código por plantilla de autenticación como respaldo, desde la pantalla de alta del onboarding y desde Configuración → WhatsApp), resolución número → comercio vía Control Plane, roles; B2 opt-in, opt-out y preferencias.

B3 Consultas en texto libre con reglas + búsqueda difusa + desambiguación.

B4 Alertas y B5 aviso matutino (WhatsApp y email a la vez, coordinado con el PRD de notificaciones por email).

B6 Urgente ya / lista del viernes; B7 armado y ajuste del pedido; B8 envío por email y wa.me con confirmación.

B9 Resumen del viernes con pedido programado para el lunes (WhatsApp y email a la vez).

B10 (parte P0), B11 auditoría, B12 menú y errores.

B13 escala: índices de código y nombre, top 10 por urgencia con "Ver más", tests de carga con 8.000 productos.

Métricas de costo por comercio en el Control Plane.

Beta cerrada con 5 a 10 comercios (semanas 7 y 8). Hito: bot disponible para todos los comercios (o para el plan Pro) al final de la semana 8.

### Fase 2: día a día completo (meses 3 a 5)

Registro de ingresos y egresos por texto; recepción del pedido desde el bot.

LLM como segunda capa del parser (si el % de "no entendí" lo justifica); consultas compuestas.

Alertas inmediatas para productos críticos; recordatorios el día de visita del proveedor.

WhatsApp Flows para editar cantidades; varios comercios por número; preferencias por empleado.

Envío directo de pedidos al proveedor por Cloud API (si se resuelve el opt-in del proveedor).

B14 resumen de cierre de caja por WhatsApp y email (plantilla resumen_cierre_caja).

B15 recomendación de promociones dentro del resumen del viernes, con escenario económico y resultado real vs. pronóstico; alerta urgente de vencimiento opcional (plantilla alerta_vencimiento_promo), coordinado con el PRD de rotación.

### Fase 3: inteligencia y canales (meses 6 a 12)

Urgencia y cantidades sugeridas según rotación histórica y días de visita.

Mensajes de audio.

Número propio del comercio (plan Pro) y confirmación de pedidos por parte del proveedor. Actualización 9/10/2026: el número propio del comercio quedó descartado (se mantiene el número central, ver documento de costos); sigue en esta fase la confirmación de pedidos por parte del proveedor.

Comparación semanal (esta semana vs. anteriores) en el resumen del viernes.

## Anexo A: glosario

Entidad | Dónde | Campos principales
--- | --- | ---
whatsapp_identities | Base de control | número E.164, wa_id, user_id, tenant_id, rol, estado, método de verificación (vincular/codigo), verificado_at, opt_in_at, opt_out_at
notification_preferences | Base del comercio | user_id, tipo de notificación (aviso_matutino / resumen_semanal / resumen_cierre_caja), activado, frecuencia, hora_aviso_matutino, día_hora_resumen, pausado_hasta. Las notificaciones activadas usan siempre WhatsApp y email (el campo canal whatsapp/email/ambos queda fijo en "ambos"); el opt-in de WhatsApp está en whatsapp_identities
notification_deliveries | Base del comercio | notificación, canal (whatsapp/email), destinatario, wamid o id del email, estado de entrega, plantilla, costo estimado, created_at
purchase_orders (extensión) | Base del comercio | marca semanal (lista del viernes), programado_para, origen (web/bot), confirmado_por
product_aliases | Base del comercio | product_id, alias
bot_conversations | Base del comercio | user_id, estado de la sesión, pedido_abierto_id, expira_at
bot_message_log | Base del comercio | wamid, dirección (entrante/saliente), tipo, plantilla, intención, entidades, acción, estado de entrega, created_at
whatsapp_usage | Base de control | tenant_id, mes, mensajes por categoría (plantillas de utilidad por tipo de notificación, servicio), costo estimado (sin contenido); el número es el central para todos

Riesgo | Impacto | Probabilidad | Mitigación
--- | --- | --- | ---
Rechazo o recategorización de plantillas por Meta (por ejemplo, de utilidad a marketing) | Alto | Media | Texto estrictamente transaccional, plantillas alternativas preaprobadas, revisión antes del lanzamiento
Costo por mensaje (cambios de precios de Meta, como el del 1/10/2026) que erosiona el margen del plan | Alto | Alta | Avisos solo con novedades, medición de costo por comercio, bot como diferencial del plan Pro o con cupo de mensajes. Las notificaciones clave por WhatsApp son plantillas pagas (~USD 0,026 c/u) aunque también salgan por email: el dueño elige cuáles y con qué frecuencia (ver documento de costos)
Notificaciones duplicadas por los dos canales (WhatsApp + email) percibidas como exceso | Medio | Media | Mismo contenido y horario en ambos, el dueño elige cuáles recibe y cada cuánto, pausa y baja fáciles
Ventana de 24 h cerrada en el medio de un pedido | Medio | Media | Borradores persistentes, retomar con plantilla o desde la web
Baja de calidad del número por bloqueos/reportes | Alto | Baja | Opt-in claro, opt-out fácil, frecuencia moderada
Interpretación errónea de un mensaje que lleva a un pedido equivocado | Alto | Media | Confirmación obligatoria con resumen final; acciones con efecto nunca directas
Fuga de datos entre comercios por un error en la resolución número → base | Muy alto | Baja | Resolución solo del lado del servidor desde la base de control, tests de aislamiento en CI, una base por cliente
Número compartido o celular perdido del dueño | Alto | Media | Revocación desde la web, re-vinculación, aviso de nuevo dispositivo [a verificar si Cloud API lo informa]
Stock desactualizado en el sistema porque no se registran ventas (el bot avisa mal) | Alto | Alta | El bot hace visible el problema (resumen semanal con "sin ventas registradas"), egreso por texto en P1
Proveedores que no aceptan pedidos por email o que no tienen WhatsApp cargado | Medio | Media | Link wa.me en el MVP, aviso al cargar el proveedor en la web
Dependencia de un BSP o de cambios de la API de Meta | Medio | Media | Capa de abstracción del canal; evaluar Cloud API directo
Lentitud o listas inmanejables con catálogos grandes (8.000 productos) | Alto | Media | Índices btree y pg_trgm, top 10 por urgencia con "Ver más", paginación por cursor, tests de carga con catálogo sintético
Saturación de avisos (el dueño ignora o bloquea) | Medio | Media | Un aviso diario como máximo, solo con novedades, pausa fácil

Término | Definición
--- | ---
Comercio / tenant | Cliente de la plataforma, con sus datos aislados en su propia base de datos
Base de control | Base central del Control Plane que mapea cada cliente a su base de datos, y donde se guardan cuentas, planes e identidades de WhatsApp
Identidad de WhatsApp | Número verificado y vinculado a un usuario y un comercio
VINCULAR | Mensaje precargado VINCULAR <código> que el usuario envía al número central desde un botón wa.me o un QR para verificar su número; método principal de vinculación (B1.2). El respaldo es el código por plantilla de autenticación
Ventana de atención (24 h) | Período posterior al último mensaje del usuario en el que el bot puede enviar mensajes libres; fuera de ella, solo plantillas
Plantilla | Mensaje preaprobado por Meta, obligatorio para los avisos que inicia la plataforma
Opt-in / opt-out | Consentimiento explícito para recibir avisos / baja de esos avisos
Aviso matutino | Mensaje diario con los productos que quedaron bajos (por WhatsApp y por email)
Lista del viernes | Borradores de pedido por proveedor con lo no urgente, para el pedido semanal
Resumen del viernes | Resumen semanal de ventas y faltantes con el pedido sugerido para el lunes
Movimiento | Cualquier cambio de stock registrado en el historial (F3)
Número central | Único número de WhatsApp Business de la plataforma (WABA y número del proveedor) que usan todos los comercios
Notificaciones proactivas clave | Aviso matutino, resumen del viernes y resumen de cierre de caja; se envían por WhatsApp (plantilla de utilidad paga) y por email a la vez, si el dueño las activa
Recomendación de promociones | Sugerencia del bot de qué producto promocionar, con promo concreta y escenario económico (B15); la crea siempre el dueño
Umbral de stock bajo / stock objetivo / unidad de pedido | Igual que en el PRD principal
