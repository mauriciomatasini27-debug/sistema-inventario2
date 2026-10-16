---
id: MOD-04-CAJA-DIGITAL-PARTE-1
tipo: spec
estado: propuesto
modulos: [caja, fiado, ventas]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: |
  En el kiosco o comercio chico, la plata entra y sale por muchos lados: efectivo en el cajón, débito con el
  posnet, cobros con QR (QR de Mercado Pago o QR del posnet), Mercado Pago (link de pago o transferencia a la
  cuenta) y transferencias al CBU/CVU del dueño.
---
> Origen: `PRD - Caja Digital para Sistema de Inventario.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/cash/caja.ts`, `src/pages/api/cash/*`, `src/db/schema-caja.ts`

---

# PRD - Caja Digital para Sistema de Inventario

Parte 1 · Ver también: Parte 2: Turnos, Retiros, Sueldos y Fiado · Parte 3: Integraciones, Riesgos, Fases y Glosario

Este PRD está dividido en 3 partes. La numeración (C1 a C18, Flujos 1 a 20, secciones 1 a 8) es la misma en las tres, así que las referencias desde otros PRD (por ejemplo "C15" o "C17.13") siguen valiendo; cada sección está en la parte que indica el índice.

### Índice compartido

Parte 1: Núcleo (documento original, mismo id): 1. Resumen, 2. Objetivos, 3. Usuarios, 4.0 Priorización (tabla completa C1 a C18), C1 a C14 (caja, apertura, movimientos, medios, categorías, saldos, reversión y auditoría, inventario, vencimientos, notificaciones, reportes, cierre y resumen de cierre, comprobantes QR, devoluciones), Flujos 1 a 14, 6.1 Arquitectura, 6.2 Modelo de datos (tablas base).

Parte 2: Turnos, Retiros, Sueldos y Fiado: C15 Retiros de caja, C16 Pago de sueldos, C17 Entrega de turno (incluye el conteo sorpresa de efectivo, C17.21), C18 Fiado (lado caja), Flujos 15 a 20, adiciones al modelo de datos (shift_handovers, handover_counts, cash_drawer_drops) y reglas de integridad de C15 a C18 (adiciones a 6.3).

Parte 3: Integraciones, Riesgos, Fases y Glosario: 6.3 Reglas de integridad (base), 6.4 Integración con el bot de WhatsApp, 6.5 Seguridad, rendimiento y calidad, 6.6 Cierre automático, 7. Riesgos y preguntas abiertas, 8. Plan por fases, Anexo A: glosario.

## 1. Resumen / visión general

### 1.1 Problema

En el kiosco o comercio chico, la plata entra y sale por muchos lados: efectivo en el cajón, débito con el posnet, cobros con QR (QR de Mercado Pago o QR del posnet), Mercado Pago (link de pago o transferencia a la cuenta) y transferencias al CBU/CVU del dueño. Los pagos también salen por todos esos canales: el preventista que cobra en efectivo, el alquiler por transferencia, la luz y el gas por Mercado Pago, el monotributo o los impuestos de ARCA desde el home banking. El resultado:

El dueño no sabe cuánta plata tiene en cada medio ni cuánta plata generó el negocio en el día o en el mes.

Los pagos a proveedores se anotan en un cuaderno (o no se anotan) y no quedan vinculados al pedido que se pagó.

Se olvidan vencimientos (alquiler, servicios, impuestos) y se pagan con recargo.

Cuando hay empleados, no queda claro quién registró qué movimiento de plata.

### 1.2 Visión

Una caja digital única dentro del Sistema de Inventario que registra toda la plata que entra y sale del comercio, línea por línea, con el medio de pago, la categoría y quién lo registró. El dueño abre el día cargando el efectivo inicial (queda registrada la fecha y hora exacta de apertura y quién la hizo), el equipo registra ingresos y egresos en segundos desde el celular, y el sistema muestra en todo momento el saldo por medio de pago y el total. Al cierre (manual con el botón "Cerrar caja" o automático a la hora de corte) el sistema genera solo un resumen de cierre con fecha y hora: el comerciante nunca hace cuentas, solo lo revisa cuando quiere. Los pagos a proveedores se descuentan solos cuando se marca como pagado un pedido de reposición, y el bot de WhatsApp le avisa al dueño el resumen del día y los vencimientos que se acercan.

### 1.3 Propuesta de valor

"Toda la plata del negocio en una sola caja: sabé cuánto tenés en efectivo, en el banco y en Mercado Pago, y en qué se te va."

### 1.4 Alcance del módulo

La caja es un módulo del mismo producto (misma app Astro, mismos usuarios y roles, misma base de datos por comercio). No es un producto aparte ni un sistema contable.

## 2. Objetivos y no-objetivos

### 2.1 Objetivos

### 2.2 No-objetivos (fuera de alcance, al menos en el MVP)

No emite facturas ni comprobantes fiscales: no hay facturación electrónica de AFIP/ARCA (CAE, puntos de venta, facturas A/B/C) en el MVP. La categoría "Impuestos / ARCA" solo registra el pago de impuestos como egreso.

No es un sistema contable: no lleva libro diario, libro IVA, plan de cuentas ni balances contables, ni liquida impuestos.

No es un POS completo: no imprime tickets ni maneja carrito de venta con descuentos y promociones (la "caja rápida" de venta sigue siendo una fase posterior del Sistema de Inventario).

No se conecta automáticamente con bancos, posnet ni con la cuenta de Mercado Pago en el MVP: los movimientos se registran en la app (manual o desde el inventario).

No gestiona sueldos: no liquida sueldos, cargas sociales ni recibos de sueldo; solo registra el pago como egreso de categoría "Sueldos" (C16).

Fiado: la cuenta corriente de clientes (saldo por cliente, tope, recordatorios) la define el "PRD - Fiado y Cuenta Corriente de Clientes" (en redacción); la caja solo trata la venta "A cuenta (fiado)", que no entra como ingreso, y los cobros de fiado, que sí entran (C18).

No maneja varias cajas ni varias monedas: una sola caja por comercio, en ARS.

No ejecuta pagos ni reintegros: las devoluciones a clientes por medios electrónicos (débito, Mercado Pago, QR, transferencia) las hace el comerciante en Mercado Pago o en el banco (o el posnet); la caja solo las registra (C14), en línea con el principio "el bot no ejecuta pagos".

## 3. Usuarios

Se usan los mismos roles del Sistema de Inventario.

### 3.1 Dueño/a (rol Dueño)

Perfil: el mismo del PRD de inventario: atiende el mostrador o tiene pocos empleados, vive en WhatsApp, usa Mercado Pago y home banking.

Necesidades: saber cuánta plata hay en cada medio, en qué se gasta, qué pagos vienen, y controlar lo que registran los empleados.

Permisos: total sobre la caja: abrir el día, registrar ingresos y egresos de cualquier categoría, ver saldos e historial completo, revertir movimientos, ver y recibir las entregas de turno con sus diferencias, resolver las disputas y decidir sobre las diferencias ("a cargo de" / "absorbido"), activar o desactivar las entregas y hacer conteos sorpresa de efectivo opcionales (C17), registrar ventas a cuenta y cobros de fiado (C18), registrar retiros de caja (C15) y pagos de sueldos (C16, solo el Dueño), habilitarle a un empleado los retiros de caja (permiso apagado por defecto), registrar devoluciones a clientes (C14) y, si quiere, restringirle ese permiso a un empleado puntual (permiso definido en la matriz de AU4 del "PRD - Autenticación y Gestión de Usuarios para Sistema de Inventario"), marcar pedidos como pagados, gestionar categorías, vencimientos y notificaciones, exportar.

### 3.2 Empleado/a (rol Empleado)

Perfil: atiende el mostrador por turnos.

Necesidades: registrar rápido los cobros (efectivo, débito, Mercado Pago, QR, transferencia) y algún pago chico (por ejemplo, al preventista en efectivo, si el dueño lo permite).

Permisos por defecto (configurables por el dueño): abrir el día si el dueño no lo hizo, registrar ingresos, registrar egresos solo en categorías habilitadas (por defecto: "Pago a proveedores" y "Otros egresos"), ver los movimientos que registró en el día. Registrar devoluciones a clientes (C14): sí, por defecto; el dueño puede restringirlo para un empleado puntual (el permiso se define en la matriz de permisos AU4 del "PRD - Autenticación y Gestión de Usuarios para Sistema de Inventario"). Registrar retiros de caja (C15): no, por defecto; solo si el dueño le habilita el permiso (definido en la matriz AU4 del PRD de autenticación). Entrega y recibe turnos (C17): sí, por defecto (con su propio usuario). Ventas a cuenta y cobros de fiado (C18): según los permisos de fiado de la matriz AU4 (definidos en el "PRD - Fiado y Cuenta Corriente de Clientes"). No registra pagos de sueldos (C16, solo Dueño). No ve saldos totales ni el historial completo (configurable), no revierte movimientos, no gestiona categorías ni vencimientos.

### 3.3 Administrador de la plataforma

Igual que en el PRD de inventario: opera desde el Control Plane, nunca ve ni toca la caja de un comercio sin consentimiento explícito y registro.

## 4. Funcionalidades

### 4.0 Priorización

### C1. Caja única (P0)

Descripción: cada comercio tiene una sola caja que concentra todos los movimientos de plata, cualquiera sea el medio de pago. No hay "cajas" separadas por empleado ni por turno: sigue siendo una sola caja, ahora con cortes de turno (entrega de turno, C17) dentro de esa misma caja, que solo marcan quién entrega y quién recibe el efectivo del cajón.

### Requerimientos:

C1.1 La caja se crea automáticamente al dar de alta el comercio (junto con el aprovisionamiento de su base de datos).

C1.2 Todos los ingresos y egresos, manuales o automáticos (desde el inventario), se registran en esa caja.

C1.3 La pantalla principal de la caja muestra: estado del día (sin abrir / abierto / cerrado, con la fecha y hora de apertura y de cierre), saldo total, saldo por medio de pago, últimos movimientos y botones grandes "+ Ingreso" y "− Egreso".

C1.4 La caja trabaja en ARS y en la zona horaria del comercio (por defecto America/Buenos_Aires).

C1.5 Operable 100% desde el celular, sin computadora: toda la caja se usa solo con el teléfono: abrir el día, registrar ingresos y egresos con los 5 medios de pago, devoluciones (C14), retiros de caja (C15), pagos de sueldos (C16), entregas de turno (C17), ventas a cuenta y cobros de fiado (C18), cerrar la caja y ver los resúmenes de cierre, y consultar el historial. Funciona también sin conexión, con una base SQLite local en el celular, y se sincroniza después con el servidor al volver la conexión, sin duplicar movimientos (ver el PRD offline, en redacción).

### Criterios de aceptación:

☐ Al registrar un comercio nuevo, la caja existe y está lista para usar sin configuración adicional.

☐ Un ingreso por Mercado Pago y un egreso en efectivo aparecen en la misma lista de movimientos, cada uno con su medio.

☐ Desde el celular, la pantalla principal de la caja carga en menos de 2 segundos con 4G.

☐ Con solo un celular (sin computadora) y en modo avión, abro el día, registro un ingreso por cada uno de los 5 medios, una devolución, cierro la caja y veo el resumen de cierre y el historial; al volver la conexión todo se sincroniza una sola vez y los números coinciden con los del servidor.

### C2. Apertura del día (P0)

Descripción: al empezar la jornada se registra el monto inicial de efectivo con el que arranca el cajón (el "cambio" o fondo).

### Requerimientos:

C2.1 Botón "Abrir el día" en la pantalla de la caja. Pide el monto inicial en efectivo con un teclado numérico grande.

C2.2 La apertura queda registrada con fecha, hora, usuario y monto inicial, y una nota opcional.

C2.3 Solo puede haber una apertura por jornada (día calendario en la zona horaria del comercio). La jornada termina sola a la medianoche (o a una hora de corte configurable, por ejemplo 03:00 para comercios que cierran tarde), con cierre automático y resumen de cierre (ver C12).

C2.4 El monto inicial es la base del saldo de efectivo del día: saldo de efectivo del día = monto inicial + ingresos en efectivo − egresos en efectivo.

C2.5 Si se intenta registrar un movimiento sin haber abierto el día, el sistema ofrece abrirlo en ese momento (con monto inicial 0 editable) para no frenar la venta.

C2.6 El monto inicial de una apertura no se edita: si se cargó mal, el dueño registra una corrección de la apertura (nuevo registro que reemplaza al anterior, con el original visible en la auditoría).

C2.7 Fecha y hora de apertura (timestamp): cada apertura registra la fecha y hora exacta en que ocurrió (opened_at) y quién la hizo (opened_by). La hora la pone el servidor (no el reloj del celular), en la zona horaria America/Argentina/Buenos_Aires, y se guarda como timestamptz. Si la apertura se hizo sin conexión, opened_at es la hora del servidor al sincronizar y la hora del dispositivo queda solo como referencia en la auditoría.

C2.8 La fecha y hora de apertura y el usuario son inmutables: no se editan desde la app ni desde la API. Una corrección de la apertura (C2.6) conserva el opened_at y opened_by originales; quién corrigió y cuándo queda en la auditoría.

C2.9 La fecha y hora de apertura y quién abrió se muestran en la pantalla de la caja, en el historial (C11), en el resumen de cierre (C12) y en las notificaciones del bot (C10).

### Criterios de aceptación:

☐ Abro el día con $20.000 y la caja muestra "Efectivo: $20.000" antes de cualquier movimiento.

☐ Registro un ingreso de $5.000 en efectivo y un egreso de $3.000 en efectivo, y el efectivo del día queda en $22.000.

☐ No puedo abrir el mismo día dos veces; el sistema me muestra la apertura existente con quién la hizo y a qué hora.

☐ Si un empleado intenta cobrar sin que el día esté abierto, puede abrirlo en un paso y seguir.

☐ Corrijo una apertura de $2.000 a $20.000 y el saldo se recalcula; en la auditoría se ven ambos valores, el usuario y la hora.

☐ Abro el día a las 08:05 y la caja muestra "Abierta el 09/10/2026 a las 08:05 por Mauricio"; el valor guardado es un timestamptz con la hora del servidor (aunque el reloj del celular esté mal).

☐ Ni desde la app ni desde la API puedo modificar la fecha y hora de apertura ni quién abrió; después de corregir el monto, la apertura sigue mostrando la hora y el usuario originales.

☐ La fecha y hora de apertura y el usuario aparecen en el historial, en el resumen de cierre y en el resumen diario del bot.

### C3. Movimientos: ingresos y egresos (P0)

Descripción: cada movimiento de plata es una línea con todos sus datos.

### Requerimientos:

C3.1 Cada movimiento tiene:

Fecha y hora (por defecto ahora; el dueño puede cargar una fecha anterior, por ejemplo un pago de ayer que se olvidó).

Monto (siempre positivo; el signo lo da el tipo).

Medio de pago (ver C4).

Categoría (ver C5).

Tipo: ingreso o egreso.

Registrado por (usuario, automático) y origen (manual, pedido de reposición, egreso por venta, comprobante QR, devolución, retiro de caja, sueldo, diferencia de turno, cobro de fiado, sistema) y turno en curso (C17).

Nota opcional (texto libre corto).

Referencia opcional a un documento del inventario (pedido de reposición, movimiento de stock).

Venta original (solo en las devoluciones, C14): referencia obligatoria al ingreso de la venta/ticket que se devuelve (sale_id).

C3.2 Alta rápida: tipo → monto → medio → categoría → guardar, en una sola pantalla. Se recuerdan el último medio y categoría usados por ese usuario.

C3.3 El monto se ingresa en pesos con hasta 2 decimales y se guarda como entero en centavos (ver 6.3). Formato argentino en pantalla: $1.234,50.

C3.4 Validaciones: monto mayor a 0, medio y categoría obligatorios, categoría compatible con el tipo (no se puede cargar "Alquiler" como ingreso), y nota obligatoria en las categorías que la exigen ("Sin factura", ver C5.5).

C3.5 Un movimiento guardado no se edita ni se borra; los errores se corrigen con una reversión (ver C7).

C3.6 Funciona con mala conexión: los movimientos se guardan en la cola offline de la PWA y se sincronizan al volver la conexión, sin duplicarse.

C3.7 (P1) Foto del comprobante en Google Photos: el dueño manda la foto del ticket o comprobante al bot de WhatsApp; el bot la sube al Google Photos del comercio (Google Photos Library API, cuenta conectada por OAuth) y asocia el identificador del media item (y su URL) al movimiento de caja. Desde el movimiento, en la web Astro, se ve el enlace al comprobante.

### Criterios de aceptación:

☐ Registro "Ingreso $3.500, Mercado Pago, Ventas" en menos de 10 segundos y aparece arriba de todo en la lista con mi nombre y la hora.

☐ Registro "Egreso $45.000, Transferencia bancaria, Alquiler, nota: octubre" y el saldo de Transferencia baja $45.000.

☐ No puedo guardar un movimiento con monto 0, negativo o sin medio de pago.

☐ Cargo $1.234,56 y el sistema muestra exactamente $1.234,56, sin errores de redondeo, en la lista, los saldos y la exportación.

☐ Sin conexión, registro 3 movimientos; al volver la conexión se sincronizan los 3 una sola vez.

☐ No existe ningún botón de editar o borrar en un movimiento guardado.

☐ (P1) Mando por WhatsApp la foto del ticket de la luz; la foto queda subida al Google Photos del comercio y el movimiento muestra el enlace al comprobante.

### C4. Medios de pago (P0)

Descripción: medios con los que entra o sale la plata.

### Requerimientos:

C4.1 Medios predefinidos en el MVP (cinco): Efectivo, Débito, Mercado Pago, QR, Transferencia bancaria.

C4.2 Los cinco medios sirven para ingresos y egresos (por ejemplo, pagar la luz con Mercado Pago o un insumo con tarjeta de débito).

C4.3 El dueño puede desactivar un medio que no usa (no aparece en el alta), sin perder el historial.

C4.4 (P1) Medios adicionales: tarjeta de crédito, Cuenta DNI, MODO, otras billeteras, y medios personalizados (por ejemplo, dos bancos distintos).

C4.5 QR vs. Mercado Pago: "QR" agrupa los cobros con código QR en el mostrador (QR de Mercado Pago o QR del posnet). "Mercado Pago" queda para los movimientos de la cuenta de Mercado Pago que no son QR (link de pago, transferencia a la cuenta/CVU de Mercado Pago, pagos de servicios desde la app). Son medios separados para que los reportes y saldos muestren cuánto se cobra con QR; si conviene unificarlos al conciliar con Mercado Pago queda como pregunta abierta (7.2). Los comprobantes de los cobros QR se pueden asociar a la venta (C13).

C4.6 Medio de la devolución elegido por el operador: en una devolución a un cliente (C14), quien la registra elige el medio de reintegro en ese momento, entre cualquiera de los 5 medios (Efectivo, Débito, Mercado Pago, QR, Transferencia bancaria), aunque sea distinto del medio con que se cobró la venta (por ejemplo, una venta por QR devuelta en efectivo). El movimiento guarda el medio elegido y, como referencia, el medio original de la venta; la elección queda auditada (quién y cuándo).

C4.7 "A cuenta (fiado)" no es un medio de caja: en la venta aparece como opción de cobro junto a los 5 medios, pero no es un medio de pago de la caja: la venta a cuenta no entra como ingreso ni suma a ningún saldo; la plata entra recién cuando el cliente paga, como "Cobro de fiado" por uno de los 5 medios (C18).

### Criterios de aceptación:

☐ Al registrar un movimiento veo los 5 medios (Efectivo, Débito, Mercado Pago, QR, Transferencia bancaria) como botones grandes con ícono.

☐ Registro un ingreso de $4.000 por QR y otro de $6.000 por Mercado Pago (link de pago): en los saldos y en el resumen aparecen por separado, QR $4.000 y Mercado Pago $6.000.

☐ Desactivo "Débito" y deja de aparecer en el alta, pero los movimientos anteriores en débito siguen en el historial y en los saldos.

### C5. Categorías (P0)

Descripción: cada movimiento pertenece a una categoría que explica de dónde viene o en qué se fue la plata.

### Requerimientos:

C5.1 Categorías predefinidas de ingreso: Ventas, Cobro de fiado (del sistema, solo desde el cobro de una cuenta de fiado, C18), Aporte del dueño, Otros ingresos, Sobrante de caja (del sistema, solo desde la entrega de turno, C17.13).

C5.2 Categorías predefinidas de egreso:

Pago a proveedores (manual o automático desde un pedido de reposición, ver C8).

Servicios (internet, teléfono, alarma, limpieza, etc.).

Alquiler.

Luz.

Gas.

Impuestos, con subcategorías predefinidas: ARCA (monotributo, IVA, ganancias, autónomos), Ingresos brutos (ARBA, AGIP u organismo provincial), Tasas municipales.

Insumos (bolsas, rollos de ticket, artículos para el local).

Limpieza (artículos de limpieza; el servicio de limpieza contratado va en Servicios).

Sueldos (sueldos y adelantos a empleados; categoría del sistema, se usa desde el pago de sueldos, ver C16).

Retiro del dueño (retiro personal del dueño; no es un gasto operativo, se muestra aparte, ver C15).

Sin factura (gastos y pedidos pagados sin factura; exige nota, ver C5.5).

Faltante de caja (categoría del sistema: diferencia fuera de tolerancia en una entrega de turno, C17.13; su ingreso par es Sobrante de caja).

Devolución (reintegro a un cliente por un producto devuelto; categoría del sistema, solo se usa desde el flujo de devolución vinculado a una venta, ver C14).

Otros egresos.

C5.3 Las categorías predefinidas no se pueden borrar (sí desactivar). La categoría "Pago a proveedores" es la que usan los egresos automáticos. La categoría "Devolución" es del sistema y no se puede usar en un egreso manual suelto: solo se carga desde el flujo de devolución, vinculada a una venta (C14).

C5.4 (P1) El dueño puede crear categorías y subcategorías propias.

C5.5 Categoría "Sin factura" con nota obligatoria: es una categoría de egreso del sistema (no se borra) para los gastos y pedidos pagados sin factura (la usa el PRD de órdenes de pago). En esta categoría la nota (texto libre) es obligatoria: la web, la API y el bot no dejan guardar el egreso con la nota vacía (o solo con espacios) y piden que se aclare qué fue el gasto (ej.: "Pedido #63 Bebidas del Sur, pagado al preventista, sin factura"). La categoría tiene la marca requiere_nota y la validación se aplica en el dominio y en la base (ver 6.3).

C5.6 Categorías no operativas: "Retiro del dueño" se marca como no operativa (es_operativa = false): sus egresos bajan el saldo pero no suman a los egresos del negocio ni al resultado operativo del período; se muestran en una línea aparte (C6, C12.5).

### Criterios de aceptación:

☐ Al elegir "Egreso", solo veo categorías de egreso; al elegir "Ingreso", solo de ingreso.

☐ Registro el pago del monotributo como "Impuestos > ARCA" y en el reporte del mes aparece dentro de Impuestos y también desglosado como ARCA.

☐ No puedo borrar la categoría "Pago a proveedores".

☐ Registro "Egreso $15.000, Efectivo, Sin factura, nota: flete del pedido #63" y queda guardado con la nota en la lista y en la exportación.

☐ Si intento guardar un egreso "Sin factura" con la nota vacía (en la web, en la API o en el bot), no se registra y se me pide la nota.

☐ No puedo borrar la categoría "Sin factura".

### C6. Saldos por medio de pago y total (P0)

Descripción: el sistema muestra cuánta plata hay en cada medio y en total.

### Requerimientos:

C6.1 Saldo del día por medio: para efectivo, monto inicial de la apertura + ingresos − egresos en efectivo de la jornada; para los demás medios, ingresos − egresos de la jornada.

C6.2 Saldo acumulado por medio desde una fecha de inicio que configura el dueño (por ejemplo, el día que empezó a usar la caja, con saldos iniciales por medio cargados en el onboarding).

C6.3 Total = suma de los saldos de todos los medios, destacado en la pantalla principal.

C6.4 Selector de período: hoy, ayer, esta semana, este mes, rango personalizado. Para cada período: total de ingresos, total de egresos, resultado (ingresos − egresos) y desglose por medio y por categoría.

C6.5 Los saldos se calculan siempre a partir de los movimientos (la suma de las líneas es la fuente de verdad; ver 6.3).

C6.6 Los saldos totales y acumulados solo los ve el Dueño (configurable para empleados).

C6.7 Devoluciones en los saldos: las devoluciones (C14) son egresos y bajan el saldo del medio de reintegro elegido al registrar la devolución (que puede no ser el de la venta original). En el desglose del período se muestran en una línea aparte "Devoluciones" (total y por medio), separada de los egresos por categoría del negocio, para que se vea cuánto se reintegró a clientes por cada medio.

C6.8 Retiros de caja y sueldos en los saldos: los retiros de caja (C15) y los pagos de sueldos (C16) bajan el saldo del medio con el que se hicieron. En el desglose del período se muestran en líneas aparte: "Retiros de caja" (por tipo: compra para el negocio, retiro del dueño, otro; y por medio) y "Sueldos". Los retiros del dueño no cuentan como gasto operativo: el período muestra resultado operativo (ingresos − egresos operativos) y, aparte, los retiros del dueño.

C6.9 Efectivo en cajón y en resguardo: si hay retiros a resguardo (C17.20), el saldo de Efectivo se muestra como cajón + resguardo; los faltantes y sobrantes de turno (C17.13) son movimientos y ajustan el saldo de Efectivo.

### Criterios de aceptación:

☐ Con apertura de $10.000 y estos movimientos del día: +$8.000 efectivo, +$12.000 Mercado Pago, +$5.000 débito, +$6.000 QR, −$3.000 efectivo, −$7.000 transferencia, la caja muestra Efectivo $15.000, Mercado Pago $12.000, Débito $5.000, QR $6.000, Transferencia −$7.000 y Total $31.000.

☐ Un saldo negativo en un medio se muestra en rojo.

☐ Al elegir "Este mes", veo ingresos, egresos y resultado del mes, y el desglose por categoría suma exactamente el total.

☐ Un empleado sin permiso no ve el total ni los saldos acumulados.

☐ Los saldos se actualizan en menos de 1 segundo después de registrar un movimiento.

☐ Con una venta de $6.000 por QR y una devolución parcial de $2.000 de esa venta, el saldo de QR queda en $4.000 y el desglose muestra "Devoluciones: QR $2.000" en una línea aparte.

### C7. Reversión de movimientos y auditoría (P0)

Descripción: los movimientos son inmutables; un error se corrige con un movimiento de reversión (contra-asiento) y todo queda auditado.

### Requerimientos:

C7.1 Desde el detalle de un movimiento, el Dueño puede "Revertir". El sistema crea un movimiento nuevo, del tipo opuesto, por el mismo monto, medio y categoría, con referencia al original y motivo obligatorio.

C7.2 El movimiento original queda marcado como "revertido" (dato derivado de la existencia de la reversión) y se muestra tachado en la lista, con enlace a su reversión.

C7.3 Un movimiento no se puede revertir dos veces, y una reversión no se puede revertir (si hace falta, se carga un movimiento nuevo correcto).

C7.4 "Revertir y corregir": atajo que revierte y abre el alta precargada con los datos originales para cargar la versión correcta.

C7.5 Los empleados no revierten movimientos (P1: pueden solicitar la reversión y el dueño la aprueba).

C7.6 Log de auditoría de la caja: aperturas y sus correcciones, entregas de turno con sus conteos, rechazos, disputas, resoluciones y conteos sorpresa (C17), retiros de caja (C15), pagos de sueldos (C16), cobros de fiado y sus reversiones (C18), cierres (manuales y automáticos), reversiones, cambios de categorías, medios, permisos y vencimientos, con usuario, fecha, hora, valor anterior y nuevo.

C7.7 Los movimientos automáticos (desde el inventario) se revierten igual; al revertir un pago a proveedor, el pedido vuelve a "Pendiente de pago".

C7.8 Las devoluciones (C14) son movimientos como cualquier otro: inmutables y corregibles solo por reversión; al revertir una devolución, el monto vuelve a estar disponible para devolver en la venta original.

### Criterios de aceptación:

☐ Cargué por error un ingreso de $50.000 en lugar de $5.000; lo revierto con motivo "monto mal cargado" y el saldo vuelve a ser el de antes; ambos movimientos siguen visibles.

☐ Con "Revertir y corregir" queda el original, su reversión y el movimiento correcto de $5.000, en menos de 20 segundos.

☐ No puedo revertir dos veces el mismo movimiento.

☐ Un empleado no ve la opción "Revertir".

☐ En la auditoría veo quién revirtió, cuándo y por qué.

☐ Ni desde la app ni desde la API existe forma de editar o borrar un movimiento (verificado con tests automáticos).

### C8. Integración con el inventario: pedidos de reposición y ventas (P0)

Descripción: la caja se conecta con los pedidos de reposición (F5) y con los egresos por venta (F1.7 / F3) del Sistema de Inventario.

### Requerimientos:

C8.1 Estado de pago del pedido de reposición: cada pedido confirmado tiene un estado de pago: Pendiente de pago → Pagado. (Requiere agregar este campo a los pedidos del PRD de inventario; ver 7.2.)

C8.2 Al marcar un pedido como pagado, el sistema pide: monto pagado (precargado con el total del pedido, editable porque el total real puede diferir del estimado), medio de pago (precargado según las condiciones de pago del proveedor), fecha y nota opcional.

C8.3 Al confirmar, se genera automáticamente un egreso en la caja: categoría "Pago a proveedores", origen "pedido de reposición", referencia al pedido y al proveedor, usuario que lo marcó.

C8.4 El marcado como pagado y la creación del egreso ocurren en una misma transacción: no puede quedar un pedido pagado sin egreso ni un egreso sin pedido.

C8.5 Un pedido no puede marcarse como pagado dos veces. Si el egreso se revierte (C7), el pedido vuelve a "Pendiente de pago".

C8.6 Desde el movimiento de caja se abre el pedido, y desde el pedido se ve su pago.

C8.7 Pagos manuales a proveedores sin pedido (por ejemplo, una compra al paso) se pueden cargar igual, con proveedor opcional.

C8.8 Cobro desde el egreso por venta: al registrar un egreso de stock con motivo "venta" en el inventario, opción "Registrar cobro" que crea el ingreso en la caja (categoría Ventas) con el monto sugerido = precio de venta × cantidad y el medio elegido, vinculado al movimiento de stock. Activable por comercio.

C8.9 (P1) Pagos parciales de un pedido (seña y saldo). (P2) Caja rápida de venta con escaneo que descuenta stock y registra el cobro en un solo paso.

### Criterios de aceptación:

☐ Marco como pagado el pedido a "Distribuidora X" de $185.000 por transferencia y aparece en la caja un egreso "Pago a proveedores — Distribuidora X — Pedido #42, $185.000, Transferencia bancaria", con mi usuario.

☐ El saldo de Transferencia baja $185.000 en el mismo momento.

☐ Si el preventista me cobró $182.500, edito el monto antes de confirmar y el egreso queda por $182.500.

☐ No puedo marcar dos veces el mismo pedido como pagado.

☐ Revierto el egreso del pedido #42 y el pedido vuelve a "Pendiente de pago".

☐ Registro en el inventario un egreso por venta de 2 alfajores a $1.400 con "Registrar cobro" en efectivo, y la caja muestra un ingreso de $2.800 en Ventas vinculado a ese movimiento de stock.

☐ Si falla la creación del egreso, el pedido no queda marcado como pagado.

### C9. Vencimientos de pagos (P0 simple)

Descripción: agenda de pagos que vencen (alquiler, servicios, luz, gas, impuestos, ARCA) para que no se pasen.

### Requerimientos:

C9.1 Alta de vencimiento: concepto, categoría de egreso, monto estimado (opcional), fecha de vencimiento, medio habitual (opcional) y nota.

C9.2 Panel "Próximos vencimientos" en la pantalla de la caja (próximos 7 días, vencidos en rojo).

C9.3 Desde un vencimiento, botón "Registrar pago" que abre el alta de egreso precargada; al guardar, el vencimiento queda como pagado y vinculado al egreso.

C9.4 Aviso en la app N días antes (por defecto 3, configurable) y el día del vencimiento.

C9.5 (P1) Vencimientos recurrentes (mensual: alquiler del día 10; monotributo del día 20, ajustable según el calendario de ARCA).

### Criterios de aceptación:

☐ Cargo "Alquiler octubre, $450.000, vence el 10/10" y aparece en próximos vencimientos.

☐ Toco "Registrar pago", confirmo por transferencia y el vencimiento pasa a "Pagado" con el egreso vinculado.

☐ Un vencimiento no pagado con fecha pasada se muestra como "Vencido" en rojo.

### C10. Notificaciones por WhatsApp (P0 eventos / entrega según el PRD del bot)

Descripción: la caja genera eventos que el bot de WhatsApp envía al dueño. El canal, las plantillas y el número los define el PRD del bot; este PRD define qué eventos emite la caja y qué contienen.

### Requerimientos:

C10.1 Resumen diario (al terminar la jornada, a una hora configurable): ingresos y egresos del día por medio, resultado del día, saldo total y cantidad de movimientos revertidos. Es el resumen de cierre de la jornada (C12): sale con los mismos números del snapshot, e incluye la fecha y hora de apertura y quién abrió, y la fecha y hora de cierre con quién cerró o "automático".

C10.2 Vencimiento próximo: N días antes y el día del vencimiento (alquiler, servicios, impuestos/ARCA), con monto estimado.

C10.3 Alertas de caja: saldo de efectivo negativo en el día, diferencia fuera de tolerancia en una entrega de turno o conteo sorpresa de efectivo (C17.13; faltante o sobrante, con quién entregó y quién recibió: aviso inmediato en la app y en el resumen de cierre, por WhatsApp solo si el dueño lo activa), entrega en disputa (y su resolución), entrega sin confirmar y último turno sin conteo final (C17.27), cobro de fiado (C18.9, opcional), egreso mayor a un monto configurable registrado por un empleado, reversiones del día.

C10.4 Pago a proveedor registrado (opcional): "Se pagó el pedido #42 a Distribuidora X: $182.500 por transferencia".

C10.5 Cada notificación se puede activar o desactivar y tiene horario de silencio.

C10.6 Las notificaciones solo van al Dueño (y a quien él autorice); nunca a empleados por defecto.

C10.7 (P1/P2, según el PRD del bot) Consultas por WhatsApp ("saldo", "gastos del mes") y registro de movimientos por mensaje.

C10.8 Resumen de cierre por WhatsApp y por email: el resumen de cierre (C12) se le envía al dueño por los dos canales: WhatsApp (bot) y email (ver el "PRD - Notificaciones por Email para Sistema de Inventario", mismo folder). El dueño configura si lo recibe y con qué frecuencia (por ejemplo, en cada cierre o un resumen semanal); cuando está activado, se usan siempre ambos canales, con los mismos números del snapshot. Costo: el mensaje de WhatsApp es una plantilla paga de Meta (aprox. USD 0,026 por mensaje en Argentina [a verificar tarifa vigente]), por lo que cada resumen enviado por WhatsApp tiene costo; el email no tiene ese costo por mensaje.

### Ejemplo de resumen diario:

Kiosco La Esquina — Resumen del jueves 08/10

Apertura: 08/10 08:05 por Mauricio · Cierre: 09/10 00:00 (automático)

Ingresos: $412.300 (Efectivo $180.000 · MP $98.300 · QR $54.000 · Débito $65.000 · Transf. $15.000)

Egresos: $230.500 (Proveedores $182.500 · Luz $48.000)

Retiros de caja: $50.000 (Retiro del dueño $50.000 · Efectivo)

Turnos: Ana 08:05–15:00 (dif. −$500, menor) · Juan 15:00–21:40 (faltante $1.500, fuera de tolerancia)

Resultado del día: +$181.800

Saldo total: $1.245.600

Vence el sábado: Alquiler $450.000



### Criterios de aceptación:

☐ Con el resumen diario activado a las 22:00, recibo el resumen por WhatsApp con los números iguales a los de la app.

☐ Tres días antes del vencimiento del alquiler recibo el aviso, y no lo vuelvo a recibir si ya lo pagué.

☐ Si un empleado registra un egreso mayor al límite configurado, recibo el aviso en menos de 5 minutos.

☐ Si desactivo una notificación, deja de llegar desde el día siguiente como máximo.

☐ El resumen diario muestra la fecha y hora de apertura con quién abrió y la fecha y hora de cierre con quién cerró o "(automático)", iguales a las de la app.

☐ Con el envío del resumen de cierre activado, al cerrar la caja recibo el resumen por WhatsApp y por email, con los mismos números que la app; si lo desactivo, no llega por ninguno de los dos; si cambio la frecuencia, se respeta en ambos canales; cada envío por WhatsApp queda contabilizado como plantilla paga (aprox. USD 0,026 en Argentina).

### C11. Historial, reportes y exportación (P0)

### Requerimientos:

C11.1 Historial de movimientos con filtros por fecha, tipo, medio, categoría, usuario, origen y "solo revertidos".

C11.2 Búsqueda por nota o por proveedor.

C11.3 Exportación a CSV/Excel del período filtrado (una línea por movimiento, con todas sus columnas).

C11.4 (P1) Reporte mensual en PDF: ingresos y egresos por categoría y por medio, comparación con el mes anterior.

C11.5 Historial de jornadas: cada jornada muestra la fecha y hora de apertura y quién abrió, la fecha y hora de cierre y quién cerró (o "automático"), y el enlace a su resumen de cierre (C12). La exportación incluye esas columnas.

### Criterios de aceptación:

☐ Filtro "egresos de Impuestos > ARCA en 2026" y veo la lista con total.

☐ Exporto el mes y el total del archivo coincide al centavo con el total de la app.

☐ Un historial con 20.000 movimientos carga la primera página en menos de 1 segundo.

☐ En el historial de jornadas veo, para cada día, "Apertura 08:05 — Mauricio · Cierre 21:40 — Mauricio (manual)" o "Cierre 00:00 — automático".

### C12. Cierre del día y resumen de cierre (P0)

Descripción: la jornada se cierra sin conteo de efectivo: o el comerciante toca "Cerrar caja" (cierre manual) o el sistema la cierra solo a la hora de corte configurada (cierre automático). En los dos casos se registra la fecha y hora de cierre y quién cerró (o "automático"), y el sistema genera un resumen de cierre con todos los números ya calculados: el comerciante nunca hace cuentas, solo revisa el resumen cuando quiere. No hay arqueo ni registro de diferencias entre lo contado y lo esperado en el cierre de la jornada. El único conteo de efectivo es el de la entrega de turno (C17) entre empleados, que es un control del efectivo del cajón en ese momento y no reintroduce el arqueo diario eliminado (ni ningún conteo de stock); si las entregas de turno están desactivadas, no se cuenta nada; si están activadas, "Cerrar caja" pide el conteo final del último turno como un corte sin receptor (C17.19), guardado en shift_handovers y no en el resumen de cierre.

### Requerimientos:

C12.1 Cierre automático: a la hora de corte de la jornada (por defecto medianoche, configurable, por ejemplo 03:00; ver C2.3), si la jornada no fue cerrada a mano, el sistema la cierra automáticamente con tipo de cierre automático (close_type = automatico, closed_by vacío) y genera el resumen de cierre.

C12.2 Cierre manual: botón "Cerrar caja" en la pantalla de la caja (Dueño, y Empleado si el dueño lo habilita). Con las entregas de turno activadas, antes pide el conteo final del último turno (C17.19). Sin entregas de turno, es un paso simple: muestra una confirmación ("¿Cerrar la caja de hoy?") y cierra; no pide contar el efectivo ni ingresar montos. Registra close_type = manual y closed_by = usuario.

C12.3 Fecha y hora de cierre (timestamp): todo cierre, manual o automático, registra la fecha y hora exacta (closed_at) puesta por el servidor, en America/Argentina/Buenos_Aires, guardada como timestamptz. En el cierre automático es la hora en que se ejecutó el cierre (la hora de corte).

C12.4 Una sola vez por jornada: cada jornada se cierra una sola vez. Si ya hubo un cierre manual, el cierre automático de la hora de corte no hace nada (no genera otro resumen ni modifica el existente). No se puede cerrar dos veces a mano.

C12.5 Contenido del resumen de cierre: jornada, fecha y hora de apertura y quién abrió, fecha y hora de cierre y quién cerró o "automático"; total de ventas (ingresos de la categoría Ventas); ingresos por medio de pago (Efectivo, Débito, Mercado Pago, QR, Transferencia bancaria; QR y Mercado Pago por separado, ver C4.5); total de egresos por categoría; saldo final por medio y total (para efectivo: monto inicial + ingresos − egresos en efectivo, como en C6.1); cantidad de movimientos y de reversiones; devoluciones (C14) en una línea aparte (total, desglose por medio y cantidad), separada de los egresos por categoría y del total de ventas, y descontadas del saldo final del medio con el que se devolvió; retiros de caja (C15) en una línea aparte con desglose por tipo (compra para el negocio, con su categoría; retiro del dueño; otro) y por medio, y sueldos (C16) en una línea aparte con total, medio y cantidad de pagos; cobros de fiado (C18) en una línea aparte con total, desglose por medio y cantidad (sumados a los ingresos y al saldo del medio, pero separados del total de ventas cobradas), y ventas a cuenta (fiado) del día como dato informativo (total y cantidad), que no suma a ingresos ni a saldos; los dos descontados del saldo final del medio correspondiente; turnos (C17): una línea por turno de la jornada con quién entregó, quién recibió, horario, efectivo esperado, contado, diferencia (menor o fuera de tolerancia, con el faltante/sobrante registrado), estado (confirmada, en disputa, resuelta, sin conteo final) y decisión del dueño. Todo calculado por el sistema con la misma función de dominio que los saldos (C6).

C12.6 Snapshot inmutable: el resumen de cierre se guarda como una foto fija (closing_summaries) en el momento del cierre y no se recalcula ni se edita. La fecha y hora de cierre, quién cerró y el tipo de cierre tampoco se editan.

C12.7 Movimientos posteriores al cierre: un movimiento registrado después del cierre se imputa a la jornada siguiente. Si el dueño carga un movimiento con fecha de una jornada ya cerrada (por ejemplo, un pago olvidado), queda marcado como ajuste posterior al cierre de esa jornada: el snapshot no cambia y, al ver ese resumen, aparece aparte la sección "Ajustes posteriores al cierre" con esos movimientos.

C12.8 Consulta: el resumen de cierre se ve en la web (pantalla de la caja, "Último cierre", e historial de jornadas, C11.5) cuando el comerciante quiera. Opcionalmente lo envía el bot de WhatsApp (C10.1) y, si el dueño activó el envío, también por email (C10.8).

C12.9 Si la jornada no tuvo apertura ni movimientos, el cierre automático no genera resumen. Si hubo movimientos (la apertura se crea con C2.5), se cierra normalmente.

C12.10 El cierre (manual o automático) queda en el log de auditoría (C7.6) y emite el evento resumen_cierre para el bot (6.4).

### Criterios de aceptación:

☐ Con hora de corte 00:00 y sin cierre manual, a las 00:00 la jornada queda cerrada como "automático", con closed_at = 00:00 hora de Buenos Aires, y el resumen de cierre está disponible en la web.

☐ Con las entregas de turno desactivadas, toco "Cerrar caja" a las 21:40, confirmo y la caja queda "Cerrada el 09/10/2026 a las 21:40 por Mauricio (manual)", sin que se me pida contar el efectivo ni ingresar ningún monto.

☐ Con apertura de $10.000 y los movimientos del ejemplo de C6, el resumen de cierre muestra ingresos por medio (Efectivo, Débito, Mercado Pago, QR, Transferencia bancaria), egresos por categoría, Efectivo $15.000, Mercado Pago $12.000, Débito $5.000, QR $6.000, Transferencia −$7.000 y Total $31.000, iguales a la pantalla de saldos.

☐ Si cerré a mano a las 21:40, a la hora de corte no se genera un segundo resumen y el cierre sigue siendo el manual de las 21:40.

☐ Si el job de cierre se ejecuta dos veces para la misma jornada, existe un solo cierre y un solo resumen.

☐ Registro una venta a las 21:50, después del cierre manual de las 21:40: no cambia el resumen de cierre y la venta aparece en la jornada siguiente.

☐ Cargo con fecha de ayer un pago olvidado: el resumen de ayer no cambia y muestra el pago en "Ajustes posteriores al cierre".

☐ Ni desde la app ni desde la API puedo editar un resumen de cierre, la fecha y hora de cierre, quién cerró ni el tipo de cierre (verificado con tests automáticos).

☐ En ningún cierre existe un campo de efectivo contado ni un registro de diferencia (los conteos y diferencias solo existen en las entregas de turno, C17, y el resumen de cierre solo los muestra por turno).

☐ Si en la jornada hubo una entrega de turno de Ana a Juan a las 15:00 con diferencia −$500, el resumen de cierre muestra "Turno Ana 08:05–15:00: esperado $42.500, contado $42.000, diferencia −$500 (recibió Juan)" y, como está dentro de la tolerancia (±$500), los saldos por medio no cambian por esa diferencia; una diferencia fuera de tolerancia aparece además como movimiento "Faltante de caja" o "Sobrante de caja".

☐ Si en la jornada hubo una devolución de $2.000 por QR y otra de $1.500 en efectivo, el resumen de cierre muestra la línea "Devoluciones: $3.500 (QR $2.000 · Efectivo $1.500)" aparte de los egresos por categoría, y los saldos finales de QR y Efectivo ya las descuentan.

☐ Si en la jornada hubo un retiro "compra para el negocio" de $8.000 (Limpieza), un "retiro del dueño" de $50.000 y un pago de sueldo de $120.000, todos en efectivo, el resumen de cierre muestra "Retiros de caja: $58.000 (Compra para el negocio $8.000 · Retiro del dueño $50.000)" y "Sueldos: $120.000" como líneas aparte, y el saldo final de Efectivo ya los descuenta.

### C13. Comprobantes de pago QR: carga al bot y lectura de Gmail (P0 carga manual y beta cerrada de Gmail / P1 Gmail abierto)

Descripción: los comprobantes de los cobros con QR (por ejemplo, el email "Recibiste un pago" de Mercado Pago o la captura del celular del cliente) se asocian a la venta o ticket que corresponde, para que cada cobro QR de la caja tenga su respaldo. Pueden llegar de dos formas: (a) el comerciante manda la foto, captura o PDF del comprobante al bot de WhatsApp (canal por defecto en v1), o (b) el bot detecta el email de confirmación de pago en el Gmail del comerciante, con el mismo flujo que las facturas de servicios del "PRD - Consumos de Servicios para Sistema de Inventario" (conexión con opt-in, filtros por remitente, clasificación, confirmación con un toque). Los emails de confirmación de Mercado Pago traen el número de operación (número de comprobante): cuando el número de operación es nuevo y el monto coincide exacto con un único cobro pendiente dentro de la ventana de tiempo, el pago se confirma solo, sin intervención del comerciante (C13.11).

Limitación de Gmail: gmail.readonly es un scope restringido de Google: requiere la verificación de la app OAuth y una evaluación de seguridad anual (CASA). Hasta que se aprueben, la app solo puede usarse con hasta 100 usuarios de prueba. Por eso, en v1 la lectura de Gmail es una beta cerrada y la carga manual de foto o PDF al bot es el camino por defecto. La conexión de Gmail es la misma del PRD de consumos (un solo consentimiento y un solo token por comercio, con los remitentes de pagos QR agregados a los filtros).

### Requerimientos:

C13.1 (P0) Carga manual al bot: el comerciante (o el empleado, si el dueño lo habilita) manda al bot de WhatsApp la foto, captura o PDF del comprobante de un cobro QR. El bot lee monto, fecha y hora, y, si están, el pagador y el número de operación.

C13.2 (P0 beta cerrada / P1 general) Detección en Gmail: con el Gmail conectado (CS1 del PRD de consumos), el bot detecta los emails de confirmación de pago QR de los remitentes soportados (Mercado Pago y, si corresponde, el emisor del QR del posnet) [a verificar dominios y formatos de los emails], los clasifica como "comprobante de pago QR" (distinto de una factura de servicio o de una promoción) y extrae los mismos datos. Los emails que no son comprobantes se descartan sin guardar su contenido. En v1 solo está disponible para los comercios de la beta cerrada (hasta 100 usuarios de prueba de la app OAuth).

C13.3 (P0) Asociación con la venta / ticket: el sistema busca los ingresos con medio QR sin comprobante asociado (venta registrada en la caja o cobro desde el egreso por venta, C8.8) con el mismo monto y dentro de una ventana de tiempo alrededor de la hora del pago (por defecto ±15 minutos, configurable). Propone la mejor coincidencia por WhatsApp y el comerciante la confirma con un toque ([Confirmar] [Elegir otra] [Descartar]). Fuera de la confirmación automática por número de operación de C13.11, nunca se asocia sin confirmación.

C13.4 (P0) Sin coincidencia: si no hay ninguna venta QR que coincida, el bot ofrece "Registrar como ingreso QR" (categoría Ventas, monto y hora del comprobante; queda registrado por el usuario que confirma, origen "comprobante QR") o dejar el comprobante pendiente para asociarlo después desde la web.

C13.5 (P0) Varias coincidencias: si hay más de una venta QR con el mismo monto en la ventana, el bot muestra las opciones (hora y quién la registró) para elegir con un toque.

C13.6 (P0) Un comprobante, una venta: un comprobante se asocia a un solo movimiento y un movimiento tiene como máximo un comprobante. Duplicados: el mismo email (id de mensaje de Gmail) o el mismo archivo de WhatsApp se procesa una sola vez, y un comprobante con el mismo número de operación no se carga dos veces aunque llegue por los dos canales.

C13.7 (P0) La asociación no modifica el movimiento (sigue siendo inmutable, C3.5): se guarda en una tabla aparte (cash_qr_receipts) y se puede deshacer (desasociar) con registro en la auditoría (C7.6).

C13.8 (P0) El comprobante original (imagen o PDF) se guarda como en el PRD de consumos (almacenamiento del producto y, si está conectado, Google Photos del comercio, como C3.7) y se ve desde el movimiento en la web.

C13.9 (P0) En el historial (C11) hay un filtro "QR sin comprobante" y el resumen de cierre (C12) muestra la cantidad de cobros QR con y sin comprobante, sin cambiar los montos.

C13.10 (P1) Gmail para todos: una vez aprobadas la verificación de Google y la evaluación CASA, cualquier comercio puede conectar su Gmail desde la web. La carga manual sigue disponible siempre.

C13.11 (P0 beta cerrada / P1 general) Confirmación automática por número de operación (Gmail): de los emails de confirmación de pago de Mercado Pago, el bot extrae el número de operación y el monto con parsing determinístico (expresiones regulares y plantillas por formato de email, sin IA). Los cruza con los cobros pendientes de la caja (ventas o ingresos QR sin comprobante). Si hay una coincidencia exacta (número de operación no visto antes + monto exacto + un único cobro pendiente dentro de la ventana de tiempo), el sistema confirma el pago automáticamente, sin intervención manual: asocia el comprobante al movimiento, registra el número de operación (único por comercio, para impedir duplicados) con confirmacion = automatica y le avisa al comerciante por WhatsApp ("Pago QR $3.500 confirmado automáticamente — operación 123456789 — venta de las 10:41"), con opción [Deshacer].

C13.12 (P0) Coincidencias ambiguas o parciales: si el monto no coincide exacto, hay más de un cobro posible en la ventana, no hay ningún cobro pendiente o el parsing no pudo leer con certeza el número de operación o el monto, no se confirma solo: se usa la confirmación con un toque (C13.3 a C13.5). Un número de operación ya registrado nunca genera una segunda asociación ni un segundo ingreso: el bot avisa "Este pago ya está registrado".

C13.13 (P0) La confirmación automática solo aplica a los emails leídos de Gmail (beta cerrada en v1, hasta 100 usuarios de prueba hasta la verificación de Google y la evaluación CASA). Los comprobantes cargados a mano al bot (camino por defecto) siempre se confirman con un toque; si traen número de operación, se registra igual para evitar duplicados.

C13.14 (P0) El dueño puede desactivar la confirmación automática (queda todo con un toque) y deshacer una confirmación automática (desasociar), con registro en la auditoría (C7.6).

C13.15 No reemplaza la facturación de WhatsApp: verificar pagos de clientes por Gmail es independiente del medio de pago que Meta pide para cobrar los mensajes de WhatsApp (ver 7.1 y la pregunta abierta 12).

### Criterios de aceptación:

☐ (P0) Sin Gmail conectado, mando al bot la captura de un pago QR de $3.500 de las 10:42; el bot me propone "Venta QR $3.500 — 10:41 — Juan" y con un toque en [Confirmar] queda asociada; en la web el movimiento muestra el comprobante.

☐ (P0, beta cerrada) Con Gmail conectado, llega el email de Mercado Pago "Recibiste un pago de $3.500"; el bot lo clasifica como comprobante QR y me propone la venta que coincide por monto y horario, sin que yo mande nada.

☐ Un email de promoción de Mercado Pago no genera ningún comprobante ni guarda su contenido.

☐ Si hay dos ventas QR de $3.500 en la ventana, el bot me muestra las dos con la hora y elijo una con un toque.

☐ Si no hay venta que coincida, toco "Registrar como ingreso QR" y aparece en la caja un ingreso de $3.500 en QR, categoría Ventas, vinculado al comprobante.

☐ El mismo pago que llegó por Gmail y que además mandé como captura al bot queda asociado una sola vez.

☐ Nunca se asocia un comprobante a una venta sin mi confirmación, salvo la confirmación automática por número de operación con coincidencia exacta (C13.11), que siempre me avisa y puedo deshacer.

☐ (P0, beta cerrada) Llega el email de Mercado Pago con operación 123456789 por $3.500 y hay una sola venta QR pendiente de $3.500 en la ventana: se confirma sola, queda registrado el número de operación y recibo el aviso "confirmado automáticamente" con [Deshacer], sin tocar nada.

☐ Si llega otro email (o una captura) con la misma operación 123456789, no se crea una segunda asociación ni un segundo ingreso, y el bot me dice que ya está registrado.

☐ Si el email dice $3.500 y la venta es de $3.400, o hay dos ventas de $3.500 en la ventana, no se confirma solo: el bot me pide confirmar con un toque.

☐ La extracción del número de operación y del monto de los emails de Mercado Pago se hace con parsing determinístico (sin IA); con los emails de ejemplo de los tests se obtiene siempre el mismo resultado.

☐ Si desactivo la confirmación automática, los pagos con coincidencia exacta también me llegan para confirmar con un toque.

☐ Con la app OAuth sin verificar, solo los comercios de la beta (hasta 100 usuarios de prueba) ven "Conectar mi Gmail"; el resto ve solo la opción de mandar la foto o el PDF al bot.

☐ Filtro "QR sin comprobante" en el historial y veo las ventas QR que todavía no tienen respaldo.

### C14. Devoluciones de productos: lado caja (P0)

Descripción: cuando un cliente devuelve un producto, la caja registra el reintegro de la plata como un egreso de categoría "Devolución" (origen devolucion), vinculado a la venta/ticket original y por el medio de pago que elige el operador al momento de la devolución (cualquiera de los 5: efectivo, débito, Mercado Pago, QR o transferencia; por ejemplo, un pago con QR se puede devolver por QR o en efectivo). El medio original de la venta queda guardado como referencia. El lado del stock (el producto vuelve a sumar stock y no es una merma) lo define el "PRD - Sistema de Inventario para Kioscos y Comercios"; este PRD solo cubre la plata.

### Requerimientos:

C14.1 Desde la venta: en el detalle de un ingreso de categoría Ventas (o desde el movimiento de stock de la venta, C8.8), botón "Registrar devolución". La devolución siempre parte de una venta: no se puede cargar una devolución suelta.

C14.2 Medio de reintegro elegido por el operador: al registrar la devolución, el operador (Dueño o Empleado) elige el medio de reintegro entre cualquiera de los 5 medios (C4.6); el selector viene preseleccionado con el medio con que se cobró la venta original (C14.12), pero la elección es libre. El medio elegido es el metodo_id del egreso; el medio original de la venta se guarda aparte (medio_original_id) solo como referencia. Si se elige efectivo, la plata sale del cajón; si se elige un medio electrónico, el reintegro lo hace el comerciante (C14.5).

C14.3 Monto: precargado con lo que queda por devolver de esa venta y editable. Debe ser mayor a 0 y no mayor a lo cobrado: la suma de las devoluciones vigentes (no revertidas) de una venta nunca supera el monto de la venta. Se permiten devoluciones parciales (uno de varios productos, o parte del importe) y varias devoluciones sobre la misma venta hasta completar el total.

C14.4 Registro: se crea un egreso con categoría "Devolución", origen devolucion, referencia a la venta original (sale_id), medio de reintegro elegido (metodo_id), medio original de la venta como referencia (medio_original_id), usuario, fecha y hora y nota opcional (motivo: producto fallado, vencido, cambio de opinión, etc.). Si la devolución se inicia desde el inventario, también queda vinculada al movimiento de stock del reingreso.

C14.5 Medios electrónicos (débito, Mercado Pago, QR, transferencia): el reintegro real lo hace el comerciante en Mercado Pago, en el banco (home banking) o en el posnet; la caja solo lo registra, igual que el resto de los pagos ("el bot no ejecuta pagos"). La pantalla de devolución lo aclara ("Acordate de hacer la devolución en Mercado Pago / el banco") y la nota puede guardar el número de operación de la devolución. En efectivo, el registro refleja la plata que sale del cajón.

C14.6 Saldos y resumen de cierre: la devolución baja el saldo del medio de reintegro elegido (C6.7) y aparece en una línea aparte "Devoluciones" en los saldos por medio y en el resumen de cierre (C12.5), separada de los egresos por categoría y sin modificar el total de ventas.

C14.7 Inmutable: como todo movimiento (C3.5, C7), una devolución no se edita ni se borra; un error se corrige con una reversión, que vuelve a dejar disponible ese monto para devolver.

C14.8 Venta revertida: no se puede registrar una devolución sobre una venta revertida (C7). Una venta con devoluciones vigentes se puede revertir solo después de revertir sus devoluciones.

C14.9 Permisos: las registran el Dueño y, por defecto, también el Empleado; el dueño puede restringir opcionalmente el permiso a un empleado puntual (permiso definido en la matriz de AU4 del "PRD - Autenticación y Gestión de Usuarios para Sistema de Inventario", aplicado en el backend). Quedan en la auditoría (C7.6) y en el historial, con filtro por origen "devolución" (C11.1).

C14.10 Si la devolución es posterior al cierre de la jornada de la venta, se imputa a la jornada en que se registra (C12.7): el resumen de cierre de la venta no cambia.

C14.11 Auditoría del medio elegido: cada devolución registra en el log de auditoría (C7.6) quién la registró, cuándo (hora del servidor), el medio de reintegro elegido y el medio original de la venta, para poder revisar las devoluciones por un medio distinto del cobrado.

C14.12 Pantalla de devolución (web y celular): en el panel de la caja, tanto en la web como en el celular, la pantalla "Registrar devolución" tiene un selector de medio de reintegro con los 5 medios (Efectivo, Débito, Mercado Pago, QR, Transferencia bancaria), preseleccionado con el medio original de la venta y que el operador puede cambiar antes de confirmar.

C14.13 Historial y resumen de cierre: el historial de movimientos de la caja (C11) muestra en cada devolución el medio de reintegro elegido y, como referencia, el medio original de la venta (ej.: "Devolución — $2.000 — Efectivo (venta por QR)"). El resumen de cierre (C12.5) muestra la línea "Devoluciones" por medio de reintegro y, en su detalle, cada devolución con el medio elegido y el medio original.

### Criterios de aceptación:

☐ Desde una venta de $6.000 cobrada por QR toco "Registrar devolución", dejo $2.000 y en la caja aparece un egreso "Devolución — $2.000 — QR", vinculado a esa venta, con mi usuario y la hora; el saldo de QR baja $2.000.

☐ Al registrar la devolución puedo elegir cualquiera de los 5 medios de reintegro; la pantalla me muestra como referencia que la venta se cobró por QR.

☐ En la pantalla "Registrar devolución", tanto en la web como en el celular, veo un selector con los 5 medios, preseleccionado con el medio original de la venta (QR), y puedo cambiarlo antes de confirmar; si no lo toco, la devolución queda por QR.

☐ En el historial de movimientos de la caja, cada devolución muestra el medio de reintegro elegido y el medio original de la venta (ej.: "Devolución — $2.000 — Efectivo (venta por QR)").

☐ En el resumen de cierre, la línea "Devoluciones" se desglosa por medio de reintegro y el detalle de cada devolución muestra el medio elegido y el medio original de la venta.

☐ Devuelvo en efectivo $2.000 de una venta cobrada por QR: el egreso queda con medio Efectivo (y medio original QR como referencia), baja el saldo de Efectivo y no el de QR, y el resumen de cierre lo muestra en "Devoluciones: Efectivo $2.000".

☐ En la auditoría de esa devolución veo quién la registró, cuándo, el medio elegido (Efectivo) y el medio original de la venta (QR).

☐ Sobre la misma venta de $6.000 registro otra devolución de $4.000; una tercera devolución (aunque sea de $1) se rechaza porque ya se devolvió todo lo cobrado.

☐ No puedo registrar una devolución de $7.000 sobre una venta de $6.000, ni una devolución de $0.

☐ No puedo cargar una devolución sin venta original vinculada (ni desde la web, ni desde la API, ni desde el bot).

☐ Al registrar una devolución por Mercado Pago, la pantalla me recuerda que el reintegro lo tengo que hacer yo en Mercado Pago; el sistema no ejecuta ningún pago.

☐ La devolución aparece en el resumen de cierre como línea aparte "Devoluciones" (total y por medio), separada de los egresos por categoría.

☐ No existe forma de editar ni borrar una devolución; la revierto con motivo y el monto vuelve a estar disponible para devolver en esa venta.

☐ Desde la devolución abro la venta original, y desde la venta veo sus devoluciones y cuánto queda por devolver.

☐ El stock del producto devuelto se maneja según el PRD de inventario (vuelve a sumar, no como merma); la caja no registra la devolución como pérdida.

☐ Un empleado recién invitado, sin que el dueño cambie ningún permiso, ve "Registrar devolución" en una venta y puede registrar la devolución; queda con su usuario en la auditoría.

☐ Si el dueño le restringe las devoluciones a un empleado, ese empleado no ve el botón y la API le responde 403; los demás empleados siguen pudiendo registrarlas.

### C15 a C18: en la Parte 2

Las funcionalidades C15 (Retiros de caja), C16 (Pago de sueldos), C17 (Entrega de turno entre empleados, incluido el conteo sorpresa de efectivo) y C18 (Fiado: venta a cuenta y cobro de fiado, lado caja), con sus requerimientos y criterios de aceptación, están en la Parte 2: Turnos, Retiros, Sueldos y Fiado, con la misma numeración.

## 5. Flujos de usuario

### Flujo 1: apertura del día

A la mañana, el dueño (o el primer empleado del turno) abre la app y entra a "Caja".

Ve el estado "Día sin abrir" y toca "Abrir el día".

Ingresa el monto inicial en efectivo del cajón (por ejemplo, $20.000) y confirma.

El servidor registra la fecha y hora exacta de apertura (09/10/2026 08:05, hora de Buenos Aires) y el usuario que abrió; no se pueden modificar después.

La caja muestra "Abierto por Mauricio el 09/10/2026 a las 08:05 — Efectivo inicial $20.000" y queda lista para registrar movimientos. La misma fecha, hora y usuario se ven luego en el historial, en el resumen de cierre y en el resumen diario del bot.

### Flujo 2: cobro en el mostrador

Un cliente paga $3.500 escaneando el QR del mostrador (QR de Mercado Pago o del posnet).

El empleado toca "+ Ingreso", escribe 3500, toca "QR"; la categoría "Ventas" ya viene elegida. (Si el cliente paga con un link de pago o una transferencia a la cuenta de Mercado Pago, elige "Mercado Pago"; ver C4.5.)

Toca "Guardar". El movimiento aparece arriba de la lista con su nombre y la hora, y el saldo de QR sube.

(Si está activada la integración de ventas) en lugar del paso 2, escanea los productos en el inventario, registra el egreso por venta y toca "Registrar cobro" eligiendo el medio.

### Flujo 3: pago a proveedor desde un pedido de reposición

Llega el preventista de "Distribuidora X" con el pedido #42 y lo cobra.

El dueño abre el pedido en el inventario y toca "Marcar como pagado".

El sistema precarga el monto ($185.000) y el medio (Transferencia, según las condiciones del proveedor). El dueño corrige el monto a $182.500 porque faltó una caja.

Confirma. El pedido queda "Pagado" y en la caja aparece el egreso "Pago a proveedores — Distribuidora X — Pedido #42".

Si se equivocó de medio, revierte el egreso (el pedido vuelve a "Pendiente de pago") y lo vuelve a marcar como pagado con el medio correcto.

### Flujo 4: pago de un gasto (alquiler, luz, gas, servicios)

El dueño paga la luz por Mercado Pago.

En "Caja" toca "− Egreso", escribe el monto, elige "Mercado Pago" y la categoría "Luz", agrega la nota "bimestre ago-sep".

Guarda; el saldo de Mercado Pago baja y el gasto queda en el mes.

### Flujo 5: vencimiento de impuestos (ARCA) con aviso por WhatsApp

El dueño cargó el vencimiento "Monotributo octubre — Impuestos > ARCA — vence el 20/10".

El 17/10 el bot de WhatsApp le avisa: "En 3 días vence Monotributo octubre".

Paga desde el home banking, entra a la caja, toca el vencimiento y "Registrar pago".

El egreso se crea precargado (categoría Impuestos > ARCA, medio Transferencia); confirma y el vencimiento queda "Pagado". No recibe más avisos de ese vencimiento.

### Flujo 6: corrección de un error

El empleado cargó $35.000 en efectivo en lugar de $3.500.

El dueño ve el movimiento en el historial, toca "Revertir y corregir" e ingresa el motivo "se cargó un cero de más".

El sistema crea la reversión de $35.000 y abre el alta precargada; el dueño cambia el monto a $3.500 y guarda.

En la lista quedan el original tachado, la reversión y el movimiento correcto; el saldo es el correcto.

### Flujo 7: consulta de saldos y resumen diario

A la noche el dueño abre "Caja" y ve el saldo por medio y el total del día.

Cambia el período a "Este mes" y ve ingresos, egresos y el desglose por categoría.

A la hora configurada recibe por WhatsApp el resumen del día con los mismos números.

### Flujo 8: retiro del dueño

El dueño se lleva $50.000 del cajón para uso personal.

Toca "Retiro de caja" (C15), carga $50.000, deja Efectivo, elige el tipo "Retiro del dueño" y el motivo "gastos personales".

El efectivo baja y el retiro queda separado de los gastos del negocio en los reportes y en la línea "Retiros de caja" del resumen de cierre.

### Flujo 9: cierre manual de la caja ("Cerrar caja")

A las 21:40, al bajar la persiana, el dueño (o el empleado habilitado) entra a "Caja" y toca "Cerrar caja".

El sistema pide solo una confirmación ("¿Cerrar la caja de hoy?"); no pide contar el efectivo ni ingresar montos.

Confirma. El servidor registra la fecha y hora de cierre (09/10/2026 21:40, hora de Buenos Aires), quién cerró y el tipo "manual", y genera el resumen de cierre.

La caja muestra "Cerrada el 09/10/2026 a las 21:40 por Mauricio (manual)" y el resumen: total de ventas, ingresos por medio (Efectivo, Débito, Mercado Pago, QR, Transferencia bancaria), egresos por categoría y saldo final por medio y total.

A la hora de corte el cierre automático ve que la jornada ya está cerrada y no hace nada. Si después alguien registra una venta, se imputa a la jornada siguiente.

Si el dueño tiene activado el envío del resumen de cierre, lo recibe por WhatsApp (plantilla paga, aprox. USD 0,026) y por email, con los mismos números (C10.8).

### Flujo 10: cierre automático a la hora de corte

El comercio tiene la hora de corte en 00:00 y nadie tocó "Cerrar caja".

A las 00:00 (hora de Buenos Aires) el job de cierre cierra la jornada como "automático", registra la fecha y hora de cierre y genera el resumen de cierre.

A la mañana el dueño abre "Caja" > "Último cierre" y revisa el resumen ("Cierre: 10/10/2026 00:00 — automático"), sin hacer cuentas. Si tiene activado el envío, ya lo recibió por WhatsApp y por email (C10.8), según la frecuencia que configuró.

Si después carga un gasto olvidado con fecha de ayer, el resumen de ayer no cambia y el gasto aparece como ajuste posterior al cierre.

### Flujo 11: comprobante de pago QR mandado al bot (por defecto en v1)

Un cliente paga $3.500 con el QR del mostrador y el empleado registra la venta en QR (Flujo 2).

El comerciante saca una captura del comprobante (o reenvía el PDF) y se la manda al bot de WhatsApp.

El bot lee monto y hora, busca ventas QR sin comprobante por $3.500 en la ventana de ±15 minutos y responde: "Pago QR $3.500 — 10:42. ¿Es la venta de las 10:41 registrada por Juan?" [Confirmar] [Elegir otra] [Descartar].

El comerciante toca [Confirmar]; el comprobante queda asociado a la venta y se ve desde el movimiento en la web.

Si no había venta que coincida, el bot ofrece "Registrar como ingreso QR" o dejarlo pendiente para asociarlo después desde la web.

### Flujo 12: comprobante de pago QR detectado en Gmail (beta cerrada)

El comercio está en la beta cerrada y el dueño conectó su Gmail desde la web (mismo opt-in que el Flujo 1 del PRD de consumos).

Llega el email de Mercado Pago "Recibiste un pago de $3.500". El bot lo detecta por remitente, lo clasifica como comprobante de pago QR y extrae monto y hora.

El bot le manda al dueño la venta QR que coincide por monto y horario, con [Confirmar] [Elegir otra] [Descartar]; con un toque queda asociada.

Si el empleado además manda la captura del mismo pago, el bot avisa que ya está asociado y no lo duplica.

Si el comercio no está en la beta (app OAuth todavía sin verificar), la opción de conectar Gmail no aparece y sigue el Flujo 11.

### Flujo 13: confirmación automática por número de operación (Gmail, beta cerrada)

A las 10:41 el empleado registra una venta QR de $3.500 (Flujo 2); queda como cobro QR sin comprobante.

A las 10:42 llega al Gmail del dueño el email de Mercado Pago con el número de operación 123456789 y el monto $3.500.

El parser determinístico (sin IA) extrae número de operación y monto. El número no estaba registrado, el monto coincide exacto y hay una sola venta QR pendiente de $3.500 en la ventana de ±15 minutos.

El sistema confirma el pago solo: asocia el comprobante a la venta, guarda el número de operación y le manda al dueño "Pago QR $3.500 confirmado automáticamente — operación 123456789 — venta de las 10:41" con [Deshacer].

Si el mismo pago llega de nuevo (reenvío o captura al bot), el bot responde que ya está registrado. Si la coincidencia no es exacta (monto distinto, dos ventas posibles, número ilegible), el bot pide confirmar con un toque como en el Flujo 12.

### Flujo 14: devolución de un producto (lado caja)

Un cliente vuelve con 1 de los 3 alfajores que compró por $4.200 pagando con QR; el producto está vencido y pide la devolución de $1.400.

El dueño (o un empleado, salvo que el dueño le haya restringido las devoluciones) busca la venta en la caja (o el movimiento de stock de la venta en el inventario) y toca "Registrar devolución".

La pantalla de devolución (en el celular o en la web) muestra el selector de medio de reintegro con los 5 medios, preseleccionado en "QR" (el medio original de la venta), y el monto precargado con lo que queda por devolver ($4.200); el dueño deja "QR", cambia el monto a $1.400 y agrega la nota "alfajor vencido".

Confirma. La caja registra el egreso "Devolución — $1.400 — QR" vinculado a la venta, y el saldo de QR baja $1.400. El reingreso del alfajor al stock (no es merma) sigue el PRD de inventario.

Como es un medio electrónico, la app le recuerda que el reintegro lo hace él: abre Mercado Pago y devuelve los $1.400 al cliente. El sistema no ejecuta el pago.

Si el cliente prefiere el reintegro en efectivo (aunque haya pagado con QR), el dueño elige "Efectivo" en el paso 3, le da los $1.400 del cajón y la devolución baja el saldo de Efectivo (no el de QR); el movimiento guarda QR como medio original y la elección queda en la auditoría.

Al cierre, el resumen muestra la línea aparte "Devoluciones: $1.400 (QR $1.400)". Si se equivocó de monto, revierte la devolución y la vuelve a cargar.

### Flujos 15 a 20: en la Parte 2

Los Flujos 15 (retiro de caja), 16 (pago de sueldo), 17 a 19 (entrega de turno, disputa, fin del día, resguardo y conteo sorpresa de efectivo) y 20 (fiado) están en la Parte 2.

## 6. Notas técnicas

### 6.1 Arquitectura y stack

Mismo stack que el Sistema de Inventario: Astro + TypeScript (SSR, islas interactivas), endpoints /api/* o servicio Hono, validación con Zod, ORM Drizzle, PostgreSQL gestionado, PWA con cola offline.

Una base de datos por cliente (por comercio), igual que ModoOps, más una base de control. Todas las tablas de la caja viven en la base de cada comercio (sin tenant_id); usuarios, memberships, planes y suscripciones viven en la base de control. La base del comercio se resuelve del lado del servidor a partir del usuario autenticado.

Las migraciones de la caja se agregan al mismo runner de migraciones (base de control y todas las bases de clientes), con despliegue escalonado.

Mobile-first y offline: toda la caja (apertura, movimientos, 5 medios, devoluciones, retiros de caja, pagos de sueldos, entregas de turno, ventas a cuenta y cobros de fiado, cierre, resúmenes e historial) funciona solo desde el celular, también sin conexión, con SQLite local en el teléfono como almacenamiento offline y sincronización posterior con la base del comercio (idempotencia por idempotency_key, timestamps del servidor al sincronizar); el detalle lo define el PRD offline (en redacción).

La web Astro es la interfaz de visualización y gestión de la caja; el bot de WhatsApp solo consume eventos (y, en fases posteriores, consultas) a través de la API del producto, nunca accediendo directo a la base del comercio.

### 6.2 Modelo de datos

Seed de categorías (extracto): la categoría de egreso del sistema "Sin factura" se carga con es_sistema = true y requiere_nota = true; la categoría de egreso del sistema "Devolución" se carga con es_sistema = true (solo usable con origen devolucion); se cargan además las categorías de egreso "Insumos" y "Limpieza" (usables en retiros de tipo compra para el negocio y en egresos comunes), "Sueldos" (es_sistema = true, usada por el pago de sueldos, C16) y "Retiro del dueño" (es_sistema = true, es_operativa = false, usada por los retiros de tipo retiro del dueño, C15); "Faltante de caja" (egreso) y "Sobrante de caja" (ingreso), es_sistema = true, solo usables con origen diferencia_turno (C17.13); "Cobro de fiado" (ingreso, es_sistema = true, solo usable con origen cobro_fiado, C18).

Seed de medios de pago (cash_payment_methods, se carga al aprovisionar la base del comercio, en este orden): efectivo (Efectivo), debito (Débito), mercado_pago (Mercado Pago), qr (QR), transferencia (Transferencia bancaria). Las claves de ingresos_por_medio, saldo_final_por_medio, devoluciones_por_medio, retiros_por_medio, sueldos_por_medio y cobros_fiado_por_medio en closing_summaries usan estos mismos códigos.

Las tablas shift_handovers, handover_counts y cash_drawer_drops y las reglas de integridad de retiros de caja (C15), sueldos (C16), entregas de turno (C17) y fiado (C18) están en la Parte 2. Las secciones 6.3 (reglas de integridad base), 6.4 a 6.6, 7 (riesgos y preguntas abiertas), 8 (plan por fases) y el Anexo A (glosario) están en la Parte 3.

Campo | Detalle
--- | ---
Producto | Módulo Caja Digital del Sistema de Inventario para Kioscos y Comercios
Autor | Mauricio Matasini
Estado | Borrador v1
Fecha | 9 de octubre de 2026
Documentos relacionados | "PRD - Sistema de Inventario para Kioscos y Comercios" (mismo folder), PRD del bot de WhatsApp (en redacción) y "PRD - Fiado y Cuenta Corriente de Clientes" (en redacción)
Stack | Astro + TypeScript, PostgreSQL, una base de datos por cliente más una base de control (igual que ModoOps)

# | Objetivo | Cómo se mide
--- | --- | ---
O1 | Que el dueño sepa cuánta plata tiene en cada medio de pago | Comercios activos que consultan los saldos al menos 3 veces por semana
O2 | Registrar todos los movimientos de plata del comercio | Movimientos de caja por comercio activo por semana (meta: más de 70)
O3 | Registro ultrarrápido | Tiempo medio para registrar un movimiento: menos de 10 segundos
O4 | Vincular los pagos a proveedores con los pedidos de reposición | Porcentaje de pagos a proveedores generados desde un pedido marcado como pagado (meta: más de 60%)
O5 | Evitar recargos por vencimientos olvidados | Vencimientos cargados y pagados antes de la fecha
O6 | Trazabilidad total | 100% de los movimientos con usuario, fecha y hora; cero movimientos borrados

Prioridad | Significado
--- | ---
P0 - MVP | Imprescindible para el lanzamiento del módulo
P1 - Post-MVP cercano | Dentro de los 2 a 3 meses posteriores
P2 - Futuro | Según demanda

# | Funcionalidad | MVP (P0) | Más adelante (P1/P2)
--- | --- | --- | ---
C1 | Caja única | Una caja por comercio con todos los movimientos de plata | Varias cajas o puntos de cobro (P2)
C2 | Apertura del día | Monto inicial de efectivo al empezar la jornada, con fecha y hora de apertura (timestamp) y usuario | Recordatorio de apertura por WhatsApp (P1)
C3 | Movimientos (ingresos y egresos) | Una línea por movimiento: fecha, monto, medio, categoría, tipo, usuario, nota | Foto del comprobante guardada en el Google Photos del comercio, subida por el bot de WhatsApp (P1), movimientos recurrentes automáticos (P2)
C4 | Medios de pago | Efectivo, Débito, Mercado Pago, QR (Mercado Pago QR / QR del posnet), Transferencia bancaria | Crédito, otras billeteras, medios personalizados (P1)
C5 | Categorías | Categorías predefinidas de ingreso y egreso, incluidas Impuestos / ARCA y "Sin factura" (con nota obligatoria) | Subcategorías y categorías personalizadas (P1), presupuesto por categoría (P2)
C6 | Saldos | Saldo por medio de pago y total, del día y de un período | Gráficos y comparación entre meses (P1)
C7 | Reversión y auditoría | Movimientos inmutables, reversión con contra-asiento, log de auditoría | Aprobación del dueño para reversiones de empleados (P1)
C8 | Integración con inventario | Pago a proveedor automático al marcar un pedido como pagado; cobro opcional al registrar un egreso por venta | Caja rápida de venta (P2), pagos parciales de pedidos (P1)
C9 | Vencimientos de pagos | Agenda simple de vencimientos (alquiler, servicios, impuestos) con aviso en la app | Vencimientos recurrentes, pago en un toque desde el aviso (P1)
C10 | Notificaciones por WhatsApp | Eventos de caja disponibles para el bot (resumen diario, vencimientos, alertas) | Consultas al bot ("¿cuánto tengo en Mercado Pago?") y carga de movimientos por WhatsApp (P1/P2, según PRD del bot)
C11 | Reportes y exportación | Historial con filtros, exportación CSV/Excel | Reporte mensual de ingresos y egresos por categoría en PDF (P1)
C12 | Cierre del día y resumen de cierre | Cierre manual ("Cerrar caja", sin conteo) o automático a la hora de corte, con fecha y hora de cierre y usuario o "automático"; resumen de cierre generado solo e inmutable | Envío del resumen de cierre por el bot de WhatsApp (P1, según el PRD del bot) y por email (según el PRD de notificaciones por email): si el dueño lo activa, se envía por los dos canales
C13 | Comprobantes de pago QR (bot y Gmail) | Carga manual de la foto o PDF del comprobante QR al bot de WhatsApp (por defecto) y asociación a la venta con un toque; lectura de Gmail en beta cerrada (hasta 100 usuarios de prueba), con confirmación automática por número de operación cuando la coincidencia es exacta | Lectura de Gmail para todos los comercios una vez aprobadas la verificación de Google y la evaluación CASA (P1)
C14 | Devoluciones de productos (lado caja) | Egreso de categoría "Devolución" por el medio de pago que elige el operador al momento de la devolución (cualquiera de los 5; el medio original de la venta queda como referencia), vinculado a la venta, con monto menor o igual a lo cobrado (devoluciones parciales); línea aparte en saldos por medio y en el resumen de cierre; inmutable (solo reversión); el reintegro electrónico lo hace el comerciante en Mercado Pago o en el banco | Aviso de devoluciones del día por el bot (P1), conciliación con la devolución real de Mercado Pago (P2)
C15 | Retiros de caja | Registro de plata que sale del cajón (monto, medio, por defecto efectivo, quién, fecha y hora, motivo obligatorio) con tipo: compra para el negocio (egreso con su categoría, ej. Insumos o Limpieza, y foto del comprobante opcional), retiro del dueño (no es gasto operativo, se muestra aparte) u otro (con nota); baja el saldo del medio; líneas propias en el historial y en el resumen de cierre; empleados solo con permiso del dueño (apagado por defecto); inmutable, auditado y offline | Tope de retiro por empleado y aviso por WhatsApp al dueño (P1)
C16 | Pago de sueldos | Egreso de categoría "Sueldos" vinculado al empleado (usuario) o a un nombre libre, con período, monto, medio y comprobante opcional; solo el Dueño; línea propia en el resumen de cierre; inmutable, auditado y offline | Recordatorio de sueldos por período y reporte por empleado (P1); sin liquidación de sueldos
C17 | Entrega de turno | Cortes de turno dentro de la caja única (activables por el dueño): conteo del efectivo del cajón (opcional por denominación, a ciegas recomendado), esperado y diferencia con tolerancia configurable (diferencia menor, o fuera de tolerancia con motivo, aviso inmediato al dueño y movimiento de faltante/sobrante), confirmación o rechazo (en disputa) con el usuario de quien recibe y resolución del dueño, auto-entrega, cierre sin receptor, retiro a resguardo, fondo de cambio, conteo sorpresa de efectivo opcional y no diario; medios electrónicos solo informativos; historial inmutable exportable a PDF y reporte de diferencias por empleado; offline. Es un control de efectivo en la entrega, no el arqueo diario eliminado | Avisos de diferencias por WhatsApp configurables por empleado y firma del recuento por los dos empleados (P1)
C18 | Fiado: lado caja | Opción de cobro "A cuenta (fiado)" en la venta que no entra a la caja como ingreso (no suma a saldos ni a ventas cobradas); los cobros de fiado entran como ingreso de categoría "Cobro de fiado" por cualquiera de los 5 medios, vinculados al cliente; líneas aparte en el resumen de cierre; inmutable, auditado, offline y con avisos al dueño. La cuenta corriente vive en el "PRD - Fiado y Cuenta Corriente de Clientes" (en redacción) | Recordatorios de cobro por WhatsApp y cobro con link de pago (según el PRD de fiado)

Tabla | Campos principales
--- | ---
cash_payment_methods | id, código (efectivo, debito, mercado_pago, qr, transferencia), nombre, activo, orden
cash_categories | id, nombre, tipo (ingreso / egreso), parent_id (subcategorías, ej. Impuestos > ARCA), es_sistema, requiere_nota (boolean; true en "Sin factura"), es_operativa (boolean; false en "Retiro del dueño"), activo; incluye la categoría de egreso del sistema "Devolución" (C14)
cash_days (aperturas y cierres) | id, fecha_jornada, monto_inicial_centavos, opened_at (timestamptz, hora del servidor, fecha y hora de apertura), opened_by (user_id de quien abrió), closed_at (timestamptz, nullable hasta el cierre, fecha y hora de cierre), closed_by (user_id, nullable; vacío en el cierre automático), close_type (manual / automatico, nullable hasta el cierre), nota, reemplaza_a (id de la apertura corregida, nullable)
cash_movements | id (UUID), tipo (ingreso / egreso), monto_centavos (bigint, mayor a 0), metodo_id (en una devolución es el medio de reintegro elegido por el operador, cualquiera de los 5), medio_original_id (nullable; solo en devoluciones: medio con que se cobró la venta original, como referencia), categoria_id, fecha_movimiento, fecha_jornada, user_id, origen (manual / pedido_reposicion / venta / comprobante_qr / devolucion / retiro_caja / sueldo / diferencia_turno / cobro_fiado / sistema), cliente_fiado_id (nullable; obligatorio cuando origen = cobro_fiado: cliente del PRD de fiado), shift_id (turno en curso al registrar, C17; nullable si las entregas están desactivadas), handover_id (nullable; en los faltantes/sobrantes, la entrega que los originó), tipo_retiro (nullable; obligatorio cuando origen = retiro_caja: compra_negocio / retiro_dueno / otro), motivo (nullable; obligatorio en los retiros de caja), empleado_user_id y empleado_nombre (nullable; en los pagos de sueldos, uno de los dos obligatorio), periodo_sueldo (nullable; obligatorio en los pagos de sueldos), ref_tipo y ref_id (pedido de reposición, movimiento de stock, vencimiento; en una devolución, el movimiento de stock del reingreso si existe), sale_id (nullable; obligatorio cuando origen = devolucion: id del ingreso de la venta/ticket original que se devuelve), proveedor_id (nullable), nota, revierte_a (id del movimiento original, nullable, único), motivo_reversion, idempotency_key (único), ajuste_cierre_id (nullable: resumen de cierre de la jornada ya cerrada a la que corresponde un ajuste posterior al cierre), comprobante_photos_media_item_id y comprobante_photos_url (nullable, P1: foto del comprobante en Google Photos), created_at
cash_due_items (vencimientos) | id, concepto, categoria_id, monto_estimado_centavos, vence_el, metodo_habitual_id, estado (pendiente / pagado / descartado), movimiento_pago_id, recurrencia (P1)
purchase_orders (inventario, campos nuevos) | estado_pago (pendiente / pagado), pago_movimiento_id
closing_summaries (resúmenes de cierre) | id, fecha_jornada (único), cash_day_id, opened_at, opened_by, closed_at (timestamptz), closed_by (nullable), close_type (manual / automatico), monto_inicial_centavos, total_ventas_centavos, ingresos_por_medio (JSON en centavos), egresos_por_categoria (JSON en centavos), saldo_final_por_medio (JSON en centavos), saldo_total_centavos, cantidad_movimientos, cantidad_reversiones, total_devoluciones_centavos, devoluciones_por_medio (JSON en centavos, línea aparte de C14), cantidad_devoluciones, total_retiros_centavos, retiros_por_tipo (JSON en centavos: compra_negocio, retiro_dueno, otro), retiros_por_medio (JSON en centavos), cantidad_retiros, total_sueldos_centavos, sueldos_por_medio (JSON en centavos), cantidad_sueldos, total_cobros_fiado_centavos, cobros_fiado_por_medio (JSON en centavos), cantidad_cobros_fiado, ventas_a_cuenta_centavos y cantidad_ventas_a_cuenta (informativos, no suman a ingresos), turnos (JSON: por turno, entregado_por, recibido_por, horario, esperado, contado, diferencia, clasificación, estado y resolución, desde shift_handovers; sin campos de conteo propios del cierre), ultimo_movimiento_id (último movimiento incluido en el snapshot), created_at
cash_qr_receipts (comprobantes de pago QR, C13) | id, origen (whatsapp / gmail), gmail_message_id (nullable, único), whatsapp_media_id (nullable, único), numero_operacion (nullable, único por comercio; número de operación/comprobante de Mercado Pago), monto_centavos, pagado_at (timestamptz), pagador (nullable), movimiento_id (nullable, único: venta asociada), estado (pendiente / asociado / descartado), confirmacion (automatica / un_toque, nullable), parser_version (versión de la regla determinística usada), confirmado_por (nullable en la confirmación automática), confirmado_at, comprobante_url / media_item_id, created_at
cash_audit_log | entidad, entidad_id, acción, valor_anterior, valor_nuevo (JSON), user_id, created_at
notification_events (outbox) | id, tipo (resumen_diario, resumen_cierre, vencimiento, alerta_caja, pago_proveedor, entrega_turno, diferencia_turno, entrega_en_disputa, entrega_sin_confirmar, turno_sin_conteo_final, cobro_fiado), payload JSON, estado (pendiente / enviado / fallido), intentos, created_at
