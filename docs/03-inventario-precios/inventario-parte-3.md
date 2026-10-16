---
id: MOD-03-INVENTARIO-PARTE-3
tipo: spec
estado: propuesto
modulos: [inventario, precios]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: ""
---
> Origen: `PRD - Sistema de Inventario para Kioscos y Comercios - Parte 3.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/inventario`, `src/pages/api/stock/*`

---

# PRD - Sistema de Inventario para Kioscos y Comercios (Parte 3)

Documento dividido en 3 partes por tamaño (Parte 3 de 3). Parte 1: secciones 1 a 4 (F1 a F7). Parte 2: sección 4 (F8 a F14) y sección 5 (flujos de usuario). Parte 3: secciones 6 a 10 y Anexo A (glosario). La numeración es continua entre las partes.

## 6. Notas técnicas

### 6.1 Principios

Velocidad de desarrollo y despliegue por encima de todo: stack TypeScript de punta a punta, un solo repositorio, servicios gestionados, sin infraestructura propia que mantener en el MVP.

Mobile-first y PWA: instalable en el celular, rápida en redes 4G malas, con tolerancia a cortes de conexión.

100% operable desde el celular (F11): ninguna función requiere una PC; la PC y el lector láser/USB son opcionales y aceleran el mostrador cuando existen. Cada pantalla se diseña y se prueba primero en el celular.

Producto separado de ModoOps: se reutilizan aprendizajes, componentes visuales y patrones (Control Plane, suspensión por mora, Tema papel), pero no el backend Odoo ni la infraestructura de los tenants de ModoOps.

### 6.2 Frontend

Astro + TypeScript, igual que el shell de ModoOps, con islas interactivas (React, Preact o Svelte) para las pantallas dinámicas: escáner, pedido.

Salida SSR (adaptador Node o Cloudflare) para las rutas de la app; páginas de marketing estáticas en el mismo proyecto.

Diseño basado en el Tema papel de ModoOps adaptado a la marca nueva (tokens CSS propios, alto contraste, botones grandes para uso en mostrador).

Diseño mobile-first responsive: CSS pensado primero para 360 px de ancho y ampliado con breakpoints para tablet y PC (no al revés); layouts de una columna en el celular, navegación inferior con las acciones principales (Vender, Cargar, Buscar, Caja, Más), áreas táctiles de 44 px o más, tablas que en el celular se muestran como tarjetas, formularios largos divididos en pasos, teclados adecuados por campo (inputmode), hojas inferiores (bottom sheets) en lugar de modales grandes, sin dependencia de hover ni atajos de teclado (los atajos son una mejora en PC). Pruebas end-to-end (Playwright) de todos los flujos P0 en viewport de celular (Android gama media e iPhone) además de escritorio.

Lector Bluetooth en el celular: el lector emparejado actúa como teclado HID; la app lo detecta con la misma lógica de velocidad entre teclas que en PC (6.5) y evita que se abra el teclado en pantalla en el campo de escaneo (inputmode="none" con foco controlado).

PWA: manifest, service worker, caché de catálogo y cola de movimientos offline (IndexedDB) que se sincroniza al volver la conexión (MVP / primera versión: venta offline, descuento de stock offline y caja offline con registro de cobros, sobre una base local y una cola de sincronización (outbox) durable e idempotente, con stock como suma de movimientos para no pisar ventas de otros dispositivos; P1: edición offline de productos, devoluciones y recepción de pedidos offline, PIN local y sincronización en segundo plano). El diseño del offline en el celular, con base SQLite local en el teléfono (por ejemplo, SQLite WASM sobre OPFS en la PWA) y su sincronización y resolución de conflictos, se detalla en el "PRD - Modo Offline para Sistema de Inventario" (https://docs.google.com/document/d/1NvVipeJhXBgH5oae8D2SWzpqzBLybEaQ5Tc77G03Vw4/edit).

Compresión de imágenes en el cliente antes de subirlas.

### 6.3 Backend y base de datos (sugeridos)

### Opción recomendada para el MVP:

API: endpoints de Astro (rutas /api/*) o un servicio Hono en TypeScript, desplegado junto al frontend. Validación con Zod, ORM Drizzle (o Prisma).

Base de datos: PostgreSQL gestionado (Supabase o Neon), con una base de datos por cliente más una base de control (ver 6.4).

Autenticación: "Iniciar sesión con Google" (OAuth 2.0 / OpenID Connect) implementado en el servidor Astro (SSR), con una librería probada (por ejemplo, Arctic + Oslo, Better Auth o Auth.js) o Supabase Auth con proveedor Google; sin contraseñas propias (ver 6.12).

Archivos (fotos): almacenamiento de objetos compatible con S3 (Supabase Storage o Cloudflare R2) con URLs firmadas y miniaturas.

Hosting: Vercel, Netlify o Cloudflare Pages/Workers para la app; alternativamente un VPS (Hetzner/DigitalOcean) con Docker y Coolify, en línea con la experiencia de ModoOps.

Jobs: cola liviana (pg-boss / Inngest / cron del hosting) para emails, resúmenes de alertas y cobros.

### Modelo de datos (núcleo):

tenants y users / memberships viven en la base de control; el resto de las entidades vive en la base de datos de cada comercio, por lo que no necesitan tenant_id.

El stock actual se guarda desnormalizado en products y se actualiza en la misma transacción que inserta el movimiento (con bloqueo de fila), para garantizar que la suma de movimientos sea igual al stock. stock_movements es append-only y es la fuente de verdad; products.stock_actual es una caché verificable (ver 6.11).

Devoluciones (F10): "Confirmar devolución" inserta en una transacción de la base del comercio: sale_returns y sus líneas, el movimiento devolucion (+) por línea (y egreso_merma_devolucion (−) si no es apta) mediante la función única de movimientos (6.11) y el egreso en cash_movements (categoría "Devoluciones a clientes", medio de pago elegido por el operador, ref_id = venta y devolución; el medio elegido, el usuario, el origen y el dispositivo quedan en el audit_log append-only del movimiento de caja) según el PRD de Caja Digital, con idempotency_key. Restricción (verificada con bloqueo de la línea vendida) de que SUM(cantidad_devuelta) por línea vendida no supere la cantidad vendida. Los totales de ventas y ganancia netos se calculan restando sale_returns; ventas y devoluciones son append-only como stock_movements. Índices (sale_id) en sale_returns y stock_movements, y (número de ticket) único en sales para la búsqueda.

Ubicaciones (F9): products.location_id referencia locations.id (ON DELETE RESTRICT; las ubicaciones solo se archivan, nunca se borran); índice (location_id) en products para el filtro y la lista por ubicación (P1); índice único parcial (lower(unaccent(nombre))) WHERE NOT archivada en locations. Todo cambio de location_id o location_note se registra en el audit_log append-only (entidad producto, campo ubicación, valor anterior y nuevo, usuario, timestamptz del servidor, origen, dispositivo) en la misma transacción, idealmente con un trigger AFTER UPDATE OF location_id, location_note; la vista "Ver trazabilidad" une stock_movements y estos registros por producto. Las búsquedas (6.10) devuelven el nombre de la ubicación y la nota junto a cada resultado, y el catálogo cacheado offline incluye las ubicaciones.

Conteo por sector (F13): stock_teorico_inicio se calcula como SUM(cantidad) WHERE product_id = ? AND created_at <= started_at (o la hora de la línea en modo por línea), y movimientos_durante como la suma entre esa hora y la confirmación; diferencia = contado − (teórico + movimientos durante). "Confirmar ajustes" vuelve a calcular todo en el servidor dentro de una transacción con bloqueo de las filas de producto, inserta un stock_movements de tipo ajuste_conteo por línea con diferencia (con count_id como referencia, motivo y los dos usuarios) mediante la función única de movimientos (6.11) y pasa el conteo a confirmado, con idempotency_key para no duplicar ajustes. stock_counts y stock_count_lines se editan solo mientras el conteo está en curso; una vez confirmado o cancelado, un trigger los vuelve de solo lectura. Las líneas offline viajan por la misma cola de sincronización (6.2). La confirmación verifica el permiso del rol en el backend. Índices (location_id, confirmed_at) y (estado) en stock_counts, y (count_id, product_id) en las líneas.

Lotes y vencimientos (F12): la función única de movimientos (6.11) recibe el lote o, en ventas y egresos sin lote explícito, aplica FEFO: bloquea (SELECT ... FOR UPDATE) los lotes activos no vencidos del producto ordenados por fecha_vencimiento, received_at, id y genera un movimiento por lote hasta cubrir la cantidad, actualizando stock_lots.cantidad y products.stock_actual en la misma transacción; la verificación nocturna (6.11) compara también cada lote con la suma de sus movimientos y la suma de lotes con el stock del producto. Restricción CHECK (fecha_vencimiento IS NOT NULL) cuando el producto controla vencimiento (validada en la función). Índices (product_id, fecha_vencimiento) WHERE estado = 'activo' para FEFO y (fecha_vencimiento) WHERE estado = 'activo' AND cantidad > 0 para el job diario que genera las alertas a los días configurados (por defecto 15/7/3) y pasa los lotes a vencido. Las ventas offline aplican FEFO sobre la copia local de stock_lots (SQLite) y el servidor reasigna el lote al sincronizar si cambió. Un endpoint/consulta de lotes próximos a vencer (con rotación, costo y precio) alimenta al bot según el PRD de Rotación.

Índices de búsqueda: pg_trgm + unaccent para búsqueda por nombre sin tildes; índice único (código) en product_codes dentro de la base de cada comercio.

Ventas: una venta (F2.10) es un stock_movements de tipo egreso por venta con importe y ganancia congelados, insertado en la misma transacción que actualiza el stock; el total de ventas del día/turno se calcula sumando esos movimientos. Si Caja Digital está activo, el ingreso en la caja se registra en la misma transacción según ese PRD.

Estado de pago de pedidos: payment_status es independiente de estado (logístico). "Marcar como pagado" actualiza payment_status, paid_at, paid_amount, payment_method_id y caja_movement_id del pedido e inserta el egreso en cash_movements (categoría "Pago a proveedores", origen pedido_reposicion, ref_id = pedido, proveedor_id) en la misma transacción de la base del comercio, con idempotency_key derivada del pedido para evitar dobles pagos (reintentos del bot o de la cola offline). Índice único parcial sobre caja_movement_id y restricción que impide payment_status = pagado sin caja_movement_id cuando el módulo de caja está activo. La reversión del egreso en la caja vuelve el pedido a pendiente y limpia los campos de pago en la misma transacción. Los nombres de campo se unifican con los del PRD de Caja Digital (estado_pago, pago_movimiento_id) al implementar.

supplier_invoice_id apunta a la entidad de facturas de proveedores definida en el PRD de facturas de proveedores (en redacción), alimentada por la foto que el dueño manda al bot de WhatsApp; es opcional y no condiciona el pago.

Job diario (cola de jobs) que marca como vencidos los pedidos con payment_due_at pasado y payment_status pendiente, para los filtros y avisos (P1: aviso por el bot de WhatsApp).

### 6.4 Multi-tenant SaaS

Decisión tomada: una base de datos por cliente (por comercio/tenant), igual que ModoOps. Motivo: fuerte aislamiento de datos entre comercios, backups y restauración por cliente, y consistencia con la arquitectura y la operación de ModoOps.

Aprovisionamiento en el alta: cuando un comercio se registra (F8.1), el backend crea automáticamente su base de datos, le aplica todas las migraciones vigentes y la registra en la base de control antes de habilitar el acceso.

Base de control (catálogo): base central del Control Plane que mapea cada cliente a su base de datos (conexión, versión de esquema, estado) y guarda cuentas de usuario, memberships, planes y suscripciones. El backend resuelve la base del comercio a partir del usuario autenticado (nunca desde el cliente), con pooling de conexiones por base. Tests automáticos de aislamiento entre comercios en CI.

Migraciones: se versionan una sola vez (Drizzle) y se aplican a la base de control y a todas las bases de clientes con un runner que registra la versión de cada base en el catálogo; despliegue escalonado (primero bases internas y de beta, luego el resto) con reintentos y alertas si alguna falla.

Control Plane interno (inspirado en modoops_admin): lista de comercios, plan, estado de suscripción, uso, suspensión/reactivación, soporte con acceso auditado ("impersonación" solo con consentimiento del comercio y registro).

Planes y límites (usuarios, productos) aplicados en el backend.

Backups por cliente: backups automáticos diarios de cada base + export lógico semanal; restauración de un comercio puntual sin afectar a los demás; RPO 24 h / RTO menor a 4 h en el MVP. Exportar o borrar los datos de un cliente equivale a exportar o eliminar su base (Ley 25.326 de Protección de Datos Personales).

Monitoreo por base (tamaño, conexiones, versión de migraciones y estado de backups) visible desde el Control Plane.

### 6.5 Escaneo de códigos de barras

### Cámara del celular:

API nativa BarcodeDetector cuando esté disponible (Chrome Android) por velocidad.

Fallback con librería JS/WASM: ZXing (@zxing/browser) o html5-qrcode; evaluar zxing-wasm para mejor rendimiento. Safari iOS no soporta BarcodeDetector, por lo que el fallback es obligatorio.

Requiere HTTPS y permiso de cámara; preferir cámara trasera, autofocus y linterna (torch) si el dispositivo lo permite.

Formatos: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, QR.

Lector USB / Bluetooth (modo teclado HID): el lector "tipea" el código y un Enter. La app escucha la entrada en un campo enfocado o a nivel global, y distingue un escaneo de un tipeo humano por la velocidad entre teclas (por ejemplo, menos de 30 ms entre caracteres). No requiere drivers.

Validación: dígito verificador de EAN/UPC; normalización (UPC-A ↔ EAN-13 con 0 adelante).

Jerarquía (F2.0): el lector láser/USB (o Bluetooth emparejado al celular) es el método principal cuando existe, y es opcional (F11); el escaneo en vivo con la cámara del celular es el respaldo, usando el mismo componente de escáner (BarcodeDetector o ZXing sobre getUserMedia) en las pantallas de venta, carga y alta de producto.

(P2) Autocompletado de nombre y foto desde bases públicas de códigos (por ejemplo, Open Food Facts) cuando el código no existe, sujeto a calidad y licencia de los datos.

### 6.6 WhatsApp

MVP: enlaces wa.me (https://wa.me/549XXXXXXXXXX?text=...). Costo cero, sin aprobación de Meta, se envía desde el WhatsApp del propio dueño (el proveedor ya lo conoce). Limitación: requiere un toque manual para enviar y no hay confirmación de entrega en el sistema.

Normalización de números argentinos: formato E.164 con +54 9 para celulares, sin el 0 ni el 15.

Fase posterior: WhatsApp Business Platform (Cloud API de Meta), directo o vía un BSP (Twilio, 360dialog, Gupshup). Permite enviar pedidos y alertas automáticamente con plantillas aprobadas, ver estado de entrega y recibir respuestas. Implica verificación del negocio en Meta, costo por conversación/mensaje y gestión de plantillas. Se evalúa como diferencial del plan Pro.

### 6.7 Email

Proveedor transaccional: Resend, Postmark o Amazon SES, con dominio propio verificado (SPF, DKIM, DMARC).

Uso: envío de pedidos a proveedores, invitaciones, avisos de suscripción, resumen diario de stock bajo (P1).

Pedidos a proveedor: remitente de la plataforma ("Kiosco La Esquina vía [Producto]") con Reply-To del comercio, para que las respuestas le lleguen directamente al dueño.

Plantillas en HTML simple + versión texto; registro de envíos y rebotes (webhooks).

### 6.8 Pagos y suscripciones

Mercado Pago Suscripciones (preapproval) como medio principal en Argentina; alternativa Stripe para clientes del exterior en el futuro.

Webhooks para actualizar el estado del tenant en la base de control (activo, en gracia, suspendido).

### 6.9 Calidad, seguridad y operación

TypeScript estricto, tests unitarios (Vitest) en la lógica de stock y pedidos; tests end-to-end (Playwright) de los flujos principales.

CI/CD con GitHub Actions: lint, tests, migraciones (base de control y todas las bases de clientes) y deploy automático a staging y producción.

Observabilidad: Sentry (errores de frontend y backend), logs estructurados, uptime monitoring.

Seguridad: HTTPS, sin contraseñas propias (login con Google, 6.12), cookies de sesión HttpOnly/Secure, rate limiting, URLs firmadas para fotos, sin PII en logs.

Rendimiento objetivo: primera carga menor a 3 s en 4G en un Android de gama media; búsqueda menor a 300 ms con 5.000 productos.

### 6.10 Búsqueda de productos, cámara y reconocimiento por foto

Índice de búsqueda manual (P0): en la base de cada comercio, índice pg_trgm (GIN) sobre el nombre normalizado con unaccent + minúsculas para búsqueda difusa (similitud de trigramas, tolerante a errores de tipeo); búsqueda por código con coincidencia exacta en product_codes y parcial con LIKE '%dígitos%' (índice trigram sobre el código). Orden: código exacto, luego similitud de nombre. Para el uso offline o de muy baja latencia, índice en el cliente sobre el catálogo cacheado (por ejemplo, MiniSearch o Fuse.js) con la misma lógica.

API de cámara: navigator.mediaDevices.getUserMedia (cámara trasera con facingMode: environment; en PC, la webcam disponible) para escaneo en vivo y para sacar fotos; captura del cuadro en <canvas> para vista previa, repetir y comprimir (canvas.toBlob, JPEG/WebP, máx. 800 px / ~200 KB). Fallback <input type="file" accept="image/*" capture="environment"> en el celular y subida de archivo en PC sin webcam o sin permiso. Requiere HTTPS y permiso de cámara; probar en Safari iOS dentro de la PWA instalada.

Fotos de producto: la foto del alta (F1.8) se sube a la ruta del comercio en el almacenamiento de objetos (6.3) y se registra en product_photos; al subirla (P1) un job genera su embedding visual para el catálogo de búsqueda por foto. Cola offline de fotos pendientes en IndexedDB.

Decodificación desde foto (P1): la misma librería del escáner (BarcodeDetector o zxing-wasm) aplicada sobre la imagen fija, con reintentos en recortes/rotaciones; opcionalmente en el servidor con más resolución.

Reconocimiento visual (P1, a validar): opciones a evaluar en Fase 0/2:

Embeddings de imagen (por ejemplo, CLIP / SigLIP u otro modelo similar) de las fotos del catálogo, guardados con pgvector en la base de cada comercio, y búsqueda por similitud (top 3 a 5).

OCR del texto del envase (marca, variante, gramaje) combinado con la búsqueda difusa por nombre.

API de visión gestionada (por ejemplo, Google Cloud Vision Product Search o un modelo multimodal) como alternativa rápida, evaluando costo por consulta y privacidad.

Precisión, latencia y costo a validar con catálogos reales; el comerciante siempre confirma el candidato.

### 6.11 Auditoría inmutable y trazabilidad de movimientos

Tabla append-only: stock_movements (en la base de cada comercio) solo admite INSERT. Doble barrera:

Permisos: el rol de base de datos que usa la aplicación tiene GRANT INSERT, SELECT sobre stock_movements y REVOKE UPDATE, DELETE, TRUNCATE; el owner de la tabla es un rol distinto, usado solo por el runner de migraciones.

Triggers: trigger BEFORE UPDATE OR DELETE (y BEFORE TRUNCATE a nivel sentencia) que lanza una excepción siempre, para que ni un error de código ni un acceso con más privilegios modifique un movimiento. El mismo esquema se aplica a audit_log.

Escritura única por función: todo cambio de stock pasa por una sola función del backend (o función SQL registrar_movimiento) que, en una transacción: bloquea la fila del producto (SELECT ... FOR UPDATE), lee el stock, inserta el movimiento con stock_anterior y stock_resultante y actualiza products.stock_actual. No hay otro camino de escritura de stock_actual (un trigger rechaza cambios de stock_actual fuera de esa función).

Sello de tiempo del servidor: created_at timestamptz NOT NULL DEFAULT now(), sin permitir que el cliente lo envíe; se muestra convertido a America/Argentina/Buenos_Aires. La hora del dispositivo de los movimientos offline va en client_occurred_at, solo informativa. idempotency_key única evita duplicados al reenviar la cola offline o reintentos del bot.

Origen y dispositivo: el backend determina origen a partir del canal (endpoint web, PWA móvil, webhook del bot, worker de jobs) combinado con el método de identificación informado por la pantalla (lector, cámara, texto, foto) y lo valida contra un enum; device_id se toma de un identificador de instalación generado por la PWA y guardado en devices.

Compensatorios: corrige_movimiento_id con FK a stock_movements.id, motivo NOT NULL en ese tipo y validación de que la suma de compensaciones no supere la cantidad original.

Reconstrucción y verificación: el stock a una fecha es SUM(cantidad) WHERE product_id = ? AND created_at <= ?. Job nocturno (y bajo demanda desde la vista) que compara products.stock_actual con la suma de movimientos de cada producto; si difieren, alerta interna a Sentry/Control Plane, sin corrección automática.

Índices: (product_id, created_at DESC, id) para la trazabilidad por producto paginada por cursor; (created_at); (user_id, created_at); (origen, created_at); (tipo, created_at); (corrige_movimiento_id) parcial; UNIQUE (idempotency_key). Si el volumen lo exige, particionado por mes de stock_movements (sin perder el append-only) o snapshots mensuales de stock por producto (también append-only) para acelerar la reconstrucción.

(P1) Cadena de hashes: hash = SHA-256(prev_hash || id || product_id || tipo || cantidad || stock_resultante || user_id || origen || device_id || created_at || corrige_movimiento_id) con serialización canónica; prev_hash es el hash del movimiento anterior del comercio (cadena única por base, calculada dentro de la transacción con bloqueo de una fila "cabeza de cadena" para garantizar orden). Verificación recorriendo la cadena (job periódico y botón "Verificar integridad"); anclaje periódico opcional del último hash en la base de control (o enviado por email al dueño) para detectar reescrituras completas de la base del comercio.

Exportación a PDF (F3.12): generación del lado del servidor (worker de la cola de jobs) con una plantilla HTML renderizada a PDF (por ejemplo, Playwright/Chromium headless o una librería como pdfmake/PDFKit), nunca en el navegador, para que los datos, totales y código de verificación salgan directo de la base. La consulta usa los mismos filtros e índices que la vista y lee los movimientos por páginas con cursor (created_at, id) en lotes (por ejemplo, 1.000 filas) escritos en streaming al PDF, para rangos grandes sin agotar memoria; todo el reporte se genera dentro de una transacción REPEATABLE READ (snapshot consistente) para que los totales coincidan con el detalle. Exportaciones chicas (por ejemplo, menos de 2.000 movimientos) se generan de forma sincrónica; las grandes se encolan, se registran en history_exports, se guardan en el almacenamiento de objetos con URL firmada y vencimiento, y se avisa al usuario al terminar. Límite configurable de páginas por reporte con sugerencia de dividir por rango de fechas.

Soporte y Control Plane: el acceso de soporte a la base de un comercio es de solo lectura sobre stock_movements; ni la impersonación (6.4) permite editar ni borrar movimientos.

Backups y restauración: restaurar la base de un comercio desde backup preserva la tabla y la cadena de hashes; tras una restauración se ejecuta la verificación de integridad y se deja constancia en el audit_log.

### 6.12 Autenticación con Google (OIDC) y sesiones

Flujo OIDC en Astro SSR (Authorization Code + PKCE): ruta /auth/google del servidor genera state, nonce y code_verifier (guardados en una cookie temporal HttpOnly firmada) y redirige a Google con scope=openid email profile; la ruta de callback /auth/google/callback valida state, intercambia el code por tokens del lado del servidor (con el client secret, que nunca llega al navegador) y valida el ID token.

Validación del ID token: firma con las claves públicas de Google (JWKS de https://www.googleapis.com/oauth2/v3/certs, cacheadas y rotadas), iss = https://accounts.google.com (o accounts.google.com), aud = client ID propio, exp/iat vigentes, nonce igual al enviado y email_verified = true. Se usa sub como identificador estable; el email solo se usa para emparejar invitaciones y mostrar. No se guardan el access token ni el refresh token de Google (no se necesitan otros servicios de Google).

Resolución de usuario y comercio: con el sub validado, el backend busca el usuario en la base de control (users, memberships, invitations): si tiene una invitación pendiente que coincide con el email verificado, la acepta y crea la membership; si no tiene usuario ni invitación, entra al alta de comercio nuevo (rol Dueño). Luego la membership indica el tenant y, desde el catálogo (6.4), se resuelve la base de datos del cliente a la que se conecta cada request; el comercio nunca se elige desde el cliente sin validar la membership. En la base de cada comercio se guarda solo una referencia al user_id (y su nombre para el historial), no credenciales.

Sesiones del lado del servidor: al validar el login se crea una sesión en sessions y se envía una cookie con un ID aleatorio (se guarda solo su hash) con HttpOnly, Secure, SameSite=Lax, Path=/; middleware de Astro valida la sesión, la membership activa y los permisos del rol en cada request (y en las APIs que usan la PWA y la cola offline). Rotación del ID de sesión en el login, expiración por inactividad y absoluta, y protección CSRF en las mutaciones (token o verificación de Origin).

Logout y revocación: "Cerrar sesión" marca revocada_at y borra la cookie; "Revocar acceso" de un empleado marca la membership como revocada y revoca todas sus sesiones en la misma transacción, con efecto inmediato. Cambios de rol, invitaciones, aceptaciones y revocaciones quedan en el audit_log append-only.

Bot de WhatsApp y jobs: no usan sesión de navegador; el bot asocia el número de WhatsApp a un usuario del comercio verificado previamente desde la app (según el PRD del bot) y los jobs actúan como "Sistema" (6.11).

Configuración en Google Cloud: proyecto con pantalla de consentimiento en modo producción (solo scopes no sensibles, por lo que no requiere verificación extendida), URIs de redirección por entorno (staging, producción) y client secret en el gestor de secretos del hosting.

## 7. Métricas de éxito

### 7.1 Producto y adopción

### 7.2 Uso (engagement)

Comercios activos semanales (WAU) / comercios pagos: más de 70%.

Movimientos de stock por comercio activo por semana: más de 50.

Porcentaje de productos con umbral de stock bajo configurado: más de 30%.

Pedidos de reposición enviados por comercio por mes: 4 o más.

Porcentaje de pedidos creados desde una alerta: más de 50%.

Porcentaje de productos con costo y precio cargados: más de 60%.

### 7.3 Experiencia y calidad

Tiempo medio de escaneo + carga de un producto existente: menos de 10 segundos.

Tiempo medio de alta de un producto nuevo desde el escaneo: menos de 30 segundos.

Tiempo medio de una venta por búsqueda manual: menos de 15 segundos; porcentaje de ventas por cada método (lector, cámara, búsqueda manual, foto) para detectar fallas del lector.

Tiempo para armar y enviar un pedido desde una alerta: menos de 2 minutos.

NPS: más de 40.

Disponibilidad: 99,5% mensual. Cero incidentes de fuga de datos entre tenants.

### 7.4 Impacto en el comercio (encuestas/entrevistas)

Reducción percibida de quiebres de stock.

## 8. Riesgos y preguntas abiertas

### 8.1 Riesgos

### 8.2 Preguntas abiertas

Ventas: ¿el MVP alcanza con el egreso manual por venta, o hace falta una "caja rápida" (venta simple con escaneo y total)? ¿Integrar con POS existentes o con Mercado Pago Point? (Avance: el MVP incluye el Modo venta mínimo con importe y ganancia y los métodos de respaldo, F2.10 a F2.13.)

Precio y planes: ¿cuánto está dispuesto a pagar un kiosco por mes? ¿Precio en ARS con ajuste mensual/trimestral o anclado al USD? ¿Plan gratuito limitado?

Nombre y marca: ¿marca propia independiente o submarca de ModoOps (ej.: "ModoOps Kiosco")? ¿Dominio?

Canal de venta: ¿autoservicio online, distribuidoras/mayoristas como canal, preventistas, cámaras de kiosqueros (UKRA)?

Multi-sucursal: ¿cuándo se necesitan varios comercios por cuenta y transferencias de stock entre ellos?

Vencimientos: ¿qué tan prioritario es controlar fechas de vencimiento (lácteos, fiambres)? (Resuelto: lotes con fecha de vencimiento y FEFO entran en el MVP por decisión del dueño del 9/10/2026, ver F12; queda por definir el formato de fecha más común en los envases para el OCR, P1.)

Productos por peso o a granel: ¿cómo se manejan (fiambrería, verdulería)? ¿Unidad kg con decimales en el MVP?

Offline: ¿alcanza con la cola offline simple o hace falta offline completo desde el MVP? (Resuelto: la venta, el descuento de stock y la caja offline entran en el MVP, alineado con el PRD de Modo Offline; edición offline, devoluciones y recepción de pedidos offline quedan para P1.)

Base de códigos: ¿conviene precargar una base de productos comunes de kiosco (nombre + foto por EAN) para acelerar el alta?

Permisos de empleados: ¿los empleados pueden ver costos? ¿crear productos? (configurable, pero ¿cuál es el valor por defecto?).

Legal: términos y condiciones, política de privacidad y registro de bases de datos ante la AAIP (Ley 25.326).

Pagos a proveedores: ¿cómo se manejan notas de crédito, devoluciones o descuentos del proveedor sobre un pedido ya pagado? ¿Un pago puede cubrir varios pedidos del mismo proveedor (cuenta corriente)?

Reconocimiento por foto: ¿qué enfoque (embeddings, OCR, API gestionada) da precisión suficiente con fotos de kiosco y a qué costo por consulta? ¿Cuántas fotos por producto hacen falta?

Empleados sin cuenta de Google: ¿hace falta una alternativa para empleados que no tienen (o no quieren usar) una cuenta de Google? Opciones: pedirles crear una cuenta de Google gratuita (por defecto en el MVP), enlace mágico por email, o un PIN de dispositivo compartido asociado a la sesión del dueño (F8.3). Definir antes de la beta.

Devoluciones sin venta original: ¿se permiten devoluciones sin ticket ni venta encontrada (por ejemplo, ventas anteriores al sistema)? ¿Plazo máximo por defecto para aceptar devoluciones? ¿Cómo se ejecuta el reintegro de un cobro QR en el proveedor de pago (manual o por API, según el PRD de Caja Digital)?

Decisiones tomadas: arquitectura de datos con una base de datos por cliente, como ModoOps (aislamiento fuerte entre comercios, backups y restauración por cliente, consistencia con ModoOps); ver 6.4. Venta offline, descuento de stock offline y caja offline (registro de cobros) en la primera versión (MVP), según el "PRD - Modo Offline para Sistema de Inventario"; ver F11.5 y 6.2. Historial de costos en el MVP (decisión del dueño del 9/10/2026, alineado con el PRD de precios, https://docs.google.com/document/d/15gnWW2l2lkCFC-3shvHe9A6WfxfF2xje6IDj20ysyso/edit, GP5.6); ver F7.9. Lotes con fecha de vencimiento, FEFO, alertas de vencimiento y baja de vencidos en el MVP (decisión del dueño del 9/10/2026); ver F12. Conteo de stock guiado por sector en el MVP (decisión del dueño del 9/10/2026), opcional y periódico, que no es un arqueo diario; ver F13.

## 9. Roadmap por fases

### Fase 0: validación y diseño (semanas 1 y 2)

10 a 15 entrevistas con dueños de kioscos y comercios (incluida la validación de precio).

Prototipo clickeable de los flujos 2 y 3 (escaneo, pedido) probado en celular real.

Definición de nombre, marca, dominio y stack definitivo.

Prueba de un día completo de operación solo con un celular (sin PC ni lector) en un comercio real.

Prueba técnica de escaneo en 5 celulares (Android gama baja/media, iPhone) y con un lector USB, incluida la cámara para fotos de producto (celular y webcam).

Prueba de concepto del reconocimiento por foto (decodificación desde foto + opciones de reconocimiento visual) con el catálogo de 2 o 3 comercios, para validar precisión y costo.

### Fase 1: MVP (semanas 3 a 8)

Registro e inicio de sesión con Google (OIDC, scopes mínimos, sin contraseñas), sesiones del lado del servidor, invitación de empleados por email con vínculo de la cuenta de Google y revocación de acceso; comercio, roles Dueño/Empleado, multi-tenant con una base de datos por cliente aprovisionada en el alta.

F1 Inventario (con foto por cámara/webcam/archivo al crear el producto), F2 Escaneo (lector USB como principal + cámara del celular como respaldo + alta en el momento), Modo venta con importe y ganancia y venta de respaldo por búsqueda manual de texto, F3 Historial inmutable y auditoría (tabla append-only con triggers y permisos que bloquean UPDATE/DELETE, fecha y hora del servidor, usuario, origen y dispositivo en cada movimiento, compensatorios, stock reconstruible con verificación nocturna, vista "Ver trazabilidad" por producto con filtros y exportación CSV/PDF generada en el servidor).

F4 Alertas en la app, F5 Pedidos (unidad/caja/monto) con estado de pago (Pendiente de pago → Pagado) y egreso automático en la caja al marcar pagado (junto con la Fase 1 del módulo Caja Digital), F6 Proveedores con envío por wa.me y email.

F7 Costo, precio, margen y aumento masivo simple, con historial de costos por producto desde la primera versión (decisión del 9/10/2026, alineado con el PRD de precios GP5.6) y markup recomendado vs. aplicado con ajuste manual que el recálculo mensual nunca pisa (F7.10).

F9 Ubicaciones de productos (ABM de ubicaciones, ubicación y nota por producto, ubicación visible al escanear, vender y buscar, cambios en el historial inmutable).

F10 Devoluciones de clientes (búsqueda de la venta, devolución total/parcial con stock que vuelve a subir o a merma, reversión proporcional de la ganancia y reintegro por el medio que elige el operador como egreso en la caja, junto con el módulo Caja Digital).

F11 Operación 100% desde el celular: todas las pantallas P0 mobile-first y probadas en celular, lector Bluetooth emparejado al celular como opción.

F12 Lotes con fecha de vencimiento (flag "controla vencimiento", fecha por lote al recibir mercadería con selector rápido en el celular, stock por lote, FEFO automático en la venta, lotes y próximo vencimiento en la ficha y la búsqueda, alertas a 15/7/3 días configurables, baja de vencidos como merma en el historial inmutable, datos para las promos del bot según el PRD de Rotación).

F13 Conteo de stock guiado por sector desde el celular (por ubicación, escaneo o búsqueda, stock teórico al inicio considerando las ventas durante el conteo, diferencias, "ajuste por conteo" inmutable confirmado por el Dueño o un empleado con permiso, conteos parciales reanudables, offline, cronograma rotativo opcional, historial y reporte de diferencias); no es un arqueo diario.

F14 Descuentos en la venta (porcentaje o monto fijo, por línea y por ticket, redondeo, aviso bajo costo, tope de % para empleados, sin acumular con promos por defecto), alineado con el PRD de Ticket y el de Precios.

Modo offline v1 (junto con la Fase 1 del PRD de Modo Offline): venta offline, descuento de stock offline y caja offline con registro de cobros, catálogo local en SQLite, cola de sincronización automática e indicador de estado; carga de mercadería y egresos offline.

PWA instalable, Control Plane básico (con base de control y catálogo de bases de clientes), cobro por Mercado Pago, landing y onboarding.

Beta cerrada con 5 a 10 comercios reales (semanas 7 y 8).

Hito: lanzamiento público al final de la semana 8.

### Fase 2: crecimiento (meses 3 a 5)

Importación masiva de productos desde Excel/CSV y de listas de precios del proveedor.

Recepción de pedidos contra lo pedido, con actualización de stock y costos.

Pagos parciales de pedidos (seña y saldo), vencimientos de pagos en cuenta corriente con aviso por WhatsApp y vínculo del pago con la factura del proveedor fotografiada por el bot (según el PRD de facturas de proveedores).

Notificaciones de stock bajo (push, email, resumen diario por WhatsApp).

Offline ampliado según la Fase 2 del PRD de Modo Offline: edición offline de productos, devoluciones y recepción de pedidos offline, PIN local para cambiar de usuario offline y sincronización en segundo plano (la venta, el stock y la caja offline ya están en el MVP).

Reportes: productos más vendidos, rotación, valorización.

Login con PIN para dispositivos compartidos; varios comercios por cuenta.

Exportación de datos y mejoras de búsqueda.

Cadena de hashes por movimiento (evidencia contra manipulación), verificación de integridad bajo demanda, código de verificación en los PDF exportados y "Verificar reporte"; filtros avanzados de trazabilidad.

Devolución con cambio por otro producto y reportes de devoluciones por producto, motivo y empleado.

OCR de la fecha de vencimiento impresa en el envase, avisos push/WhatsApp de vencimiento y reporte de merma por vencimiento (F12).

Conteo: sugerencia de sectores a contar según diferencias y rotación, y conteo a ciegas configurable (F13.11).

Filtro por ubicación (listado, historial, alertas) y "lista por ubicación" para reponer góndolas y heladeras.

Venta de respaldo por foto en la app móvil (decodificación desde foto + reconocimiento visual), si la validación de precisión de Fase 0 da resultados aceptables.

### Fase 3: diferenciación (meses 6 a 12)

WhatsApp Business API: envío automático de pedidos y alertas, recepción de respuestas.

"Caja rápida" / registro de ventas simple o integración con POS y Mercado Pago Point para descontar stock automáticamente.

Productos por peso. (Los lotes y vencimientos pasaron al MVP, F12.)

Cantidades sugeridas inteligentes según rotación histórica y días de visita del proveedor.

Base compartida de códigos de barras (nombre y foto sugeridos).

Portal del proveedor (el preventista recibe y confirma pedidos), integración con distribuidoras.

Evaluación de facturación electrónica vía partner y app nativa si la PWA se queda corta.

## 10. Temas futuros (fuera de la primera versión)

Temas detectados en la revisión cruzada de los PRD que no entran en la primera versión; se listan para no perderlos y se priorizarán según demanda.

Envases retornables (cajones y vacíos con el proveedor, depósito al cliente): muy común en bebidas, pero exige llevar un saldo de envases por proveedor y por cliente que hoy no existe en ningún PRD.

Feriados y fines de semana largos en el pedido sugerido: la venta sube antes de un fin de semana largo y el proveedor no visita; la cobertura del pedido sugerido debería considerar el calendario, pero hoy la sugerencia es simple (F5.4).

Recargas / SUBE con saldo y comisión: hoy la carga virtual es solo una línea "por monto"; manejar saldo precargado con el proveedor y la comisión ganada requiere un modelo propio.

Ventas perdidas ("me lo pidieron y no tenía"): registrar pedidos de clientes sin stock ayudaría a detectar faltantes y productos a incorporar, pero agrega un paso en el mostrador que hay que validar.

Aviso de edad en la venta de alcohol y tabaco: una confirmación de mayoría de edad al vender esos productos reduce el riesgo legal del comercio; requiere marcar categorías y definir el texto con asesoría legal.

Precio por cantidad o por bulto (mayorista dentro del kiosco): pedido frecuente, pero el PRD de gestión de precios excluye las listas múltiples en la primera versión.

Billetes falsos o rechazados en el conteo: al contar el efectivo en la entrega de turno conviene registrar billetes falsos o rechazados como pérdida separada, pero no está definido en el PRD de Caja Digital.

Delivery por apps (PedidosYa / Rappi): como canal o medio de venta implica integraciones, comisiones y conciliación propias que exceden la primera versión.

## Anexo A: glosario

Entidad | Campos principales
--- | ---
tenants (comercios), en la base de control | id, nombre, rubro, plan, estado (prueba, activo, en gracia, suspendido), zona horaria, configuración
users / memberships, en la base de control | users: id, google_sub (único), email, email_verificado, nombre, foto_url (opcional), created_at, último_login; sin campo de contraseña. memberships: user_id, tenant_id, rol (dueño, empleado), permisos, activo, revocado_at, revocado_por
invitations, en la base de control | tenant_id, email invitado, rol, token (hash, un solo uso), estado (pendiente / aceptada / vencida / cancelada), expira_at, invitado_por, aceptada_por_user_id, aceptada_at
sessions, en la base de control | id (aleatorio, se guarda su hash), user_id, tenant_id activo, created_at, last_seen_at, expira_at, revocada_at, user_agent, device_id
products | nombre, categoría, proveedor_id, costo_unitario, precio, stock_actual, controla_vencimiento (bool, F12), umbral, stock_objetivo, unidad_pedido (unidad / caja / monto), unidades_por_caja, foto_url, location_id (nullable, FK a locations), location_note (nota de estante/posición, nullable), archivado
locations | id, nombre (único entre las activas del comercio), descripción opcional, orden (para la lista por ubicación), archivada, created_at, updated_at; los cambios de nombre y archivo se registran en audit_log
stock_lots (F12) | id, product_id, cantidad (actual, caché de la suma de sus movimientos), cantidad_inicial, fecha_vencimiento (date; nullable solo en el lote "sin fecha" de transición), received_at (timestamptz del servidor), origen (carga_manual / escaner / pedido / factura / ajuste), purchase_order_id (nullable), supplier_invoice_id (nullable), costo_unitario (del ingreso), estado (activo / vencido / dado_de_baja / agotado), user_id, created_at
stock_counts (F13) | id, número, location_id (nullable; o selección/categoría), estado (en_curso / en_revision / confirmado / cancelado), modo_referencia (al_inicio / por_linea), started_at (timestamptz del servidor), started_by, device_id, submitted_at, confirmed_at, confirmed_by, cancelled_at, schedule_id (nullable, cronograma rotativo), totales (faltante, sobrante, neto en unidades y a costo), idempotency_key
stock_count_lines (F13) | count_id, product_id, lot_id (nullable, F12), cantidad_contada, stock_teorico_inicio, movimientos_durante (suma de movimientos entre el inicio, o la hora de la línea, y la confirmación), diferencia, motivo, counted_by, client_counted_at (hora del dispositivo, offline), counted_at (timestamptz del servidor), ajuste_movimiento_id (nullable, FK al stock_movements "ajuste por conteo"), recontada (bool)
count_schedules (F13, opcional) | location_id, día de la semana o frecuencia, activo
product_codes | product_id, código, tipo (unidad / caja), multiplicador
stock_movements (append-only, ver 6.11) | id (bigint secuencial), product_id, tipo (ingreso / egreso_venta / egreso_rotura / egreso_vencimiento / egreso_consumo / ajuste_manual / ajuste_conteo / ingreso_pedido / devolucion / egreso_merma_devolucion / compensatorio), lot_id (nullable, FK a stock_lots; obligatorio si el producto controla vencimiento; la baja de un lote vencido es egreso_vencimiento con su lot_id), cantidad, stock_anterior, stock_resultante, user_id, user_rol, origen (web_pc / app_movil / lector_usb / camara_celular / busqueda_texto / busqueda_foto / bot_whatsapp / job_automatico), device_id (nullable), device_info (nullable), referencia (pedido, venta, conteo), count_id (nullable, conteo de F13 en los ajuste_conteo), sale_id (nullable, venta/ticket al que pertenece el movimiento), return_id (nullable, devolución), venta_movimiento_id (nullable, en devoluciones: el movimiento "egreso por venta" original), corrige_movimiento_id (nullable, FK al movimiento original en compensatorios), motivo, nota, created_at (timestamptz, DEFAULT now() del servidor), client_occurred_at (nullable, hora del dispositivo en movimientos offline), idempotency_key; (P1) prev_hash, hash; en ventas además: precio_unitario (de lista), descuento_tipo, descuento_valor, descuento_importe (de línea y prorrateo del ticket, F14), precio_final, costo_unitario, importe, ganancia (centavos), metodo_identificacion (lector / camara / busqueda_manual / foto)
sales (ventas / tickets) | id, número de ticket, user_id, origen, device_id, payment_method_id, importe_total, ganancia_total, descuento_ticket_tipo (porcentaje / monto, nullable), descuento_ticket_valor, descuento_total, redondeo, descuento_aprobado_por (nullable), caja_movement_id (ingreso en la caja, nullable), created_at; las líneas son los stock_movements de tipo egreso_venta con sale_id
sale_returns (devoluciones) | id, sale_id, user_id, origen, device_id, motivo, importe_reintegrado (centavos), ganancia_revertida (centavos), payment_method_id (medio elegido libremente por el operador), sale_payment_method_id (medio de la venta original, solo de referencia), caja_movement_id (egreso "Devoluciones a clientes" en cash_movements), idempotency_key, created_at (timestamptz del servidor); append-only
sale_return_lines | return_id, venta_movimiento_id (línea vendida), product_id, cantidad_devuelta, apto_para_venta (bool), motivo_merma, precio_unitario y costo_unitario (copiados de la venta), devolucion_movimiento_id, merma_movimiento_id (nullable)
product_photos | product_id, foto_url, origen (alta / venta por foto), created_at; (P1) embedding visual para la búsqueda por foto
suppliers | nombre, contacto, teléfono, whatsapp, email, condiciones_pago (tipo: contado / transferencia / cuenta corriente; días de plazo; medio de pago por defecto), días_visita, pedido_mínimo
purchase_orders / lines | supplier_id, estado, canal_envío, enviado_at, user_id, payment_status (pendiente / pagado; P1: parcial), payment_due_at (calculado según condiciones_pago), paid_at, paid_amount (centavos), payment_method_id (medio de pago de la caja), caja_movement_id (egreso en cash_movements, nullable), supplier_invoice_id (factura del proveedor, opcional, nullable), paid_by_user_id; líneas con product_id, unidad_pedido, cantidad, monto, costo_estimado
purchase_order_payments (P1) | purchase_order_id, monto, payment_method_id, paid_at, caja_movement_id, supplier_invoice_id (opcional), user_id; un registro por pago parcial
product_markups | product_id (o categoría), markup_recomendado, recomendado_at, origen_recomendacion (bot / recálculo mensual), markup_aplicado, es_manual (bool), manual_por, manual_at; los cambios van al audit_log
product_cost_history (MVP) | product_id, costo_anterior, costo_nuevo (centavos), variacion_pct, origen (manual / aumento_masivo / pedido / factura), referencia_id, user_id, created_at (timestamptz del servidor); append-only
audit_log | entidad, campo, valor_anterior, valor_nuevo, user_id, fecha (también append-only; incluye exportaciones de historial con sus filtros, confirmación y cancelación de conteos, cambios de vencimiento y estado de lotes, creación y edición de promos y combos, cambios de tope de fiado y rechazos de entregas de turno, F3.13)
devices | id, nombre asignado por el comercio, tipo (PC / celular), user_agent, primer y último uso; se referencia desde stock_movements.device_id
history_exports | id, user_id, formato (CSV / PDF), filtros (JSON), cantidad de movimientos, último movimiento incluido, código de verificación (P1), estado (en cola / listo / error), archivo_url, created_at

Métrica | Meta a 3 meses del lanzamiento | Meta a 6 meses
--- | --- | ---
Comercios registrados (prueba) | 100 | 400
Activación: comercios con 50 o más productos cargados en los primeros 7 días | 40% | 50%
Conversión prueba → pago | 15% | 25%
Comercios pagos | 15 | 100
Churn mensual de comercios pagos | menos de 8% | menos de 5%
MRR | a definir según precio | a definir según precio

Riesgo | Impacto | Probabilidad | Mitigación
--- | --- | --- | ---
Lectura de códigos con cámara en celulares de gama baja o con poca luz | Medio | Media | Fallback WASM, linterna, ingreso manual, recomendación de lector USB/Bluetooth económico
Safari iOS y permisos de cámara en PWA | Medio | Media | Probar en iOS desde el día 1; fallback con librería JS
Conectividad inestable en el comercio | Alto | Media | PWA con caché y cola offline de movimientos; desde el MVP, venta, descuento de stock y caja offline con SQLite local y sincronización automática (PRD de Modo Offline)
Competencia (sistemas de POS y gestión locales, planillas, apps gratuitas) | Alto | Alta | Foco en simplicidad, escaneo y pedido por WhatsApp; precio accesible; soporte por WhatsApp
Precio en contexto inflacionario | Medio | Alta | Precio en ARS con ajuste periódico o referencia USD; plan anual con descuento
Disponibilidad de los fundadores para soporte (proyecto paralelo a ModoOps) | Medio | Media | Onboarding autoservicio, videos cortos, centro de ayuda, soporte acotado por WhatsApp
Costos y aprobación de WhatsApp Business API | Medio | Media | MVP con wa.me; API solo en plan Pro cuando el volumen lo justifique
Entregabilidad de emails (spam) | Medio | Media | Dominio verificado, SPF/DKIM/DMARC, Reply-To del comercio
Fuga de datos entre comercios por error en la resolución de la base del cliente | Muy alto | Baja | Una base por cliente, base resuelta del lado del servidor desde la base de control, tests de aislamiento en CI
Costo y overhead operativo de una base por cliente con muchos comercios chicos | Medio | Alta | Postgres gestionado con muchas bases por cluster o escalado a cero, pooling de conexiones, aprovisionamiento automatizado, seguimiento del costo por cliente frente al precio del plan
Migraciones en cientos o miles de bases (fallas parciales, versiones de esquema divergentes) | Alto | Media | Runner de migraciones idempotente, versión de cada base en el catálogo, despliegue escalonado, migraciones compatibles hacia atrás, alertas y reintentos
Monitoreo y operación de muchas bases (backups, tamaño, conexiones) | Medio | Media | Monitoreo centralizado por base desde el Control Plane, verificación automática de backups y restauraciones de prueba periódicas
Baja precisión del reconocimiento visual de productos (envases parecidos, poca luz, catálogo sin fotos) | Medio | Alta | Decodificar el código desde la foto primero, mostrar varios candidatos y exigir confirmación, fallback a búsqueda manual, fomentar fotos en el alta (F1.8); validar antes de lanzar (P1)
Desconfianza del comerciante en los números del sistema ("el sistema está mal") | Alto | Media | Historial inmutable con usuario, origen y dispositivo; stock reconstruible desde los movimientos; vista "Ver trazabilidad" con resumen que cierra; exportación a PDF; (P1) cadena de hashes con código de verificación
Crecimiento de la tabla de movimientos y reportes PDF de rangos grandes | Medio | Media | Índices compuestos, paginación por cursor, particionado mensual o snapshots si hace falta, generación de PDF en segundo plano con streaming
Expectativa de facturación electrónica (AFIP/ARCA) | Medio | Alta | Comunicar claramente que no es un sistema de facturación; evaluar integración en fase 3

Término | Definición
--- | ---
Comercio / tenant | Cliente de la plataforma: un kiosco o comercio con sus datos aislados en su propia base de datos
Base de control | Base central del Control Plane que mapea cada cliente a su base de datos y guarda cuentas, planes y suscripciones
Movimiento | Cualquier cambio de stock registrado (ingreso, egreso, ajuste, recepción de pedido, compensatorio); inmutable una vez registrado
Movimiento compensatorio | Movimiento nuevo que corrige uno anterior con la cantidad opuesta, con motivo y referencia al original; el original no se modifica
Trazabilidad | Línea de tiempo verificable de los movimientos de un producto (cuándo, quién, desde dónde) que explica cómo se llegó a su stock actual
Cadena de hashes | Encadenamiento criptográfico de los movimientos (P1) que permite detectar cualquier alteración o borrado
Devolución | Operación que registra la vuelta de un producto vendido: sube el stock (o lo manda a merma si no es apto), revierte la ganancia en proporción y registra el reintegro por el medio de pago que elige el operador, vinculada a la venta original
Merma | Pérdida de mercadería (rotura, vencimiento, producto devuelto no apto para venta) registrada como egreso de stock valorizado al costo
Ubicación | Lugar del local con nombre propio definido por el comercio (ej.: "Heladera A", "Góndola B") donde está un producto; puede llevar una nota de estante/posición
Iniciar sesión con Google | Ingreso al sistema con la cuenta de Google del usuario (OAuth 2.0 / OpenID Connect); el sistema no guarda contraseñas
OIDC (OpenID Connect) | Protocolo de identidad sobre OAuth 2.0 que usa Google para confirmar quién es el usuario mediante un ID token firmado
sub (ID de cuenta de Google) | Identificador único y estable de una cuenta de Google; es lo que el sistema guarda para reconocer al usuario
Invitación | Enlace de un solo uso que el dueño envía por email para que un empleado se una al comercio; se vincula a su cuenta de Google en el primer ingreso
Sesión | Estado de "usuario conectado" guardado en el servidor e identificado por una cookie HttpOnly y Secure; se cierra con "Cerrar sesión" o al revocar el acceso
Lote | Parte del stock de un producto que entró junta y comparte la misma fecha de vencimiento; guarda cantidad, vencimiento, fecha de recepción y origen
FEFO | "First expired, first out": regla por la que la venta descuenta primero el lote que vence antes
Conteo por sector | Conteo opcional y periódico del stock de una ubicación desde el celular, que compara lo contado con el stock teórico y genera ajustes por conteo al confirmarse; no es un arqueo diario obligatorio
Ajuste por conteo | Movimiento inmutable que corrige el stock de un producto según la diferencia confirmada en un conteo por sector
Descuento en la venta | Rebaja porcentual o de monto fijo aplicada al generar el ticket, por línea o por ticket, con tope configurable para empleados y sin acumular con promos por defecto
Umbral de stock bajo | Cantidad a partir de la cual el producto genera una alerta
Stock objetivo | Cantidad a la que se quiere llegar al reponer; se usa para sugerir el pedido
Unidad de pedido | Forma en que se le pide el producto al proveedor: unidad, caja de N o monto en pesos
Estado de pago | Estado del pago de un pedido de reposición (Pendiente de pago, Pagado; P1: Pago parcial), independiente de su estado logístico
Venta de respaldo | Venta hecha sin el lector láser/USB: por escaneo con la cámara del celular, búsqueda manual de texto o búsqueda por foto; produce el mismo resultado que una venta escaneada
Markup | Porcentaje de ganancia sobre el costo
Margen | Porcentaje de ganancia sobre el precio de venta
