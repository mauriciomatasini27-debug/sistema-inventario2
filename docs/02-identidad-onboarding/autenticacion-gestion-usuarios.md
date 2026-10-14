> Origen: `PRD - Autenticación y Gestión de Usuarios para Sistema de Inventario.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/auth`, `src/pages/api/auth/*`, `src/db/schema.ts`

---

# PRD - Autenticación y Gestión de Usuarios para Sistema de Inventario

Nota sobre datos externos: lo marcado [a verificar] (comportamiento de Google Identity Services, parámetros de OpenID Connect de Google, políticas de verificación de apps OAuth, cookies en PWA de iOS, WhatsApp Cloud API) debe confirmarse en la documentación oficial antes de implementar. Lo marcado [fuente: Google] se tomó del documento de descubrimiento OpenID de Google (https://accounts.google.com/.well-known/openid-configuration) y de la documentación para desarrolladores de Google consultados el 9/10/2026, y puede cambiar.

## 1. Resumen / visión general

### 1.1 Problema

El sistema de inventario lo usan el dueño del kiosco y, en muchos casos, uno a tres empleados que atienden el mostrador por turnos, desde su propio celular o desde la PC del local. Hoy, en los comercios chicos, el acceso a cualquier sistema se resuelve mal:

Contraseñas compartidas ("la clave es el nombre del kiosco"), anotadas en un papel al lado de la caja, que nunca se cambian cuando un empleado se va.

Todos entran con el mismo usuario, por lo que el historial no sirve para saber quién vendió, cargó o sacó mercadería, y el dueño pierde justamente el control que viene a buscar.

El empleado ve todo: costos, márgenes, saldos de la caja, lo que se le debe a cada proveedor y los datos de cobro, información que el dueño no quiere compartir.

En el celular, el sistema "se desloguea" cada tanto y hay que volver a escribir la clave en medio de una venta, con un cliente esperando.

Cuando un empleado deja de trabajar, no hay forma simple de cortarle el acceso de inmediato en todos sus dispositivos (ni en el bot de WhatsApp).

Además, el resto de los módulos (caja, facturas, órdenes de pago, consumos, bot) dependen de saber con certeza quién es el usuario, a qué comercio pertenece y qué puede hacer.

### 1.2 Visión

Un acceso sin contraseñas, con "Iniciar sesión con Google", que el dueño y los empleados ya saben usar porque tienen Android y Gmail; con roles claros (Dueño y Empleado) aplicados en todos los módulos y en el bot; con un alta del comercio en un minuto que crea su propia base de datos; con invitaciones por email para los empleados y revocación inmediata; y con sesiones largas en el celular para que nadie tenga que volver a loguearse en el mostrador, salvo cuando el dueño hace algo sensible. La cuenta de Google es obligatoria para todos (dueño y empleados): quien no tiene una la crea gratis, desde el celular, antes de entrar.

### 1.3 Propuesta de valor

"Entrá con tu cuenta de Google, sumá a tus empleados con un email y sacales el acceso con un toque. Cada uno ve solo lo que tiene que ver, y sabés quién hizo qué."

### 1.4 Alcance del módulo

Incluye: inicio de sesión con Google (OIDC), datos de identidad mínimos, alta del comercio con aprovisionamiento de su base, roles y matriz de permisos para todos los módulos, invitaciones, vínculo de la cuenta de Google en el primer ingreso, revocación de acceso, sesiones persistentes en la PWA, lista de dispositivos, cierre de sesión remoto, reautenticación para acciones sensibles, identidad en el bot de WhatsApp (vinculación del número con código de un solo uso) y auditoría de accesos.

No incluye: la conexión de Gmail (PRD de consumos, CS1, y PRD de caja, C13) ni la de Google Photos (PRD de caja y PRD de facturas): son integraciones separadas, opcionales y con su propio consentimiento, que este documento solo delimita (AU3). Tampoco incluye la suscripción y el cobro (F8.4 del PRD principal), salvo los permisos sobre ellos.

Relación con el PRD principal: este documento es el detalle de F8 (F8.1, F8.2, F8.6 a F8.12) y de la sección 6.12 del PRD principal. Si hay diferencias, se señalan en la sección 4.16 ("Ajustes propuestos a otros PRDs") para unificarlas; los otros documentos no se modifican desde acá.

## 2. Objetivos y no-objetivos

### 2.1 Objetivos

### 2.2 No-objetivos (fuera de alcance, al menos en el MVP)

No hay registro con email + contraseña ni recuperación de contraseña: el único método de ingreso en el MVP es Google.

No hay método de ingreso alternativo para quien no tiene cuenta de Google (ni contraseñas, ni enlace mágico por email, ni cuentas solo con PIN): la cuenta de Google es obligatoria para todos los usuarios, Dueño y Empleados, por decisión del dueño del producto (8.2, "Decisiones tomadas"). Quien no tiene una debe crearla (AU1.11, AU6.10).

No se implementa un segundo factor propio (SMS, TOTP): la verificación en 2 pasos la gestiona Google en la cuenta del usuario.

No se usa el login para leer Gmail, Drive, Calendar ni Google Photos: el login pide solo openid, email y profile.

No se guardan access tokens ni refresh tokens de Google del login.

No hay otros proveedores de identidad (Apple, Microsoft, Facebook) en el MVP; con la decisión de la cuenta de Google obligatoria (8.2, "Decisiones tomadas") dejan de ser una alternativa para usuarios sin cuenta de Google.

No hay permisos finos por usuario ni roles personalizados en el MVP (más allá de los interruptores operativos de la matriz de AU4); los permisos finos completos son P2, como en el PRD principal.

No hay varios comercios por usuario ni co-dueños en el MVP (P1).

No hay cuentas compartidas del comercio ("kiosco@gmail.com" usado por todos): se desaconsejan y no se ofrece ningún mecanismo pensado para eso, porque rompen la trazabilidad.

No hay arqueo diario de caja: la entrega de turno (PRD de caja, C17) es opcional, cuenta solo efectivo y funciona offline. Los permisos de caja se refieren a apertura, movimientos, reversiones, saldos, cierre y entregas de turno, tal como los define el PRD de caja; los de la entrega de turno están en la matriz de AU4.

## 3. Usuarios

Se usan los mismos roles del PRD principal.

### 3.1 Dueño/a del comercio (rol Dueño)

Perfil: el del PRD principal: 30 a 60 años, atiende el mostrador o tiene pocos empleados, usa WhatsApp, Gmail y Mercado Pago todos los días desde un Android de gama media.

Necesidades: entrar rápido y no volver a loguearse; sumar y sacar empleados sin depender de nadie; que cada empleado vea solo lo necesario; saber quién hizo cada cosa; tener la tranquilidad de que si pierde el celular puede cerrar esa sesión desde otro dispositivo.

Cuenta de Google: obligatoria; si no tiene, la crea antes del alta del comercio (AU5.9).

Permisos: acceso total a todos los módulos: inventario, ventas, pedidos, proveedores, costos y márgenes, caja, facturas, órdenes de pago, consumos, bot, configuración, usuarios, suscripción y exportaciones. Es quien da de alta el comercio, invita empleados, revoca accesos y conecta las integraciones opcionales de Google (Gmail, Google Photos).

### 3.2 Empleado/a (rol Empleado)

Perfil: 18 a 35 años, atiende el mostrador por turnos, recibe mercadería y repone; usa su propio celular o la PC del local. La mayoría tiene cuenta de Google (Android/Gmail); algunos no (ver riesgos). Quien no tiene debe crear una para poder entrar (gratis, con un Gmail nuevo o con el email que ya usa), y lo puede hacer desde su celular siguiendo la guía de la invitación (AU6.10).

Necesidades: vender escaneando, buscar un producto y saber dónde está, cargar la mercadería que llega, sin trabas.

Permisos (acceso limitado): puede escanear y vender, buscar productos y ubicaciones, ver precios de venta y stock, registrar ingresos y egresos de stock y los cobros en la caja. No puede ver resúmenes financieros (saldos y resúmenes de caja, costos, márgenes, ganancias, montos adeudados, panel de consumos), editar proveedores, gestionar la configuración ni los usuarios, ni exportar el historial de auditoría. Algunos permisos operativos los puede habilitar el dueño (matriz de AU4).

### 3.3 Administrador de la plataforma (equipo propio)

Opera desde el Control Plane sobre la base de control: estado de los comercios, aprovisionamiento, soporte. Nunca entra a la base de un comercio sin consentimiento explícito y registro ("impersonación" auditada del PRD principal, 6.4).

Es el último recurso para transferir la titularidad de un comercio cuando el dueño perdió su cuenta de Google y no la puede recuperar (F8.12 del PRD principal), con verificación de identidad y registro.

No es un usuario del comercio: no tiene membership en ningún comercio y no aparece en la lista de usuarios.

## 4. Funcionalidades

### 4.0 Priorización

### AU1. Iniciar sesión con Google (P0)

Descripción: dueños y empleados entran con el botón "Iniciar sesión con Google", con su propia cuenta de Google (Gmail o Google Workspace). El sistema confirma la identidad con OpenID Connect y no maneja contraseñas. La cuenta de Google es obligatoria para todos los usuarios: no hay otro método de ingreso, y quien no tiene una la crea (gratis) antes de entrar.

### Requerimientos:

AU1.1 La pantalla de ingreso muestra un único botón "Iniciar sesión con Google" respetando las pautas de marca de Google (botón oficial de Google Identity Services o uno equivalente que cumpla las guías [a verificar pautas vigentes]). No hay campos de usuario ni contraseña.

AU1.2 El flujo es OAuth 2.0 / OpenID Connect, Authorization Code con PKCE (S256), ejecutado en el servidor Astro (SSR): el navegador solo recibe redirecciones; el intercambio del código por tokens y la validación del ID token se hacen en el backend (detalle en 6.2 y 6.3).

AU1.3 Se piden solo los scopes openid, email y profile [fuente: Google: son los únicos scopes que lista el documento de descubrimiento OIDC]. No se pide access_type=offline ni ningún scope de Gmail, Drive, Photos u otra API.

AU1.4 El backend acepta el login solo si el ID token es válido (firma con las claves JWKS de Google, iss, aud, exp, iat, nonce) y email_verified = true.

AU1.5 El identificador estable del usuario es el sub de Google. El email se usa para emparejar invitaciones y para mostrar; si el usuario cambia el email de su cuenta de Google, en el siguiente login se actualiza el email guardado y se conserva el usuario.

AU1.6 La verificación en 2 pasos, la detección de accesos sospechosos y la recuperación de la cuenta las gestiona Google. El sistema no implementa un segundo factor propio y, en la ayuda, recomienda activar la verificación en 2 pasos (sobre todo al Dueño).

AU1.7 Se aceptan cuentas personales (@gmail.com), cuentas de Google creadas con un email que no es de Gmail (por ejemplo, @hotmail.com o @yahoo.com.ar, una vez que Google verificó ese email) y de Google Workspace, sin restringir dominio (hd).

AU1.8 Mensajes de error claros y en castellano: "Cancelaste el ingreso con Google", "Tu cuenta de Google no tiene el email verificado", "Esta cuenta no tiene acceso a ningún comercio. Si te invitaron, abrí el email de invitación; si sos dueño, creá tu comercio".

AU1.9 (P1) Google One Tap en la landing y en la pantalla de ingreso, como atajo para usuarios con sesión de Google en el navegador, con la misma validación del ID token en el backend [a verificar migración de One Tap a FedCM].

AU1.10 (P2) Suscripción a Cross-Account Protection (RISC) de Google para recibir eventos de seguridad de la cuenta (cuenta comprometida, deshabilitada, sesiones revocadas) y cerrar las sesiones del sistema de ese usuario [a verificar requisitos].

AU1.11 Cuenta de Google obligatoria: debajo del botón, la pantalla de ingreso muestra "¿No tenés cuenta de Google? Creá una gratis" con un enlace a la creación de cuenta de Google (https://accounts.google.com/signup [a verificar URL vigente]) que se abre en una pestaña nueva, y un texto corto: "Podés usar un Gmail nuevo o el email que ya usás". No se ofrece ningún otro camino (ni contraseña, ni enlace mágico, ni PIN, ni otros proveedores). La guía está pensada para hacerse completa desde el celular, en línea con el enfoque mobile-first del PRD principal.

### Criterios de aceptación:

☐ Toco "Iniciar sesión con Google", elijo mi cuenta y la pantalla de consentimiento de Google solo me pide ver mi nombre, mi email y mi foto de perfil.

☐ Si mi cuenta tiene verificación en 2 pasos, Google me la pide; el sistema no me pide ningún código propio.

☐ La URL de autorización incluye code_challenge_method=S256, state y nonce, y scope=openid email profile, sin otros scopes ni access_type=offline.

☐ Un ID token con firma inválida, aud de otro cliente, iss distinto de Google, vencido, con nonce distinto o con email_verified = false es rechazado (tests automáticos con tokens fabricados).

☐ Cancelo en la pantalla de Google y vuelvo a la pantalla de ingreso con el mensaje "Cancelaste el ingreso con Google", sin error técnico.

☐ Cambio el email de mi cuenta de Google y al volver a entrar sigo siendo el mismo usuario, con mi historial.

☐ No existe ninguna pantalla, endpoint ni campo de contraseña en el sistema.

☐ En la pantalla de ingreso veo "¿No tenés cuenta de Google? Creá una gratis"; al tocarlo se abre la creación de cuenta de Google en una pestaña nueva y la pantalla de ingreso sigue abierta.

☐ Una cuenta de Google creada con un email que no es de Gmail (ya verificado por Google) puede entrar igual que una de Gmail.

☐ No existe ningún método de ingreso alternativo a Google: ni enlace mágico, ni cuenta solo con PIN, ni email + contraseña (revisión de rutas y test automático).

### AU2. Datos de identidad mínimos (P0)

Descripción: el sistema guarda lo mínimo para reconocer al usuario y mostrar su nombre en el historial.

### Requerimientos:

AU2.1 Se guardan en users (base de control) solo: google_sub (único), email, email_verificado, nombre y, opcionalmente, foto_url; más metadatos propios (created_at, ultimo_login_at, estado).

AU2.2 Nunca se guardan contraseñas, hashes de contraseñas, preguntas de seguridad, el access token, el refresh token ni el ID token de Google. El ID token se valida y se descarta en la misma request.

AU2.3 En la base de cada comercio solo se guarda una referencia (user_id) y el nombre visible para el historial y la auditoría (como en el PRD principal, 6.12); nunca credenciales.

AU2.4 Los datos de identidad se actualizan en cada login (nombre, email y foto si cambiaron en Google), con registro del cambio de email en la auditoría de accesos (AU12).

AU2.5 Los datos personales (email, nombre, número de WhatsApp) se tratan según la Ley 25.326; la política de privacidad explica qué se guarda y para qué. (P1) "Mi cuenta" permite descargar mis datos y pedir la baja de mi usuario (los movimientos que hice quedan en el historial del comercio con mi nombre, por ser datos del comercio).

### Criterios de aceptación:

☐ Un test automático sobre el esquema de la base de control falla si aparece cualquier columna con password, passwd, hash_clave, refresh_token o access_token en las tablas de identidad.

☐ Después de un login, en la base de control solo hay sub, email, nombre (y foto si existe) para mi usuario; en los logs no aparecen ni el ID token ni el email completo.

☐ Cambio mi nombre en Google y, al volver a entrar, el sistema muestra el nombre nuevo; los movimientos anteriores siguen asociados a mi usuario.

### AU3. Separación del login y de los permisos de Gmail / Google Photos (P0)

Descripción: el login con Google y la lectura de Gmail son cosas distintas. El login pide solo identidad; la conexión de Gmail del PRD de consumos (CS1) y del PRD de caja (C13) usa el scope restringido gmail.readonly, es opcional, la inicia solo el Dueño desde la web y tiene su propio consentimiento. Lo mismo vale para Google Photos (PRD de caja y PRD de facturas).

### Requerimientos:

AU3.1 Dos aplicaciones OAuth separadas (recomendado: dos proyectos de Google Cloud o, como mínimo, dos clientes OAuth con pantallas de consentimiento distintas [a verificar si la verificación de la app se evalúa por proyecto]):

App de login: scopes openid, email, profile (no sensibles), en modo producción con verificación de marca; sin límite de usuarios de prueba.

App de integraciones: gmail.readonly (restringido, con verificación de Google y evaluación de seguridad anual CASA) y los scopes de Google Photos; mientras no esté verificada, queda en modo prueba con hasta 100 usuarios de prueba, que es la beta cerrada de los PRD de consumos y caja.

Motivo: que el estado de verificación de Gmail (beta cerrada, CASA) nunca bloquee ni limite el login de todos los comercios, y que la pantalla de consentimiento del login no muestre permisos alarmantes.

AU3.2 El login no usa include_granted_scopes ni autorización incremental para sumar Gmail o Photos: son flujos OAuth independientes, con access_type=offline solo en la app de integraciones.

AU3.3 La conexión de Gmail y de Google Photos solo la puede iniciar el Dueño, desde Configuración en la web, con sesión activa y reautenticación (AU10), y con la pantalla de consentimiento propia definida en CS1.2 del PRD de consumos.

AU3.4 La cuenta de Gmail conectada puede ser distinta de la cuenta de Google con la que el dueño inicia sesión (por ejemplo, el Gmail del negocio). La conexión pertenece al comercio y queda registrada con el usuario que la autorizó.

AU3.5 Los refresh tokens de Gmail y Google Photos se guardan cifrados en la base del comercio, como definen los PRD de consumos y caja; los tokens del login no existen (AU2.2).

AU3.6 Revocar el acceso de un usuario (AU7) o cerrar sus sesiones no desconecta el Gmail ni el Google Photos del comercio. Si el usuario revocado era quien autorizó la conexión (por ejemplo, un co-dueño en P1), se le avisa al Dueño titular para que decida si la mantiene o la vuelve a autorizar.

AU3.7 Si el Dueño desconecta Gmail o Photos, o revoca el acceso desde su cuenta de Google, eso no afecta al login.

AU3.8 Los textos de la web lo explican: "Para entrar usamos solo tu nombre y tu email de Google. Leer tu Gmail es opcional y se activa aparte, en Consumos de servicios."

### Criterios de aceptación:

☐ La pantalla de consentimiento del login muestra solo nombre, email y foto de perfil, aunque el comercio tenga Gmail conectado.

☐ Un comercio fuera de la beta cerrada de Gmail puede registrarse e iniciar sesión sin ningún límite de usuarios de prueba.

☐ Un Empleado no ve ninguna opción para conectar Gmail o Google Photos, y la API se lo rechaza.

☐ Conecto el Gmail del negocio (distinto de mi cuenta de login) y sigo entrando con mi cuenta personal sin cambios.

☐ Desconecto Gmail y mi sesión y las de mis empleados siguen activas.

☐ Revoco a un empleado y la conexión de Gmail del comercio sigue activa.

### AU4. Roles y matriz de permisos (P0)

Descripción: dos roles en el MVP. El Dueño tiene acceso total. El Empleado tiene acceso limitado: opera el mostrador (escanear, vender, buscar productos y ubicaciones) pero no ve información financiera ni administra el comercio. La misma matriz se aplica en la web, en la PWA, en la API y en el bot de WhatsApp.

### Requerimientos:

AU4.1 Cada membership (usuario + comercio) tiene un rol: dueno o empleado. En el MVP hay un solo Dueño por comercio (el titular); co-dueños en P1 (AU14).

AU4.2 Los permisos se evalúan en el backend en cada request (middleware de Astro + verificación por acción en el dominio), nunca solo ocultando botones. La web y el bot ocultan las opciones no permitidas como comodidad, no como barrera (B1.7 del PRD del bot).

AU4.3 Las respuestas de la API para un Empleado no incluyen los campos financieros (costo, margen, ganancia, saldos, montos adeudados, datos de cobro): se filtran en el servidor, no en el cliente. El catálogo cacheado offline del Empleado tampoco los tiene.

AU4.4 Interruptores operativos (P0): el Dueño puede habilitar para un empleado puntual solo los permisos marcados con ⚙️ en la matriz (son los "empleado con permiso" ya previstos en el PRD principal, el PRD de caja, el PRD de facturas y el PRD de órdenes de pago). Se guardan en memberships.permisos (JSON validado con Zod contra una lista cerrada). Excepción: registrar devoluciones (AU4.9) está habilitado por defecto para los Empleados y el Dueño lo puede restringir (✅⚙️).

AU4.5 Permisos nunca delegables en el MVP (🔒): gestión de usuarios e invitaciones, configuración del comercio, suscripción, conexiones de Google (Gmail, Photos), edición de proveedores y de datos de cobro, exportación del historial de auditoría y de datos, y cualquier vista financiera (costos, márgenes, saldos y resúmenes de caja, montos adeudados, panel de consumos). Abrir algunos de estos a empleados queda para los permisos finos (P2) y es una pregunta abierta.

AU4.6 Un acceso denegado devuelve 403 con un mensaje en castellano ("No tenés permiso para ver costos") y queda registrado (sin datos sensibles) para detectar intentos repetidos.

AU4.7 Si el comercio está suspendido por mora (solo lectura, patrón ModoOps), los permisos de escritura quedan bloqueados para todos los roles, salvo las acciones del Dueño necesarias para regularizar (pagar la suscripción, exportar sus datos).

AU4.8 Los jobs automáticos actúan como "Sistema" (PRD principal, 6.11) con los permisos mínimos de cada job, y no heredan los de ningún usuario.

AU4.9 Registrar devoluciones (C14 del PRD de caja): el Dueño siempre puede registrar devoluciones a clientes. El Empleado puede por defecto: el permiso registrar_devoluciones de memberships.permisos vale true al crear la membership, y el Dueño lo puede restringir o volver a habilitar por empleado desde "Usuarios" → [empleado] → "Permisos" (con reautenticación, AU10.1). El cambio aplica de inmediato (los permisos se leen de la membership en cada request y en cada mensaje del bot, AU11.4; la sesión rota, AU8.5) y queda en la auditoría de accesos (auth_events tipo permisos_cambiados, replicado en el audit_log del comercio, AU12). Un Empleado restringido no ve el botón "Registrar devolución" en la web, la PWA ni el bot, y el servidor rechaza el intento con 403 ("No tenés permiso para registrar devoluciones"), incluidas las devoluciones que lleguen en la cola offline. Medio de reembolso: lo elige quien registra la devolución (Dueño o Empleado habilitado) al momento de registrarla, y queda auditado en el propio movimiento de caja (cash_movements.metodo_id como medio de reembolso, user_id de quien la registró, fecha y hora, referencia a la venta original; auditoría C7.6 e historial C11.1 del PRD de caja). Esto difiere de C14.9 del PRD de caja, que hoy dice "por defecto, no", y de C14.2 / C4.6, que hoy fijan el medio de la devolución al de la venta original (ver ajuste 8 de 4.16).

AU4.10 Funciones nuevas de v1 (fiado, entrega de turno, conteo por sector, promos y combos, lotes): se agregan a la matriz con estos valores por defecto: el Dueño puede todo; el Empleado puede vender a cuenta dentro del tope del cliente, cobrar fiado, entregar, recibir y rechazar el turno, contar por sector y cargar lotes con su vencimiento al recibir mercadería; solo el Dueño cambia topes, da de baja deudas de fiado, puede superar el tope en una venta, resuelve disputas y diferencias de turno, confirma los ajustes de un conteo, crea o edita promociones y combos, corrige vencimientos y da de baja lotes vencidos. Lo marcado ⚙️ se puede habilitar por empleado (AU4.4); lo marcado 🔒 no. Las promociones vigentes se aplican solas en la venta (RT12.4 del PRD de rotación): aplicarlas no es un permiso, cualquier usuario que vende las obtiene. Excepción acotada a AU4.3: al vender a cuenta o cobrar fiado, el Empleado ve el saldo del cliente que está atendiendo (para cobrarle y saber si tiene cupo), pero no el listado de saldos ni el total adeudado del comercio [decisión propuesta]. Los cambios de tope, las bajas de deuda, los rechazos y resoluciones de entregas, la confirmación de ajustes por conteo, la creación o edición de promos y los cambios de vencimiento quedan en el audit_log del comercio con usuario, fecha y hora (F3 del PRD principal). Los permisos se validan igual al sincronizar la cola offline (OF9.3 y OF16 del PRD offline).

Leyenda: ✅ permitido · ❌ no permitido · ⚙️ no permitido por defecto, el Dueño lo puede habilitar para un empleado · ✅⚙️ permitido por defecto, el Dueño lo puede restringir para un empleado · 🔒 solo Dueño, no delegable en el MVP · "propio" = solo lo que registró ese empleado.

### Matriz de permisos (MVP):

### Criterios de aceptación:

☐ Como Empleado no veo costos, márgenes, ganancias, saldos ni resúmenes de caja, montos adeudados ni el panel de consumos en ninguna pantalla, y si llamo a esos endpoints directamente recibo 403.

☐ Como Empleado, el JSON de la búsqueda de productos no incluye costo_unitario ni margen (test de contrato de la API).

☐ Como Empleado puedo escanear y vender, buscar un producto por nombre y ver en qué ubicación está.

☐ Como Empleado no veo la opción de exportar el historial; si llamo a la API de exportación recibo 403 y el intento queda registrado.

☐ Como Empleado no puedo crear ni editar proveedores, usuarios ni la configuración.

☐ El Dueño habilita "Confirmar y enviar pedidos" para Juan; Juan puede enviar un pedido y Ana (otra empleada sin el permiso) no.

☐ El Dueño no encuentra ninguna opción para habilitarle a un empleado ver costos, exportar el historial o gestionar usuarios en el MVP.

☐ Un test automático recorre todos los endpoints de la API con un usuario Empleado y verifica la matriz (lista blanca de endpoints permitidos; cualquier endpoint nuevo sin regla de permisos hace fallar el CI).

☐ La misma regla de permisos aplica a la web, a la PWA offline (al sincronizar la cola) y al bot.

☐ (Devoluciones) Invito a un empleado nuevo y, sin tocar nada, puede registrar una devolución desde una venta (permiso registrar_devoluciones activado por defecto).

☐ (Devoluciones) Como Dueño restrinjo "Registrar devoluciones" para Juan y después lo vuelvo a habilitar, desde su ficha de permisos y sin afectar a otros empleados.

☐ (Devoluciones) El cambio aplica de inmediato: con la app de Juan abierta, su siguiente acción ya refleja el permiso nuevo sin cerrar sesión, y en "Usuarios" → "Actividad" queda "Restringiste 'Registrar devoluciones' a Juan" con fecha, hora y quién lo hizo.

☐ (Devoluciones) Con el permiso restringido, Juan no ve "Registrar devolución" en la web, la PWA ni el bot, y si llama a la API (o sincroniza una devolución de la cola offline) recibe 403 y el intento queda registrado.

☐ (Devoluciones) Al registrar una devolución elijo el medio de reembolso (Efectivo, Débito, Mercado Pago, QR o Transferencia bancaria); el egreso de caja queda con ese medio, mi usuario, fecha, hora y la venta original, y se ve en la auditoría y el historial de la caja.

☐ (Fiado) Como Empleado vendo $5.000 a cuenta a Doña Rosa (saldo $10.000, tope $20.000); si intento vender $12.000 la app no me deja superar el tope y el servidor rechaza el intento con 403. Como Dueño puedo superarlo con confirmación.

☐ (Fiado) Como Empleado cobro $3.000 de fiado por QR y veo solo el saldo de Doña Rosa; no veo el listado de saldos ni el total de fiado del comercio.

☐ (Fiado) Como Empleado no veo las opciones "Cambiar tope" ni "Dar de baja deuda"; como Dueño, dar de baja una deuda me pide reautenticación y queda en la auditoría.

☐ (Turno) Como Empleado entrego el turno, recibo el de otro y rechazo una entrega con mi conteo; no puedo resolver la disputa (403); como Dueño la resuelvo y queda en la auditoría.

☐ (Turno) Como Empleado veo la diferencia de mi entrega recién después de guardar mi conteo, y no veo el reporte de diferencias por empleado.

☐ (Conteo) Como Empleado cuento la "Heladera A" y la dejo "lista para revisar", sin ver el valor a costo; no puedo confirmar los ajustes salvo que el Dueño me habilite el permiso.

☐ (Promos) Como Empleado vendo 2 Jorgito y se aplica sola la promo 2x1; no veo la opción de crear o editar promociones, y si llamo a la API recibo 403.

☐ (Lotes) Como Empleado cargo 12 yogures con vencimiento 15/10 al recibir mercadería; no puedo corregir la fecha de un lote ni darlo de baja como vencido salvo que el Dueño me habilite.

☐ (Offline) Las ventas a cuenta, cobros, entregas y conteos de un Empleado que llegan en la cola offline se validan con la misma matriz al sincronizar; si una venta a cuenta quedó sobre el tope por ventas de otro celular, se acepta y se marca (OF16.1.4 del PRD offline), sin dar al Empleado el permiso de superar el tope.

### AU5. Alta del comercio con la cuenta de Google del dueño y aprovisionamiento (P0)

Descripción: un kiosco nuevo se registra con la cuenta de Google del dueño. El alta crea el usuario y el comercio en la base de control, aprovisiona la base de datos propia del comercio (una base por cliente, PRD principal 6.4) y la registra en el catálogo de la base de control antes de habilitar el acceso.

### Requerimientos:

AU5.1 Desde la landing, "Probar gratis" → "Iniciar sesión con Google". Si el sub no existe en users y no hay invitación pendiente para su email, se crea el usuario y se muestra el formulario mínimo del comercio: nombre, rubro, CUIT (opcional), zona horaria (por defecto America/Argentina/Buenos_Aires) y moneda ARS (F8.1).

AU5.2 Al confirmar, en la base de control se crean, en una transacción: el tenant en estado aprovisionando, la membership con rol Dueño (titular) y un registro en el catálogo de bases (tenant_databases) en estado pendiente.

AU5.3 Un job de aprovisionamiento (cola de jobs del PRD principal) crea la base del comercio, aplica todas las migraciones vigentes, carga los datos semilla (por ejemplo, los medios de pago y categorías de la caja, según el PRD de caja) y marca la base como lista con su versión de esquema. Recién ahí el tenant pasa a prueba (prueba gratis de 14 días) y el dueño entra al asistente de bienvenida.

AU5.4 El aprovisionamiento es idempotente y reintentable: si falla a mitad de camino, se reintenta desde el último paso registrado; si sigue fallando, alerta al Control Plane y el dueño ve "Estamos preparando tu comercio, te avisamos por email en cuanto esté listo", sin perder lo que cargó en el formulario.

AU5.5 Objetivo de tiempo: base lista en menos de 30 segundos (p95) para que el dueño no espere; mientras tanto, la pantalla muestra el progreso.

AU5.6 Un usuario que ya es Dueño de un comercio y vuelve a tocar "Probar gratis" entra a su comercio existente (en el MVP, un comercio por usuario; varios comercios en P1, AU14).

AU5.7 Protección contra altas abusivas: rate limiting por IP y por cuenta, límite de comercios en prueba por usuario y detección de altas en masa desde el Control Plane.

AU5.8 La sesión que se crea en el alta queda vinculada al tenant nuevo (AU8), y el alta queda registrada en la auditoría de accesos (AU12).

AU5.9 Dueño sin cuenta de Google: la cuenta de Google también es obligatoria para el Dueño. En "Probar gratis", debajo de "Iniciar sesión con Google", se muestra "¿No tenés cuenta de Google? Creá una gratis (podés usar el email que ya tenés)" con el enlace de AU1.11. Después de crearla, el dueño vuelve a la pestaña del sistema, toca "Iniciar sesión con Google" y sigue el alta normal. No hay alta del comercio sin cuenta de Google.

### Criterios de aceptación:

☐ Me registro con Google, completo nombre y rubro y en menos de 60 segundos estoy en el asistente de bienvenida de mi comercio, sin crear contraseña.

☐ En la base de control quedan mi usuario (sub, email, nombre), el tenant, mi membership como Dueño y el registro de la base de mi comercio con su versión de esquema.

☐ La base de mi comercio existe, tiene todas las migraciones aplicadas y los medios de pago de la caja cargados.

☐ Si el aprovisionamiento falla una vez (simulado), se reintenta solo y termina bien sin crear una segunda base ni un segundo tenant.

☐ Hasta que la base no está lista, ninguna request a la API del comercio se ejecuta (responde "en preparación").

☐ Si vuelvo a tocar "Probar gratis" con la misma cuenta, entro a mi comercio en vez de crear otro.

☐ Si no tengo cuenta de Google, desde "Probar gratis" llego a la creación de cuenta de Google, la creo desde el celular, vuelvo y completo el alta sin que se me ofrezca ningún otro método de registro.

### AU6. Invitación de empleados y vínculo de la cuenta de Google (P0)

Descripción: el Dueño invita a un empleado por email. El empleado acepta iniciando sesión con la cuenta de Google de ese email, y en ese primer ingreso su cuenta de Google (sub) queda vinculada al comercio.

### Requerimientos:

AU6.1 Desde "Usuarios" → "Invitar empleado", el Dueño escribe el email (Gmail o cualquier email asociado a una cuenta de Google, o que el empleado vaya a usar para crear una), elige el rol (Empleado en el MVP) y, si quiere, los interruptores operativos (AU4.4). Requiere reautenticación reciente (AU10).

AU6.2 Se crea una invitación en la base de control con un token aleatorio de un solo uso (se guarda solo su hash), estado pendiente y vencimiento (por defecto 7 días). Se envía el email "Te invitaron a [Comercio] en [Producto]" con el botón "Aceptar invitación" (proveedor transaccional del PRD principal, 6.7) y, siempre, el bloque "¿No tenés cuenta de Google?" (AU6.10; textos en AU6.13).

AU6.3 Al tocar el enlace, el empleado ve el nombre del comercio y quién lo invitó, y toca "Iniciar sesión con Google". El token de la invitación viaja en el state del flujo OIDC (o en una cookie temporal HttpOnly), nunca en el ID token.

AU6.4 Vínculo: si el ID token es válido, email_verified = true y el email coincide con el invitado (comparación sin distinguir mayúsculas; normalización de puntos en direcciones @gmail.com como pregunta abierta), se crea o reutiliza el usuario por sub, se crea la membership con el rol y permisos de la invitación, y la invitación pasa a aceptada con aceptada_por_user_id. Desde ahí el acceso se identifica por el sub, aunque después cambie el email.

AU6.5 Si el email de la cuenta de Google no coincide, no se vincula: "Entraste con ana.p@gmail.com, pero la invitación es para ana.perez@gmail.com. Entrá con esa cuenta o pedile al dueño que te invite con este email." No se revela ningún dato del comercio más allá de su nombre.

AU6.6 También se acepta la invitación sin el enlace: si un usuario inicia sesión con Google y existe una invitación pendiente y vigente para su email verificado, se le ofrece "Tenés una invitación de [Comercio]. ¿Aceptar?".

AU6.7 El Dueño ve la lista de invitaciones (pendiente, aceptada, vencida, cancelada) y puede reenviar (genera un token nuevo e invalida el anterior) o cancelar.

AU6.8 Una invitación vencida, cancelada o ya usada no da acceso. Límite de invitaciones pendientes por comercio y rate limiting de reenvíos (anti-spam). El plan limita la cantidad de usuarios (Básico: 2 usuarios, según el PRD principal) y se valida en el backend al invitar y al aceptar.

AU6.9 Un empleado que ya tenía una membership revocada en el mismo comercio puede volver a ser invitado; al aceptar se reactiva su mismo usuario (por sub), y su historial anterior sigue asociado.

AU6.10 Invitado sin cuenta de Google: como la cuenta de Google es obligatoria y el sistema no consulta a Google si un email tiene cuenta, el email de invitación y la pantalla de la invitación muestran siempre el bloque "¿No tenés cuenta de Google?" con una guía de 3 pasos y el botón "Crear cuenta de Google" (enlace de AU1.11, en una pestaña nueva, sin perder la invitación). La guía recomienda crear la cuenta con el mismo email al que llegó la invitación (opción de Google "Usar mi dirección de correo electrónico actual" [a verificar texto vigente]), así el email coincide y la invitación se acepta sin pedirle nada al Dueño; si prefiere un Gmail nuevo, gratis, se le avisa que tendrá que pedirle al Dueño que lo invite con ese Gmail (AU6.5).

AU6.11 La invitación sigue vigente mientras el empleado crea su cuenta: crear la cuenta de Google no consume ni modifica la invitación; queda pendiente y válida hasta su vencimiento (7 días por defecto, AU6.2). El empleado vuelve a tocar el enlace del email (o entra a la pantalla de ingreso, AU6.6) y acepta. Si venció, ve "Esta invitación venció. Pedile a [Dueño] que te la reenvíe" y el Dueño la reenvía (AU6.7). El Dueño ve la invitación como "Pendiente" en la lista, con la ayuda "Si no tiene cuenta de Google, tiene que crearla primero".

AU6.12 Desde el celular y sin atajos: toda la guía (email, pantalla de invitación y creación de la cuenta en Google) se puede completar desde el celular del empleado; en Android se le indica que también puede agregar la cuenta desde "Ajustes" → "Google"/"Cuentas" → "Agregar cuenta" [a verificar ruta según versión de Android]. No hay alternativa sin cuenta de Google ni se sugiere usar la cuenta del Dueño o una cuenta compartida del comercio (AU13.2). La guía aclara que Google exige una edad mínima para gestionar la propia cuenta (13 años en Argentina) [fuente: Google, Ayuda de Cuenta de Google "Restricciones de edad", consultada el 9/10/2026; a verificar].

AU6.13 Textos de la invitación y del onboarding (copy):

Asunto del email: "[Dueño] te invitó a [Comercio] en [Producto]".

Cuerpo: "Hola, [Dueño] te invitó a usar [Producto] en [Comercio] como Empleado/a. Para entrar necesitás una cuenta de Google: es la única forma de ingresar (no hay contraseñas). [Aceptar invitación]"

Bloque "¿No tenés cuenta de Google?": "Creala gratis en unos minutos, desde tu celular: 1. Tocá 'Crear cuenta de Google'. 2. Elegí 'Usar mi dirección de correo electrónico actual' y escribí [email invitado] (o creá un Gmail nuevo; en ese caso pedile a [Dueño] que te invite con ese Gmail). 3. Volvé a este email y tocá 'Aceptar invitación'. Tu invitación sigue valiendo hasta el [fecha de vencimiento]. [Crear cuenta de Google]"

Pie: "Usá tu propia cuenta: no compartas la cuenta con otras personas, así queda registrado quién hizo cada cosa."

Pantalla de la invitación: "[Dueño] te invitó a [Comercio]. [Iniciar sesión con Google]. ¿No tenés cuenta de Google? [Crear cuenta de Google] y después volvé a este enlace; tu invitación vence el [fecha]."

Bienvenida tras aceptar: "¡Listo, [Nombre]! Ya estás en [Comercio]. La próxima vez abrí la app y entrás directo." (con la oferta de instalar la PWA).

### Criterios de aceptación:

☐ Invito a juan@gmail.com; Juan recibe el email, toca "Aceptar invitación", entra con esa cuenta de Google y queda en mi comercio con rol Empleado.

☐ Si Juan entra con otra cuenta de Google, la invitación no se acepta y ve el mensaje explicativo.

☐ Una invitación de hace 8 días (vencida) o ya usada no permite entrar.

☐ Reenvío una invitación y el enlace anterior deja de funcionar.

☐ Con el plan Básico completo (2 usuarios), al intentar invitar a un tercero el sistema me ofrece pasar a Pro.

☐ En la base de control la invitación guarda solo el hash del token, y el email de invitación no muestra datos del comercio más allá de su nombre.

☐ Invito a sofia.lopez@hotmail.com, que no tiene cuenta de Google: el email y la pantalla de la invitación le muestran el bloque "¿No tenés cuenta de Google?" con la guía y el botón "Crear cuenta de Google", que abre la creación de cuenta de Google en una pestaña nueva.

☐ Sofía crea su cuenta de Google con sofia.lopez@hotmail.com desde el celular, vuelve al enlace del email, toca "Iniciar sesión con Google" y queda en mi comercio como Empleada, sin que yo tenga que hacer nada más.

☐ Mientras Sofía crea la cuenta, la invitación sigue "Pendiente" y válida hasta su vencimiento; si vuelve al día 6, la acepta; si vuelve al día 8, ve que venció y yo puedo reenviarla.

☐ Si Sofía crea un Gmail nuevo en vez de usar su email, ve el mensaje de AU6.5 con la opción de pedirme que la invite con el Gmail nuevo.

☐ En ningún paso de la invitación aparece un método para entrar sin cuenta de Google.

### AU7. Revocación de acceso (P0)

Descripción: el Dueño le saca el acceso a un empleado en un toque. La revocación mata las sesiones activas en todos los dispositivos y desvincula su número del bot, con efecto inmediato.

### Requerimientos:

AU7.1 Desde "Usuarios", el Dueño toca "Revocar acceso" sobre un empleado y confirma (con reautenticación reciente, AU10). Opcional: motivo interno.

AU7.2 En una sola transacción de la base de control: la membership pasa a revocada (revocado_at, revocado_por), se marcan como revocadas todas las sesiones de ese usuario en ese comercio, se revocan sus bot_links en ese comercio y se cancelan sus invitaciones pendientes.

AU7.3 El middleware valida en cada request la sesión y la membership activa contra la base de control; no hay caché de autorización más larga que unos segundos y la revocación la invalida explícitamente (ver 6.4). La siguiente request del empleado (web, PWA, API de sincronización offline o mensaje al bot) es rechazada.

AU7.4 En la PWA, al recibir la respuesta de sesión revocada, la app borra el catálogo cacheado y los datos locales del comercio (IndexedDB, caché del service worker) y vuelve a la pantalla de ingreso. Los movimientos de la cola offline que no se sincronizaron no se aceptan con esa identidad (ver 6.6).

AU7.5 Los movimientos, ventas y registros que hizo el empleado se conservan con su nombre en el historial inmutable (F3) y en la auditoría.

AU7.6 El Dueño no puede revocarse a sí mismo ni dejar el comercio sin Dueño. La transferencia de titularidad es P1 (AU14) o, como último recurso, por soporte (F8.12 del PRD principal).

AU7.7 La revocación queda en la auditoría de accesos (AU12) y el bot le avisa al Dueño "Le sacaste el acceso a Juan; se cerraron sus 2 sesiones y se desvinculó su WhatsApp".

### Criterios de aceptación:

☐ Revoco a Juan mientras tiene la app abierta en su celular: su siguiente acción lo saca de la app (en menos de 5 segundos) y no puede volver a entrar con su cuenta de Google.

☐ Después de revocarlo, un mensaje de Juan al bot recibe "Este número no está vinculado a ningún comercio" sin datos.

☐ Sus ventas y cargas anteriores siguen en el historial con su nombre.

☐ Si Juan tenía el celular sin conexión con movimientos en cola, al reconectar esos movimientos no se registran (el servidor rechaza la identidad revocada) y la app le muestra cuántos quedaron sin registrar antes de borrar los datos locales.

☐ Un test de integración verifica que, tras revocar, todas las sesiones de ese usuario en ese comercio tienen revocada_at y sus bot_links están en estado revocado, en la misma transacción.

### AU8. Sesiones persistentes en el celular (PWA) (P0)

Descripción: en el mostrador nadie quiere volver a loguearse. Después del primer ingreso con Google, la PWA instalada en el celular (y el navegador de la PC del local) quedan con la sesión iniciada durante semanas, sin reautenticar, con una sesión del lado del servidor que se renueva con el uso.

### Requerimientos:

AU8.1 Al validar el login se crea una sesión en sessions (base de control) y se envía una cookie con un ID de sesión aleatorio (256 bits); en la base se guarda solo el hash (SHA-256) del ID.

AU8.2 La cookie es HttpOnly, Secure, SameSite=Lax, Path=/, sin Domain (prefijo __Host-), con Max-Age igual al vencimiento de la sesión. No se guarda ningún token (ni de Google ni propio) en localStorage, sessionStorage, IndexedDB ni en cookies accesibles desde JavaScript.

AU8.3 Vencimiento renovable por uso (rolling), propuesta a validar:

Inactividad: la sesión vence si no se usa durante 30 días; cada uso la extiende otros 30 días.

Máximo absoluto: 90 días desde el login; al llegar, se pide volver a tocar "Iniciar sesión con Google" (normalmente un solo toque, porque el celular ya tiene la cuenta de Google).

Rango aceptable a decidir en Fase 0: inactividad de 30 a 90 días y máximo absoluto de 90 días o sin máximo para dispositivos del Dueño. Valores configurables por entorno, no por comercio, en el MVP.

AU8.4 La renovación se hace en el servidor al validar la sesión, como máximo una vez por hora por sesión (para no escribir en cada request), y reemite la cookie con el Max-Age nuevo.

AU8.5 Rotación del ID de sesión en el login, en la reautenticación (AU10), al cambiar de comercio activo (P1) y ante un cambio de rol o permisos.

AU8.6 La PWA funciona offline con la sesión vigente (catálogo cacheado y cola de movimientos del PRD principal); al reconectar, la cola se sincroniza con la misma cookie. Si la sesión venció mientras estaba offline, la app pide iniciar sesión con Google y, si entra el mismo usuario, sincroniza la cola pendiente (cada movimiento con su idempotency_key y su client_occurred_at).

AU8.7 Cerrar sesión ("Mi cuenta" → "Cerrar sesión", y en la PC del local, "Cambiar de usuario") marca la sesión como revocada en el servidor, borra la cookie y los datos locales del comercio. Si hay movimientos sin sincronizar, la app avisa antes: "Tenés 3 movimientos sin enviar. Conectate para enviarlos antes de cerrar sesión."

AU8.8 Cada sesión guarda: usuario, comercio activo, device_id de la PWA (el mismo identificador de instalación que usa stock_movements.device_id, PRD principal 6.11), user agent resumido (navegador y sistema), IP aproximada (ciudad/país, sin guardar la IP completa más allá de 30 días), created_at, last_seen_at, idle_expires_at, absolute_expires_at, reauth_at y revocada_at con motivo.

AU8.9 Límite de sesiones activas por usuario (por ejemplo, 10); al superarlo se cierra la más antigua.

### Criterios de aceptación:

☐ Instalo la PWA en mi Android, entro con Google y durante 30 días de uso diario no me vuelve a pedir que inicie sesión.

☐ Si dejo de usar el celular 31 días (simulado), la próxima vez me pide "Iniciar sesión con Google" y vuelvo a entrar con un toque.

☐ A los 90 días del login (simulado), aunque lo use todos los días, me pide volver a tocar "Iniciar sesión con Google".

☐ La cookie de sesión es HttpOnly, Secure, SameSite=Lax, con prefijo __Host-, y no hay tokens en localStorage ni en IndexedDB.

☐ En la base de control solo está el hash del ID de sesión: con una copia de la tabla sessions no se puede armar una cookie válida.

☐ Sin conexión, sigo vendiendo; al volver la señal la cola se sincroniza sin pedirme login.

☐ Si la sesión venció mientras estaba sin conexión, inicio sesión con mi misma cuenta y la cola se sincroniza sin duplicados.

☐ Toco "Cerrar sesión" y volver atrás en el navegador no me deja operar.

☐ (iOS) En un iPhone con la PWA agregada a la pantalla de inicio, la sesión se mantiene al cerrar y reabrir la app [a verificar en Fase 0].

### AU9. Dispositivos y cierre de sesión remoto (P0)

Descripción: cada usuario ve dónde tiene la sesión abierta y la puede cerrar a distancia. El Dueño, además, ve y cierra las sesiones de todos los usuarios de su comercio (por ejemplo, si un empleado perdió el celular).

### Requerimientos:

AU9.1 "Mi cuenta" → "Dispositivos": lista de mis sesiones activas con nombre del dispositivo (el nombre asignado en devices si existe, o "Chrome en Android"), última actividad, ubicación aproximada y "Este dispositivo". Botones "Cerrar sesión en este dispositivo" y "Cerrar sesión en todos los demás".

AU9.2 "Usuarios" → [usuario] → "Dispositivos" (solo Dueño): sesiones activas de cada usuario del comercio, con "Cerrar sesión" por dispositivo y "Cerrar todas". Cerrar sesiones no revoca el acceso (el usuario puede volver a entrar con Google); para eso está "Revocar acceso" (AU7).

AU9.3 El Dueño puede ponerle nombre a los dispositivos del local ("PC del mostrador", "Celular del turno tarde"), guardado en devices de la base del comercio y visible en el historial de movimientos.

AU9.4 El cierre remoto tiene efecto en la siguiente request de ese dispositivo (mismo mecanismo que AU7.3) y la PWA borra los datos locales al detectarlo.

AU9.5 (P1) Aviso al Dueño por WhatsApp o email cuando su cuenta inicia sesión en un dispositivo nuevo ("Se inició sesión en tu comercio desde Chrome en Windows, Córdoba. Si no fuiste vos, cerrá esa sesión desde Mi cuenta").

### Criterios de aceptación:

☐ Veo mis sesiones en el celular y en la PC del local, con su última actividad; cierro la de la PC desde el celular y en la PC la siguiente acción me pide iniciar sesión.

☐ Como Dueño, veo que Juan tiene 2 sesiones y cierro la del celular que perdió; Juan sigue pudiendo entrar con Google desde un celular nuevo.

☐ "Cerrar sesión en todos los demás" deja activa solo la sesión actual.

☐ Un Empleado no ve las sesiones de otros usuarios.

### AU10. Reautenticación para acciones sensibles (P0)

Descripción: la sesión larga es cómoda, pero si alguien agarra el celular desbloqueado del dueño no debería poder invitar usuarios, cambiar un CBU o exportar todo el historial. Para las acciones sensibles (todas exclusivas del Dueño) se pide volver a pasar por Google.

### Requerimientos:

AU10.1 Acciones que requieren reautenticación reciente (ventana propuesta: 10 minutos):

Invitar usuarios, cambiar permisos, revocar acceso, cancelar invitaciones (AU6, AU7).

Cerrar sesiones de otros usuarios (AU9.2).

Cargar o cambiar datos de cobro de proveedores y beneficiarios (OP6.3 del PRD de órdenes de pago).

Conectar o desconectar Gmail o Google Photos (AU3, CS1 del PRD de consumos).

Exportar el historial de movimientos y auditoría (F3.12), el historial de caja (C11) o todos los datos del comercio (F8.5).

Suscripción: cambiar de plan, medio de pago o dar de baja el comercio (F8.4).

Cambiar datos del comercio que afectan la facturación o la identidad (CUIT, nombre legal) y, en P1, transferir la titularidad.

Desactivar la confirmación automática de pagos QR o cambiar la hora de corte de la caja (C12, C13.14) queda como pregunta abierta (frecuencia baja, impacto medio).

AU10.2 Mecanismo: si sessions.reauth_at es más viejo que la ventana, la web muestra "Por seguridad, confirmá que sos vos" y lanza el flujo OIDC de Google con prompt=select_account y login_hint = email del usuario. El callback valida el ID token como en el login, exige que el sub sea el mismo de la sesión y que el token sea recién emitido (iat de menos de 2 minutos y nonce de esta reautenticación), actualiza reauth_at y rota el ID de sesión. Luego retoma la acción pendiente.

AU10.3 Google decide si pide contraseña o verificación en 2 pasos según el estado de la cuenta en ese dispositivo; el sistema no puede forzar la reautenticación completa en Google (el documento de descubrimiento de Google no lista el claim auth_time [fuente: Google]; comportamiento de max_age [a verificar]). Por eso la reautenticación prueba que la cuenta de Google del dueño sigue presente y activa en el dispositivo, y se complementa con: aviso por WhatsApp al Dueño ante cada acción sensible (como OP6.4) y, en P1, un segundo canal opcional (código al WhatsApp vinculado del Dueño) para cambiar datos de cobro y transferir la titularidad.

AU10.4 Las acciones sensibles solo se hacen desde la web; el bot nunca las ejecuta (coherente con OP6.3: desde el bot los datos de cobro se consultan enmascarados pero no se cambian). Si se piden por WhatsApp, el bot responde con un enlace a la pantalla de la web.

AU10.5 Rate limiting de reautenticaciones fallidas (sub distinto, token vencido) y registro en la auditoría de accesos.

### Criterios de aceptación:

☐ Con la sesión abierta hace 20 días, toco "Invitar empleado" y el sistema me pide confirmar con Google antes de seguir; después de confirmar, la invitación sale sin volver a escribir el email.

☐ Durante los 10 minutos siguientes puedo revocar a otro empleado sin que me lo vuelva a pedir.

☐ Si en la reautenticación elijo otra cuenta de Google, la acción se cancela con "Tenés que confirmar con la misma cuenta con la que entraste".

☐ Cambio el CBU de Distribuidora X: me pide reautenticación y, al guardar, recibo el aviso del bot "Se cambiaron los datos de cobro de Distribuidora X desde la web".

☐ Pido "exportar el historial" por el bot y me responde con el enlace a la web; el bot no genera la exportación.

☐ Ningún Empleado llega nunca a una pantalla de reautenticación, porque ninguna acción sensible le está permitida.

### AU11. Identidad en el bot de WhatsApp (P0)

Descripción: el bot no tiene login propio: un número de WhatsApp opera como un usuario solo después de vincularlo desde la web logueada con un código de un solo uso. Los roles y permisos del usuario se aplican igual en el bot. Este requerimiento formaliza B1 del PRD del bot desde el lado de la identidad.

### Requerimientos:

AU11.1 Desde la web (Mi cuenta → WhatsApp), con sesión activa, el usuario ingresa su número; el sistema lo normaliza a E.164 (+54 9 ..., sin 0 ni 15) y genera un código de 6 dígitos de un solo uso que vence en 10 minutos, guardado solo como hash y atado a (usuario, comercio, número).

AU11.2 Verificación de posesión (B1.2 del PRD del bot): la web muestra un botón/QR que abre WhatsApp con VINCULAR 123456 hacia el número de la plataforma. El backend comprueba que el remitente coincide con el número ingresado, que el código es válido, no usado y no vencido, y crea el vínculo en bot_links con estado verificado. Máximo 5 intentos por código; después se invalida.

AU11.3 Para un Empleado, el uso del bot debe estar habilitado por el Dueño (interruptor "Puede usar el bot", por defecto activado en el MVP [a decidir]); si no, la web no le muestra la opción de vincular.

AU11.4 Cada mensaje entrante se resuelve: número → bot_links verificado → membership activa → tenant activo o en gracia → base del comercio (6.3 del PRD del bot). El rol y los permisos se leen de la membership en cada mensaje (no se copian en el vínculo), así un cambio de permisos aplica al instante.

AU11.5 Un número solo puede estar vinculado a un usuario a la vez; si otro usuario intenta vincular un número ya vinculado, se pide desvincularlo primero (por el titular o por el Dueño). En el MVP, un número opera en un solo comercio (varios comercios en P1, B1.6).

AU11.6 Revocar el acceso (AU7) o desvincular el número desde la web revoca el vínculo y su caché de resolución en la misma transacción; el siguiente mensaje no accede a datos.

AU11.7 Acciones del bot que tocan dinero o envían algo afuera (confirmar y enviar un pedido, marcar como pagado) siguen la matriz de AU4 y la confirmación explícita del PRD del bot (B1.9). Las acciones sensibles de AU10 nunca se ejecutan por el bot.

AU11.8 Cambio de número o celular perdido: el usuario (o el Dueño) desvincula el número desde la web y vincula el nuevo con otro código. (P1) Re-verificación periódica o ante cambio de wa_id informado por la Cloud API, para mitigar números reciclados por la compañía telefónica [a verificar señales disponibles en la Cloud API].

AU11.9 Los mensajes que dispara el bot por eventos (resumen de cierre, alertas, avisos de facturas) solo se envían a números vinculados cuyo usuario tiene permiso para ver ese contenido (por ejemplo, el resumen de cierre de caja nunca va a un Empleado).

### Criterios de aceptación:

☐ Desde la web logueada genero el código, envío VINCULAR 482913 desde mi WhatsApp y en menos de 10 segundos el bot me confirma "Listo, este número quedó vinculado a Kiosco La Esquina como Dueño".

☐ El código no funciona después de 10 minutos, después de usarse una vez ni desde otro número.

☐ Juan (Empleado) vinculado pregunta "cuánto me cuesta el Milka" y el bot responde "No tenés permiso para ver costos".

☐ El Dueño le habilita a Juan "Confirmar y enviar pedidos" y, sin volver a vincular, Juan puede confirmar un pedido por el bot.

☐ Revoco a Juan y su siguiente mensaje al bot no recibe ningún dato del comercio.

☐ El resumen de cierre de caja y el aviso de facturas impagas nunca le llegan a un Empleado.

### AU12. Auditoría de accesos (P0)

### Requerimientos:

AU12.1 Registro append-only en la base de control (auth_events, con los mismos permisos y triggers que stock_movements, PRD principal 6.11) de: login exitoso y fallido (motivo), alta de comercio, invitación creada, reenviada, cancelada, aceptada o rechazada por email distinto, cambio de rol o permisos, revocación, cierre de sesión (propio y remoto), reautenticación, vínculo y desvinculación del bot, cambio de email en Google, intentos de acceso denegados por permisos (agregados).

AU12.2 Los eventos que interesan al comercio (invitaciones, revocaciones, cambios de permisos, cierres de sesión remotos, vínculos del bot) se replican en el audit_log de la base del comercio, para que el Dueño los vea en "Usuarios" → "Actividad" sin acceso a la base de control.

AU12.3 Sin datos sensibles en los eventos: ni tokens, ni IDs de sesión, ni códigos; emails enmascarados en los logs de aplicación (Sentry).

AU12.4 Exportar la actividad de usuarios es una exportación de auditoría: solo Dueño, con reautenticación.

### Criterios de aceptación:

☐ Como Dueño veo "Juan aceptó la invitación (9/10 10:32)", "Cerraste la sesión de Juan en Chrome en Android (9/10 18:05)" y "Revocaste el acceso de Juan (9/10 18:06)".

☐ Un intento de UPDATE o DELETE sobre auth_events falla (test automático).

### AU13. Dispositivos compartidos y cuenta de Google obligatoria (P0 básico / P1)

### Requerimientos:

AU13.1 (P0) En la PC del mostrador cada persona entra con su propia cuenta de Google. La barra superior muestra siempre quién está logueado ("Atendiendo: Juan") y ofrece "Cambiar de usuario" (cierra la sesión actual y vuelve a "Iniciar sesión con Google" con prompt=select_account).

AU13.2 (P0) Se desaconseja compartir una cuenta de Google entre varias personas; la ayuda explica por qué (no se sabe quién vendió qué). Tampoco se acepta como solución para un empleado sin cuenta propia: debe crear la suya (AU6.10).

AU13.3 (P1) PIN corto por usuario en dispositivos del comercio (F8.3 del PRD principal): en un dispositivo marcado como "del comercio" por el Dueño, cada usuario que ya entró una vez con Google puede elegir un PIN de 4 a 6 dígitos para alternar rápido entre usuarios sin volver a Google. El PIN se guarda hasheado (con sal y algoritmo lento) ligado al dispositivo, no sirve en otro dispositivo, se bloquea a los 5 intentos y no habilita acciones sensibles. Sigue sin haber contraseñas para entrar al sistema desde un dispositivo nuevo. El PIN no es una cuenta ni un método de ingreso alternativo: no existen usuarios solo con PIN, y quien no tiene cuenta de Google no puede usarlo.

AU13.4 (P0, decidido) Sin alternativa para usuarios sin cuenta de Google: la cuenta de Google es obligatoria para el Dueño y los Empleados. Quien no tiene una la crea (gratis, con un Gmail nuevo o con un email que ya usa) siguiendo la guía de AU1.11 / AU6.10. Se descartan el enlace mágico por email, el PIN de dispositivo sin cuenta de Google y otros proveedores como alternativa (8.2, "Decisiones tomadas").

### AU14. Varios comercios y co-dueños (P1)

### Requerimientos:

AU14.1 Un usuario puede tener memberships en varios comercios (por ejemplo, un dueño con dos kioscos o un empleado que trabaja en dos); selector de comercio en la web y elección de comercio en el bot (B1.6). La sesión guarda el comercio activo y el cambio rota el ID de sesión.

AU14.2 Co-dueño: el Dueño titular puede dar rol Dueño a otro usuario (con reautenticación). Solo el titular puede transferir la titularidad o dar de baja el comercio.

AU14.3 Transferencia de titularidad entre dueños, con reautenticación de ambos y aviso por WhatsApp.

### 4.15 Integración con los demás PRDs

### 4.16 Ajustes propuestos a otros PRDs (para unificar; no se modifican desde este documento)

PRD principal, 6.7 (Email): sacar "recuperación de contraseña" de los usos del email transaccional (ya no hay contraseñas).

PRD principal, F8.11 y 6.12: alinear la duración de la sesión con la propuesta de AU8.3 (30 días de inactividad renovables, 90 días máximo absoluto) y agregar los campos idle_expires_at, absolute_expires_at y reauth_at a sessions.

PRD principal, F3.8, F3.12 y F7.6, y PRD de caja 3.2: donde dice "o un empleado con permiso" / "configurable" para exportar el historial y para ver costos, márgenes y saldos, este documento lo deja como no delegable en el MVP (permisos finos en P2). Los permisos operativos (crear productos, compensatorios, confirmar pedidos, marcar pagados, categorías de egreso) siguen siendo habilitables.

PRD del bot, 6.3 y 6.8: la entidad whatsapp_identities se implementa como bot_links (+ bot_link_codes) en la base de control; el campo rol no se duplica en el vínculo, se lee de la membership.

PRD de órdenes de pago, OP6.3: la reautenticación es "repetir el login con Google" (AU10); el magic link no existe en el MVP.

PRD principal, 6.3 (Modelo de datos): agregar bot_links, bot_link_codes y auth_events a la base de control.

PRD principal, F8.1 y pregunta 14: alinear con la decisión de la cuenta de Google obligatoria para todos los usuarios (sin email + contraseña ni otro método alternativo) y dar por resuelta la pregunta 14.

PRD de caja, C14.9 y 3.2 (permisos del Empleado): alinear con AU4.9: el Empleado puede registrar devoluciones por defecto y el Dueño lo puede restringir por empleado (hoy dice "solo si el dueño lo habilita (por defecto, no)"). Además, C14.2, C4.6, C14.4 y el campo metodo_id de cash_movements: el medio de reembolso lo elige el operador al registrar la devolución (no se fija al de la venta original) y queda auditado en el movimiento de caja.

## 5. Flujos de usuario

### Flujo 1: alta de un kiosco nuevo con la cuenta de Google del dueño

Marta entra a la landing desde su Android y toca "Probar gratis" → "Iniciar sesión con Google".

Google le muestra sus cuentas; elige marta.kiosco@gmail.com y, como tiene la verificación en 2 pasos activada, confirma en su celular.

La pantalla de consentimiento de Google solo pide nombre, email y foto de perfil; acepta.

El backend valida el ID token, no encuentra usuario ni invitación para ese sub/email, crea su usuario y le pide los datos del comercio: "Kiosco La Esquina", rubro "Kiosco".

Toca "Crear mi comercio": la pantalla muestra "Preparando tu comercio…" mientras se crea la base de datos del comercio, se aplican las migraciones, se cargan los medios de pago de la caja y se registra todo en la base de control.

En unos segundos entra al asistente de bienvenida (Flujo 1 del PRD principal) con la sesión iniciada; el navegador le ofrece instalar la PWA.

Al otro día abre la PWA y entra directo, sin volver a loguearse.

### Flujo 2: invitación y primer ingreso de un empleado

Marta va a "Usuarios" → "Invitar empleado" y escribe juan.perez@gmail.com. Como su última confirmación con Google fue hace más de 10 minutos, el sistema le pide "Confirmá que sos vos": toca su cuenta en la pantalla de Google y vuelve.

Deja los interruptores por defecto (sin crear productos ni confirmar pedidos) y toca "Enviar invitación". La invitación queda "Pendiente, vence el 16/10".

Juan recibe el email "Marta te invitó a Kiosco La Esquina", toca "Aceptar invitación" y luego "Iniciar sesión con Google" con juan.perez@gmail.com.

El sistema verifica que el email verificado de Google coincide con el invitado, vincula el sub de Juan, crea su membership como Empleado y marca la invitación como aceptada.

Juan entra al Modo venta: escanea, vende, busca "Coca 1,5" y ve "Heladera A". No ve costos, márgenes, saldos de caja ni el menú de Usuarios o Configuración.

Marta ve en "Usuarios" → "Actividad": "Juan aceptó la invitación".

### Flujo 3: el empleado intenta entrar con otra cuenta

Juan toca el enlace de la invitación desde la PC del local, donde está logueado con juanchi.futbol@gmail.com.

Toca "Iniciar sesión con Google" y Google entra con esa cuenta.

El sistema no vincula: "Entraste con juanchi.futbol@gmail.com, pero la invitación es para juan.perez@gmail.com. Tocá 'Usar otra cuenta' o pedile a Marta que te invite con este email."

Juan toca "Usar otra cuenta" (prompt=select_account), elige la cuenta correcta y entra.

### Flujo 4: el empleado deja de trabajar → revocación

Juan avisa que deja el kiosco. Marta abre "Usuarios" → Juan → "Revocar acceso", confirma con Google (reautenticación) y toca "Revocar".

En la misma transacción se revoca la membership, se cierran las 2 sesiones de Juan (su celular y la PC del local) y se desvincula su WhatsApp.

En el celular de Juan, la próxima acción muestra "Ya no tenés acceso a Kiosco La Esquina" y la app borra los datos locales.

Un mensaje de Juan al bot recibe "Este número no está vinculado a ningún comercio".

Las ventas y cargas de Juan siguen en el historial con su nombre. Marta recibe por WhatsApp: "Le sacaste el acceso a Juan; se cerraron sus 2 sesiones y se desvinculó su WhatsApp".

### Flujo 5: celular perdido → cierre de sesión remoto

Ana (Empleada) pierde el celular en el colectivo y le avisa a Marta.

Marta abre "Usuarios" → Ana → "Dispositivos", ve "Chrome en Android, última actividad hoy 9:12" y toca "Cerrar sesión" (con reautenticación).

La sesión queda revocada; si alguien abre la PWA en ese celular, ve la pantalla de ingreso.

Ana sigue teniendo acceso: desde su celular nuevo toca "Iniciar sesión con Google" y entra. Desde la web desvincula el número viejo del bot y vincula el nuevo.

### Flujo 6: el dueño hace una acción sensible desde la sesión larga

Marta tiene la sesión abierta hace 25 días. Llega una factura de Distribuidora X con un CBU nuevo y quiere actualizarlo.

Abre la ficha del proveedor → "Datos de cobro" → "Editar". El sistema muestra "Por seguridad, confirmá que sos vos" → "Continuar con Google".

Google le muestra su cuenta (y le pide la verificación en 2 pasos si su sesión de Google lo requiere); vuelve al sistema.

El backend verifica que es el mismo sub y un token recién emitido, rota la sesión y la deja reautenticada por 10 minutos.

Marta guarda el CBU nuevo; el bot le avisa "Se cambiaron los datos de cobro de Distribuidora X desde la web. Si no fuiste vos, avisanos" (OP6.4 del PRD de órdenes de pago).

### Flujo 7: vinculación del WhatsApp de un empleado

Juan, logueado en la PWA, va a "Mi cuenta" → "WhatsApp", escribe su número (11 5555-1234) y el sistema lo muestra como +54 9 11 5555-1234.

Toca "Vincular por WhatsApp": se abre WhatsApp con el mensaje VINCULAR 482913 hacia el número de la plataforma; lo envía.

El bot verifica que el remitente es el número ingresado y que el código es válido y vigente, y responde "Listo, este número quedó vinculado a Kiosco La Esquina como Empleado". Le ofrece el opt-in de avisos (B2 del PRD del bot).

Juan pregunta "cuántas Coca 1,5 hay" y recibe stock y ubicación; pregunta "cuánto me cuesta" y recibe "No tenés permiso para ver costos".

### Flujo 8: Gmail como conexión separada (Dueño)

Marta va a "Configuración" → "Consumos de servicios" → "Conectar mi email".

El sistema le pide reautenticación con Google (la de login, scopes mínimos).

Ve la pantalla de consentimiento propia del PRD de consumos (qué se lee, qué no, cómo desconectar), marca la casilla y toca "Continuar".

Se abre una segunda autorización de Google, de la app de integraciones, que pide leer su Gmail (solo lectura). Elige el Gmail del negocio, distinto de su cuenta de login.

La conexión queda "Activa" para el comercio. Su login sigue igual; si mañana desconecta Gmail, ella y sus empleados siguen entrando normalmente.

### Flujo 9: sesión vencida con ventas en cola offline

Juan vendió 6 productos sin señal en el depósito; quedaron en la cola offline.

Su sesión llegó al máximo absoluto de 90 días mientras estaba sin conexión.

Al volver la señal, la PWA intenta sincronizar y el servidor responde "sesión vencida". La app muestra "Iniciá sesión para enviar 6 movimientos pendientes".

Juan toca "Iniciar sesión con Google" con su misma cuenta; la cola se envía con sus idempotency_key y queda registrada a su nombre, con client_occurred_at (hora del celular) y created_at del servidor.

Si en vez de Juan hubiera entrado otra persona, la app no envía la cola de Juan y le pide que la envíe él.

### Flujo 10: empleada sin cuenta de Google recibe la invitación, crea su cuenta y entra

Marta invita a sofia.lopez@hotmail.com (Flujo 2). Sofía no tiene cuenta de Google: usa Hotmail y un celular Android que nunca configuró con Google.

Sofía abre el email en su celular: "Marta te invitó a Kiosco La Esquina… Para entrar necesitás una cuenta de Google". Lee el bloque "¿No tenés cuenta de Google?" y toca "Crear cuenta de Google".

Se abre la creación de cuenta de Google en una pestaña nueva. Elige "Usar mi dirección de correo electrónico actual", escribe sofia.lopez@hotmail.com, carga su nombre y fecha de nacimiento (es mayor de 13 años, requisito de Google en Argentina) y confirma el código que Google le manda a ese email.

Vuelve al email de la invitación (que sigue "Pendiente", vence el 16/10) y toca "Aceptar invitación" → "Iniciar sesión con Google"; elige la cuenta recién creada.

El sistema verifica que el email verificado coincide con el invitado, vincula su sub, crea su membership como Empleada y le muestra "¡Listo, Sofía! Ya estás en Kiosco La Esquina", con la oferta de instalar la PWA.

Marta ve en "Usuarios" → "Actividad": "Sofía aceptó la invitación". Nadie le tuvo que dar una contraseña ni prestarle una cuenta.

Variante: si Sofía hubiera creado un Gmail nuevo (sofia.lopez.kiosco@gmail.com), al entrar vería el mensaje de no coincidencia (AU6.5) y le pediría a Marta que la invite con ese Gmail.

## 6. Notas técnicas

### 6.1 Principios

Sin contraseñas, sin tokens en el navegador: la identidad la da Google (OIDC); la sesión es propia, del lado del servidor, con cookie HttpOnly.

Cuenta de Google obligatoria, sin caminos alternativos: no hay endpoints, tablas ni pantallas para otro método de ingreso; la única ayuda para quien no tiene cuenta es la guía y el enlace a la creación de cuenta de Google (AU1.11, AU6.10), que se puede completar desde el celular (enfoque mobile-first del PRD principal).

La base de control decide quién es quién: usuarios, memberships, invitaciones, sesiones y vínculos del bot viven en la base de control; la base de cada comercio solo conoce user_id y nombre.

Autorización en el servidor, siempre: middleware de Astro + verificación por acción en el dominio; ningún identificador de comercio o rol se toma del cliente.

Librerías probadas, no criptografía propia: por ejemplo, Arctic (cliente OAuth/OIDC con PKCE) + jose (validación de JWT con JWKS remoto) + sesiones propias sobre Drizzle; alternativas: Better Auth o Auth.js con proveedor Google, o Supabase Auth, siempre que permitan sesiones del lado del servidor en la base de control, revocación inmediata y el esquema de 6.5. Decisión en Fase 0.

### 6.2 Google Identity Services y flujo OIDC Authorization Code con PKCE en Astro SSR

Botón: se usa el botón de "Sign in with Google" de Google Identity Services (GIS) solo como elemento de marca, o un botón propio que cumpla las pautas de marca de Google; el clic navega a la ruta del servidor /auth/google (no se usa el flujo de token en JavaScript). (P1) One Tap de GIS como atajo: entrega un ID token por POST a login_uri; se valida igual que en 6.3 y se verifica el g_csrf_token de doble envío [a verificar el comportamiento vigente con FedCM].

Endpoints de Google (del documento de descubrimiento [fuente: Google]): autorización https://accounts.google.com/o/oauth2/v2/auth, token https://oauth2.googleapis.com/token, JWKS https://www.googleapis.com/oauth2/v3/certs, issuer https://accounts.google.com. Se lee el documento de descubrimiento al iniciar y se cachea.

### Paso 1, /auth/google (GET, servidor Astro):

Genera state (aleatorio, 32 bytes), nonce (aleatorio) y code_verifier (PKCE, 43 a 128 caracteres); calcula code_challenge = BASE64URL(SHA256(code_verifier)).

Guarda state, nonce, code_verifier, intención (login, invite:<token>, reauth) y return_to (solo rutas internas, lista blanca) en una cookie temporal __Host-oidc cifrada y firmada, HttpOnly, Secure, SameSite=Lax, de 10 minutos.

Redirige a Google con response_type=code, client_id, redirect_uri (registrada por entorno), scope=openid email profile, state, nonce, code_challenge, code_challenge_method=S256 y, según el caso, prompt=select_account y login_hint.

### Paso 2, /auth/google/callback (GET):

Verifica que state coincide con la cookie (protección CSRF del login) y que el parámetro iss de la respuesta, si viene, es el de Google (Google informa authorization_response_iss_parameter_supported [fuente: Google]); borra la cookie temporal.

Intercambia el code en el endpoint de token desde el servidor, con code_verifier y el client secret (guardado en el gestor de secretos del hosting, nunca en el cliente).

Valida el ID token (6.3); descarta el access token y no pide refresh token.

Resuelve usuario, invitación y comercio (6.4), crea la sesión (6.5), setea __Host-sid y redirige a return_to.

Errores: error=access_denied → "Cancelaste el ingreso con Google"; cualquier otra falla → mensaje genérico y evento en auth_events, sin detalles técnicos al usuario.

Astro: salida SSR (adaptador Node o Cloudflare, PRD principal 6.2); las rutas /auth/* y /api/* son endpoints del servidor; un middleware (src/middleware.ts) resuelve la sesión y deja locals.user, locals.membership, locals.tenant y locals.permisos para las páginas y endpoints. Las páginas privadas no se prerenderizan ni se cachean en CDN (Cache-Control: private, no-store).

### 6.3 Validación del ID token en el backend

Se valida siempre en el servidor, aunque el token venga del endpoint de token por un canal TLS directo (defensa en profundidad):

Firma: JWS RS256 [fuente: Google: único algoritmo listado] con las claves públicas del JWKS de Google (https://www.googleapis.com/oauth2/v3/certs), buscadas por kid, cacheadas respetando Cache-Control y refrescadas si aparece un kid desconocido (rotación). Se rechaza alg: none o cualquier otro algoritmo.

iss: https://accounts.google.com o accounts.google.com.

aud: igual al client ID de la app de login (y, si viene azp, también igual).

exp: no vencido; iat: no en el futuro, con tolerancia de reloj de ±60 segundos; para la reautenticación, iat de menos de 2 minutos.

nonce: igual al guardado en la cookie temporal.

email_verified: true; si no, se rechaza el login.

Claims usados: sub (identificador), email, name, picture (opcional). hd no se exige.

Implementación con jose (createRemoteJWKSet + jwtVerify con issuer, audience, algorithms: ['RS256']) o equivalente; tests con tokens firmados por claves de prueba para cada caso de rechazo.

### 6.4 Resolución de usuario, membership y base del comercio

Con el sub validado: SELECT en users por google_sub.

Intención invite:<token>: busca la invitación por hash del token, vigente y pendiente; compara email; crea usuario (si no existe) y membership; marca la invitación aceptada; todo en una transacción de la base de control.

Intención login: si el usuario tiene membership activa, entra a ese comercio (en P1, al último usado o al selector). Si no tiene membership pero hay invitación pendiente para su email verificado, ofrece aceptarla. Si no tiene nada, va al alta de comercio (AU5).

Intención reauth: exige sub igual al de la sesión.

Por request: cookie → hash → sessions (no revocada, no vencida) → memberships activa → tenants (estado) → catálogo tenant_databases → pool de conexiones de la base del comercio (PRD principal 6.4). Una sola consulta indexada con JOIN en la base de control.

Caché: opcional, en memoria del proceso, de hasta 15 segundos por sesión, invalidada por LISTEN/NOTIFY de PostgreSQL (o el mecanismo del hosting) al revocar una sesión, una membership o un bot_link. Con varias instancias, la invalidación se propaga a todas; si no se puede garantizar, no se cachea en el MVP.

### 6.5 Session store

Dónde: tabla sessions en la base de control (PostgreSQL). No se usan JWT de sesión autocontenidos porque no permiten revocación inmediata. (P1, si la carga lo exige) caché en Redis/Valkey con la base como fuente de verdad.

ID de sesión: 32 bytes de crypto.getRandomValues, codificado en base32/base64url; en la base, id_hash = SHA-256(id) como clave primaria.

Cookie: __Host-sid=<id>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=<segundos hasta idle_expires_at>.

Vencimiento (propuesta, AU8.3): idle_expires_at = last_seen_at + 30 días y absolute_expires_at = created_at + 90 días; la sesión es válida si now() < LEAST(idle_expires_at, absolute_expires_at) y revocada_at IS NULL. last_seen_at e idle_expires_at se actualizan como máximo una vez por hora.

Rotación: en login, reautenticación y cambio de rol/permisos o de comercio: se inserta una sesión nueva y la anterior se revoca con motivo rotada.

Limpieza: job diario que borra sesiones vencidas o revocadas hace más de 90 días (los eventos quedan en auth_events).

### 6.6 PWA, offline y sesión

El service worker no cachea respuestas HTML ni JSON privadas con Cache-Control: no-store; el catálogo offline se guarda en IndexedDB por la app, ya filtrado por permisos (sin costos para Empleados).

La cola offline guarda junto a cada movimiento el user_id que lo generó; al sincronizar, el servidor solo acepta movimientos cuyo user_id coincide con el de la sesión, con su idempotency_key (PRD principal 6.11).

Respuesta 401 con código session_expired → la app pide login y conserva la cola; 401 session_revoked o 403 membership_revoked → la app borra IndexedDB y caché del comercio y descarta la cola (informando la cantidad).

Login dentro de la PWA instalada: la redirección a Google y la vuelta al callback deben quedar dentro del contexto de la PWA para que la cookie se guarde ahí. En Android (Chrome) funciona; en iOS, las PWA agregadas a la pantalla de inicio tienen su propio almacenamiento de cookies separado de Safari y el flujo OAuth puede abrirse fuera de la app [a verificar en Fase 0 con iOS actual]. Las cookies HttpOnly seteadas por el servidor no tienen el límite de 7 días que Safari aplica a las cookies creadas por JavaScript [a verificar].

### 6.7 CSRF y otras protecciones web

CSRF del login: state atado a la cookie temporal + nonce en el ID token + PKCE.

CSRF de la app: cookie SameSite=Lax + verificación de Origin (o Sec-Fetch-Site: same-origin) en toda request que no sea GET/HEAD (Astro ofrece security.checkOrigin para SSR [a verificar versión]) + token sincronizador por sesión en formularios y en un header X-CSRF-Token para los fetch de la PWA. Ningún GET modifica estado; el logout es POST.

Redirecciones: return_to solo acepta rutas internas de una lista blanca (sin open redirect).

Headers: Content-Security-Policy estricta (scripts propios y de accounts.google.com si se usa GIS), Strict-Transport-Security con preload, X-Content-Type-Options, Referrer-Policy: strict-origin-when-cross-origin, frame-ancestors 'none'.

Rate limiting: en /auth/*, invitaciones, reautenticaciones, códigos de vinculación del bot y endpoints de permisos denegados, por IP, por usuario y por comercio.

### 6.8 Esquema de la base de control (agregados y detalle)

Además de tenants y del catálogo de bases (tenant_databases) del PRD principal (6.4):

Base del comercio: sin tablas de identidad; devices (PRD principal) guarda el nombre que el Dueño le pone a cada dispositivo; audit_log recibe la réplica de los eventos de AU12.2. Las referencias a user_id son lógicas (la FK real está en la base de control).

Migraciones: con el mismo runner del PRD principal (Drizzle, base de control + todas las bases de clientes).

Revocación (AU7.2) en SQL, en una transacción de la base de control: UPDATE memberships SET estado='revocada', revocado_at=now(), revocado_por=$dueno WHERE id=$m; UPDATE sessions SET revocada_at=now(), motivo_revocacion='revocacion_acceso' WHERE user_id=$u AND tenant_id=$t AND revocada_at IS NULL; UPDATE bot_links SET estado='revocado', revocado_at=now() WHERE user_id=$u AND tenant_id=$t AND estado<>'revocado'; UPDATE invitations SET estado='cancelada' WHERE ...; INSERT INTO auth_events ...; NOTIFY auth_invalidate.

### 6.9 Configuración en Google Cloud

App de login: proyecto propio, pantalla de consentimiento en producción con scopes no sensibles (openid, email, profile), verificación de marca (nombre, logo, dominio, política de privacidad y términos), URIs de redirección por entorno (https://app.<dominio>/auth/google/callback y staging) [a verificar requisitos vigentes de verificación de marca].

App de integraciones (Gmail, Photos): proyecto separado, según los PRD de consumos y caja (verificación de scopes restringidos, CASA, beta cerrada con hasta 100 usuarios de prueba hasta la aprobación).

Client secrets en el gestor de secretos del hosting, con rotación; alertas si cambian las URIs de redirección.

### 6.10 Calidad

Tests unitarios (Vitest) de validación del ID token (cada caso de rechazo), vencimientos de sesión, rotación, matriz de permisos y normalización de números.

Tests end-to-end (Playwright) con un proveedor OIDC simulado (por ejemplo, un servidor mock que firma tokens con claves de prueba) para los flujos 1 a 10.

Test de "endpoint sin regla de permisos" en CI (AU4) y tests de aislamiento entre comercios (PRD principal) para web, API y bot.

Pruebas manuales en Fase 0 en Android de gama media, iPhone (PWA instalada) y PC con Chrome/Edge.

## 7. Seguridad

### 7.1 Identidad y credenciales

Sin contraseñas propias: no hay base de credenciales que robar ni recuperación de contraseña que atacar. La seguridad de la cuenta (2 pasos, alertas, recuperación) la da Google.

Scopes mínimos (openid email profile) en el login; Gmail y Photos en una app OAuth separada, opcional y solo para el Dueño (AU3).

No se guardan tokens de Google del login; el client secret vive en el gestor de secretos.

ID token validado completo (firma JWKS, iss, aud, exp, iat, nonce, email_verified) y PKCE S256 + state en cada flujo.

### 7.2 Sesiones

Sesiones del lado del servidor revocables al instante; solo el hash del ID en la base; cookie __Host-, HttpOnly, Secure, SameSite=Lax.

Vencimiento por inactividad y absoluto (propuesta 30/90 días), rotación en login, reautenticación y cambios de privilegios.

Reautenticación con ventana corta para acciones sensibles del Dueño, más aviso por WhatsApp.

Lista de dispositivos y cierre remoto; revocación de acceso que cierra sesiones y desvincula el bot en una transacción.

### 7.3 Autorización y aislamiento

Matriz de permisos aplicada en el backend en cada request y en cada mensaje del bot; campos financieros filtrados en el servidor.

Resolución del comercio desde la sesión o el número vinculado, nunca desde el cliente; una base por cliente y tests de aislamiento en CI.

Lista cerrada de permisos operativos; ningún permiso financiero ni administrativo delegable en el MVP.

### 7.4 Bot de WhatsApp

Vinculación solo desde la web logueada, con código de un solo uso de 6 dígitos, 10 minutos, 5 intentos, atado al número ingresado y verificado por el remitente.

Rol leído de la membership en cada mensaje; las acciones sensibles nunca se ejecutan por el bot.

Un número no vinculado no recibe ningún dato; validación de firma de los webhooks de Meta (PRD del bot, 6.9).

### 7.5 Protección web y operación

CSRF (Origin + token), CSP estricta, HSTS, sin open redirects, no-store en páginas privadas.

Rate limiting en login, invitaciones, reautenticación y vinculación; alertas por picos de logins fallidos o accesos denegados.

Logs sin tokens, IDs de sesión, códigos ni emails completos; Sentry con limpieza de PII.

auth_events append-only; impersonación de soporte solo con consentimiento y registrada.

### 7.6 Datos personales y cumplimiento

Ley 25.326: email, nombre, foto, número de WhatsApp e IP aproximada son datos personales; finalidad declarada en la política de privacidad; derechos de acceso, rectificación y supresión (P1 desde "Mi cuenta"); registro de la base ante la AAIP (pregunta abierta del PRD principal).

Retención: IP completa como máximo 30 días; sesiones revocadas o vencidas se borran a los 90 días; auth_events se conserva mientras exista el comercio (plazo a validar con asesoría legal).

Cumplimiento de las políticas de Google para el uso de "Sign in with Google" y de la Google API Services User Data Policy en la app de integraciones [a verificar texto vigente].

## 8. Riesgos y preguntas abiertas

### 8.1 Riesgos

### 8.2 Preguntas abiertas

Duración de las sesiones: ¿30 días de inactividad y 90 de máximo absoluto, o sin máximo absoluto en los dispositivos del Dueño? ¿Distinto para la PC compartida del local (por ejemplo, 12 horas o fin del turno)?

Ventana de reautenticación: ¿10 minutos es razonable en el mostrador? ¿Qué acciones de frecuencia media (cerrar caja a mano, cambiar hora de corte, desactivar confirmación automática QR) la requieren?

Permisos financieros delegables: el PRD principal y el de caja dejan "configurable" ver costos y saldos; ¿hay demanda real de un "encargado" que vea costos o saldos? Si la hay, ¿rol "Encargado" (P1) o permisos finos (P2)?

Co-dueños en el MVP: ¿parejas o socios que manejan juntos el kiosco necesitan dos Dueños desde el día 1?

Normalización de emails Gmail en invitaciones (puntos y +alias): ¿aceptar juan.perez@gmail.com cuando entra juanperez@gmail.com?

Uso del bot por empleados: ¿habilitado por defecto o lo tiene que activar el Dueño para cada empleado?

Segundo canal para acciones críticas (código al WhatsApp del Dueño para cambiar datos de cobro): ¿P0 o P1?

Librería de auth: ¿Arctic + jose con sesiones propias, Better Auth o Supabase Auth? Criterio: sesiones en la base de control, revocación inmediata, compatibilidad con Astro SSR y el adaptador elegido.

One Tap y FedCM: ¿vale la pena en el MVP o alcanza con el botón?

Soporte e impersonación: ¿cómo da el consentimiento el Dueño (botón en la web con vencimiento) y qué ve el soporte?

Decisiones tomadas: login solo con Google (OIDC, scopes openid email profile), sin contraseñas; usuarios, memberships, invitaciones, sesiones y vínculos del bot en la base de control; una base de datos por cliente aprovisionada en el alta (igual que ModoOps); app OAuth de Gmail/Photos separada de la de login; sesiones del lado del servidor revocables; cuenta de Google obligatoria para todos los usuarios (Dueño y Empleados), decisión del dueño del producto que resuelve la antigua pregunta 1 ("Empleados sin cuenta de Google") y la pregunta 14 del PRD principal: quien no tiene una debe crear una cuenta de Google (puede ser un Gmail gratis o una cuenta de Google con un email que ya usa, no Gmail) para acceder; no hay login alternativo (ni contraseñas, ni enlace mágico por email, ni cuentas solo con PIN, ni otros proveedores como alternativa). Se refleja en AU1.11, AU5.9, AU6.10 a AU6.13, AU13.4, el Flujo 10 y los riesgos de 8.1.

## 9. Plan por fases

### Fase 0: diseño y validación (semanas 1 y 2, en paralelo a la Fase 0 del PRD principal)

Elegir librería de auth (pregunta 8) y prueba de concepto OIDC + PKCE en Astro SSR con el adaptador elegido.

Crear los dos proyectos de Google Cloud (login e integraciones), pantalla de consentimiento y verificación de marca del login.

Probar login, persistencia de sesión y vuelta del callback en la PWA instalada en Android de gama media e iPhone.

Validar en las entrevistas con comercios: cuántos empleados no tienen cuenta de Google y si la guía para crearla desde el celular alcanza (la obligatoriedad ya está decidida), cantidad de usuarios por plan, duración de sesión aceptable, PC compartida.

Cerrar la matriz de permisos (AU4) con los dueños de cada PRD y aplicar los ajustes de 4.16.

### Fase 1: MVP (semanas 3 a 8, dentro del MVP del PRD principal)

AU1 login con Google; AU2 datos mínimos; AU3 separación de apps OAuth.

AU5 alta del comercio con aprovisionamiento de la base y registro en la base de control (antes de cualquier otro módulo).

AU4 roles Dueño/Empleado y matriz de permisos en todos los módulos del MVP, con el test de "endpoint sin regla".

AU6 invitaciones, AU7 revocación, AU8 sesiones persistentes, AU9 dispositivos y cierre remoto, AU10 reautenticación, AU12 auditoría de accesos, AU13.1 "Cambiar de usuario"; guía y enlace para crear la cuenta de Google obligatoria (AU1.11, AU5.9, AU6.10 a AU6.13).

AU11 vinculación del bot junto con la Fase 1 del PRD del bot.

Beta cerrada con los 5 a 10 comercios del PRD principal; métricas de O1 a O5.

### Fase 2: comodidad (meses 3 a 5)

Varios comercios por usuario y co-dueños (AU14); PIN por usuario en dispositivos del comercio (AU13.3, F8.3).

Alternativa para empleados sin cuenta de Google según la decisión de la pregunta 1 (descartada: la cuenta de Google es obligatoria, ver 8.2); en su lugar, mejorar la guía de creación de cuenta según las métricas de la beta.

Avisos de inicio de sesión nuevo (AU9.5); segundo canal por WhatsApp para acciones críticas (AU10.3); Google One Tap (AU1.9).

"Mi cuenta": descarga de mis datos y baja del usuario (AU2.5); re-verificación de números del bot (AU11.8).

### Fase 3: robustez y permisos finos (meses 6 a 12)

Permisos finos y roles personalizados (por ejemplo, "Encargado"), si la validación lo justifica.

Cross-Account Protection (RISC) de Google (AU1.10) y sesiones atadas al dispositivo (DBSC) cuando estén disponibles.

Panel de actividad sospechosa para el Dueño y el Control Plane.

## Anexo A: glosario

Campo | Detalle
--- | ---
Producto | Módulo transversal de Autenticación y Gestión de Usuarios del Sistema de Inventario para Kioscos y Comercios (nombre comercial a definir)
Autor | Mauricio Matasini
Estado | Borrador v1
Fecha | 9 de octubre de 2026
Documentos relacionados | "PRD - Sistema de Inventario para Kioscos y Comercios" (en adelante, PRD principal: https://docs.google.com/document/d/1yqHU3xK1EYQle8J5Gag0wweTs9llCHH_X8uo4_km_AA/edit; este documento detalla y amplía su F8 y su sección 6.12), "PRD - Caja Digital para Sistema de Inventario" (PRD de caja: https://docs.google.com/document/d/14hdf2BbXewzSkjKE25zC8NEMJsDsy2ObI0IKBSt6u0U/edit), "PRD - Bot de WhatsApp para Sistema de Inventario" (PRD del bot: https://docs.google.com/document/d/1lp7TnN3MiX60OJihJdv7h_26XEAZdmyPtwjwSGEgPv8/edit), "PRD - Facturas de Proveedores para Sistema de Inventario" (PRD de facturas: https://docs.google.com/document/d/1I38DsgM56HRIyXimafn9wAGPNasTfV8sA4b4Fceoo50/edit), "PRD - Órdenes de Pago para Sistema de Inventario" (PRD de órdenes de pago: https://docs.google.com/document/d/1bXI3SwTzhnZDqViAAPUOsnU_2zL3zc0UopNElLiE_ik/edit) y "PRD - Consumos de Servicios para Sistema de Inventario" (PRD de consumos: https://docs.google.com/document/d/1LbXg794HQq7DFq7CvhDosut8wYHlpldKNhzsJg9RWqE/edit)
Terminología | La misma de los documentos relacionados: comercio/tenant, base de control, base del comercio, roles Dueño/Empleado, membership, movimiento, caja, pedido de reposición, orden de pago, factura del proveedor, consumo de servicio, vinculación del número de WhatsApp
Stack | Astro + TypeScript con salida SSR, PostgreSQL gestionado, una base de datos por cliente más una base de control (igual que ModoOps). Usuarios, memberships, invitaciones, sesiones y vínculos del bot viven en la base de control

# | Objetivo | Cómo se mide
--- | --- | ---
O1 | Alta sin fricción | Un dueño nuevo pasa de la landing a su comercio creado en menos de 60 segundos (mediana), sin crear contraseña
O2 | Cero contraseñas guardadas | El esquema de la base de control no tiene ningún campo de contraseña ni de hash de contraseña (test automático sobre el esquema)
O3 | Sumar empleados en minutos | Mediana de tiempo entre "Invitar empleado" y el primer ingreso del empleado menor a 10 minutos; 80% de las invitaciones aceptadas en 48 h
O4 | Revocación inmediata | Después de "Revocar acceso", la siguiente request del empleado (web, PWA o bot) es rechazada; p95 menor a 5 segundos
O5 | No volver a loguearse en el mostrador | Menos de 1 login por usuario activo cada 30 días en el celular (excluyendo cierres voluntarios y revocaciones)
O6 | Cada uno ve lo suyo | 0 accesos de un Empleado a datos financieros (costos, márgenes, saldos de caja, montos adeudados, panel de consumos) en tests automáticos de permisos por endpoint
O7 | Aislamiento entre comercios | 0 lecturas o escrituras cruzadas entre comercios en los tests de aislamiento en CI (web, API y bot)
O8 | Trazabilidad | 100% de los movimientos y acciones registran un user_id real (o "Sistema" para jobs), nunca un usuario compartido

Prioridad | Significado
--- | ---
P0 - MVP | Imprescindible para el lanzamiento (Fase 1 del PRD principal)
P1 - Post-MVP cercano | Dentro de los 2 a 3 meses posteriores al lanzamiento
P2 - Futuro | Fase 3 en adelante, según demanda

# | Funcionalidad | MVP (P0) | Más adelante (P1/P2)
--- | --- | --- | ---
AU1 | Iniciar sesión con Google | OIDC Authorization Code + PKCE en el servidor, scopes openid email profile, botón con la marca de Google | Google One Tap (P1), Cross-Account Protection / RISC de Google (P2)
AU2 | Datos de identidad mínimos | Solo sub, email y nombre (foto opcional); sin contraseñas ni tokens de Google | Exportación y borrado de la cuenta de usuario desde "Mi cuenta" (P1)
AU3 | Separación del login y de Gmail/Google Photos | Proyectos y clientes OAuth separados; Gmail y Photos solo por opt-in del Dueño | Panel unificado "Conexiones de Google" (P1)
AU4 | Roles y matriz de permisos | Dueño y Empleado en todos los módulos, aplicados en el backend; interruptores operativos | Co-dueño (P1), permisos finos y roles personalizados (P2)
AU5 | Alta del comercio y aprovisionamiento | Alta con la cuenta de Google del dueño, base propia del comercio, registro en la base de control | Plantillas de rubro (P1)
AU6 | Invitación de empleados y vínculo de la cuenta de Google | Invitación por email, de un solo uso y con vencimiento; vínculo del sub en el primer ingreso; guía y enlace para crear una cuenta de Google si el invitado no tiene | Invitación por link de WhatsApp (P1)
AU7 | Revocación de acceso | Revoca membership, sesiones y número del bot en una transacción | Suspensión temporal (P1)
AU8 | Sesiones persistentes (PWA) | Sesión del lado del servidor, cookie HttpOnly/Secure, vencimiento renovable por uso | PIN de dispositivo compartido (P1)
AU9 | Dispositivos y cierre de sesión remoto | Lista de sesiones por usuario y del comercio, cierre remoto | Alertas de inicio de sesión nuevo por WhatsApp (P1)
AU10 | Reautenticación para acciones sensibles | Re-login con Google con ventana corta para acciones del Dueño | Segundo canal por WhatsApp para las acciones más críticas (P1)
AU11 | Identidad en el bot de WhatsApp | Vinculación del número con código de un solo uso desde la web logueada; mismos roles | Varios comercios por número (P1)
AU12 | Auditoría de accesos | Registro append-only de logins, invitaciones, revocaciones, sesiones y vínculos | Panel de actividad sospechosa (P2)
AU13 | Dispositivos compartidos y cuenta de Google obligatoria (sin alternativas a Google) | Cerrar sesión y "Cambiar de usuario" en la PC del local; sin método de ingreso alternativo | PIN corto por usuario (F8.3, P1; solo para quien ya entró con Google en ese dispositivo). Enlace mágico por email: descartado (cuenta de Google obligatoria)
AU14 | Varios comercios y co-dueños | — | Un usuario en varios comercios, selector de comercio, co-dueño (P1)

Módulo | Acción | Dueño | Empleado | Referencia
--- | --- | --- | --- | ---
Inventario | Buscar productos (texto, código, foto P1) y ver stock y precio de venta | ✅ | ✅ | F1, F2, 6.10
Inventario | Ver ubicaciones de los productos | ✅ | ✅ | F9.6
Inventario | Registrar ingresos de mercadería (escaneo, carga continua) | ✅ | ✅ | F2
Inventario | Registrar egresos (rotura, vencimiento, consumo) | ✅ | ✅ | F2, F3
Inventario | Crear producto nuevo al escanear | ✅ | ⚙️ (si no, queda "pendiente de revisión") | F2.9
Inventario | Editar producto (nombre, códigos, foto, umbral) | ✅ | ⚙️ | F1
Inventario | Cambiar la ubicación de un producto y administrar ubicaciones | ✅ | ⚙️ | F9.1, F9.6
Inventario | Ajuste manual de stock y movimiento compensatorio | ✅ | ⚙️ | F3.8
Inventario | Conteo por sector: iniciar, contar, recontar, pausar y dejar "listo para revisar" | ✅ | ✅ | F13.1 a F13.7
Inventario | Conteo por sector: confirmar los ajustes (genera los movimientos "ajuste por conteo") | ✅ | ⚙️ | F13.5, F13.6
Inventario | Conteo por sector: ver el valor a costo de las diferencias | ✅ | ❌ 🔒 | F13.4, F7.6
Inventario | Lotes: cargar el lote y su fecha de vencimiento al recibir mercadería, y ver los lotes y la vista "Por vencer" | ✅ | ✅ | F12.2, F12.6, RT13.2, RT13.7
Inventario | Lotes: corregir la fecha de vencimiento de un lote o reasignar fuera de FEFO | ✅ | ⚙️ | F12.10, RT13.4, RT13.8
Inventario | Lotes: dar de baja un lote vencido (merma "vencido") | ✅ | ⚙️ | F12.8, RT13.8
Inventario | Lotes: activar o desactivar "controla vencimiento" en un producto | ✅ | ⚙️ | F12.1, F12.10
Inventario | Lotes: ver el costo en riesgo | ✅ | ❌ 🔒 | RT13.7
Inventario | Ver trazabilidad por producto (cantidades, usuario, fecha) | ✅ | Propio y del día | F3
Inventario | Ver costos, márgenes, valorización del stock | ✅ | ❌ 🔒 | F7.6
Inventario | Editar costos y precios de venta, aumento masivo | ✅ | ❌ 🔒 | F7
Inventario | Exportar historial de movimientos / auditoría (CSV, PDF) | ✅ (con reautenticación) | ❌ 🔒 | F3.12
Ventas | Vender por escaneo (lector o cámara) y por búsqueda manual | ✅ | ✅ | F2.10 a F2.13
Ventas | Ver el importe de la venta que está registrando | ✅ | ✅ | F2
Ventas | Ver la ganancia de la venta y totales de ventas del día/turno | ✅ | ❌ 🔒 | F2, F7
Ventas | Corregir una venta (compensatorio) | ✅ | ⚙️ | F3.8
Ventas | Promos y combos: se aplican solas en la venta (motor de promociones) y se ven en el ticket y en la lista de promociones vigentes (sin costos ni márgenes) | ✅ | ✅ (automático, no requiere permiso) | RT12.4, RT12.5, RT12.12
Ventas | Promos y combos: quitar una promoción de una venta | ✅ | ⚙️ | RT12.12
Ventas | Promos y combos: crear, editar, pausar y cancelar promociones y combos | ✅ | ❌ 🔒 (son precios) | RT12.1, RT12.10, RT12.12
Pedidos de reposición | Ver alertas de stock bajo | ✅ | ✅ | F4
Pedidos | Armar o editar un borrador de pedido (cantidades, unidad/caja/monto) | ✅ | ✅ (sin costo estimado) | F5, B7
Pedidos | Confirmar y enviar el pedido al proveedor (WhatsApp, email) | ✅ | ⚙️ | F5, B8
Pedidos | Marcar un pedido como pagado | ✅ | ⚙️ | F5.14, C8
Pedidos | Ver total estimado en costo del pedido | ✅ | ❌ 🔒 | F5
Proveedores | Ver nombre y contacto del proveedor | ✅ | ✅ | F6
Proveedores | Crear, editar o archivar proveedores y sus condiciones de pago | ✅ | ❌ 🔒 | F6
Caja | Abrir el día si el Dueño no lo hizo | ✅ | ✅ | C2
Caja | Registrar ingresos (cobros por cualquier medio de pago) | ✅ | ✅ | C3, C4
Caja | Registrar egresos | ✅ (todas las categorías) | ⚙️ (solo las categorías habilitadas, por defecto "Pago a proveedores" y "Otros egresos", según el PRD de caja) | C3, C5
Caja | Registrar devoluciones a clientes (desde la venta original) | ✅ | ✅⚙️ (sí por defecto; el Dueño lo puede deshabilitar o volver a habilitar por empleado). El operador elige el medio de reembolso y queda auditado en el movimiento de caja | C14 del PRD de caja, AU4.9
Caja | Ver los movimientos de caja del día | ✅ | Propios | C3, C11
Caja | Ver saldos por medio de pago y total, historial completo, resumen diario y de cierre | ✅ | ❌ 🔒 | C6, C11, C12
Caja | Revertir movimientos | ✅ | ❌ 🔒 | C7
Caja | Cerrar la caja (manual) | ✅ | ⚙️ (el cierre automático corre como "Sistema") | C12
Caja | Gestionar categorías, medios de pago, vencimientos y hora de corte | ✅ | ❌ 🔒 | C5, C9, C12
Caja | Mandar comprobantes QR al bot y asociarlos a la venta | ✅ | ⚙️ | C13.1
Caja | Exportar historial de caja | ✅ (con reautenticación) | ❌ 🔒 | C11
Entrega de turno | Entregar el turno (contar el efectivo, total o por denominación, y recontar) | ✅ | ✅ | C17.10
Entrega de turno | Recibir el turno (confirmar el conteo con su propio usuario) | ✅ | ✅ | C17.15
Entrega de turno | Rechazar la entrega (cargar su conteo y ponerla "en disputa") | ✅ | ✅ | C17.16
Entrega de turno | Ver diferencias | ✅ (todas, historial y reporte por empleado) | Solo las de sus propias entregas, después de guardar su conteo (conteo a ciegas) | C17.11, C17.23 a C17.25
Entrega de turno | Resolver una disputa (aceptar un conteo o pedir recuento) y decidir una diferencia fuera de tolerancia ("a cargo de" / "absorbido") | ✅ | ❌ 🔒 | C17.14, C17.17
Entrega de turno | Conteo sorpresa de efectivo | ✅ | ❌ 🔒 | C17.21
Entrega de turno | Retiro a resguardo | ✅ | ⚙️ | C17.20
Entrega de turno | Configurar las entregas (activar, tolerancia, conteo a ciegas, fondo de cambio) | ✅ | ❌ 🔒 | C17.1 a C17.6
Fiado | Vender "A cuenta (fiado)" dentro del tope del cliente | ✅ | ✅⚙️ (sí por defecto; el Dueño lo puede restringir) | C18.1, PRD de fiado (en redacción)
Fiado | Vender a cuenta superando el tope (con confirmación) | ✅ | ❌ 🔒 | PRD de fiado
Fiado | Cobrar fiado (total o parcial, por cualquiera de los 5 medios) | ✅ | ✅⚙️ (sí por defecto; el Dueño lo puede restringir) | C18.3, C18.6
Fiado | Ver el saldo del cliente que está atendiendo | ✅ | ✅ (solo ese cliente, al vender o cobrar; AU4.10) | C18.4
Fiado | Ver el listado de clientes con saldos, vencidos y el total de fiado | ✅ | ❌ 🔒 | PRD de fiado
Fiado | Cambiar el tope de un cliente | ✅ | ❌ 🔒 | PRD de fiado
Fiado | Dar de baja una deuda (incobrable) | ✅ (con reautenticación) | ❌ 🔒 | PRD de fiado
Facturas de proveedores | Mandar la foto de la factura al bot y confirmar o corregir los datos leídos | ✅ | ✅ | FP1, FP3
Facturas | Vincular la factura con un pedido y sumar stock por la mercadería recibida | ✅ | ✅ (si tiene permiso de carga, siempre lo tiene en el MVP) | FP7
Facturas | Ver montos totales, facturas impagas y cuenta corriente | ✅ | ❌ 🔒 | FP6
Facturas | Registrar pagos y cierres de cuenta corriente | ✅ | ⚙️ (con la categoría "Pago a proveedores" habilitada en la caja) | FP5, FP6
Facturas | Anular facturas | ✅ | ❌ 🔒 | FP10
Órdenes de pago | Mandar una factura que crea una orden en Borrador y ver que existe una orden pendiente (sin datos de cobro) | ✅ | ✅ | OP3, 3.2 del PRD de órdenes de pago
Órdenes de pago | Ver montos adeudados, confirmar órdenes, recibir links o datos de pago, marcar como pagadas | ✅ | ⚙️ ("empleado con permiso para pagos") | OP7 a OP9
Órdenes de pago | Cargar o cambiar datos de cobro (CBU/CVU/alias, link de pago) | ✅ (solo web, con reautenticación) | ❌ 🔒 | OP6.3
Consumos de servicios | Mandar la foto de una boleta al bot y confirmar los datos leídos | ✅ | ✅ | CS10
Consumos | Ver el panel de consumos y los montos de los servicios | ✅ | ❌ 🔒 | CS7
Consumos | Registrar pagos de servicios y preparar órdenes de pago | ✅ | ❌ 🔒 (salvo categorías habilitadas en la caja) | CS5, CS6
Consumos | Conectar o desconectar Gmail y Google Photos | ✅ (solo web, con reautenticación) | ❌ 🔒 | CS1, AU3
Bot de WhatsApp | Vincular su propio número (código de un solo uso desde la web) | ✅ | ✅ (si el Dueño lo habilitó para el bot) | B1, AU11
Bot | Consultar stock, precio de venta y ubicación | ✅ | ✅ | B3
Bot | Consultar costo y margen | ✅ | ❌ 🔒 | B3, B1
Bot | Recibir aviso matutino, alertas y resumen del viernes | ✅ | ⚙️ (alertas sí; aviso matutino y resumen solo si el Dueño lo activa) | B4, B5, B9
Bot | Ver y revocar los números vinculados del comercio | ✅ (web) | Solo el propio | B1.8
Configuración y cuenta | Invitar, cambiar permisos, revocar usuarios y cancelar invitaciones | ✅ (con reautenticación) | ❌ 🔒 | AU6, AU7
Configuración | Datos del comercio, zona horaria, preferencias del comercio | ✅ | ❌ 🔒 | F8.1
Configuración | Suscripción, plan y medio de pago de la suscripción | ✅ (con reautenticación) | ❌ 🔒 | F8.4
Configuración | Exportar todos los datos del comercio | ✅ (con reautenticación) | ❌ 🔒 | F8.5
Configuración | Ver y cerrar sesiones de todos los usuarios del comercio | ✅ | ❌ 🔒 | AU9
Configuración | "Mi cuenta": ver y cerrar mis propias sesiones, mi número de WhatsApp, mis preferencias de avisos | ✅ | ✅ | AU9, B2

PRD | Qué usa de este módulo | Puntos de integración
--- | --- | ---
PRD principal (inventario, ventas, pedidos, proveedores, costos, ubicaciones, historial) | Identidad, roles, sesiones, user_id en cada movimiento | F8 queda detallado acá (AU1 a AU14). stock_movements.user_id, user_rol y device_id se toman de la sesión validada en el servidor, nunca del cliente. Permisos de F2.9, F3.8, F3.12, F5, F5.14, F7.6 y F9.6 según la matriz AU4. La exportación del historial (F3.12) exige reautenticación. La cola offline (6.2 del PRD principal) se sincroniza con la sesión (AU8.6).
PRD de caja | Rol del usuario que abre, registra, revierte y cierra; destinatarios de resúmenes | Permisos de C2, C3, C5, C6, C7, C11 y C12 según AU4 (sin arqueo diario), y de la entrega de turno (C17) y del fiado lado caja (C18) según las filas nuevas de AU4 (AU4.10). opened_by, closed_by y cash_movements.user_id salen de la sesión. El cierre automático corre como "Sistema". Los resúmenes de cierre y saldos solo van a usuarios con permiso (AU11.9). La lectura de Gmail para comprobantes QR (C13) es la conexión separada de AU3. Registrar devoluciones (C14) está habilitado por defecto para Empleados y es restringible por empleado; el medio de reembolso lo elige el operador y queda auditado en cash_movements (AU4.9).
PRD del bot | Vinculación del número, resolución de comercio y rol | B1 se implementa con bot_links y bot_link_codes de la base de control (equivalente a whatsapp_identities del PRD del bot; ver ajuste 4 de 4.16). Rol y permisos se leen de la membership en cada mensaje. Revocación inmediata (AU7). Las acciones sensibles se derivan a la web (AU10.4).
PRD de facturas | Quién manda, confirma, vincula, paga y anula facturas | Permisos de FP1, FP3, FP5, FP6, FP7 y FP10 según AU4. La conexión de Google Photos es separada del login (AU3) y la hace solo el Dueño con reautenticación.
PRD de órdenes de pago | Quién ve montos, confirma y marca como pagadas; cambios de datos de cobro | Permiso "empleado con permiso para pagos" como interruptor ⚙️. OP6.3 (datos de cobro solo web, solo Dueño, con reautenticación) se implementa con AU10; la reautenticación es con Google (no hay magic link en el MVP).
PRD de consumos | Quién conecta Gmail y Photos, ve el panel y registra pagos | CS1 usa la app OAuth de integraciones (gmail.readonly, restringido, beta cerrada hasta la verificación y CASA), separada de la app de login (AU3). Solo Dueño, con reautenticación. Revocar a un usuario no desconecta el Gmail del comercio (AU3.6).
Control Plane | Usuarios, memberships, aprovisionamiento | Estado del aprovisionamiento (AU5), soporte para recuperar titularidad (F8.12), métricas de logins y sesiones sin datos del comercio. La impersonación de soporte no crea una membership y queda en auth_events.

Tabla | Campos principales | Restricciones e índices
--- | --- | ---
users | id (UUID), google_sub (text), email (citext), email_verificado (bool), nombre, foto_url (nullable), estado (activo / deshabilitado_plataforma), created_at, ultimo_login_at | UNIQUE (google_sub); índice (email) (no único: dos cuentas de Google distintas pueden haber usado el mismo email en momentos distintos). Sin columnas de contraseña (test de esquema).
memberships | id, user_id (FK), tenant_id (FK), rol (dueno / empleado), es_titular (bool), permisos (jsonb, lista cerrada validada con Zod: crear_productos, editar_productos, ubicaciones, compensatorios, confirmar_pedidos, marcar_pagados, pagos_ordenes, cerrar_caja, categorias_egreso [lista], comprobantes_qr, usar_bot, avisos_bot, registrar_devoluciones [por defecto true]), estado (activa / revocada), invitado_por, created_at, revocado_at, revocado_por, motivo_revocacion | UNIQUE (user_id, tenant_id); índice parcial único (tenant_id) WHERE es_titular AND estado = 'activa' (un solo titular); CHECK de que un titular sea dueno.
invitations | id, tenant_id, email (citext), rol, permisos (jsonb), token_hash (bytea), estado (pendiente / aceptada / vencida / cancelada), expira_at, invitado_por, enviada_at, reenvios, aceptada_por_user_id, aceptada_at | UNIQUE (token_hash); índice parcial único (tenant_id, email) WHERE estado = 'pendiente'; job que pasa a vencida las vencidas.
sessions | id_hash (bytea, PK), user_id, tenant_id (comercio activo), membership_id, device_id (nullable, el de la PWA), user_agent_resumen, ip_aprox (país/ciudad), created_at, last_seen_at, idle_expires_at, absolute_expires_at, reauth_at (nullable), revocada_at (nullable), motivo_revocacion (logout / remoto / revocacion_acceso / rotada / vencida / plataforma), revocada_por (nullable) | Índices (user_id, tenant_id) WHERE revocada_at IS NULL, (tenant_id) WHERE revocada_at IS NULL, (absolute_expires_at).
bot_links | id, numero_e164, wa_id (nullable hasta el primer mensaje), user_id, tenant_id, membership_id, estado (pendiente / verificado / revocado), verificado_at, revocado_at, revocado_por, opt_in_at, opt_out_at, preferencias (jsonb, si no viven en la base del comercio) | Índice parcial único (numero_e164) WHERE estado = 'verificado' (un número, un usuario); (user_id, tenant_id). Equivale a whatsapp_identities del PRD del bot; el rol no se guarda acá.
bot_link_codes | id, user_id, tenant_id, numero_e164, code_hash, expira_at (10 min), intentos, usado_at | Un código vigente por (usuario, número); se invalida al usarse, a los 5 intentos o al vencer.
auth_events (append-only) | id (bigint), tenant_id (nullable), user_id (nullable), tipo (login_ok, login_fallido, alta_comercio, invitacion_creada, invitacion_reenviada, invitacion_cancelada, invitacion_aceptada, invitacion_email_distinto, permisos_cambiados, acceso_revocado, sesion_cerrada, sesion_cerrada_remota, reauth_ok, reauth_fallida, bot_vinculado, bot_desvinculado, email_cambiado, acceso_denegado, impersonacion_soporte), actor_user_id, session_id_hash_prefijo (para correlación, no reversible), detalle (jsonb sin datos sensibles), created_at (timestamptz DEFAULT now()) | Permisos INSERT, SELECT y trigger que rechaza UPDATE/DELETE/TRUNCATE, igual que stock_movements. Índices (tenant_id, created_at), (user_id, created_at).

Riesgo | Impacto | Probabilidad | Mitigación
--- | --- | --- | ---
Empleados sin cuenta de Google (o que no quieren usar la personal) | Alto | Media | Cuenta de Google obligatoria (decisión tomada, 8.2): explicar que se puede crear una cuenta de Google gratis, incluso con un email que ya tienen (sin Gmail) [a verificar flujo vigente de Google]; guía paso a paso en la invitación y en la pantalla de ingreso (AU1.11, AU6.10, AU6.13), hecha para el celular; la invitación sigue vigente mientras crean la cuenta (AU6.11). Sin alternativas de ingreso.
Fricción de adopción por la cuenta obligatoria (dueños o empleados que abandonan al tener que crear una cuenta) | Alto | Media | Guía de 3 pasos desde el celular, recomendación de usar el email que ya tienen (evita crear y recordar un Gmail nuevo), recordatorio al Dueño de invitaciones pendientes, ayuda de soporte. Medir en la beta: invitaciones pendientes que vencen, tiempo hasta el primer ingreso (O3) y abandonos en "Probar gratis".
Cuentas compartidas para esquivar la creación de cuenta (el empleado usa la cuenta del Dueño o un "kiosco@gmail.com") | Alto | Media | Desaconsejado de forma explícita en la invitación y la ayuda (AU6.13, AU13.2); indicador "Atendiendo: …"; aviso al Dueño de sesiones nuevas (AU9.5, P1).
Edad mínima de Google (13 años en Argentina para gestionar la propia cuenta [fuente: Google, consultado el 9/10/2026; a verificar]): por ejemplo, un hijo menor que ayuda en el kiosco no puede crear su propia cuenta | Bajo | Baja | Los empleados del perfil tienen 18 años o más; la guía menciona el requisito; no se ofrece alternativa ni se aceptan cuentas compartidas. Verificar si las cuentas supervisadas (Family Link) pueden usar "Iniciar sesión con Google" en apps de terceros [a verificar] y la normativa laboral sobre menores con asesoría legal.
Dueño que pierde el acceso a su cuenta de Google | Alto | Baja | Recuperación de Google; co-dueño (P1); transferencia de titularidad por soporte con verificación de identidad (F8.12 del PRD principal). Recomendar 2 pasos y opciones de recuperación al alta.
Caída o bloqueo de Google en el login | Medio | Baja | Las sesiones existentes siguen funcionando (son propias); solo se afectan logins nuevos. Monitoreo y comunicación de estado.
Celular del dueño desbloqueado en manos de otro, con sesión larga | Alto | Media | Reautenticación para acciones sensibles, avisos por WhatsApp, cierre remoto; el bloqueo de pantalla del celular sigue siendo la primera barrera.
PWA en iOS pierde la cookie o abre el login fuera de la app | Medio | Media | Probar en Fase 0; si falla, login con ux_mode de redirección dentro de la PWA, o recomendar usar Safari/Chrome en iOS; documentar.
Cookie de sesión robada (malware, dispositivo comprometido) | Alto | Baja | HttpOnly + Secure, rotación, cierre remoto, alerta de sesión nueva (P1), RISC de Google (P2). (P2, a evaluar) atar la sesión al dispositivo con DBSC (Device Bound Session Credentials) cuando los navegadores lo soporten [a verificar estado].
Confusión del usuario entre el login y la conexión de Gmail ("¿por qué me pide Google otra vez?") | Medio | Media | Textos claros, pantalla de consentimiento propia (CS1.2), apps OAuth con nombre y logo coherentes.
Verificación de Gmail (CASA) demorada que afecta al login | Alto | Baja (con la separación) | Apps OAuth separadas (AU3.1).
Empleado revocado con datos offline en el celular | Medio | Media | Para Empleados el catálogo offline no tiene datos financieros; se borra al detectar la revocación; la cola pendiente no se acepta.
Número de WhatsApp reciclado por la compañía telefónica | Medio | Baja | Desvinculación desde la web, re-verificación periódica o ante cambio de wa_id (P1).
Cuentas compartidas entre empleados | Medio | Media | Indicador visible de quién atiende, "Cambiar de usuario", PIN por usuario (P1, solo para quien ya entró con su propia cuenta de Google), educación en el onboarding (copy de AU6.13: "Usá tu propia cuenta").
Límite de usuarios del plan Básico (2) frena la invitación de empleados | Medio | Media | Validar en entrevistas (Fase 0) y ajustar el plan; mensaje claro de upgrade.

Término | Definición
--- | ---
OIDC (OpenID Connect) | Capa de identidad sobre OAuth 2.0; Google la usa para confirmar quién es el usuario mediante un ID token firmado
ID token | JWT firmado por Google con la identidad del usuario (sub, email, nombre); se valida en el servidor y se descarta
Cuenta de Google | Cuenta personal (Gmail o creada con un email que no es de Gmail) o de Google Workspace; es obligatoria para entrar al sistema
sub | Identificador único y estable de una cuenta de Google; es lo que el sistema guarda para reconocer al usuario
PKCE | Extensión de OAuth (Proof Key for Code Exchange) que ata el código de autorización a quien inició el flujo
JWKS | Conjunto de claves públicas de Google para verificar la firma de los ID tokens
Scope | Permiso que se le pide a Google; el login pide solo openid, email y profile
Scope restringido | Permiso de Google de alto riesgo (por ejemplo, gmail.readonly) que exige verificación de la app y evaluación de seguridad (CASA)
Membership | Relación usuario + comercio con su rol (Dueño/Empleado) y permisos; vive en la base de control
Base de control | Base central del Control Plane con comercios, catálogo de bases, usuarios, memberships, invitaciones, sesiones y vínculos del bot
Sesión | Registro del lado del servidor que mantiene al usuario logueado; el navegador solo tiene una cookie HttpOnly con un ID aleatorio
Rolling / vencimiento renovable | La sesión se extiende con cada uso hasta un máximo absoluto
Reautenticación | Volver a confirmar con Google antes de una acción sensible del Dueño
Revocar acceso | Sacarle a un usuario el acceso al comercio: cierra sus sesiones y desvincula su WhatsApp
Vinculación del número | Asociación de un número de WhatsApp a un usuario del comercio con un código de un solo uso generado en la web
CSRF | Ataque que hace que el navegador de un usuario logueado envíe una acción sin que él la pida
