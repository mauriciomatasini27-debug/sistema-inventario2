---
id: MOD-07-NOTIFICACIONES-EMAIL
tipo: spec
estado: propuesto
modulos: [bot, email]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: ""
---
> Origen: `PRD - Notificaciones por Email para Sistema de Inventario.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/email`, `src/pages/api/email/*`, `src/db/schema-email.ts`

---

# PRD - Notificaciones por Email para Sistema de Inventario

Convención: las cifras con fuente son precios publicados, consultados el 9/10/2026. Lo marcado (estimado/a verificar) es un supuesto propio o un dato que no se pudo confirmar en una fuente primaria. Todas las horas son de America/Argentina/Buenos_Aires.

## 1. Resumen / visión general

### 1.1 Problema

El dueño de un kiosco se entera de lo que pasa en su negocio (cuánto vendió, qué se está acabando, cómo cerró la caja, si algo falló) solo si abre la app o si le llega un WhatsApp. Si está en la calle, en el mayorista o de vacaciones, depende de que alguien le avise.

Los avisos proactivos por WhatsApp salen del número central, compartido por todos los comercios: el cupo gratis de 1.000 mensajes de servicio por mes se reparte entre todos, y cada plantilla de utilidad se paga (~USD 0,026 en Argentina), incluso dentro de la ventana de 24 h desde el 1/10/2026 (doc de costos, 0.1 y 1.1). Cada aviso por WhatsApp es un costo directo.

Hay eventos importantes del sistema que hoy no tienen un canal claro: la sincronización offline que deja stock negativo, un cierre automático de caja que falló, la conexión de Gmail o Google Photos vencida, un problema de pago de la suscripción o un inicio de sesión desde un dispositivo nuevo. Son avisos que el dueño tiene que ver, que conviene tener por escrito y que no justifican el costo de una plantilla de WhatsApp.

El email tiene ventajas propias: queda archivado y se puede buscar, admite tablas y detalle (un resumen de cierre con todos los medios de pago, un reporte semanal con el pedido sugerido), se reenvía al contador y cuesta centavos por cada mil envíos.

### 1.2 Visión

El dueño recibe por email todo lo importante de su negocio, y lo más importante también por WhatsApp. Las tres notificaciones clave (el aviso matutino de stock bajo, el resumen semanal del viernes y el resumen de cierre de caja) llegan siempre por los dos canales, WhatsApp y email, con los mismos números. El resto (resumen diario de ventas, vencimientos, eventos del sistema, seguridad y cuenta) llega por email, el canal barato. El dueño decide qué notificaciones recibe y con qué frecuencia; no elige canal: el canal de cada tipo lo fija el producto. Los avisos de seguridad no se pueden desactivar.

El bot de WhatsApp sigue siendo el lugar para lo que el comerciante le escribe (consultas de stock, pedidos, fotos de facturas, confirmaciones). El email no reemplaza al bot: lo complementa y le saca a WhatsApp todo lo que no necesita ser un mensaje pago.

### 1.3 Propuesta de valor

Para el dueño: "Todo lo que pasa en el kiosco te llega al mail, ordenado y con el detalle completo; lo clave del día también te llega al WhatsApp."

Para el negocio (nosotros): un canal de notificaciones de costo casi cero (USD 0,0001–0,0009 por email contra ~USD 0,026 por plantilla de WhatsApp), que permite sumar avisos sin comerse el margen de los planes (doc de costos, sección 9).

### 1.4 Alcance del módulo

Incluye: el catálogo de notificaciones con su canal fijo; las preferencias del dueño (qué, frecuencia, horario de silencio); la infraestructura compartida de envío (outbox, cola, reintentos, idempotencia, plantillas, dominio de envío, webhooks de rebotes y quejas, desuscripción en un clic); la entrega en paralelo por WhatsApp (a través del servicio del bot) de las tres notificaciones clave; el historial de notificaciones en la app; y la integración con los PRD de caja, bot, consumos, órdenes de pago, offline y autenticación.

No incluye: el contenido conversacional del bot, las plantillas de WhatsApp en sí (las define y aprueba el PRD del bot), el envío de pedidos a proveedores por email (ya definido en el PRD principal, 6.7, aunque reutiliza esta infraestructura), ni emails de marketing.

## 2. Objetivos y no-objetivos

### 2.1 Objetivos

Que el dueño reciba por email, en el MVP, el aviso matutino de stock bajo, el resumen semanal del viernes, el resumen de cierre de caja, el resumen diario de ventas y los eventos importantes del sistema (operación, seguridad y cuenta).

Que las tres notificaciones clave lleguen siempre por WhatsApp y por email, con contenido equivalente y los mismos números que la app.

Que el dueño configure desde el celular, en menos de 1 minuto, qué notificaciones recibe, con qué frecuencia (instantánea, resumen diario, semanal) y su horario de silencio.

Entregabilidad alta: ≥ 98% de entregados sobre aceptados por el proveedor, < 0,1% de quejas por spam (muy por debajo del 0,3% que exigen Gmail y Yahoo) y < 2% de rebotes duros.

Puntualidad: los resúmenes programados salen dentro de los 10 minutos de su hora; los eventos instantáneos, dentro de los 5 minutos del hecho (fuera del horario de silencio).

Cero duplicados: un mismo evento genera como máximo un email y un WhatsApp por destinatario, aunque haya reintentos, dos workers o un job que corre dos veces.

Costo de email < USD 0,10 por cliente al mes con 500 clientes.

### 2.2 No-objetivos (fuera de alcance, al menos en el MVP)

Emails de marketing (novedades, promociones, campañas, newsletters, reactivación de clientes en prueba). Todo lo que se manda en el MVP es transaccional y responde a la actividad del propio comercio.

Elegir el canal por tipo de notificación: el canal lo fija el producto (NE1). Única excepción: los eventos de las funciones nuevas de v1 (NE17), que salen por email y en la app, tienen un interruptor opcional "También por WhatsApp", apagado por defecto (PRD de caja, C17.6).

Notificaciones push de la PWA (P2, a evaluar).

Emails a empleados (P2, NE16) y a terceros distintos del dueño, salvo los pedidos a proveedores ya definidos en el PRD principal.

Responder emails para operar el sistema (por ejemplo, "respondé SÍ para confirmar el pedido"). Las acciones se hacen en la app o en el bot.

Seguimiento de aperturas y clics (pixel de apertura, reescritura de links): queda desactivado por privacidad y para que los links se vean limpios (NE12).

Envío desde el Gmail del propio comercio (vía OAuth): fuera del MVP, igual que en el PRD del bot (6.7).

SMS.

Arqueo diario en el resumen de cierre: no hay arqueo diario; la entrega de turno (PRD de caja, C17) es opcional, cuenta solo efectivo y funciona offline. Sus diferencias y disputas se avisan como eventos propios (NE17).

## 3. Usuarios

Las notificaciones de este PRD van al Dueño. Todos los usuarios entran con su cuenta de Google (obligatoria para todos, PRD de autenticación), así que todo dueño tiene un email verificado desde el primer día: es el destinatario por defecto.

### 3.1 Dueño/a (rol Dueño)

Perfil: dueño de un kiosco, almacén o comercio chico; usa el celular para todo y muchas veces no tiene PC. Lee el mail en la app de Gmail del teléfono.

Necesita: enterarse de cómo le fue en el día y qué tiene que reponer sin abrir la app; saber al instante si pasa algo raro (un login desconocido, un cierre que falló, stock negativo); tener un registro escrito para mirar el fin de semana o mandarle al contador.

Configura: qué notificaciones recibe, con qué frecuencia y su horario de silencio, desde "Más" → "Configuración" → "Notificaciones".

### 3.2 Empleado/a (rol Empleado)

En el MVP no recibe notificaciones de este módulo (el PRD de caja, C10.6, ya define que los avisos van solo al Dueño por defecto).

P2: el Dueño puede agregarlo como destinatario de algunos tipos, sin datos financieros que su rol no puede ver (matriz AU4 del PRD de autenticación). Ver NE16.

### 3.3 Administrador de la plataforma (equipo propio)

Opera el dominio de envío, la cuenta del proveedor de email, las plantillas y la lista de supresión; mira en el Control Plane las métricas de entrega, rebotes y quejas por comercio, sin ver el contenido de los emails.

## 4. Funcionalidades

### 4.0 Priorización

### NE1. Catálogo de notificaciones y canales fijos (P0)

Descripción: el producto define un catálogo cerrado de tipos de notificación. Cada tipo tiene un canal fijo, las frecuencias permitidas y un valor por defecto. El dueño no elige canal.

### Requerimientos:

NE1.1 Tres notificaciones clave, siempre por WhatsApp y por email: aviso matutino de stock bajo (NE2), resumen semanal del viernes (NE3) y resumen de cierre de caja (NE4). Si el tipo está activo, se generan las dos entregas para el mismo evento. No hay selector de canal ni regla de deduplicación que suprima una de las dos.

NE1.2 El resto, solo por email: resumen diario de ventas (NE5), eventos de operación (NE6), seguridad y cuenta (NE7), vencimientos y consumos (NE8). Los eventos de las funciones nuevas de v1 (NE17) van por email y en la app; solo las tres clave van por WhatsApp, y los de NE17 pasan a WhatsApp únicamente si el dueño lo activa para ese tipo (apagado por defecto, PRD de caja C17.6).

NE1.3 Catálogo (MVP):

NE1.4 Frecuencias: instantánea = se envía al ocurrir el evento (respetando el horario de silencio, NE9); resumen diario = se agrupan los eventos del día en un solo email a la hora elegida; semanal = se incluyen como sección del resumen del viernes (o del lunes en "pagos de la semana").

NE1.5 Agrupación dentro del mismo canal: si dos notificaciones por email salen a la misma hora para el mismo dueño (por ejemplo, el resumen diario de ventas y el resumen de cierre), se mandan en un solo email con secciones. Esto no suprime ningún canal: solo junta contenidos del mismo canal.

NE1.6 WhatsApp depende de la vinculación y del opt-in del bot: la entrega por WhatsApp de las tres notificaciones clave exige que el dueño tenga el número vinculado y el opt-in vigente (PRD del bot, B1 y B2; lo exige la política de WhatsApp Business). Si no lo tiene, o escribió "BAJA", se manda solo el email y la app muestra "Activá WhatsApp para recibir también estos avisos ahí". Es una restricción legal del canal, no una elección de canal.

NE1.7 El catálogo es configuración del producto (código + migración), igual para todos los comercios; agregar un tipo nuevo requiere una versión nueva.

### Criterios de aceptación:

☐ Con las tres notificaciones clave activas y el WhatsApp vinculado con opt-in, cada una me llega por WhatsApp y por email, con los mismos números que la app.

☐ En la pantalla de preferencias no existe ningún selector de canal; cada tipo muestra su canal como texto ("Por WhatsApp y email" / "Por email"). La única opción de canal es el interruptor "También por WhatsApp" de los eventos de NE17, apagado por defecto.

☐ Un evento del sistema (por ejemplo, Gmail desconectado) me llega solo por email; no se manda ninguna plantilla de WhatsApp por ese evento (verificado en bot_message_log).

☐ Si no vinculé el WhatsApp, recibo las tres clave solo por email y veo el aviso para activar WhatsApp.

☐ Si escribo "BAJA" al bot, dejo de recibir las tres clave por WhatsApp y las sigo recibiendo por email.

☐ Si el resumen de ventas y el de cierre salen juntos, recibo un solo email con las dos secciones.

### NE2. Aviso matutino de stock bajo (P0, WhatsApp + email)

Descripción: cada mañana, a la hora configurada, el dueño recibe los productos que quedaron con stock bajo (umbral por producto del PRD principal, F4), agrupados por proveedor, con los urgentes primero. Por WhatsApp sale la plantilla del aviso matutino del PRD del bot (B5); por email sale el detalle completo.

### Requerimientos:

NE2.1 Job diario por comercio, a la hora configurada (por defecto 08:00), en America/Argentina/Buenos_Aires. El contenido se calcula al momento del envío con stock en vivo (no la noche anterior).

NE2.2 Solo se envía si hay al menos una novedad: producto que entró en alerta desde el aviso anterior (o en los últimos 3 días) y sigue en alerta, o producto urgente (stock 0, crítico o debajo de la mitad del umbral, regla B4.4 del PRD del bot). Sin novedades no sale nada por ningún canal.

NE2.3 Email: asunto "Kiosco La Esquina: 7 productos con stock bajo (2 sin stock)"; tabla por proveedor (producto, stock actual, umbral, cantidad sugerida, ubicación); botones "Armar pedido" por proveedor (link al borrador de pedido en la app) y "Ver todas las alertas"; productos sin proveedor en el grupo "Sin proveedor" con link para asignarlo; productos guardados para el viernes (lista del viernes, B6) en una sección aparte.

NE2.4 WhatsApp: la plantilla de utilidad del aviso matutino (B5.2 del PRD del bot), con sus botones. Este módulo genera el evento y el servicio del bot la envía; el texto, la aprobación de Meta y la ventana de 24 h los define el PRD del bot.

NE2.5 Los dos canales salen del mismo evento y del mismo cálculo (misma lista de productos, mismas cantidades).

NE2.6 Frecuencia "Semanal": no hay aviso diario y los faltantes aparecen solo en el resumen del viernes (NE3), por los dos canales.

NE2.7 (P1) Instantánea para productos críticos: si un producto marcado como crítico llega a 0, aviso inmediato por los dos canales, como máximo uno por producto por día (alineado con B4.6 del PRD del bot). Cada uno es una plantilla paga (sección 7).

### Ejemplo de email (texto):

Asunto: Kiosco La Esquina: 7 productos con stock bajo (2 sin stock)

Buen día, Mauricio. Esto es lo que se está acabando:

Distribuidora X (3) — [Armar pedido]

• Coca-Cola 500 ml — quedan 0 (umbral 12) — sugerido: 2 cajas — Heladera 1   URGENTE

• Sprite 500 ml — quedan 4 (umbral 6) — sugerido: 1 caja — Heladera 1

...

Golosinas del Sur (2) — [Armar pedido]

...

Sin proveedor (1): Pilas AA — [Asignar proveedor]

Guardados para el viernes: 3 productos — [Ver lista del viernes]

[Ver todas las alertas en la app]



### Criterios de aceptación:

☐ Con 7 productos en alerta, a las 08:00 recibo el aviso por WhatsApp y por email; los dos muestran los mismos 7 productos y las mismas cantidades.

☐ Con 0 novedades no recibo nada por ningún canal.

☐ Un producto que se repuso a las 07:50 no aparece en el aviso de las 08:00 de ningún canal.

☐ Toco "Armar pedido" de Distribuidora X en el email y se abre en la app el borrador de pedido con sus productos en alerta ya cargados.

☐ Cambio la hora a 07:30 y el aviso siguiente llega a las 07:30 por los dos canales.

☐ Con frecuencia "Semanal" no recibo el aviso diario y los faltantes aparecen en el resumen del viernes.

### NE3. Resumen semanal del viernes (P0, WhatsApp + email)

Descripción: el viernes, a la hora configurada (por defecto 18:00), el dueño recibe el resumen de la semana con el pedido sugerido para hacer el lunes: lo mira el fin de semana y el lunes a la mañana pide. Por WhatsApp sale la plantilla B9 del PRD del bot; por email, el reporte completo.

### Requerimientos:

NE3.1 Contenido (los dos canales, del mismo cálculo): unidades vendidas en la semana (egresos por venta del historial F3), top 10 de productos vendidos, ventas y ganancia de la semana, productos en alerta y sin stock, lista del viernes consolidada por proveedor y pedido sugerido por proveedor para el lunes.

NE3.2 El email agrega lo que no entra en WhatsApp: tabla completa de faltantes por proveedor con cantidades sugeridas, comparación con la semana anterior (P1), resumen de caja de la semana (ingresos y egresos por medio, si Caja está activa), vencimientos de la semana siguiente (si vencimientos está en frecuencia semanal) y las secciones de otros tipos configurados como "semanal" (NE1.4).

NE3.3 Botones del email: "Revisar pedido sugerido" (abre los borradores semanales en la app), "Programar para el lunes" (abre la programación del PRD del bot, B9.4, en la web) y "Ver resumen completo".

NE3.4 El día y la hora son configurables por comercio (algunos proveedores visitan otro día); el valor por defecto está pensado para pedir el lunes.

NE3.5 Sin ventas registradas en la semana, se envía igual con la aclaración "No hay ventas registradas esta semana" y los faltantes.

NE3.6 "Programar para el lunes" y el recordatorio del lunes si quedaron pedidos sin confirmar (B9.5) siguen como los define el PRD del bot.

### Criterios de aceptación:

☐ El viernes a las 18:00 recibo el resumen por WhatsApp y por email; los más vendidos y las unidades coinciden con el historial de la web.

☐ El email muestra el pedido sugerido por proveedor con las mismas cantidades que los borradores semanales de la app.

☐ Toco "Revisar pedido sugerido" en el email, se abren los borradores semanales y los programo para el lunes 08:00 desde la app.

☐ Una semana sin ventas recibo el resumen igual, con la aclaración y los faltantes.

☐ Si configuro el resumen para el jueves 20:00, llega el jueves a esa hora por los dos canales.

### NE4. Resumen de cierre de caja (P0, WhatsApp + email)

Descripción: cuando la jornada se cierra, a mano ("Cerrar caja") o automáticamente a la hora de corte (PRD de caja, C12), el dueño recibe el resumen de cierre por WhatsApp y por email. Es el snapshot inmutable de closing_summaries: se envía tal cual, sin recalcular. No hay arqueo diario: el único efectivo contado es el de las entregas de turno, que son opcionales y cuentan solo efectivo (PRD de caja, C17); sus diferencias se avisan aparte (NE17).

### Requerimientos:

NE4.1 El evento resumen_cierre (C12.10 y 6.4 del PRD de caja), insertado en el outbox en la misma transacción que el cierre, dispara las dos entregas.

NE4.2 Contenido (los dos canales): jornada, fecha y hora de apertura y quién abrió, fecha y hora de cierre y quién cerró o "automático"; total de ventas; ingresos por medio de pago (Efectivo, Débito, Mercado Pago, QR, Transferencia bancaria); egresos por categoría; devoluciones en línea aparte; saldo final por medio y total; cantidad de movimientos y reversiones. WhatsApp lleva la versión corta (ejemplo de C10.1 del PRD de caja); el email, la versión completa con tablas.

NE4.3 El email agrega: "Ajustes posteriores al cierre" si los hay al momento de enviar (sin cambiar el snapshot), las ventas del día (NE5, si está activo con el cierre), los vencimientos de los próximos días y el link "Ver cierre en la app".

NE4.4 Frecuencia: instantánea (al cerrar, por defecto) o diaria (a la mañana siguiente, a la hora elegida). Si el cierre automático ocurre dentro del horario de silencio (por ejemplo, 00:00), la entrega por los dos canales se difiere al final del silencio.

NE4.5 Una jornada sin apertura ni movimientos no genera resumen (C12.9) ni notificación.

NE4.6 Una sola notificación por jornada y por canal: si el job de cierre corre dos veces, o hubo cierre manual y después llegó la hora de corte, sale un solo resumen por canal (clave de idempotencia por jornada, NE11).

NE4.7 Montos en pesos argentinos ($ 412.300) y horas de Buenos Aires.

### Ejemplo de email (texto):

Asunto: Cierre de caja del jueves 08/10 — Resultado +$181.800

Apertura: 08/10 08:05 por Mauricio · Cierre: 09/10 00:00 (automático)

Ventas del día: $412.300

Ingresos por medio: Efectivo $180.000 · Mercado Pago $98.300 · QR $54.000 · Débito $65.000 · Transferencia $15.000

Egresos por categoría: Proveedores $182.500 · Luz $48.000

Devoluciones: $3.500 (QR $2.000 · Efectivo $1.500)

Saldo final por medio y total: ... · Total $1.245.600

Movimientos: 143 · Reversiones: 2

Vence el sábado: Alquiler $450.000

[Ver cierre en la app]



### Criterios de aceptación:

☐ Toco "Cerrar caja" a las 21:40 y en menos de 5 minutos recibo el resumen por WhatsApp y por email, con los mismos números que "Último cierre" en la app.

☐ Con cierre automático a las 00:00 y silencio de 23:00 a 07:30, recibo el resumen por los dos canales a las 07:30, con "Cierre: 09/10 00:00 (automático)".

☐ Si el job de cierre se ejecuta dos veces, recibo un solo email y un solo WhatsApp.

☐ Un día sin movimientos no recibo ningún resumen.

☐ El email no tiene ningún campo de efectivo contado ni de diferencia.

☐ Si cargo un gasto olvidado de ayer después del cierre, el resumen de ayer en la app y en un reenvío (P1) sigue igual y el gasto aparece en "Ajustes posteriores al cierre".

### NE5. Resumen diario de ventas (P0, email)

Descripción: detalle de ventas del día desde el lado del inventario (qué se vendió), que complementa el cierre (cuánta plata entró por cada medio).

### Requerimientos:

NE5.1 Contenido: total vendido, cantidad de tickets, ticket promedio, unidades, top 10 de productos por unidades y por importe, ganancia del día, devoluciones del día, ventas por usuario (quién vendió) y por origen (lector, cámara, búsqueda, bot).

NE5.2 Frecuencia: diaria con el cierre (por defecto: va como sección del email de cierre, NE1.5), o a una hora fija (por ejemplo 22:00, con las ventas hasta ese momento), o semanal (sección del resumen del viernes).

NE5.3 Si Caja Digital no está activa, se envía a la hora fija elegida (por defecto 22:00).

NE5.4 Usa la misma función de dominio que la pantalla de ventas, para que los números coincidan.

### Criterios de aceptación:

☐ Con el valor por defecto, el email de cierre incluye la sección "Ventas del día" con el top 10 y los totales iguales a la app.

☐ Configuro "a las 22:00" y recibo un email aparte a esa hora con las ventas hasta las 22:00.

☐ Por este tipo no se manda ningún mensaje de WhatsApp.

### NE6. Eventos del sistema: operación (P0, email)

Descripción: avisos de que algo no funcionó como se esperaba y el dueño tiene que mirarlo.

### Requerimientos:

NE6.1 Problemas de sincronización offline (PRD offline, en redacción): movimientos rechazados al sincronizar (por ejemplo, sesión revocada o validación fallida), un dispositivo con movimientos pendientes que no sincroniza hace más de 24 h (según el último reporte del dispositivo) y conflictos que requieren revisión. Con link a la pantalla de sincronización del dispositivo.

NE6.2 Stock negativo después de sincronizar: cuando la sincronización de la cola offline (SQLite en el celular) deja uno o más productos con stock negativo (PRD principal, F1: se marca en rojo), un email con la lista de productos, el stock resultante, el dispositivo y el usuario, y el link "Revisar y corregir" (movimiento compensatorio, F3). Un solo email por sincronización, no uno por producto.

NE6.3 Cierre automático fallido: si el job nocturno de control (PRD de caja, 6.6) detecta una jornada con movimientos que quedó sin cerrar, o el cierre falló después de los reintentos, email con la jornada afectada y el link a la caja. El cierre se reintenta según el PRD de caja; el email avisa, no cierra.

NE6.4 Conexión de Gmail o Google Photos vencida o revocada (PRD de consumos, CS12.4; PRD de caja, C13; PRD de facturas): email con qué dejó de funcionar ("No vamos a poder leer las facturas de servicios de tu Gmail") y el botón "Volver a conectar", que lleva a Configuración (la reconexión exige reautenticación, AU10).

NE6.5 Frecuencia instantánea (por defecto) o resumen diario. El stock negativo y el cierre fallido no se pueden apagar del todo: como mínimo van en el resumen diario.

NE6.6 Cada evento tiene una clave de deduplicación (por ejemplo, cierre_fallido:2026-10-08, gmail_vencido:<conexión>:<fecha>) para no repetir el mismo aviso; si el problema sigue, se recuerda como máximo una vez por día.

### Criterios de aceptación:

☐ Vendo 5 Coca-Cola en modo avión desde un celular con stock 3 en el servidor; al sincronizar, recibo un email "Stock negativo después de sincronizar: Coca-Cola 500 ml quedó en −2" con el dispositivo y el usuario, y el link para corregir.

☐ Si dos productos quedan negativos en la misma sincronización, recibo un solo email con los dos.

☐ Si una jornada con movimientos queda sin cerrar a la mañana siguiente, recibo el email de cierre automático fallido.

☐ Revoco el acceso a Gmail desde mi cuenta de Google y recibo el email de conexión vencida al día siguiente como máximo, con el botón para reconectar.

☐ Si la conexión sigue caída, no recibo más de un recordatorio por día.

☐ Ninguno de estos eventos genera una plantilla de WhatsApp.

### NE7. Seguridad y cuenta (P0, email, obligatorios)

Descripción: avisos que el dueño no puede desactivar porque protegen su cuenta o su servicio.

### Requerimientos:

NE7.1 Inicio de sesión desde un dispositivo nuevo (PRD de autenticación, AU9.5): "Se inició sesión en Kiosco La Esquina con tu cuenta desde Chrome en Windows, Córdoba, el 09/10 a las 19:20. Si no fuiste vos, cerrá esa sesión desde Mi cuenta." con botón "Ver dispositivos". En el MVP se envía cuando la cuenta del Dueño entra desde un dispositivo nuevo; (P1) también cuando un empleado entra desde un dispositivo nuevo.

NE7.2 Otros eventos de seguridad (a partir de auth_events): cierre remoto de sesiones, acceso revocado a un empleado, cambio del email de Google del Dueño y (P1) cambio de rol a Dueño y transferencia de titularidad.

NE7.3 Cuenta y suscripción (PRD principal, F8.4 y 6.8): pago rechazado en Mercado Pago, cargo vencido impago con la regla de 14 días (14 días desde el vencimiento con acceso completo, en demora y en gracia, y paso a solo lectura el día 15, según PA7 del PRD del panel de administración; reemplaza la "gracia de 7 días" que figuraba acá) con la fecha límite, aviso 2 días antes de pasar a solo lectura, paso a solo lectura, reactivación, fin de la prueba gratis (3 días antes y el día), cambio de plan, y consumo de mensajes del bot al 80% y al 100% del cupo del plan (doc de costos, sección 9).

NE7.4 No se pueden desactivar ni dar de baja: no llevan List-Unsubscribe (son mensajes transaccionales obligatorios) y en la pantalla de preferencias se muestran con un candado y "Obligatorio para proteger tu cuenta".

NE7.5 Los de seguridad ignoran el horario de silencio y la pausa; los de cuenta respetan el silencio, salvo el paso a solo lectura.

NE7.6 Los emails de seguridad nunca incluyen links que ejecuten acciones solos ("cerrar sesión con un clic"): el link abre la app y la acción pide sesión (y reautenticación si corresponde, AU10).

### Criterios de aceptación:

☐ Entro con mi cuenta desde una PC nueva y en menos de 5 minutos recibo el email de dispositivo nuevo, aunque esté en horario de silencio o con los avisos pausados.

☐ En preferencias, "Seguridad" y "Cuenta y suscripción" aparecen con candado y sin interruptor.

☐ Los emails de seguridad no tienen el encabezado List-Unsubscribe ni link de baja; tienen el link "Ver tus preferencias".

☐ Si Mercado Pago rechaza el cobro, recibo el email con la fecha en que el comercio pasaría a solo lectura y el botón para actualizar el medio de pago.

☐ Con el 80% del cupo de mensajes del bot consumido, recibo un email con el consumo y la opción de sumar un paquete.

### NE8. Vencimientos y consumos (P0 vencimientos / P1 consumos detectados, email)

### Requerimientos:

NE8.1 Vencimientos (PRD de caja, C9 y C10.2; PRD de órdenes de pago, OP11): próximos (N días antes, según la anticipación configurada en esos PRD), del día y vencidos. Por email, con monto, a quién y el link "Revisar y pagar" a la orden o al vencimiento. Nunca se ejecuta un pago desde el email (principio de OP, 7.1).

NE8.2 Frecuencia: instantánea, resumen diario (por defecto, 08:00) o semanal ("Pagos de la semana", el lunes a la mañana, equivalente por email de OP11.4).

NE8.3 Un solo aviso por vencimiento por email: si el vencimiento tiene orden de pago, se usa el de la orden (misma regla de OP11.1). No se avisan vencimientos ya Pagados o Cancelados.

NE8.4 Los avisos de vencimiento por WhatsApp siguen como los definen OP11 y CS12; este PRD agrega el email (pregunta abierta 5).

NE8.5 (P1) Factura de servicio detectada (PRD de consumos, CS2 a CS4): "Detectamos tu factura de Edenor por $48.000, vence el 20/10", con link para confirmarla en la app. La confirmación en un toque sigue en el bot (CS4).

NE8.6 (P1) Resumen mensual de consumos (CS12.5) por email el primer día hábil del mes.

### Criterios de aceptación:

☐ Con el alquiler venciendo el 10/10 y aviso 3 días antes, el 07/10 a las 08:00 el resumen diario de vencimientos lo incluye; si lo marco Pagado el 08/10, no vuelve a aparecer.

☐ Un vencimiento con orden de pago aparece una sola vez en el email.

☐ Con "Semanal", el lunes a las 08:00 recibo "Pagos de la semana" con el total.

☐ El email no tiene ningún botón que pague; "Revisar y pagar" abre la orden en la app.

### NE9. Preferencias: qué, frecuencia y horario de silencio (P0)

Descripción: pantalla mobile-first donde el dueño decide qué recibe y cuándo.

### Requerimientos:

NE9.1 Ruta: "Más" → "Configuración" → "Notificaciones". Una tarjeta por tipo con interruptor, canal mostrado como texto fijo ("Por WhatsApp y email" / "Por email"), frecuencia (solo las permitidas, NE1.3), hora y día cuando aplica, y un ejemplo ("Así se ve").

NE9.2 Horario de silencio por dueño (por defecto 23:00 a 07:30): lo que cae adentro se difiere al final del silencio, por los dos canales. Excepción: seguridad (NE7.5).

NE9.3 Pausa temporal ("Pausar avisos 7 días", vacaciones o comercio cerrado): pausa todo salvo seguridad y cuenta. Al terminar la pausa no se manda el acumulado: se retoma normalmente.

NE9.4 Valores por defecto al dar de alta el comercio (NE1.3): las tres clave activas, ventas diarias con el cierre, vencimientos en resumen diario, sistema instantáneo.

NE9.5 Los cambios rigen desde el próximo envío; un cambio de hora no reprograma un envío que ya está en curso.

NE9.6 Solo el Dueño ve y edita las preferencias (permiso del backend, AU4). Los cambios quedan en el audit_log del comercio.

NE9.7 La pantalla se usa entera desde el celular (360 px, áreas táctiles de 44 px, sin hover). Editar preferencias requiere conexión en el MVP; sin conexión, la pantalla muestra los valores en solo lectura con el aviso "Conectate para cambiar tus notificaciones".

NE9.8 Destinatario: el email verificado de la cuenta de Google del Dueño (base de control, users.email). Si el Dueño cambia el email de su cuenta de Google, se actualiza en el próximo login y se envía un aviso de seguridad a los dos emails.

NE9.9 Banner en la app si el email del dueño está suprimido por rebote duro o queja (NE13): "No te podemos mandar emails a mauricio@gmail.com. [Revisar]".

NE9.10 (P2) Preferencias por empleado (NE16).

### Criterios de aceptación:

☐ Desde el celular, desactivo el resumen diario de ventas y cambio el aviso matutino a las 07:00 en menos de 1 minuto; los dos cambios rigen desde el próximo envío.

☐ No hay opción para elegir el canal de ningún tipo, salvo el interruptor "También por WhatsApp" de los eventos de NE17 (apagado por defecto).

☐ Con silencio de 23:00 a 07:30, un aviso de vencimiento instantáneo generado a las 23:30 me llega a las 07:30; un aviso de dispositivo nuevo a las 23:30 me llega al instante.

☐ Pauso los avisos 7 días: no recibo resúmenes ni alertas en ese período, pero sí un aviso de dispositivo nuevo; al octavo día vuelvo a recibir el aviso matutino, sin un acumulado.

☐ Como Empleado no veo la pantalla de notificaciones y, si llamo a la API, recibo un error de permisos.

☐ El cambio de preferencias aparece en el audit_log con usuario, valor anterior y nuevo.

### NE10. Desuscripción en un clic por categoría (P0)

### Requerimientos:

NE10.1 Todo email de una categoría desactivable lleva los encabezados List-Unsubscribe: <https://.../u/{token}>, <mailto:baja@...?subject={token}> y List-Unsubscribe-Post: List-Unsubscribe=One-Click (RFC 8058), y un link visible "Dejar de recibir estos emails" al pie.

NE10.2 El token es firmado (HMAC), identifica comercio, usuario y categoría, no vence y no inicia sesión: solo sirve para dar de baja esa categoría.

NE10.3 El POST de un clic desactiva el envío por email de esa categoría para ese usuario, sin pedir confirmación ni login, y responde 200. El GET muestra una página "Listo, no te vamos a mandar más emails de Caja. [Deshacer] [Ver todas tus preferencias]".

NE10.4 Tipos clave: darse de baja por email de una categoría clave (Stock, Reportes o Caja) corta solo el email de esa categoría; el WhatsApp sigue (y se corta con "BAJA" en el bot, B2.3). Es la baja obligatoria de cada canal, igual que "BAJA" en WhatsApp; la app muestra el estado ("Email desactivado desde el link de baja el 09/10. [Volver a activar]").

NE10.5 Seguridad y Cuenta no tienen List-Unsubscribe (NE7.4).

NE10.6 La baja queda en el audit_log (origen: link de baja) y en notification_preferences.

### Criterios de aceptación:

☐ Toco "Anular suscripción" en Gmail sobre un email de cierre de caja y dejo de recibir esos emails desde el siguiente envío, sin haber iniciado sesión; el resumen de cierre me sigue llegando por WhatsApp.

☐ La app muestra que el email de Caja está desactivado por el link de baja y me deja volver a activarlo.

☐ Un token alterado devuelve error y no cambia nada.

☐ Los emails de Seguridad no se pueden dar de baja.

### NE11. Infraestructura de envío: outbox, cola, reintentos e idempotencia (P0)

Descripción: el envío corre en el backend, nunca desde el celular. La infraestructura de envío es compartida entre todos los comercios; las preferencias y los eventos viven en la base de cada comercio.

### Requerimientos:

NE11.1 Patrón outbox: el hecho de negocio (cierre de caja, sincronización, conexión vencida) inserta su evento en notification_events de la base del comercio en la misma transacción (igual que el PRD de caja, 6.4). Nunca se llama al proveedor de email dentro de la transacción de negocio.

NE11.2 Orquestador: un worker toma los eventos pendientes, aplica preferencias, frecuencia, silencio y pausa, arma el contenido con datos en vivo cuando corresponde (NE2.1) y crea las entregas: una fila en email_outbox (base compartida de envíos) y, para los tres tipos clave, la entrega de WhatsApp en la cola del servicio del bot (PRD del bot). Registra cada entrega en notification_deliveries del comercio.

NE11.3 Idempotencia: cada entrega tiene una idempotency_key = hash(tenant_id, tipo, referencia, período, user_id, canal), con índice único. Un evento procesado dos veces, dos workers o un reintento del job de cierre producen una sola entrega por canal. Si el proveedor acepta una clave de idempotencia por request (Resend la acepta, a verificar ventana y comportamiento), se manda la misma clave.

NE11.4 Reintentos: los errores transitorios (timeout, 429, 5xx) se reintentan con backoff exponencial con jitter (1 min, 5 min, 30 min, 2 h, 6 h) hasta 24 h; los permanentes (dirección inválida o suprimida, 4xx de validación) no se reintentan. Después del último intento la entrega queda "fallida" y se ve en el Control Plane.

NE11.5 Envíos que vencen: si un resumen programado no pudo salir dentro de su ventana útil (por ejemplo, el aviso matutino después de las 12:00), se cancela y queda registrado; los de seguridad y cuenta no vencen.

NE11.6 Ritmo de envío: respeta el límite de requests por segundo del proveedor (a verificar el valor vigente de Resend), con el endpoint de envío por lotes cuando conviene; los resúmenes programados se distribuyen en una ventana de 0 a 10 minutos (jitter) para no concentrar todos los comercios en el mismo minuto (también ayuda con el límite de mensajería de WhatsApp, doc de costos 0.1).

NE11.7 Lista de supresión compartida: antes de enviar se consulta email_suppressions; a una dirección suprimida no se envía (estado "suprimido").

NE11.8 Aislamiento: el worker resuelve la base de cada comercio desde la base de control, como el resto del backend; un email nunca mezcla datos de dos comercios. Tests automáticos de aislamiento en CI.

NE11.9 Proveedor detrás de una interfaz (EmailProvider.send, parseWebhook), para poder pasar de Resend a Amazon SES o Postmark sin tocar el resto (P1: failover a un proveedor secundario).

### Criterios de aceptación:

☐ Si el proveedor responde 503, el email se reintenta y llega una sola vez cuando el proveedor vuelve.

☐ Si el orquestador procesa dos veces el mismo resumen_cierre, existe una sola fila en email_outbox y una sola entrega de WhatsApp.

☐ Si la transacción del cierre falla y se revierte, no se manda ningún email ni WhatsApp.

☐ A una dirección suprimida no se envía y la entrega queda con estado "suprimido".

☐ 500 comercios con el aviso a las 08:00 reciben su email entre las 08:00 y las 08:10.

☐ Un test de CI verifica que el email del comercio A nunca contiene datos del comercio B.

### NE12. Plantillas, copy y links a la app (P0)

### Requerimientos:

NE12.1 Plantillas con React Email (componentes TSX, mismo lenguaje que el resto del stack; MJML como alternativa), versionadas en el repo y renderizadas en el servidor a HTML + texto plano. Cada email lleva las dos versiones.

NE12.2 Diseño mobile-first: una columna de 600 px como máximo, tipografía legible en el celular, botones grandes, tablas que se leen en 360 px, compatible con modo oscuro, sin imágenes pesadas (el logo como único recurso), basado en el Tema papel del producto.

NE12.3 Copy en español rioplatense, profesional y cercano ("Esto es lo que se está acabando", "Cerraste la caja"), con voseo y sin tecnicismos. Montos en formato argentino ($ 1.245.600), fechas jueves 08/10 y horas de Buenos Aires.

NE12.4 Asuntos informativos que se entienden en la notificación del celular: comercio + qué pasó + el número clave ("Cierre de caja del jueves 08/10 — Resultado +$181.800"). Sin emojis en el asunto, sin mayúsculas sostenidas ni urgencias falsas.

NE12.5 Remitente: "Kiosco La Esquina vía [Producto]" <avisos@avisos.[dominio].com.ar> para los emails del comercio y "[Producto]" <seguridad@...> para seguridad y cuenta. Reply-To: en los emails al dueño, soporte@[dominio] (si responde, le contesta soporte); en los emails que salen en nombre del comercio hacia otros (pedidos a proveedores, PRD principal 6.7; copia al contador, NE15; emails a empleados, NE16), el Reply-To es el email del comercio, para que las respuestas le lleguen al dueño.

NE12.6 Links a la app: deep links a rutas de la PWA (/caja/cierres/2026-10-08, /pedidos/borradores?semanal=1, /alertas). Si no hay sesión, piden "Iniciar sesión con Google" y vuelven a la ruta (solo rutas internas de una allowlist, sin redirecciones abiertas). Los links nunca inician sesión solos ni ejecutan acciones.

NE12.7 Sin seguimiento: sin pixel de apertura ni reescritura de links por el proveedor (open/click tracking desactivado). Los links se ven con el dominio propio (ayuda contra el phishing, PRD de órdenes de pago 7.3).

NE12.8 Pie de todos los emails: por qué lo recibís ("Recibís este email porque sos dueño de Kiosco La Esquina en [Producto]"), link a preferencias y link de baja cuando corresponde (NE10).

NE12.9 Datos mínimos: el email muestra lo necesario para entender el aviso; no incluye datos de cobro de proveedores (CBU/alias) ni datos personales de terceros más allá del nombre.

NE12.10 Vista previa de cada plantilla con datos de ejemplo en el Control Plane y tests de snapshot del HTML.

### Criterios de aceptación:

☐ El email de cierre se lee completo en un Android de gama media en la app de Gmail, sin scroll horizontal.

☐ Con las imágenes bloqueadas el email se entiende igual; la versión de texto plano tiene todo el contenido.

☐ Toco un link del email sin sesión iniciada, entro con Google y llego a la pantalla del link.

☐ Un link manipulado para redirigir a otro dominio termina en el inicio de la app.

☐ Ningún email tiene pixel de seguimiento ni links reescritos por el proveedor.

☐ Respondo un email de aviso y la respuesta le llega a soporte; respondo un pedido a proveedor y la respuesta le llega al email del comercio.

### NE13. Dominio de envío y entregabilidad: SPF, DKIM, DMARC, rebotes y quejas (P0)

### Requerimientos:

NE13.1 Subdominio dedicado para notificaciones (avisos.[dominio].com.ar), separado del dominio principal y de cualquier envío futuro de marketing, para aislar la reputación.

NE13.2 SPF (incluye al proveedor), DKIM (2048 bits) y DMARC alineado: arranca en p=none con reportes (rua), pasa a p=quarantine tras 2 a 4 semanas sin fallas y (P1) a p=reject. Dominio de retorno (Return-Path / MAIL FROM) propio para la alineación de SPF. Es requisito de Gmail y Yahoo para remitentes con volumen (SPF + DKIM + DMARC, baja en un clic, quejas < 0,3%) (Google – Email sender guidelines, Yahoo – Sender best practices; detalle a verificar contra la versión vigente).

NE13.3 Webhooks del proveedor (entregado, demorado, rebote duro, rebote blando, queja) a un endpoint del backend con verificación de firma (en Resend, firmas Svix), idempotente por id de evento, que actualiza delivery_status y email_outbox.

NE13.4 Rebote duro o queja: la dirección pasa a email_suppressions, se dejan de enviar los emails desactivables y se muestra el banner de NE9.9. Si el dueño no tiene un email entregable, en la siguiente conversación con el bot se le menciona dentro de la respuesta (sin plantilla extra, P1).

NE13.5 Rebotes blandos: 3 rebotes blandos seguidos en 7 días = supresión temporal de 7 días (seguridad y cuenta se siguen intentando).

NE13.6 Métricas en el Control Plane, por comercio y globales: enviados, entregados, rebotes, quejas, suprimidos; alerta interna si la tasa de quejas supera 0,1% o la de rebotes 2% en 24 h.

NE13.7 Alta del dominio de envío en Google Postmaster Tools.

### Criterios de aceptación:

☐ Un email de prueba a Gmail muestra spf=pass, dkim=pass y dmarc=pass en los encabezados.

☐ Un webhook con firma inválida se rechaza con 401 y no cambia ningún estado.

☐ Un rebote duro suprime la dirección y la app me muestra el banner al entrar.

☐ El mismo webhook recibido dos veces deja un solo registro en delivery_status.

☐ El Control Plane muestra la tasa de quejas de las últimas 24 h y dispara la alerta interna si supera 0,1%.

### NE14. Historial de notificaciones en la app (P0 simple)

### Requerimientos:

NE14.1 "Configuración" → "Notificaciones" → "Historial": las notificaciones de los últimos 90 días con tipo, fecha y hora, y estado por canal (Email: entregado / rebotó / suprimido; WhatsApp: entregado / leído / falló, según el PRD del bot).

NE14.2 Tocar una notificación abre el contenido en la app (la pantalla de origen: cierre, alertas, resumen), no una copia del email.

NE14.3 (P1) "Reenviar por email" desde el historial.

### Criterios de aceptación:

☐ Veo el cierre de anoche con "Email: entregado · WhatsApp: leído".

☐ Un email que rebotó aparece como "Rebotó", con la explicación y el link para revisar la dirección.

### NE15. Destinatarios adicionales (P1)

NE15.1 Email de notificaciones alternativo del dueño (por ejemplo, el email del negocio), verificado con un link de un solo uso; reemplaza al de Google para las notificaciones desactivables. Seguridad va siempre también al email de Google.

NE15.2 Copia al contador de los tipos elegidos (resumen de cierre, reporte semanal, reporte mensual de caja), con Reply-To del comercio, link de baja propio y sin links que den acceso a la app.

### NE16. Empleados como destinatarios (P2)

NE16.1 El Dueño puede sumar empleados como destinatarios de algunos tipos (por ejemplo, el aviso matutino de stock bajo para quien hace los pedidos), siempre por email; el contenido se filtra según el rol (sin costos, márgenes ni saldos, AU4).

NE16.2 Cada empleado tiene su propio link de baja; el Dueño ve quién está suscripto. Reply-To: el email del comercio.

NE16.3 Al revocar el acceso de un empleado (AU7) se cortan todas sus notificaciones en la misma transacción.

### NE17. Eventos de las funciones nuevas de v1: turno, conteo, fiado, lotes y promos (P0, email + en la app)

Descripción: las funciones nuevas de la primera versión (entregas de turno, conteo por sector, fiado, lotes y promos) emiten eventos al mismo outbox (NE11). Canales: solo las tres notificaciones clave (NE2, NE3, NE4) van por WhatsApp y por email a la vez; los eventos de esta sección van por email y en la app (aviso al instante en la app e historial NE14). Cada tipo de NE17 se puede pasar también a WhatsApp desde preferencias si el dueño lo activa (apagado por defecto, como pide C17.6 del PRD de caja); el costo de esa opción está en 7.3 y en el doc de costos.

### Requerimientos:

NE17.1 Diferencia de turno fuera de tolerancia (diferencia_turno, PRD de caja C17.13 y C17.27): faltante o sobrante fuera de la tolerancia en una entrega de turno, un cierre sin receptor o un conteo sorpresa de efectivo. Contenido: monto, esperado y contado, quién entregó y quién recibió, motivo cargado y link "Resolver". Las diferencias menores (dentro de la tolerancia) no generan aviso: van solo en el resumen de cierre.

NE17.2 Entrega "en disputa" (entrega_en_disputa, C17.16 y C17.17): quien recibe rechazó el conteo; muestra los dos conteos y el link "Resolver disputa" (solo el Dueño resuelve). Al resolverse se manda un aviso de resolución por el mismo canal. Si sigue sin resolver, se recuerda como máximo una vez por día (NE6.6).

NE17.3 Ajuste grande por conteo (ajuste_conteo_grande, F13 del PRD principal): cuando un conteo por sector queda "listo para revisar" o se confirma con una diferencia que supera el umbral (por defecto, una diferencia neta a costo mayor a $20.000 o más de 10% de las unidades del sector, configurable [decisión propuesta]). Contenido: sector, quién contó, faltantes, sobrantes y neto (el valor a costo, solo para el Dueño) y el link "Revisar y confirmar".

NE17.4 Fiado vencido o sobre el tope (fiado_vencido, fiado_sobre_tope; "PRD - Fiado y Cuenta Corriente de Clientes", en redacción, y C18 del PRD de caja): un cliente con deuda vencida según el plazo que defina el PRD de fiado, o con saldo sobre su tope (por ejemplo, después de sincronizar ventas a cuenta offline, OF16.1 del PRD offline). También el saldo negativo por dos cobros offline (OF16.1.5). Por defecto en el resumen diario, agrupado por cliente; link a la cuenta del cliente. Los recordatorios al cliente del kiosco no son parte de este PRD.

NE17.5 Lote por vencer (lote_por_vencer, F12.7 del PRD principal y RT13.6 del PRD de rotación): los lotes que cruzan los umbrales (por defecto 15, 7 y 3 días) van como sección del aviso matutino (NE2), que ya sale por WhatsApp y por email: llegan por los dos canales sin una plantilla de WhatsApp extra. En la app, en el panel "Por vencer". Si el dueño apagó el aviso matutino, se manda un email propio en el resumen diario.

NE17.6 Promo por vencimiento sugerida (promo_vencimiento_sugerida, F12.9 del PRD principal y RT14 del PRD de rotación): el sistema sugiere una promoción (descuento, 2x1, combo) para un lote próximo a vencer; contenido: producto, lote, unidades, días restantes y la promo sugerida, con el link "Crear promo" (crear la promo es del Dueño, AU4). Por defecto en el resumen diario.

NE17.7 Todos respetan preferencias, frecuencia, horario de silencio y pausa (NE9), la baja por categoría (NE10) y la deduplicación (NE6.6: por ejemplo, diferencia_turno:<entrega>, lote_por_vencer:<lote>:<umbral>, fiado_vencido:<cliente>:<fecha>).

NE17.8 El contenido se filtra según el destinatario: los valores a costo, márgenes y saldos acumulados solo van al Dueño (AU4).

### Criterios de aceptación:

☐ Ana entrega el turno con un faltante de $1.500 (tolerancia ±$500): recibo al instante el aviso en la app y un email con el monto, quién entregó y quién recibió; no se manda ninguna plantilla de WhatsApp (verificado en bot_message_log).

☐ Activo "también por WhatsApp" para diferencia_turno: la siguiente diferencia fuera de tolerancia me llega además por WhatsApp.

☐ Juan rechaza una entrega: recibo el aviso "Entrega en disputa" por email y en la app; al resolverla recibo el aviso de resolución.

☐ Un conteo de la "Heladera A" con −$35.000 a costo me llega como "ajuste grande por conteo" con el link para revisar y confirmar.

☐ Doña Rosa queda sobre su tope después de sincronizar: el resumen diario por email la incluye.

☐ Un lote de yogures cruza los 7 días: aparece dentro del aviso matutino por WhatsApp y por email, sin una plantilla extra.

☐ Con la sugerencia de promo, el email trae el link "Crear promo" que abre la promoción precargada en la app.

### 4.17 Integración con los demás PRDs

### 4.18 Ajustes propuestos a otros documentos (para unificar; no se modifican desde este documento)

Doc de costos, 1.2 y 3.4: sumar la plantilla diaria del resumen de cierre por WhatsApp (~30 por mes por cliente, +USD 0,78) y actualizar el volumen de email (con 2.000 clientes, ~160.000 emails por mes no entran en Resend Pro de 100.000; ver 7.2).

PRD de autenticación, AU9.5: el aviso de dispositivo nuevo pasa de P1 a P0 por email (NE7.1).

PRD principal, F4.6 y 6.7: referenciar este PRD para el resumen de stock bajo por email y los avisos de suscripción.

PRD del bot, 6.8: notification_preferences queda definida en este PRD (sin campo de canal); se cubre con la alineación en curso de los PRD del bot y de caja.

## 5. Flujos de usuario

### Flujo 1: el dueño configura sus notificaciones desde el celular

Mauricio entra a "Más" → "Configuración" → "Notificaciones" en el celular.

Ve las tarjetas: "Aviso de stock bajo — Por WhatsApp y email — Diario 08:00", "Resumen del viernes — Por WhatsApp y email — Viernes 18:00", "Cierre de caja — Por WhatsApp y email — Al cerrar", "Ventas del día — Por email — Con el cierre", "Vencimientos — Por email — Resumen diario 08:00", "Sistema — Por email — Instantáneo", y "Seguridad" y "Cuenta" con candado.

Cambia el aviso de stock bajo a las 07:00 y el horario de silencio a 22:30–07:00. No hay ningún selector de canal.

Toca "Así se ve" en el cierre de caja y ve un ejemplo del email y del WhatsApp.

Guarda; el cambio queda en el audit_log.

### Flujo 2: aviso matutino por WhatsApp y email → pedido

A las 07:00 el sistema calcula con stock en vivo: 7 productos en alerta, 2 sin stock.

Le llega la plantilla de WhatsApp del aviso matutino (B5) y, en paralelo, el email con la tabla por proveedor.

Desde el mayorista abre el email, toca "Armar pedido" de Distribuidora X y la PWA abre el borrador con los productos cargados; ajusta y envía.

En el historial de notificaciones ve "Email: entregado · WhatsApp: leído".

### Flujo 3: resumen del viernes → pedido del lunes

El viernes a las 18:00 recibe el resumen semanal por WhatsApp y por email.

El sábado, en su casa, abre el email: ve lo más vendido, la caja de la semana y el pedido sugerido por proveedor.

Toca "Revisar pedido sugerido", corrige dos cantidades en la app y lo programa para el lunes 08:00.

El lunes, antes de enviar, el sistema recalcula (B9.4) y el pedido sale.

### Flujo 4: cierre automático de caja con horario de silencio

La hora de corte es 00:00 y nadie tocó "Cerrar caja"; el silencio es de 23:00 a 07:30.

A las 00:00 el job cierra la jornada como "automático" e inserta resumen_cierre en el outbox.

El orquestador ve que está en silencio y programa las dos entregas para las 07:30.

A las 07:30 recibe el resumen por WhatsApp (versión corta) y por email (versión completa, con las ventas del día de NE5).

### Flujo 5: stock negativo después de una sincronización offline

Durante un corte de internet, un empleado vende sin conexión desde el celular (SQLite local): 5 Coca-Cola, con stock 3 en el servidor.

Al volver la conexión, la cola se sincroniza sin duplicar (idempotency_key); la Coca-Cola queda en −2 y se marca en rojo.

El endpoint de sincronización emite stock_negativo_post_sync con los productos afectados.

El dueño recibe un solo email con la lista, el dispositivo ("Celular del turno tarde") y el usuario; toca "Revisar y corregir" y carga el ingreso que faltaba.

### Flujo 6: el cierre automático falló

A las 00:00 el worker de cierre estaba caído y los reintentos no lograron cerrar.

A las 06:00 el job de control detecta la jornada con movimientos sin cerrar.

Se envía el email "No pudimos cerrar la caja del jueves 08/10" (si el dueño tiene Sistema en resumen diario, va en ese email).

Cuando el reintento completa el cierre, sale el resumen de cierre normal por los dos canales.

### Flujo 7: inicio de sesión desde un dispositivo nuevo

Alguien entra con la cuenta de Google del dueño desde una PC en Córdoba a las 23:40.

Al instante (ignora el silencio) llega el email de seguridad con el dispositivo, la ubicación aproximada y la hora.

Mauricio no fue: toca "Ver dispositivos", entra a la app, cierra esa sesión (AU9) y asegura su cuenta de Google.

### Flujo 8: Gmail desconectado

El dueño revoca sin querer el acceso de la app a su Gmail desde su cuenta de Google.

El job que lee facturas recibe invalid_grant, marca la conexión como caída y emite el evento.

Recibe el email "Se desconectó tu Gmail: no vamos a poder leer las facturas de servicios"; toca "Volver a conectar", se reautentica con Google y conecta.

### Flujo 9: problema de pago de la suscripción

Mercado Pago rechaza el cobro mensual.

El webhook pasa el comercio a "en demora" (regla de 14 días, NE7.3) y se envía el email (obligatorio) con la fecha límite y el botón para actualizar el medio de pago.

Dos días antes del fin de los 14 días (antes de pasar a solo lectura el día 15) llega el recordatorio; el dueño paga y recibe "Tu suscripción está al día".

### Flujo 10: baja de un email desde Gmail

El dueño ya mira los cierres en WhatsApp y no quiere más el email de cierre.

Toca "Anular suscripción" en Gmail (List-Unsubscribe de un clic).

Deja de recibir el email de Caja; el WhatsApp sigue. En la app ve "Email de Caja desactivado desde el link de baja" y puede volver a activarlo.

## 6. Notas técnicas

### 6.1 Principios

Backend y outbox siempre: el celular nunca manda emails; todo pasa por el outbox y la cola.

Mismo cálculo, dos canales: las tres notificaciones clave salen de un único evento y una única función de dominio; WhatsApp y email solo cambian el formato.

Preferencias en la base del comercio, envío compartido: coherente con una base por cliente (PRD principal, 6.4).

Barato por diseño: el email es el canal de todo lo que no es clave; WhatsApp, solo para las tres clave (doc de costos).

Lo mínimo en lo compartido: la base compartida de envíos guarda lo mínimo y purga el contenido a los 30 días.

### 6.2 Arquitectura

Base del comercio (una por cliente)            Infraestructura compartida

-----------------------------------            -------------------------------------------

hecho de negocio --(misma tx)--> notification_events

notification_preferences                        Scheduler (base de control: notification_schedules)

notification_user_settings        +------------ ticker cada minuto -> jobs pg-boss por comercio

notification_deliveries  <--------+

|  Orquestador (worker TypeScript)

+-> email_outbox -> Sender -> Resend (API) -> dueño

|                    ^

|   webhooks -> delivery_status, email_suppressions

+-> cola del bot (PRD del bot) -> WhatsApp Cloud API (solo los 3 tipos clave)



Orquestador y sender: workers TypeScript en la VPS de API/jobs (Hetzner, doc de costos 3.4), con pg-boss sobre la base compartida de envíos, Zod para validar payloads y Drizzle.

Base compartida de envíos: una base Postgres propia del servicio de notificaciones (recomendado, separada de la base de control para no cargarla), en el mismo servidor de Postgres. Alternativa para el MVP: un esquema notifications dentro de la base de control (a decidir, pregunta abierta 7).

Lectura de eventos: cada base de comercio avisa con NOTIFY al insertar en notification_events y el orquestador procesa ese comercio; un barrido cada 1 a 5 minutos por los comercios con eventos pendientes (marcados en la base de control) cubre lo que se pierda.

### 6.3 Modelo de datos

### Base del comercio:

### Infraestructura compartida (base de envíos):

### Base de control:

stock_movements, closing_summaries, auth_events y demás no cambian: este módulo solo lee y recibe eventos.

Migraciones con el mismo runner del PRD principal (base de control, base de envíos y todas las bases de clientes).

### 6.4 Schedulers por comercio en America/Argentina/Buenos_Aires

Un ticker cada minuto busca en notification_schedules las filas con proximo_envio_at <= now() y encola un job por (comercio, tipo) en pg-boss, con singletonKey = tenant:tipo:fecha_local (no puede haber dos jobs para el mismo envío).

El job abre la base del comercio, calcula el contenido con datos en vivo (aviso matutino, resumen del viernes, ventas del día, resúmenes diarios de vencimientos y de sistema), inserta el evento con dedupe_key = tipo:fecha_local y recalcula proximo_envio_at.

Las horas se calculan con la zona IANA America/Argentina/Buenos_Aires (por ejemplo, con Temporal o date-fns-tz), nunca con un desfase fijo: Argentina hoy no tiene horario de verano, pero lo tuvo y podría volver.

El resumen de cierre no es programado: lo dispara el evento del cierre (manual, o el job de cierre automático del PRD de caja 6.6, que ya corre por comercio en la misma zona).

Horario de silencio: si el envío cae dentro del silencio, procesar_desde = fin del silencio; los silencios que cruzan la medianoche (23:00–07:30) se resuelven en hora local.

Jitter de 0 a 10 minutos por comercio, estable (hash del tenant), para repartir la carga y cuidar el límite de mensajería de WhatsApp.

Un job de control cada hora alerta en el Control Plane si hay eventos pendientes hace más de 30 minutos o un resumen programado sin generar.

### 6.5 Proveedor de email

Recomendado: Resend (ya elegido en el doc de costos, 3.4 y 4): API simple, SDK de TypeScript, integración nativa con React Email, webhooks firmados y envío por lotes. Plan B: Amazon SES (el más barato a escala, con más trabajo de configuración y de reputación). Postmark (excelente entregabilidad, más caro) y SendGrid (Essentials comparable en precio a Resend, sin plan gratis permanente desde 2025) quedan como alternativas (comparación en 7.1).

Streams separados: notificaciones (avisos.) y pedidos a proveedores (PRD principal 6.7), para no mezclar reputación.

Secretos (API key, secreto de webhooks) en el gestor de secretos del hosting; la key, solo con permiso de envío.

### 6.6 Seguridad y privacidad

Webhooks con firma verificada, rate limiting y respuesta idempotente.

Tokens de baja con HMAC y rotación de clave (se conserva la anterior para validar tokens viejos).

Sin PII en logs: emails enmascarados; el contenido de los emails no se loguea.

Contenido purgado de email_outbox a los 30 días; delivery_status se conserva 12 meses sin contenido. Al dar de baja un comercio se borran sus filas de la base de envíos (Ley 25.326).

El proveedor de email procesa la dirección y el contenido: se documenta como encargado del tratamiento en la política de privacidad (a verificar con asesoría legal la transferencia internacional de datos).

### 6.7 Calidad y observabilidad

Tests unitarios (Vitest) de preferencias, silencio, frecuencia, idempotencia y cálculo de horarios con zona horaria.

Test que compara el render de WhatsApp y el de email con el mismo payload (mismos números).

Tests de snapshot de las plantillas y pruebas de render en clientes reales (Gmail Android/iOS, Outlook) antes de cada cambio de plantilla.

Tests end-to-end (Playwright, viewport de celular) de la pantalla de preferencias y de la baja en un clic.

Sentry para errores; métricas de la cola (pendientes, edad del más viejo, reintentos) y de entrega en el Control Plane.

## 7. Costos

### 7.1 Comparación de proveedores de email transaccional (precios publicados, consultados el 9/10/2026)

### 7.2 Volumen y costo estimado de email

Supuestos por cliente al mes (estimado/a verificar en el piloto), solo el dueño: aviso matutino 21–30 (solo días con novedades), resumen del viernes 4,3, cierre de caja 30 (con las ventas del día en el mismo email), vencimientos 4–8, sistema/seguridad/cuenta 3–5 → ~65–80 emails; se usan 80 para el cálculo.

Conclusión: el email cuesta entre USD 0,01 y 0,40 por cliente al mes según la escala y el proveedor. Con Resend y 500 clientes, ~USD 0,04 por cliente (≈ ARS 62, a USD 1 = ARS 1.540 como en el doc de costos). Se mantiene Resend por velocidad de desarrollo (React Email, SDK de TypeScript) y SES como plan B si a escala el costo pasa a ser relevante.

Diferencia con el doc de costos (3.4): ahí se supone Resend Pro de USD 20 / 20 / 35 para 50 / 500 / 2.000 clientes. Con el volumen de este PRD, con 2.000 clientes son ~USD 89 (+USD 54 por mes, +USD 0,03 por cliente). Ver ajuste 1 de 4.18.

### 7.3 Costo de las tres notificaciones clave por WhatsApp

Según el doc de costos (0.1 y 1.1), cada plantilla de utilidad de WhatsApp en Argentina cuesta ~USD 0,026 (tarifa de fuentes de terceros, a verificar contra el archivo oficial de Meta), se cobra incluso dentro de la ventana de 24 h desde el 1/10/2026 y no entra en el cupo gratis de 1.000 mensajes de servicio del número central. Por eso cada notificación clave por WhatsApp tiene un costo, mientras que el mismo aviso por email cuesta casi cero.

Por mensaje: WhatsApp ~USD 0,026; email USD 0,0001 (SES) a 0,0009 (excedente de Resend). El email es entre 30 y 260 veces más barato.

Impacto nuevo: el doc de costos (1.2) ya incluye el aviso matutino (30) y el resumen del viernes (4,3), pero no el resumen de cierre diario por WhatsApp: suma ~30 plantillas, +USD 0,78 por cliente al mes (+USD 390 por mes con 500 clientes). En el plan Básico (USD 15, doc de costos 9) eso baja el margen ~5 puntos (estimado).

Límite de mensajería: el resumen de cierre suele salir fuera de la ventana de 24 h, así que suma usuarios únicos contra el límite por portfolio (doc de costos, 0.1); con 500 clientes refuerza la necesidad de verificar el negocio en Meta.

Cómo se contiene el costo sin suprimir ningún canal: (1) no se envía nada sin novedades (aviso matutino) ni sin movimientos (cierre); (2) el aviso matutino es opt-in en el bot; (3) todo lo que no es clave (vencimientos, sistema, seguridad, cuenta, ventas del día, consumos) va solo por email en lugar de plantillas; si los 5–20 "otros avisos" del doc de costos (1.2) pasaran a email, se ahorrarían USD 0,13–0,52 por cliente (pregunta abierta 5).

Eventos nuevos de v1 (NE17): por defecto van por email y en la app, así que su costo de WhatsApp es cero; el lote por vencer va dentro del aviso matutino, sin plantilla extra. Si el dueño activa WhatsApp para alguno, cada aviso es una plantilla de utilidad (~USD 0,026); la estimación por cliente está en el doc de costos.

## 8. Riesgos y preguntas abiertas

### 8.1 Riesgos

### 8.2 Preguntas abiertas

Resumen de cierre diario por WhatsApp: ¿se manda todos los días, o, para ahorrar plantillas, solo cuando el dueño no abrió la app ese día, o se combina con el aviso matutino del día siguiente en una sola plantilla (sin tocar el email)? Cada opción cambia el costo de 7.3.

Horario de silencio y cierre automático a las 00:00: ¿el default 23:00–07:30 es razonable, o el dueño prefiere el resumen de cierre a la medianoche aunque le suene el celular?

Ventas del día: ¿siempre dentro del email de cierre, o como email aparte por defecto?

Baja de email en un tipo clave: ¿alcanza con mostrar el estado en la app, o se le pregunta al dueño por WhatsApp si lo quiere reactivar (cuesta una plantilla)?

Vencimientos y otros avisos por WhatsApp (OP11, CS12): ¿se mantienen por WhatsApp además del email, o pasan solo a email para ahorrar plantillas (USD 0,13–0,52 por cliente)?

Instantánea de productos críticos (P1): ¿por los dos canales (más costo) o queda fuera del grupo clave?

Base compartida de envíos: ¿base propia del servicio de notificaciones o esquema dentro de la base de control en el MVP?

Dominio de envío: ¿.com.ar o .com? ¿Nombre del subdominio (avisos., notificaciones.)?

Remitente: ¿"Kiosco La Esquina vía [Producto]" o solo "[Producto]"? Afecta el reconocimiento y la confianza.

Idempotencia del proveedor: confirmar el soporte y la ventana de la clave de idempotencia de Resend (a verificar).

Copia al contador (P1): ¿es un diferencial del plan Pro?

Cumplimiento: confirmar con asesoría legal la mención del proveedor de email como encargado del tratamiento y la transferencia internacional de datos (Ley 25.326).

## 9. Plan por fases

### Fase 0: preparación y validación (1 semana)

Elegir dominio y subdominio de envío; configurar SPF, DKIM, DMARC (p=none), Return-Path y Postmaster Tools.

Cuenta de Resend (Pro), API key con permiso de envío y endpoint de webhooks.

Diseño y copy de las plantillas clave (aviso matutino, resumen del viernes, cierre) y de seguridad, probados con 5 dueños de kiosco.

Contrato de eventos con los equipos de caja, bot, offline y autenticación.

### Fase 1: MVP (3 a 4 semanas, junto con el lanzamiento del inventario y la caja)

Modelo de datos (6.3), outbox, orquestador, sender, reintentos, idempotencia, supresión y webhooks (NE11, NE13).

Scheduler por comercio en America/Argentina/Buenos_Aires.

Pantalla de preferencias mobile-first (NE9), historial simple (NE14) y baja en un clic (NE10).

Notificaciones P0: las tres clave por WhatsApp + email (NE2, NE3, NE4), ventas del día (NE5), eventos de operación (NE6), seguridad y cuenta (NE7), vencimientos (NE8.1 a NE8.4) y los eventos de las funciones nuevas de v1 por email + en la app (NE17).

Piloto con 20 a 50 comercios; DMARC a p=quarantine al terminar el piloto.

### Fase 2: comodidad (meses 2 y 3)

Factura de servicio detectada y resumen mensual de consumos (NE8.5, NE8.6).

Instantánea de productos críticos (NE2.7) y reporte mensual de caja.

Email alternativo y copia al contador (NE15); reenvío desde el historial.

DMARC a p=reject; proveedor secundario con failover.

Ajuste de frecuencias y defaults según las métricas de bajas, quejas y costo de plantillas del piloto.

### Fase 3: más destinatarios y canales (meses 4 a 12)

Empleados como destinatarios (NE16).

Notificaciones push de la PWA (a evaluar).

Plantillas por rubro y BIMI.

## 10. Fuentes (consultadas el 9/10/2026)

Resend – Pricing: https://resend.com/pricing; cuotas y límites: https://www.resend.com/docs/knowledge-base/account-quotas-and-limits

Postmark – Pricing: https://postmarkapp.com/pricing

Twilio SendGrid – Email API Pricing: https://www.twilio.com/en-us/products/email-api/pricing; prueba de 60 días: https://support.sendgrid.com/hc/en-us/articles/35270136965403

Amazon SES – Pricing: https://aws.amazon.com/ses/pricing/

Google – Email sender guidelines: https://support.google.com/a/answer/81126; Yahoo – Sender best practices: https://senders.yahooinc.com/best-practices/

RFC 8058 (List-Unsubscribe-Post, baja en un clic): https://www.rfc-editor.org/rfc/rfc8058

Tarifas de WhatsApp, cupo compartido y tipo de cambio: "Costos estimados por cliente - Sistema de Inventario" (mismo folder), secciones 0.1, 1.1, 1.2, 7.3 y 9.

Campo | Detalle
--- | ---
Producto | Módulo de Notificaciones por Email del Sistema de Inventario para Kioscos y Comercios (nombre comercial a definir, en adelante [Producto])
Autor | Mauricio Matasini
Estado | Borrador v1
Fecha | 9 de octubre de 2026
Documentos relacionados (mismo folder) | "PRD - Sistema de Inventario para Kioscos y Comercios" (PRD principal), "PRD - Caja Digital", "PRD - Bot de WhatsApp", "PRD - Consumos de Servicios", "PRD - Órdenes de Pago", "PRD - Facturas de Proveedores", "PRD - Autenticación y Gestión de Usuarios", "Costos estimados por cliente" (doc de costos) y "PRD - Modo Offline" (en redacción)
Stack | Astro + TypeScript (PWA, SSR), PostgreSQL con una base de datos por cliente más una base de control, cola de jobs (pg-boss / Inngest / cron), proveedor de email transaccional (recomendado: Resend)

Prioridad | Significado
--- | ---
P0 - MVP | Imprescindible para el lanzamiento
P1 - Post-MVP cercano | Fase 2, dentro de los 2 a 3 meses posteriores al lanzamiento
P2 - Futuro | Fase 3 en adelante, según demanda

# | Funcionalidad | MVP (P0) | Más adelante (P1/P2)
--- | --- | --- | ---
NE1 | Catálogo de notificaciones y canales fijos | Catálogo de tipos con canal fijo; las 3 clave por WhatsApp + email; el resto por email | Nuevos tipos según demanda
NE2 | Aviso matutino de stock bajo | WhatsApp + email, diario a la hora configurada, solo con novedades | Alerta instantánea de productos críticos (P1)
NE3 | Resumen semanal del viernes | WhatsApp + email, pensado para pedir el lunes | Día y contenido por rubro (P2)
NE4 | Resumen de cierre de caja | WhatsApp + email al cerrar (manual o automático), snapshot sin recalcular | Reporte mensual de caja por email (P1)
NE5 | Resumen diario de ventas | Email, junto con el cierre o a una hora fija | Comparación con la semana anterior (P1)
NE6 | Eventos del sistema: operación | Email: problemas de sincronización, stock negativo tras sincronizar, cierre automático fallido, Gmail/Photos vencido | Resumen de salud del comercio (P2)
NE7 | Seguridad y cuenta (obligatorios) | Email: login desde dispositivo nuevo, sesiones cerradas o acceso revocado, problemas de pago y estado de la suscripción | —
NE8 | Vencimientos y consumos | Email: vencimientos próximos y vencidos (caja y órdenes de pago) | Factura de servicio detectada por email (P1)
NE9 | Preferencias | Qué recibir, frecuencia por tipo, hora, horario de silencio, pausa | Email de notificaciones distinto del de Google (P1)
NE10 | Desuscripción en un clic | List-Unsubscribe (RFC 8058) por categoría, sin login | —
NE11 | Infraestructura de envío | Outbox, cola, reintentos, idempotencia, distribución en el tiempo | Proveedor secundario con failover (P1)
NE12 | Plantillas, copy y links | React Email, versión HTML + texto, español rioplatense, links a la app | Plantillas por rubro (P2)
NE13 | Dominio y entregabilidad | SPF, DKIM, DMARC, webhooks de rebotes y quejas, lista de supresión | DMARC en p=reject (P1), BIMI (P2)
NE14 | Historial de notificaciones en la app | Lista de lo enviado con estado por canal | Reenviar un email (P1)
NE15 | Destinatarios adicionales | — | Email alternativo del dueño y copia al contador (P1)
NE16 | Empleados como destinatarios | — | P2
NE17 | Eventos de las funciones nuevas de v1 | Email + en la app: diferencia de turno fuera de tolerancia, entrega en disputa, ajuste grande por conteo, fiado vencido o sobre el tope, lote por vencer (también dentro del aviso matutino), promo por vencimiento sugerida | WhatsApp opcional por tipo, apagado por defecto (P0 configurable)

Tipo | Categoría (para la baja) | Canal | Frecuencias permitidas | Por defecto | ¿Se puede desactivar?
--- | --- | --- | --- | --- | ---
stock_bajo_matutino | Stock | WhatsApp + email | Diaria (aviso matutino) · Semanal (solo dentro del resumen del viernes) · (P1) Instantánea para productos críticos | Diaria, 08:00 | Sí
resumen_semanal | Reportes | WhatsApp + email | Semanal | Viernes 18:00 | Sí
cierre_caja | Caja | WhatsApp + email | Instantánea (al cerrar) · Diaria (a la mañana siguiente) | Instantánea | Sí
ventas_diarias | Reportes | Email | Diaria (con el cierre o a una hora fija) · Semanal (dentro del resumen del viernes) | Diaria, con el cierre | Sí
vencimientos | Pagos | Email | Instantánea · Resumen diario · Semanal (lunes, "pagos de la semana") | Resumen diario, 08:00 | Sí
alertas_caja | Caja | Email | Instantánea · Resumen diario | Instantánea | Sí
sistema_operacion | Sistema | Email | Instantánea · Resumen diario | Instantánea | Sí, salvo el cierre automático fallido y el stock negativo, que como mínimo van en el resumen diario
seguridad | Seguridad | Email | Instantánea | Instantánea | No
cuenta_suscripcion | Cuenta | Email | Instantánea | Instantánea | No
consumo_detectado (P1) | Pagos | Email | Instantánea · Resumen diario | Resumen diario | Sí
diferencia_turno (NE17.1) | Caja | Email + en la app (WhatsApp opcional, apagado por defecto) | Instantánea · Resumen diario | Instantánea | Sí (en la app y en el resumen de cierre se ve siempre)
entrega_en_disputa (NE17.2) | Caja | Email + en la app (WhatsApp opcional, apagado por defecto) | Instantánea | Instantánea | Sí (en la app se ve siempre)
ajuste_conteo_grande (NE17.3) | Stock | Email + en la app (WhatsApp opcional, apagado por defecto) | Instantánea · Resumen diario | Instantánea | Sí
fiado_vencido / fiado_sobre_tope (NE17.4) | Fiado | Email + en la app (WhatsApp opcional, apagado por defecto) | Instantánea · Resumen diario · Semanal | Resumen diario, 08:00 | Sí
lote_por_vencer (NE17.5) | Stock | Dentro del aviso matutino (WhatsApp + email, sin plantilla extra) + en la app; email propio solo si el aviso matutino está apagado | Diaria (con el aviso matutino) · Semanal | Con el aviso matutino | Sí
promo_vencimiento_sugerida (NE17.6) | Stock | Email + en la app (WhatsApp opcional, apagado por defecto) | Instantánea · Resumen diario | Resumen diario, 08:00 | Sí

PRD | Qué aporta / qué consume | Puntos de integración
--- | --- | ---
PRD de caja | Evento resumen_cierre (C12.10, 6.4) y alertas de caja (C10.3) | El resumen de cierre se envía por WhatsApp + email (NE4) desde el snapshot de closing_summaries, sin recalcular. Usa la tabla notification_events que ya define 6.4. Cierre automático fallido (6.6, job nocturno de control) → NE6.3. Vencimientos (C9, C10.2) → NE8.
PRD del bot | Entrega por WhatsApp de las tres notificaciones clave; opt-in, "BAJA" y plantillas | El aviso matutino (B5) y el resumen del viernes (B9) salen por WhatsApp + email (NE2, NE3), del mismo evento y cálculo. El bot sigue siendo el canal para lo que el comerciante le escribe (consultas, pedidos, fotos de facturas, confirmaciones). La entrega por WhatsApp respeta B1 y B2; la baja de email (NE10) no toca el opt-in de WhatsApp. Los PRD del bot y de caja se están alineando por separado a "WhatsApp + email".
PRD de consumos | Factura detectada, conexión caída, resumen mensual | Conexión de Gmail/Photos vencida (CS12.4) → NE6.4 (P0). Factura detectada y resumen mensual → NE8.5 y NE8.6 (P1). La confirmación en un toque sigue en el bot (CS4).
PRD de órdenes de pago | Recordatorios de vencimiento (OP11) | Vencimientos próximos, del día, vencidos y "pagos de la semana" por email (NE8), con la regla de un aviso por vencimiento (OP11.1) y sin ejecutar pagos (7.1).
PRD offline (en redacción) | Resultado de la sincronización de la cola SQLite | El endpoint de sincronización emite eventos de movimientos rechazados, dispositivos sin sincronizar y stock negativo después de sincronizar → NE6.1 y NE6.2.
PRD de autenticación | Destinatario, roles y eventos de seguridad | Destinatario = email verificado de Google del Dueño (users.email). Eventos de auth_events (login en dispositivo nuevo, cierres remotos, revocaciones) → NE7. Permisos de la pantalla de preferencias según AU4. Links con sesión y reautenticación (AU10).
PRD principal | Stock bajo (F4), suscripción (F8.4), email (6.7) | F4.6 (resumen diario por email) queda cubierto por NE2. Avisos de suscripción → NE7.3. Reutiliza el proveedor transaccional y el dominio de 6.7 (los pedidos a proveedores usan la misma infraestructura, en otro stream).
PRD de caja, inventario, rotación y fiado (funciones nuevas de v1) | Eventos de turno (C17.27), cobros y saldos de fiado (C18.9), conteo (F13), lotes (F12, RT13) y promos sugeridas (RT14) | Se reciben en el outbox (NE11) y salen por email + en la app según NE17; WhatsApp solo si el dueño lo activa por tipo. El lote por vencer va dentro del aviso matutino (NE2).
Doc de costos | Costo de email y de plantillas | Ver sección 7.

Entidad | Campos principales | Notas
--- | --- | ---
notification_preferences | id, user_id, tipo (enum del catálogo NE1.3), activo (bool), frecuencia (instantanea / diaria / semanal), hora_local (time, nullable), dia_semana (0–6, nullable), email_baja_at (nullable, baja por link NE10), opciones (jsonb, por ejemplo el monto límite de las alertas de caja), updated_by, updated_at | UNIQUE (user_id, tipo). Sin campo de canal: el canal sale del catálogo. Los tipos obligatorios no se pueden desactivar (check). Cambios al audit_log.
notification_user_settings | user_id (PK), silencio_desde (time, por defecto 23:00), silencio_hasta (time, por defecto 07:30), pausado_hasta (timestamptz, nullable), email_alternativo (P1), email_alternativo_verificado_at (P1) | Una fila por destinatario.
notification_events (outbox) | id (bigint), tipo, version, ref_tipo, ref_id, payload (jsonb con datos mínimos o la referencia al snapshot), severidad, dedupe_key (UNIQUE), ocurrido_at (timestamptz DEFAULT now()), estado (pendiente / procesado / descartado / diferido), procesar_desde (timestamptz, para silencio y resúmenes), procesado_at, intentos | Se inserta en la misma transacción del hecho (ya definida por el PRD de caja, 6.4). Índice (estado, procesar_desde).
notification_deliveries | id, event_id (FK), user_id, canal (email / whatsapp), idempotency_key (UNIQUE), outbox_ref (id en email_outbox o wamid del bot), estado (pendiente / enviado / entregado / leído / fallido / suprimido / cancelado), actualizado_at | Alimenta el historial (NE14).

Entidad | Campos principales | Notas
--- | --- | ---
email_outbox | id, tenant_id, user_id, delivery_ref, categoria, plantilla, plantilla_version, to_email, from_email, from_name, reply_to, subject, html y text (cifrados en reposo, purgados a los 30 días), headers (jsonb: List-Unsubscribe, List-Unsubscribe-Post), idempotency_key (UNIQUE), prioridad (seguridad > instantánea > resumen), estado (pendiente / enviando / enviado / fallido / suprimido / cancelado / vencido), intentos, proximo_intento_at, vence_at, provider, provider_message_id, ultimo_error, created_at, sent_at | Índices (estado, proximo_intento_at, prioridad), (provider_message_id), (tenant_id, created_at). Toma de trabajo con SELECT ... FOR UPDATE SKIP LOCKED.
delivery_status | id, outbox_id, provider_message_id, provider_event_id (UNIQUE), evento (aceptado / entregado / demorado / rebote_duro / rebote_blando / queja), detalle (jsonb sin contenido del email), ocurrido_at, recibido_at | Append-only. Actualiza email_outbox.estado y, de forma asíncrona, notification_deliveries en la base del comercio.
email_suppressions | email_hash (SHA-256 del email normalizado, PK), email (cifrado), motivo (rebote_duro / queja / rebote_blando_temporal / manual), desde, hasta (nullable), tenant_id_origen | Compartida: una dirección que rebota no se reintenta desde ningún comercio.

Entidad | Campos principales | Notas
--- | --- | ---
notification_schedules | tenant_id, user_id, tipo, proximo_envio_at (timestamptz), zona_horaria ('America/Argentina/Buenos_Aires'), jitter_seg, actualizado_at | Copia derivada de las preferencias (se recalcula al cambiarlas) para que el scheduler no tenga que abrir todas las bases cada minuto.

Proveedor | Plan gratis | Primer plan pago | Escala | Notas | Fuente
--- | --- | --- | --- | --- | ---
Resend | 3.000 emails/mes, máx. 100 por día | Pro USD 20/mes por 50.000; USD 35 por 100.000; excedente USD 0,90 cada 1.000 | Scale USD 90 (100.000) a USD 160 (200.000); excedente USD 0,80 | Sin límite diario en planes pagos; 5 endpoints de webhooks en Pro; excedente con tope de 5× la cuota | Resend – Pricing, Resend – Quotas
Postmark | 100 emails/mes (desarrollo) | Basic USD 15/mes por 10.000; excedente USD 1,80 cada 1.000 | 50.000: USD 55; 125.000: USD 115; 300.000: USD 245 | Muy buena entregabilidad; Pro USD 16,50 y Platform USD 18 con más funciones | Postmark – Pricing
SendGrid (Twilio) | Prueba de 60 días con 100 por día (no permanente) | Essentials USD 19,95/mes por 50.000; USD 34,95 por 100.000 | Pro desde USD 89,95 (100.000), con IP dedicada | Ya no hay plan gratis permanente para cuentas nuevas | Twilio SendGrid – Pricing, SendGrid – Trial
Amazon SES | Sin cupo gratis propio para cuentas nuevas desde el 21/7/2026 (créditos generales de AWS de hasta USD 200 por 6 meses) | À la carte USD 0,10 cada 1.000; plan Essentials (por defecto en cuentas nuevas) USD 0,16 cada 1.000 | Pro USD 0,22 cada 1.000 + USD 105/mes | El más barato; más configuración propia (reputación, eventos vía SNS/EventBridge) | Amazon SES – Pricing

Escala | Emails/mes | Resend | Postmark | SendGrid | Amazon SES (à la carte / Essentials)
--- | --- | --- | --- | --- | ---
50 clientes | 4.000 | USD 20 (el plan gratis no alcanza: 100 por día) → USD 0,40/cliente | USD 15 → 0,30 | USD 19,95 → 0,40 | USD 0,40 / 0,64 → ~0,01
500 clientes | 40.000 | USD 20 → USD 0,04/cliente | USD 55 → 0,11 | USD 19,95 → 0,04 | USD 4,00 / 6,40 → ~0,01
2.000 clientes | 160.000 | USD 35 + 60.000 × USD 0,90/1.000 = USD 89 (o Scale 200.000 a USD 160) → USD 0,045/cliente | ~USD 178 (plan 125.000 + excedente) → 0,09 | ~USD 88 (plan 100.000 + excedente) → 0,04 | USD 16 / 25,60 → ~0,01

Notificación clave | Plantillas/mes por cliente (estimado) | USD/mes por cliente (a 0,026) | ARS (a 1.540)
--- | --- | --- | ---
Aviso matutino de stock bajo (solo con novedades; 70% con opt-in según el doc de costos, 7.3) | 21–30 | 0,55–0,78 | 840–1.200
Resumen semanal del viernes | 4,3 | 0,11 | 172
Resumen de cierre de caja (días con movimientos) | ~30 | 0,78 | 1.200
Total de las tres clave por WhatsApp | 55–64 | 1,44–1,67 | 2.220–2.570
Las mismas 55–64 notificaciones por email (Resend Pro, 500 clientes) | 55–64 emails | ~0,02–0,03 | ~35–40

Riesgo | Impacto | Mitigación
--- | --- | ---
Los emails caen en spam (dominio nuevo, contenido con montos) | El dueño no ve los avisos | Subdominio dedicado, SPF/DKIM/DMARC desde el día uno, calentamiento gradual (piloto de 20 a 50 comercios), sin tracking ni links reescritos, asuntos informativos, Postmaster Tools
Fatiga de notificaciones: aviso matutino + cierre, por los dos canales | Bajas por link, quejas por spam, pedidos de apagar todo | Solo con novedades, agrupación en un email (NE1.5), horario de silencio, pausa, defaults conservadores; medir bajas por categoría en el piloto
Costo de las plantillas clave por WhatsApp (sobre todo el cierre diario) | +USD 0,78 por cliente al mes y más presión sobre el límite de mensajería | Ver 7.3; revisar con datos del piloto (pregunta abierta 1)
La baja en un clic del email de un tipo clave deja al dueño solo con WhatsApp (o al revés, con "BAJA") | Contradice "siempre por los dos canales" | Es una obligación de cada canal; la app lo muestra y deja reactivar (NE10.4)
Diferencias entre el WhatsApp y el email del mismo evento | Pérdida de confianza en los números | Un solo evento y una sola función de dominio; test que compara los dos renders con el mismo payload
El email de Google del dueño es personal y lo mira poco | Los avisos importantes no se leen | Email alternativo (P1, NE15); seguridad siempre también al de Google
Caída o suba de precios del proveedor (según terceros, Resend duplicó precios del plan Scale en 2024) | Envíos demorados o más caros | Interfaz de proveedor (NE11.9), SES como plan B, outbox que retiene y reintenta 24 h
Envíos masivos a la misma hora (08:00, viernes 18:00) | Rate limit del proveedor, picos en la base | Jitter, prioridades y envío por lotes
Datos financieros en la bandeja de entrada | Exposición si la cuenta de email del dueño queda comprometida | Datos mínimos (NE12.9), sin datos de cobro, links que piden sesión
El PRD offline todavía está en redacción | Los eventos de sincronización pueden cambiar | Contrato de eventos versionado (tipo, version) y revisión conjunta
