> Origen: `PRD - Modo Offline para Sistema de Inventario.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/offline/`, `src/pages/api/sync/*`, `src/lib/outbox.ts`

---

# PRD - Modo Offline para Sistema de Inventario

Principio rector (no negociable): todo el sistema se opera al 100% desde un celular, sin computadora en el kiosco. La app en el celular hace las ventas (escaneo con la cámara), el stock, la caja, las facturas de proveedores y todos los demás módulos, con y sin conexión, con una base SQLite local en el celular para el modo offline. El lector láser/USB y la PC son accesorios opcionales; un lector Bluetooth (modo teclado HID) emparejado al celular también es una opción. Ninguna funcionalidad de este PRD puede depender de tener una PC.

Alcance respecto del PRD principal: el PRD principal (6.2) prevé para el MVP "offline de solo lectura + cola de movimientos simple" y "offline completo con resolución de conflictos" en P1. Este PRD detalla ese offline y propone adelantar al MVP la venta, el stock y la caja offline (ver 4.0), porque con el principio "solo celular" un corte de datos móviles no puede frenar el mostrador. La actualización del PRD principal queda como pregunta abierta (7.2); este documento no lo modifica.

Nota sobre datos externos: lo marcado [a verificar] (soporte de OPFS, Background Sync y almacenamiento persistente en Safari iOS y Chrome Android, cuotas de almacenamiento, builds cifradas de SQLite WASM, plantillas de WhatsApp) debe confirmarse en la documentación oficial y con pruebas en dispositivos reales antes de implementar.

## 1. Resumen / visión general

### 1.1 Problema

En los kioscos y comercios chicos de Argentina la conexión falla seguido: el Wi-Fi del local se cae, los datos móviles se cortan en horas pico o el abono se queda sin saldo, y en muchos barrios la señal es mala. Un sistema que "vive en la nube" y se cuelga cuando no hay internet es inaceptable en el mostrador: el cliente está esperando, el comerciante vuelve al cuaderno y esa venta nunca llega al sistema, con lo que el stock y la caja dejan de coincidir con la realidad.

Además, la mayoría de estos comercios no tiene una computadora en el mostrador: tiene el celular del dueño (y a veces el de un empleado). Si el modo offline solo funcionara en una PC, no le serviría a casi nadie.

### 1.2 Visión

Que el comerciante no se entere de que se cortó internet, salvo por un indicador discreto. Sin conexión, la app (en el celular o en la PC) sigue:

Vendiendo por escaneo: con la cámara del celular (método principal cuando no hay accesorios), con un lector Bluetooth emparejado al celular, con el lector láser/USB de la PC si lo hay, o con la búsqueda de texto sobre el catálogo guardado en el dispositivo.

Descontando el stock localmente.

Registrando los cobros en la caja con los cinco medios de pago.

Cuando vuelve la conexión, todo lo que se hizo offline se sincroniza solo, sin que el comerciante toque nada, sin perder ni duplicar ningún movimiento, y con la misma trazabilidad inmutable que una operación online. El bot de WhatsApp, que vive en la nube, sigue contestando con los últimos datos sincronizados (avisando que pueden estar desactualizados) y, al volver la conexión, manda un solo mensaje con lo que quedó pendiente.

### 1.3 Propuesta de valor

"Se cortó internet y seguís vendiendo desde el celular. Cuando vuelve, todo se sincroniza solo y nada se pierde."

### 1.4 Principio "solo celular"

## 2. Objetivos y no-objetivos

### 2.1 Objetivos

### 2.2 No-objetivos (fuera de alcance, al menos en el MVP)

Garantizar estrictamente que no haya sobreventa entre varios dispositivos offline: no es posible sin conexión entre ellos (ver OF6.6). Se mitiga y se marca, no se bloquea.

Sincronización directa entre dispositivos sin internet (Wi-Fi local, Bluetooth entre celulares): P2, a evaluar.

Bot de WhatsApp con datos offline del comercio: el bot vive en la nube y solo ve lo sincronizado (ver OF12).

Verificar cobros electrónicos sin conexión: con el kiosco offline no se puede confirmar que entró un pago por Mercado Pago, QR o transferencia; se registra lo que declara el comerciante y se asocia el comprobante después (C13 del PRD de Caja).

Arqueo diario, online u offline: no hay arqueo diario; la entrega de turno (Caja C17) es opcional, cuenta solo efectivo y funciona offline (ver OF16.2).

Acciones sensibles del dueño sin conexión (cambios de precio y costo, usuarios, reversiones, configuración; ver OF9.5).

Edición o borrado de movimientos, offline incluido: siguen siendo inmutables; las correcciones son compensatorios.

Una app nativa separada para el MVP: es la misma PWA Astro; un envoltorio nativo (Capacitor) es una opción a evaluar (6.3).

## 3. Usuarios

### 3.1 Dueño/a (rol Dueño)

Opera desde su celular, muchas veces sin PC. Quiere que la venta no se frene nunca y confiar en que, cuando vuelva internet, los números cierren. Es quien recibe las alertas por el bot y resuelve los casos marcados (stock negativo, productos duplicados, operaciones en cuarentena). Las acciones sensibles (precios, costos, usuarios, reversiones) las hace con conexión.

### 3.2 Empleado/a (rol Empleado)

Vende desde su celular o desde un celular compartido del comercio. No tiene que entender qué es "sincronizar": solo ve el indicador y sigue vendiendo. Tiene los mismos permisos que online (F8.8 del PRD principal); offline no gana permisos.

### 3.3 Dispositivo compartido del comercio

Celular (o PC) del local usado por varias personas. Requiere base local cifrada, cambio de usuario rápido y cierre de sesión que no pierda la cola pendiente (OF14).

### 3.4 Administrador de la plataforma

Monitorea desde el Control Plane los dispositivos con sincronización atrasada, huecos de secuencia, operaciones rechazadas y versiones de app viejas, sin acceso para editar movimientos.

## 4. Funcionalidades

### 4.0 Priorización

### OF1. Operación 100% desde el celular (P0, transversal)

Descripción: el celular es el dispositivo principal y suficiente del sistema. La PC y los lectores son accesorios. Este requerimiento es transversal a todos los PRD del producto: ningún flujo puede exigir una PC.

### Requerimientos:

OF1.1 Cobertura completa: todas las funcionalidades P0 de todos los módulos (inventario F1 a F10, caja C1 a C14, facturas de proveedores, consumos de servicios, órdenes de pago y la configuración del bot) tienen pantallas usables en un celular de 360 px de ancho, con botones grandes para el mostrador. Lo que antes se pensó "para pantalla grande" (historial con filtros, pedidos, reportes, configuración) se adapta al celular aunque en la PC sea más cómodo.

OF1.2 La cámara es el escáner principal cuando no hay accesorios: en el celular, la pantalla de venta abre directamente el escaneo en vivo con la cámara (F2.1 del PRD principal), con lectura continua, linterna y feedback por vibración y sonido. La jerarquía de F2.0 del PRD principal se mantiene cuando hay lector; si no lo hay, la cámara pasa a ser el método 1.

OF1.3 Lector Bluetooth HID emparejado al celular (opcional): la app detecta la entrada rápida terminada en Enter igual que el lector USB (F2.2), sin abrir el teclado en pantalla (campo con inputmode="none" mientras el lector está activo). Opción "Tengo un lector Bluetooth" en la configuración del dispositivo.

OF1.4 Offline también en el celular: el modo offline completo (OF2 a OF15) funciona en el celular con una base SQLite local (ver 6.3). No hay ninguna funcionalidad offline que exista solo en la PC.

OF1.5 Rendimiento en gama media: los objetivos de rendimiento (F2 y 6.9 del PRD principal) se miden en un Android de gama media y en un iPhone de al menos 4 años de antigüedad, no en una PC.

OF1.6 Instalación: la PWA se instala en la pantalla de inicio desde el navegador del celular con una guía de un paso ("Agregar a pantalla de inicio"); la instalación es requisito del modo offline robusto en iOS (ver 6.3, [a verificar]).

### Criterios de aceptación:

☐ Un comercio sin ninguna PC completa con un solo celular: alta con Google, carga de 20 productos escaneando con la cámara, apertura de caja, 10 ventas, un pago a proveedor, la foto de una factura de proveedor, el cierre de caja y la vinculación del bot.

☐ El mismo recorrido funciona en Android (Chrome) y en iOS (Safari, PWA instalada).

☐ Ninguna pantalla P0 de ningún módulo muestra el mensaje "Usá una computadora" ni requiere scroll horizontal en 360 px.

☐ Sin lector conectado, abro "Vender" en el celular y la cámara ya está escaneando; leo un EAN-13 en menos de 2 segundos con buena luz.

☐ Emparejo un lector Bluetooth al celular, escaneo un código y el producto aparece para vender sin que se abra el teclado en pantalla.

☐ Con el celular en modo avión, hago una venta por cámara y un cobro en la caja sin ningún error.

### OF2. Venta offline (P0)

Descripción: sin conexión, la venta funciona igual que online (F2.10 y F2.11 del PRD principal): se identifica el producto, se ingresa la cantidad, se confirma, se descuenta el stock y se registra el cobro.

### Requerimientos:

OF2.1 Métodos de identificación offline: cámara del celular (escaneo en vivo), lector Bluetooth HID, lector láser/USB y búsqueda manual de texto, todos resueltos contra el catálogo local (OF3). La búsqueda por foto (F2.13, P1) no está disponible offline en el MVP; el botón se muestra deshabilitado con "Necesita conexión".

OF2.2 Misma confirmación, mismo resultado: la venta offline pasa por la misma confirmación que la online. Se guarda en una única transacción local: el movimiento "egreso por venta", el ingreso en la caja (si el módulo está activo) y las entradas de la cola de sincronización (OF4). Si la transacción local falla, no queda nada a medias.

OF2.3 Precio: se cobra el precio de venta vigente en el catálogo local. El importe cobrado queda congelado en la venta (es lo que pagó el cliente). Si al sincronizar el precio del servidor era otro, la venta no se modifica: queda marcada "vendida con precio desactualizado" para el reporte de diferencias (ver 6.6).

OF2.4 Ganancia: el costo unitario lo calcula el servidor al sincronizar, con el costo vigente a la hora del dispositivo de la venta (según el log de auditoría de costos, F3.5), porque el rol Empleado no tiene costos en el dispositivo (F8.8). Hasta sincronizar, la ganancia de las ventas offline se muestra "pendiente".

OF2.5 Stock local: al confirmar, el stock mostrado en el dispositivo baja de inmediato (stock local = último stock conocido del servidor + movimientos locales pendientes, ver OF6.3).

OF2.6 Stock en cero o negativo: si el stock local llega a 0 o menos, la venta no se bloquea (el producto está físicamente en el mostrador); se muestra un aviso "El stock registrado de este producto ya estaba en 0" y el movimiento se marca para revisión (OF6.6).

OF2.7 Origen: el movimiento guarda el origen y el método de identificación como online (F3.7: cámara del celular, lector láser/USB, búsqueda de texto; para el lector Bluetooth, origen "lector láser/USB" con device_info "BT") y además la marca offline = true.

OF2.8 Ticket: el número de ticket offline es provisorio (prefijo del dispositivo + correlativo local, ej. "C2-0045"); al sincronizar se asigna el número definitivo y se conserva el provisorio como referencia buscable.

### Criterios de aceptación:

☐ En modo avión, escaneo con la cámara un producto con precio $1.400 y stock local 10, vendo 2 y el stock local queda en 8, el total de ventas del día sube $2.800 y la caja suma $2.800 en el medio elegido.

☐ En modo avión, busco "alfajor jorjito" y aparece "Alfajor Jorgito" en menos de 300 ms con 5.000 productos en el catálogo local.

☐ La venta offline muestra "Ganancia: pendiente" hasta sincronizar; después muestra la ganancia calculada con el costo vigente a la hora de la venta.

☐ Cierro la app a la fuerza justo después de confirmar una venta offline; al reabrirla la venta sigue ahí y en la cola.

☐ Vendo un producto con stock local 0: la venta se registra, veo el aviso y el movimiento queda marcado para revisión.

☐ El botón "Buscar por foto" aparece deshabilitado con "Necesita conexión" mientras estoy offline.

☐ El ticket provisorio "C2-0045" sigue encontrándose en la búsqueda de ventas después de sincronizar.

### OF3. Catálogo local (P0)

Descripción: copia en el dispositivo de lo necesario para vender y buscar sin conexión.

### Requerimientos:

OF3.1 Contenido: productos activos (nombre, códigos de unidad y caja con multiplicador, precio de venta, unidades por caja, umbral, ubicación y nota de ubicación, F9), último stock conocido del servidor con su hora, medios de pago y categorías de la caja, jornada actual (apertura) y datos del usuario y sus permisos. Los costos solo se guardan si el usuario tiene permiso para verlos.

OF3.2 Miniaturas: foto miniatura de cada producto (aprox. 15 a 25 KB, WebP) para la confirmación visual; las fotos grandes no se precargan en el MVP.

OF3.3 Actualización incremental: con conexión, el dispositivo baja solo los cambios desde su último cursor (pull, ver 6.4), al abrir la app, al volver la conexión y cada pocos minutos mientras está online. Un cambio de precio hecho en otro dispositivo llega al resto en menos de 2 minutos con conexión.

OF3.4 Índice de búsqueda local: búsqueda difusa por nombre (sin tildes ni mayúsculas, tolerante a errores) y por código exacto y parcial, con la misma lógica que la búsqueda del servidor (6.10 del PRD principal).

OF3.5 Primera carga: al instalar o iniciar sesión en un dispositivo nuevo, la app descarga el catálogo completo y muestra "Preparando el modo sin conexión (70%)". Hasta completarlo, el indicador lo advierte ("El modo sin conexión todavía no está listo").

OF3.6 Antigüedad: cada dato muestra, si se pide, desde cuándo no se actualiza ("Precios actualizados hace 3 h").

OF3.7 Entidades nuevas de v1 en el catálogo local (ver OF16): clientes de fiado con su saldo conocido del servidor (con su hora), tope y estado (solo si el usuario puede vender a cuenta o cobrar fiado); estado del turno en curso y de la última entrega (para recibir, rechazar o entregar sin conexión); conteos por sector en curso con sus líneas; promociones y combos vigentes y los que empiezan en los próximos 7 días, con su versión (RT12.9 del PRD de Rotación); lotes activos de los productos que controlan vencimiento (cantidad, vencimiento y días restantes; el costo del lote solo con permiso de costos).

### Criterios de aceptación:

☐ Con un catálogo de 5.000 productos, la primera carga completa (sin fotos grandes) termina en menos de 60 s en 4G.

☐ El dueño cambia un precio desde su celular; el celular del empleado, con conexión, ve el precio nuevo en menos de 2 minutos sin recargar.

☐ Un empleado sin permiso de costos no tiene costos en la base local (verificado inspeccionando la base local en una prueba).

☐ Si un dispositivo nuevo no terminó la primera carga y se corta internet, el indicador lo dice claramente.

### OF4. Cola de sincronización (outbox) y sincronización automática (P0)

Descripción: toda operación hecha offline (y también online, para unificar el camino) se guarda primero en una cola durable en el dispositivo y se envía al servidor. Cuando vuelve la conexión, la cola se vacía sola, sin ninguna acción del comerciante.

### Requerimientos:

OF4.1 Cola durable: cada operación (venta, ingreso de mercadería, egreso, movimiento de caja, apertura, cierre manual, alta de producto, foto) se escribe en la tabla local outbox en la misma transacción que el cambio local. Sobrevive a cerrar la app, reiniciar el celular y quedarse sin batería.

OF4.2 Identidad de cada operación: cada operación lleva un UUID generado en el dispositivo (op_id), que se usa como idempotency_key del movimiento en el servidor, y un número de secuencia por dispositivo (device_seq, correlativo sin huecos).

OF4.3 Entrega al menos una vez con deduplicación en el servidor: el dispositivo reenvía hasta recibir confirmación; el servidor aplica cada op_id una sola vez y, ante un reenvío, devuelve la misma respuesta que la primera vez. Nunca se borra una operación de la cola sin confirmación del servidor.

OF4.4 Orden y dependencias: las operaciones se envían en orden de device_seq; las que dependen de otra (una venta de un producto creado offline) esperan a que la anterior se confirme.

OF4.5 Disparadores automáticos: evento de conexión recuperada, apertura o vuelta al primer plano de la app, temporizador mientras haya pendientes (con espera creciente: 5 s, 15 s, 1 min, 5 min) y, donde la plataforma lo permita, sincronización en segundo plano (P1, [a verificar] en iOS).

OF4.6 Sin acción del comerciante: no existe un botón obligatorio "Sincronizar". Hay un "Reintentar ahora" opcional dentro del detalle del indicador (OF5).

OF4.7 Resultado por operación: confirmada, duplicada (ya estaba, se trata como confirmada), rechazada (con motivo legible, ej. "producto archivado") o en cuarentena (aceptada pero pendiente de revisión del dueño, ej. usuario revocado, OF9.6). Una operación rechazada o en cuarentena nunca se descarta en silencio: queda visible para el dueño con su detalle.

OF4.8 Detección de huecos: el servidor registra el último device_seq contiguo recibido por dispositivo; si falta un número (hueco) por más de 24 h, genera una alerta interna y un aviso al dueño ("El Celular de Juan tiene operaciones sin enviar desde el 09/10 18:05").

OF4.9 Lotes: envío en lotes (por ejemplo, 50 operaciones) para que 500 ventas acumuladas se sincronicen en segundos sin bloquear la venta en curso.

OF4.10 Cola también online: con conexión, la operación igual pasa por la cola y se envía de inmediato; así hay un solo camino de escritura y un corte en medio de una venta no deja estados raros.

### Criterios de aceptación:

☐ Hago 30 ventas offline, reinicio el celular, recupero la conexión y las 30 llegan al servidor una sola vez, sin tocar nada.

☐ Simulo que el servidor guarda una operación pero la respuesta se pierde; el dispositivo la reenvía y el servidor no crea un segundo movimiento (test automático).

☐ Creo un producto offline y vendo 3 unidades; al sincronizar, el producto se crea antes que la venta y la venta queda vinculada al producto definitivo.

☐ Si el servidor rechaza una operación, el dueño la ve en "Operaciones con problemas" con el motivo y el dato original; no desaparece.

☐ Mientras se sincronizan 500 operaciones puedo seguir vendiendo sin demoras perceptibles.

☐ Un hueco de secuencia simulado genera la alerta al dueño y al Control Plane.

### OF5. Indicador de estado de conexión y sincronización (P0)

Descripción: un indicador siempre visible, chico y claro, para que el comerciante sepa en qué estado está sin tener que entenderlo técnicamente.

### Requerimientos:

OF5.1 Estados:

En línea (punto verde): todo sincronizado.

Sin conexión (gris/ámbar): "Sin conexión · 12 pendientes". La app sigue funcionando.

Sincronizando (azul animado): "Sincronizando 8 de 12".

Con problemas (rojo): hay operaciones rechazadas o en cuarentena, o la sincronización falla repetidamente.

OF5.2 Contador de pendientes siempre visible cuando es mayor a 0.

OF5.3 Detalle al tocar: última sincronización exitosa ("hace 2 min"), pendientes por tipo (ventas, caja, productos, fotos), antigüedad del catálogo, espacio usado (OF14) y "Reintentar ahora".

OF5.4 Conexión real, no solo "hay Wi-Fi": el estado "En línea" se basa en que el servidor responda (ping liviano a /api/health), no solo en navigator.onLine, que puede decir "online" con un Wi-Fi sin internet.

OF5.5 Avisos no intrusivos: el cambio a "Sin conexión" muestra un aviso breve ("Sin conexión: podés seguir vendiendo") una sola vez; no hay ventanas que bloqueen la venta.

OF5.6 Avisos por tiempo: a las 24 h sin sincronizar, aviso persistente; cerca del límite offline (OF14.1), aviso destacado con cuánto tiempo queda.

### Criterios de aceptación:

☐ Activo el modo avión y en menos de 5 s el indicador pasa a "Sin conexión"; hago 3 ventas y muestra "3 pendientes".

☐ Desactivo el modo avión y el indicador pasa a "Sincronizando" y luego a "En línea" sin que toque nada.

☐ Conectado a un Wi-Fi sin salida a internet, el indicador muestra "Sin conexión", no "En línea".

☐ Toco el indicador y veo la hora de la última sincronización y los pendientes por tipo.

☐ Ningún cambio de estado interrumpe una venta en curso.

### OF6. Consistencia de stock y sobreventa (P0)

Descripción: el stock se modela como suma de movimientos (ya es así en F3.9 del PRD principal). Como sumar es conmutativo, las ventas offline de varios dispositivos se combinan sin que ninguna pise a otra, en el orden en que lleguen. Lo que no se puede garantizar sin conexión entre dispositivos es que el stock nunca quede negativo; eso se acepta, se marca y se avisa.

### Requerimientos:

OF6.1 Ningún dispositivo envía "el stock es X": solo envía movimientos con su cantidad (+/−). El servidor nunca acepta un valor absoluto de stock desde la cola (no existe la operación "poner stock en X" offline; un ajuste manual se envía como movimiento de diferencia calculado sobre el stock conocido, y se marca si el stock del servidor cambió entretanto).

OF6.2 Merge conmutativo (tipo CRDT de contador): el stock del servidor = suma de todos los movimientos, sin importar el orden de llegada. Dos dispositivos que venden el mismo producto offline suman ambos egresos; ninguno se pierde ni sobrescribe al otro.

OF6.3 Stock local: en cada dispositivo, stock mostrado = último stock confirmado por el servidor + movimientos locales aún no confirmados. Al sincronizar, el dispositivo toma el nuevo stock del servidor (que ya incluye sus movimientos y los de otros dispositivos) y recalcula.

OF6.4 Stock anterior y resultante en el servidor: para los movimientos sincronizados, stock_anterior y stock_resultante (F3.1) se calculan en el orden en que el servidor los aplica (orden de recepción), que puede diferir del orden real en los dispositivos. La vista de trazabilidad muestra ambas horas y permite ordenar por hora del dispositivo, aclarando que el saldo corrido oficial es el del servidor.

OF6.5 Sin pérdidas: cola durable (OF4.1), op_id por movimiento (OF4.2), entrega al menos una vez con deduplicación (OF4.3), detección de huecos (OF4.8) y verificación nocturna de que el stock guardado coincide con la suma de movimientos (6.11 del PRD principal).

OF6.6 Sobreventa: qué se garantiza y qué no.

Se garantiza: ninguna venta se pierde, ninguna se cuenta dos veces y el stock final es exactamente la suma de todo lo que pasó.

No se puede garantizar estrictamente "no vender dos veces lo mismo" con varios dispositivos offline: si dos celulares sin conexión ven stock 3 del mismo producto y cada uno vende 2, ninguno puede enterarse del otro; al sincronizar el stock queda en −1. Ningún diseño sin comunicación entre dispositivos lo evita sin bloquear ventas.

Por qué se acepta en vez de bloquear: en un kiosco la venta es de un producto que está físicamente en el mostrador; si se vendió, existía. Un stock negativo indica que el número registrado estaba mal (una carga que no se registró, un error de conteo), no que se le vendió dos veces la misma unidad a dos clientes. Bloquear la venta por un número que ya está mal sería peor.

Cómo se mitiga: (1) sincronización inmediata cada vez que hay conexión, para que los períodos ciegos sean cortos; (2) catálogo y stock refrescados cada pocos minutos online; (3) aviso en el dispositivo al vender con stock local en 0 o menos (OF2.6); (4) límite de duración offline (OF14.1); (5) alerta al sincronizar con el detalle de los movimientos de cada dispositivo para corregir rápido; (6) P2: reserva de stock por dispositivo para productos marcados como críticos (cada dispositivo puede vender offline solo su parte asignada; por encima, avisa).

OF6.7 Marcado y alerta al sincronizar: cuando un lote sincronizado deja un producto con stock negativo, el servidor crea una anomalía de stock (stock_anomalies: producto, stock resultante, movimientos involucrados con su dispositivo y hora, estado abierta/resuelta) y la incluye en la puesta al día del bot (OF13) y en el panel de alertas. El dueño la resuelve con una carga, un ajuste o un compensatorio (F3.8), nunca editando movimientos.

OF6.8 Alertas de stock bajo: el dispositivo calcula offline las alertas de umbral (F4) con su stock local y las muestra en la app; el servidor las recalcula al sincronizar (OF13).

### Criterios de aceptación:

☐ Producto con stock 10. El celular A, offline, vende 3; el celular B, offline, vende 4. Al sincronizar ambos, en cualquier orden, el stock del servidor es 3 y existen los 7 movimientos (test automático con los dos órdenes posibles).

☐ Producto con stock 3. A y B, offline, venden 2 cada uno. Al sincronizar el stock es −1, se crea una anomalía "stock negativo" con los dos movimientos, sus dispositivos y horas, y el dueño la ve en el panel y en el mensaje del bot.

☐ Ninguna venta offline fue bloqueada por el stock.

☐ La suma de los movimientos de cada producto coincide con su stock después de sincronizar varios dispositivos (verificación nocturna sin diferencias).

☐ Un ajuste manual hecho offline llega como movimiento de diferencia; si el stock del servidor había cambiado, el ajuste queda marcado para revisión.

☐ La trazabilidad del producto muestra la hora del dispositivo y la de recepción de cada movimiento y permite ordenar por cualquiera de las dos.

### OF7. Caja offline (P0)

Descripción: la caja (PRD de Caja) funciona sin conexión con los cinco medios de pago, respetando sus reglas: una apertura por jornada, movimientos inmutables, cierre manual o automático a la hora de corte, resumen de cierre como snapshot inmutable, sin arqueo diario (la entrega de turno de C17 es opcional, cuenta solo efectivo y también funciona offline, OF16.2).

### Requerimientos:

OF7.1 Cobros y egresos offline con los cinco medios: Efectivo, Débito, Mercado Pago, QR y Transferencia bancaria (C4). Se guardan localmente y se sincronizan con su idempotency_key (C3.6 del PRD de Caja). El saldo por medio mostrado en el dispositivo es el saldo conocido del servidor + movimientos locales pendientes, rotulado "provisorio" mientras haya pendientes.

OF7.2 Cobros electrónicos sin conexión: con el kiosco offline, el comerciante registra el medio que declara el cliente (Mercado Pago, QR o transferencia; el cliente paga con sus propios datos). El movimiento queda marcado "registrado offline, sin verificar"; al volver la conexión puede asociarse el comprobante como siempre (C13 del PRD de Caja). Débito depende del posnet, que suele tener conectividad propia.

OF7.3 Apertura offline: si no hay apertura de la jornada en el dispositivo, se puede abrir offline (o se abre sola con monto 0 editable al primer cobro, C2.5). Según C2.7 del PRD de Caja, opened_at es la hora del servidor al sincronizar y la hora del dispositivo queda como referencia en la auditoría; la pantalla muestra "Abierta 08:05 (en el dispositivo), registrada 09:40".

OF7.4 Dos aperturas offline de la misma jornada (dos dispositivos): la primera que recibe el servidor es la apertura de la jornada; la segunda queda registrada en la auditoría como "apertura duplicada de otro dispositivo" y sus movimientos se imputan a la jornada existente. Si los montos iniciales difieren, se genera un aviso al dueño para que corrija la apertura (C2.6).

OF7.5 Jornada de los movimientos offline: el servidor imputa cada movimiento offline a la jornada que corresponde a su hora del dispositivo (validada, OF8.4), no a la hora de llegada: una venta de las 23:50 sincronizada a las 00:30 pertenece a la jornada anterior. Si la hora del dispositivo no es confiable (desfasaje fuera de tolerancia), se usa la hora de recepción y se marca.

OF7.6 Cierre automático a la hora de corte con dispositivos offline:

El job de cierre (6.6 del PRD de Caja) corre a la hora de corte como siempre y cierra la jornada a nuevos movimientos (closed_at = hora de corte, close_type = automatico).

Si a esa hora el servidor sabe que hay dispositivos del comercio con operaciones pendientes o sin contacto desde antes del corte (según su último latido, OF12.2), el resumen de cierre no se genera todavía: la jornada queda "cerrada, resumen pendiente de sincronización".

El resumen se genera cuando esos dispositivos sincronizan las operaciones de esa jornada o, como máximo, al vencer el plazo de espera (por defecto, el límite offline de OF14.1). Se guarda como snapshot inmutable igual que siempre, con la marca "tardío" (tardio = true, generado_at, dispositivos esperados) y la aclaración "Resumen calculado al sincronizar el Celular de Juan a las 09:12".

Si no hay dispositivos pendientes, el cierre y el resumen se generan en el momento, exactamente como en el PRD de Caja.

Operaciones offline de una jornada cuyo resumen ya se generó (porque el dispositivo volvió después del plazo de espera) se registran como ajuste posterior al cierre (C12.7): el snapshot no cambia.

OF7.7 Cierre visto desde el dispositivo offline: si el celular está offline a la hora de corte, calcula un cierre provisorio local con su reloj, muestra "Caja cerrada a las 00:00 (provisorio, se confirma al sincronizar)" e imputa las ventas siguientes a la jornada nueva. El cierre oficial es siempre el del servidor.

OF7.8 Cierre manual offline: "Cerrar caja" sin conexión queda en la cola como intención de cierre con la hora del dispositivo. Al sincronizar, si la jornada sigue abierta, el servidor la cierra como manual con closed_at = hora de recepción del servidor (consistente con C2.7/C12.3, que exigen hora del servidor) y la hora del dispositivo en la auditoría; si ya se había cerrado automáticamente, la intención queda en la auditoría y no genera otro cierre (C12.4).

OF7.9 Sin arqueo diario: no hay arqueo diario; la entrega de turno (Caja C17) es opcional, cuenta solo efectivo y funciona offline (C17.22; ver OF16.2). El cierre de la jornada (C12) no pide contar el efectivo salvo el conteo final del último turno cuando las entregas de turno están activadas (C17.19).

OF7.10 Reversiones de movimientos de caja (C7): solo online (acción sensible, OF9.5).

### Criterios de aceptación:

☐ En modo avión registro un cobro de $3.500 por Mercado Pago y uno de $2.000 en efectivo; el saldo provisorio de cada medio los incluye y, al sincronizar, los saldos oficiales coinciden.

☐ Los cinco medios de pago están disponibles offline.

☐ Un cobro por QR hecho offline queda marcado "sin verificar" y, con conexión, puedo asociarle el comprobante.

☐ Abro la caja offline a las 08:05 y sincronizo a las 09:40: la apertura muestra las dos horas y opened_at es la del servidor.

☐ Dos celulares abren la caja offline el mismo día con montos distintos: al sincronizar queda una sola apertura, la otra en la auditoría, y el dueño recibe el aviso.

☐ Hora de corte 00:00. El celular de Juan está offline desde las 22:00 con 15 ventas. A las 00:00 la jornada se cierra sin resumen; Juan sincroniza a las 09:12 y en ese momento se genera el resumen de cierre con las 15 ventas, marcado "tardío", con la explicación.

☐ Una venta offline de las 23:50 sincronizada a las 00:30 queda en la jornada anterior.

☐ Si un dispositivo vuelve después del plazo de espera, sus operaciones de la jornada cerrada aparecen en "Ajustes posteriores al cierre" y el resumen no cambia.

☐ Sin conexión a la hora de corte, el celular muestra el cierre provisorio y las ventas de las 00:10 quedan en la jornada nueva.

☐ Con las entregas de turno desactivadas, en ningún momento la app pide contar el efectivo; con las entregas activadas, solo se cuenta el efectivo en la entrega de turno (C17), nunca stock ni medios electrónicos, y nunca como arqueo diario.

### OF8. Auditoría de operaciones offline (P0; cadena de hashes según F3.11)

Descripción: un movimiento offline tiene la misma trazabilidad que uno online (F3 del PRD principal) más los datos propios de haberse hecho sin conexión.

### Requerimientos:

OF8.1 Dos horas por operación: client_occurred_at (hora del dispositivo al hacer la operación) y created_at (hora de recepción del servidor, timestamptz DEFAULT now(), la hora oficial, como exige F3.7). Se muestran las dos: "hecho 18:05 en el dispositivo, registrado 18:40".

OF8.2 Quién y desde dónde: usuario (y rol al momento de la operación), dispositivo (device_id de la instalación, nombre asignado por el comercio, ej. "Celular de Juan"), origen y método de identificación, igual que online.

OF8.3 Datos propios del offline: offline = true, device_seq, sync_batch_id (lote en el que llegó) y desfasaje de reloj estimado.

OF8.4 Validación del reloj del dispositivo: en cada sincronización el dispositivo envía su hora actual y el servidor calcula el desfasaje. Si supera la tolerancia (por defecto, 5 minutos), las operaciones del lote se marcan "reloj del dispositivo desfasado" y la vista muestra la hora estimada corregida. Una hora del dispositivo en el futuro, o anterior al último contacto del dispositivo con el servidor menos la tolerancia, se considera no confiable.

OF8.5 Cadena de hashes aplicada al sincronizar: si la cadena de hashes está activa (F3.11, P1 en el PRD principal), cada movimiento sincronizado se encadena al insertarse en el servidor, en orden de recepción, con el mismo procedimiento que un movimiento online, e incluye en el hash client_occurred_at, device_id y device_seq. El dispositivo no calcula la cadena oficial.

OF8.6 (P2) Cadena local por dispositivo: cada operación de la cola lleva el hash de la anterior del mismo dispositivo; el servidor verifica la continuidad y detecta operaciones alteradas o eliminadas de la cola local.

OF8.7 Inmutabilidad: las operaciones en la cola local tampoco se editan; un error se corrige con un compensatorio (solo online, OF9.5).

### Criterios de aceptación:

☐ Una venta hecha offline a las 18:05 y sincronizada a las 18:40 muestra las dos horas, el usuario, "Celular de Juan" y "sin conexión".

☐ Con el reloj del celular adelantado 2 horas, las operaciones sincronizadas quedan marcadas "reloj desfasado" y la hora oficial es la del servidor.

☐ (Con la cadena activa) Después de sincronizar 50 movimientos offline, "Verificar integridad" da "Integridad verificada" y los 50 están encadenados en orden de recepción.

☐ El PDF del historial (F3.12) incluye para los movimientos offline la hora del dispositivo y la de registro.

### OF9. Sesión y autenticación offline (P0)

Descripción: las sesiones son del lado del servidor (cookie HttpOnly, F8.11 y 6.12 del PRD principal), así que offline el servidor no puede validarlas. Se agrega un permiso offline limitado en el tiempo para seguir operando sin conexión.

### Requerimientos:

OF9.1 Permiso offline (offline grant): con cada sesión válida y online, el servidor emite un permiso firmado por el servidor y atado al dispositivo: user_id, tenant_id, device_id, rol, permisos, emitido y vence. Se renueva solo mientras hay conexión. No contiene tokens de Google ni el ID de la sesión.

OF9.2 Validez offline limitada: por defecto 72 horas desde la última renovación online (configurable por el dueño entre 24 h y 7 días, dentro del límite de OF14.1). Al vencer, la app pide conectarse para seguir registrando operaciones; lo ya registrado se conserva y se sincroniza igual.

OF9.3 Permisos offline = permisos online: el permiso refleja el rol y los permisos del usuario al emitirse; offline no se gana ningún permiso. El servidor vuelve a validar los permisos de cada operación al sincronizar.

OF9.4 Login nuevo requiere conexión: iniciar sesión con Google, aceptar una invitación o agregar un dispositivo nuevo siempre requiere internet.

OF9.5 Acciones sensibles solo online: cambios de precio y costo, aumento masivo, alta/edición/baja de proveedores, confirmar pedidos y marcarlos pagados, gestión de usuarios e invitaciones, revocaciones, compensatorios de stock, reversiones de caja, corrección de la apertura, cambio de la hora de corte, configuración, exportaciones, suscripción, órdenes de pago, vinculación del bot y, de las funciones nuevas de v1 (OF16): cambiar el tope de fiado de un cliente, dar de baja (incobrable) una deuda de fiado, confirmar los ajustes de un conteo por sector, crear, editar, pausar o cancelar promociones y combos, y corregir la fecha de vencimiento de un lote. Offline, esos botones aparecen deshabilitados con "Necesita conexión".

OF9.6 Revocación mientras el dispositivo estaba offline: si el dueño revocó a un usuario (F8.10), el permiso offline de ese dispositivo deja de valer en cuanto se conecta. Las operaciones que ese usuario hizo offline después de la revocación (según la hora del dispositivo validada) quedan en cuarentena: no se descartan (pueden ser ventas reales con plata real) pero no impactan stock ni caja hasta que el dueño las acepte o rechace. Las anteriores a la revocación se aplican normalmente.

OF9.7 Cerrar sesión con pendientes: si hay operaciones pendientes, "Cerrar sesión" avisa ("Hay 12 operaciones sin sincronizar") y las mantiene en la cola cifrada para enviarlas con el próximo inicio de sesión del mismo usuario o, con conexión, las envía antes de cerrar.

OF9.8 (P1) Cambio de usuario offline en dispositivos compartidos: PIN corto local por usuario (F8.3 del PRD principal) para cambiar de usuario sin conexión; solo para usuarios que ya iniciaron sesión con Google en ese dispositivo y tienen permiso offline vigente.

### Criterios de aceptación:

☐ Inicio sesión online, activo el modo avión y sigo vendiendo durante 2 días sin que me pida volver a entrar.

☐ Con validez de 72 h, a las 72 h sin conexión la app me pide conectarme para registrar nuevas operaciones y no perdí nada de lo ya hecho.

☐ Offline, el botón de cambiar precios aparece deshabilitado con "Necesita conexión".

☐ Un empleado sin permiso de costos tampoco los ve offline.

☐ El dueño revoca a Juan a las 15:00 mientras el celular de Juan está offline; Juan vende a las 14:30 y a las 15:20. Al sincronizar, la de las 14:30 se aplica y la de las 15:20 queda en cuarentena para el dueño; la app de Juan lo saca.

☐ El permiso offline no permite llamar a las APIs del servidor sin una sesión válida.

### OF10. Alta y edición de productos offline (P0 alta mínima / P1 edición)

Descripción: si se escanea un código que no existe estando offline, se puede crear el producto (F2.6 del PRD principal) para no frenar la venta o la carga.

### Requerimientos:

OF10.1 Alta mínima offline: código (precargado), nombre, unidad o caja y unidades por caja, precio (si el usuario tiene permiso de precios) y foto opcional (en cola, OF11). Respeta F2.9: si el empleado no tiene permiso de crear productos, queda "pendiente de revisión".

OF10.2 ID temporal: el producto se crea en el dispositivo con un ID temporal (UUID del dispositivo). Todas las operaciones locales que lo usan (venta, carga, foto) referencian ese ID temporal.

OF10.3 Mapeo al sincronizar: el servidor crea el producto, devuelve el ID definitivo y guarda el mapeo (id_mappings: ID temporal → ID definitivo). Las operaciones dependientes se aplican con el ID definitivo, y el dispositivo reemplaza el ID temporal en su base local.

OF10.4 Duplicados por código: si dos dispositivos crean offline un producto con el mismo código (o el código ya existía en el servidor), al sincronizar el segundo se fusiona con el existente: los dos IDs temporales apuntan al mismo producto definitivo, sus movimientos se suman y el dueño recibe "Producto creado en dos dispositivos: revisá nombre y precio" con los datos de cada uno. El código único por comercio (6.3 del PRD principal) se mantiene.

OF10.5 Precio en el alta offline: si el producto se creó offline con precio y el servidor no tenía ese producto, el precio del alta se toma como inicial. Si el producto ya existía en el servidor, gana el precio del servidor (OF10.7).

OF10.6 (P1) Edición offline de campos no sensibles: nombre, ubicación y nota (F9), umbral y foto, con resolución por campo (último que escribe gana, ver 6.5). Precio, costo, proveedor y archivado no se editan offline (OF9.5).

OF10.7 Precios: gana el servidor. El precio de venta vigente es siempre el del servidor; un dispositivo offline nunca sobrescribe un precio existente.

### Criterios de aceptación:

☐ Offline escaneo un código inexistente, creo "Turrón Misky" con precio $500 y vendo 2; al sincronizar el producto existe con su ID definitivo, el código, el precio y los 2 egresos vinculados.

☐ Dos celulares crean offline el mismo código con nombres distintos; al sincronizar queda un solo producto, con los movimientos de ambos, y el dueño recibe el aviso de revisión.

☐ Si el código ya existía en el servidor con precio $600, el alta offline con $500 no cambia el precio.

☐ Después de sincronizar, buscar el producto en el dispositivo usa el ID definitivo (no quedan referencias al temporal).

### OF11. Fotos en cola (P0)

Descripción: las fotos (de productos, F1.8; de facturas de proveedores, PRD de Facturas) se toman con la cámara del celular aunque no haya conexión y se suben después.

### Requerimientos:

OF11.1 La foto se comprime en el dispositivo como online (máx. 800 px / aprox. 200 KB para productos; para facturas, la resolución que defina el PRD de Facturas para el OCR) y se guarda en el almacenamiento local con su operación en la cola.

OF11.2 Se sube automáticamente al volver la conexión, después de las operaciones de datos (las ventas tienen prioridad sobre las fotos), con reintentos y reanudación.

OF11.3 Mientras no se sube, la miniatura local se muestra en el producto con el ícono "pendiente de subir".

OF11.4 Límite de fotos en cola (OF14.2); al acercarse, aviso. Las fotos subidas se borran del almacenamiento local salvo la miniatura.

OF11.5 (P1) Opción "Subir fotos solo con Wi-Fi" para cuidar los datos móviles.

### Criterios de aceptación:

☐ Offline saco la foto de un producto; al volver la conexión se sube sola y queda asociada al producto (también si el producto se creó offline con ID temporal).

☐ Con 20 fotos y 100 ventas pendientes, al reconectar se sincronizan primero las ventas.

☐ Offline saco la foto de una factura de proveedor; al volver la conexión se sube y entra al flujo del PRD de Facturas (OCR y confirmación).

### OF12. Bot de WhatsApp con el comercio offline (P0)

Descripción: el bot vive en la nube y usa el número central de la plataforma (6.4 del PRD del bot); no depende de la conexión del kiosco. Pero solo ve lo que ya se sincronizó: no tiene acceso a los datos que están en un dispositivo offline. La web/app funciona sola, sin el bot.

### Requerimientos:

OF12.1 El bot sigue respondiendo consultas de stock, pedidos y caja con los datos del servidor (los últimos sincronizados). Es coherente con el principio del PRD del bot de no usar cachés: lee la base del comercio en vivo; lo que falta es lo que todavía no llegó desde los dispositivos.

OF12.2 Latido de dispositivos: cada dispositivo envía al servidor, mientras tiene conexión, un latido liviano con su cantidad de operaciones pendientes y su última operación. El servidor considera "posiblemente desactualizado" al comercio si algún dispositivo activo en la jornada no envió latido en los últimos 5 minutos o informó pendientes.

OF12.3 Aviso de desactualización: si el comercio está "posiblemente desactualizado", cada respuesta del bot con datos de stock o caja agrega: "⚠️ Datos al 14:10. El Celular de Juan está sin conexión desde esa hora y puede tener ventas sin sincronizar."

OF12.4 Alertas durante el corte: las alertas de stock bajo que el bot no puede conocer (porque las ventas están en el dispositivo) se muestran en la app del dispositivo; el bot las manda en la puesta al día (OF13).

OF12.5 Acciones del bot que dependen del stock (armar un pedido sugerido, aviso matutino) usan los datos del servidor y llevan el mismo aviso si corresponde.

OF12.6 Independencia: si el bot o la WhatsApp Cloud API no están disponibles, la web/app sigue funcionando completa (online u offline).

### Criterios de aceptación:

☐ Con el celular de Juan offline desde las 14:10, pregunto al bot "¿cuántas Coca 500 hay?" y recibo el stock del servidor con el aviso "Datos al 14:10…".

☐ Con todos los dispositivos sincronizados, la respuesta no lleva aviso.

☐ Con la Cloud API caída (simulado), la app vende y cobra con normalidad.

### OF13. Puesta al día del bot al reconectar (P0)

Descripción: cuando un dispositivo vuelve a tener conexión y sincroniza, el bot manda lo que quedó pendiente en un solo mensaje combinado, sin repetir alertas ya enviadas y sin inundar al dueño.

### Requerimientos:

OF13.1 Cálculo después del lote, no por movimiento: las alertas (stock bajo F4/B4, stock negativo OF6.7, operaciones rechazadas o en cuarentena, productos duplicados OF10.4, resumen de cierre tardío OF7.6) se evalúan cuando termina la sincronización del lote, sobre el estado final.

OF13.2 Deduplicación: cada alerta tiene una clave de deduplicación (ej. stock_bajo:<producto>:<episodio>); si ya se avisó y la situación no cambió, no se repite. Se usa el mismo outbox de eventos (notification_events, 6.4 del PRD de Caja) con dedupe_key única.

OF13.3 Agrupación con espera corta: después de la sincronización, el sistema espera unos minutos (por defecto, 3) para juntar a otros dispositivos que vuelvan al mismo tiempo y arma un único mensaje por destinatario.

OF13.4 Contenido del mensaje combinado (ejemplo): "Volvió la conexión del Celular de Juan (sin conexión de 14:10 a 17:45). Se sincronizaron 37 ventas por $84.300. Quedaron 3 productos con stock bajo: … 1 producto en negativo: Coca 500 (−1), revisalo. El resumen de cierre de ayer ya está disponible (tardío)." con botones "Ver alertas" y "Ver cierre" (link a la web/app).

OF13.5 Límites de frecuencia: como máximo un mensaje de puesta al día por comercio cada 30 minutos; lo que surja en ese intervalo se acumula para el siguiente.

OF13.6 Horario y preferencias: respeta el opt-in, el canal y las preferencias del PRD del bot (B2). Si la reconexión ocurre de noche (fuera del horario configurado), el contenido se suma al aviso matutino (B5) en vez de mandarse en ese momento.

OF13.7 Ventana de 24 h: fuera de la ventana de atención se usa una plantilla de utilidad nueva, puesta_al_dia_sincronizacion (a aprobar por Meta, [a verificar]); dentro de la ventana, mensaje interactivo.

OF13.8 Resúmenes pendientes: el resumen diario y el resumen de cierre que no se pudieron enviar correctamente durante el corte (porque los datos no estaban) se incluyen en la puesta al día una sola vez, no se mandan por separado.

### Criterios de aceptación:

☐ Después de 3 horas offline con 37 ventas que dejan 3 productos bajo umbral y 1 en negativo, al reconectar recibo un solo mensaje con todo eso.

☐ Si dos celulares vuelven con 1 minuto de diferencia, recibo un solo mensaje que incluye a los dos.

☐ Un producto que ya me había avisado como stock bajo esta mañana y sigue igual no se repite.

☐ Si la reconexión es a las 02:00, no recibo nada a esa hora y el contenido aparece en el aviso matutino de las 08:00.

☐ Sin opt-in de WhatsApp, la puesta al día llega por email si lo elegí, o se ve solo en la app.

### OF14. Límites, cuota y seguridad del dispositivo (P0)

### Requerimientos:

OF14.1 Duración máxima offline: por defecto 72 horas (la validez del permiso offline, OF9.2). Avisos a las 24 h y a las 60 h. Al vencer, la app deja de registrar operaciones nuevas hasta conectarse, con un mensaje claro, y conserva todo lo pendiente. Configurable por el dueño, con un máximo de 7 días.

OF14.2 Cuota de almacenamiento: la app pide almacenamiento persistente al navegador (navigator.storage.persist()) y mide el uso (navigator.storage.estimate()). Presupuesto orientativo: catálogo de 5.000 productos sin fotos menor a 10 MB, miniaturas aprox. 100 MB, cola de operaciones hasta 10.000 operaciones, fotos en cola hasta 100 fotos o 50 MB. Aviso al 80% del presupuesto o de la cuota del navegador; al 95%, se dejan de aceptar fotos nuevas en cola (las ventas siguen).

OF14.3 Expulsión del almacenamiento: si el navegador borra los datos locales (por ejemplo, Safari con un sitio no instalado, [a verificar]), lo no sincronizado se perdería: por eso el modo offline robusto exige la PWA instalada, el pedido de almacenamiento persistente y la sincronización inmediata cada vez que hay conexión. La app detecta al iniciar si su base local desapareció con pendientes conocidos por el servidor (huecos de secuencia, OF4.8) y lo avisa.

OF14.4 Base local cifrada en dispositivos compartidos: en los dispositivos marcados como "compartido del comercio" (y opcionalmente en todos), la base local y la cola se cifran (ver 6.7): la clave no se guarda en texto plano y, al cerrar sesión o vencer el permiso offline, los datos no son legibles sin volver a autenticarse.

OF14.5 Datos mínimos en el dispositivo: solo lo necesario para operar (OF3.1); sin costos para quien no puede verlos, sin datos de otros comercios, sin tokens de Google.

OF14.6 Borrado remoto al revocar: cuando el dueño revoca un usuario o da de baja un dispositivo, en la siguiente conexión el dispositivo sincroniza lo pendiente (que puede quedar en cuarentena, OF9.6) y luego borra su base local.

OF14.7 Versión de la app: el servidor acepta operaciones de versiones anteriores de la app durante un período de compatibilidad; si una versión es demasiado vieja, la app se actualiza (service worker) antes de sincronizar, sin perder la cola.

### Criterios de aceptación:

☐ A las 24 h y a las 60 h sin conexión veo los avisos; a las 72 h la app me pide conectarme y nada de lo hecho se perdió.

☐ Con la cuota al 95%, no puedo agregar fotos en cola pero sigo pudiendo vender.

☐ En un celular marcado como compartido, después de cerrar sesión, la base local no se puede leer copiando sus archivos (prueba controlada).

☐ Doy de baja un celular; al conectarse sincroniza sus pendientes y después su base local queda vacía.

☐ Una actualización de la app no pierde operaciones pendientes en la cola (test de migración de la base local).

### OF15. Otros módulos offline (P0 parcial / P1)

### Criterios de aceptación:

☐ Offline registro un ingreso de mercadería de 2 cajas de 24 y un egreso por rotura; al sincronizar ambos aparecen en el historial con sus dos horas.

☐ Offline, las pantallas que requieren conexión muestran "Necesita conexión" en lugar de fallar.

☐ Todo lo de esta tabla marcado como offline funciona igual en el celular que en la PC.

### OF16. Entidades nuevas de v1 offline: fiado, entregas de turno, conteo por sector, promos y combos, lotes y FEFO (P0)

Descripción: las funciones nuevas de la primera versión también funcionan sin conexión, con la misma cola (OF4), la misma idempotencia (op_id / idempotency_key) y la misma auditoría con doble hora (OF8). Cada una tiene su regla de conflicto en 6.5. Los permisos offline son los mismos que online (OF9.3, matriz AU4 del PRD de autenticación); las acciones sensibles de cada función son solo online (OF9.5).

### Requerimientos:

OF16.1 Fiado (ventas a cuenta y cobros) offline (C18.8 del PRD de Caja; la cuenta del cliente la define el "PRD - Fiado y Cuenta Corriente de Clientes", en redacción):

OF16.1.1 Venta a cuenta offline: se registra con el cliente elegido de la lista local (OF3.7); queda en la cola junto con la venta y su movimiento de stock, en la misma transacción local (OF2.2). No entra a la caja (C18.2).

OF16.1.2 Control del tope contra el saldo local: offline, el tope se controla contra el saldo local del cliente = último saldo conocido del servidor + ventas a cuenta y cobros pendientes de ese dispositivo. Si la venta supera el tope, se aplica la misma regla que online (empleado: no puede superar el tope; dueño: puede, con confirmación). La pantalla muestra el saldo como "provisorio" y desde cuándo no se actualiza.

OF16.1.3 Cobro de fiado offline: por cualquiera de los 5 medios, como ingreso "Cobro de fiado" (C18.3); el monto se valida contra el saldo local (mayor a 0 y no mayor a lo adeudado según el dispositivo).

OF16.1.4 Al sincronizar: el servidor recalcula el saldo del cliente con todas las operaciones recibidas, ordenadas por hora del dispositivo validada. Si con las ventas a cuenta de otros dispositivos el saldo quedó sobre el tope, la venta se acepta igual (ya se entregó la mercadería), se marca "sobre el tope (offline)" y se emite el evento de fiado sobre el tope (PRD de notificaciones por email).

OF16.1.5 Dos celulares cobran al mismo cliente sin conexión: se conservan los dos cobros (la plata ya entró a la caja), se recalcula el saldo y, si queda negativo (el cliente pagó de más), el saldo negativo queda como saldo a favor del cliente (C18.8), el cliente se marca "saldo negativo, revisar" y el dueño recibe un aviso. Nunca se descarta ni se modifica un cobro: si el dueño decide devolver el excedente, lo hace con una reversión o un egreso, online.

OF16.1.6 Cambiar el tope y dar de baja una deuda (incobrable) son solo online (OF9.5).

OF16.2 Entregas de turno offline (C17.22 del PRD de Caja): entregar, contar (total o por denominación), recontar, recibir, rechazar (poner en disputa), los retiros a resguardo, los conteos sorpresa de efectivo y la resolución del dueño funcionan sin conexión. El efectivo esperado del turno se calcula con los movimientos locales y el servidor lo recalcula al sincronizar; si difiere (por movimientos de otro dispositivo), se guardan los dos valores y la entrega queda marcada para revisión del dueño. La diferencia y la tolerancia se aplican con el esperado del servidor. Solo cuenta efectivo, es opcional y no es un arqueo diario.

OF16.3 Conteo por sector offline (F13.8 del PRD principal): iniciar, cargar líneas, recontar, pausar y dejar el conteo "listo para revisar" funcionan sin conexión, con la hora del dispositivo en cada línea. El stock teórico y las diferencias definitivas los recalcula el servidor con los movimientos sincronizados; la confirmación de los ajustes requiere conexión (OF9.5).

OF16.4 Promos y combos offline (RT12.9 del PRD de Rotación): las promociones vigentes y las que empiezan en los próximos 7 días se sincronizan con anticipación con el catálogo local (OF3.7), con su versión. El motor de promociones es el mismo código en el servidor y en la PWA, así la venta offline aplica la misma promoción que online. Lo cobrado queda congelado en la venta (como el precio, OF2.3).

OF16.5 Lotes y FEFO offline (RT13.9 del PRD de Rotación y F12 del PRD principal): la carga de mercadería con fecha de vencimiento funciona offline (el lote se crea con un ID temporal y se mapea al sincronizar, como OF10). En la venta y los egresos offline el dispositivo muestra el lote FEFO provisorio según sus datos locales, pero el lote se elige al sincronizar: el servidor imputa cada egreso al lote que vence primero según el orden de las operaciones por hora del dispositivo validada. La baja de un lote vencido se puede registrar offline; si al sincronizar ese lote ya no tiene unidades suficientes, se imputa al siguiente lote del producto (o a "sin lote") y se marca para revisión. Corregir la fecha de un lote o reasignar fuera de FEFO es solo online (OF9.5).

### Criterios de aceptación:

☐ En modo avión vendo $5.000 a cuenta a Doña Rosa (saldo local $10.000, tope $20.000): se registra, su saldo provisorio queda en $15.000 y al sincronizar el servidor lo confirma.

☐ En modo avión, como empleado, intento vender a cuenta $12.000 a un cliente con saldo local $10.000 y tope $20.000: la app no me deja superar el tope.

☐ Dos celulares offline venden a cuenta al mismo cliente y entre los dos superan el tope: al sincronizar se aceptan las dos ventas, la segunda queda marcada "sobre el tope (offline)" y el dueño recibe el aviso.

☐ Dos celulares offline cobran $3.000 cada uno a un cliente que debía $5.000: al sincronizar se conservan los dos cobros, el saldo queda en −$1.000, el cliente queda marcado "saldo negativo, revisar" y el dueño recibe el aviso.

☐ En modo avión Ana entrega el turno a Juan, Juan rechaza y la entrega queda "en disputa"; al sincronizar el servidor recalcula el esperado y, si difiere del local, se ven los dos valores marcados para revisión.

☐ En modo avión cuento la "Heladera A" y la dejo "lista para revisar"; el botón "Confirmar ajustes" aparece deshabilitado con "Necesita conexión"; con conexión, el dueño confirma con las diferencias recalculadas.

☐ Una promo 2x1 que empieza mañana ya está en el celular hoy; mañana, en modo avión, la venta de 2 unidades la aplica igual que online.

☐ En modo avión cargo 12 yogures con vencimiento 15/10 y vendo 3: el dispositivo muestra el lote provisorio y, al sincronizar, el servidor imputa las ventas al lote que vence primero.

## 5. Flujos de usuario

### Flujo 1: se corta la conexión en medio de una venta

Ana está en el mostrador con el celular del comercio. Escanea con la cámara una Coca-Cola 500 y un alfajor; la venta está en pantalla.

Se corta el Wi-Fi. A los pocos segundos el indicador pasa a "Sin conexión" y aparece una sola vez el aviso "Sin conexión: podés seguir vendiendo". La venta en pantalla no se pierde (el borrador ya estaba en la base local).

Ana escanea un tercer producto: se resuelve contra el catálogo local, con foto miniatura y precio.

Elige "Mercado Pago" y confirma. En una transacción local se guardan los tres egresos por venta, el ingreso en la caja y las operaciones en la cola. El stock local baja y el indicador muestra "Sin conexión · 1 pendiente".

El cliente paga desde su celular; el cobro queda "sin verificar" hasta que, con conexión, Ana lo vea en Mercado Pago o asocie el comprobante (C13).

Ana sigue vendiendo así durante la tarde (por cámara y por búsqueda de texto). Nada le pide conectarse.

Si el corte ocurrió justo mientras la venta se estaba enviando (con conexión), la operación ya estaba en la cola con su op_id: se reintenta sola y el servidor no la duplica aunque la hubiera recibido.

### Flujo 2: vuelve la conexión

A las 17:45 vuelve el Wi-Fi. El indicador detecta que el servidor responde y pasa a "Sincronizando 1 de 38".

La app envía las operaciones en lotes, en orden de secuencia: primero el producto creado offline (con su ID temporal), después las ventas y los movimientos de caja; las fotos al final.

El servidor aplica cada operación una sola vez, en la base del comercio: inserta los movimientos con created_at = hora de recepción y client_occurred_at = hora del celular, asigna la jornada según la hora del celular, calcula la ganancia con el costo vigente a esa hora, aplica la cadena de hashes si está activa y devuelve el resultado por operación.

La app baja los cambios del servidor (pull): stock actualizado (que ya incluye las ventas de otros dispositivos), precios nuevos, ID definitivo del producto creado offline.

El indicador pasa a "En línea". Las ventas offline ya muestran su ganancia y su número de ticket definitivo.

El servidor evalúa alertas sobre el estado final y, tras unos minutos de espera, el bot le manda al dueño un único mensaje de puesta al día (OF13).

Si alguna operación fue rechazada o quedó en cuarentena, el indicador queda en rojo y el dueño la ve en "Operaciones con problemas".

### Flujo 3: dos dispositivos offline venden el mismo producto

El kiosco tiene dos celulares: "Celular de Juan" (mostrador) y "Celular de Ana" (reposición, también vende en horas pico). Último stock sincronizado de Coca-Cola 500: 3.

Se corta internet en todo el local. Ambos celulares ven stock 3.

Juan vende 2 (su stock local: 1). Ana vende 2 (su stock local: 1). Ninguno sabe del otro; ninguna venta se bloquea.

Vuelve la conexión. Juan sincroniza primero: el servidor aplica −2 → stock 1. Ana sincroniza después: el servidor aplica −2 → stock −1. Las 4 unidades vendidas quedan registradas; ninguna venta pisó a la otra.

El servidor detecta stock negativo y crea la anomalía con los dos movimientos (dispositivo, usuario, hora del dispositivo y de recepción).

Ambos celulares bajan el stock del servidor (−1) y muestran el producto marcado.

El dueño recibe la puesta al día: "Coca 500 quedó en −1: se vendieron 4 con 3 registradas. Probablemente hay una carga sin registrar." Revisa la góndola, encuentra la caja que recibió ayer sin cargar y registra el ingreso (o un ajuste); la anomalía se resuelve. Ningún movimiento se editó.

### Flujo 4: cierre automático con un celular offline

Hora de corte 00:00. El Celular de Juan quedó sin datos desde las 22:00 y registró 15 ventas.

A las 00:00 el celular, con su reloj, muestra "Caja cerrada a las 00:00 (provisorio)" y las ventas siguientes van a la jornada nueva.

En el servidor, el job cierra la jornada a las 00:00, pero como el Celular de Juan no envía latidos desde las 22:00, deja el resumen "pendiente de sincronización".

A las 09:12 Juan llega con datos. El celular sincroniza: las 15 ventas se imputan a la jornada anterior (según la hora del celular) y se genera el resumen de cierre, marcado "tardío", con la explicación.

La puesta al día del bot incluye "El resumen de cierre de ayer ya está disponible (tardío)" junto con las alertas.

### Flujo 5: un comercio que opera solo con el celular

Lucía abre su kiosco; no tiene PC. Abre la app instalada en el celular.

Abre la caja con $15.000 en efectivo.

Vende escaneando con la cámara; en hora pico usa un lector Bluetooth chico emparejado al celular.

Llega el proveedor: carga la mercadería escaneando las cajas y saca la foto de la factura (si no hay señal, queda en cola).

Al mediodía se cortan los datos durante una hora; sigue igual y la app sincroniza sola.

A la noche toca "Cerrar caja" y revisa el resumen en el celular. Todo sin una computadora.

### Flujo 6: celular compartido y cambio de turno

El celular del comercio está marcado como "compartido". Ana termina su turno con 5 operaciones pendientes porque no hay conexión.

Toca "Cerrar sesión": la app avisa que hay 5 pendientes y las mantiene cifradas en la cola.

Juan entra (P1: con su PIN local, si ya inició sesión con Google en ese celular; en el MVP, necesita conexión para iniciar sesión).

Al volver la conexión, las operaciones de Ana se envían con su usuario, no con el de Juan.

## 6. Notas técnicas

### 6.1 Principios

Local primero (local-first) en el mostrador: toda operación de venta y caja se escribe primero en la base local del dispositivo y después se sincroniza. La app nunca espera al servidor para confirmar una venta.

El servidor es la fuente de verdad: la base del comercio (una por cliente) define stock, caja, horas oficiales, permisos y cadena de hashes. El dispositivo tiene una copia de trabajo y una cola.

Un solo camino de escritura: las operaciones online y offline pasan por la misma cola y el mismo endpoint de sincronización, y en el servidor por la misma función única de movimientos (registrar_movimiento, 6.11 del PRD principal).

Solo celular: la arquitectura offline se diseña y se prueba primero en el celular (SQLite local); la PC es un caso más.

### 6.2 PWA: Service Worker y caché de la app

Astro + TypeScript con salida SSR para las páginas online; las pantallas que deben funcionar offline (venta, caja, carga, catálogo, indicador) son islas cliente que funcionan sin servidor una vez cargadas.

Service Worker (por ejemplo, con Workbox o @vite-pwa/astro, [a verificar compatibilidad con la versión de Astro]): precache del "app shell" (HTML base de las rutas offline, JS, CSS, íconos, librería del escáner y WASM), estrategia stale-while-revalidate para recursos estáticos y nunca caché de respuestas de API con datos del comercio (los datos van en la base local, no en la caché HTTP).

Navegación offline: las rutas offline sirven el shell precacheado; las rutas solo online muestran una página "Necesita conexión".

Actualizaciones: el nuevo service worker se activa cuando la cola está vacía o al reiniciar la app, nunca en medio de una venta; las migraciones de la base local son versionadas y probadas.

Background Sync / Periodic Background Sync: se usan donde existan (Chrome Android) como mejora; en iOS Safari no se asume su disponibilidad [a verificar], por lo que el disparo principal es la app abierta (evento online, visibilitychange, temporizador).

### 6.3 Base local: SQLite en el celular, opciones e IndexedDB

Decisión: en el celular, la base local es SQLite (principio "solo celular"). Para tener un solo código, la capa de datos local se abstrae detrás de un repositorio TypeScript con la misma API en todos los dispositivos.

Recomendación: SQLite WASM + OPFS en el celular y en la PC como camino principal; Dexie/IndexedDB como fallback automático donde OPFS no esté disponible; Capacitor + SQLite nativo como plan B si la Fase 0 muestra problemas en iOS (expulsión del almacenamiento, rendimiento, cifrado).

La base local corre en un Web Worker para no trabar la UI; la cámara y el escáner siguen en el hilo principal.

Esquema local (resumen): products, product_codes, locations, stock_snapshot (stock confirmado por el servidor y su cursor), local_movements, cash_payment_methods, cash_categories, cash_day_local (apertura local, cierre provisorio), cash_movements_local, outbox, id_mappings, photos_queue, sync_state (cursor de pull, último device_seq confirmado, última sincronización, desfasaje de reloj), offline_grant.

Búsqueda local: FTS5 de SQLite con tokenización sin tildes más un índice de trigramas o MiniSearch en memoria para la tolerancia a errores; la lógica de orden (código exacto, luego similitud) es la misma que en el servidor.

### 6.4 Diseño de la cola (outbox) y del protocolo de sincronización

Tabla local outbox: op_id (UUID v7 generado en el dispositivo, ordenable por tiempo), device_id, device_seq (entero correlativo), user_id, tipo_op (venta, movimiento_stock, movimiento_caja, apertura, cierre_manual, alta_producto, edicion_producto, foto), payload (JSON validado con el mismo esquema Zod que el servidor), depende_de (op_id, nullable), client_occurred_at, hlc (reloj lógico híbrido, para reglas de último que escribe gana), estado (pendiente / enviando / confirmada / rechazada / cuarentena), intentos, ultimo_error, resultado (IDs definitivos), created_at.

Push (dispositivo → servidor): POST /api/sync/push con un lote ordenado por device_seq, la hora actual del dispositivo y la versión de la app; autenticado con la sesión del servidor (cookie), no con el permiso offline. Por cada operación, en una transacción de la base del comercio:

INSERT INTO sync_receipts (op_id, device_id, device_seq, ...) ON CONFLICT (op_id) DO NOTHING; si ya existía, devuelve el resultado guardado (respuesta idempotente).

Re-valida permisos y membership del usuario a la hora de la operación (OF9.6) y el esquema del payload.

Resuelve IDs temporales vía id_mappings.

Aplica la operación con las funciones de dominio existentes (registrar_movimiento del PRD principal; alta de movimiento de caja del PRD de Caja), con idempotency_key = op_id (doble barrera: UNIQUE en sync_receipts y en stock_movements / cash_movements).

Guarda el resultado en sync_receipts y lo devuelve.

El servidor procesa los lotes de un mismo dispositivo en serie (bloqueo por device_id) y los de distintos dispositivos en paralelo (el bloqueo de fila por producto de 6.11 del PRD principal serializa lo necesario). Al final del lote: evaluación de alertas y anomalías, eventos en el outbox de notificaciones con dedupe_key, actualización de device_sync_state.

Pull (servidor → dispositivo): GET /api/sync/pull?cursor=... devuelve los cambios desde el cursor: productos, códigos, precios, ubicaciones, stock por producto (valor del servidor), jornada y apertura, medios y categorías, mapeos de IDs y estado de operaciones. El cursor sale de un registro de cambios por base de comercio (change_log con secuencia, alimentado por triggers) o de updated_at + id; se decide en Fase 0.

Latido: POST /api/sync/heartbeat cada 60 s con conexión (pendientes, último device_seq, versión); alimenta OF12.2 y OF7.6.

Garantías: entrega al menos una vez (reintentos con espera creciente y jitter) + procesamiento una sola vez por op_id en el servidor = efecto exactamente una vez. Huecos de device_seq detectados por device_sync_state.ultimo_seq_contiguo.

### Tablas nuevas o ampliadas en la base de cada comercio:

En la base de control: offline_grants (id, user_id, tenant_id, device_id, emitido_at, vence_at, revocado_at) y la clave de firma del permiso en el gestor de secretos.

### 6.5 Reglas de resolución de conflictos por entidad

### 6.6 Cálculos que hace el servidor al sincronizar

Ganancia de ventas offline: costo vigente a client_occurred_at validado (log de auditoría de costos), igual que el congelamiento de F2.10 pero calculado en el servidor.

Precio desactualizado: si el precio del servidor a la hora de la venta difería del cobrado, se crea una anomalía precio_desactualizado (solo informativa, agregada en un reporte; no dispara alertas individuales).

Jornada: según client_occurred_at validado (OF7.5).

Alertas y anomalías: al final del lote (OF13.1).

Saldo de fiado: recalculado por cliente con todas las ventas a cuenta y cobros recibidos; marcas "sobre el tope (offline)" y "saldo negativo, revisar" (OF16.1).

Efectivo esperado de las entregas de turno: recalculado con los movimientos sincronizados; si difiere del local, se guardan los dos valores (OF16.2).

Lote de cada egreso (FEFO): asignado al sincronizar (OF16.5).

Promociones: se verifica la versión de la promo aplicada; las diferencias se marcan "promo desactualizada" (solo informativo, como el precio desactualizado).

### 6.7 Seguridad y cifrado local

Cifrado de la base local (dispositivos compartidos, OF14.4):

SQLite WASM: build con cifrado (por ejemplo, SQLite3 Multiple Ciphers compilado a WASM) [a verificar madurez y licencia]; alternativa: cifrado a nivel de aplicación de los campos sensibles y del payload de la cola con WebCrypto AES-GCM.

Clave: clave de datos aleatoria generada en el dispositivo, envuelta con una clave que entrega el servidor en cada sesión online (atada a user_id + device_id) y guardada como CryptoKey no extraíble; vence junto con el permiso offline. En Capacitor, la clave va al Keychain (iOS) / Keystore (Android) y la base se cifra con SQLCipher.

Alcance real: en el navegador, el cifrado protege contra el acceso casual (otro usuario del celular compartido, copia de archivos, perfil del navegador), no contra un dispositivo comprometido con la app abierta.

Permiso offline: firmado por el servidor (por ejemplo, Ed25519), verificado en el dispositivo con la clave pública incluida en la app; solo sirve para que la UI permita operar offline, nunca autentica contra la API (la sincronización exige sesión válida).

Sin tokens de Google ni secretos en el dispositivo (6.12 del PRD principal); la cookie de sesión sigue siendo HttpOnly.

Validación en el servidor de todo lo que llega de la cola: esquema Zod, permisos, montos en centavos enteros, rangos de hora, tamaño de lote y rate limiting por dispositivo.

Protección de datos (Ley 25.326): la base local contiene datos del comercio; se borra al dar de baja el dispositivo y al revocar el usuario.

### 6.8 Escaneo en el celular

Mismo componente de escáner del PRD principal (6.5): BarcodeDetector en Chrome Android y zxing-wasm / @zxing/browser como fallback obligatorio en Safari iOS, todo precacheado por el service worker para funcionar offline.

Lector Bluetooth HID: mismo detector por velocidad entre teclas que el USB; campo con inputmode="none" para no abrir el teclado virtual; prueba con al menos dos modelos baratos del mercado argentino en Fase 0.

### 6.9 Pruebas y observabilidad

Tests de propiedades (por ejemplo, fast-check) sobre la sincronización: cualquier orden y cualquier repetición de los mismos lotes de N dispositivos produce el mismo stock y la misma caja.

Inyección de fallas: cortes en medio del push, respuestas perdidas, reintentos duplicados, reinicio del dispositivo, reloj desfasado, base local borrada.

E2E (Playwright) con emulación offline y pruebas manuales en dispositivos reales (Android de gama media, iPhone con PWA instalada) del recorrido "solo celular" (OF1).

Métricas: tiempo de sincronización, tamaño de colas, operaciones rechazadas y en cuarentena, huecos, desfasaje de reloj, anomalías de stock por comercio; visibles en el Control Plane. Sentry en el cliente con el estado de la cola en el contexto (sin datos personales).

## 7. Riesgos y preguntas abiertas

### 7.1 Riesgos

### 7.2 Preguntas abiertas

Actualizar el PRD principal: ¿se adopta formalmente adelantar al MVP la venta, el stock y la caja offline (hoy previstos como "offline completo" en P1, 6.2 y Fase 2 del PRD principal) y el principio "solo celular" en todos los PRD? Requiere actualizar esos documentos (no se modificaron en este).

PWA o envoltorio nativo: ¿alcanza la PWA instalada en iOS para el offline robusto o conviene planificar Capacitor desde el inicio? Se decide con el spike de la Fase 0.

Duración máxima offline: ¿72 h por defecto es razonable? ¿Hay comercios (zonas rurales, ferias) que necesiten más?

Hora oficial de la apertura y del cierre manual offline: el PRD de Caja exige hora del servidor; ¿se acepta que una apertura o cierre offline muestre como oficial la hora de sincronización (con la del dispositivo como referencia), o se propone al PRD de Caja usar la hora del dispositivo validada para estos eventos?

Plazo de espera del resumen de cierre tardío: ¿esperar hasta el límite offline (72 h) o un plazo más corto (por ejemplo, 12 h) para no demorar el resumen?

Dispositivos esperados: ¿qué dispositivos se consideran "activos en la jornada" para retener el resumen (los que hicieron alguna operación ese día, los que tienen sesión, los marcados por el dueño)?

Reserva de stock por dispositivo (P2): ¿vale la pena para algún rubro (por ejemplo, cigarrillos) o alcanza con marcar negativos?

Precio editable en la venta offline: si el dueño habilita editar el precio en la venta (F2.10), ¿se permite también offline?

Plantilla puesta_al_dia_sincronizacion: texto, variables y categoría a aprobar con Meta [a verificar].

Cifrado en todos los dispositivos o solo en los compartidos: costo en rendimiento y experiencia vs. riesgo.

Cursor de pull: ¿registro de cambios con triggers o updated_at? Impacto en las migraciones de todas las bases de clientes.

## 8. Plan por fases

### Fase 0: validación técnica y diseño (2 semanas)

Spike de SQLite WASM + OPFS en Android de gama media y iPhone (PWA instalada): rendimiento, persistencia tras días sin uso, cuota, Web Worker; comparación con Dexie.

Pruebas de escaneo con cámara y con 2 lectores Bluetooth HID en el celular, offline.

Prototipo del protocolo push/pull con op_id, device_seq y deduplicación; tests de propiedades del merge.

Diseño del indicador de estado y de los textos (probar con 5 comerciantes).

Decisión PWA vs. Capacitor y respuesta a las preguntas abiertas 1 a 6.

### Fase 1: MVP offline (4 a 6 semanas, integrado al MVP del inventario y de la caja)

OF1 operación completa desde el celular (pantallas P0 de todos los módulos revisadas en 360 px).

OF2 venta offline, OF3 catálogo local, OF4 cola y sincronización automática, OF5 indicador.

OF6 stock como suma de movimientos y anomalías de stock negativo.

OF7 caja offline con los 5 medios, apertura y cierre manual offline, cierre automático con resumen tardío.

OF8 auditoría con doble hora, dispositivo, secuencia y desfasaje (cadena de hashes cuando se active F3.11).

OF9 permiso offline y acciones sensibles solo online; OF10 alta mínima con IDs temporales; OF11 fotos en cola.

OF12 aviso de desactualización del bot y OF13 puesta al día combinada.

OF14 límites, cuota, cifrado en dispositivos compartidos, baja remota.

OF15 carga y egresos offline, foto de factura en cola.

OF16 fiado (ventas a cuenta y cobros), entregas de turno, conteo por sector, promos y combos sincronizados con anticipación y lotes con FEFO asignado al sincronizar.

Tests de propiedades, inyección de fallas y prueba "solo celular" en Android e iOS.

### Fase 2: comodidad (meses 2 y 3)

PIN local para cambiar de usuario offline (OF9.8).

Edición offline de campos no sensibles con último que escribe gana por campo (OF10.6).

Devoluciones y recepción de pedidos offline (OF15).

Sincronización en segundo plano donde se pueda; subida de fotos solo por Wi-Fi.

Panel de diagnóstico de sincronización para el dueño.

### Fase 3: diferenciación (meses 4 a 12, según demanda)

Reserva de stock por dispositivo para productos críticos.

Cadena de hashes local por dispositivo.

Sincronización entre dispositivos del mismo local sin internet (Wi-Fi local), a evaluar.

Búsqueda por foto offline con un modelo en el dispositivo, a evaluar.

App en tiendas con Capacitor si no se adoptó antes.

## Anexo A: glosario

Campo | Detalle
--- | ---
Producto | Modo Offline del Sistema de Inventario para Kioscos y Comercios (web y app móvil)
Autor | Mauricio Matasini
Estado | Borrador v1
Fecha | 9 de octubre de 2026
Documentos relacionados | "PRD - Sistema de Inventario para Kioscos y Comercios" (en adelante, PRD principal: https://docs.google.com/document/d/1yqHU3xK1EYQle8J5Gag0wweTs9llCHH_X8uo4_km_AA/edit; F2 escaneo y venta, F3 historial inmutable, F8 cuentas y sesiones, 6.2 PWA, 6.11 auditoría, 6.12 Google y sesiones), "PRD - Caja Digital para Sistema de Inventario" (PRD de Caja: https://docs.google.com/document/d/14hdf2BbXewzSkjKE25zC8NEMJsDsy2ObI0IKBSt6u0U/edit; C2 apertura, C3 movimientos, C4 medios de pago, C12 cierre, 6.6 cierre automático), "PRD - Bot de WhatsApp para Sistema de Inventario" (PRD del bot: https://docs.google.com/document/d/1lp7TnN3MiX60OJihJdv7h_26XEAZdmyPtwjwSGEgPv8/edit), "PRD - Facturas de Proveedores para Sistema de Inventario" (PRD de Facturas: https://docs.google.com/document/d/1I38DsgM56HRIyXimafn9wAGPNasTfV8sA4b4Fceoo50/edit), "PRD - Consumos de Servicios para Sistema de Inventario" y "PRD - Órdenes de Pago para Sistema de Inventario". Todos en borrador; si cambian, este PRD se alinea a ellos.
Terminología | La misma de los documentos relacionados: comercio/tenant, base de control, roles Dueño/Empleado, movimiento de stock, movimiento compensatorio, caja, jornada, apertura, cierre manual / automático, hora de corte, resumen de cierre, medio de pago (los cinco de la caja: Efectivo, Débito, Mercado Pago, QR, Transferencia bancaria), dispositivo (devices), origen, idempotency_key. Términos nuevos en el Anexo A.
Stack | Astro + TypeScript (PWA: la misma app en la web de la PC y en el celular), PostgreSQL con una base de datos por cliente más una base de control (igual que ModoOps), "Iniciar sesión con Google" con sesiones del lado del servidor

Necesidad en el kiosco | Solo con el celular (obligatorio) | Accesorios opcionales
--- | --- | ---
Vender escaneando | Cámara del celular en vivo (F2.1 del PRD principal) | Lector Bluetooth HID emparejado al celular; lector láser/USB en una PC
Buscar un producto | Búsqueda de texto sobre el catálogo local | Teclado de la PC
Stock, carga de mercadería, alta de productos | App en el celular | PC
Caja (apertura, cobros, egresos, cierre) | App en el celular | PC
Facturas de proveedores | Foto con la cámara del celular | Escáner o archivo en la PC
Pedidos, proveedores, reportes, configuración | App en el celular (pantallas responsive) | PC (pantalla más grande, cómodo pero no necesario)
Modo offline | Base SQLite local en el celular | Base local en el navegador de la PC

# | Objetivo | Cómo se mide
--- | --- | ---
OO1 | Operar el 100% del sistema desde un celular, sin PC, con y sin conexión | Porcentaje de comercios activos que operan solo con celular; recorrido de pruebas E2E "solo celular" completo en Android e iOS
OO2 | Que un corte de internet no frene ninguna venta | Ventas offline registradas / ventas totales en jornadas con cortes; cero reportes de "no pude vender por falta de internet"
OO3 | Cero movimientos perdidos | Operaciones creadas offline vs. confirmadas por el servidor (objetivo: 100%); huecos de secuencia por dispositivo sin resolver = 0
OO4 | Cero duplicados por reintentos | Duplicados detectados en auditoría = 0 (verificado por idempotency_key y tests)
OO5 | Sincronización automática y rápida | Tiempo desde que vuelve la conexión hasta "Todo sincronizado" para 200 operaciones: menos de 30 s en 4G
OO6 | Transparencia sobre el estado | El comerciante siempre ve si está online, offline o sincronizando y cuántas operaciones quedan pendientes
OO7 | Trazabilidad igual a la del modo online | 100% de los movimientos offline con hora del dispositivo, hora de recepción del servidor, usuario y dispositivo

Prioridad | Significado
--- | ---
P0 - MVP | Imprescindible para el lanzamiento
P1 - Post-MVP cercano | Dentro de los 2 a 3 meses posteriores
P2 - Futuro | Según demanda

# | Funcionalidad | MVP (P0) | Más adelante (P1/P2)
--- | --- | --- | ---
OF1 | Operación 100% desde el celular (transversal) | Todos los módulos usables en el celular, cámara como escáner principal sin accesorios, lector Bluetooth HID opcional, SQLite local en el celular | Envoltorio nativo (Capacitor) si las pruebas en iOS lo exigen (P1/P2)
OF2 | Venta offline | Venta por cámara, lector BT/USB y búsqueda de texto local; stock descontado localmente; cobro en la caja | Venta de respaldo por foto offline (P2: requiere modelo en el dispositivo)
OF3 | Catálogo local | Productos, códigos, precios, stock conocido, ubicaciones y miniaturas en el dispositivo; búsqueda difusa local | Precarga selectiva de fotos en alta resolución (P1)
OF4 | Cola de sincronización (outbox) y sincronización automática | Cola durable, envío automático al volver la conexión, idempotencia, reintentos, detección de huecos | Sincronización en segundo plano con la app cerrada donde la plataforma lo permita (P1, a verificar)
OF5 | Indicador de estado | Online / Offline / Sincronizando / Con problemas, cantidad pendiente, última sincronización | Panel de diagnóstico de sincronización para el dueño (P1)
OF6 | Consistencia de stock y sobreventa | Stock como suma de movimientos, merge sin pisadas, stock negativo aceptado y marcado, alerta al sincronizar | Reserva de stock por dispositivo para productos críticos (P2)
OF7 | Caja offline | Apertura, cobros y egresos con los 5 medios, cierre manual offline, cierre automático a la hora de corte calculado al sincronizar con resumen marcado como tardío | Reversiones de caja offline con aprobación posterior (P2)
OF8 | Auditoría de operaciones offline | Hora del dispositivo + hora de recepción del servidor, usuario, dispositivo, secuencia por dispositivo, desfasaje de reloj; cadena de hashes aplicada al sincronizar (si está activa) | Cadena de hashes local por dispositivo verificada por el servidor (P2)
OF9 | Sesión y autenticación offline | Permiso offline firmado, limitado en el tiempo y atado al dispositivo; acciones sensibles solo online | PIN local para cambiar de usuario offline en dispositivos compartidos (P1, alineado con F8.3)
OF10 | Alta y edición de productos offline | Alta mínima al escanear un código inexistente con ID temporal mapeado al sincronizar; fusión de duplicados por código | Edición offline de campos no sensibles con reglas por campo (P1)
OF11 | Fotos en cola | Fotos de productos y de facturas guardadas localmente comprimidas y subidas al volver la conexión | Subida solo por Wi-Fi configurable (P1)
OF12 | Bot de WhatsApp con el comercio offline | Respuestas con los últimos datos sincronizados y aviso de desactualización | Estimación de ventas pendientes en la respuesta (P1)
OF13 | Puesta al día del bot al reconectar | Un solo mensaje combinado y deduplicado con alertas y resúmenes pendientes | Preferencias de qué incluir en la puesta al día (P1)
OF14 | Límites, cuota y seguridad del dispositivo | Duración máxima offline, cuota de almacenamiento, base local cifrada en dispositivos compartidos, borrado remoto al revocar | Almacenamiento seguro del sistema operativo vía envoltorio nativo (P2)
OF15 | Otros módulos offline | Carga de mercadería, egresos (rotura, vencimiento), consulta de pedidos, foto de factura de proveedor en cola | Devoluciones offline de ventas del propio dispositivo (P1); recepción de pedidos offline (P1)
OF16 | Entidades nuevas de v1 offline | Fiado (ventas a cuenta y cobros, control del tope contra el saldo local), entregas de turno, conteo por sector, promos y combos (sincronizadas con anticipación) y lotes con FEFO (lote elegido al sincronizar) | Reserva de cupo de fiado por dispositivo (P2)

Módulo | Offline en el MVP | Requiere conexión | Más adelante
--- | --- | --- | ---
Inventario: carga de mercadería y egresos (rotura, vencimiento, consumo) | ✔ como movimientos en la cola | Compensatorios | 
Inventario: ubicaciones (F9) | ✔ consulta | Crear, renombrar, archivar | Cambio de ubicación offline (P1)
Pedidos de reposición (F5) | ✔ consulta del último estado | Armar, confirmar, enviar, marcar pagado | Borrador offline (P1)
Devoluciones (F10, C14) | ✘ | ✔ | Devoluciones offline de ventas del propio dispositivo, validadas al sincronizar (P1)
Facturas de proveedores | ✔ foto en cola (OF11) | OCR, confirmación y vínculo con pedidos | 
Consumos de servicios | No aplica (ocurre en la nube, desde el email) | ✔ | 
Órdenes de pago | ✘ (las prepara el bot; pagar requiere internet igual) | ✔ | 
Historial y trazabilidad (F3) | ✔ movimientos locales y lo descargado | Historial completo, exportaciones | 
Caja (C1 a C14) | Ver OF7 | Reversiones, corrección de apertura, configuración | 

Opción | Dónde | Pros | Contras / a verificar
--- | --- | --- | ---
SQLite WASM (build oficial de sqlite.org) sobre OPFS (VFS opfs-sahpool), en un Web Worker | PWA en el celular (Android e iOS) y en la PC | SQL real, transacciones ACID, índices, FTS5 para la búsqueda, mismo esquema en todos lados, buen rendimiento | Soporte de OPFS y de los "sync access handles" en Safari iOS y en la PWA instalada [a verificar en dispositivos reales]; el VFS opfs-sahpool no requiere encabezados COOP/COEP, la variante opfs sí [a verificar]; tamaño del WASM (aprox. 1 MB)
Envoltorio nativo (Capacitor) + SQLite nativo (por ejemplo, @capacitor-community/sqlite, con SQLCipher) | App publicada en tiendas, misma base de código Astro | SQLite nativo con cifrado SQLCipher, almacenamiento no expulsable, Keychain/Keystore para la clave, más tareas en segundo plano | Publicación en tiendas y su costo/tiempo; dos canales de distribución; plan B si OPFS en iOS no alcanza (P1/P2)
IndexedDB con Dexie.js | Navegadores sin OPFS adecuado (fallback) y metadatos chicos | Muy compatible, maduro, liveQuery reactivo, fácil | Sin SQL; búsqueda difusa con una librería aparte (MiniSearch / Fuse.js); el cifrado se hace a nivel de aplicación

Tabla | Campos principales
--- | ---
sync_receipts | op_id (PK, UUID), device_id, device_seq, user_id, tipo_op, estado (aplicada / rechazada / cuarentena), motivo, resultado (JSON: IDs definitivos), sync_batch_id, client_occurred_at, recibido_at (timestamptz del servidor), clock_skew_ms; append-only
device_sync_state | device_id, ultimo_seq_contiguo, ultimo_push_at, ultimo_pull_cursor, ultimo_latido_at, pendientes_informados, version_app
id_mappings | temp_id, entidad, id_definitivo, device_id, created_at
stock_anomalies | id, product_id, tipo (stock_negativo / ajuste_sobre_stock_cambiado / precio_desactualizado / producto_duplicado), stock_resultante, movimientos (ids), estado (abierta / resuelta), resuelta_por, resuelta_at, created_at
sync_quarantine | op_id, motivo (usuario_revocado / dispositivo_dado_de_baja / permiso_vencido), payload, decision (aceptada / rechazada), decidido_por, decidido_at
stock_movements (ampliación) | offline (bool), device_seq, sync_batch_id, clock_skew_ms; client_occurred_at e idempotency_key ya existen (6.3 del PRD principal)
cash_movements (ampliación) | client_occurred_at, offline, device_id, device_seq, sin_verificar (bool, OF7.2)
closing_summaries / cash_days (ampliación) | tardio (bool), generado_at, dispositivos_esperados (JSON); estado de jornada "cerrada, resumen pendiente" (closed_at con valor y sin fila en closing_summaries)
notification_events (ampliación) | dedupe_key (único), agrupar_hasta (timestamptz), tipo nuevo puesta_al_dia

Entidad | Regla | Detalle
--- | --- | ---
Movimientos de stock | Append-only, se combinan (merge) | Nunca hay conflicto: cada movimiento es un hecho con su op_id; el stock es la suma. Los negativos se marcan (OF6.7). Nunca se envía un valor absoluto de stock.
Movimientos de caja | Append-only, se combinan | Igual que los de stock. Saldos = suma. Reversiones solo online.
Apertura de caja | Primera recibida gana | Una apertura por jornada; las demás quedan en la auditoría y sus movimientos se imputan a la jornada (OF7.4).
Cierre de caja | El del servidor | Cierre automático por job; cierre manual offline como intención aplicada si la jornada sigue abierta (OF7.8). Snapshot inmutable, marcado tardío si corresponde.
Precios y costos | Gana el servidor | No se editan offline. La venta conserva el importe cobrado; la diferencia se reporta.
Alta de producto | Fusión por código | ID temporal → definitivo; mismo código = mismo producto (OF10.4).
Edición de producto (P1) | Último que escribe gana, por campo | Cada campo editable lleva su HLC; gana el HLC mayor (desempate por device_id). Campos: nombre, ubicación y nota, umbral, foto principal. Códigos: unión (agregar un código no pisa los otros); un código en conflicto con otro producto se rechaza y se avisa. Precio, costo, proveedor y archivado: solo online. Las ventas offline de un producto archivado mientras el dispositivo estaba offline se aceptan y se marcan.
Fotos | Se agregan | Toda foto subida se suma a product_photos; la foto principal sigue la regla de edición por campo.
Usuarios, permisos, configuración | Solo servidor | No se modifican offline.
Fiado: ventas a cuenta | Append-only, se combinan; saldo recalculado en el servidor | El tope se controla offline contra el saldo local (OF16.1.2). Al sincronizar, el servidor recalcula el saldo; si quedó sobre el tope por ventas de otros dispositivos, la venta se acepta, se marca "sobre el tope (offline)" y se avisa.
Fiado: cobros | Append-only, se conservan todos; saldo recalculado | Dos dispositivos que cobran al mismo cliente sin conexión: se guardan los dos cobros, se recalcula el saldo y, si queda negativo, queda como saldo a favor marcado "saldo negativo, revisar" con aviso al dueño (OF16.1.5, C18.8). Tope y baja de deuda: solo online.
Entrega de turno | Append-only; esperado recalculado en el servidor | Entregas, conteos, rechazos y resoluciones se aplican en orden de hora del dispositivo validada. Si el esperado del servidor difiere del local, se guardan los dos y la entrega queda para revisión del dueño (C17.22). Los estados solo avanzan (pendiente → confirmada / en disputa → resuelta).
Conteo por sector | Líneas append-only; confirmación solo online | Las líneas se combinan por conteo. Si dos dispositivos cargan el mismo producto en el mismo conteo, se guardan las dos y la línea queda "a revisar" antes de confirmar [decisión propuesta]. Stock teórico y diferencias: los calcula el servidor (F13.8).
Promos y combos | Gana el servidor (versión) | No se editan offline; se sincronizan con anticipación (RT12.9). La venta conserva la promo aplicada y lo cobrado; si la promo se había pausado o cambiado en el servidor, o se superó su cupo entre dispositivos, la venta no se modifica y se marca "promo desactualizada" para el reporte de diferencias.
Lotes y FEFO | Lote elegido por el servidor al sincronizar | Los lotes nuevos usan ID temporal mapeado al sincronizar. El lote de cada egreso lo elige el servidor por FEFO, en orden de hora del dispositivo validada; el lote mostrado offline es provisorio (OF16.5). Corrección de fecha y reasignación: solo online.

Riesgo | Impacto | Probabilidad | Mitigación
--- | --- | --- | ---
Safari iOS expulsa o limita el almacenamiento local y se pierden operaciones no sincronizadas | Alto | Media | PWA instalada obligatoria para offline, storage.persist(), sincronización inmediata, detección de huecos; plan B Capacitor + SQLite nativo
OPFS / SQLite WASM con problemas de rendimiento o compatibilidad en algunos celulares | Alto | Media | Spike en Fase 0 con dispositivos reales; fallback a Dexie/IndexedDB detrás de la misma interfaz
Sobreventa entre varios dispositivos offline | Medio | Media (comercios con 2 o más celulares) | Aceptar y marcar, alertas al sincronizar, límite offline, reserva por dispositivo (P2); explicado en la app
Relojes de dispositivos mal configurados | Medio | Alta | Hora oficial del servidor, desfasaje medido por lote, marca "reloj desfasado"
Sesión offline usada por un empleado ya revocado | Medio | Baja | Validez limitada, revalidación al sincronizar, cuarentena
Cobros electrónicos registrados offline que no se concretaron | Medio | Media | Marca "sin verificar", asociación de comprobantes (C13) al reconectar, reporte de cobros sin verificar
Inundación de mensajes del bot al reconectar | Medio | Alta sin mitigación | Un mensaje combinado, deduplicación, agrupación y límite de frecuencia
Resumen de cierre retrasado varios días por un dispositivo que no vuelve | Bajo | Baja | Plazo máximo de espera; lo posterior va como ajuste posterior al cierre
Complejidad del modo offline retrasa el MVP | Alto | Media | Alcance P0 acotado (venta, stock, caja, alta mínima); edición offline y devoluciones a P1
Celular perdido o robado con datos del comercio | Medio | Media | Cifrado en compartidos, baja remota del dispositivo, datos mínimos
Pantallas pensadas para PC que no funcionan bien en el celular (rompe el principio "solo celular") | Alto | Media | Criterio OF1 en todos los PRD, revisión de cada pantalla P0 en 360 px, E2E "solo celular" en CI
Migración de la base local rompe la cola en una actualización | Alto | Baja | Migraciones versionadas, tests de migración, activar el nuevo service worker con cola vacía

Término | Definición
--- | ---
Modo offline | Funcionamiento de la app sin conexión al servidor, con base local y cola
Solo celular | Principio por el cual todo el sistema se opera desde un celular, sin PC
Base local | Base SQLite (o IndexedDB como fallback) en el dispositivo con el catálogo, la cola y los datos de trabajo
Cola / outbox | Tabla local donde cada operación espera a ser confirmada por el servidor
op_id | UUID de una operación generado en el dispositivo; es la idempotency_key en el servidor
device_seq | Número correlativo de las operaciones de un dispositivo, para detectar huecos
Push / pull | Envío de operaciones al servidor / descarga de cambios desde el servidor
Hora del dispositivo (client_occurred_at) | Hora en que se hizo la operación según el reloj del dispositivo; informativa y validada
Hora de recepción (created_at) | Hora oficial asignada por el servidor al recibir la operación
Desfasaje de reloj | Diferencia entre el reloj del dispositivo y el del servidor
Permiso offline | Autorización firmada y limitada en el tiempo para operar sin conexión en un dispositivo
Cuarentena | Estado de una operación recibida que no se aplica hasta que el dueño la revise
Anomalía de stock | Marca creada por el servidor ante stock negativo u otras inconsistencias tras sincronizar
ID temporal | Identificador provisorio de un producto creado offline, reemplazado por el definitivo
Resumen de cierre tardío | Resumen de cierre generado al sincronizar dispositivos que estaban offline a la hora de corte
Puesta al día | Mensaje único del bot con las alertas y resúmenes pendientes después de una reconexión
Latido | Señal periódica del dispositivo al servidor con su estado de sincronización
HLC | Reloj lógico híbrido, usado para decidir "el último que escribe gana" por campo
OPFS | Origin Private File System: almacenamiento de archivos privado del navegador, usado por SQLite WASM
