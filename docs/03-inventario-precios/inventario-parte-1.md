> Origen: `PRD - Sistema de Inventario para Kioscos y Comercios (Parte 1).docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/inventario`, `src/pages/api/stock/*`, `src/db/schema.ts`

---

# PRD - Sistema de Inventario para Kioscos y Comercios

Documento dividido en 3 partes por tamaño (Parte 1 de 3). Parte 1: secciones 1 a 4 (F1 a F7). Parte 2: sección 4 (F8 a F14) y sección 5 (flujos de usuario). Parte 3: secciones 6 a 10 y Anexo A (glosario). La numeración es continua entre las partes.

## 1. Resumen / visión general

### 1.1 Problema

La mayoría de los kioscos, almacenes, maxikioscos y comercios chicos de Argentina controlan el stock "de memoria", con un cuaderno o con una planilla de Excel que nadie actualiza. Las consecuencias son conocidas:

Se quedan sin los productos que más rotan (gaseosas, cigarrillos, golosinas) y pierden ventas.

Compran de más lo que no rota y se les vence o les inmoviliza plata.

No saben cuánto ganan por producto, porque el precio de venta se actualiza "a ojo" cuando sube el costo (algo frecuente con la inflación).

No pueden detectar faltantes: ventas que no se registraron, mercadería rota, vencida o robada.

Arman el pedido al proveedor a mano, mirando la góndola, y lo mandan por WhatsApp escribiendo producto por producto.

Los sistemas de gestión existentes (ERP, POS completos) son caros, complejos y están pensados para comercios más grandes. El dueño de un kiosco necesita algo que se aprenda en 10 minutos y que funcione desde el celular.

### 1.2 Visión

Un sistema de inventario simple, rápido y mobile-first que permita al dueño de un comercio chico:

Cargar mercadería escaneando el código de barras con la cámara del celular o con un lector USB.

Saber en todo momento qué tiene, cuánto le costó y cuánto gana.

Recibir alertas cuando un producto está por agotarse y armar el pedido al proveedor en segundos.

Mandar el pedido por WhatsApp o email con un toque.

Hacer todo desde el celular, sin necesitar una computadora.

Principio: 100% operable desde el celular. El sistema se puede usar completo con un solo celular: la misma app (PWA) instalada en el teléfono permite vender escaneando con la cámara, cargar y ajustar stock, sacar fotos de productos, configurar el comercio, proveedores, ubicaciones y usuarios, operar la caja, registrar facturas y usar todos los demás módulos, incluso sin conexión (modo offline con base SQLite local en el teléfono, según el "PRD - Modo Offline para Sistema de Inventario"; desde la primera versión, el MVP, se puede vender, descontar stock y registrar cobros en la caja sin conexión). La PC y el lector láser/USB son opcionales: aceleran el mostrador si el comercio ya los tiene, y también se puede emparejar un lector Bluetooth al celular.

### 1.3 Propuesta de valor

"Escaneá, cargá y pedí. Sabé qué tenés, cuánto ganás y qué te falta, desde el celular."

### 1.4 Modelo de negocio (propuesto)

SaaS multi-tenant con suscripción mensual en ARS (con ajuste periódico) o USD, cobrada por Mercado Pago (débito automático) o transferencia.

Prueba gratis de 14 días sin tarjeta.

Planes sugeridos (a validar): Básico (1 comercio, 2 usuarios, hasta 1.000 productos) y Pro (más usuarios, más productos, reportes, varios comercios).

Autoservicio: el comercio se registra solo, sin implementación a medida (diferencia clave con ModoOps, que se vende por consultoría).

## 2. Objetivos y no-objetivos

### 2.1 Objetivos

### 2.2 No-objetivos (fuera de alcance, al menos en MVP)

No es un punto de venta (POS) completo ni emite facturas electrónicas de AFIP/ARCA. En el MVP las ventas se registran como "egresos por venta" simples (o se importan), con importe y ganancia calculados (ver F2.10 a F2.13); la integración fiscal queda para fases posteriores o para partners.

No gestiona contabilidad, sueldos, cuentas corrientes de clientes ni libro IVA.

No es un e-commerce ni sincroniza con Mercado Libre / Tienda Nube en el MVP.

No hace compras automáticas: el sistema sugiere el pedido, pero siempre lo confirma una persona.

No maneja varios depósitos en el MVP. (Los lotes con fecha de vencimiento, antes previstos para una fase posterior, entran en el MVP por decisión del dueño del 9/10/2026: ver F12.)

No reutiliza Odoo ni el stack de ModoOps: es una base de código nueva, liviana y propia.

## 3. Usuarios objetivo

### 3.1 Persona 1: dueño/a del kiosco o comercio

Perfil: 30 a 60 años, atiende el mostrador o tiene 1 a 3 empleados. Usa WhatsApp todo el día, Mercado Pago y home banking. Poca paciencia con sistemas complejos.

Dispositivos: celular Android de gama media (principal; puede ser el único dispositivo, ver F11), a veces una PC o notebook en el mostrador con lector de código de barras USB, o un lector Bluetooth emparejado al celular (ambos opcionales).

Necesidades: saber qué le falta, cuánto gana, que los empleados no "se coman" mercadería, pedirle rápido al proveedor, actualizar precios cuando sube el costo.

Frustraciones: sistemas caros, complicados, que piden muchos datos; planillas que se desactualizan; no saber quién movió qué.

Permisos en el sistema: total (rol Dueño): productos, costos, precios, proveedores, pedidos, usuarios, configuración y suscripción.

### 3.2 Persona 2: empleado/a

Perfil: 18 a 35 años, atiende el mostrador por turnos, recibe la mercadería del proveedor y repone góndola.

Dispositivos: su propio celular o el celular/PC del comercio.

Necesidades: cargar mercadería rápido cuando llega el proveedor, registrar egresos (venta, rotura, vencimiento), buscar un producto y su precio.

Permisos en el sistema (rol Empleado): ver productos y precios de venta, registrar ingresos y egresos de stock, crear productos nuevos al escanear (configurable). No ve costos ni márgenes (configurable), no edita proveedores, no confirma pedidos, no gestiona usuarios.

### 3.3 Usuario interno: administrador de la plataforma (equipo propio)

Gestiona los tenants desde un Control Plane (alta, plan, suspensión por falta de pago, soporte). No es un usuario del comercio y nunca opera dentro del stock de un cliente sin permiso explícito.

## 4. Funcionalidades

### 4.0 Priorización

### F1. Inventario (P0)

Descripción: catálogo de productos del comercio con su stock actual, editable, con foto y búsqueda rápida.

### Requerimientos:

F1.1 Alta de producto con: nombre (obligatorio), código de barras / código interno (opcional pero único por comercio), foto (opcional, una por producto), categoría (opcional), proveedor (opcional), costo, precio de venta, stock actual, umbral de stock bajo, unidad de pedido (unidad / caja / monto) y unidades por caja.

F1.2 Edición de cualquier dato del producto. Los cambios de stock hechos desde la ficha generan siempre un movimiento de tipo "ajuste manual" en el historial (F3), con motivo opcional.

F1.3 Foto por producto: tomarla con la cámara del celular o subirla desde la galería/PC. Se comprime en el cliente (máx. ~200 KB, 800 px) antes de subirla. Si no hay foto, se muestra un placeholder con las iniciales.

F1.4 Listado de productos con foto miniatura, nombre, stock, precio y un indicador visual de stock bajo.

F1.5 Búsqueda por nombre (parcial, sin distinguir mayúsculas ni tildes) y por código. Filtros: categoría, proveedor, "solo stock bajo", "sin stock".

F1.6 Archivar (baja lógica) un producto; no se borra para conservar el historial.

F1.7 Ingreso y egreso rápido desde el listado (botones + / -), con motivo en el egreso: venta, rotura, vencimiento, consumo interno, otro.

F1.8 Foto con cámara al crear el producto: el formulario de alta (tanto el alta normal como la creación en el momento tras escanear un código inexistente, F2.6) tiene, junto al campo de código de barras / código, un botón "Sacar foto" que abre la cámara del dispositivo ahí mismo, sin salir del formulario:

Celular (PWA): cámara trasera por defecto, con vista previa en vivo.

PC: webcam si está disponible; si no hay cámara o no se da permiso, subir archivo (o elegir de la galería en el celular) como alternativa.

Vista previa de la foto tomada con opciones Repetir y Usar foto; la foto se comprime en el cliente (F1.3: máx. ~200 KB, 800 px) antes de subirla.

La foto sigue siendo opcional: no bloquea el guardado del producto; si la subida falla o no hay conexión, el producto se guarda igual y la foto queda en cola para subirse después.

Las fotos de producto alimentan el catálogo visual que usa la búsqueda por foto (F2.13).

### Criterios de aceptación:

☐ Puedo crear un producto con solo el nombre y queda visible en el listado inmediatamente.

☐ No puedo crear dos productos activos con el mismo código en el mismo comercio; el sistema me avisa y me ofrece abrir el existente.

☐ Al cambiar el stock de 10 a 7 desde la ficha, el stock queda en 7 y aparece en el historial un movimiento "ajuste manual -3" con mi usuario, fecha y hora.

☐ Puedo sacar una foto desde el celular y en menos de 5 segundos (con 4G) se ve en la ficha y en el listado.

☐ Al crear un producto (alta normal o tras escanear un código inexistente) toco "Sacar foto" junto al campo de código, se abre la cámara dentro del formulario, saco la foto, la veo en vista previa, puedo repetirla y al tocar "Usar foto" queda asociada al producto sin perder lo que ya había completado.

☐ En una PC con webcam puedo sacar la foto desde el navegador; en una PC sin webcam (o si niego el permiso) se me ofrece subir un archivo.

☐ Una foto de 4 MB tomada con el celular se sube comprimida (máx. ~200 KB, 800 px).

☐ Si no saco foto o la subida falla, el producto se crea igual; la foto pendiente se sube sola al volver la conexión.

☐ La foto cargada al crear el producto queda disponible para la búsqueda por foto (F2.13).

☐ Al buscar "alfajor" encuentro "Alfajor Jorgito", "ALFAJOR havanna" y "Alfajór triple" en menos de 1 segundo con 1.000 productos.

☐ Al buscar por un código exacto, el producto aparece como primer resultado.

☐ Un producto archivado no aparece en el listado por defecto, pero su historial sigue disponible.

☐ El stock no puede quedar negativo salvo que el dueño lo habilite en la configuración; si queda negativo, se marca en rojo.

### F2. Escaneo de código de barras / código de producto (P0)

Descripción: carga rápida de mercadería escaneando el código del producto o de la caja, ingresando la cantidad, y creación del producto en el momento si el código no existe. Incluye la venta por escaneo (Modo venta) y dos métodos de venta de respaldo para cuando el lector no funciona o no lee el producto.

### Requerimientos:

F2.0 Jerarquía de métodos para identificar un producto (para vender, cargar mercadería o registrar un producto nuevo), en orden de preferencia:

Lector láser / USB / Bluetooth (F2.2): método principal en el mostrador cuando el comercio tiene uno (conectado a la PC o emparejado por Bluetooth al celular). Es opcional: el sistema funciona completo sin lector (F11).

Escaneo en vivo con la cámara del celular (F2.1, app móvil PWA): método principal si se opera solo con el celular y no hay lector; primer respaldo si el lector falla o no está conectado.

Búsqueda manual de texto (F2.12): si ningún escaneo lee el código (código dañado, producto sin código, etiqueta ilegible).

Reconocimiento por foto (F2.13, P1): último recurso desde el celular cuando tampoco se encuentra por texto. La pantalla de venta y la de carga ofrecen siempre el siguiente método de la jerarquía con un toque ("¿No lee? Usar cámara / Buscar / Foto"). Los cuatro métodos terminan en el mismo paso de confirmación y producen exactamente el mismo resultado.

F2.1 Escaneo con la cámara del celular desde el navegador (EAN-13, EAN-8, UPC-A, UPC-E, Code 128, QR como mínimo). Es escaneo en vivo (lectura continua del video, no una foto) y funciona como respaldo del lector láser/USB (F2.0) tanto en la venta (F2.10) como al leer el código cuando se carga mercadería o se registra un producto nuevo (F2.6, F1.8). Botón "Escanear con cámara" visible en la pantalla de venta, en la de carga y junto al campo de código del formulario de alta.

F2.2 Escaneo con lector USB/Bluetooth (modo teclado), conectado a una PC o emparejado por Bluetooth al celular (Android o iPhone): un campo de búsqueda siempre enfocado que detecta la entrada rápida terminada en Enter y la trata como un escaneo.

F2.3 Ingreso manual del código como alternativa (código dañado, producto suelto, código interno propio).

F2.4 Código existente: muestra el producto (foto, nombre, stock actual) y pide la cantidad con un teclado numérico grande. Se elige si la cantidad es en unidades o en cajas (si el producto tiene unidades por caja). Se elige la operación: ingreso (por defecto en "Modo carga") o egreso.

F2.5 Código asociado a una caja: un producto puede tener un código de unidad y uno o más códigos de caja/bulto (ej.: la caja de 24 chocolates tiene un EAN distinto al chocolate suelto). Al escanear el código de la caja, la cantidad ingresada se multiplica automáticamente por las unidades por caja.

F2.6 Código inexistente: el sistema ofrece "Crear producto con este código". Se abre un formulario corto con el código precargado: nombre, foto (opcional, con el botón "Sacar foto" que abre la cámara ahí mismo, ver F1.8), si el código corresponde a unidad o caja, unidades por caja, costo, precio (opcionales) y cantidad a ingresar. Al guardar, el producto se crea y el ingreso de stock queda registrado en un solo paso.

F2.7 Modo carga continua: después de confirmar, la cámara/lector vuelve a quedar listo para el siguiente escaneo, sin volver al menú.

F2.8 Feedback: sonido/vibración al leer un código y confirmación visual ("+24 Chocolate Águila. Stock: 31").

F2.9 El rol Empleado puede crear productos al escanear solo si el dueño lo habilita; si no, el producto queda en estado "pendiente de revisión" para el dueño.

F2.10 Venta por escaneo (Modo venta, P0): el egreso por venta (F1.7, Flujo 7) se formaliza como una venta mínima dentro del escaneo, sin ser un POS completo (ver 2.2). En "Modo venta" se escanea el producto, se ingresa la cantidad (por defecto 1; unidades o cajas como en F2.4) y se confirma. Cada venta, en una sola transacción:

descuenta el stock (movimiento "egreso por venta", F3);

registra el importe de la venta = precio de venta vigente × cantidad (el precio se puede editar en la venta si el dueño lo habilita) y lo suma al total de ventas del día/turno (y, si el módulo Caja Digital está activo, como ingreso por venta según ese PRD);

calcula la ganancia = (precio de venta − costo unitario) × cantidad, con el precio y el costo congelados al momento de la venta (F7);

guarda el movimiento con usuario, fecha y hora y el método de identificación usado (lector, cámara, búsqueda manual, foto).

F2.11 Equivalencia de los métodos de venta: toda venta, venga del lector, del escaneo con cámara o de un método de respaldo (F2.12, F2.13), pasa por la misma confirmación y la misma lógica de F2.10. No hay diferencias de stock, importe, ganancia ni registro según el método; solo cambia el campo "método de identificación".

F2.12 Venta de respaldo 1: búsqueda manual de texto (web y móvil, P0): en la pantalla de venta hay un campo "Buscar producto" donde el comerciante escribe la descripción o el número de código:

Por nombre: búsqueda difusa (sin distinguir mayúsculas ni tildes, tolerante a errores de tipeo y palabras en otro orden, ej.: "cocacola 500", "alfajor jorjito").

Por código: coincidencia exacta primero y parcial después (ej.: los últimos 4 a 6 dígitos impresos debajo del código dañado), sobre códigos de unidad y de caja (F2.5).

Resultados mientras se tipea (máx. ~10) con foto, nombre, código, precio y stock; navegables con teclado (flechas + Enter) en la PC del mostrador.

Se elige un resultado, se ingresa la cantidad y se confirma la venta (F2.10). Si no hay resultados, se ofrece buscar por foto (F2.13, en el celular) o crear el producto (F2.6 / F2.9).

F2.13 Venta de respaldo 2: búsqueda por foto en la app móvil (P1, a validar): en la misma app de gestión instalada en el celular (PWA Astro), la pantalla de venta tiene un botón "Buscar por foto" que abre la cámara; el comerciante fotografía el producto y el sistema lo identifica en dos pasos:

Decodificar el código de barras desde la foto (aunque el lector o el escaneo en vivo no lo hayan leído; la foto fija permite más resolución y reintentos). Si se decodifica y existe, se muestra ese producto para confirmar.

Si no hay código legible, comparación visual contra las fotos del catálogo del comercio (F1.3, F1.8) y muestra los 3 a 5 candidatos más parecidos con su foto, nombre, precio y nivel de confianza.

El comerciante siempre confirma el candidato (nunca se vende automáticamente), ingresa la cantidad y se completa la venta (F2.10). Si ninguno es correcto, se pasa a la búsqueda manual (F2.12).

Opcionalmente, al confirmar se ofrece guardar la foto como foto adicional del producto para mejorar futuras coincidencias.

A validar: el enfoque de reconocimiento visual y su precisión (ver 6.10); el objetivo inicial es que el producto correcto aparezca entre los 3 primeros candidatos en el 80% de los casos con buena luz, a confirmar en Fase 0/2.

### Criterios de aceptación:

☐ Con un Android de gama media y buena luz, la cámara lee un EAN-13 en menos de 2 segundos.

☐ Con un lector USB conectado a una PC, al escanear un código existente se abre el producto sin hacer clic en ningún campo.

☐ Escaneo la caja de chocolates (código de caja, 24 unidades por caja), ingreso "2" y el stock sube 48 unidades; en el historial queda "Ingreso +48 (2 cajas)".

☐ Escaneo un código que no existe, completo nombre y cantidad 12, guardo, y el producto queda creado con ese código y stock 12, en menos de 30 segundos en total.

☐ Si vuelvo a escanear ese mismo código, el sistema ya lo reconoce.

☐ Si la cámara no tiene permiso, el sistema explica cómo habilitarlo y ofrece el ingreso manual.

☐ En modo carga continua puedo escanear 10 productos distintos seguidos sin salir de la pantalla.

☐ Con el lector láser/USB conectado, la pantalla de venta lo usa como método principal; si el lector no lee, con un toque paso a "Escanear con cámara" en el celular, después a "Buscar" y, en el celular, a "Buscar por foto", en ese orden.

☐ Sin lector conectado, abro la app en el celular, toco "Escanear con cámara", apunto a un EAN-13 y el producto aparece para vender en menos de 2 segundos (buena luz, Android de gama media), sin sacar foto.

☐ Al registrar un producto nuevo puedo leer su código con la cámara del celular (escaneo en vivo) desde el botón junto al campo de código, y el código queda precargado.

☐ (Modo venta) Vendo 2 unidades de un producto con costo $1.000, precio $1.400 y stock 10: el stock queda en 8, el total de ventas sube $2.800, la ganancia registrada es $800 y el historial muestra "Egreso por venta -2" con mi usuario, fecha, hora y método "lector".

☐ Si después cambia el precio o el costo del producto, la ganancia de esa venta ya registrada no cambia.

☐ La misma venta hecha por escaneo con cámara, búsqueda manual o búsqueda por foto deja exactamente el mismo stock, importe, ganancia y movimiento; solo cambia el método de identificación.

☐ (Búsqueda manual) Escribo "alfajor jorjito" (con error de tipeo) y aparece "Alfajor Jorgito" entre los primeros resultados en menos de 300 ms con 5.000 productos.

☐ Escribo el código completo de un producto y aparece primero; escribo solo los últimos 5 dígitos y aparece entre los resultados.

☐ En la PC del mostrador puedo buscar, elegir con las flechas, poner la cantidad y confirmar la venta sin usar el mouse.

☐ Si la búsqueda no encuentra nada, se me ofrece buscar por foto (en el celular) o crear el producto.

☐ (P1, búsqueda por foto) Fotografío un producto con el código visible pero que el lector no leyó: el sistema decodifica el código desde la foto y me muestra ese producto para confirmar.

☐ (P1) Fotografío un producto sin código legible: en menos de 3 segundos (4G) veo hasta 5 candidatos con foto y confianza; elijo uno, pongo la cantidad y la venta se registra igual que un escaneo.

☐ (P1) La venta nunca se confirma sin que yo elija un candidato; si ninguno es correcto, paso a la búsqueda manual con un toque.

☐ (P1, a validar) El producto correcto aparece entre los 3 primeros candidatos en al menos el 80% de las pruebas con buena luz sobre un catálogo con fotos.

### F3. Historial de movimientos y auditoría inmutable (P0)

Descripción: registro inmutable (solo se agregan registros, nunca se editan ni se borran) de cada movimiento de stock: qué producto, cuánto, por qué, cuándo (fecha y hora del servidor), quién (usuario) y desde dónde (origen y dispositivo). El objetivo es que el comerciante tenga una prueba verificable de que los números del sistema son correctos: cuando duda de un stock o de una diferencia, puede reconstruir paso a paso cómo se llegó a ese número, quién hizo cada movimiento y desde qué canal, y exportarlo (CSV o PDF) para sus registros, un reclamo o una auditoría.

### Requerimientos:

F3.1 Cada cambio de stock genera un movimiento con: producto, lote (si el producto controla vencimiento, F12), tipo (ingreso/carga, egreso por venta, egreso por rotura/vencimiento/consumo, ajuste manual, ajuste por conteo (F13), ingreso por pedido recibido, devolución de cliente, egreso por merma de devolución, movimiento compensatorio), cantidad (+/-), stock anterior, stock resultante, usuario, fecha y hora, origen y nota opcional. Las ventas (F2.10) guardan además: precio unitario, costo unitario, importe, ganancia y método de identificación (lector, cámara, búsqueda manual, foto).

F3.2 Los movimientos son inmutables: no se editan ni se borran, ni desde la app, ni desde la API, ni por el dueño, ni por el equipo de soporte. Un error se corrige con un movimiento compensatorio (ver F3.8).

F3.3 Vista de historial general con filtros por fecha, producto, usuario y tipo.

F3.4 Vista de historial dentro de la ficha de cada producto.

F3.5 Los cambios de costo, precio y ubicación (F9) también quedan registrados (quién, cuándo, valor anterior y nuevo) en un log de auditoría separado.

F3.6 Alcance completo: todo movimiento de stock queda registrado sin excepción, cualquiera sea su origen: venta (Modo venta y egreso por venta, F2.10, F1.7), carga/ingreso de mercadería (F2.4 a F2.7, alta con stock inicial F2.6), egreso por rotura, vencimiento, consumo interno u otro (F1.7, Flujo 7), ajuste manual desde la ficha (F1.2), recepción de pedido (F5.8) y devolución de cliente (F10, incluido su camino a merma). No existe ningún camino (pantalla, API, importación, job, bot) que cambie el stock sin insertar un movimiento.

F3.7 Cuándo, quién y desde dónde (obligatorios en cada movimiento):

Fecha y hora: sello de tiempo asignado por el servidor al registrar el movimiento (timestamptz), nunca el reloj del dispositivo; se muestra en la zona horaria America/Argentina/Buenos_Aires. Si el movimiento se hizo offline y se sincronizó después (6.2), se guarda además la hora informada por el dispositivo al momento de la operación, y la vista muestra ambas ("hecho 18:05 en el dispositivo, registrado 18:40").

Quién: usuario autenticado que hizo el movimiento (nombre y rol al momento del movimiento). Los movimientos automáticos se atribuyen al sistema ("Sistema – job") y, si los disparó una persona (por ejemplo, una recepción de pedido), también a esa persona.

Desde dónde (origen): uno de web PC, app móvil, lector láser/USB, cámara del celular, búsqueda de texto, búsqueda por foto, bot de WhatsApp o job automático.

Dispositivo: identificador del dispositivo si está disponible (ID de instalación de la PWA, navegador y sistema operativo, nombre del dispositivo asignado por el comercio, ej.: "PC mostrador", "Celular de Juan"); en el bot de WhatsApp, el número de origen enmascarado.

F3.8 Correcciones por movimiento compensatorio: para corregir un error se crea un movimiento nuevo de tipo "compensatorio" con la cantidad opuesta (total o parcial), un motivo obligatorio y la referencia al movimiento original. El original no se modifica; en la vista se muestra vinculado ("corregido por #1234" / "corrige a #1201"). Solo el rol Dueño (o un empleado con permiso) puede crear compensatorios. Un movimiento no puede compensarse por más de su cantidad original.

F3.9 Stock reconstruible: el stock actual de cada producto es siempre igual a la suma de todos sus movimientos (desde el stock inicial). El sistema puede reconstruir el stock de cualquier producto en cualquier fecha y hora pasada sumando los movimientos hasta ese momento, y verifica la coincidencia entre el stock guardado y la suma de movimientos (ver 6.11). Si alguna vez no coinciden, se genera una alerta interna y no se corrige el número en silencio.

F3.10 Vista "Ver trazabilidad" por producto: desde la ficha del producto, el listado y las alertas, un botón "Ver trazabilidad" abre la línea de tiempo completa de ese producto: cada movimiento con fecha y hora, tipo, cantidad, stock anterior y resultante, usuario, origen, dispositivo, nota y vínculos (pedido, venta, compensatorio). Incluye:

Filtros: rango de fechas, tipo de movimiento, usuario, origen y dispositivo.

Saldo corrido: el stock resultante después de cada movimiento, para seguir cómo se llegó al número actual.

"Stock al momento": elegir una fecha y hora y ver el stock reconstruido a ese momento y los movimientos posteriores.

Resumen del período filtrado: stock al inicio, total de ingresos, total de egresos (por motivo), ajustes y compensatorios, y stock al final, con la comprobación "stock inicial + movimientos = stock final".

Exportación de lo que se ve (con los filtros aplicados) a CSV/Excel y a PDF (ver F3.12).

F3.11 (P1) Evidencia contra manipulación (cadena de hashes): cada movimiento guarda un hash calculado sobre sus datos y el hash del movimiento anterior del mismo comercio, formando una cadena. Cualquier alteración o borrado de un movimiento rompe la cadena y es detectable. La vista de trazabilidad muestra el estado "Integridad verificada" (o el punto exacto donde la cadena no coincide) y cada exportación incluye el código de verificación (hash del último movimiento incluido) para poder comprobarla después.

F3.12 Exportar el historial a PDF: el comerciante puede exportar a PDF el historial completo o uno filtrado (por producto, rango de fechas, tipo de movimiento, usuario y origen), desde el historial general (F3.3) o desde "Ver trazabilidad" (F3.10), para sus propios registros, reclamos o auditorías. El PDF incluye:

Nombre del comercio (y CUIT si está cargado).

Fecha y hora de generación (America/Argentina/Buenos_Aires) y quién lo generó (usuario).

Filtros aplicados (o "Historial completo").

El detalle de los movimientos (fecha y hora, producto, tipo, cantidad, stock anterior y resultante, usuario, origen, dispositivo, nota, referencias a compensatorios).

Un resumen de totales: cantidad de movimientos, total de ingresos, egresos por motivo, ajustes y compensatorios, y (si se filtró por producto) stock al inicio y al final del período.

El hash / código de verificación de los movimientos incluidos, si la cadena de hashes (F3.11) está activa.

Numeración de páginas ("página 3 de 12") e identificador único del reporte.

La generación del PDF queda registrada en el log de auditoría (quién, cuándo, filtros). Solo el rol Dueño (o un empleado con permiso) puede exportar; los costos y ganancias se incluyen solo si quien exporta tiene permiso para verlos (F7.6).

F3.13 Cobertura de auditoría de las funciones nuevas: quedan también en el historial inmutable (append-only, con usuario, fecha y hora del servidor, origen y dispositivo, y en la cadena de hashes cuando esté activa, F3.11):

los ajustes por conteo (F13): cada movimiento ajuste_conteo en stock_movements, y la confirmación o cancelación del conteo en el audit_log, con quién contó y quién confirmó;

los cambios de vencimiento de un lote (F12): fecha anterior y nueva, cambios de estado del lote y activación o desactivación del flag "controla vencimiento", en el audit_log; la baja por vencido es un movimiento de stock;

la creación y edición de promos y combos (según el PRD de Rotación): alta, cambios de condiciones, precio o vigencia, activación y baja, con valores anteriores y nuevos;

los cambios de tope de fiado por cliente (según el PRD de Caja Digital / fiado): tope anterior y nuevo y quién lo cambió;

los rechazos de una entrega de turno (según el PRD de Caja Digital, C17): quién rechazó, motivo y diferencias informadas. Ninguno de estos registros se edita ni se borra; las correcciones son registros nuevos.

### Criterios de aceptación:

☐ Cualquier cambio de stock, venga de donde venga, aparece en el historial; no existe forma de cambiar el stock sin dejar rastro.

☐ Puedo filtrar "todo lo que cargó Juan la semana pasada" y ver la lista con fecha, hora, producto y cantidad.

☐ Un empleado no puede borrar ni editar movimientos.

☐ La suma de los movimientos de un producto coincide siempre con su stock actual.

☐ El historial de un producto con 5.000 movimientos carga la primera página en menos de 1 segundo.

☐ Una venta, una carga, un egreso por rotura, un ajuste manual y una recepción de pedido aparecen todos en el historial, cada uno con fecha y hora, usuario, origen y (si está disponible) dispositivo.

☐ Vendo un producto escaneándolo con el lector USB en la PC del mostrador y el movimiento muestra origen "lector láser/USB" y dispositivo "PC mostrador"; la misma venta hecha por búsqueda de texto en el celular muestra origen "búsqueda de texto" y el dispositivo del celular.

☐ Un movimiento registrado por el bot de WhatsApp muestra origen "bot de WhatsApp"; uno generado por un job muestra origen "job automático" y usuario "Sistema".

☐ Si cambio la hora de mi celular y registro un movimiento, la fecha y hora del movimiento es la del servidor (America/Argentina/Buenos_Aires), no la del celular.

☐ Un movimiento hecho offline a las 18:05 y sincronizado a las 18:40 muestra las dos horas.

☐ Ni siquiera el dueño ve opciones de editar o borrar un movimiento; un intento de UPDATE o DELETE directo sobre la tabla de movimientos (API o base de datos) es rechazado.

☐ Corrijo una carga de +24 que en realidad era +12 creando un compensatorio de -12 con motivo; el original sigue intacto, ambos aparecen vinculados y el stock queda correcto.

☐ No puedo crear un compensatorio sin motivo ni sin referenciar un movimiento original, ni compensar más que la cantidad original.

☐ En "Ver trazabilidad" de un producto elijo "stock al 1/10 a las 20:00" y el sistema me muestra el stock reconstruido a ese momento, coincidente con la suma de los movimientos hasta esa hora.

☐ El resumen del período muestra "stock inicial + ingresos − egresos ± ajustes = stock final" y la cuenta cierra.

☐ Filtro la trazabilidad de un producto por usuario "Juan" y origen "app móvil" en la última semana y exporto el resultado a CSV con las mismas columnas y filtros.

☐ Exporto a PDF el historial filtrado del producto "Coca-Cola 500 ml" del 1 al 7 de octubre, tipo "egreso por venta": el PDF muestra el nombre del comercio, la fecha y hora de generación, mi usuario, los filtros aplicados, los movimientos y el resumen de totales, y los totales coinciden con los de la pantalla.

☐ Exporto el historial completo de un comercio con 50.000 movimientos y recibo el PDF paginado sin que la app se cuelgue (generación en segundo plano con aviso al terminar).

☐ (P1) Si la cadena de hashes está activa, el PDF incluye el código de verificación y, al ingresarlo en "Verificar reporte", el sistema confirma que coincide con los movimientos registrados.

☐ Un empleado sin permiso no ve la opción de exportar; un PDF exportado por alguien sin permiso de costos no muestra costos ni ganancias.

☐ Cada exportación (CSV o PDF) queda registrada en el log de auditoría con usuario, fecha y hora y filtros.

☐ Confirmo un conteo, cambio la fecha de vencimiento de un lote, creo y edito una promo, cambio el tope de fiado de un cliente y rechazo una entrega de turno: cada acción aparece en el historial de auditoría con mi usuario, fecha y hora, origen, dispositivo y valores anteriores y nuevos, y ninguna se puede editar ni borrar.

☐ (P1) Si se altera un movimiento directamente en la base (prueba controlada), la verificación de integridad marca la cadena como rota en ese movimiento.

### F4. Alertas de stock bajo (P0)

Descripción: cada producto tiene un umbral mínimo; cuando el stock llega a ese valor o baja de él, el sistema lo marca como alerta y permite pasar directo al pedido de reposición.

### Requerimientos:

F4.1 Umbral de stock bajo configurable por producto (ej.: avisar cuando queden 3 chocolates). Valor por defecto configurable a nivel comercio (ej.: 0 = sin alerta).

F4.2 Se genera una alerta cuando el stock es menor o igual al umbral, y se resuelve sola cuando el stock vuelve a superarlo.

F4.3 Indicador visible en el inicio (badge "7 productos con stock bajo") y en el listado.

F4.4 Panel de alertas con productos agrupados por proveedor.

F4.5 Al tocar una alerta (o el panel) se abre un pedido de reposición (F5) precargado con los productos en alerta de ese proveedor.

F4.6 (P1) Notificación push (PWA) y/o resumen diario por WhatsApp o email al dueño.

### Criterios de aceptación:

☐ Configuro el umbral del Chocolate Águila en 3; registro egresos hasta que el stock queda en 3 y el producto aparece en alertas al instante.

☐ Si ingreso stock y queda en 10, la alerta desaparece sin intervención.

☐ Al tocar la alerta del Chocolate Águila se abre un borrador de pedido al proveedor de ese producto con todos sus productos en alerta ya cargados.

☐ Un producto con umbral 0 nunca genera alerta.

☐ Un producto sin proveedor asignado aparece en el grupo "Sin proveedor" y el sistema pide asignarle uno antes de enviar el pedido.

### F5. Pedidos de reposición (P0)

Descripción: lista de productos con stock bajo, con campos numéricos para ajustar las cantidades antes de confirmar, respetando la forma de pedido de cada producto (por unidad, por caja o por monto). Cada pedido tiene además un estado de pago independiente de su estado logístico; al marcarlo como pagado, el pago se registra automáticamente como egreso en la caja (ver "PRD - Caja Digital para Sistema de Inventario", C8).

### Requerimientos:

F5.1 Un pedido pertenece a un proveedor. Se crea desde las alertas (F4), desde la ficha del proveedor o en blanco.

F5.2 Cada línea muestra: foto, nombre, stock actual, umbral, cantidad sugerida y un campo numérico editable (con botones + / -).

F5.3 Unidad de pedido definida por producto:

Por unidad: se piden N unidades (ej.: 10 alfajores).

Por caja: se piden N cajas; se muestra el equivalente en unidades (ej.: 2 cajas = 48 chocolates).

Por monto: se pide un importe en pesos (ej.: $20.000 de fiambre, cigarrillos o carga virtual); se muestra la cantidad estimada según el costo.

F5.4 Cantidad sugerida (MVP): la necesaria para llegar a un "stock objetivo" por producto (por defecto, el doble del umbral), redondeada hacia arriba a cajas enteras si el producto se pide por caja.

F5.5 Agregar o quitar productos del pedido (buscar o escanear).

F5.6 Estados: Borrador → Confirmado/Enviado → Recibido (P1) / Cancelado.

F5.7 Al confirmar, se genera el mensaje del pedido (ver F6) y se envía por el canal elegido. El pedido confirmado queda guardado con fecha y usuario.

F5.8 (P1) Recepción del pedido: al llegar la mercadería se marca lo recibido (permite diferencias) y se genera el ingreso de stock automáticamente; opcionalmente se actualizan los costos.

F5.9 Total estimado del pedido según costos cargados.

F5.10 Estado de pago independiente: además del estado logístico (F5.6), cada pedido confirmado tiene un estado de pago: Pendiente de pago → Pagado. Ambos estados avanzan por separado: un pedido puede estar Enviado y Pagado (pago anticipado), Recibido y Pendiente de pago (cuenta corriente) o Recibido y Pagado. Un pedido en Borrador no tiene estado de pago; al confirmarlo queda en "Pendiente de pago".

F5.11 Condiciones de pago del proveedor (F6.1): el estado de pago respeta las condiciones del proveedor:

Contado / transferencia contra entrega: el pedido queda "Pendiente de pago" y, al marcarlo Recibido (P1) o al registrar la entrega, el sistema sugiere marcarlo como pagado en ese momento.

Cuenta corriente a N días: el pedido queda "Pendiente de pago" hasta que el dueño lo marque como pagado; el sistema calcula una fecha de vencimiento del pago (fecha de envío o de recepción + N días) y lo muestra en la lista de pedidos y en la ficha del proveedor (deuda pendiente con ese proveedor). No se marca como pagado de forma automática.

Pago anticipado: se puede marcar como pagado estando en "Enviado", antes de recibir la mercadería.

F5.12 Marcar como pagado: desde el pedido (web) o desde el bot de WhatsApp, el usuario elige "Marcar como pagado" e indica: monto pagado (precargado con el total estimado, editable porque el total real puede diferir), medio de pago (Efectivo, Débito, Mercado Pago, Transferencia bancaria; precargado según las condiciones del proveedor), fecha (por defecto, hoy) y nota opcional. Puede asociar opcionalmente la factura o remito del proveedor: por ejemplo, el dueño fotografía la factura y la manda al bot de WhatsApp, que la registra según el PRD de facturas de proveedores (en redacción) y la vincula al pedido.

F5.13 Egreso automático en la caja: al confirmar el pago, el sistema registra automáticamente un egreso en la caja digital con categoría de proveedores/mercadería ("Pago a proveedores" en el PRD de Caja Digital), el medio de pago elegido, el monto pagado, el proveedor, origen "pedido de reposición" y referencia al pedido, y vincula el movimiento de caja al pedido (desde el pedido se ve su pago y desde el movimiento se abre el pedido). El cambio de estado y el egreso se guardan en una misma transacción: no puede quedar un pedido pagado sin egreso ni un egreso sin pedido. Si el módulo Caja Digital no está activo en el comercio, el pago queda registrado solo en el pedido.

F5.14 Reglas: un pedido no puede marcarse como pagado dos veces; un pedido Cancelado no puede marcarse como pagado (si ya estaba pagado, antes de cancelarlo se debe revertir el egreso en la caja); si el egreso se revierte en la caja (reversión con contra-asiento), el pedido vuelve a "Pendiente de pago". Solo el rol Dueño (o un empleado con permiso) puede marcar un pedido como pagado. Cada cambio de estado de pago queda en el log de auditoría.

F5.15 Filtros en la lista de pedidos por estado de pago ("Pendientes de pago", "Pagados", "Vencidos") y total adeudado por proveedor.

F5.16 (P1) Pagos parciales: registrar varios pagos sobre un mismo pedido (por ejemplo, seña y saldo), cada uno con su egreso en la caja. Se agrega el estado intermedio Pago parcial (Pendiente de pago → Pago parcial → Pagado) y se muestra el saldo pendiente; el pedido pasa a Pagado cuando la suma de pagos cubre el total acordado.

### Criterios de aceptación:

☐ Desde el panel de alertas abro el pedido del proveedor "Distribuidora X" y veo los 5 productos en alerta con su cantidad sugerida.

☐ Cambio la cantidad de un producto de 2 a 3 cajas con el teclado numérico y el total se recalcula al instante.

☐ Un producto configurado "por caja de 24" muestra "3 cajas (72 u.)"; uno "por monto" muestra "$20.000 (≈ 8 kg)".

☐ Puedo poner una cantidad en 0 o quitar la línea, y no se incluye en el mensaje.

☐ Puedo dejar el pedido en borrador, salir y retomarlo después sin perder cambios.

☐ Al confirmar, el pedido queda en estado "Enviado" con fecha, hora, usuario y canal.

☐ Solo el rol Dueño (o un empleado con permiso) puede confirmar un pedido.

☐ Al confirmar un pedido, su estado de pago queda en "Pendiente de pago", independiente de su estado logístico (Enviado).

☐ Marco como pagado el pedido #42 a "Distribuidora X" por $185.000 con Transferencia bancaria y aparece en la caja un egreso "Pago a proveedores — Distribuidora X — Pedido #42, $185.000, Transferencia bancaria" con mi usuario; el pedido queda "Pagado" con fecha, monto y medio, y muestra el enlace a ese movimiento de caja.

☐ Si el preventista me cobró $182.500 en lugar del total estimado, edito el monto antes de confirmar y tanto el pedido como el egreso quedan por $182.500.

☐ Un pedido a un proveedor en cuenta corriente a 30 días queda "Pendiente de pago" después de recibido, muestra su fecha de vencimiento y aparece en la deuda pendiente del proveedor hasta que lo marco como pagado.

☐ Mando al bot de WhatsApp la foto de la factura del proveedor, elijo el pedido y el medio de pago, y el pedido queda "Pagado" con la factura asociada y el egreso registrado en la caja.

☐ No puedo marcar dos veces el mismo pedido como pagado ni marcar como pagado un pedido Cancelado.

☐ Si revierto en la caja el egreso del pedido #42, el pedido vuelve a "Pendiente de pago".

☐ Si falla la creación del egreso en la caja, el pedido no queda marcado como pagado.

☐ Un empleado sin permiso no ve la opción "Marcar como pagado".

☐ (P1) Registro una seña de $50.000 sobre un pedido de $185.000: el pedido queda en "Pago parcial" con saldo $135.000 y la caja muestra un egreso de $50.000; al pagar el saldo pasa a "Pagado".

### F6. Proveedores (P0)

Descripción: agenda de proveedores con datos de contacto y condiciones comerciales; cada producto se asocia a su proveedor y los pedidos se envían por email o WhatsApp.

### Requerimientos:

F6.1 Alta/edición de proveedor: razón social / nombre de fantasía, CUIT (opcional), nombre de contacto/preventista, teléfono, WhatsApp (formato internacional, ej. +54 9 11 ...), email, dirección, días de visita/entrega, condiciones de pago (contado, transferencia, cuenta corriente a N días, etc.), pedido mínimo y notas.

F6.2 Cada producto tiene un proveedor principal (P1: proveedores alternativos).

F6.3 Ficha de proveedor con sus productos, sus pedidos anteriores y botón "Nuevo pedido".

F6.4 Envío por WhatsApp (MVP): se genera un mensaje de texto prolijo con el pedido y se abre un enlace https://wa.me/<número>?text=<mensaje codificado>; el dueño lo envía desde su propio WhatsApp con un toque.

F6.5 Envío por email (MVP): el sistema envía el pedido desde una dirección transaccional del producto (con "Responder a" = email del comercio), con el detalle en el cuerpo y PDF adjunto opcional (P1). Alternativa: abrir mailto: con el texto precargado.

F6.6 Plantilla del mensaje editable a nivel comercio (saludo, firma, datos de entrega).

F6.7 (P1/P2) WhatsApp Business API (Cloud API de Meta, vía proveedor) para enviar el pedido directamente desde un número del comercio o de la plataforma, con plantillas aprobadas.

### Ejemplo de mensaje generado:

Hola Carlos, te paso el pedido de Kiosco La Esquina:

- Chocolate Águila 100 g x 3 cajas (72 u.)

- Alfajor Jorgito x 20 u.

- Cigarrillos: $50.000

Entrega: jueves por la mañana. Pago: transferencia.

¡Gracias!



### Criterios de aceptación:

☐ Puedo crear un proveedor solo con nombre y WhatsApp y asignarlo a productos.

☐ Al confirmar un pedido por WhatsApp desde el celular se abre la app de WhatsApp con el chat del proveedor y el mensaje ya escrito; desde la PC se abre WhatsApp Web.

☐ El mensaje respeta las unidades de pedido de cada producto (unidad, caja, monto).

☐ Al enviar por email, el proveedor recibe el pedido en menos de 1 minuto y, si responde, la respuesta le llega al email del comercio.

☐ Si el proveedor no tiene WhatsApp ni email cargados, el sistema no permite el envío y pide completar el dato.

☐ Un número mal formado (sin código de país) se normaliza a +54 9 o se marca como inválido.

### F7. Costo, precio de venta y margen (P0)

Descripción: cada producto tiene costo y precio de venta; el sistema calcula el margen de ganancia.

### Requerimientos:

F7.1 Campos: costo (por unidad; si se carga por caja, el sistema lo divide por las unidades por caja) y precio de venta por unidad.

F7.2 Cálculo automático y visible de:

Ganancia por unidad = precio − costo.

Margen sobre precio = (precio − costo) / precio.

Markup sobre costo = (precio − costo) / costo (el "porcentaje que se le carga" habitual en el kiosco). El comercio elige cuál mostrar como principal.

F7.3 Opción de calcular el precio a partir del costo y un markup objetivo (ej.: costo $1.000 + 40% = $1.400), con redondeo configurable (a $10, $50, $100).

F7.4 Aumento masivo (P0 simple): aplicar un % de aumento a costo y/o precio de todos los productos de un proveedor o categoría (muy común cuando el proveedor manda lista nueva).

F7.5 Valorización del inventario: stock total a costo y a precio de venta.

F7.6 Los costos y márgenes son visibles solo para el rol Dueño (configurable).

F7.7 (P1) Alerta de margen bajo o negativo, importación de lista de precios del proveedor. (El historial de costos pasó al MVP: ver F7.9.)

F7.8 Ganancia por venta: cada venta (F2.10) registra la ganancia = (precio de venta − costo unitario) × cantidad, con los valores vigentes al momento de la venta, sea cual sea el método de identificación del producto.

F7.9 Historial de costos (P0, MVP / v1): por decisión del dueño del 9/10/2026 y alineado con el PRD de precios (https://docs.google.com/document/d/15gnWW2l2lkCFC-3shvHe9A6WfxfF2xje6IDj20ysyso/edit, GP5.6), cada producto guarda el historial de su costo unitario desde la primera versión: cada cambio (carga manual, aumento masivo F7.4, recepción de pedido con actualización de costo, factura del proveedor) registra costo anterior y nuevo, variación %, fecha y hora del servidor (America/Argentina/Buenos_Aires), usuario, origen y referencia (pedido, factura, aumento masivo). Se ve en la ficha del producto como lista y línea de tiempo, es append-only (como el log de auditoría, F3.5) y alimenta los cálculos del PRD de precios. Visible solo para el rol Dueño (o empleados con permiso de ver costos, F7.6).

F7.10 Markup recomendado vs. markup aplicado (ajuste manual): cuando el bot o el recálculo mensual del PRD de precios recomienda un markup para un producto (o categoría), el comerciante puede ajustar manualmente el porcentaje de markup en cualquier momento, y el valor manual tiene prioridad sobre la recomendación. La ficha y la pantalla de precios muestran ambos valores: "Recomendado: 38% · Aplicado: 45% (manual)". El valor manual se mantiene hasta que el comerciante lo cambie de nuevo o acepte una recomendación nueva; el recálculo mensual nunca pisa un valor manual de forma automática, solo deja una sugerencia ("Hay una recomendación nueva: 40%. ¿Aplicarla?"). Cada cambio (manual, aceptación de una recomendación, recomendación nueva generada) queda en el log de auditoría (F3.5) con valor anterior y nuevo, usuario, fecha y hora del servidor y origen (manual / bot / recálculo mensual).

### Criterios de aceptación:

☐ Cargo costo $1.000 y precio $1.400 y el sistema muestra ganancia $400, markup 40% y margen 28,6%.

☐ Cargo costo por caja $24.000 con 24 unidades y el costo unitario queda en $1.000.

☐ Aplico +15% a todos los productos de "Distribuidora X" y los precios se actualizan con el redondeo configurado; el cambio queda en el log de auditoría.

☐ Un empleado no ve costos ni márgenes si el dueño no lo habilitó.

☐ Si el precio es menor al costo, el margen se muestra en rojo.

☐ (MVP) Cambio el costo de un producto de $1.000 a $1.150 y después aplico un aumento masivo del 10%: la ficha muestra el historial de costos $1.000 → $1.150 (+15%) → $1.265 (+10%), cada cambio con fecha y hora, usuario y origen ("manual", "aumento masivo"); los registros no se pueden editar ni borrar.

☐ (MVP) Un empleado sin permiso de ver costos no ve el historial de costos.

☐ El bot recomienda 38% de markup para "Alfajor Jorgito"; lo cambio a mano a 45% y la ficha muestra "Recomendado: 38% · Aplicado: 45% (manual)", con el precio calculado sobre 45%.

☐ En el recálculo mensual siguiente la recomendación pasa a 40%: mi 45% manual no cambia y veo la sugerencia "Hay una recomendación nueva: 40%"; si la acepto, el aplicado pasa a 40% y deja de estar marcado como manual.

☐ Cada cambio de markup (manual, aceptación de recomendación) aparece en el log de auditoría con valor anterior y nuevo, mi usuario, fecha y hora y origen.

Continúa en la Parte 2: F8 a F14 y flujos de usuario.

Campo | Detalle
--- | ---
Producto | Sistema de Inventario para Kioscos y Comercios (nombre comercial a definir)
Autor | Mauricio Matasini
Estado | Borrador v1
Fecha | 9 de octubre de 2026
Relación con ModoOps | Producto separado e independiente. Toma como referencia la experiencia de ModoOps (shell Astro + TypeScript, Tema papel, Control Plane multi-tenant, suspensión por mora), pero no depende de Odoo ni comparte infraestructura con los tenants de ModoOps.
Documentos relacionados | "PRD - Caja Digital para Sistema de Inventario" (https://docs.google.com/document/d/14hdf2BbXewzSkjKE25zC8NEMJsDsy2ObI0IKBSt6u0U/edit), PRD de facturas de proveedores (en redacción), PRD del bot de WhatsApp (en redacción) y "PRD - Modo Offline para Sistema de Inventario" (https://docs.google.com/document/d/1NvVipeJhXBgH5oae8D2SWzpqzBLybEaQ5Tc77G03Vw4/edit)

# | Objetivo | Cómo se mide
--- | --- | ---
O1 | Que un comercio cargue su stock inicial en menos de una jornada | Tiempo desde el registro hasta 100 productos cargados
O2 | Reducir los quiebres de stock de productos clave | Cantidad de alertas de stock bajo resueltas con un pedido
O3 | Simplificar el pedido al proveedor | Pedido armado y enviado en menos de 2 minutos
O4 | Dar visibilidad de margen por producto | Porcentaje de productos con costo y precio cargados
O5 | Salir al mercado rápido | MVP en producción en 8 semanas o menos
O6 | Vender como producto autoservicio | Comercios pagos sin intervención manual del equipo
O7 | Operación completa solo con el celular | 100% de las funciones P0 disponibles en la app del celular; porcentaje de comercios activos que operan sin PC (meta: más de 50%)

Prioridad | Significado
--- | ---
P0 - MVP | Imprescindible para el lanzamiento
P1 - Post-MVP cercano | Fase 2, dentro de los 2 a 3 meses posteriores al lanzamiento
P2 - Futuro | Fase 3 en adelante, según demanda

# | Funcionalidad | MVP (P0) | Más adelante (P1/P2)
--- | --- | --- | ---
F1 | Inventario | ABM de productos, stock editable, foto (con cámara del celular o webcam/archivo al crear el producto), búsqueda | Categorías avanzadas, variantes, importación masiva Excel/CSV (P1); vencimientos por lote: ver F12 (MVP)
F2 | Escaneo de código de barras | Lector láser/USB (principal) y cámara del celular como respaldo, alta en el momento; venta por escaneo (Modo venta) y venta de respaldo por búsqueda manual de texto | Venta de respaldo por foto con reconocimiento del producto en la app móvil (P1, a validar), escaneo continuo multi-producto (P1), base de datos de códigos sugeridos (P2)
F3 | Historial de movimientos y auditoría inmutable | Registro append-only de cada movimiento (venta, carga, egreso, ajuste, recepción de pedido) con fecha y hora del servidor, usuario, origen y dispositivo; correcciones solo por movimiento compensatorio; stock reconstruible desde los movimientos; vista "Ver trazabilidad" por producto con filtros y exportación CSV/PDF | Cadena de hashes por movimiento con verificación de integridad y código de verificación en el PDF (P1), filtros avanzados y verificación de integridad bajo demanda (P1)
F4 | Alertas de stock bajo | Umbral por producto, panel de alertas, acceso directo al pedido | Push / WhatsApp / email al dueño (P1), umbral sugerido por rotación (P2)
F5 | Pedidos de reposición | Lista editable, unidad/caja/monto por producto, confirmar; estado de pago (Pendiente de pago → Pagado) con egreso automático en la caja | Recepción del pedido contra lo pedido (P1), pagos parciales y vínculo con la factura del proveedor (P1), sugerencia de cantidades (P2)
F6 | Proveedores | ABM con contacto y condiciones de pago, envío por WhatsApp (wa.me) y email | WhatsApp Business API (P1/P2), portal del proveedor (P2)
F7 | Costo, precio y margen | Costo, precio, margen calculado, aumento masivo simple, historial de costos (v1, decisión del 9/10/2026, alineado con el PRD de precios GP5.6), markup recomendado vs. aplicado con ajuste manual que prevalece (F7.10) | Listas de precios, alertas de margen bajo (P1)
F8 | Cuentas, usuarios y roles (transversal) | Registro e inicio de sesión con Google (OAuth 2.0 / OpenID Connect, sin contraseñas), comercio, roles Dueño/Empleado, invitación de empleados por email con vínculo de su cuenta de Google en el primer ingreso, revocación de acceso, suscripción | Varios comercios por cuenta (P1), permisos finos (P2)
F9 | Ubicaciones de productos | Ubicaciones con nombre propio (crear, renombrar, archivar), una ubicación por producto con nota de estante/posición opcional, ubicación visible al escanear, vender y buscar; cambios de ubicación en el historial inmutable | Filtro por ubicación y "lista por ubicación" para reponer (P1)
F10 | Devoluciones de clientes | Buscar la venta original (ticket, ventas recientes o escaneo), devolución total o parcial (nunca más de lo vendido), movimiento "devolución" que vuelve a subir el stock vinculado a la venta, camino "no apto para venta" a merma, reversión proporcional de la ganancia, reintegro por el medio de pago que elige el operador (libremente, sin motivo) como egreso en la caja vinculado a la venta, con el medio registrado y auditado, registro inmutable | Devolución con cambio por otro producto, reportes de devoluciones por producto/motivo (P1)
F11 | Operación 100% desde el celular (transversal) | Todas las funciones P0 (venta con cámara, stock, fotos, configuración, proveedores, pedidos, caja, facturas, usuarios, historial y exportaciones) usables desde la app del celular, sin PC; lector Bluetooth emparejado al celular opcional; diseño mobile-first responsive; modo offline v1: venta offline, descuento de stock offline y caja offline (registro de cobros) con SQLite local en el teléfono y cola de sincronización automática (según el PRD de Modo Offline) | Edición offline de productos, devoluciones y recepción de pedidos offline, PIN local para cambiar de usuario offline (P1, según el PRD de Modo Offline)
F12 | Lotes con fecha de vencimiento | Flag "controla vencimiento" por producto, fecha de vencimiento por lote al recibir mercadería (carga manual, escáner, pedido o factura del proveedor) con selector de fecha en el celular, stock por lote, descuento FEFO automático en la venta, lotes y vencimientos visibles en la ficha y la búsqueda, alertas de vencimiento a días configurables (ej.: 15/7/3), baja de stock vencido como movimiento "vencido" (merma) en el historial inmutable; datos para las promos del bot (PRD de Rotación) | OCR de la fecha impresa en el envase (P1), reportes de merma por vencimiento (P1)
F13 | Conteo de stock guiado por sector | Conteo desde el celular por ubicación (F9) escaneando o buscando y cargando cantidades, comparación contra el stock teórico al inicio del conteo (considerando las ventas durante el conteo), diferencias, ajustes "ajuste por conteo" inmutables al confirmar (solo Dueño o empleado con permiso), conteos parciales reanudables, offline, cronograma rotativo opcional, historial y reporte de diferencias (merma); no es el arqueo diario | Sugerencia de sectores a contar según diferencias y rotación, conteo a ciegas configurable (P1)
F14 | Descuentos en la venta (ticket) | Descuento porcentual o de monto fijo al generar el ticket, por línea y por ticket, con redondeo, aviso si el precio queda por debajo del costo, tope de % para empleados configurable por el dueño, sin acumular con promos por defecto (alineado con el PRD de Ticket y el de Precios) | Motivos de descuento predefinidos y reporte de descuentos por empleado (P1)
