---
id: MOD-02-ONBOARDING-PARTE-2
tipo: spec
estado: propuesto
modulos: [auth, onboarding]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: ""
---
> Origen: `PRD - Onboarding de Nuevos Clientes para Sistema de Inventario - Parte 2.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/onboarding`, `src/modules/tenants`, `src/pages/api/onboarding/*`

---

# PRD - Onboarding de Nuevos Clientes para Sistema de Inventario - Parte 2 de 2

Documento dividido en 2 partes por tamaño. Parte 1: secciones 1 a 4 (resumen, objetivos, usuarios y funcionalidades), en el documento original: https://docs.google.com/document/d/136yVOwjMHnROHSavhJMdA4rPNWCzTcFrUfq7G71A6Qc/edit. Parte 2 (este documento): secciones 5 (Flujos de usuario) a 9 (Plan por fases) y Anexo A (glosario). La numeración de secciones y requisitos se mantiene igual que en el documento completo; las referencias cruzadas a las secciones 1 a 4 están en la Parte 1.

## 5. Flujos de usuario

### Flujo 1: alta completa del dueño (camino feliz: verificación con VINCULAR)

Mauricio toca "Probar gratis" → "Iniciar sesión con Google", elige su cuenta y acepta el consentimiento (nombre, email, foto).

Ve la pantalla de alta: escribe "Kiosco La Esquina", elige rubro Kiosco, escribe su WhatsApp "11 5555-1234", marca el opt-in y toca "Crear mi comercio".

Pasa a la pantalla de estado: "Creando tu base de datos…". En paralelo, la pantalla le muestra "Vincular por WhatsApp" (en la computadora vería un QR). Lo toca: se abre WhatsApp con VINCULAR 482913 precargado hacia el número central y lo envía (gratis: no se usa ninguna plantilla).

El backend comprueba que el mensaje llegó desde +54 9 11 5555 1234 y que el código es válido; el bot le confirma "Listo, este número quedó vinculado a Kiosco La Esquina como Dueño" y la web muestra "WhatsApp verificado ✓". Como escribió él, la ventana de 24 h queda abierta.

Vuelve al navegador; mientras se crea la base, empieza el video de bienvenida. ("Probar el bot ahora" queda como opción secundaria: no hace falta, porque ya escribió.)

A los ~25 segundos todos los pasos están listos. El bot le escribe, como mensaje libre interactivo (sin plantilla paga): "¡Hola, Mauricio! 👋 Kiosco La Esquina ya está listo… Probá preguntarme: ¿qué ubicaciones tengo?" con [Cargar un producto] [Qué puedo hacer] [Ver el video].

Escribe "qué ubicaciones tengo" y el bot le lista Mostrador, Góndola 1, Heladera 1, Exhibidor de golosinas, Estante detrás del mostrador y Depósito (primer valor).

Vuelve a la web y toca "Entrar a mi comercio": se le ofrece el tour (Flujo 4) y después ve la checklist.

### Flujo 2: alternativa con el código de respaldo (sin escribir primero, bienvenida por plantilla)

Mauricio se registra desde la computadora del local. Igual que el Flujo 1, pasos 1 y 2.

En la pantalla de estado ve el QR, pero no puede escanearlo (por ejemplo, la cámara del celular no lo lee). Toca "¿No podés escanear el QR o abrir WhatsApp? Recibí un código".

En menos de 15 segundos le llega por WhatsApp, desde el número central, la plantilla de autenticación codigo_verificacion con el código 731205 (distinto del que estaba en el QR). Lo escribe en la web: "WhatsApp verificado ✓".

Como no le escribió al bot, la ventana de 24 h no está abierta: la pantalla le propone "Probar el bot ahora". No lo toca. A los 5 minutos de "listo", como marcó el opt-in, el sistema le manda la plantilla de utilidad bienvenida_comercio_listo con los mismos botones.

Toca [Cargar un producto]: es su primer mensaje, se abre la ventana de 24 h y el bot le responde con el link al Modo carga.

Si no hubiera marcado el opt-in, no recibiría nada por WhatsApp y la web le seguiría mostrando "Probar el bot ahora".

### Flujo 3: el VINCULAR no se puede enviar o no llega

En la pantalla de estado toca "Vincular por WhatsApp", pero WhatsApp no se abre (por ejemplo, está en un navegador integrado o en un equipo sin WhatsApp) o el mensaje no llega. A los 2 minutos sin VINCULAR, la web destaca "¿No pudiste enviarlo? Recibí un código" (también puede tocar "No pude enviarlo").

Pide el código: le llega por plantilla de autenticación y lo escribe en la web (Flujo 2, pasos 3 a 6).

Si el código tampoco llega, puede pedir otro (máximo 3 por hora) o corregir el número con "¿Te equivocaste? Cambiar número" (se generan un link y un QR nuevos).

Si tampoco puede (no tiene el celular a mano), toca "Verificar después": entra a su comercio y la checklist le muestra "Verificá tu WhatsApp" arriba de todo.

### Flujo 4: tour guiado en el primer ingreso (dueño)

Al entrar, aparece "¿Te mostramos la app en 1 minuto? [Empezar] [Ahora no]". Toca Empezar.

La pantalla se oscurece y queda resaltada la checklist: "Acá ves lo que te falta para dejar tu kiosco andando. (1 de 11)". Toca Siguiente.

El tour lo lleva a Ventas y resalta el botón de escaneo: "Acá escaneás el producto…". Sigue con Cobrar, Stock (estado vacío y "Nuevo producto"), Alertas, Caja (apertura y resumen), Proveedores, WhatsApp y Ayuda.

En el paso 7 lo llaman del mostrador: toca la cruz (o Esc en la PC). El progreso queda guardado en el paso 7.

Más tarde entra a Ayuda > Ver tour, elige "Retomar" y termina los pasos 7 a 11. El tour queda completado y no se le vuelve a ofrecer solo.

### Flujo 5: tour en el celular de un empleado

Juan acepta la invitación desde el celular e inicia sesión con Google (Flujo 14 del PRD principal).

Se le ofrece el tour del rol Empleado: 6 pasos, sin caja, saldos, resumen diario, proveedores ni costos.

Cada tooltip aparece como hoja inferior; el primer paso resalta el botón de escaneo de la barra inferior: "Acá escaneás el producto para venderlo".

En el paso de stock: "Acá buscás un producto y ves dónde está" (con la ubicación, F9).

Al terminar, se le ofrece vincular su WhatsApp (opcional, ON11.3) y, más tarde, instalar la app (ON13.6).

### Flujo 6: checklist de primeros pasos

Después del tour, Mauricio ve la checklist "0 de 4 listos" y toca "Cargá tus primeros 10 productos".

Se abre el Modo carga con la cámara; escanea el primer producto (no existe), saca la foto, carga nombre, costo, precio, cantidad y ubicación "Exhibidor de golosinas" (el formulario le propone umbral 3). El contador pasa a "1 de 10".

Carga 9 más en modo continuo; el paso se tilda solo.

Toca "Configurá los umbrales": ve la lista de sus 10 productos con el umbral sugerido y confirma 6. Paso listo.

Agrega a su distribuidor de golosinas como proveedor. Paso listo.

Salta "Invitá a un empleado" ("Por ahora no"). La checklist queda "3 de 4", con el último saltado y disponible en "Ayuda > Primeros pasos".

### Flujo 7: probar con datos de ejemplo

Antes de cargar nada, en el estado vacío de Productos toca "Ver con datos de ejemplo".

Se abre el comercio de ejemplo (rubro Kiosco) con la banda "Estás viendo datos de ejemplo". Ve alertas, ventas del día y un pedido para revisar.

Prueba una venta: el stock del ejemplo baja; nada se manda por WhatsApp.

Toca "Volver a mi comercio" y sigue con su checklist. A los 14 días, el ejemplo se elimina solo.

### Flujo 8: falla del aprovisionamiento

Al crear el comercio, falla la aplicación de una migración.

El job reintenta dos veces sin éxito; hace rollback (elimina la base creada en ese intento, que no tiene datos del cliente) y deja el tenant en error_aprovisionamiento.

La pantalla de estado muestra: "Tuvimos un problema creando tu comercio. Ya estamos avisados. [Reintentar]". El Control Plane alerta al equipo con el paso y el error.

El equipo corrige la migración; Mauricio toca "Reintentar" (o el administrador reintenta desde el Control Plane) y el alta termina bien. La verificación de WhatsApp que ya había hecho se conserva y la bienvenida sale recién ahora.

### Flujo 9: todo desde el celular, sin computadora (camino de referencia)

Mauricio ve un anuncio en Instagram y toca el link: la landing se abre en el navegador integrado de Instagram. Al tocar "Probar gratis", el sistema le indica "Para entrar con Google, abrí esta página en Chrome" y le ofrece el botón; se abre Chrome.

Toca "Iniciar sesión con Google", elige su cuenta del celular y completa la primera pantalla (nombre, rubro, WhatsApp) con el teclado del teléfono.

En la pantalla de estado toca "Vincular por WhatsApp": se abre WhatsApp con VINCULAR 482913, lo envía y vuelve a Chrome; el número figura verificado y la base ya está lista.

Recibe la bienvenida del bot en WhatsApp (mensaje libre, sin plantilla, porque escribió él); vuelve a Chrome y toca "Entrar a mi comercio".

Hace el tour en el layout de celular (hojas inferiores, barra de navegación abajo).

Toca "Cargá tus primeros 10 productos": escanea con la cámara trasera un alfajor, saca la foto y lo guarda con 24 unidades en "Exhibidor de golosinas".

Entra un cliente y pide ese alfajor: Mauricio toca "Hacé tu primera venta", apunta la cámara al código, ve "Alfajor Jorgito · Exhibidor de golosinas", elige "Efectivo" y confirma. El stock pasa a 23 y el ingreso entra a la caja.

Aparece la tarjeta "Instalá [Producto] en tu celular": toca "Instalar", acepta el diálogo de Chrome y el ícono queda en su pantalla de inicio.

Al día siguiente abre la app desde el ícono y entra directo a su comercio. En ningún momento usó una computadora.

## 6. Notas técnicas

### 6.1 Principios

El onboarding no tiene "atajos" de seguridad: usa la misma autenticación, sesiones, permisos y resolución de tenant que el resto (6.4 y 6.12 del PRD principal).

Celular primero: todo el onboarding se diseña, se mide y se prueba primero en el teléfono (ON13); la PC es una adaptación.

Todo lo que se puede hacer en paralelo se hace en paralelo (verificación de WhatsApp, video y aprovisionamiento) para que el usuario no espere mirando un spinner.

El estado del onboarding vive en la base de control (por usuario y por tenant), porque existe antes que la base del cliente, y en el servidor (no en el navegador), para sobrevivir a cambios de app, pestañas cerradas y la instalación de la PWA.

### 6.2 Job de aprovisionamiento idempotente

Máquina de estados en la base de control (tenant_provisioning: tenant_id, estado, paso_actual, intentos, error, iniciado_at, terminado_at): pendiente → creando_base → migrando → sembrando → registrando → activo, más error_aprovisionamiento.

Idempotencia: clave de idempotencia por tenant (y, para el formulario, por usuario + token de envío); restricción única de un tenant aprovisionando por usuario dueño. Cada paso comprueba si ya está hecho antes de hacerlo: la base se crea solo si no figura en el catálogo y no existe en el servidor (con un nombre determinístico derivado del tenant_id); las migraciones las aplica el runner versionado de Drizzle (aplicar dos veces no hace nada); la siembra usa claves naturales y ON CONFLICT DO NOTHING; la membership se crea con restricción única (user_id, tenant_id).

Bloqueo: un solo worker por tenant a la vez (advisory lock de Postgres o lock en la cola), para que dos reintentos no corran en paralelo.

Velocidad (opción P1): crear la base desde una base plantilla ya migrada (CREATE DATABASE … TEMPLATE …) y aplicar solo las migraciones pendientes, o mantener un pequeño pool de bases pre-creadas sin asignar [a verificar contra el proveedor de Postgres elegido en el documento de costos, 3.2].

Reintentos: hasta 3 automáticos con espera exponencial; después, estado error_aprovisionamiento y alerta.

### 6.3 Rollback ante fallas parciales

Si falla un paso, se compensan los pasos ya hechos de ese intento en orden inverso: quitar la entrada del catálogo, eliminar la base (solo si la creó este job, está marcada nueva y no tiene datos del cliente) y no crear la membership. La identidad de WhatsApp verificada y los datos del formulario se conservan en la base de control para el reintento.

La membership de Dueño se crea al final, en la misma transacción de la base de control que marca el tenant activo: si no se llega a ese punto, el usuario no puede operar sobre una base incompleta.

Cada compensación queda registrada (sin datos personales) para el diagnóstico en el Control Plane.

Los tenants abandonados (formulario sin terminar o en error sin reintento por 30 días) se limpian con un job, con aviso previo por email (plazo a definir).

### 6.4 Pantalla de estado

Página de Astro SSR protegida por sesión; consulta el estado con un endpoint (GET /api/onboarding/estado) por SSE o polling cada 2 s (con reconexión al volver de otra app en el celular, evento visibilitychange); muestra pasos legibles, nunca errores técnicos.

El middleware redirige a esta pantalla cualquier ruta de la app mientras el tenant no esté activo.

### 6.5 Plantillas sembradas por rubro y WhatsApp

Las plantillas por rubro (ubicaciones, umbral sugerido; P1: categorías y productos típicos) están versionadas en el repositorio como datos (JSON/TS), con tests que verifican que cada rubro siembra lo esperado y que sembrar dos veces no duplica.

Plantillas de Meta a aprobar antes del lanzamiento: bienvenida_comercio_listo (utilidad; solo para quien no escribió primero) y codigo_verificacion (autenticación; solo para el código de respaldo de ON2.5, porque el método principal VINCULAR no usa plantilla), en es_AR, con botones [a verificar aprobación, categoría y costo]. Si Meta rechaza o recategoriza la bienvenida como marketing, el plan B es depender solo de VINCULAR y "Probar el bot ahora" (el usuario escribe primero). Si Meta no aprueba o pausa codigo_verificacion, el onboarding funciona igual con VINCULAR y "Verificar después" (la opción de código se oculta).

Procesamiento del VINCULAR: el mensaje entrante VINCULAR <código> se procesa en el webhook del bot antes de la resolución número → comercio (el número todavía no está vinculado): se normaliza el texto (mayúsculas, espacios, código de 6 dígitos), se busca el código pendiente por hash, se compara el wa_id remitente (E.164) con el número ingresado y se responde con la confirmación o con un mensaje genérico. Es idempotente por wamid y por código: un segundo VINCULAR no repite la confirmación ni la bienvenida.

El envío de la bienvenida es un job disparado por el evento "tenant activo + número verificado", con idempotencia por (tenant, número, bienvenida), que decide mensaje libre o plantilla según la última interacción del usuario (ventana de 24 h).

Los mensajes del onboarding se marcan onboarding en whatsapp_usage y quedan fuera del cupo del plan (ON5.8), con un tope por alta.

### 6.6 Video: hosting

En los dos casos: poster liviano, carga diferida (no bloquea la pantalla de estado), subtítulos es-AR, calidad baja por defecto con datos móviles y eventos de reproducción propios.

### 6.7 Tour guiado: implementación

Librería liviana de tours, por ejemplo Driver.js u Shepherd.js (opciones a evaluar, no decididas). Criterios: peso, overlay con recorte, posicionamiento en celular (hoja inferior), accesibilidad (focus trap, Esc, ARIA) y licencia: Driver.js se publica con licencia MIT; las versiones recientes de Shepherd.js podrían requerir licencia comercial para productos comerciales [a verificar licencias vigentes de ambas]. Se integra como isla de Astro (componente cliente) que se carga solo cuando hay un tour activo.

Anclas estables: cada elemento del tour lleva un atributo de datos (data-tour="venta-escanear", data-tour="stock-nuevo-producto", data-tour="caja-resumen", etc.), nunca selectores CSS de estilo o de estructura. Un test de CI recorre las pantallas (en viewport de celular y de escritorio) y falla si falta un ancla de un paso activo.

Definición de pasos como datos: lista versionada por rol y por tamaño de pantalla (celular / escritorio), con id, ancla, ruta, texto y permiso requerido. El filtro por rol usa los mismos permisos que el backend expone a la sesión (F8.8).

Progreso: tabla user_onboarding_state en la base de control (user_id, tenant_id, tour_version, tour_ultimo_paso, tour_estado: no_iniciado / en_curso / completado / saltado, checklist_oculta, pasos_saltados, video_visto, pwa_sugerencia_vista_at, pwa_sugerencia_descartes, pwa_instalada, actualizado_at). Se guarda en cada paso con una llamada liviana que no bloquea la UI.

Accesibilidad: focus trap en el tooltip, Esc para cerrar, devolución del foco al elemento que lo tenía al cerrar, role="dialog" con aria-labelledby, anuncio del paso, prefers-reduced-motion.

Celular: tooltips como bottom sheet, recálculo del recorte en resize/orientationchange y cuando aparece el teclado virtual, objetivos táctiles de 44 × 44 px como mínimo.

### 6.8 Celular primero, cámara y PWA

Escáner de cámara: el mismo componente del PRD principal (6.5): API nativa de detección de códigos de barras donde exista y una librería JavaScript de lectura como respaldo en los navegadores sin esa API (en particular Safari de iOS) [a verificar soporte vigente]; getUserMedia con facingMode: environment, control de linterna cuando el equipo lo expone y pre-explicación antes del permiso. Requiere HTTPS.

PWA: manifest con nombre, íconos (incluidos los maskable), display: standalone, start_url al inicio del comercio y service worker (ya previstos en el PRD principal). La sugerencia de instalación captura beforeinstallprompt en Android y muestra instrucciones en iOS; detecta si ya corre instalada con display-mode: standalone (y navigator.standalone en iOS).

Navegadores integrados: detección por user agent de las vistas web de WhatsApp, Instagram, Facebook y similares, con un intent o link para abrir en el navegador del sistema [a verificar técnica vigente en Android e iOS].

Presupuesto de rendimiento: JavaScript inicial chico en las pantallas de alta (islas de Astro, sin cargar el tour ni el escáner hasta que hacen falta), imágenes optimizadas, objetivo de LCP < 2,5 s en 4G en un equipo de gama media.

Pruebas: tests end-to-end en viewport de celular (por ejemplo, 360 × 800) en CI y pruebas manuales en equipos reales antes de cada versión (ON13.9).

### 6.9 Checklist y datos de ejemplo

El estado de cada paso de la checklist se calcula con consultas baratas sobre la base del comercio (conteo de productos activos, productos con umbral, proveedores, invitaciones) y se cachea en la base de control al cambiar; no se guarda un "tildado" manual.

El comercio de ejemplo se crea clonando una base de demo plantilla por rubro (mismo mecanismo que 6.2), con es_demo = true en el catálogo: excluido de métricas, de la facturación, del bot (en el MVP) y de los envíos reales (los adaptadores de WhatsApp y email quedan en modo simulado para tenants demo).

### 6.10 Seguridad y privacidad

El formulario de alta usa CSRF y validación del lado del servidor; el número de WhatsApp se guarda solo en la base de control (identidad), como en el PRD del bot.

Los códigos de verificación se guardan como hash, con límites de intentos y de envíos (anti-abuso y control de costo), y límites por usuario e IP. El código de VINCULAR viaja en el link wa.me y en el QR, por eso la prueba de posesión es la coincidencia del número remitente con el ingresado; el código de respaldo es distinto y nunca se muestra en la web.

La cámara se usa solo mientras el escáner está abierto; no se guardan imágenes del escaneo (solo las fotos de producto que el usuario decide guardar).

Los eventos de onboarding no guardan contenido de mensajes ni datos de negocio; se rigen por la Ley 25.326, como el resto.

## 7. Métricas

### 7.1 Definiciones

Primer valor (first value): el primero de estos eventos en el comercio real: consulta al bot respondida con datos del comercio, producto cargado o venta registrada.

TTFV: tiempo desde login_google_primera_vez hasta el primer valor.

Comercio activado: dentro de los 7 días desde el alta, ≥ 10 productos, ≥ 1 producto con umbral y ≥ 1 uso real (venta registrada o consulta al bot).

### 7.2 Embudo y metas

### 7.3 Seguimiento

Cohortes semanales por rubro, canal de llegada, dispositivo (celular / PC) y app instalada o navegador.

Revisión quincenal del embudo durante el piloto; los textos del tour, la checklist y los estados vacíos se ajustan según los abandonos.

## 8. Riesgos y preguntas abiertas

### 8.1 Riesgos

### 8.2 Preguntas abiertas

¿Cinco o seis temas en el video? El dueño dijo "cinco temas" pero listó seis (ventas, el bot, caja y resumen diario, stock, facturación, pedidos a proveedores). El guion incluye los seis; si hay que dejar cinco, el candidato a salir es facturación (por la pregunta 2).

Ticket de "facturación": no está definido en ningún otro PRD. ¿Se suma al PRD principal un comprobante de venta no fiscal (cantidad, descripción, precio unitario, total, nombre del comercio, fecha y hora, leyenda "Comprobante no válido como factura") para mostrar en pantalla o compartir por WhatsApp? ¿En el MVP o en P1? ¿Cuándo se evalúa la facturación electrónica de ARCA?

Método de verificación por defecto: resuelta (9/10/2026). La pregunta era si quedaba como principal el código enviado por el bot (plantilla de autenticación) o VINCULAR. Decisión del dueño: VINCULAR es el principal y el código, el respaldo (ver "Decisiones tomadas" más abajo).

¿El WhatsApp es obligatorio en el alta? Se propone obligatorio con el escape "Verificar después". ¿O directamente opcional?

Cupo de mensajes en la prueba gratis de 14 días: ¿el del plan Básico (100 mensajes) o uno propio? ¿Cuántos mensajes de onboarding se excluyen del cupo (tope propuesto: 30 en las primeras 24 h)?

Ubicaciones por rubro: validar los nombres con 3 a 5 comercios por rubro. ¿"Góndola 1" o "Góndola A" (el PRD principal usa letras en sus ejemplos)?

Datos de ejemplo: ¿base de demo por cliente (aislamiento total, más bases) o una base de demo compartida de solo lectura (más barata, pero no permite "probar a vender")?

Saldos iniciales de caja (pregunta abierta 5 del PRD de caja): este PRD propone no pedirlos en el alta. ¿De acuerdo?

Hosting del video: ¿YouTube no listado alcanza o se prefiere autohospedado desde el día uno por imagen de marca?

Librería del tour: ¿Driver.js, Shepherd.js u otra? Depende de la verificación de licencias y de una prueba en un Android de gama media.

Recordatorio de activación a las 48 h (P1): ¿vale el costo de una plantilla por alta inactiva o alcanza con un email?

PRD de autenticación: confirmar con ese documento (en redacción) el manejo de altas abandonadas, la limpieza de tenants, el consentimiento incremental posterior, el login desde navegadores integrados y la sesión en la PWA instalada en iOS.

Celular solo: ¿hay alguna función de los otros PRD que hoy dependa de la PC (por ejemplo, exportaciones a PDF, asignación masiva de ubicaciones, lector USB como camino principal)? Revisarlas contra el principio "todo desde el celular".

Primera venta guiada: ¿se ofrece una "venta de práctica" que no toque el stock real, o alcanza con el Modo ejemplo y la anulación de ventas?

### Decisiones tomadas:

(9/10/2026, decisión del dueño; resuelve la pregunta 3) Verificación del número de WhatsApp: el método principal es el iniciado por el usuario: la web muestra un botón (en el celular, un link wa.me) o un QR (en la computadora) que abre WhatsApp con el mensaje precargado VINCULAR <código> hacia el número central; el comerciante lo envía y el backend verifica que el número remitente coincide con el ingresado y que el código es válido y no venció. Es gratis (sin plantilla paga) y abre la ventana de 24 h, así que la bienvenida sale como mensaje interactivo libre. El respaldo es el código de 6 dígitos que el bot envía con una plantilla de autenticación y el comerciante escribe en la web (por ejemplo, si se registra desde una computadora donde no puede escanear el QR, o si el envío falla); es pago y requiere la aprobación de Meta. Ver ON2, ON5, Flujos 1 a 3, 6.5 y B1.2 del PRD del bot.

## 9. Plan por fases

### Fase 0: diseño y validación (1 a 2 semanas)

Prototipo navegable en celular del alta, la pantalla de estado (con el botón "Vincular por WhatsApp" y, en la variante de escritorio, el QR), la checklist, el tour, la primera venta con la cámara y la sugerencia de PWA (y la variante de escritorio); prueba con 5 comerciantes usando solo su teléfono.

Envío a aprobación de Meta de las plantillas bienvenida_comercio_listo (utilidad) y codigo_verificacion (autenticación, solo para el código de respaldo de ON2; el lanzamiento no depende de su aprobación, porque el método principal es VINCULAR).

Validación de las ubicaciones por rubro y del guion del video; decisión sobre el ticket no fiscal (pregunta 2) y sobre cinco o seis temas (pregunta 1).

Prueba técnica de Driver.js / Shepherd.js (peso, celular, accesibilidad, licencia) y del escáner de cámara en equipos de gama baja y en iPhone.

### Fase 1: MVP del onboarding (3 a 4 semanas, junto con el lanzamiento del MVP del inventario)

ON1 pantalla de alta, ON2 verificación con VINCULAR (botón wa.me en el celular, QR en la computadora) como método principal y código por plantilla de autenticación como respaldo, ON3 job idempotente con rollback y pantalla de estado, ON4 ubicaciones por rubro, ON5 bienvenida (normalmente mensaje libre, porque el usuario escribió con VINCULAR; plantilla solo si verificó con el código de respaldo y no escribió), ON8 checklist, ON9 estados vacíos, ON11 empleado invitado, ON12 eventos y panel básico.

ON13 celular primero: alta completa desde el teléfono, detección de navegadores integrados, primera venta guiada con la cámara y sugerencia de instalar la PWA.

ON7 tour guiado (dueño y empleado, layout de celular primero y variante de escritorio) con progreso por usuario y "Ayuda > Ver tour".

ON6 video grabado en el celular con lo que existe en el MVP (las escenas de módulos que no lleguen, rotuladas "Próximamente" o reemplazadas), en YouTube no listado.

ON10 datos de ejemplo en la web (base de demo separada).

### Fase 2: optimización (meses 2 y 3)

Base plantilla para altas más rápidas; recordatorio de activación a las 48 h (con opt-in); pasos opcionales de la checklist por módulo (caja, facturas, Google Photos); tours cortos por módulo; categorías y productos sugeridos por rubro; bot en modo ejemplo.

Ajuste de textos y pasos según el embudo del piloto, separado por celular y PC.

### Fase 3: escala (meses 4 a 12)

Videos cortos por módulo y versión vertical para WhatsApp; video autohospedado si se decide; tour de novedades por versión de UI; experimentos A/B del onboarding; importación Excel/CSV en el alta (cuando llegue la P1 del PRD principal); onboarding para multi-comercio.

## Anexo A: glosario

Alta / onboarding: proceso desde el primer login con Google hasta que el comercio queda activado.

Aprovisionamiento: creación de la base de datos propia del cliente, migraciones, plantillas y registro en el catálogo de la base de control.

Base de control: base central del Control Plane con usuarios, memberships, catálogo de bases, identidades de WhatsApp, planes y uso.

Número central: el único número de WhatsApp Business de la plataforma (WABA del proveedor), compartido por todos los comercios.

Ventana de 24 h: período después del último mensaje del usuario en el que se pueden mandar mensajes libres; fuera de ella, solo plantillas aprobadas.

Plantilla de utilidad / autenticación: mensajes aprobados por Meta para avisos sobre la cuenta del usuario / para códigos de verificación (acá, la de autenticación se usa solo para el código de respaldo de ON2).

VINCULAR: mensaje precargado VINCULAR <código> que el usuario envía al número central desde un botón wa.me o un QR para verificar su número; método principal de ON2, gratis y abre la ventana de 24 h.

TTFV: time-to-first-value, tiempo hasta el primer evento de valor.

Comercio activado: ver 7.1.

PWA: progressive web app; la web del sistema instalada como app en la pantalla de inicio del celular.

Navegador integrado: el navegador interno que abren apps como WhatsApp o Instagram al tocar un link.

Tour guiado: recorrido interactivo con overlay y tooltips por la interfaz.

Modo ejemplo: comercio ficticio separado para probar la app sin tocar los datos reales.

Comprobante no fiscal: ticket de venta que no es factura electrónica de ARCA.

Opción | Ventajas | Desventajas
--- | --- | ---
YouTube no listado (recomendada para el MVP) | Gratis, CDN global, calidad adaptativa (útil con datos móviles), subtítulos | Marca de YouTube, posibles sugerencias al final, cookies: usar el reproductor de privacidad mejorada (youtube-nocookie.com) y limitar los videos relacionados [a verificar comportamiento vigente]
Autohospedado (MP4/HLS en almacenamiento de objetos + CDN) | Control total, sin marca ni recomendaciones, se puede cachear en la PWA | Costo de almacenamiento y tráfico (bajo para un video de ~2 min, a estimar) y trabajo de codificación

Métrica | Meta inicial (a validar)
--- | ---
Login con Google → formulario de alta completo | ≥ 85% (y sin diferencia de más de 5 puntos entre celular y PC)
Formulario → WhatsApp verificado en el alta | ≥ 80%
Base lista (p50 / p95) | ≤ 30 s / ≤ 90 s
Altas con error de aprovisionamiento que no se resuelven solas | ≤ 0,5%
Bienvenida entregada → respondida en 24 h | ≥ 60%
% de verificaciones con VINCULAR (sin plantilla) sobre el total de verificaciones | ≥ 80% (el resto, código de respaldo)
% de bienvenidas como mensaje libre (el usuario escribió primero) | ≥ 80%, consistente con VINCULAR como método principal (menos plantillas y menos uso del límite de mensajería)
TTFV (mediana / p75) | ≤ 5 min / ≤ 15 min
% de altas hechas 100% desde el celular | Seguimiento (se espera la mayoría)
Primera venta con la cámara dentro de las 24 h | ≥ 40% de las altas
Tasa de lectura de la cámara en el primer intento (primera venta) | ≥ 90%
Sugerencia de PWA mostrada → instalada | ≥ 30% (Android) / seguimiento (iOS)
Tour iniciado / completado | ≥ 70% / ≥ 50% de los iniciados
Paso del tour con más abandonos | Seguimiento (para reescribir ese paso)
Video iniciado / visto hasta el final | ≥ 50% / ≥ 40% de los iniciados
Checklist completa (4/4) a 14 días | ≥ 35%
Activación a 7 días | ≥ 50%
Prueba gratis → pago (activados / total) | ≥ 25% / ≥ 15%
Costo de WhatsApp del onboarding por alta | ≤ USD 0,10
Tickets de soporte por alta en los primeros 7 días | ≤ 0,2

Riesgo | Impacto | Probabilidad | Mitigación
--- | --- | --- | ---
Meta rechaza o recategoriza como marketing la plantilla de bienvenida | Medio | Media | Texto transaccional ("tu comercio ya está listo"); con VINCULAR como método principal el usuario escribe primero en la mayoría de las altas y la bienvenida va sin plantilla; plan B sin plantilla
El usuario no puede enviar el VINCULAR (navegador integrado que no abre WhatsApp, alta desde una computadora sin poder escanear el QR, WhatsApp en otro celular) | Medio | Media | Botón wa.me en el celular, QR en la computadora, código de respaldo por plantilla, "Verificar después", medir abandonos por variante (ON12)
Alguien envía el VINCULAR de otra persona (el código es visible en la web y en el QR) | Alto | Baja | La verificación exige que el número remitente coincida con el ingresado; código de un solo uso, de 10 minutos y atado a ese número; respuestas que no revelan el comercio
La plantilla de autenticación del respaldo no llega o Meta no la aprueba (problemas de entrega, número mal escrito, rechazo) | Medio | Media | Es solo el respaldo: el método principal VINCULAR no depende de plantillas; "Verificar después", normalización E.164, métricas de entrega
Límite de mensajería del portfolio (250 usuarios únicos por día sin verificar el negocio) con picos de altas | Medio | Media | Verificar el negocio en Meta antes de ~100 clientes (documento de costos), preferir mensajes dentro de la ventana
Abuso: altas falsas para mandar códigos de respaldo a números ajenos (costo y reputación del número) | Medio | Baja | Con VINCULAR no se le manda nada a un número que no escribió; para el respaldo, límites por número, usuario e IP, códigos solo después del login con Google y monitoreo
El aprovisionamiento tarda o falla en picos (muchas altas a la vez) | Alto | Baja | Cola con concurrencia controlada, base plantilla (P1), reintentos, rollback y alerta
Login con Google bloqueado en navegadores integrados (links desde WhatsApp o Instagram) | Alto | Alta | Detección y botón "Abrir en Chrome/Safari" (ON13.2), medir el abandono en ese paso
La cámara de celulares de gama baja no lee bien los códigos (poca luz, sin autofoco) | Alto | Media | Linterna, recuadro de enfoque, respaldo por código escrito y búsqueda manual, pruebas en equipos reales
En iOS la PWA instalada no comparte la sesión ni ofrece instalación automática | Medio | Media | Instrucciones de "Agregar a inicio", estado del onboarding en el servidor, un login con Google más
El video promete funciones que no están en el MVP (ticket, lectura de facturas, avisos del bot) | Medio | Media | Grabar después de cerrar el alcance del MVP; rotular "Próximamente"; regrabar escenas sueltas
El tour se rompe con cambios de UI | Medio | Media | Anclas data-tour, test de CI de anclas en celular y escritorio, salto de pasos sin ancla con evento de error
Demasiadas cosas a la vez (video + tour + checklist + bot + instalar la app) abruman al usuario | Medio | Media | Orden fijo (estado → bot → tour opcional → checklist → primera venta → sugerencia de PWA), todo salteable, medir abandonos
Datos de ejemplo confundidos con datos reales | Alto | Baja | Base separada, banda fija, envíos simulados, eliminación automática
Costo de los mensajes si muchos usuarios "juegan" con el bot en las primeras 24 h | Bajo | Media | Tope de mensajes de onboarding por alta (por ejemplo, 30); después cuentan del cupo del plan
