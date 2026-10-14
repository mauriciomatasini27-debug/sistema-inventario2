> Origen: `PRD - Caja Digital (Parte 2_ Turnos, Retiros, Sueldos y Fiado).docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/cash/turnos.ts`, `src/pages/api/cash/shifts*`

---

# PRD - Caja Digital (Parte 2: Turnos, Retiros, Sueldos y Fiado)

Parte 2 · Ver también: Parte 1: Núcleo · Parte 3: Integraciones, Riesgos, Fases y Glosario

Este PRD está dividido en 3 partes. La numeración (C1 a C18, Flujos 1 a 20, secciones 1 a 8) es la misma en las tres, así que las referencias desde otros PRD (por ejemplo "C15" o "C17.13") siguen valiendo; cada sección está en la parte que indica el índice.

### Índice compartido

Parte 1: Núcleo (documento original, mismo id): 1. Resumen, 2. Objetivos, 3. Usuarios, 4.0 Priorización (tabla completa C1 a C18), C1 a C14 (caja, apertura, movimientos, medios, categorías, saldos, reversión y auditoría, inventario, vencimientos, notificaciones, reportes, cierre y resumen de cierre, comprobantes QR, devoluciones), Flujos 1 a 14, 6.1 Arquitectura, 6.2 Modelo de datos (tablas base).

Parte 2: Turnos, Retiros, Sueldos y Fiado: C15 Retiros de caja, C16 Pago de sueldos, C17 Entrega de turno (incluye el conteo sorpresa de efectivo, C17.21), C18 Fiado (lado caja), Flujos 15 a 20, adiciones al modelo de datos (shift_handovers, handover_counts, cash_drawer_drops) y reglas de integridad de C15 a C18 (adiciones a 6.3).

Parte 3: Integraciones, Riesgos, Fases y Glosario: 6.3 Reglas de integridad (base), 6.4 Integración con el bot de WhatsApp, 6.5 Seguridad, rendimiento y calidad, 6.6 Cierre automático, 7. Riesgos y preguntas abiertas, 8. Plan por fases, Anexo A: glosario.

Continúa la sección 4 (Funcionalidades) de la Parte 1. Las referencias a C1 a C14 (por ejemplo C6, C7.6, C12.5) apuntan a la Parte 1; las referencias a 6.4, 7 y 8 apuntan a la Parte 3.

## 4. Funcionalidades (continuación)

### C15. Retiros de caja (P0)

Descripción: registro de la plata que sale del cajón (o de otro medio) por fuera de los pagos a proveedores, gastos con vencimiento, devoluciones y sueldos: una compra al paso para el negocio, el retiro personal del dueño u otro motivo. Cada retiro es un egreso (origen retiro_caja) con un tipo de retiro (tipo_retiro) y un motivo obligatorio.

### Requerimientos:

C15.1 Botón "Retiro de caja" en la pantalla de la caja (web y celular), aparte de "− Egreso".

C15.2 Datos: monto (mayor a 0), medio de pago (preseleccionado Efectivo, editable entre los 5 medios), tipo de retiro, motivo obligatorio (texto libre; no se guarda vacío ni solo con espacios), fecha y hora (del servidor) y quién lo registró (usuario).

C15.3 Tipos de retiro (tipo_retiro):

Compra para el negocio (compra_negocio): es un gasto operativo; pide la categoría de egreso (ej.: Insumos, Limpieza, Otros egresos) y permite adjuntar una foto del comprobante opcional (desde el celular o mandándola al bot, como C3.7).

Retiro del dueño (retiro_dueno): plata que el dueño se lleva para uso personal; categoría "Retiro del dueño" (C5.6), no es un gasto operativo y se muestra aparte.

Otro (otro): cualquier otra salida; categoría "Otros egresos" y el motivo hace de nota obligatoria.

C15.4 Saldos: el retiro baja el saldo del medio elegido (C6.8).

C15.5 Historial y resumen de cierre: cada retiro aparece como línea propia en el historial (C11), con el tipo, el motivo y quién lo hizo (ej.: "Retiro de caja — Retiro del dueño — $50.000 — Efectivo — Mauricio"), con filtro por origen "retiro de caja" y por tipo; y en el resumen de cierre (C12.5) en la línea "Retiros de caja" desglosada por tipo y por medio.

C15.6 Permisos: el Dueño siempre puede registrarlos. El Empleado solo si el dueño le habilita el permiso "Registrar retiros de caja", apagado por defecto (permiso de la matriz AU4 del "PRD - Autenticación y Gestión de Usuarios para Sistema de Inventario", aplicado en el backend). Un empleado habilitado no puede registrar retiros de tipo "Retiro del dueño".

C15.7 Inmutable y auditado: como todo movimiento (C3.5, C7), no se edita ni se borra; un error se corrige con una reversión. El alta queda en el log de auditoría (C7.6) con quién, cuándo, tipo, medio, monto y motivo.

C15.8 Offline: se puede registrar sin conexión (SQLite local, C1.5) y se sincroniza una sola vez (idempotency_key); la hora oficial es la del servidor al sincronizar.

### Criterios de aceptación:

☐ Toco "Retiro de caja", cargo $8.000, dejo Efectivo, elijo "Compra para el negocio", categoría Limpieza, motivo "lavandina y trapos" y adjunto la foto del ticket: el egreso queda en Limpieza, baja el saldo de Efectivo $8.000 y aparece como línea propia en el historial con mi usuario y la hora.

☐ Registro un "Retiro del dueño" de $50.000 en efectivo: baja el saldo de Efectivo, no suma a los egresos operativos del período y aparece aparte en los saldos y en el resumen de cierre.

☐ Registro un retiro "Otro" con motivo "cambio para el banco"; sin motivo no se guarda (web, API y bot).

☐ No puedo guardar un retiro con monto 0 ni sin tipo.

☐ Un empleado recién invitado no ve "Retiro de caja" y la API le responde 403; cuando el dueño le habilita el permiso, puede registrar retiros "Compra para el negocio" u "Otro", pero no "Retiro del dueño".

☐ No existe forma de editar ni borrar un retiro; lo revierto con motivo y el saldo vuelve a ser el de antes; en la auditoría veo quién lo registró, cuándo, el tipo y el motivo.

☐ En modo avión registro un retiro; al volver la conexión se sincroniza una sola vez.

### C16. Pago de sueldos (P0)

Descripción: registro de los pagos a empleados hechos desde la caja (sueldo, quincena, adelanto) como egreso de categoría "Sueldos" (origen sueldo). La caja no liquida sueldos (no calcula cargas sociales ni emite recibos): solo registra la plata que sale.

### Requerimientos:

C16.1 Botón "Pagar sueldo" en la caja (solo visible para el Dueño).

C16.2 Datos: empleado (un usuario del comercio, elegido de la lista, o un nombre libre si no tiene usuario; uno de los dos es obligatorio), período (ej.: "Octubre 2026", "1ra quincena de octubre"; obligatorio), monto (mayor a 0), medio de pago (cualquiera de los 5), comprobante opcional (foto o PDF, como C3.7), nota opcional, fecha y hora (del servidor) y quién lo registró.

C16.3 Se crea un egreso con categoría "Sueldos" (categoría del sistema), con empleado_user_id o empleado_nombre y periodo_sueldo; baja el saldo del medio elegido (C6.8). Los adelantos se registran igual, con el período al que corresponden.

C16.4 Historial y resumen de cierre: cada pago aparece como línea propia en el historial (ej.: "Sueldo — Juan — Octubre 2026 — $120.000 — Transferencia"), con filtro por empleado y período, y en el resumen de cierre (C12.5) en la línea "Sueldos".

C16.5 Permisos: solo el Dueño registra pagos de sueldos (no es configurable para empleados en el MVP); el backend rechaza el alta de otro rol. Un empleado no ve los pagos de sueldos de otros.

C16.6 Inmutable, auditado y offline: no se edita ni se borra (solo reversión, C7); el alta queda en la auditoría (C7.6) con quién, cuándo, empleado, período, monto y medio; funciona sin conexión y se sincroniza sin duplicar (C1.5).

### Criterios de aceptación:

☐ Como Dueño pago a Juan (usuario) $120.000 por transferencia, período "Octubre 2026": la caja muestra el egreso en Sueldos vinculado a Juan, baja el saldo de Transferencia y aparece en el resumen de cierre en la línea "Sueldos".

☐ Pago $40.000 en efectivo a "Carla (suplente)", que no tiene usuario, escribiendo el nombre libre; queda registrado con ese nombre.

☐ No puedo guardar un pago de sueldo sin empleado (usuario o nombre), sin período o con monto 0.

☐ Un empleado no ve "Pagar sueldo" y la API le responde 403.

☐ Filtro el historial por "Juan" y "Octubre 2026" y veo sus pagos y el total.

☐ No existe forma de editar ni borrar un pago de sueldo; lo revierto con motivo y queda en la auditoría.

☐ En modo avión registro un pago de sueldo; al volver la conexión se sincroniza una sola vez.

### C17. Entrega de turno entre empleados (P0)

Descripción: al cambiar de turno, dentro de la misma caja única, quien sale cuenta el efectivo del cajón y quien entra lo recibe y confirma (o lo rechaza) con su propio usuario. El sistema calcula cuánto efectivo debería haber, registra la diferencia y deja cada corte de turno como un registro inmutable. Es un control de efectivo en el momento de la entrega (y en el conteo sorpresa de efectivo que el dueño puede hacer, opcional y no diario), no el arqueo diario que se eliminó: no se cuenta stock, y si las entregas de turno están desactivadas el cierre de la jornada sigue sin ningún conteo (C12). Los medios electrónicos (Débito, Mercado Pago, QR, Transferencia bancaria) se muestran solo como información, sin conteo. Sigue habiendo una sola caja, un solo saldo y un solo cierre por jornada.

### Configuración (Dueño):

C17.1 Activar o desactivar las entregas de turno para todo el comercio. Por defecto se activan cuando el comercio tiene al menos un empleado invitado; un kiosco atendido por una sola persona las puede tener desactivadas y funciona exactamente como antes (sin conteos). [decisión propuesta: activadas si hay empleados]

C17.2 Tolerancia de diferencia en pesos (ej.: ±$500; por defecto ±$500, el dueño la cambia).

C17.3 Conteo a ciegas (recomendado, activado por defecto): quien entrega carga su conteo antes de ver el efectivo esperado, para no "acomodar" el número.

C17.4 Fondo de cambio fijo (ej.: $20.000; opcional): el monto que queda siempre en el cajón para dar vuelto, pasa de turno a turno y de un día al siguiente (precarga el monto inicial de la apertura, C2).

C17.5 Exigir recibir el turno para vender (activado por defecto cuando las entregas están activas): un empleado no puede registrar movimientos hasta recibir el turno (confirmar o poner en disputa); una entrega en disputa no bloquea la venta.

C17.6 Avisos por WhatsApp de diferencias (C10.3): apagados por defecto; los avisos en la app y en el resumen de cierre están siempre.

### Turnos y cortes:

C17.7 Turno: el primer turno de la jornada empieza en la apertura (C2); cada entrega cierra el turno en curso y abre el siguiente a cargo de quien recibe. Todo movimiento queda imputado al turno en curso (shift_id).

C17.8 Efectivo esperado en el cajón (calculado en el servidor con la misma función de dominio que C6) = efectivo inicial del turno (monto de apertura, o el efectivo contado y aceptado en la entrega anterior) + ingresos en efectivo − egresos en efectivo del turno (incluidos retiros de caja, sueldos, devoluciones y faltantes/sobrantes en efectivo) − resguardos del turno (C17.20).

C17.9 Resumen del turno: ventas por medio (los 5), entradas y salidas de efectivo, retiros de caja (C15), devoluciones (C14), resguardos, esperado, contado, diferencia, notas y estado.

### Conteo, diferencia y tolerancia:

C17.10 Conteo de quien entrega: total o, opcionalmente, por denominación (billetes de $20.000, $10.000, $2.000, $1.000, $500, $200, $100 y monedas; el sistema suma), indicando el fondo de cambio que queda en el cajón. Puede recontar todas las veces que quiera antes de confirmar; cada conteo queda guardado (handover_counts).

C17.11 Diferencia = contado − esperado (faltante en negativo, sobrante en positivo). Con conteo a ciegas, el esperado y la diferencia se muestran recién después de guardar el conteo.

C17.12 Dentro de la tolerancia: se registra como "diferencia menor" (nota opcional); no genera movimiento ni aviso inmediato, y aparece en el resumen de cierre y en el reporte por empleado.

C17.13 Fuera de la tolerancia: motivo obligatorio de quien entrega; aviso inmediato al dueño en la app (y por WhatsApp solo si lo activó) y línea en el resumen de cierre; y se registra la diferencia como movimiento propio de la caja (ingreso "Sobrante de caja" o egreso "Faltante de caja", medio Efectivo, origen diferencia_turno, vinculado a la entrega), para que el saldo de efectivo quede igual al contado y el turno siguiente arranque limpio.

C17.14 Nunca se cobra al empleado automáticamente: el dueño decide qué hacer con cada diferencia fuera de tolerancia (resolución "a cargo de [empleado]" o "absorbido por el negocio", con nota); la decisión queda en la auditoría y en el reporte por empleado. La caja no descuenta sueldos ni registra deudas.

### Recepción, rechazo y disputa:

C17.15 Confirmación de quien recibe con su propio usuario (inicia sesión o cambia de usuario en el mismo celular, según el PRD de autenticación): ve el conteo de quien entrega (y, con conteo a ciegas, puede hacer su propio conteo antes de verlo) y confirma → estado confirmada.

C17.16 Rechazo: si su conteo no coincide, quien recibe carga su propio conteo y rechaza → estado en disputa, con los dos conteos guardados. La venta sigue (no se bloquea el kiosco): el turno nuevo arranca a cargo de quien recibe, con su conteo como efectivo inicial provisorio.

C17.17 Resolución por el dueño: una entrega en disputa debe resolverla el Dueño: acepta uno de los dos conteos o pide un recuento (nuevo conteo, idealmente con los dos presentes) → estado resuelta. Al resolver se aplican la tolerancia y el movimiento de diferencia (C17.12 a C17.14) con el conteo aceptado. Las disputas sin resolver se ven en la caja y en el resumen de cierre.

C17.18 Mismo empleado en turnos seguidos: se permite la auto-entrega (quien entrega y quien recibe es la misma persona): es un corte con solo un conteo, sin confirmación de un tercero.

### Casos del kiosco:

C17.19 Fin del día sin nadie que reciba: la última entrega de la jornada, sin receptor, es el cierre de la jornada: con las entregas activadas, "Cerrar caja" (C12.2) pide el conteo final del último turno (corte sin receptor) y después cierra y genera el resumen de cierre. Si la jornada se cierra automáticamente (C12.1) sin conteo final, el último turno queda "sin conteo final" y se avisa al dueño. El snapshot del resumen de cierre no tiene campos de conteo propios: muestra los cortes de turno.

C17.20 Retiro a resguardo (sacar efectivo del cajón para la caja fuerte a mitad del turno): monto, quién, hora y nota; baja el efectivo esperado en el cajón pero no el saldo de Efectivo del negocio (la plata sigue siendo del comercio). El saldo de Efectivo se muestra como cajón + resguardo. No es un retiro de caja (C15) ni un gasto. Lo registran el Dueño y los Empleados habilitados (mismo permiso de retiros, apagado por defecto); el dueño registra el retiro del resguardo cuando lo deposita o lo devuelve al cajón.

C17.21 Conteo sorpresa de efectivo (opcional, no diario): el Dueño puede, cuando quiera, contar solo el efectivo del cajón sin cortar el turno (lo que en el kiosco se suele llamar "arqueo sorpresa"). Es opcional y puntual: el sistema nunca lo pide, no es parte del cierre ni de ninguna rutina diaria, no cuenta stock ni medios electrónicos, y por eso es compatible con que no haya arqueo diario (C12). Se registra como un corte de tipo conteo_sorpresa con esperado, contado y diferencia, con las mismas reglas de tolerancia (C17.12 a C17.14).

C17.22 Offline: entregas, conteos, recuentos, rechazos (disputas), resoluciones del dueño, resguardos y conteos sorpresa funcionan sin conexión (SQLite local, C1.5): el esperado se calcula con los movimientos locales y el servidor lo recalcula al sincronizar; si difiere (por movimientos de otro dispositivo), se guardan los dos valores y la entrega queda marcada para revisión del dueño. Se sincroniza una sola vez (idempotency_key); la hora oficial es la del servidor.

### Historial, visibilidad y auditoría:

C17.23 Historial de cortes de turno: cada corte es inmutable (quién entregó, quién recibió, inicio y fin del turno, ventas por medio, entradas y salidas de efectivo, retiros, devoluciones, resguardos, esperado vs. contado, diferencia, notas, estado y resolución); se lista y filtra por persona, fecha y estado (con diferencia, en disputa, sin conteo final) y se exporta a PDF (y CSV, C11.3).

C17.24 Reporte por empleado (Dueño): diferencias acumuladas por empleado en un período (cantidad de turnos, diferencias menores, faltantes y sobrantes fuera de tolerancia, total neto, resolución "a cargo de" o "absorbido").

C17.25 Visibilidad: quien recibe ve el resumen del turno anterior necesario para verificar el conteo (totales por medio y la lista de movimientos en efectivo), pero no ganancias, costos, márgenes ni saldos acumulados; el Dueño ve todo.

C17.26 Inmutable y auditado: los cortes y conteos no se editan ni se borran (los cambios de estado permitidos son pendiente → confirmada, pendiente → en disputa y en disputa → resuelta); todo queda en el log de auditoría (C7.6): cada conteo y recuento, la confirmación, el rechazo (con el conteo de quien recibe), la puesta en disputa, la resolución del dueño (conteo aceptado o recuento), el movimiento de faltante/sobrante, la decisión "a cargo de" / "absorbido", los resguardos, los conteos sorpresa y los cambios de configuración (activación, tolerancia, conteo a ciegas, fondo de cambio).

C17.27 Notificaciones de la entrega de turno: la caja emite al outbox (6.4) los eventos diferencia_turno (diferencia fuera de tolerancia en una entrega, cierre sin receptor o conteo sorpresa), entrega_en_disputa (y su resolución), entrega_sin_confirmar (pendiente más de N minutos, configurable) y turno_sin_conteo_final. El dueño los ve siempre en la app (al instante) y en el resumen de cierre; por WhatsApp (bot) y por email ("PRD - Notificaciones por Email para Sistema de Inventario") solo si los activó (C17.6, C10.5). Las diferencias menores no generan aviso inmediato.

### Criterios de aceptación:

☐ Ana abrió con $10.000, cobró $35.000 en efectivo y pagó $2.500 en efectivo. Con conteo a ciegas, toca "Entregar turno", carga $42.000 sin ver el esperado y recién al guardar ve "Esperado $42.500 — Diferencia −$500".

☐ Con tolerancia ±$500, esa diferencia queda como "diferencia menor", sin movimiento ni aviso inmediato, y aparece en el resumen de cierre y en el reporte de Ana.

☐ Si Ana cuenta $41.000 (−$1.500, fuera de tolerancia), no puede confirmar sin motivo; al confirmar, la caja registra un egreso "Faltante de caja $1.500 — Efectivo" vinculado a la entrega, el saldo de Efectivo queda igual al contado, el turno de Juan arranca en $41.000 y el dueño recibe el aviso en la app al instante (por WhatsApp solo si lo activó).

☐ Un sobrante de $2.000 fuera de tolerancia genera un ingreso "Sobrante de caja $2.000 — Efectivo".

☐ El sistema no descuenta nada a Ana; el dueño marca la diferencia "a cargo de Ana" o "absorbido" con una nota, y la decisión queda en la auditoría y en el reporte por empleado.

☐ Cargo el conteo por denominación (2 de $20.000, 1 de $2.000) y el sistema suma $42.000; recuento antes de confirmar y quedan guardados los dos conteos.

☐ La pantalla de entrega muestra lo cobrado por Débito, Mercado Pago, QR y Transferencia en el turno, sin campos de conteo para esos medios.

☐ Juan confirma con su propio usuario y la entrega queda "confirmada" con quién entregó, quién recibió, horas, esperado, contado, diferencia, notas y resumen del turno.

☐ Juan cuenta $40.000 y rechaza: la entrega queda "en disputa" con los dos conteos, Juan puede seguir vendiendo, y el dueño ve la disputa y la resuelve aceptando un conteo o pidiendo un recuento; queda "resuelta" y se aplica la tolerancia con el conteo aceptado.

☐ Juan, al recibir, ve los totales por medio y los movimientos en efectivo del turno de Ana, pero no ganancias, costos ni saldos acumulados.

☐ Con "exigir recibir el turno" activado, Juan no puede registrar una venta hasta confirmar o poner en disputa la entrega.

☐ Ana trabaja dos turnos seguidos: hace una auto-entrega con un solo conteo y sin confirmación de otra persona.

☐ Con entregas activadas, al tocar "Cerrar caja" sin nadie que reciba, se me pide el conteo final del último turno y después se cierra la jornada; si la jornada se cierra automáticamente sin conteo, el último turno figura "sin conteo final" y el dueño recibe el aviso.

☐ Con entregas desactivadas, la jornada se cierra sin ningún conteo, igual que antes (C12).

☐ Registro un retiro a resguardo de $30.000 a mitad del turno: el esperado del cajón baja $30.000, el saldo de Efectivo del negocio no cambia (se ve "cajón + resguardo") y no aparece como gasto.

☐ Con fondo de cambio de $20.000, la entrega muestra el fondo que queda en el cajón y la apertura del día siguiente viene precargada con $20.000.

☐ El dueño hace un conteo sorpresa de efectivo: cuenta solo el efectivo, ve esperado y diferencia, y el turno en curso sigue sin cortarse; el sistema nunca pide ese conteo por su cuenta ni lo agrega al cierre.

☐ En modo avión hago la entrega, la recepción o el rechazo; al volver la conexión se sincroniza una sola vez y, si el esperado del servidor es distinto, la entrega queda marcada para revisión.

☐ El historial de cortes se filtra por persona, fecha y estado y se exporta a PDF; el reporte por empleado acumula sus diferencias del período.

☐ Ni desde la app ni desde la API puedo editar o borrar un corte de turno o un conteo (verificado con tests automáticos); solo se permiten las transiciones de estado definidas.

☐ En la auditoría de una entrega en disputa veo los dos conteos, quién rechazó y cuándo, cómo la resolvió el dueño, el faltante registrado y la decisión "a cargo de" o "absorbido".

☐ Con una diferencia fuera de tolerancia o una entrega en disputa, el dueño ve el aviso en la app al instante; si activó WhatsApp y email, también le llega por los dos canales; una diferencia menor no genera aviso inmediato.

☐ Hago una entrega en modo avión y quien recibe la rechaza también sin conexión: al sincronizar, la entrega queda "en disputa" con los dos conteos, una sola vez, y el dueño recibe el aviso.

### C18. Fiado: venta a cuenta y cobro de fiado, lado caja (P0)

Descripción: el kiosco vende "a cuenta" (fiado) a clientes de confianza. La cuenta corriente de cada cliente (alta del cliente, saldo, tope, vencimientos, recordatorios, permisos para anotar y cobrar) la define el "PRD - Fiado y Cuenta Corriente de Clientes" (en redacción). Este PRD define solo cómo se refleja en la caja: la venta a cuenta no es plata que entró, y el cobro del fiado sí lo es.

### Requerimientos:

C18.1 Opción "A cuenta (fiado)" en la venta: al registrar el cobro de una venta (alta rápida C3.2, "Registrar cobro" C8.8 o el ticket de venta), además de los 5 medios aparece "A cuenta (fiado)", que pide el cliente (según el PRD de fiado). No es un medio de caja (C4.7).

C18.2 La venta a cuenta no entra a la caja: no crea ningún ingreso en cash_movements, no suma a los saldos por medio ni al total (C6), ni al efectivo esperado del turno (C17.8), ni a los ingresos del resumen de cierre. La deuda queda registrada en la cuenta del cliente (PRD de fiado). El resumen de cierre la muestra solo como dato informativo ("Ventas a cuenta: $X, N ventas").

C18.3 Cobro de fiado: cuando el cliente paga (total o parcial), se registra un ingreso de categoría "Cobro de fiado" (origen cobro_fiado), por cualquiera de los 5 medios, vinculado al cliente (cliente_fiado_id) y, si corresponde, a las ventas a cuenta que cancela (referencia del PRD de fiado). Sube el saldo del medio elegido; si es en efectivo, suma al esperado del turno (C17.8).

C18.4 Monto: mayor a 0 y no mayor al saldo adeudado del cliente (la validación del saldo la hace el dominio de fiado en la misma transacción que el ingreso). El cobro y la baja del saldo del cliente ocurren en una sola transacción: no puede quedar un cobro sin baja de deuda ni al revés.

C18.5 Separado de las ventas: los cobros de fiado son ingresos, pero se muestran en una línea aparte "Cobros de fiado" en los saldos del período (C6) y en el resumen de cierre (C12.5), sin sumarse al total de ventas cobradas del día (la venta ya se contó en el día en que se fió, como venta a cuenta).

C18.6 Permisos: registrar cobros de fiado lo hacen el Dueño y los Empleados según la matriz AU4 del PRD de autenticación (permiso "cobrar fiado", definido junto con los de anotar y tope en el PRD de fiado).

C18.7 Inmutable y auditado: el cobro es un movimiento como cualquier otro (C3.5, C7): no se edita ni se borra; un error se corrige con una reversión, que vuelve a subir la deuda del cliente en la misma transacción. Alta y reversión quedan en el log de auditoría (C7.6) con quién, cuándo, cliente, monto y medio.

C18.8 Offline: las ventas a cuenta y los cobros de fiado se pueden registrar sin conexión (SQLite local, C1.5) y se sincronizan una sola vez (idempotency_key). Si al sincronizar el cobro supera la deuda vigente (por ejemplo, otro celular ya cobró), el cobro se guarda igual (la plata ya entró), el excedente queda como saldo a favor del cliente según el PRD de fiado y el dueño recibe un aviso para revisarlo.

C18.9 Avisos: cada cobro de fiado emite el evento cobro_fiado (opcional para el dueño: en la app siempre, por WhatsApp y email según su preferencia, C10.5); los avisos de fiado vencido o sobre el tope los define el PRD de fiado.

### Criterios de aceptación:

☐ Vendo $5.000 "A cuenta (fiado)" a Doña Rosa: no aparece ningún ingreso en la caja, los saldos y el efectivo esperado del turno no cambian, y la deuda queda en su cuenta (PRD de fiado).

☐ El resumen de cierre del día muestra "Ventas a cuenta: $5.000 (1 venta)" como dato informativo, fuera de los ingresos.

☐ Al otro día Doña Rosa paga $3.000 por QR: la caja registra un ingreso "Cobro de fiado — Doña Rosa — $3.000 — QR", el saldo de QR sube $3.000 y su deuda baja a $2.000.

☐ Puedo registrar el cobro por cualquiera de los 5 medios; en efectivo, suma al esperado del turno.

☐ No puedo registrar un cobro de fiado de $0 ni mayor a la deuda vigente del cliente (online).

☐ El resumen de cierre muestra "Cobros de fiado: $3.000 (QR $3.000)" como línea aparte y el total de ventas del día no incluye ese cobro.

☐ No existe forma de editar ni borrar un cobro de fiado; al revertirlo, la deuda del cliente vuelve a $5.000 y ambos movimientos quedan en la auditoría.

☐ En modo avión registro una venta a cuenta y un cobro de fiado; al volver la conexión se sincronizan una sola vez.

☐ Con el aviso de cobros de fiado activado, recibo "Doña Rosa pagó $3.000 de su fiado (QR)".

## 5. Flujos de usuario (continuación)

### Flujo 15: retiro de caja para una compra del negocio

A media tarde se terminan los rollos de ticket y la empleada (con el permiso de retiros habilitado por el dueño) sale a comprarlos al bazar de enfrente.

Toca "Retiro de caja", carga $6.500, deja Efectivo, elige "Compra para el negocio", categoría Insumos, motivo "rollos de ticket", y saca la foto del ticket.

Guarda (aunque no haya señal: se sincroniza después). El saldo de Efectivo baja $6.500 y el historial muestra "Retiro de caja — Compra para el negocio (Insumos) — $6.500 — Efectivo — Ana".

Al cierre, el resumen muestra "Retiros de caja: $6.500 (Compra para el negocio $6.500)". Si un empleado sin el permiso intenta hacerlo, no ve el botón.

### Flujo 16: pago de sueldo

El último día del mes, el dueño le paga a Juan su sueldo de octubre.

En "Caja" toca "Pagar sueldo", elige a Juan de la lista de usuarios, escribe el período "Octubre 2026", carga $120.000 y elige Transferencia; adjunta la captura de la transferencia.

Confirma. La caja registra el egreso en Sueldos vinculado a Juan y el saldo de Transferencia baja $120.000.

Al cierre, el resumen muestra la línea "Sueldos: $120.000 (Transferencia)". Si se equivocó, revierte el pago y lo vuelve a cargar.

### Flujo 17: entrega de turno entre empleados (conteo a ciegas)

A las 15:00 termina el turno de Ana (abrió a las 08:05 con $10.000; fondo de cambio $20.000) y llega Juan.

Ana toca "Entregar turno" y cuenta el cajón por billetes sin ver el esperado (conteo a ciegas): $42.000.

Al guardar ve "Esperado $42.500 — Diferencia −$500": está dentro de la tolerancia de ±$500, queda como "diferencia menor" y agrega la nota "di mal un vuelto".

Juan inicia sesión con su usuario en el mismo celular, ve el resumen del turno de Ana (totales por medio y movimientos en efectivo, sin ganancias ni costos), cuenta y toca "Recibir turno".

Queda el corte "confirmado"; desde ese momento los movimientos son del turno de Juan, que arranca con $42.000. Los cobros electrónicos del turno se ven solo como información.

Si la diferencia hubiera sido −$1.500 (fuera de tolerancia), Ana debe escribir el motivo, la caja registra un egreso "Faltante de caja $1.500", el dueño recibe el aviso en la app al instante y después decide "a cargo de Ana" o "absorbido". Nunca se le descuenta nada automáticamente.

### Flujo 18: entrega rechazada y en disputa

Ana entrega el turno con un conteo de $42.000.

Juan cuenta $40.000, carga su conteo y toca "Rechazar". La entrega queda "en disputa" con los dos conteos y Juan sigue vendiendo.

El dueño ve la disputa en la caja (y en el resumen de cierre si no la resolvió), pide un recuento con los dos presentes, que da $40.000, y lo acepta.

La entrega queda "resuelta"; como −$2.500 supera la tolerancia, se registra el faltante como movimiento y el dueño anota "absorbido, error de vuelto". Todo queda en la auditoría.

### Flujo 19: fin del día, resguardo y conteo sorpresa de efectivo

A las 18:00 Juan saca $30.000 del cajón para la caja fuerte y registra un "Retiro a resguardo": baja el esperado del cajón, no el saldo de Efectivo del negocio.

A las 19:00 el dueño pasa y, porque quiere (no es obligatorio ni diario), hace un conteo sorpresa de efectivo: cuenta solo el efectivo del cajón, ve que coincide con el esperado y el turno de Juan sigue.

A las 21:40 Juan toca "Cerrar caja": como no viene nadie, se le pide el conteo final del turno (corte sin receptor), y después se cierra la jornada y se genera el resumen de cierre con una línea por turno.

El fondo de cambio de $20.000 queda en el cajón y precarga la apertura del día siguiente.

### Flujo 20: venta a cuenta (fiado) y cobro

Doña Rosa compra por $5.000 y pide que se lo anoten. El empleado elige "A cuenta (fiado)" y la busca en la lista de clientes (PRD de fiado).

La venta queda en la cuenta de Doña Rosa; la caja no registra ningún ingreso y el efectivo esperado del turno no cambia.

Dos días después Doña Rosa paga $3.000 en efectivo. El empleado entra a su cuenta y toca "Cobrar", carga $3.000 y elige Efectivo.

La caja registra el ingreso "Cobro de fiado — Doña Rosa — $3.000 — Efectivo"; el saldo de Efectivo y el esperado del turno suben $3.000 y la deuda baja a $2.000.

Al cierre, el resumen muestra "Cobros de fiado: $3.000 (Efectivo)" aparte de las ventas, y el dueño recibe el aviso si lo tiene activado.

## 6. Notas técnicas (adiciones de la Parte 2)

### 6.2 Modelo de datos (adiciones)

Estas tablas se suman a las de la sección 6.2 de la Parte 1 (los campos nuevos de cash_movements y closing_summaries para C15 a C18 están en esas filas de la Parte 1).

### 6.3 Reglas de integridad (adiciones)

Se suman a las reglas base de la sección 6.3 (Parte 3).

Retiros de caja (C15). Un CHECK exige que origen = 'retiro_caja' tenga tipo egreso, tipo_retiro y motivo no vacío (sin solo espacios), y que tipo_retiro solo exista con ese origen; retiro_dueno usa la categoría "Retiro del dueño", otro usa "Otros egresos" y compra_negocio una categoría de egreso operativa (no del sistema). El backend valida el permiso del empleado (AU4, apagado por defecto) y rechaza retiro_dueno registrado por un Empleado. Inmutables como cualquier movimiento; el insert registra en cash_audit_log quién, cuándo, tipo, medio, monto y motivo.

Pagos de sueldos (C16). Un CHECK exige que origen = 'sueldo' tenga tipo egreso, categoría "Sueldos", periodo_sueldo no vacío y empleado_user_id o empleado_nombre; la categoría "Sueldos" solo se usa con ese origen. Solo el rol Dueño puede insertarlos (validado en el backend). Inmutables y auditados.

Entregas de turno (C17). shift_handovers y handover_counts solo admiten INSERT; en shift_handovers un trigger permite únicamente las transiciones pendiente → confirmada, pendiente → en_disputa y en_disputa → resuelta (con los campos de recepción o resolución) y el registro de la decisión del dueño sobre la diferencia, y rechaza cualquier otro UPDATE y todo DELETE. CHECK: diferencia_centavos = efectivo_contado_centavos − efectivo_esperado_centavos; motivo_diferencia no vacío cuando clasificacion_diferencia = 'fuera_de_tolerancia'; recibido_por vacío solo en cierre_sin_receptor y conteo_sorpresa, e igual a entregado_por solo en auto_entrega. El esperado se calcula en el servidor con bloqueo de la jornada; índice único (cash_day_id, turno_nro) y a lo sumo una entrega pendiente por jornada. El faltante/sobrante fuera de tolerancia se inserta en cash_movements (categorías del sistema "Faltante de caja" / "Sobrante de caja", origen diferencia_turno) en la misma transacción que la confirmación o la resolución; nunca se crea un movimiento a cargo del empleado. Los resguardos (cash_drawer_drops) no son movimientos de caja: cambian el esperado del cajón, no los saldos. Cada corte registra en cash_audit_log y emite el evento entrega_turno (y diferencia_turno fuera de tolerancia) en el outbox.

Fiado (C18). Una venta "A cuenta (fiado)" no inserta nada en cash_movements (la registra el dominio de fiado). Un CHECK exige que origen = 'cobro_fiado' tenga tipo ingreso, categoría "Cobro de fiado" y cliente_fiado_id, y que esa categoría solo se use con ese origen. El ingreso y la baja de la deuda del cliente se hacen en una sola transacción (con bloqueo de la cuenta del cliente); la reversión del cobro vuelve a subir la deuda en la misma transacción. Cada cobro registra en cash_audit_log y emite cobro_fiado en el outbox.

Tabla | Campos principales
--- | ---
shift_handovers (cortes de turno, C17) | id (UUID), fecha_jornada, cash_day_id, turno_nro, tipo (entrega / auto_entrega / cierre_sin_receptor / conteo_sorpresa), entregado_por (user_id), recibido_por (user_id, nullable: vacío en cierre sin receptor y conteo sorpresa; igual a entregado_por en la auto-entrega), turno_inicio_at y turno_fin_at (timestamptz), entregado_at y recibido_at (timestamptz, hora del servidor), estado (pendiente / confirmada / en_disputa / resuelta), efectivo_inicial_centavos, efectivo_esperado_centavos, conteo_aceptado_id (handover_counts), efectivo_contado_centavos (el conteo aceptado), diferencia_centavos (contado − esperado), tolerancia_centavos (vigente al momento), clasificacion_diferencia (sin_diferencia / menor / fuera_de_tolerancia), motivo_diferencia (obligatorio fuera de tolerancia), movimiento_diferencia_id (nullable: el faltante/sobrante en cash_movements), resolucion_dueno (a_cargo_de / absorbido, nullable), resolucion_user_id (empleado a cargo, nullable), resolucion_nota, resuelto_por, resuelto_at, fondo_cambio_centavos, resguardos_centavos, resumen_turno (JSON en centavos: ventas por medio, entradas y salidas de efectivo, retiros, devoluciones), nota_entrega, nota_recepcion, esperado_servidor_centavos y requiere_revision (offline), sin_conteo_final (boolean), idempotency_key (único), created_at
handover_counts (conteos de efectivo, C17) | id, handover_id, contado_por (user_id), rol_conteo (entrega / recepcion / recuento / dueno), total_centavos, denominaciones (JSON nullable: denominación → cantidad; opcional), a_ciegas (boolean: se cargó antes de ver el esperado), counted_at (timestamptz), idempotency_key (único), created_at
cash_drawer_drops (retiros a resguardo, C17.20) | id, shift_handover_id o turno en curso, monto_centavos, tipo (a_resguardo / desde_resguardo), user_id, nota, created_at (timestamptz), idempotency_key (único)
