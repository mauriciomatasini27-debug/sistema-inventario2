> Origen: `PRD - Sistema de Inventario para Kioscos y Comercios - Parte 2.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/inventario`, `src/pages/api/stock/*`

---

# PRD - Sistema de Inventario para Kioscos y Comercios (Parte 2)

Documento dividido en 3 partes por tamaño (Parte 2 de 3). Parte 1: secciones 1 a 4 (F1 a F7). Parte 2: sección 4 (F8 a F14) y sección 5 (flujos de usuario). Parte 3: secciones 6 a 10 y Anexo A (glosario). La numeración es continua entre las partes.

## 4. Funcionalidades (continuación)

### F8. Cuentas, usuarios y suscripción (P0, transversal)

### Requerimientos:

F8.1 Registro autoservicio con "Iniciar sesión con Google" (ver F8.6); creación del comercio (nombre, rubro, CUIT opcional, zona horaria, moneda ARS). El alta aprovisiona automáticamente la base de datos propia del comercio (una base por cliente, ver 6.4) y la registra en la base de control.

F8.2 Invitación de empleados por link o email, con rol Empleado; el dueño puede desactivarlos en cualquier momento (ver F8.8 y F8.9).

F8.3 Login con PIN corto opcional en dispositivos compartidos del comercio (P1).

F8.4 Prueba gratis, cobro de suscripción (Mercado Pago), y suspensión por falta de pago con tolerancia de mora de 14 días y aviso por email/WhatsApp (patrón tomado de ModoOps): durante los 14 días posteriores al vencimiento el comercio opera normalmente; el día 15 pasa a la suspensión (modo solo lectura), sin borrar datos.

F8.5 Exportación de datos (productos, movimientos) en CSV/Excel en cualquier momento.

F8.6 Autenticación con Google: dueños y empleados ingresan con el botón "Iniciar sesión con Google" (OAuth 2.0 / OpenID Connect) usando su propia cuenta de Google. Se piden solo los scopes mínimos openid, email y profile; no se pide acceso a Gmail, Drive ni ningún otro dato de la cuenta.

F8.7 Datos que se guardan: solo el identificador de la cuenta de Google (sub), el email y el nombre (y, opcionalmente, la URL de la foto de perfil). El sistema nunca guarda ni pide contraseñas. La verificación en 2 pasos y la seguridad de la cuenta las gestiona Google; el sistema no implementa su propio 2FA.

F8.8 Roles y permisos: el rol Dueño ve y gestiona todo (productos, costos, precios, proveedores, pedidos, usuarios, configuración y suscripción, según 3.1). El rol Empleado tiene acceso limitado según 3.2: ve productos y precios de venta, registra ingresos y egresos, crea productos al escanear si el dueño lo habilita; no ve costos ni márgenes (configurable), no edita proveedores, no confirma pedidos ni los marca como pagados, no gestiona usuarios ni la suscripción. Los permisos se aplican en el backend en cada request, no solo ocultando botones.

F8.9 Invitación y vínculo de la cuenta de Google: el dueño invita a un empleado por email (desde "Usuarios" → "Invitar empleado"); el sistema envía un email con un enlace de invitación de un solo uso y con vencimiento (por defecto, 7 días). En el primer ingreso, el empleado toca "Iniciar sesión con Google" y el sistema vincula su cuenta de Google (sub) a la invitación si el email verificado de Google coincide con el invitado; a partir de ahí, el acceso se identifica por el sub (aunque luego cambie el email). Si el email no coincide, se rechaza y se le pide ingresar con la cuenta invitada o pedirle al dueño una invitación a otro email.

F8.10 Revocar acceso: el dueño puede revocar el acceso de un empleado en cualquier momento; la revocación invalida de inmediato todas sus sesiones activas en todos los dispositivos. Los movimientos y registros que hizo ese empleado se conservan con su nombre en el historial (F3). El dueño también puede cancelar invitaciones pendientes y reenviarlas.

F8.11 Sesiones y cierre de sesión: después del login, la sesión se mantiene con una cookie de sesión del lado del servidor (HttpOnly, Secure, SameSite=Lax), sin guardar tokens de Google en el navegador. Duración configurable (por ejemplo, 30 días con renovación por uso en el celular del comercio). Botón "Cerrar sesión" que invalida la sesión en el servidor; desde "Mi cuenta" se ven las sesiones activas y se pueden cerrar todas.

F8.12 Cuenta de Google perdida: si un empleado pierde o deja de usar su cuenta de Google, el dueño revoca el acceso anterior y lo vuelve a invitar (con la misma u otra cuenta); el historial anterior sigue asociado a su usuario. Si el dueño pierde su cuenta de Google, la recupera por los mecanismos de recuperación de Google; si no puede, otro dueño del comercio (si lo hay) lo re-invita, y como último recurso el soporte de la plataforma (Control Plane) transfiere la titularidad tras verificar la identidad (CUIT, datos de facturación de la suscripción), con registro auditado.

### Criterios de aceptación:

☐ Un comercio nuevo se registra y crea su primer producto en menos de 3 minutos sin ayuda.

☐ Un empleado invitado entra y ve solo el comercio al que fue invitado.

☐ Ningún usuario puede ver datos de otro comercio, cada uno en su propia base de datos (verificado con tests automáticos de aislamiento).

☐ Un comercio con la suscripción vencida pasa a solo lectura el día 15 de mora (al terminar la tolerancia de 14 días) y recupera el acceso completo al pagar.

☐ Me registro como dueño tocando "Iniciar sesión con Google", acepto la pantalla de consentimiento que solo pide nombre, email y foto de perfil, y quedo dentro de mi comercio nuevo sin haber creado ninguna contraseña.

☐ En la base de control mi usuario guarda solo el sub de Google, el email y el nombre; no existe ningún campo de contraseña.

☐ Si mi cuenta de Google tiene verificación en 2 pasos, Google me la pide al iniciar sesión; el sistema no me pide un segundo factor propio.

☐ Invito a juan@gmail.com como empleado; Juan recibe el email, toca el enlace, inicia sesión con esa cuenta de Google y entra al comercio con rol Empleado.

☐ Si Juan intenta aceptar la invitación con otra cuenta de Google (otro email), el sistema lo rechaza y le explica qué hacer.

☐ Una invitación vencida o ya usada no permite ingresar.

☐ Como empleado no veo costos ni márgenes (salvo que el dueño lo habilite), ni proveedores para editar, ni usuarios, ni suscripción; si llamo a esas APIs directamente, recibo un error de permisos.

☐ Revoco el acceso de Juan y, en su celular, la próxima acción lo saca de la app; no puede volver a ingresar con su cuenta de Google; sus movimientos siguen en el historial con su nombre.

☐ Toco "Cerrar sesión" y la cookie queda invalidada en el servidor: volver atrás en el navegador no me deja operar.

☐ La cookie de sesión es HttpOnly y Secure, y no hay tokens de Google en localStorage ni en cookies accesibles desde JavaScript.

☐ Un empleado que perdió su cuenta de Google vuelve a tener acceso cuando el dueño lo re-invita a su cuenta nueva, y su historial anterior sigue asociado a su usuario.

### F9. Ubicaciones de productos (P0)

Descripción: el comerciante define las ubicaciones de su local con el nombre que quiera (por ejemplo, "Heladera A", "Góndola B", "Estante detrás del mostrador", "Depósito") y le asigna a cada producto dónde está. Así, cuando se escanea o se elige un producto para vender, el sistema muestra dónde está, y un empleado nuevo puede buscar un producto por nombre y saber dónde encontrarlo sin preguntar.

### Requerimientos:

F9.1 ABM de ubicaciones: el rol Dueño (o un empleado con permiso) puede crear, renombrar y archivar ubicaciones con cualquier nombre propio (único por comercio entre las activas). Archivar no borra: los productos que la tenían quedan "Sin ubicación" (o se reasignan en el mismo paso) y el historial conserva el nombre anterior. Una ubicación archivada se puede reactivar.

F9.2 Ubicación por producto: cada producto tiene una ubicación (opcional) y una nota de estante/posición opcional de texto libre (por ejemplo, "estante 2, izquierda", "puerta de la heladera"). Se asigna desde la ficha del producto, desde el alta (F1.1, F2.6, con selector y opción "Nueva ubicación…" ahí mismo) y por asignación masiva desde el listado (elegir varios productos → "Asignar ubicación").

F9.3 Ubicación visible en la operación: al escanear un producto (lector, cámara, F2.4) o elegirlo para vender (Modo venta F2.10, búsqueda manual F2.12, búsqueda por foto F2.13), la confirmación muestra su ubicación y nota (ej.: "Coca-Cola 500 ml · Heladera A · estante de abajo"). También se muestra en el listado (F1.4) y en la ficha.

F9.4 Encontrar un producto: la búsqueda web por nombre (F1.5), la búsqueda de texto de la venta (F2.12) y el escaneo con la cámara muestran la ubicación en cada resultado, para que un empleado nuevo sepa dónde está el producto con solo buscarlo. Un producto sin ubicación muestra "Sin ubicación" (y, al dueño, un acceso para asignarla).

F9.5 Auditoría: cada asignación o cambio de ubicación de un producto (y cada alta, cambio de nombre o archivo de una ubicación) queda registrado en el log de auditoría inmutable (append-only, 6.11) con valor anterior y nuevo, usuario, fecha y hora del servidor (America/Argentina/Buenos_Aires), origen y dispositivo, y se ve en "Ver trazabilidad" del producto (F3.10) junto con sus movimientos de stock. Cambiar la ubicación no cambia el stock ni genera un movimiento de stock.

F9.6 Permisos: el empleado ve las ubicaciones siempre; cambiar la ubicación de un producto o administrar ubicaciones requiere rol Dueño o permiso habilitado.

F9.7 (P1) Filtro por ubicación en el listado, en el historial y en las alertas (ej.: "qué hay en Heladera A" o "qué falta en Góndola B").

F9.8 (P1) Lista por ubicación para reponer: vista o impresión de los productos agrupados por ubicación (y ordenados por nota de estante), con stock actual y umbral, marcando los que están bajos, para recorrer el local reponiendo góndola o heladera de una pasada.

### Criterios de aceptación:

☐ Creo las ubicaciones "Heladera A" y "Góndola B" y una con nombre propio "Estante caramelos"; no puedo crear dos ubicaciones activas con el mismo nombre.

☐ Renombro "Góndola B" a "Góndola bebidas" y todos sus productos muestran el nombre nuevo; el historial muestra el cambio de nombre con mi usuario, fecha y hora.

☐ Archivo una ubicación con productos: el sistema me ofrece reasignarlos o dejarlos "Sin ubicación", y la ubicación archivada deja de aparecer en el selector.

☐ Asigno a la Coca-Cola 500 ml la ubicación "Heladera A" con la nota "estante de abajo"; al escanearla con el lector o elegirla en el Modo venta veo "Heladera A · estante de abajo" en la confirmación.

☐ Al crear un producto (alta normal o tras escanear un código inexistente) puedo elegir su ubicación o crear una nueva sin salir del formulario.

☐ Selecciono 20 productos del listado y les asigno "Góndola B" en un solo paso; cada cambio queda en el historial.

☐ Como empleado nuevo, escribo "alfajor jorgito" en la búsqueda web y en la búsqueda de texto de la venta y veo en el resultado su ubicación y nota.

☐ Un producto sin ubicación muestra "Sin ubicación".

☐ Muevo un producto de "Heladera A" a "Heladera B" y en "Ver trazabilidad" aparece "Ubicación: Heladera A → Heladera B" con usuario, fecha y hora, origen y dispositivo; el stock no cambia y no se genera un movimiento de stock.

☐ Un empleado sin permiso no puede cambiar ubicaciones ni crear, renombrar o archivar ubicaciones.

☐ (P1) Filtro el listado por "Heladera A" y veo solo sus productos; la "lista por ubicación" me muestra los productos agrupados por ubicación con los de stock bajo marcados.

### F10. Devoluciones de clientes (P0)

Descripción: cuando un cliente devuelve un producto, el sistema encuentra la venta original, vuelve a subir el stock con un movimiento de tipo "devolución" vinculado a esa venta (no es una merma ni un ajuste), revierte la ganancia de la venta en forma proporcional y registra el reintegro al cliente por el medio de pago que elija el operador como egreso en la caja (según el "PRD - Caja Digital para Sistema de Inventario"). Si el producto devuelto no se puede volver a vender, se manda a merma en lugar de volver al stock vendible.

### Requerimientos:

F10.1 Buscar la venta original: desde "Vender" → "Devolución" (web y app móvil) se encuentra la venta por:

número de ticket/venta (si el cliente trae el ticket o el comprobante);

ventas recientes (lista de las últimas ventas del día/turno con hora, productos, importe, medio de pago y usuario, con filtro por fecha y medio de pago);

escaneo del producto devuelto (lector, cámara o búsqueda de texto, F2.0): se muestran las ventas recientes que incluyen ese producto para elegir la correcta.

Si no se encuentra la venta original, no se registra una devolución vinculada: el dueño (o un empleado con permiso) puede registrar, con motivo, un ajuste manual (F1.2) y, si corresponde, un egreso en la caja; la regla por defecto es exigir la venta original (ver 8.2).

F10.2 Devolución total o parcial: se eligen los productos y la cantidad devuelta de cada línea de la venta. La cantidad devuelta no puede superar la cantidad vendida menos lo que ya se haya devuelto antes de esa misma venta (pueden hacerse varias devoluciones parciales sobre una venta hasta completar lo vendido).

F10.3 Stock vuelve a subir (producto apto): por defecto, cada línea devuelta genera un movimiento "devolución" (+cantidad) que vuelve a subir el stock del producto, con referencia a la venta original (y a su movimiento "egreso por venta"). No se registra como merma ni como ajuste.

F10.4 Camino "no apto para venta": si el producto vuelve dañado, abierto o vencido, el usuario marca la línea como "No apto para venta" y elige el motivo (rotura, vencido, abierto, otro). En ese caso, en la misma operación se registran la devolución (+cantidad, vinculada a la venta) y un egreso por merma de devolución (−cantidad, vinculado a la devolución), de modo que el stock vendible no sube y la pérdida queda registrada como merma a costo, con trazabilidad completa de ambos pasos.

F10.5 Reversión proporcional de la ganancia: la ganancia de la venta original se revierte en proporción a la cantidad devuelta, con los valores congelados de la venta (no los vigentes): ganancia revertida = (precio unitario de la venta − costo unitario de la venta) × cantidad devuelta. El importe a reintegrar = precio unitario de la venta × cantidad devuelta (respetando descuentos o precios editados de esa venta). Los totales de ventas y ganancia del día/período muestran las ventas netas de devoluciones (y las devoluciones por separado). En el camino "no apto", además, la merma se valoriza al costo de la venta original.

F10.6 Medio de pago del reintegro, a elección del operador: al confirmar la devolución, el operador elige libremente el medio de pago del reintegro entre los medios de la caja (Efectivo, Débito, Mercado Pago/QR, Transferencia bancaria u otros configurados), sin necesidad de indicar un motivo; el selector muestra como referencia el medio de la venta original, pero no lo impone ni exige justificar un medio distinto. El reintegro se registra como egreso en la caja digital de categoría "Devoluciones a clientes" (o la definida en el PRD de Caja Digital), con el medio elegido, el monto, y vinculado a la venta original y a la devolución; el medio elegido queda registrado y auditado en el movimiento de caja (quién lo eligió, fecha y hora del servidor, origen, dispositivo, y el medio de la venta original como dato de referencia). La devolución de stock y el egreso de caja se guardan en una misma transacción: no puede quedar una devolución sin reintegro registrado ni un reintegro sin devolución. Si el módulo Caja Digital no está activo, el reintegro (con su medio) queda registrado solo en la devolución. Si el operador elige QR/Mercado Pago y el reintegro se ejecuta en el proveedor de pago (P1, según el PRD de Caja Digital), el egreso queda vinculado a esa operación.

F10.7 Registro inmutable: cada devolución queda en el historial inmutable (F3) con quién la hizo, fecha y hora del servidor (America/Argentina/Buenos_Aires), origen y dispositivo, motivo, venta original, cantidades, importe reintegrado, medio de pago y, si aplica, el egreso por merma. Una devolución no se edita ni se borra; si se registró mal, se corrige con un movimiento compensatorio (F3.8) y, en la caja, con la reversión que defina el PRD de Caja Digital.

F10.8 Vínculos visibles: en la venta original se ven sus devoluciones (cantidad devuelta y saldo devolvible) y en la devolución se abre la venta; en "Ver trazabilidad" del producto (F3.10) la devolución aparece vinculada a la venta.

F10.9 Permisos: por defecto, el empleado puede registrar devoluciones, sin límite de plazo ni de monto propio del rol; el dueño puede restringirlo por empleado (quitarle el permiso de registrar devoluciones), según la matriz de permisos del PRD de autenticación (AU4.9) y el PRD de Caja Digital (C14). El operador (empleado o dueño) elige el medio de pago del reintegro (F10.6) y ese medio queda auditado en el movimiento de caja. El plazo máximo para aceptar devoluciones es una política opcional del comercio, igual para todos los roles.

F10.10 (P1) Devolución con cambio por otro producto (devolución + venta nueva en un paso, con diferencia a cobrar o reintegrar) y reportes de devoluciones por producto, motivo y empleado.

### Criterios de aceptación:

☐ Busco la venta #1050 por número de ticket, por la lista de ventas recientes o escaneando el producto devuelto, y en los tres casos llego a la misma venta.

☐ Sobre una venta de 3 Coca-Cola 500 ml (precio $1.400, costo $1.000, stock después de la venta 7) registro la devolución de 1 unidad apta: el stock sube a 8, el historial muestra "Devolución +1" vinculada a la venta #1050 con mi usuario, fecha y hora, origen y dispositivo, la ganancia de la venta se reduce en $400 y el total de ventas neto baja $1.400.

☐ La venta original se pagó con QR y elijo reintegrar por QR (Mercado Pago): el reintegro de $1.400 se registra como egreso en la caja con medio QR, vinculado a la venta #1050 y a la devolución.

☐ Sobre esa misma venta pagada con QR elijo reintegrar en efectivo: el sistema no me pide ningún motivo, el egreso se registra en efectivo, el saldo de efectivo de la caja baja $1.400 y el movimiento de caja muestra el medio elegido (efectivo), mi usuario, fecha y hora, origen, dispositivo y, como referencia, el medio de la venta original (QR).

☐ El medio de pago elegido para el reintegro queda en el historial de auditoría del movimiento de caja y no se puede editar; si me equivoqué, se corrige con la reversión de la caja según el PRD de Caja Digital.

☐ Devuelvo 1 y después otra unidad de la misma venta de 3: se aceptan ambas; al intentar devolver 2 más, el sistema solo me deja devolver 1 (no se puede superar lo vendido).

☐ Marco una devolución como "No apto para venta" (envase roto): el historial muestra "Devolución +1" y "Egreso por merma de devolución −1" vinculados, el stock vendible no cambia, la merma queda valorizada al costo y el reintegro al cliente igual se registra.

☐ Si después cambian el precio o el costo del producto, la ganancia revertida y el importe reintegrado se calculan con los valores de la venta original.

☐ Si falla el registro del egreso en la caja, la devolución no se guarda (y viceversa).

☐ No puedo editar ni borrar una devolución registrada; solo puedo corregirla con un movimiento compensatorio.

☐ Como empleado, por defecto registro una devolución de cualquier monto sin pedir autorización al dueño; si el dueño me restringe ese permiso, ya no veo la opción "Devolución" y la API la rechaza.

☐ La devolución registrada por un empleado muestra en el movimiento de caja el medio de reintegro que eligió, con su usuario, fecha y hora, origen y dispositivo.

☐ En la venta #1050 veo "Devuelto: 2 de 3" con el enlace a cada devolución.

### F11. Operación 100% desde el celular (P0, transversal)

Descripción: el comercio puede operar todo el sistema con un solo celular, sin computadora. La app del celular es la misma PWA (no una versión recortada): todas las tareas, incluidas las que suelen asociarse a una pantalla grande (sacar y editar fotos, alta y configuración del comercio, carga de proveedores y ubicaciones, armado de pedidos, caja, facturas, gestión de usuarios, historial, trazabilidad y exportaciones), están diseñadas mobile-first y se hacen cómodamente desde el teléfono. La PC y el lector láser/USB son opcionales.

### Requerimientos:

F11.1 Paridad de funciones: toda función P0 de este PRD y de los módulos relacionados (Caja Digital, facturas de proveedores, bot de WhatsApp en lo que corresponde a la app) está disponible en la app del celular con la misma lógica, permisos y resultados que en la PC. No hay funciones "solo web".

F11.2 Venta y carga con la cámara: en el celular, el escaneo en vivo con la cámara (F2.1) es el método principal cuando no hay lector; la búsqueda de texto (F2.12) y la búsqueda por foto (F2.13, P1) completan la jerarquía (F2.0).

F11.3 Lector opcional: el comercio puede usar un lector Bluetooth emparejado al celular (modo teclado HID, F2.2) o un lector USB en una PC; ninguno es obligatorio.

F11.4 Tareas de configuración en el celular: alta del comercio, asistente de bienvenida, alta y edición de productos con foto (F1.8), proveedores (F6), ubicaciones (F9), umbrales, usuarios e invitaciones (F8), suscripción, aumento masivo de precios (F7.4) y exportaciones (F3.12, F8.5) se completan desde el teléfono con formularios de una columna, teclados adecuados (numérico para cantidades y precios, email, teléfono) y sin depender de hover, doble clic ni atajos de teclado.

F11.5 Offline en el celular (P0, primera versión / MVP): la app del celular sigue operando sin conexión con una base SQLite local en el teléfono y sincronización automática al volver la conexión, según el "PRD - Modo Offline para Sistema de Inventario" (https://docs.google.com/document/d/1NvVipeJhXBgH5oae8D2SWzpqzBLybEaQ5Tc77G03Vw4/edit), que ya las incluye en su v1. En el MVP funcionan offline: venta (cámara, lector Bluetooth/USB y búsqueda de texto contra el catálogo local), descuento de stock (los movimientos se registran localmente y se suman en el servidor al sincronizar, sin pisar ventas de otros dispositivos), caja (apertura, registro de cobros con su medio de pago, egresos y cierre manual, según el PRD de Modo Offline y el de Caja Digital), carga de mercadería, egresos por rotura/vencimiento, búsqueda y consulta de stock y ubicaciones. Las acciones sensibles (compensatorios, configuración, usuarios) requieren conexión; la edición offline de productos, las devoluciones offline y la recepción de pedidos offline quedan para P1 según ese PRD. Los movimientos offline conservan su trazabilidad (F3.7: hora del dispositivo y hora de registro en el servidor).

F11.6 Exportar y compartir desde el celular: los PDF y CSV (historial, pedidos) se descargan o se comparten con el menú nativo del teléfono (WhatsApp, email, Drive).

F11.7 Rendimiento en celulares de gama media: las pantallas de uso diario (venta, carga, búsqueda) cumplen los objetivos de 6.9 en un Android de gama media con 4G.

### Criterios de aceptación:

☐ (Un día completo solo con el celular) Sin ninguna PC ni lector, en un Android de gama media: me registro con Google, creo el comercio, cargo 20 productos con foto escaneando con la cámara, configuro un proveedor y dos ubicaciones, abro la caja, vendo 30 productos con la cámara y por búsqueda de texto, registro una rotura, una devolución y un ajuste, armo y envío un pedido por WhatsApp, marco un pedido como pagado, cierro la caja, reviso la trazabilidad de un producto y exporto el historial a PDF, todo desde el teléfono.

☐ Ninguna pantalla P0 muestra "disponible solo en la versión web" ni requiere una pantalla más grande que la de un celular de 360 px de ancho para completarse.

☐ Emparejo un lector Bluetooth con el celular y, en la pantalla de venta, al escanear un código se abre el producto igual que con un lector USB en la PC.

☐ Sin lector, la pantalla de venta del celular abre directamente el escaneo con la cámara como método principal.

☐ Saco la foto de un producto, la repito y la guardo desde el celular sin salir del formulario de alta (F1.8).

☐ Invito a un empleado, cambio su permiso de ver costos y le revoco el acceso, todo desde el celular.

☐ Sin conexión, sigo vendiendo y cargando mercadería desde el celular; al volver la conexión los movimientos se sincronizan y aparecen en el historial con las dos horas (dispositivo y servidor).

☐ (MVP) Con el celular en modo avión vendo 3 productos cobrando uno en efectivo y dos con Mercado Pago: el stock local baja en el momento, la caja local muestra los cobros con su medio de pago y, al volver la conexión, el stock del servidor, las ventas, la ganancia y los cobros de la caja quedan registrados sin duplicados.

☐ (MVP) Dos celulares venden offline el mismo producto; al sincronizar, el stock del servidor descuenta ambas ventas (suma de movimientos) y, si queda negativo, se marca y se avisa al dueño.

☐ Exporto el historial a PDF desde el celular y lo comparto por WhatsApp con el menú de compartir del teléfono.

### F12. Lotes con fecha de vencimiento (P0, MVP)

Descripción: por decisión del dueño del 9/10/2026, el stock de los productos perecederos (lácteos, fiambres, golosinas, bebidas, etc.) se controla por lote, cada uno con su fecha de vencimiento. Al recibir mercadería se carga el vencimiento del lote; la venta descuenta automáticamente primero lo que vence antes (FEFO, first expired, first out); el sistema avisa antes de que algo venza y permite dar de baja lo vencido como merma, con trazabilidad completa. Estos datos alimentan las recomendaciones de promociones del bot para productos próximos a vencer, según el "PRD - Rotación" (https://docs.google.com/document/d/1ABXzORmd9_o3oYxmBm6878l2VZufCKgrIyAXTifdPeQ/edit).

### Requerimientos:

F12.1 Flag "controla vencimiento" por producto: opcional en la ficha y en el alta (F1.1, F2.6), desactivado por defecto; se puede activar en masa por categoría o proveedor. Si está desactivado, el producto funciona como hasta ahora (stock único, sin lotes) y la fecha de vencimiento es opcional al cargar. Si está activado, la fecha de vencimiento es obligatoria en cada ingreso. Al activarlo en un producto con stock, el sistema pide repartir el stock existente en uno o más lotes (o dejarlo en un lote "sin fecha" que se vende primero y se marca para revisar).

F12.2 Vencimiento al recibir mercadería: en todo ingreso de stock (carga manual o Modo carga con lector o cámara, F2.4 a F2.7; alta con stock inicial, F2.6; recepción de un pedido de reposición, F5.8; mercadería de una factura del proveedor según el PRD de facturas de proveedores), el operador ingresa la fecha de vencimiento del lote y la cantidad. Un mismo ingreso puede dividirse en varios lotes con fechas distintas. Si llega un lote con la misma fecha que uno existente del producto, se suma a ese lote (configurable). Cada lote guarda su origen (carga manual, escáner, pedido, factura) y la fecha de recepción.

F12.3 Carga rápida en el celular: selector de fecha nativo optimizado para el mostrador (accesos rápidos por mes/año, como viene impreso "VTO 03/27", y por días desde hoy), que recuerda la última fecha usada en la sesión de carga continua para escanear varias unidades del mismo lote. (P1) OCR de la fecha impresa en el envase con la cámara del celular, que propone la fecha y el operador confirma.

F12.4 Stock por lote: el stock del producto es la suma de sus lotes activos, y cada lote es a su vez la suma de sus movimientos (F3.9 se cumple por producto y por lote). Cada movimiento de stock de un producto que controla vencimiento referencia su lote.

F12.5 FEFO automático en la venta: toda venta (F2.10, cualquier método de identificación, F2.11) y todo egreso descuentan automáticamente del lote que vence primero (y, si una cantidad supera ese lote, siguen con el próximo, generando un movimiento por lote). El operador no tiene que elegir el lote; el dueño (o un empleado con permiso) puede elegir otro lote a mano en un egreso o ajuste. Los lotes vencidos no se usan para vender: si solo quedan lotes vencidos, se avisa antes de confirmar la venta. En la venta offline (F11.5), el celular aplica FEFO sobre los lotes locales y el servidor confirma o reasigna el lote al sincronizar, sin cambiar el total vendido.

F12.6 Visibilidad: la ficha del producto muestra sus lotes (cantidad, fecha de vencimiento, días restantes, fecha de recepción y origen) ordenados por vencimiento; el listado y los resultados de búsqueda (F1.5, F2.12) muestran el próximo vencimiento y la cantidad de ese lote (ej.: "Yogur Ser · 12 u. · vence 14/10 (5 días)"); la confirmación de venta indica el lote del que se descuenta.

F12.7 Alertas de vencimiento: a días configurables por comercio (por defecto 15, 7 y 3 días antes) y opcionalmente por producto o categoría, el sistema genera alertas en un panel "Por vencer" (y en el badge de inicio, junto a las de stock bajo, F4.3), con la cantidad y el valor a costo en riesgo; el día del vencimiento el lote pasa a "Vencido". (P1) Aviso push, email o WhatsApp al dueño, como en F4.6.

F12.8 Baja de stock vencido: desde la alerta, el panel o la ficha, el operador da de baja un lote vencido (total o parcial) con un movimiento "vencido" (tipo egreso por vencimiento, una merma valorizada al costo del lote) vinculado al lote, que queda en el historial inmutable (F3) con usuario, fecha y hora del servidor, origen y dispositivo. No se borra el lote: queda con cantidad 0 y estado "dado de baja".

F12.9 Promociones por vencimiento cercano: los lotes próximos a vencer (cantidad, fecha, costo, precio y rotación) se exponen al bot de WhatsApp para que recomiende promociones (descuento, 2x1, combo) antes del vencimiento, según el PRD de Rotación (https://docs.google.com/document/d/1ABXzORmd9_o3oYxmBm6878l2VZufCKgrIyAXTifdPeQ/edit). El sistema solo sugiere; el comerciante decide y cualquier cambio de precio queda en el log de auditoría (F3.5).

F12.10 Permisos: el empleado puede cargar vencimientos al recibir mercadería y registrar la baja de lotes vencidos (configurable); activar o desactivar el flag, elegir un lote fuera de FEFO o corregir la fecha de un lote (que queda en el audit_log con valor anterior y nuevo) requiere rol Dueño o permiso.

F12.11 (P1) Reporte de merma por vencimiento (por producto, proveedor y período) y OCR de la fecha impresa (F12.3).

### Criterios de aceptación:

☐ Un producto sin el flag "controla vencimiento" se carga y se vende exactamente como antes, sin pedir fecha.

☐ Activo "controla vencimiento" en "Yogur Ser 190 g"; al cargar mercadería con el lector, el sistema no me deja confirmar sin fecha de vencimiento.

☐ Desde el celular cargo 24 yogures en dos lotes (12 que vencen el 14/10 y 12 el 21/10) con el selector de fecha en menos de 20 segundos; la ficha muestra ambos lotes con su cantidad, vencimiento, recepción y origen "escáner".

☐ Al recibir el pedido #42 (P1) o registrar la factura del proveedor, los productos que controlan vencimiento me piden la fecha de cada lote y el lote guarda origen "pedido" o "factura".

☐ Vendo 15 yogures: el sistema descuenta 12 del lote del 14/10 y 3 del lote del 21/10 sin que yo elija nada; el historial muestra dos movimientos "egreso por venta" con su lote, y el stock del producto queda en 9.

☐ La venta hecha por lector, cámara, búsqueda de texto o foto aplica el mismo FEFO.

☐ En la búsqueda escribo "yogur ser" y veo "vence 14/10 (5 días)" junto al stock.

☐ Con alertas configuradas a 15/7/3 días, un lote que vence en 7 días aparece en el panel "Por vencer" con cantidad y valor a costo en riesgo.

☐ Un lote vencido no se usa en la venta; si es el único con stock, el sistema me avisa antes de confirmar.

☐ Doy de baja 4 unidades de un lote vencido: el stock baja 4, el historial muestra "Vencido −4" con el lote, mi usuario, fecha y hora, origen y dispositivo, se registra como merma a costo y el movimiento no se puede editar ni borrar.

☐ La suma de los movimientos de cada lote coincide con su cantidad, y la suma de los lotes con el stock del producto.

☐ Vendo offline desde el celular un producto con lotes: al sincronizar, el stock del servidor y los lotes cierran sin duplicados.

☐ El bot de WhatsApp recibe los lotes próximos a vencer y me sugiere una promo; el precio no cambia hasta que yo lo confirme.

☐ (P1) Apunto la cámara a "VTO 03/2027" impreso en el envase y el sistema propone la fecha 31/03/2027 para que la confirme.

### F13. Conteo de stock guiado por sector (P0, MVP)

Descripción: por decisión del dueño del 9/10/2026, el dueño o un empleado puede contar el stock de un sector del local (una ubicación de F9, por ejemplo "Heladera A") desde el celular, escaneando o buscando los productos y cargando las cantidades contadas. El sistema compara lo contado con el stock teórico al momento en que empezó el conteo (teniendo en cuenta las ventas y movimientos que ocurren mientras se cuenta), muestra las diferencias y, al confirmar, genera movimientos inmutables de "ajuste por conteo". No es el "arqueo" diario que se quitó del producto: no hay ningún conteo de cierre obligatorio ni diario; es un conteo opcional y periódico por sector que el comercio hace cuando quiere.

### Requerimientos:

F13.1 Iniciar un conteo por sector: desde "Conteo" (app del celular; también en la PC) se elige una ubicación (F9) o "Sin ubicación"; el sistema lista los productos asignados a ese sector (con foto, nombre y nota de estante) y registra el inicio del conteo (fecha y hora del servidor, usuario, dispositivo). Opcionalmente se puede contar una selección libre de productos o una categoría.

F13.2 Contar escaneando o buscando: el operador escanea cada producto (lector, cámara, Bluetooth, F2.0) o lo busca por texto (F2.12) e ingresa la cantidad contada con el teclado numérico (en unidades o cajas, F2.4; si el producto controla vencimiento, opcionalmente por lote, F12). Escanear varias veces el mismo producto suma unidades. Un producto escaneado que no pertenece al sector se puede contar igual y se ofrece moverlo a este sector (cambio de ubicación auditado, F9.5). Los productos del sector no contados quedan marcados como "pendientes" (no se asume 0 salvo que el operador lo indique).

F13.3 Stock teórico al inicio y movimientos durante el conteo: para cada producto, la referencia es el stock teórico al momento de inicio del conteo (reconstruible por F3.9). Las ventas y demás movimientos que ocurren entre el inicio y la confirmación se descuentan o suman al comparar (por defecto, se considera que lo contado refleja el stock al inicio; configurable "contado en el momento de escanear cada producto", usando la hora de cada línea). Así una venta durante el conteo no genera una diferencia falsa.

F13.4 Diferencias: antes de confirmar, se muestra por producto: stock teórico, cantidad contada, diferencia en unidades y su valor a costo (solo si el usuario puede ver costos, F7.6), y el total del sector (faltantes, sobrantes y neto). Se puede recontar una línea antes de confirmar.

F13.5 Confirmar y ajustar: al confirmar, por cada línea con diferencia se genera un movimiento inmutable "ajuste por conteo" (±diferencia) con motivo (por defecto "Conteo #N – Heladera A", editable por línea: faltante, rotura no registrada, error de carga, otro), referencia al conteo, usuario que contó, usuario que confirmó, fecha y hora del servidor, origen y dispositivo (F3.7). Las líneas sin diferencia quedan registradas como verificadas, sin movimiento. Un conteo confirmado no se edita; un error se corrige con un movimiento compensatorio (F3.8) o con otro conteo.

F13.6 Permisos: los empleados pueden contar (iniciar, cargar y dejar el conteo "listo para revisar"); solo el Dueño (o un empleado con permiso) confirma los ajustes. Un empleado sin permiso de ver costos no ve el valor de las diferencias.

F13.7 Conteos parciales y reanudables: un conteo se puede pausar y retomar más tarde (en el mismo u otro dispositivo, o por otro usuario del comercio) sin perder lo cargado; queda en estado "en curso" hasta que se envía a revisión, se confirma o se cancela (cancelar no genera movimientos y queda en el historial).

F13.8 Offline: el conteo funciona sin conexión en el celular (catálogo y stock locales, F11.5): las líneas se guardan en la base local con su hora de dispositivo y se sincronizan al volver la conexión; el stock teórico y las diferencias definitivas se recalculan en el servidor con los movimientos sincronizados antes de confirmar. La confirmación de los ajustes requiere conexión (acción sensible).

F13.9 Cronograma rotativo (opcional): el dueño puede configurar un plan de conteo rotativo (por ejemplo, un sector distinto cada día: lunes "Heladera A", martes "Góndola B"…); el sistema sugiere el sector del día en el inicio y muestra cuándo se contó por última vez cada sector. Es solo un recordatorio: no bloquea la operación ni es obligatorio.

F13.10 Historial y reporte de diferencias: lista de conteos (sector, fecha, quién contó, quién confirmó, estado, productos contados, diferencia neta en unidades y a costo) y un reporte de diferencias (merma) por período, sector, producto y usuario, exportable a CSV/PDF (F3.12), para detectar dónde se pierde mercadería. Los ajustes por conteo aparecen en "Ver trazabilidad" (F3.10) vinculados a su conteo.

F13.11 (P1) Sugerencia de qué sector contar según diferencias anteriores y rotación, y conteo a ciegas configurable (el operador no ve el stock teórico mientras cuenta).

### Criterios de aceptación:

☐ Desde el celular elijo "Heladera A", veo sus 25 productos, escaneo 10 con la cámara y cargo las cantidades; el conteo queda "en curso" con mi usuario y la hora de inicio.

☐ Mientras cuento, se venden 2 Coca-Cola 500 ml (stock teórico al inicio 10, ahora 8); cuento 8 y el sistema muestra diferencia 0, no −2.

☐ Cuento 6 de un producto con stock teórico 9: veo diferencia −3 y su valor a costo (si puedo ver costos).

☐ Como empleado cargo el conteo y lo envío a revisión, pero no veo el botón "Confirmar ajustes"; el dueño lo confirma.

☐ Al confirmar, el historial muestra "Ajuste por conteo −3" con motivo, referencia al conteo #N, quién contó, quién confirmó, fecha y hora del servidor, origen y dispositivo; el movimiento no se puede editar ni borrar y el stock queda en el valor contado (ajustado por las ventas durante el conteo).

☐ Los productos del sector que no conté quedan "pendientes" y no generan ajuste.

☐ Pauso un conteo en el celular, lo retomo al día siguiente (o lo retoma otro empleado) y está todo lo que había cargado.

☐ En modo avión cuento un sector completo; al volver la conexión las líneas se sincronizan y las diferencias se recalculan con las ventas sincronizadas antes de confirmar.

☐ Configuro el cronograma rotativo (lunes Heladera A, martes Góndola B) y el martes el inicio me sugiere contar "Góndola B"; si no lo hago, nada se bloquea.

☐ El sistema nunca exige un conteo diario ni un cierre de stock obligatorio (no hay arqueo).

☐ El reporte de diferencias del mes muestra la merma por sector y producto y lo exporto a PDF.

☐ Cancelo un conteo y no se genera ningún movimiento; el conteo cancelado queda en el historial.

### F14. Descuentos en la venta (ticket) (P0)

Descripción: al vender, el operador puede aplicar descuentos en el momento de generar el ticket, tanto porcentuales como de monto fijo, sobre una línea o sobre el ticket completo, alineado con los descuentos del PRD de Ticket de venta (TV) y con las reglas del PRD de Gestión de precios (por defecto, los descuentos no se acumulan con promos).

### Requerimientos:

F14.1 Tipos: descuento % (ej.: 10%) o monto fijo (ej.: $500), a elección del operador.

F14.2 Alcance: por línea (un producto del ticket) o por ticket (sobre el subtotal). Un descuento por ticket se prorratea entre las líneas en proporción a su importe para calcular el importe neto y la ganancia de cada línea (F2.10, F7.8).

F14.3 Momento: se aplica al armar el ticket, antes de confirmar la venta; el ticket muestra precio de lista, descuento (tipo, valor e importe) y precio final por línea, y el descuento total del ticket, según el PRD de Ticket.

F14.4 Redondeo: el importe final de la línea y del ticket se redondea según la regla configurada por el comercio (a $1, $10, $50 o $100, como en F7.3); la diferencia de redondeo se registra en el ticket.

F14.5 Aviso bajo costo: si el precio final de una línea queda por debajo del costo (ganancia negativa), el sistema muestra un aviso antes de confirmar; el dueño puede confirmar igual y el empleado solo si tiene permiso (si no, se pide la confirmación del dueño o un empleado con permiso).

F14.6 Tope para empleados: el dueño configura un porcentaje máximo de descuento por empleado (o un valor por defecto para el rol Empleado); un descuento que lo supera (por línea o por ticket, comparado en % equivalente) se bloquea o requiere la aprobación del dueño. El dueño no tiene tope.

F14.7 Sin acumulación con promos (por defecto): si una línea ya tiene una promo o combo vigente (PRD de Rotación / Precios), no se le puede aplicar un descuento adicional salvo que el dueño habilite la acumulación en la configuración; el sistema muestra cuál se aplica.

F14.8 Registro y auditoría: cada venta guarda por línea precio de lista, descuento (tipo, valor, importe, alcance), precio final, costo y ganancia neta; los descuentos quedan en el historial inmutable (F3) con usuario, fecha y hora del servidor, origen y dispositivo, y las aprobaciones del dueño, si las hubo. La ganancia de la venta y la de las devoluciones (F10.5) se calculan sobre el precio con descuento.

F14.9 (P1) Motivos de descuento predefinidos y reporte de descuentos por empleado, producto y período.

### Criterios de aceptación:

☐ Aplico 10% a una línea de 2 Coca-Cola de $1.400: la línea queda en $2.520 y el ticket muestra precio de lista, descuento de $280 y precio final.

☐ Aplico $500 fijos al ticket completo de $5.000 con dos líneas de $3.000 y $2.000: el descuento se prorratea $300 y $200 y la ganancia de cada línea se calcula sobre el neto.

☐ Con redondeo a $10, un ticket que da $4.497 queda en $4.500 (o según la regla configurada) y la diferencia de redondeo queda registrada.

☐ Un descuento que deja una línea por debajo del costo muestra el aviso "el precio queda por debajo del costo" antes de confirmar.

☐ Con el tope de empleado en 10%, como empleado no puedo aplicar 15% sin la aprobación del dueño; el dueño puede aplicarlo sin tope.

☐ Sobre una línea que ya tiene una promo vigente no puedo agregar un descuento (salvo que el dueño haya habilitado la acumulación).

☐ El historial de la venta muestra el descuento aplicado con mi usuario, fecha y hora, origen y dispositivo, y no se puede editar ni borrar.

☐ Al devolver una unidad de una línea con 10% de descuento, el reintegro y la ganancia revertida se calculan sobre el precio con descuento.

## 5. Flujos de usuario

### Flujo 1: alta del comercio y carga inicial

El dueño entra a la landing y toca "Probar gratis".

Toca "Iniciar sesión con Google", elige su cuenta de Google (Google le pide la verificación en 2 pasos si la tiene activada), acepta la pantalla de consentimiento (solo nombre, email y foto) y crea su comercio (nombre, rubro). No crea ninguna contraseña; el sistema guarda solo su ID de Google, email y nombre, y lo registra como Dueño en la base de control mientras se aprovisiona la base del comercio.

El asistente de bienvenida le propone tres caminos: "Escanear productos", "Importar Excel" (P1) o "Cargar a mano".

Elige "Escanear": el navegador pide permiso de cámara y lo acepta.

Escanea el primer producto (con el lector USB o, si no tiene, con la cámara del celular); como no existe, completa nombre, costo, precio y cantidad, toca "Sacar foto" junto al código (se abre la cámara ahí mismo; en la PC, la webcam o subir un archivo), revisa la vista previa (puede repetirla), toca "Usar foto" y guarda. La foto se comprime antes de subirse y queda en el catálogo visual.

Repite en modo carga continua con el resto de la góndola.

Al terminar, el inicio le muestra: productos cargados, valor del stock y una invitación a configurar umbrales y proveedores.

### Flujo 2: carga rápida de mercadería que llega del proveedor (escaneo)

Llega el preventista con la mercadería. El empleado abre "Cargar mercadería" (Modo carga).

Escanea la caja de chocolates con el lector USB en la PC del mostrador (método principal) o, si no hay lector o no lee, con la cámara del celular.

El sistema reconoce el código de caja: muestra "Chocolate Águila 100 g, caja x24, stock actual 3".

El empleado ingresa "2" (cajas) y confirma.

El sistema suma 48 unidades, muestra "+48, stock 51", vibra y queda listo para el siguiente escaneo.

Escanea un producto nuevo que no está en el sistema: aparece "Código 7790000000000 no encontrado. ¿Crear producto?".

Completa nombre y cantidad (y foto, si quiere: toca "Sacar foto", saca la foto, la revisa o la repite y la usa), y guarda. Si el dueño no habilitó la creación por empleados, el producto queda "pendiente de revisión".

Al terminar, el dueño puede ver en el historial todo lo que cargó el empleado, con fecha y hora.

### Flujo 3: alerta de stock bajo → pedido de reposición → envío por WhatsApp

El dueño abre la app y ve el badge "6 productos con stock bajo".

Toca la alerta del Chocolate Águila (quedan 3, umbral 3).

Se abre el borrador de pedido a "Distribuidora X" con los 4 productos de ese proveedor que están en alerta y sus cantidades sugeridas.

Ajusta cantidades con los campos numéricos: chocolates de 2 a 3 cajas; cigarrillos "por monto" en $50.000; quita un producto que todavía no quiere pedir.

Busca y agrega un producto que no estaba en alerta pero quiere aprovechar el pedido.

Revisa el total estimado y toca "Confirmar y enviar por WhatsApp".

Se abre WhatsApp con el chat del preventista y el mensaje armado; lo envía.

El pedido queda en estado "Enviado" y "Pendiente de pago". (P1) Cuando llega la mercadería, abre el pedido, marca "Recibido", corrige diferencias y el stock se actualiza solo.

Al pagarle al proveedor (contra entrega, o más tarde si trabaja en cuenta corriente), el dueño abre el pedido y toca "Marcar como pagado". Alternativa por WhatsApp: le saca una foto a la factura del proveedor y se la manda al bot, que le pregunta a qué pedido corresponde (sugiere los pendientes de pago de ese proveedor).

Revisa el monto (precargado con el total; lo corrige si la factura dice otro importe), elige el medio de pago (por ejemplo, Transferencia bancaria, precargado según las condiciones del proveedor) y confirma.

El pedido queda "Pagado" con fecha, monto, medio y la factura asociada (si la mandó), y la caja registra sola el egreso en "Pago a proveedores" con ese medio, vinculado al pedido; el saldo del medio baja en el momento.

Si el proveedor trabaja en cuenta corriente, mientras no se haga el paso 9 el pedido sigue "Pendiente de pago", con su fecha de vencimiento visible en la lista de pedidos y en la ficha del proveedor.

### Flujo 4: envío de pedido por email

Mismos pasos 1 a 5 del Flujo 3, con un proveedor que trabaja por email.

Toca "Confirmar y enviar por email".

El sistema muestra una vista previa del email (asunto "Pedido de Kiosco La Esquina - 09/10/2026", detalle y condiciones).

Confirma; el email sale desde la dirección transaccional con "Responder a" del comercio.

El pedido queda "Enviado" con registro de envío; si el email rebota, se muestra un aviso.

### Flujo 5: alta y configuración de un proveedor

El dueño va a "Proveedores" → "Nuevo proveedor".

Carga nombre, contacto, WhatsApp, email, días de visita, condiciones de pago y pedido mínimo.

Desde la ficha, toca "Asignar productos": busca o filtra por categoría y marca los productos que le compra a ese proveedor.

Para cada producto, define la unidad de pedido (unidad, caja de N, monto) si todavía no la tenía.

### Flujo 6: actualización de precios por aumento del proveedor

El proveedor avisa un aumento del 12%.

El dueño va a "Precios" → "Aumento masivo", elige el proveedor y aplica +12% al costo.

Elige "mantener el markup actual" (el precio también sube 12%) o "subir solo el costo".

Revisa la vista previa (precio anterior → nuevo, con redondeo) y confirma.

Los cambios quedan registrados en el log de auditoría.

### Flujo 6b: ajuste manual del markup recomendado

El dueño abre "Precios" y ve en "Alfajor Jorgito": "Recomendado: 38% · Aplicado: 38%".

Como sabe que ese producto se vende igual con más margen, toca el markup, escribe 45% y confirma; el precio se recalcula con el redondeo configurado y la ficha muestra "Aplicado: 45% (manual)".

A fin de mes el recálculo del PRD de precios genera una recomendación nueva (40%): el sistema no toca su 45% y le muestra la sugerencia.

El dueño decide: la ignora (sigue en 45%) o toca "Aplicar recomendación" (pasa a 40% y vuelve a seguir las recomendaciones).

Cada cambio queda en el log de auditoría con valor anterior y nuevo, usuario, fecha y hora y origen.

### Flujo 7: registro de egresos (venta, rotura, vencimiento)

El empleado escanea o busca el producto.

Toca "Egreso", elige el motivo (venta, rotura, vencimiento, consumo interno) e ingresa la cantidad.

Confirma; el stock baja y el movimiento queda en el historial. Si el stock queda en el umbral o por debajo, se genera la alerta.

Si el motivo es venta, se aplica la lógica de venta de F2.10 (importe, ganancia, usuario y hora); para vender seguido se usa el Modo venta (Flujo 8).

### Flujo 8: venta por escaneo y respaldos (cámara y búsqueda manual)

El empleado abre "Vender" (Modo venta) en la PC del mostrador o en el celular.

Lector (principal): escanea el producto con el lector láser/USB; el sistema muestra foto, nombre, precio y stock.

Si el lector falla o no lee: toca "Escanear con cámara" en el celular y apunta al código (escaneo en vivo); el producto aparece igual que con el lector.

Si tampoco lee: toca "Buscar" (o empieza a escribir) y tipea la descripción ("coca 500") o los números del código que se ven; aparecen coincidencias mientras escribe.

Elige el producto correcto de la lista (con el mouse o con flechas + Enter).

Ingresa la cantidad (por defecto 1) y confirma.

El sistema descuenta el stock, suma el importe al total de ventas, calcula la ganancia y registra el movimiento con usuario, fecha, hora y método (lector, cámara o búsqueda manual). Muestra "Vendido 2 Coca-Cola 500 ml — $2.800. Stock: 8" y queda listo para la siguiente venta.

Si no encuentra el producto por texto, puede pasar a la búsqueda por foto (Flujo 9) o crear el producto (Flujo 2, paso 6).

### Flujo 9: venta de respaldo por foto (app móvil, P1)

En el celular, desde "Vender", el empleado toca "Buscar por foto"; se abre la cámara.

Fotografía el producto (de frente, con el código visible si lo tiene).

El sistema intenta decodificar el código de barras desde la foto; si lo encuentra, muestra ese producto.

Si no hay código legible, compara la foto con las fotos del catálogo y muestra los 3 a 5 productos más parecidos con su foto, precio y confianza.

El empleado elige el correcto (o toca "Ninguno" y pasa a la búsqueda manual del Flujo 8, paso 4).

Ingresa la cantidad y confirma; la venta se registra exactamente como en el Flujo 8, paso 7, con método "foto".

Opcionalmente acepta guardar la foto como foto adicional del producto para mejorar el reconocimiento.

### Flujo 10: el comerciante investiga un número de stock dudoso

El dueño cuenta la góndola y ve 6 chocolates Águila, pero el sistema dice 18; sospecha que el sistema "está mal".

Abre la ficha del producto y toca "Ver trazabilidad".

Ve la línea de tiempo con saldo corrido y el resumen: "stock inicial 0 + ingresos 72 − ventas 50 − roturas 4 = 18". La cuenta cierra: el número del sistema es la suma exacta de los movimientos registrados.

Filtra los últimos 7 días y ve, entre otros, una carga de "+24 (1 caja)" del martes a las 9:12, hecha por Juan desde la app móvil (origen "cámara del celular", dispositivo "Celular de Juan").

Toca "Stock al momento" para ver el stock reconstruido antes y después de esa carga, y lo compara con el remito del proveedor: el remito dice 12 unidades, no una caja de 24.

Filtra por tipo "egreso por venta" y comprueba que las ventas de la semana coinciden con lo que recuerda; no hay movimientos que no sepa explicar.

Para corregir la carga errónea, toca "Corregir" sobre ese movimiento: crea un movimiento compensatorio de -12 con motivo "remito decía 12, no una caja" que queda vinculado al original (el original no se modifica).

La diferencia restante (18 − 12 = 6, que coincide con el conteo) queda explicada. Si hubiera quedado una diferencia sin explicar (posible venta no registrada o faltante), la registra como "ajuste manual" con motivo y queda en el historial.

(P1) Si tiene activa la cadena de hashes, ve "Integridad verificada": ningún movimiento fue alterado ni borrado.

Exporta la trazabilidad filtrada (CSV o PDF, Flujo 11) para hablar con Juan o con el proveedor con los datos en la mano.

### Flujo 11: exportar el historial de movimientos a PDF

El dueño abre el historial general (o "Ver trazabilidad" de un producto) y toca "Exportar".

Elige alcance: historial completo o filtrado (producto, rango de fechas, tipo de movimiento, usuario, origen); los filtros que ya tenía aplicados en pantalla vienen precargados.

Elige formato PDF (o CSV/Excel) y ve un resumen previo: cantidad de movimientos incluidos y período.

Toca "Generar PDF". Si el rango es chico, el PDF se descarga en el momento; si es grande, el sistema lo genera en segundo plano y le avisa en la app (y, opcionalmente, por email) cuando está listo para descargar.

El PDF muestra el nombre del comercio, la fecha y hora de generación y quién lo generó, los filtros aplicados, el detalle de movimientos, el resumen de totales y (P1, si la cadena de hashes está activa) el código de verificación.

Lo guarda, lo imprime o lo comparte (por ejemplo, por WhatsApp o email) para su registro, un reclamo o una auditoría. La exportación queda registrada en el log de auditoría.

(P1) Más adelante, cualquiera con acceso al comercio puede ingresar el código de verificación del PDF en "Verificar reporte" y comprobar que los movimientos no cambiaron.

### Flujo 12: un empleado nuevo encuentra un producto en el local

(Antes, una sola vez) El dueño va a "Ubicaciones", crea "Heladera A", "Heladera B", "Góndola B" y "Depósito", y asigna cada producto a su ubicación desde el listado (asignación masiva) o desde la ficha, con una nota de estante si hace falta.

Es el primer día de un empleado nuevo. Un cliente pide "una Cindor chica".

El empleado escribe "cindor" en la búsqueda (web en la PC del mostrador o búsqueda de texto en el celular) y ve el resultado "Cindor 200 ml · Heladera B · estante de arriba", con foto y precio.

Va a la Heladera B, toma el producto y lo escanea con el lector (o con la cámara del celular); la confirmación de venta vuelve a mostrar la ubicación, ingresa la cantidad y confirma la venta (Flujo 8).

Si el producto no tiene ubicación, ve "Sin ubicación"; al final del turno el dueño lo ve en la lista de productos sin ubicación y se la asigna.

Si el dueño reorganiza el local y mueve las bebidas a "Heladera A", cambia la ubicación de esos productos; el cambio queda en el historial ("Heladera B → Heladera A", con usuario, fecha y hora) y el empleado ya ve la ubicación nueva en la próxima búsqueda.

(P1) Para reponer, el empleado abre la "lista por ubicación", recorre el local de heladera en heladera y ve qué productos de cada ubicación están bajos.

### Flujo 13: alta del dueño con Google

El dueño entra a la landing y toca "Probar gratis" → "Iniciar sesión con Google".

Se abre la pantalla de Google: elige su cuenta (o la ingresa) y completa la verificación en 2 pasos si la tiene activada.

Google le muestra el consentimiento con los permisos mínimos (ver su nombre, email y foto de perfil); acepta.

Vuelve al sistema: como es la primera vez y no tiene invitación, el sistema crea su usuario (ID de Google, email, nombre) en la base de control y le pide los datos del comercio (nombre, rubro).

Se aprovisiona la base del comercio (F8.1), se crea su membership con rol Dueño y entra al asistente de bienvenida (Flujo 1, paso 3). Queda con una sesión iniciada en ese dispositivo.

En otro dispositivo (por ejemplo, la PC del mostrador) vuelve a tocar "Iniciar sesión con Google" con la misma cuenta y entra directo a su comercio.

### Flujo 14: invitación y primer ingreso de un empleado

El dueño va a "Usuarios" → "Invitar empleado", escribe el email de Gmail (o de Google Workspace) del empleado y confirma; la invitación queda "Pendiente".

El empleado recibe el email "Te invitaron a Kiosco La Esquina" y toca "Aceptar invitación".

Toca "Iniciar sesión con Google" y entra con la cuenta de ese email.

El sistema verifica que el email de Google coincida con el invitado, vincula su cuenta de Google a la invitación, crea su membership con rol Empleado y la invitación pasa a "Aceptada".

El empleado entra a la app con acceso limitado: ve productos, precios de venta y ubicaciones, puede vender y cargar mercadería, pero no ve costos, usuarios ni suscripción.

Las próximas veces entra con "Iniciar sesión con Google" sin necesitar la invitación; al terminar el turno en un dispositivo compartido toca "Cerrar sesión".

Si el empleado deja de trabajar en el comercio, el dueño toca "Revocar acceso": sus sesiones se cierran en el momento y ya no puede entrar. Si el empleado perdió su cuenta de Google, el dueño revoca la anterior y lo vuelve a invitar con la cuenta nueva.

### Flujo 15: devolución de un producto por un cliente

Un cliente vuelve con 1 de las 3 Coca-Cola 500 ml que compró hace un rato y pide que le devuelvan la plata.

El empleado abre "Vender" → "Devolución" y busca la venta: escribe el número del ticket, la elige en "Ventas recientes" o escanea la botella (lector o cámara) y elige la venta correcta entre las recientes con ese producto.

El sistema muestra la venta #1050: 3 × Coca-Cola 500 ml a $1.400, pagada con QR, hecha a las 17:42 por Juan; saldo devolvible 3.

El empleado elige la línea, ingresa cantidad 1 y el motivo ("cliente se arrepintió"). Si la botella está abierta o dañada, marca "No apto para venta" y elige el motivo.

El sistema muestra el resumen: stock +1 (o merma si no es apta), reintegro $1.400 y ganancia revertida $400. El empleado elige libremente el medio del reintegro (por defecto se muestra como referencia QR, el medio de la venta; el cliente prefiere efectivo y lo elige sin dar ningún motivo).

Confirma. En una sola transacción se registran la devolución vinculada a la venta (y, si no es apta, el egreso por merma), la reversión de la ganancia y el egreso en la caja "Devoluciones a clientes" con el medio elegido (efectivo) vinculado a la venta, con ese medio registrado y auditado en el movimiento de caja; el empleado hace el reintegro al cliente por ese medio.

La venta #1050 queda con "Devuelto: 1 de 3" y la devolución aparece en el historial y en "Ver trazabilidad" del producto con usuario, fecha y hora, origen y dispositivo.

El empleado no necesita autorización del dueño para registrar la devolución (F10.9); solo si el dueño le restringió ese permiso, la opción no aparece y la devolución la registra el dueño (o un empleado con permiso).

### Flujo 16: un día completo de operación solo con el celular

A la mañana, la dueña abre la app instalada en su celular (no tiene PC ni lector) y abre la caja.

Llega el preventista: en "Cargar mercadería" escanea cada caja con la cámara del celular y confirma cantidades; un producto nuevo lo crea en el momento con foto y ubicación.

Durante el día vende desde "Vender": escanea con la cámara; si un código no lee, lo busca por texto. Si se corta internet, sigue vendiendo offline y la app sincroniza sola al volver la conexión.

Registra una rotura y una devolución de un cliente desde el mismo celular.

Al ver alertas de stock bajo, arma el pedido al proveedor y lo envía por WhatsApp; más tarde lo marca como pagado y la caja registra el egreso.

Fotografía la factura del proveedor y la registra (según el PRD de facturas de proveedores).

A la noche cierra la caja, revisa "Ver trazabilidad" de un producto que le generó dudas y exporta el historial del día a PDF para guardarlo.

(Opcional) Si después compra un lector Bluetooth, lo empareja con el celular y la venta pasa a usarlo como método principal sin cambiar nada más.

### Flujo 17: recepción de mercadería con vencimiento por lote

Llega el preventista de lácteos. El empleado abre "Cargar mercadería" en el celular (o en la PC con el lector).

Escanea un "Yogur Ser 190 g" (producto con "controla vencimiento" activo); el sistema muestra el producto, sus lotes actuales y pide cantidad y fecha de vencimiento.

Ingresa 12 unidades y elige la fecha con el selector rápido ("14/10"); como trae otra tanda con otra fecha, toca "Agregar otro lote" y carga 12 con vencimiento 21/10.

Confirma; se crean (o se suman) los lotes con origen "escáner" y fecha de recepción, y los ingresos quedan en el historial con su lote. Para el siguiente producto del mismo lote la fecha queda recordada.

Si la mercadería viene de un pedido (P1, recepción contra lo pedido) o de una factura del proveedor fotografiada para el bot, el mismo paso de fecha por lote aparece en cada línea que controla vencimiento.

Durante el día, cada venta descuenta automáticamente del lote del 14/10 (FEFO) sin que nadie elija el lote.

### Flujo 18: alerta de vencimiento, promo y baja de lo vencido

A la mañana, la dueña ve en el inicio "3 productos por vencer" junto a las alertas de stock bajo.

Abre el panel "Por vencer": "Yogur Ser 190 g · 8 u. · vence en 7 días · $8.000 a costo".

El bot de WhatsApp le sugiere una promo para ese lote ("2x1 o 25% off hasta el 14/10", según el PRD de Rotación); ella la acepta y ajusta el precio, y el cambio queda en el log de auditoría.

El 14/10 el lote pasa a "Vencido" y deja de usarse para vender; quedan 2 unidades.

Desde la alerta toca "Dar de baja", confirma la cantidad (2) y el sistema registra el movimiento "Vencido −2" (merma a costo) vinculado al lote, con su usuario, fecha y hora, origen y dispositivo.

En "Ver trazabilidad" del producto ve la recepción del lote, las ventas FEFO y la baja por vencimiento, y la cuenta cierra.

### Flujo 19: conteo guiado de un sector (Heladera A)

El martes a la tarde, el inicio de la app sugiere "Hoy toca contar: Heladera A" (cronograma rotativo opcional). Juan, empleado, toca "Contar ahora" en su celular.

El sistema registra el inicio del conteo y muestra los productos de la Heladera A con foto y nota de estante.

Juan escanea cada producto con la cámara (o lo busca por texto si el código no lee) y carga la cantidad; si encuentra un producto que no pertenece a la heladera, lo cuenta y lo mueve a este sector.

Mientras cuenta entra un cliente y se venden 2 Coca-Cola desde la PC del mostrador; el sistema las tiene en cuenta al comparar.

A mitad del conteo se corta internet: Juan sigue contando offline. Lo llaman al mostrador, pausa el conteo y lo retoma media hora después.

Termina y toca "Enviar a revisión". Como empleado, no puede confirmar ajustes.

La dueña abre el conteo: ve 22 productos sin diferencia, un faltante de 3 yogures (−$2.400 a costo) y un sobrante de 1 agua. Pide recontar los yogures; Juan confirma 6.

La dueña elige el motivo de cada diferencia y toca "Confirmar ajustes": se generan los movimientos "ajuste por conteo" con motivo, quién contó, quién confirmó, fecha y hora, origen y dispositivo, vinculados al conteo.

A fin de mes revisa el reporte de diferencias por sector y ve que la Heladera A concentra la merma; lo exporta a PDF.

Ningún día el sistema le exige contar: el conteo es opcional y por sector, no un arqueo diario.

Continúa en la Parte 3: notas técnicas, métricas, riesgos, roadmap, temas futuros y glosario.
