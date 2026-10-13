> Origen: `PRD - Caja Digital (Parte 3_ Integraciones, Riesgos, Fases y Glosario).docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/cash`, `src/pages/api/cash/*`

---

# PRD - Caja Digital (Parte 3: Integraciones, Riesgos, Fases y Glosario)

Parte 3 · Ver también: Parte 1: Núcleo · Parte 2: Turnos, Retiros, Sueldos y Fiado

Este PRD está dividido en 3 partes. La numeración (C1 a C18, Flujos 1 a 20, secciones 1 a 8) es la misma en las tres, así que las referencias desde otros PRD (por ejemplo "C15" o "C17.13") siguen valiendo; cada sección está en la parte que indica el índice.

### Índice compartido

Parte 1: Núcleo (documento original, mismo id): 1. Resumen, 2. Objetivos, 3. Usuarios, 4.0 Priorización (tabla completa C1 a C18), C1 a C14 (caja, apertura, movimientos, medios, categorías, saldos, reversión y auditoría, inventario, vencimientos, notificaciones, reportes, cierre y resumen de cierre, comprobantes QR, devoluciones), Flujos 1 a 14, 6.1 Arquitectura, 6.2 Modelo de datos (tablas base).

Parte 2: Turnos, Retiros, Sueldos y Fiado: C15 Retiros de caja, C16 Pago de sueldos, C17 Entrega de turno (incluye el conteo sorpresa de efectivo, C17.21), C18 Fiado (lado caja), Flujos 15 a 20, adiciones al modelo de datos (shift_handovers, handover_counts, cash_drawer_drops) y reglas de integridad de C15 a C18 (adiciones a 6.3).

Parte 3: Integraciones, Riesgos, Fases y Glosario: 6.3 Reglas de integridad (base), 6.4 Integración con el bot de WhatsApp, 6.5 Seguridad, rendimiento y calidad, 6.6 Cierre automático, 7. Riesgos y preguntas abiertas, 8. Plan por fases, Anexo A: glosario.

Continúa la sección 6 (Notas técnicas) de la Parte 1 (6.1 y 6.2) y de la Parte 2 (adiciones a 6.2 y 6.3).

## 6. Notas técnicas (continuación)

### 6.3 Reglas de integridad

Dinero nunca en float. Los montos se guardan como enteros en centavos (bigint), decisión recomendada; alternativa aceptable numeric(14,2). En TypeScript se manejan como enteros (o bigint si hiciera falta) y se formatean solo al mostrar ($1.234,50). Prohibido real, double precision y number con decimales para montos; un lint/test lo verifica.

Movimientos inmutables. El rol de base de datos de la app solo tiene permiso de INSERT y SELECT sobre cash_movements; un trigger rechaza cualquier UPDATE o DELETE. Los errores se corrigen con un movimiento de reversión (revierte_a apunta al original, tipo opuesto, mismo monto, medio y categoría). Índice único en revierte_a para impedir doble reversión.

Saldos derivados de los movimientos. Saldo por medio = Σ ingresos − Σ egresos (las reversiones ya tienen el tipo opuesto, así que se suman naturalmente). Para rendimiento, una tabla o vista materializada de saldos diarios por medio puede actualizarse en la misma transacción que el insert; un job nocturno verifica que coincida con la suma de las líneas y alerta si no.

Transacciones con el inventario. "Marcar pedido como pagado" actualiza purchase_orders.estado_pago e inserta el egreso en la misma transacción de la base del comercio. Revertir el egreso vuelve el pedido a "pendiente" en la misma transacción.

Idempotencia. Cada alta lleva un idempotency_key generado en el cliente, para que la cola offline y los reintentos no dupliquen movimientos.

Jornada. fecha_jornada se calcula en el servidor con la zona horaria y la hora de corte del comercio; una apertura vigente por jornada (las correcciones reemplazan la anterior vía reemplaza_a, sin borrarla).

Timestamps de apertura y cierre. opened_at y closed_at son timestamptz con la hora del servidor (now() de la base), mostrados en America/Argentina/Buenos_Aires; nunca se toma la hora del cliente. Un trigger rechaza cualquier UPDATE de opened_at, opened_by y, una vez cerrada la jornada, de closed_at, closed_by y close_type. Un CHECK exige que close_type = 'manual' tenga closed_by y que close_type = 'automatico' no lo tenga.

Resúmenes de cierre inmutables. closing_summaries solo admite INSERT y SELECT (mismo trigger que cash_movements); índice único en fecha_jornada para que haya un solo resumen por jornada. No tiene campos de efectivo contado ni de diferencias.

Nota obligatoria en "Sin factura". Validación en el dominio (Zod) y en la base: un trigger (o CHECK sobre la categoría con requiere_nota) rechaza un INSERT en cash_movements de una categoría con requiere_nota = true con nota vacía o solo con espacios.

Devoluciones (C14). Un CHECK exige que origen = 'devolucion' tenga sale_id, tipo egreso y categoría "Devolución" (y que la categoría "Devolución" solo se use con ese origen). Al insertar, en una sola transacción, se bloquea la venta original (SELECT ... FOR UPDATE), se valida que no esté revertida, se copia el medio de la venta en medio_original_id (referencia; metodo_id puede ser cualquiera de los 5 medios activos, sin exigir que coincida con el de la venta) y que el monto más la suma de las devoluciones vigentes (no revertidas) de esa venta no supere el monto de la venta; si no, se rechaza. Las devoluciones son inmutables como cualquier movimiento (solo reversión); el insert registra en cash_audit_log quién, cuándo, el medio elegido y el medio original. Índice por sale_id.

Número de operación único. Índice único en cash_qr_receipts.numero_operacion (y en movimiento_id); la confirmación automática inserta el comprobante y lo asocia en una sola transacción, de modo que dos emails con la misma operación no generan dos asociaciones.

Auditoría. Toda acción sensible (apertura y su corrección, cierre manual o automático, reversión, entregas de turno con sus conteos, rechazos, disputas, resoluciones y decisiones sobre diferencias, conteos sorpresa, resguardos, retiros de caja, pagos de sueldos, cobros de fiado, cambios de categorías, medios, permisos, vencimientos y configuración de notificaciones) se registra en cash_audit_log. El soporte de la plataforma solo accede con consentimiento y queda registrado, como en el PRD de inventario.

### 6.4 Integración con el bot de WhatsApp

Patrón outbox: la caja inserta eventos en notification_events dentro de la misma transacción del hecho que los origina; un job (pg-boss / Inngest / cron) los toma y se los pasa al servicio del bot.

El resumen diario se calcula a la hora configurada a partir de los movimientos de la jornada; el mensaje usa los mismos cálculos que la pantalla (una sola función de dominio compartida) para que los números coincidan.

Eventos de turno y de fiado: diferencia_turno, entrega_en_disputa, entrega_sin_confirmar, turno_sin_conteo_final y cobro_fiado se insertan en el outbox en la misma transacción que el hecho; la app los muestra siempre y el bot de WhatsApp y el servicio de email los envían solo si el dueño los activó. Los eventos que se generan sin conexión se insertan al sincronizar, una sola vez.

Al cerrar la jornada (manual o automático) se inserta el evento resumen_cierre en la misma transacción que el cierre; el bot envía el snapshot de closing_summaries tal cual (con fecha y hora de apertura y cierre, y quién o "automático"), sin recalcular.

Formatos de mensaje, plantillas aprobadas por Meta, número emisor y opt-in del dueño los define el PRD del bot.

Resumen de cierre por email (C10.8): el evento resumen_cierre lo consumen el bot de WhatsApp y el servicio de email ("PRD - Notificaciones por Email para Sistema de Inventario"); los dos envían el mismo snapshot. La preferencia del dueño (activado sí/no y frecuencia) aplica a ambos canales. Cada envío por WhatsApp es una plantilla paga (aprox. USD 0,026 en Argentina [a verificar]).

Comprobantes de pago QR (C13): el bot recibe la foto o PDF por WhatsApp o lee el email de confirmación con la misma conexión de Gmail del PRD de consumos (un solo token cifrado por comercio, gmail.readonly, filtros por remitente); la clasificación, la extracción y la búsqueda de la venta (monto + ventana de tiempo) corren en el servidor, y la asociación se guarda en cash_qr_receipts después de la confirmación del comerciante o, en la coincidencia exacta por número de operación (C13.11), automáticamente. Para los emails de Mercado Pago la extracción de número de operación y monto es determinística (regex/plantillas versionadas, sin IA), con tests sobre emails de ejemplo. Hasta aprobar la verificación de Google y la evaluación CASA, la lectura de Gmail queda limitada a la beta cerrada (hasta 100 usuarios de prueba).

Fotos de comprobantes (P1) en Google Photos: el bot conecta el Google Photos del comercio (Google Photos Library API, OAuth con consentimiento del dueño), sube la foto recibida por WhatsApp y la caja guarda el mediaItemId y la URL en el movimiento. El refresh token de OAuth se guarda cifrado en la base del comercio. Las URLs de contenido de Google Photos son temporales: se guarda el mediaItemId como referencia y la URL se renueva al mostrarla.

Verificar antes de construir: los scopes y políticas de la Google Photos Library API cambiaron en 2025 (las apps solo pueden leer los medios que ellas mismas subieron). El equipo debe confirmar los límites vigentes (scopes disponibles, cuotas, verificación de la app OAuth) antes de implementar.

### 6.5 Seguridad, rendimiento y calidad

Permisos por rol aplicados en el backend (no solo ocultando botones).

Tests unitarios (Vitest) de cálculo de saldos, reversiones, jornada y pago de pedidos; tests end-to-end (Playwright) de los flujos 1 a 6, 9, 10 y 14 a 20; tests de fiado (venta a cuenta sin movimiento de caja, cobro por los 5 medios con baja de deuda en la misma transacción, reversión, cobro offline que supera la deuda); tests de entregas de turno (cálculo del esperado con resguardos y fondo de cambio, conteo a ciegas, tolerancia y movimiento de faltante/sobrante, disputa y resolución, auto-entrega, cierre sin receptor, conteo sorpresa de efectivo, bloqueo de venta sin recibir el turno, transiciones de estado e inmutabilidad, offline con esperado distinto en el servidor); tests de retiros de caja (tipos, motivo obligatorio, permiso de empleado apagado por defecto) y de pagos de sueldos (solo Dueño, empleado o nombre y período obligatorios); tests de devoluciones (medio de reintegro elegido distinto del de la venta y su auditoría, tope por venta con devoluciones parciales y concurrentes, venta revertida); test que verifica que UPDATE/DELETE sobre movimientos y resúmenes de cierre falla, y que no se pueden modificar opened_at, opened_by, closed_at, closed_by ni close_type; tests del job de cierre (idempotencia, cierre manual previo, cambio de hora de corte).

Rendimiento: alta de movimiento con respuesta menor a 300 ms; saldos menores a 500 ms con 50.000 movimientos (índices por fecha_jornada, metodo_id, categoria_id).

Backups por cliente, igual que el resto de la base del comercio (RPO 24 h / RTO menor a 4 h).

### 6.6 Cierre automático (job programado)

Un job programado por base de cliente (pg-boss / Inngest / cron, el mismo scheduler de 6.4): la base de control conoce la hora de corte de cada comercio; cada minuto el scheduler encola el cierre de las bases cuya hora de corte se cumplió en America/Argentina/Buenos_Aires, y el job corre contra la base de ese comercio.

Idempotente: el job hace, en una sola transacción, SELECT ... FOR UPDATE de la jornada en cash_days; si closed_at ya tiene valor, termina sin hacer nada. Si no, setea closed_at = now(), close_type = 'automatico', inserta el snapshot en closing_summaries y el evento resumen_cierre en el outbox. El índice único en closing_summaries.fecha_jornada garantiza que dos ejecuciones (reintentos, dos workers) no generen dos resúmenes.

Si ya hubo un cierre manual ese día: el cierre manual usa la misma transacción y el mismo bloqueo; el job automático encuentra la jornada cerrada y no hace nada (no crea otro resumen ni toca el manual). Un cierre manual que llega mientras corre el automático espera el bloqueo y responde "La caja ya fue cerrada automáticamente a las HH:MM".

Reintentos y atrasos: si el job falla o se ejecuta tarde (por ejemplo, caída del worker), se reintenta; closed_at es la hora real de ejecución y el resumen incluye los movimientos de la jornada hasta ese momento (ultimo_movimiento_id). Un job nocturno de control alerta si alguna jornada con movimientos quedó sin cerrar.

Movimientos posteriores al cierre: al insertar un movimiento, si la jornada calculada ya está cerrada se imputa a la jornada siguiente; si el dueño eligió a propósito una fecha de una jornada cerrada, el movimiento conserva esa fecha_jornada y se marca con ajuste_cierre_id, sin modificar el snapshot.

Cambiar la hora de corte aplica desde la jornada siguiente; nunca reabre ni recalcula cierres anteriores.

## 7. Riesgos y preguntas abiertas

### 7.1 Riesgos

### 7.2 Preguntas abiertas

Estado de pago en pedidos: el PRD de inventario hoy define los estados Borrador → Enviado → Recibido / Cancelado. ¿Se agrega "estado de pago" (Pendiente / Pagado) como campo separado, como propone este PRD? ¿Se puede pagar un pedido antes de recibirlo?

Monto del pago a proveedor: ¿se toma el total estimado del pedido, el total recibido (cuando exista la recepción P1) o siempre lo confirma el dueño?

Ventas: ¿el cobro desde el egreso por venta es suficiente para el MVP, o los comercios prefieren cargar las ventas como un solo ingreso por medio al final del turno?

Hora de corte de la jornada: ¿medianoche por defecto o configurable desde el MVP para kioscos 24 h?

Saldos acumulados: ¿pedimos saldos iniciales por medio en el onboarding (cuánto hay en el banco y en Mercado Pago) o empezamos todos en cero?

Movimientos entre medios (depositar efectivo en el banco, pasar plata de Mercado Pago al banco): ¿entran en el MVP como "transferencia interna" que no afecta el total, o en P1?

Comisiones de débito y Mercado Pago: ¿se registran automáticamente con un porcentaje configurable o manualmente?

Permisos por defecto de empleados: ¿pueden registrar egresos? ¿Hasta qué monto sin aviso?

Bot: ¿el resumen diario y los avisos salen desde un número de la plataforma o del comercio? ¿Entran en el MVP del bot?

Plan: ¿la caja está en todos los planes o es diferencial del plan Pro?

QR vs. Mercado Pago al conciliar: los cobros con QR de Mercado Pago se acreditan en la misma cuenta que el medio "Mercado Pago". ¿Unificamos QR y Mercado Pago en un solo saldo (o en un solo medio) al conciliar con la cuenta de Mercado Pago, manteniendo el desglose solo para reportes? ¿Y cómo tratamos el QR del posnet, que se acredita en otra cuenta?

¿Verificar pagos por Gmail evita que cada kiosco cargue un medio de pago en Meta? No: son cosas separadas. El medio de pago en Meta (Billing Hub de la cuenta de WhatsApp Business) paga los mensajes de WhatsApp (plantillas y, desde el 1/10/2026, las respuestas de servicio por encima de las 1.000 gratis por número por mes), no la verificación de pagos de clientes, que se hace por Gmail sin pasar por Meta. Un kiosco podría no cargar un medio de pago en Meta solo si se mantiene dentro del tramo gratis de mensajes de servicio y no envía plantillas pagas; sin medio de pago, Meta deja de entregar mensajes de servicio después de los 1.000. Si el bot sale desde un número de la plataforma (pregunta 9), el medio de pago lo carga la plataforma y no cada kiosco. ¿Qué modelo elegimos? [a verificar tarifas y condiciones vigentes de Meta]

Decisiones tomadas: una sola caja por comercio (con cortes de turno opcionales, C17); fiado en v1 (la venta a cuenta no entra a la caja, el cobro sí, C18); montos en centavos enteros; movimientos inmutables con reversión; una base de datos por cliente más base de control, como ModoOps; sin facturación electrónica AFIP/ARCA en el MVP.

## 8. Plan por fases

### Fase 0: diseño y validación (1 semana)

Entrevistas con 5 a 8 dueños de kiosco sobre cómo registran hoy la plata, qué medios usan y qué vencimientos pagan.

Prototipo clickeable de la pantalla de caja, alta de movimiento y pago de pedido, probado en celular.

Acordar con el PRD de inventario el campo de estado de pago de los pedidos y con el PRD del bot los eventos y plantillas.

### Fase 1: MVP de caja (3 a 4 semanas, integrado al MVP o inmediatamente después del lanzamiento del inventario)

C1 Caja única, C2 Apertura del día (con fecha y hora de apertura y usuario), C12 Cierre manual y automático con resumen de cierre (fecha y hora de cierre, usuario o "automático", job programado por base de cliente), C3 Movimientos, C4 Medios, C5 Categorías predefinidas (incluida Impuestos > ARCA), C6 Saldos por medio y total.

C7 Inmutabilidad, reversión y auditoría.

C8 Pago automático a proveedores desde pedidos de reposición y cobro desde el egreso por venta.

C9 Vencimientos simples con aviso en la app.

C11 Historial con filtros y exportación CSV/Excel.

Outbox de eventos listo para el bot (C10).

C13 Comprobantes de pago QR: carga manual de foto o PDF al bot (por defecto) y asociación con un toque; lectura de Gmail en beta cerrada (hasta 100 usuarios de prueba) mientras avanzan la verificación de Google y la evaluación CASA, con confirmación automática por número de operación en coincidencias exactas.

C5 incluye la categoría "Sin factura" con nota obligatoria (requerida por el PRD de órdenes de pago).

C14 Devoluciones de productos (lado caja): egreso "Devolución" por el medio de reintegro que elige el operador (cualquiera de los 5, con el medio original de la venta como referencia), vinculado a la venta, con devoluciones parciales y línea aparte en saldos y resumen de cierre (el stock, según el PRD de inventario).

C15 Retiros de caja (compra para el negocio, retiro del dueño, otro; motivo obligatorio; permiso de empleados apagado por defecto) y C16 Pago de sueldos (categoría Sueldos, solo Dueño), con líneas aparte en saldos y resumen de cierre, inmutables, auditados y offline.

C17 Entrega de turno entre empleados: conteo (a ciegas, opcional por denominación), tolerancia con diferencia menor o faltante/sobrante registrado, confirmación o disputa con resolución del dueño, auto-entrega, cierre sin receptor, resguardo, fondo de cambio, conteo sorpresa de efectivo opcional, historial en PDF y reporte por empleado, activable por el dueño y offline.

C18 Fiado, lado caja: opción "A cuenta (fiado)" sin ingreso y cobros de fiado como ingreso "Cobro de fiado" por los 5 medios, con línea aparte en el resumen de cierre (la cuenta corriente, según el PRD de fiado).

Hito: beta con 5 comercios del piloto del inventario.

### Fase 2: notificaciones y comodidad (meses 2 y 3 del módulo)

C10 entrega por WhatsApp: resumen diario (resumen de cierre, con fecha y hora de apertura y cierre), vencimientos, alertas de caja, pagos a proveedores (según el MVP del bot).

Vencimientos recurrentes y pago en un toque desde el aviso.

Categorías y medios personalizados, comisiones y retenciones, movimientos entre medios.

Foto del comprobante subida por el bot de WhatsApp al Google Photos del comercio y asociada al movimiento; solicitud de reversión por empleados con aprobación del dueño.

Pagos parciales de pedidos; reporte mensual en PDF.

C13 lectura de Gmail de comprobantes QR (y confirmación automática por número de operación) para todos los comercios, una vez aprobadas la verificación de Google y la evaluación CASA.

### Fase 3: integraciones (meses 4 a 12)

Consultas y carga de movimientos por WhatsApp (según el PRD del bot).

Caja rápida de venta con escaneo (descuenta stock y registra el cobro en un paso).

Conexión con Mercado Pago (movimientos de la cuenta) y evaluación de Mercado Pago Point.

Evaluación de facturación electrónica AFIP/ARCA vía partner.

Varias cajas o puntos de cobro para comercios con más de un mostrador.

## Anexo A: glosario

Riesgo | Impacto | Probabilidad | Mitigación
--- | --- | --- | ---
Disciplina de carga: si no se registran todos los cobros, los saldos no sirven | Alto | Alta | Alta en menos de 10 segundos, último medio recordado, cobro desde el egreso por venta, resumen diario que hace visible lo que falta
Confusión con un sistema de facturación (expectativa de facturas ARCA) | Medio | Alta | Comunicar claramente que la caja registra plata, no emite comprobantes; facturación vía partner en fases posteriores
Saldos de débito, Mercado Pago, QR y transferencia que no coinciden con el banco o la billetera (comisiones, retenciones, acreditaciones diferidas) | Medio | Alta | Categorías "Comisiones y retenciones" (P1), nota explicativa en la pantalla de saldos, conexión con Mercado Pago en el futuro
Cobros con QR cargados como "Mercado Pago" (o al revés), que mezclan los dos medios en los reportes | Bajo | Media | Botones con ícono y texto claros ("QR" vs. "Mercado Pago"), ayuda breve en el alta, revisión en el resumen de cierre
Verificación de Google para leer Gmail (C13): gmail.readonly es un scope restringido que requiere verificación de la app OAuth y evaluación de seguridad anual (CASA); sin aprobación, tope de 100 usuarios de prueba y pantalla de "app no verificada" | Alto | Alta | Gmail en beta cerrada en v1; carga manual de foto o PDF al bot como camino por defecto; verificación y CASA compartidas con el PRD de consumos, iniciadas en la Fase 0
Asociación incorrecta de un comprobante QR con otra venta del mismo monto | Medio | Media | Ventana de tiempo acotada, opciones con hora y usuario cuando hay varias coincidencias, confirmación obligatoria con un toque, desasociación auditada
Confirmación automática equivocada (cambio de formato del email de Mercado Pago, parsing que lee mal el monto o el número de operación) | Medio | Baja | Parsing determinístico versionado con tests; solo confirma con número nuevo + monto exacto + un único candidato en la ventana; si el formato no se reconoce, cae a un toque; aviso al comerciante con [Deshacer]; opción de desactivarla
Creer que verificar pagos por Gmail evita cargar un medio de pago en Meta | Medio | Media | Son cosas distintas: el medio de pago de Meta paga los mensajes de WhatsApp (plantillas, y respuestas de servicio por encima de las 1.000 gratis por número por mes desde el 1/10/2026), no la verificación de pagos de clientes. Sin medio de pago, Meta deja de entregar mensajes de servicio después de las 1.000 gratis y no se pueden enviar plantillas pagas (resumen diario, vencimientos fuera de la ventana de 24 h). Definir quién paga a Meta según quién es dueño del número del bot (pregunta 9) [a verificar tarifas vigentes]
Privacidad al leer el Gmail del comerciante | Alto | Baja | Solo lectura, filtros por remitente, sin guardar emails no relacionados, mismo consentimiento y revocación que el PRD de consumos
Devolución registrada en la caja pero no hecha en Mercado Pago o el banco (o al revés), que deja el saldo del medio distinto del real | Medio | Media | Aviso en la pantalla de devolución, nota con el número de operación de la devolución, línea aparte de devoluciones en el resumen de cierre; conciliación con Mercado Pago en el futuro
Retiros de caja sin control (un empleado se lleva plata como "compra para el negocio") | Medio | Media | Permiso de retiros apagado por defecto para empleados, motivo obligatorio, foto del comprobante, línea aparte en el resumen de cierre, auditoría; tope por empleado y aviso al dueño en P1
Entrega de turno percibida como la vuelta del arqueo diario o como una caja por turno | Medio | Media | Explicar en la app que es solo un conteo del efectivo al cambiar de persona, opcional si no hay cambio de turno; una sola caja y cierre sin conteo
Conflictos al confirmar la entrega (el que entra no acepta el conteo, o la entrega queda sin confirmar) | Medio | Media | Rechazo con conteo propio y estado "en disputa" sin bloquear la venta, resolución del dueño (aceptar un conteo o recuento), avisos de disputa y de entrega sin confirmar, historial auditado
Conflicto laboral por cobrarle diferencias al empleado | Medio | Media | El sistema nunca cobra ni descuenta automáticamente; la decisión ("a cargo de" o "absorbido") es del dueño, con nota y auditoría; tolerancia configurable para diferencias menores
Conteo "acomodado" al esperado | Medio | Media | Conteo a ciegas activado por defecto; recuentos guardados; conteo sorpresa de efectivo opcional del dueño
Ventas a cuenta (fiado) contadas como plata que entró, o cobros de fiado contados dos veces como venta | Medio | Media | La venta a cuenta no crea ingreso; el cobro entra como "Cobro de fiado" en línea aparte, fuera del total de ventas; tests
Errores de redondeo por usar float | Alto | Baja | Centavos enteros, lint y tests
Desconfianza del dueño en los registros de empleados | Medio | Media | Usuario en cada línea, auditoría, inmutabilidad, alertas de egresos grandes
Movimientos duplicados por la cola offline | Medio | Media | Claves de idempotencia
Dependencia del PRD de inventario (estado de pago del pedido) y del bot (entrega de notificaciones) | Medio | Media | Coordinar los tres PRD; la caja funciona sin el bot (avisos en la app)
Cambios en la Google Photos Library API (en 2025 se restringieron scopes y políticas: las apps solo leen lo que subieron) que limiten la subida o la lectura de comprobantes | Medio | Media | Verificar los límites vigentes antes de construir; guardar solo mediaItemId y URL de medios subidos por la app
El job de cierre automático no corre o corre dos veces | Medio | Baja | Job idempotente con bloqueo e índice único por jornada, reintentos y control nocturno de jornadas sin cerrar
Datos sensibles (ingresos del comercio) | Alto | Baja | Una base por cliente, permisos por rol, sin montos en logs, Ley 25.326

Término | Definición
--- | ---
Caja | Registro único de todos los movimientos de plata del comercio
Jornada | Día de trabajo del comercio, según su zona horaria y hora de corte
Apertura | Registro del monto inicial de efectivo al empezar la jornada, con fecha y hora de apertura (timestamp) y usuario
Cierre | Fin de la jornada, manual ("Cerrar caja", sin conteo) o automático a la hora de corte, con fecha y hora de cierre y usuario o "automático"
Resumen de cierre | Foto fija e inmutable de la jornada al cierre: ventas, ingresos por medio, egresos por categoría y saldo final por medio y total
Movimiento de caja | Una línea de ingreso o egreso con fecha, monto, medio, categoría, usuario y nota
Medio de pago | Efectivo, Débito, Mercado Pago, QR o Transferencia bancaria
QR | Medio de pago para cobros con código QR en el mostrador (QR de Mercado Pago o QR del posnet), separado de "Mercado Pago" (link de pago o transferencia a la cuenta) para los reportes
Comprobante de pago QR | Foto, PDF o email de confirmación de un cobro QR, asociado a la venta correspondiente (C13)
Número de operación | Identificador del pago que trae el comprobante o email de Mercado Pago (número de operación/comprobante); único por comercio, evita registrar dos veces el mismo pago y permite la confirmación automática (C13.11)
Sin factura | Categoría de egreso para gastos y pedidos pagados sin factura; exige una nota de texto libre que aclare qué fue el gasto
Devolución | Reintegro a un cliente por un producto devuelto: egreso de categoría "Devolución" (origen devolucion) vinculado a la venta original (sale_id), por el medio de reintegro que elige el operador (cualquiera de los 5; el medio original de la venta queda como referencia) y por un monto no mayor a lo cobrado (puede ser parcial). En medios electrónicos el reintegro real lo hace el comerciante en Mercado Pago o en el banco; la caja solo lo registra (C14). El stock se rige por el PRD de inventario
Retiro de caja | Plata que sale del cajón (u otro medio) con motivo obligatorio y un tipo: compra para el negocio (gasto con su categoría), retiro del dueño (no operativo, se muestra aparte) u otro (C15)
Pago de sueldo | Egreso de categoría "Sueldos" vinculado a un empleado (usuario o nombre libre) y a un período; solo lo registra el Dueño (C16)
Entrega de turno | Corte de turno dentro de la caja única: quien sale cuenta el efectivo del cajón, el sistema calcula el esperado y la diferencia, y quien entra lo confirma o lo rechaza (en disputa) con su usuario (C17). Solo efectivo; no es el arqueo diario eliminado
Tolerancia / diferencia menor | Margen de diferencia que fija el dueño (ej.: ±$500); dentro de él la diferencia se registra como menor, fuera de él exige motivo, avisa al dueño y genera un movimiento de faltante o sobrante
Retiro a resguardo | Efectivo que se saca del cajón a la caja fuerte; baja el esperado del cajón pero no el saldo de Efectivo del negocio
Fondo de cambio | Monto fijo de efectivo para dar vuelto que queda en el cajón y pasa de turno a turno y de un día al siguiente
Conteo sorpresa de efectivo | Conteo opcional y puntual (no diario) del efectivo del cajón que puede hacer el dueño, sin cortar el turno; no cuenta stock ni medios electrónicos y no es parte del cierre (C17.21)
A cuenta (fiado) | Opción de cobro de una venta que deja la deuda en la cuenta del cliente (PRD de fiado); no es un medio de caja y no entra como ingreso (C18)
Cobro de fiado | Ingreso de categoría "Cobro de fiado", por cualquiera de los 5 medios, cuando un cliente paga su fiado; baja su deuda y se muestra aparte de las ventas (C18)
Reversión | Movimiento del tipo opuesto que anula a otro sin borrarlo
Vencimiento | Pago con fecha límite (alquiler, servicios, impuestos) registrado en la agenda
Estado de pago | Pendiente o Pagado, en un pedido de reposición del inventario
