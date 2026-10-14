> Origen: `PRD - Fiado y Cuenta Corriente de Clientes para Sistema de Inventario.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/credit`, `src/pages/api/credit/*`, `src/db/schema-credito.ts`

---

# PRD - Fiado y Cuenta Corriente de Clientes para Sistema de Inventario

Principio rector: todo se opera al 100% desde el celular, con y sin conexión, salvo las acciones sensibles que piden conexión (OF9.5).

Herramientas deterministas. Saldos, antigüedad, días de atraso, topes, imputación de pagos y reportes son cálculos con reglas fijas sobre movimientos en centavos. Sin IA ni "scoring".

Alineación con las decisiones del 9/10/2026. Este PRD es el que referencian como "en redacción" C18 (Caja), AU4.10 (Autenticación), OF16.1 (Offline) y NE17.4 (Notificaciones). Respeta lo ya decidido ahí: "A cuenta (fiado)" no es un medio de caja ni ingreso; los cobros entran como "Cobro de fiado"; el Empleado vende a cuenta dentro del tope, cobra y ve solo el saldo del cliente que atiende; solo el Dueño cambia topes, da de baja deudas y supera un tope; offline el tope se controla contra el saldo local y un pago de más queda como saldo a favor marcado para revisar. No modifica otros documentos.

Datos externos: lo marcado [a verificar] (Meta, Ley 25.326/AAIP, fiscal) se confirma con la fuente oficial, el contador o el abogado antes de implementar.

## 1. Resumen

### 1.1 Problema

En el kiosco de barrio el fiado es parte del negocio: el vecino de siempre se lleva la leche y "lo anotás". Hoy eso vive en un cuaderno:

El comerciante no sabe cuánto le deben en total ni desde cuándo.

Las anotaciones se pierden o no coinciden con lo que recuerda el cliente, y hay discusiones.

No hay tope: algunos clientes acumulan deudas que después no se cobran.

Cobrar da vergüenza; un mensaje con el saldo exacto y el detalle lo hace más fácil.

Cuando fía el empleado, el dueño se entera tarde.

Los PRD actuales cubren la cuenta corriente con proveedores; del lado de los clientes solo existe el reflejo en caja (C18).

### 1.2 Visión

Reemplazar el cuaderno por una cuenta corriente por cliente integrada a la venta: al cobrar se elige "A cuenta (fiado)" y el cliente. El stock baja como en cualquier venta, la deuda queda con el detalle del ticket y, cuando el cliente paga (todo o una parte, por cualquiera de los cinco medios), la plata entra a la caja como "Cobro de fiado". El dueño ve quién debe, cuánto y desde cuándo, y manda el saldo por WhatsApp con un toque.

### 1.3 Propuesta de valor

Dueño: saber cuánto tiene "en la calle", poner topes y ver la deuda vieja en el resumen del viernes.

Empleado: anotar un fiado en segundos, sin cuaderno ni cuentas.

Cliente del comercio: un estado de cuenta claro con cada compra y cada pago.

### 1.4 Alcance

v1 (MVP): clientes con datos mínimos, venta a cuenta, saldo y estado de cuenta, cobros parciales, tope por cliente, antigüedad y días de atraso, recordatorio por el WhatsApp del comerciante (wa.me), permisos, devoluciones, ajustes y saldo del cuaderno, deuda incobrable, offline, reportes, avisos al dueño y la línea del resumen del viernes.

Después (P1/P2): recordatorios desde el número central (plantilla paga con consentimiento), pago mixto en la venta, día fijo de pago, fusión de duplicados, importación CSV, cadena de hashes.

Fuera de alcance: intereses, recargos y actualización por inflación (el dueño: "la inflación viene después").

## 2. Objetivos y no-objetivos

### 2.1 Objetivos

Registrar una venta a cuenta en menos de 10 segundos más que una venta normal.

Que el saldo de cada cliente sea siempre la suma de sus movimientos (append-only), verificable y auditado.

Que los cobros entren a la caja única con su medio y la categoría "Cobro de fiado", y que las ventas a cuenta no inflen los saldos de caja (C18.2).

Visibilidad para el dueño: total adeudado, antigüedad 0–30 / 31–60 / más de 60 días y principales deudores.

Mandar el saldo por WhatsApp sin costo por defecto (wa.me).

Funcionar offline con el tope controlado contra el saldo local (OF16.1).

Cumplir la Ley 25.326 con datos mínimos y finalidad clara.

### 2.2 No-objetivos (al menos en v1)

Intereses, recargos por mora o actualización por inflación o índice. La deuda queda en pesos nominales al precio de la venta.

Re-precio de la deuda cuando cambia el precio del producto (PRD de Gestión de Precios).

Crédito formal, cuotas, scoring o consulta a bases de riesgo.

Cobranza judicial o derivación a estudios.

Portal del cliente con login (ve su estado de cuenta solo con el link que le manda el comercio).

Listas de "morosos" compartidas entre comercios: cada comercio tiene sus clientes en su propia base.

Cambiar la obligación fiscal de la venta (FC17).

Cobro automático o links de pago generados por la plataforma.

## 3. Usuarios

### 3.1 Dueño/a (rol Dueño)

Decide a quién fiarle y hasta cuánto. Es el único que cambia topes, supera un tope en una venta, hace ajustes, da de baja deuda incobrable y ve el listado de saldos y los reportes (AU4.10).

### 3.2 Empleado/a (rol Empleado)

Por defecto (✅⚙️, restringible por el Dueño) vende a cuenta dentro del tope y cobra fiado. Al vender o cobrar ve solo el saldo del cliente que atiende; no ve el listado de saldos ni el total adeudado (AU4.10).

### 3.3 Cliente del comercio (titular de la cuenta, no usuario)

No usa la app: recibe por WhatsApp su estado de cuenta o el comprobante de pago. Es el titular de los datos personales (Ley 25.326).

### 3.4 Administrador de la plataforma

No ve datos de clientes de los comercios; solo métricas agregadas y anónimas de uso del módulo. Soporte en modo lectura con consentimiento (PRD principal 6.4).

## 4. Funcionalidades

### 4.0 Priorización

### FC1. Ficha de clientes (P0)

Descripción: cada comercio tiene su lista de clientes con los datos mínimos para saber a quién se le fía. No es un CRM ni se usa para marketing.

### Requerimientos:

FC1.1 Campos: nombre (obligatorio, texto libre, ej. "Carlos (el de la esquina)"), teléfono (opcional, recomendado; normalizado a E.164 con +54 por defecto, como TV11.2), DNI (opcional), notas (opcional, hasta 280 caracteres).

FC1.2 Crédito: tope (FC6) y plazo en días (FC7); por defecto heredan la configuración del comercio.

FC1.3 Estado: activo, bloqueado para fiar (se le puede cobrar, no venderle a cuenta) o archivado (no aparece al vender; conserva el historial). No se archiva un cliente con saldo distinto de cero.

FC1.4 Alta rápida desde la venta: "+ Nuevo cliente" pide solo nombre y teléfono, sin salir de la venta. La puede hacer el Dueño y, por defecto, el Empleado con permiso de vender a cuenta (decidido por el dueño el 9/10/2026, ver 7.3; a sumar a AU4.10). El cliente nace sin tope (FC6.1).

FC1.5 Búsqueda: por nombre (parcial, sin tildes), por teléfono (últimos dígitos) y por DNI (exacto). Primero los clientes con fiado reciente.

FC1.6 Duplicados: si el teléfono o el DNI ya existen, la app avisa "Ya existe Carlos Pérez con ese teléfono" y ofrece usarlo. (P1) Fusión por el Dueño, con trazabilidad.

FC1.7 Datos mínimos (FC16): no se piden domicilio, email ni fecha de nacimiento. Las notas avisan "No anotes datos sensibles (salud, religión, etc.)".

FC1.8 Edición: solo el Dueño edita la ficha (datos maestros); cada cambio va al log de auditoría con valor anterior y nuevo. Los movimientos de la cuenta nunca se editan.

### Criterios de aceptación:

☐ Desde el celular, al cobrar elijo "A cuenta (fiado)", toco "+ Nuevo cliente", escribo "Carlos" y "11 2345-6789" y vuelvo a la venta con Carlos elegido en menos de 15 segundos.

☐ Si intento dar de alta otro cliente con +54 9 11 2345-6789, la app me ofrece usar la ficha existente.

☐ Puedo guardar un cliente solo con nombre (el DNI no es obligatorio).

☐ No puedo archivar un cliente que debe $3.200.

☐ Cambio el teléfono de un cliente y en la auditoría veo el valor anterior (enmascarado), el nuevo, quién y cuándo.

### FC2. Venta a cuenta (P0)

Descripción: al confirmar una venta, además de los cinco medios aparece "A cuenta (fiado)" (C18.1). No es un medio de caja (C4.7): es una forma de cobro diferido que registra la deuda en la cuenta del cliente.

### Requerimientos:

FC2.1 Opción en el cobro: en la pantalla de cobro (TV5.1) aparece "A cuenta (fiado)" si el módulo está activo y el usuario tiene permiso (FC9). Pide el cliente (FC1.5) y muestra su saldo y su disponible antes de confirmar.

FC2.2 Stock: se descuenta igual que en cualquier venta (egreso por venta inmutable con sale_id, F3; lotes según F12).

FC2.3 Caja: no crea ingreso en cash_movements, no suma a los saldos por medio, al total, al efectivo esperado del turno ni a los ingresos del cierre (C18.2). En el cierre figura solo como dato informativo "Ventas a cuenta: $X, N ventas".

FC2.4 Cuenta del cliente: en la misma transacción se inserta un movimiento venta_a_cuenta (debe) por el total del ticket (con descuentos, TV4), vinculado al ticket.

FC2.5 Precio congelado: la deuda es el importe del ticket en pesos; los aumentos posteriores (PRD de Gestión de Precios) no la cambian. Sin intereses ni recargos.

FC2.6 Tope: antes de confirmar se evalúa saldo + total contra el tope (FC6).

FC2.7 Cliente bloqueado o archivado: no se le vende a cuenta; la app lo dice y ofrece los otros medios.

FC2.8 Ganancia y reportes de ventas: la venta cuenta en su fecha con su ganancia normal (F7); el fiado no cambia costo ni margen.

FC2.9 Entrega parcial en el momento: si el cliente deja una parte ("te dejo $2.000 y anotame el resto"), en el MVP se confirma la venta a cuenta por el total y, desde la pantalla de confirmación, "Registrar entrega" abre el cobro (FC5) precargado. (P1) Con el pago dividido (TV5.5), una sola operación.

FC2.10 Idempotencia: la venta y su movimiento de cuenta usan una idempotency_key derivada del op_id de la venta.

### Criterios de aceptación:

☐ Vendo 1 leche ($1.850) y 1 pan ($2.400) a cuenta de Carlos: el stock baja, su cuenta suma $4.250 y la caja no registra ningún ingreso.

☐ El resumen de cierre de ese día muestra "Ventas a cuenta: $4.250 (1 venta)" fuera de los ingresos.

☐ Si la venta falla, no queda ni el movimiento de stock ni la deuda.

☐ Un reintento con la misma idempotency_key no duplica la deuda.

☐ Después de un aumento masivo del 10%, la deuda sigue en $4.250.

### FC3. Ticket de la venta a cuenta (P0)

### Requerimientos:

FC3.1 El ticket muestra "Pago: A cuenta (fiado) $4.250,00" y el nombre del cliente (congelado). No muestra teléfono ni DNI.

FC3.2 Lleva la leyenda no fiscal de TV7 ("DOCUMENTO NO VÁLIDO COMO FACTURA" [a verificar]) y "Venta a cuenta corriente. El saldo se informa en el estado de cuenta".

FC3.3 Se comparte igual que cualquier ticket (wa.me, PDF, imagen, link; TV9 a TV11); si el cliente tiene teléfono, wa.me lo precarga.

FC3.4 Historial de tickets (TV8) con filtro "A cuenta (fiado)" y por cliente.

FC3.5 Inmutable (TV6.4): se corrige con devolución o anulación (FC10).

FC3.6 (P1) "Saldo después de esta compra" en el ticket, configurable y apagado por defecto (el saldo vigente está en el estado de cuenta).

### Criterios de aceptación:

☐ El ticket dice "Pago: A cuenta (fiado) $4.250,00", "Cliente: Carlos" y la leyenda no fiscal.

☐ Filtro el historial por "A cuenta (fiado)" y "Carlos" y veo solo sus ventas a cuenta.

☐ El link público del ticket no muestra teléfono ni DNI.

### FC4. Saldo y estado de cuenta (P0)

Descripción: el saldo es siempre la suma de los movimientos; el estado de cuenta los muestra uno por uno.

### Requerimientos:

FC4.1 Tipos de movimiento: saldo_inicial (debe), venta_a_cuenta (debe), cobro (haber), devolucion (haber), ajuste_debito (debe), ajuste_credito (haber), incobrable (haber), reversion (contra-asiento de otro movimiento).

FC4.2 Saldo derivado: saldo = Σ debe − Σ haber, en centavos. El caché por cliente se actualiza en la misma transacción y un job nocturno verifica que coincida con la suma (6.3).

FC4.3 Saldo a favor: online, cobros, devoluciones y ajustes no pueden dejar el saldo negativo (C18.4). Solo puede quedar negativo (saldo a favor del cliente) por operaciones offline al sincronizar (FC13.5); se muestra en verde como "A favor: $1.000", con la marca "saldo negativo, revisar" hasta que el Dueño lo resuelve. Una venta a cuenta posterior lo consume naturalmente.

FC4.4 Pantalla de la cuenta (Dueño): saldo, antigüedad y días de atraso (FC7), tope y disponible (FC6), botones "Cobrar", "Mandar saldo por WhatsApp" y "Ajuste". Para el Empleado, al vender o cobrar: nombre, saldo y disponible de ese cliente (AU4.10).

FC4.5 Estado de cuenta: lista con fecha y hora, tipo, detalle (n.º de ticket con sus productos, medio del cobro, motivo del ajuste), debe, haber y saldo corrido. MVP: últimos 90 días y "ver todo"; (P1) filtro por período con saldo anterior.

FC4.6 Inmutable: nada se edita ni se borra; un error se corrige con reversión (motivo obligatorio, solo Dueño, online), como C7. Revertir un cobro revierte su ingreso de caja en la misma transacción (C18.7).

FC4.7 Estado de cuenta para el cliente: link público con token no adivinable, vencimiento (por defecto 30 días) y revocación, con el mismo mecanismo del link del ticket (TV9), y PDF. Muestra comercio, nombre del cliente, saldo, movimientos de los últimos 90 días y "Documento interno, no válido como factura". Sin teléfono, DNI ni notas.

FC4.8 Listado de clientes con saldo (solo Dueño): ordenable por saldo, antigüedad y nombre, con el total adeudado arriba.

### Criterios de aceptación:

☐ Carlos tiene saldo inicial $5.000, una venta a cuenta de $4.250 y un cobro de $3.000: su saldo es $6.250 y el saldo corrido muestra $5.000 → $9.250 → $6.250.

☐ Toco el renglón de la venta y veo el ticket con sus productos.

☐ Un UPDATE o DELETE sobre los movimientos de cuenta es rechazado por la base (test automático).

☐ El link del estado de cuenta abre sin login, vence a los 30 días y, si lo revoco, deja de abrir.

☐ El job nocturno detecta (prueba controlada) un caché de saldo distinto de la suma y alerta sin corregirlo solo.

### FC5. Cobros de fiado (pagos parciales) (P0)

Descripción: el cliente paga todo o una parte por cualquiera de los cinco medios. El cobro baja su saldo y entra a la caja como ingreso "Cobro de fiado" (C18.3).

### Requerimientos:

FC5.1 Dónde: desde la cuenta del cliente, el listado de deudores (Dueño) y "Vender" → "Cobrar fiado" (buscando al cliente), además del atajo de FC2.9.

FC5.2 Datos: monto (precargado con el saldo, editable), medio (los 5, salvo los desactivados, C4.3) y nota opcional. En efectivo, "Paga con" y vuelto opcionales (TV5.3).

FC5.3 Monto: mayor a 0 y no mayor al saldo (C18.4). Si el cliente quiere dejar más, en el MVP se cobra el saldo exacto; (P1) pago adelantado voluntario como saldo a favor.

FC5.4 Caja: ingreso en cash_movements con categoría del sistema "Cobro de fiado", origen cobro_fiado, el medio elegido y cliente_fiado_id (C18.3). Sube el saldo del medio y, en efectivo, el esperado del turno (C17.8). Va en la línea aparte "Cobros de fiado" de saldos y cierre, sin sumar a las ventas del día (C18.5).

FC5.5 Transacción única: el movimiento cobro de la cuenta y el ingreso de caja, en una sola transacción con la misma idempotency_key (C18.4).

FC5.6 Reversión: solo Dueño, online; revierte el ingreso y vuelve a subir la deuda juntos (C18.7).

FC5.7 Imputación: a las deudas más viejas primero (FIFO, FC7.1); es un cálculo derivado.

FC5.8 Comprobante de cobro: documento no fiscal "Cobro N.º 000045" (numeración propia, como TV3.8) con fecha y hora, cliente, monto, medio, saldo anterior y restante, y la leyenda no fiscal; se comparte por wa.me, PDF o link.

FC5.9 Comprobante QR: si fue por QR o Mercado Pago se puede asociar el comprobante (C13).

FC5.10 Aviso opcional al dueño: evento cobro_fiado ("Doña Rosa pagó $3.000 de su fiado (QR)"), en la app siempre y por WhatsApp/email según preferencia (C18.9).

### Criterios de aceptación:

☐ Carlos debe $9.250 y paga $3.000 por QR: su saldo queda en $6.250, la caja registra "Cobro de fiado — Carlos — $3.000 — QR" y el saldo de QR sube $3.000.

☐ Online no puedo cobrar $0 ni más de lo que debe.

☐ Revierto el cobro: la deuda vuelve a $9.250, el ingreso queda revertido y ambos movimientos quedan en la auditoría.

☐ Si falla el ingreso de caja, el saldo del cliente no cambia.

☐ Comparto por wa.me "Cobro N.º 000045: pagaste $3.000 (QR). Saldo: $6.250".

☐ El resumen de cierre muestra "Cobros de fiado: $3.000 (QR $3.000)" en una línea aparte.

### FC6. Tope de crédito (P0)

Descripción: hasta cuánto se le fía a cada cliente. Regla única online y offline (AU4.10, OF16.1.2): el Empleado no puede superar el tope; el Dueño sí, con confirmación.

### Requerimientos:

FC6.1 Tope por defecto del comercio (decidido el 9/10/2026, ver 7.3): los clientes nuevos nacen sin tope hasta que el Dueño configure uno. En el onboarding se le sugiere un tope por defecto de $20.000 (lo acepta, lo cambia o lo deja en "sin tope"); el valor elegido aplica a los clientes que se den de alta desde ese momento.

FC6.2 Tope por cliente: reemplaza al del comercio (monto o "sin tope").

FC6.3 Regla: si saldo actual + total de la venta > tope:

Empleado: no puede confirmar a cuenta; la app muestra "Supera el tope de Carlos: disponible $1.500" y ofrece cobrar con otro medio o la entrega parcial (FC2.9). El servidor rechaza el intento con 403 (criterio de AU4).

Dueño: ve el aviso y puede confirmar ("Confirmar igual"); el movimiento queda marcado sobre_tope = true y en la auditoría.

FC6.4 Disponible: tope − saldo, visible para el Dueño y para el Empleado que atiende a ese cliente. "Cerca del tope" al 80%.

FC6.5 Cambios de tope: solo el Dueño, online (OF16.1.6), auditados con valor anterior y nuevo. Bajarlo por debajo del saldo no bloquea cobros: solo impide nuevas ventas a cuenta del Empleado.

FC6.6 Excepción presencial: si el Dueño no está, puede autorizar en el celular del mostrador con su reautenticación (AU10); queda autorizado_por.

FC6.7 (P1) Bloqueo automático de nuevas ventas a cuenta cuando los días de atraso superan N.

### Criterios de aceptación:

☐ Como Empleado vendo $5.000 a cuenta a Doña Rosa (saldo $10.000, tope $20.000); si intento $12.000, la app no me deja y el servidor responde 403.

☐ Como Dueño confirmo esa venta de $12.000 con el aviso, queda marcada "sobre el tope" y en la auditoría.

☐ Bajo el tope de Carlos a $10.000 mientras debe $18.000: puedo seguir cobrándole y el Empleado no puede venderle a cuenta.

☐ Si nunca configuré un tope, un cliente nuevo aparece "Sin tope" y el Empleado le puede vender a cuenta cualquier monto.

☐ En el onboarding veo sugerido un tope de $20.000; si lo acepto, los clientes que doy de alta después nacen con tope $20.000.

### FC7. Antigüedad de la deuda y días de atraso (P0)

### Requerimientos:

FC7.1 Imputación FIFO: los haberes cancelan primero los debes más viejos; una devolución se imputa primero al debe de su ticket (FC10.4).

FC7.2 Antigüedad: días corridos desde el debe impago más viejo (zona horaria del comercio). Saldo cero o a favor: sin antigüedad.

FC7.3 Plazo: días para pagar; por defecto 30, configurable por comercio y por cliente (mínimo 1).

FC7.4 Días de atraso: máx(0, antigüedad − plazo). Con atraso mayor a 0 el cliente está "Vencido": dispara el aviso fiado_vencido (FC15.1).

FC7.5 Tramos: cada remanente impago se clasifica en 0–30, 31–60 o más de 60 días según la fecha de su debe.

FC7.6 Función única de dominio (TypeScript) en el servidor, el dispositivo y los reportes, con tests de propiedades (Σ tramos = saldo).

FC7.7 (P1) Día fijo de pago ("cobra el 5").

### Criterios de aceptación:

☐ Carlos compró $4.000 el 1/9, $3.000 el 20/9 y $2.000 el 5/10 y pagó $5.000 el 6/10. El 9/10 quedan $2.000 del 20/9 y $2.000 del 5/10: antigüedad 19 días, sin atraso con plazo 30.

☐ Con plazo 15, el mismo Carlos tiene 4 días de atraso y figura "Vencido".

☐ La suma de los tramos de todos los clientes es igual al total adeudado.

### FC8. Recordatorios al cliente (P0 wa.me / P1 número central)

Descripción: mandarle al cliente su saldo con un toque, por defecto desde el WhatsApp del propio comerciante (wa.me, gratis), como el ticket (TV11). Como opción, desde el número central con plantilla paga y consentimiento (como TV12).

### Requerimientos:

FC8.1 wa.me (P0, por defecto): "Mandar saldo por WhatsApp" en la cuenta y en el listado de deudores (Dueño), y en la venta o el cobro en curso para el cliente que se atiende (Empleado, FC9.4). Abre https://wa.me/<número E.164 sin +>?text=<texto> con el teléfono de la ficha (o https://wa.me/?text= para elegir el contacto). El comerciante toca Enviar. Sin costo y sin consumir el cupo del plan.

FC8.2 Texto (respetuoso, sin amenazas): "Hola Carlos, te paso el resumen de tu cuenta en {Comercio}: saldo $6.250 al 09/10/2026. Detalle: https:///c/. ¡Gracias!". El Dueño puede editar el texto base con variables ({nombre}, {comercio}, {saldo}, {fecha}, {link}); nunca se agregan intereses ni recargos.

FC8.3 Registro: se guarda el evento (canal, usuario, fecha y hora), no el texto; la app no puede saber si se envió (TV11.7). El listado muestra "Último recordatorio: hace 6 días".

FC8.4 Offline: wa.me funciona sin conexión; el link queda activo al sincronizar.

FC8.5 Número central (P1, opcional por comercio, apagado por defecto): plantilla de utilidad recordatorio_saldo (es_AR): "Hola {{1}}. {{2}} te informa que el saldo de tu cuenta al {{3}} es {{4}}.", con botones "Ver detalle" y "No recibir más" [a verificar con Meta que entre en utilidad y no en marketing].

FC8.6 Consentimiento (P1, obligatorio): casilla sin premarcar "El cliente aceptó recibir avisos de su saldo por WhatsApp en este número", con fecha, hora y usuario; separado del consentimiento de tickets (otra finalidad); revocable con "No recibir más" o "BAJA" (TV12.6).

FC8.7 Costo y cupo (P1): ~USD 0,026 por mensaje entregado [a verificar con la tarifa vigente]; descuenta 1 del cupo mensual del plan y se registra en whatsapp_usage con la marca recordatorio_fiado. Con cupo agotado se ofrece wa.me. Topes diarios por comercio como TV12.8.

FC8.8 Frecuencia (P1): máximo 1 recordatorio por número central por cliente cada 7 días (configurable en el Control Plane), para cuidar al cliente y la calidad del número compartido.

FC8.9 (P2) Recordatorios programados (ej. el día 1 a los vencidos), siempre por número central y con consentimiento.

### Criterios de aceptación:

☐ Toco "Mandar saldo por WhatsApp" y se abre mi WhatsApp en el chat de Carlos con el texto, el saldo y el link.

☐ El envío por wa.me no descuenta cupo ni genera costo.

☐ (P1) Sin consentimiento marcado, "Enviar desde [plataforma]" no se habilita; con consentimiento, descuenta 1 del cupo y queda en whatsapp_usage como recordatorio_fiado.

☐ (P1) Si Carlos toca "No recibir más", la próxima vez solo se me ofrece wa.me.

### FC9. Permisos (P0)

Descripción: la matriz ya decidida en AU4.10 del PRD de Autenticación, más dos filas decididas por el dueño el 9/10/2026 (alta de cliente desde la venta y wa.me al cliente que se atiende; ver 7.3). Los permisos se validan en el backend en cada request (AU4.2) y al sincronizar la cola offline (OF9.3).

FC9.1 La API filtra en el servidor (AU4.3): para el Empleado devuelve solo el saldo y el disponible del cliente elegido en la operación en curso; nunca el listado ni el total.

FC9.2 Las bajas de deuda, los cambios de tope y las ventas sobre el tope quedan en el audit_log con usuario, fecha y hora (AU4.10).

FC9.3 Alta de cliente por el Empleado: desde la venta solo carga nombre y teléfono (y ve el aviso de datos, FC16.3); no puede editar fichas existentes, cambiar el tope ni cargar saldo del cuaderno. El alta queda auditada con su usuario.

FC9.4 wa.me del Empleado: el botón "Mandar saldo por WhatsApp" aparece solo dentro de la venta o el cobro en curso y para ese cliente; el texto lleva solo su saldo y su link. El Empleado no tiene listado de deudores desde donde mandar recordatorios ni acceso al número central.

FC9.5 (P1) Tope de fiado por empleado (por día o por venta).

### Criterios de aceptación:

☐ Como Empleado cobro $3.000 de fiado por QR y veo solo el saldo de Doña Rosa; no veo el listado ni el total del comercio.

☐ Como Empleado no veo "Cambiar tope" ni "Dar de baja deuda"; como Dueño, dar de baja una deuda me pide reautenticación.

☐ Si el Dueño le restringe "vender a cuenta" a Juan, Juan deja de ver "A cuenta (fiado)" y "+ Nuevo cliente" en el siguiente request.

☐ Como Empleado, desde la venta doy de alta a "Carlos" con nombre y teléfono; queda en la auditoría con mi usuario y nace sin tope (o con el tope por defecto del comercio).

☐ Como Empleado, mientras le cobro a Doña Rosa toco "Mandar saldo por WhatsApp" y se abre el chat con su saldo; fuera de esa operación no tengo ese botón para ningún otro cliente.

☐ Si como Empleado intento pedir a la API el texto o el link de saldo de un cliente que no estoy atendiendo, el servidor responde 403.

### FC10. Devoluciones de ventas a cuenta (P0)

### Requerimientos:

FC10.1 Mismo flujo desde el ticket (TV13), con las reglas de stock, importes (TV13.4), plazos y permisos de siempre (F10.9, AU4.9).

FC10.2 Si el ticket es a cuenta, el reintegro va por defecto a la cuenta (movimiento devolucion, haber, vinculado al ticket y a la devolución); no hay egreso de caja.

FC10.3 Si el cliente ya pagó: el haber a la cuenta se limita al saldo; el excedente se reintegra por caja como egreso "Devolución" (C14) con el medio que elige el operador (TV13.5). Ejemplo: devolución de $1.330 con saldo $500 → $500 a la cuenta y $830 por caja.

FC10.4 Se imputa primero al debe del mismo ticket.

FC10.5 Anular un ticket a cuenta (TV13.3) es una devolución total con estas reglas.

FC10.6 Devolución, stock, cuenta y (si corresponde) caja, en una sola transacción (F10.6). La suma de las devoluciones de un ticket nunca supera su total.

### Criterios de aceptación:

☐ Carlos debe $9.250 y devuelve una Coca-Cola de un ticket a cuenta ($1.330): su saldo queda en $7.920, el stock sube 1 y la caja no se mueve.

☐ Carlos debe $500 y devuelve $1.330: su saldo queda en $0 y la caja registra un egreso "Devolución" de $830 con el medio que elegí.

☐ Anulo un ticket a cuenta de $4.250: el saldo baja $4.250 y el ticket queda "Anulado".

### FC11. Ajustes y saldo del cuaderno (P0)

### Requerimientos:

FC11.1 Saldo del cuaderno: al dar de alta un cliente, el Dueño carga monto y fecha de la deuda (para que la antigüedad sea real). Movimiento saldo_inicial, uno vigente por cliente; si está mal, se revierte y se carga de nuevo.

FC11.2 Ajustes: a favor (ajuste_credito) o en contra (ajuste_debito) del cliente, con motivo obligatorio (sin solo espacios).

FC11.3 Solo el Dueño, solo online (OF9.5), auditados.

FC11.4 Online, un ajuste a favor no puede dejar el saldo negativo.

FC11.5 Los ajustes no mueven la caja ni el stock (si hubo plata es un cobro; si hubo mercadería, una venta o devolución).

FC11.6 (P1) Importación del cuaderno por CSV (nombre, teléfono, saldo, fecha) con vista previa.

### Criterios de aceptación:

☐ Doy de alta a Doña Rosa con saldo del cuaderno $12.000 del 15/8: el 9/10 su deuda tiene 55 días y está en el tramo 31–60.

☐ No puedo guardar un ajuste sin motivo, y un ajuste no cambia ningún saldo de caja.

☐ Sin conexión, "Ajuste" aparece deshabilitado con "Necesita conexión".

### FC12. Deuda incobrable (P0)

### Requerimientos:

FC12.1 "Dar de baja deuda": solo el Dueño, online, con reautenticación (AU10) y motivo obligatorio. Crea un movimiento incobrable (haber) por el saldo o una parte.

FC12.2 El cliente queda bloqueado para fiar (el Dueño lo puede desbloquear, auditado).

FC12.3 Queda visible en la cuenta ("Baja por incobrable $15.300 el 09/10/2026 por Mauricio: se mudó") y en el reporte del período (FC14.4).

FC12.4 Si después paga, el Dueño revierte la baja (total o parcial) y registra el cobro normal.

FC12.5 No mueve caja ni stock; no es un asiento contable.

### Criterios de aceptación:

☐ Doy de baja $15.300: me pide reautenticación y motivo, el saldo queda en $0 y el cliente queda bloqueado para fiar.

☐ El cliente vuelve y paga $5.000: revierto $5.000 de la baja y registro el cobro; la caja muestra "Cobro de fiado" $5.000.

☐ En la auditoría veo quién dio de baja, cuándo, el monto y el motivo.

### FC13. Funcionamiento offline (P0)

Descripción: venta a cuenta y cobro funcionan sin conexión, con las reglas ya fijadas en OF16.1 del PRD de Offline y C18.8 del PRD de Caja.

### Requerimientos:

FC13.1 Datos locales: la SQLite del celular guarda los clientes activos (id, nombre, teléfono cifrado, estado, tope, plazo) y su último saldo conocido del servidor. DNI y notas no se bajan (OF14.5). En dispositivos compartidos la base va cifrada (OF14.4).

FC13.2 Saldo local = último saldo del servidor + ventas a cuenta y cobros pendientes de ese dispositivo, rotulado "provisorio" con "actualizado hace X" (OF16.1.2).

FC13.3 Venta a cuenta offline: queda en la cola junto con la venta y su stock, en la misma transacción local (OF16.1.1). El tope se controla contra el saldo local con la misma regla que online: el Empleado no lo supera; el Dueño sí, con confirmación (OF16.1.2).

FC13.4 Al sincronizar: el servidor recalcula el saldo con todas las operaciones, ordenadas por hora del dispositivo validada. Si con ventas de otros dispositivos el saldo quedó sobre el tope, la venta se acepta igual (la mercadería ya se entregó), se marca "sobre el tope (offline)" y se emite fiado_sobre_tope (OF16.1.4, NE17.4).

FC13.5 Cobro offline: por cualquiera de los 5 medios, validado contra el saldo local (OF16.1.3). Si dos celulares cobran al mismo cliente y al sincronizar el saldo queda negativo, se conservan los dos cobros, el negativo queda como saldo a favor del cliente, el cliente se marca "saldo negativo, revisar" y el Dueño recibe el aviso (OF16.1.5). Nunca se descarta ni modifica un cobro: si el Dueño decide devolver el excedente, lo hace online con una reversión o un egreso "Devolución" vinculado al cliente; si no, el saldo a favor se consume con la próxima venta a cuenta.

FC13.6 Cliente bloqueado mientras el celular estaba offline: la venta a cuenta se acepta, se marca y se avisa al Dueño.

FC13.7 Alta de cliente offline: con id temporal (id_mappings). Si al sincronizar ya existe el mismo teléfono, no se fusiona solo: queda "posible duplicado" para el Dueño (fusión P1).

FC13.8 Solo online: cambiar topes y plazos, dar de baja deudas, ajustes, saldo del cuaderno, reversiones, edición de fichas, fusiones y exportaciones (OF16.1.6, OF9.5).

FC13.9 Conflictos: los movimientos de cuenta son append-only y se combinan (merge), como stock y caja (6.5 del PRD de Offline); la ficha del cliente la decide el servidor.

FC13.10 Idempotencia: idempotency_key = op_id en movimientos de cuenta y de caja, más sync_receipts.

### Criterios de aceptación:

☐ En modo avión vendo $5.000 a cuenta a Doña Rosa (saldo local $10.000, tope $20.000): su saldo provisorio queda en $15.000 y al sincronizar el servidor lo confirma.

☐ En modo avión, como Empleado, no puedo vender a cuenta $12.000 a un cliente con saldo local $10.000 y tope $20.000.

☐ Dos celulares offline venden a cuenta al mismo cliente y entre los dos superan el tope: se aceptan las dos ventas, la segunda queda "sobre el tope (offline)" y el Dueño recibe el aviso.

☐ Dos celulares offline cobran $3.000 cada uno a un cliente que debía $5.000: se conservan los dos cobros, el saldo queda en −$1.000 (a favor), marcado "saldo negativo, revisar", y el Dueño recibe el aviso.

☐ Sin conexión, "Cambiar tope" y "Dar de baja deuda" aparecen deshabilitados con "Necesita conexión".

### FC14. Reportes (P0, solo Dueño)

### Requerimientos:

FC14.1 Total adeudado y cantidad de clientes con saldo; aparte, total de saldos a favor.

FC14.2 Antigüedad por tramos: 0–30, 31–60 y más de 60 días, en pesos y clientes (FIFO, FC7); tocando un tramo se ven los clientes.

FC14.3 Principales deudores: top 10 por saldo, con antigüedad, días de atraso y último cobro.

FC14.4 Movimiento del período: ventas a cuenta, cobros (por medio), devoluciones a cuenta, ajustes e incobrables.

FC14.5 Exportación CSV con reautenticación, como la de caja.

FC14.6 Calculado en el servidor con la función de FC7.6; carga en menos de 2 s con 4G para 500 clientes.

FC14.7 (P1) Evolución mensual de la deuda y PDF.

### Criterios de aceptación:

☐ Con clientes que deben $10.000 (20 días), $8.000 (45 días) y $5.000 (90 días) veo total $23.000 y tramos $10.000 / $8.000 / $5.000.

☐ El CSV exportado suma exactamente el total de la pantalla.

### FC15. Avisos al dueño y resúmenes (P0)

### Requerimientos:

FC15.1 Avisos de NE17.4 (email + en la app; WhatsApp solo si el Dueño lo activa por tipo, apagado por defecto):

fiado_vencido: cliente con días de atraso > 0 (FC7.4).

fiado_sobre_tope: saldo sobre el tope (venta del Dueño con confirmación o sincronización offline, FC13.4).

Saldo negativo por cobros offline (FC13.5). Por defecto van en el resumen diario, agrupados por cliente, con link a la cuenta; deduplicados (fiado_vencido:<cliente>:<fecha>) y con las preferencias, silencio y baja de NE9 y NE10. Solo los recibe el Dueño (NE17.8).

FC15.2 Aviso de cobro (opcional): cobro_fiado (C18.9, FC5.10).

FC15.3 Resumen del viernes (B9 y su email): línea "Fiado: te deben $184.500 entre 23 clientes ($41.000 con más de 60 días). Esta semana fiaste $38.200 y cobraste $62.300.", con link "Ver deudores". Va dentro del mismo resumen (sin mensaje extra ni costo adicional); como cambia el texto de la plantilla de WhatsApp, requiere aprobar una versión nueva [a verificar]; mientras tanto, va en el email y en el resumen completo de la web. No aparece si el comercio no usa fiado.

FC15.4 Resumen de cierre (C12, C18.2, C18.5): "Ventas a cuenta: $X (N ventas)" como dato informativo fuera de los ingresos, y "Cobros de fiado: $Y" como línea aparte con desglose por medio. Las ventas sobre el tope del día se listan para el Dueño.

### Criterios de aceptación:

☐ Doña Rosa queda sobre su tope después de sincronizar: el resumen diario por email y la app la incluyen, y no se manda WhatsApp salvo que lo haya activado.

☐ Un cliente pasa a "Vencido": recibo un solo aviso ese día aunque el job corra dos veces.

☐ El viernes, el resumen semanal trae la línea de fiado con montos iguales al reporte FC14.

### FC16. Privacidad y datos personales (Ley 25.326) (P0)

### Requerimientos:

FC16.1 Datos mínimos: nombre, teléfono, DNI opcional y notas. Finalidad única: llevar la cuenta corriente del cliente con ese comercio.

FC16.2 El comercio es responsable de la base de sus clientes y la plataforma es encargada del tratamiento, a reflejar en los términos [a verificar con el abogado].

FC16.3 Aviso al cliente: al dar de alta, la app muestra un texto corto para informarle ("Guardamos tu nombre y teléfono para llevar tu cuenta y mandarte el saldo") [texto a validar con el abogado].

FC16.4 Teléfono y DNI cifrados en la base del comercio, con hash para búsqueda y duplicados (como TV18.2); nunca en texto plano en logs, eventos ni métricas.

FC16.5 Derechos: acceso (estado de cuenta), rectificación (edición de la ficha) y supresión: con saldo cero, el Dueño puede "Eliminar datos del cliente", que anonimiza la ficha y conserva los movimientos sin datos personales. Con saldo pendiente se informa que primero hay que saldarlo o darlo de baja [a verificar con el abogado].

FC16.6 Los clientes nunca se comparten entre comercios ni con la plataforma, ni se usan para marketing.

FC16.7 Retención propuesta: anonimizar los clientes con saldo cero y sin movimientos en 24 meses [a definir con asesoría legal].

### Criterios de aceptación:

☐ Teléfono y DNI están cifrados en la base y no aparecen en los logs.

☐ Elimino los datos de un cliente con saldo cero: la ficha queda anonimizada y los reportes siguen sumando lo mismo.

### FC17. Nota fiscal (P0)

FC17.1 Vender a cuenta no cambia las obligaciones fiscales de la venta: la venta existe cuando se entrega la mercadería, se cobre ese día o después.

FC17.2 El ticket a cuenta y el comprobante de cobro son documentos internos no fiscales (TV7).

FC17.3 Con facturación ARCA activa (FE4), la factura se emite por la venta, no por el cobro; el cobro de fiado no emite comprobante fiscal; una devolución a cuenta genera su Nota de Crédito como cualquier otra (FE8). La condición de venta "Cuenta corriente" en la factura queda [a verificar con el contador].

FC17.4 Pregunta abierta compartida con el PRD de ARCA (7.2 n.º 1) e ideas-nuevas-sistema.md (3.a.1): si el monotributista debe facturar todas las ventas, aplica igual a las ventas a cuenta. Se consulta con el contador, junto con la fecha de emisión (venta o cobro).

### 4.18 Pendientes para otros PRD (sin editarlos)

## 5. Flujos

### Flujo 1: primer fiado a un cliente nuevo (celular, sin lector)

Juan (Empleado) escanea con la cámara una leche y un pan: $4.250.

"Cobrar" → "A cuenta (fiado)" → busca "Carlos", no existe → "+ Nuevo cliente" (nombre y teléfono) → la app le muestra el aviso de datos para el cliente.

Ve "Saldo $0 · Sin tope" (o el tope por defecto, si el Dueño lo configuró) y confirma.

Baja el stock, sale el ticket "Pago: A cuenta (fiado)" y la cuenta de Carlos queda en $4.250. La caja no cambia.

"Compartir por WhatsApp" le manda el ticket a Carlos.

### Flujo 2: cobro parcial

Carlos paga $3.000 por QR. "Vender" → "Cobrar fiado" → Carlos (Juan ve su saldo: $9.250).

Cambia el monto a $3.000, medio QR, "Cobrar".

En una transacción: cobro en la cuenta e ingreso "Cobro de fiado" en QR.

Comparte el comprobante "Cobro N.º 000045" con el saldo restante ($6.250).

### Flujo 3: venta que supera el tope

Doña Rosa (tope $15.000) debe $14.000 y pide $2.500 a cuenta.

Juan ve "Supera el tope: disponible $1.000" y no puede confirmar; le ofrece cobrar $1.500 en efectivo y anotar $1.000, o llamar al dueño.

Mauricio (Dueño), en su celular o con reautenticación en el del mostrador, confirma igual. Queda "sobre el tope" y en la auditoría, y aparece en el resumen diario.

### Flujo 4: recordatorio por WhatsApp

El viernes el resumen dice "$41.000 con más de 60 días"; Mauricio toca "Ver deudores".

Abre un cliente vencido → "Mandar saldo por WhatsApp" → se abre su WhatsApp con texto y link → Enviar. Queda "Último recordatorio: hoy".

### Flujo 5: devolución de una venta a cuenta

Carlos devuelve una Coca-Cola de un ticket a cuenta: desde el ticket, "Devolver".

Los $1.330 van a su cuenta (baja el saldo) y el stock sube. Si ya había pagado todo, el reintegro sale por caja con el medio elegido.

### Flujo 6: baja por incobrable

Un cliente se mudó y debe $15.300 hace 4 meses. Mauricio abre la cuenta → "Dar de baja deuda".

Se reautentica, escribe el motivo y confirma: saldo $0, cliente bloqueado para fiar, todo auditado.

### Flujo 7: dos celulares sin conexión

Sin datos móviles, dos celulares le venden a cuenta a Carlos; cada uno controla el tope contra su saldo local.

Al volver la conexión el servidor recalcula: el saldo supera el tope. Se aceptan las dos ventas, la segunda queda "sobre el tope (offline)" y Mauricio recibe el aviso por email y en la app.

Si en cambio dos celulares le cobraron de más, se conservan los cobros, Carlos queda con saldo a favor "a revisar" y Mauricio decide si devolver el excedente o dejarlo a cuenta de la próxima compra.

### Flujo 8: pasar el cuaderno al sistema

Mauricio abre "Clientes" → "+ Nuevo cliente" → "Doña Rosa, saldo del cuaderno $12.000 del 15/8".

Repite con cada cliente (P1: importación por CSV). Desde ahí el cuaderno queda reemplazado.

## 6. Notas técnicas

### 6.1 Principios

Append-only: los movimientos de cuenta se insertan y nunca se actualizan ni borran (como stock_movements y cash_movements).

Saldo derivado: la suma de los movimientos es la fuente de verdad; el caché es solo rendimiento.

Enteros en centavos (bigint), nunca float (PRD de Caja 6.3, PRD de Ticket 6.4).

Una base por cliente: todo vive en la base del comercio; la base de control solo guarda el hash del token del link público.

Determinista: imputación FIFO, antigüedad, tramos y topes en una única librería TypeScript compartida por servidor y dispositivo, con tests de propiedades.

### 6.2 Modelo de datos

### 6.3 Reglas de integridad

Inmutabilidad: el rol de la app tiene solo INSERT, SELECT sobre customer_account_movements; triggers BEFORE UPDATE OR DELETE y BEFORE TRUNCATE lanzan excepción; índice único en revierte_a.

CHECKs por tipo: venta_a_cuenta ⇒ debe y sale_id; cobro ⇒ haber y cash_movement_id; devolucion ⇒ haber y return_id; ajustes, incobrable y reversion ⇒ motivo no vacío; un saldo_inicial vigente por cliente.

Saldo no negativo online: al insertar un haber online se bloquea la fila (SELECT … FOR UPDATE en customer_balances) y se rechaza si el saldo quedaría negativo. Las operaciones offline se aceptan, se marcan y generan customer_flags (FC13.4 a FC13.6).

Tope en el dominio, no en la base: el backend rechaza con 403 la venta del Empleado sobre el tope (online); la base no lo bloquea, para poder aceptar lo ya entregado offline.

Venta a cuenta: en el paso de pagos de la transacción de venta (6.3 del PRD de Ticket), un pago a_cuenta inserta el movimiento venta_a_cuenta en lugar del ingreso de caja; el trigger diferido verifica Σ pagos = total, cada uno vinculado a su ingreso de caja o a su movimiento de cuenta.

Cobro: movimiento cobro + ingreso de caja + caché, en una transacción con la misma idempotency_key (C18.4).

Verificación nocturna: customer_balances = Σ movimientos; si difiere, alerta interna sin corrección silenciosa.

Auditoría: alta y edición de clientes, cambios de tope y plazo, ventas sobre el tope, ajustes, reversiones, bajas, anonimizaciones, exportaciones y envíos por número central, con datos personales enmascarados.

### 6.4 Offline y sincronización

Nuevos tipo_op: cobro_fiado y alta_cliente; la venta a cuenta viaja dentro de venta con su pago a_cuenta.

El pull incluye customers (sin DNI ni notas) y customer_balances. El Empleado ve el saldo solo del cliente que elige en la operación.

Al procesar el lote: orden por hora del dispositivo validada, merge append-only, recálculo de saldos y topes, customer_flags y eventos fiado_sobre_tope con dedupe_key al final del lote.

### 6.5 Cálculo de antigüedad

Debes (con fecha_deuda o created_at en la zona del comercio) y haberes, sin los pares revertidos.

Las devoluciones van primero al debe de su ticket; el resto de los haberes, en orden cronológico, cancela los debes más viejos.

Los remanentes dan antigüedad, días de atraso y tramos.

Tests de propiedades: Σ remanentes = saldo = Σ tramos (con saldo positivo).

### 6.6 Seguridad y rendimiento

Cifrado a nivel de aplicación con clave por comercio en el gestor de secretos; hash con sal por comercio.

Logs sin montos ni datos personales.

Venta a cuenta online en menos de 500 ms; listado de 500 deudores en menos de 2 s con 4G.

Tests: inmutabilidad, idempotencia, imputación, filtro de montos para el Empleado, escenarios de dos dispositivos offline.

## 7. Riesgos y preguntas abiertas

### 7.1 Riesgos

### 7.2 Preguntas abiertas

[Contador] ¿Hay que facturar las ventas a cuenta al venderlas o al cobrarlas? ¿Qué condición de venta va en la factura? (compartida con ARCA 7.2 n.º 1 e ideas 3.a.1).

[Abogado / AAIP] Rol responsable/encargado, texto del aviso al cliente, supresión con saldo pendiente y plazo de retención.

¿Plazo por defecto de 30 días o "fin de mes"?

¿Pagos adelantados (saldo a favor voluntario) en P1?

Número central: ¿los recordatorios comparten el cupo de los tickets o tienen uno propio? ¿En qué planes?

¿El fiado está en todos los planes o en uno superior?

Cargos por inflación o intereses: fuera de v1; ¿se revisa después del piloto?

### 7.3 Decisiones tomadas (9/10/2026)

## 8. Plan por fases

### Métricas del piloto:

El 80% de los kioscos piloto deja el cuaderno en 2 semanas.

Ninguna diferencia entre caja y cuenta en la verificación nocturna.

Ningún caso de Empleado viendo saldos de otros clientes.

Baja del monto con más de 60 días frente al primer mes.

Al menos 1 recordatorio por semana por kiosco.

## Anexo A. Glosario

Fiado / venta a cuenta: venta entregada hoy que el cliente paga después.

Cuenta corriente: registro de lo que el cliente debe y pagó.

Saldo: debe menos haber; positivo = el cliente debe; negativo = saldo a favor.

Tope: máximo que el cliente puede deber.

Plazo: días desde una compra hasta que se considera vencida.

Días de atraso: días desde que venció la deuda más vieja sin pagar.

Tramos: 0–30, 31–60 y más de 60 días.

Cobro de fiado: ingreso de caja por un pago de deuda.

Incobrable: deuda que el Dueño da de baja.

wa.me: link de WhatsApp que abre un chat con un texto listo, desde el teléfono del comerciante, sin costo.

Campo | Detalle
--- | ---
Producto | Fiado y cuenta corriente de clientes del Sistema de Inventario para Kioscos y Comercios (web y app móvil PWA)
Autor | Mauricio Matasini
Estado | Borrador v1
Fecha | 9 de octubre de 2026
Decisión de alcance | Entra en v1 (decisión del dueño, 9/10/2026). Es la idea n.º 1 de ideas-nuevas-sistema.md
Documentos relacionados | PRD principal (https://docs.google.com/document/d/1yqHU3xK1EYQle8J5Gag0wweTs9llCHH_X8uo4_km_AA/edit; F3 historial inmutable, F10 devoluciones, 6.11 auditoría), PRD de Caja (https://docs.google.com/document/d/14hdf2BbXewzSkjKE25zC8NEMJsDsy2ObI0IKBSt6u0U/edit; C4 medios de pago, C6 saldos, C7 reversiones, C12 cierre, C14 devoluciones y C18 fiado lado caja), PRD de Ticket (https://docs.google.com/document/d/1dA4AIxaHbLXS8ZoATx9Bh4fmBhXKfHA4oWnXprku4cM/edit; TV5, TV6, TV11 wa.me, TV12 número central, TV13, TV18), PRD de Offline (https://docs.google.com/document/d/1NvVipeJhXBgH5oae8D2SWzpqzBLybEaQ5Tc77G03Vw4/edit; OF9.5 y OF16.1 fiado offline), PRD de Autenticación (https://docs.google.com/document/d/18v4qo1sCDIfs31L1atBI3lxcaVC_2mlp9OpI4E1i2RM/edit; matriz AU4 y AU4.10), PRD de Notificaciones por Email (https://docs.google.com/document/d/1RUZ1PY_98eE0cvmL5lL5Ij39cO0nC627I0qAgICf4W0/edit; NE17.4), PRD del bot (https://docs.google.com/document/d/1lp7TnN3MiX60OJihJdv7h_26XEAZdmyPtwjwSGEgPv8/edit; B9 resumen del viernes), PRD de ARCA (https://docs.google.com/document/d/1qzEZybC4oI2Y1rGKxGnzgaJn1xyR_7uI-rYiqjfBjzg/edit; FE4, FE8, 7.2) y PRD de Gestión de Precios (https://docs.google.com/document/d/15gnWW2l2lkCFC-3shvHe9A6WfxfF2xje6IDj20ysyso/edit)
Terminología | La de los documentos relacionados: comercio, base de control, roles Dueño/Empleado, ticket, caja única, jornada, resumen de cierre, los cinco medios de pago (Efectivo, Débito, Mercado Pago, QR, Transferencia bancaria), outbox, op_id, idempotency_key, número central de WhatsApp. Términos nuevos en el Anexo A.
Stack | Astro + TypeScript (PWA), PostgreSQL con una base por cliente más una base de control, SQLite local en el celular para el offline de v1, "Iniciar sesión con Google"

Prioridad | Significado
--- | ---
P0 - MVP (v1) | Imprescindible para el lanzamiento
P1 | Dentro de los 2 a 3 meses posteriores
P2 | Según demanda

# | Funcionalidad | MVP (P0) | Más adelante (P1/P2)
--- | --- | --- | ---
FC1 | Ficha de clientes | Nombre, teléfono, DNI opcional, notas; búsqueda; datos mínimos | Fusión de duplicados (P1)
FC2 | Venta a cuenta | "A cuenta (fiado)" al cobrar; stock baja normal; no es ingreso de caja | Pago mixto: parte con un medio y parte a cuenta (P1, con TV5.5)
FC3 | Ticket | Muestra "A cuenta (fiado)" y el cliente | Saldo después de la compra en el ticket (P1)
FC4 | Saldo y estado de cuenta | Saldo derivado; movimientos con saldo corrido; link y PDF | Filtro por período con saldo anterior (P1)
FC5 | Cobros parciales | Por cualquiera de los 5 medios, ingreso "Cobro de fiado"; comprobante de cobro | Pago adelantado voluntario (P1)
FC6 | Tope de crédito | Clientes nuevos sin tope hasta que el Dueño lo configure ($20.000 sugerido en el onboarding); tope por cliente; el Empleado no lo supera; el Dueño sí, con confirmación | Bloqueo automático por atraso (P1)
FC7 | Antigüedad y días de atraso | Imputación FIFO, plazo configurable, días de atraso | Día fijo de pago (P1)
FC8 | Recordatorios al cliente | wa.me desde el WhatsApp del comerciante (gratis, por defecto) | Número central con plantilla paga y consentimiento (P1); programados (P2)
FC9 | Permisos | Matriz de AU4.10, más alta de cliente y wa.me del Empleado al cliente que atiende (decididos 9/10/2026) | Tope de fiado por empleado (P1)
FC10 | Devoluciones | Bajan el saldo; el excedente se reintegra por caja | Cambio por otro producto a cuenta (P1)
FC11 | Ajustes y saldo del cuaderno | Ajuste con motivo; carga del saldo inicial con fecha | Importación CSV (P1)
FC12 | Deuda incobrable | Solo Dueño, con reautenticación, auditado | Reporte anual (P2)
FC13 | Offline | Venta a cuenta y cobro offline; tope contra saldo local; marcas al sincronizar | Reserva de cupo por dispositivo (P2)
FC14 | Reportes | Total adeudado, tramos 0–30/31–60/60+, principales deudores, CSV | Evolución mensual y PDF (P1)
FC15 | Avisos al dueño y resúmenes | Fiado vencido, sobre el tope y saldo negativo (email + app, NE17.4); línea del viernes; líneas del cierre | —
FC16 | Privacidad (Ley 25.326) | Datos mínimos, cifrado, acceso, rectificación, supresión | Retención configurable (P1)
FC17 | Nota fiscal | Vender a cuenta no cambia la obligación de facturar | —

Acción | Dueño | Empleado
--- | --- | ---
Vender "A cuenta (fiado)" dentro del tope | ✅ | ✅⚙️ (sí por defecto; el Dueño lo puede restringir)
Dar de alta un cliente desde la venta | ✅ | ✅⚙️ (con el permiso anterior; solo nombre y teléfono) [decidido 9/10/2026]
Vender a cuenta superando el tope (con confirmación) | ✅ | ❌ 🔒
Cobrar fiado (total o parcial, cualquiera de los 5 medios) | ✅ | ✅⚙️ (sí por defecto)
Ver el saldo del cliente que está atendiendo | ✅ | ✅ (solo ese cliente, al vender o cobrar)
Ver el listado de saldos, vencidos y el total de fiado | ✅ | ❌ 🔒
Mandar el saldo por wa.me | ✅ (a cualquier cliente) | ✅ (solo al cliente que está atendiendo, desde la venta o el cobro en curso) [decidido 9/10/2026]
Editar la ficha de un cliente | ✅ | ❌
Cambiar el tope o el plazo de un cliente | ✅ | ❌ 🔒
Ajustes, saldo del cuaderno y reversiones | ✅ | ❌ 🔒
Dar de baja una deuda (incobrable) | ✅ (con reautenticación) | ❌ 🔒
Reportes de fiado y exportación | ✅ (exportación con reautenticación) | ❌ 🔒

PRD | Qué falta alinear
--- | ---
Caja | 2.2 todavía dice "no gestiona cuentas corrientes de clientes (fiado)"; C18 ya lo cubre. Seed de la categoría "Cobro de fiado".
Ticket | 2.2 dice fiado "fuera del MVP". 6.2: ticket_payments.tipo (caja / a_cuenta), customer_account_movement_id, sales.customer_id y cliente_nombre; TV6.6: total = Σ ingresos de caja + Σ cargos a cuenta; TV13: reintegro a la cuenta (FC10).
Autenticación | Sumar a AU4.10 las dos filas decididas el 9/10/2026 (alta de cliente desde la venta; wa.me del Empleado solo al cliente que atiende).
Bot | B9: línea de fiado (FC15.3) y, en P1, la plantilla recordatorio_saldo.
ARCA | 4.13: la venta a cuenta se factura como cualquier venta (FC17).

Tabla | Campos principales
--- | ---
customers | id (UUID generado en el dispositivo), nombre, telefono_cifrado, telefono_hash (índice único parcial entre no archivados), dni_cifrado, dni_hash, notas (≤ 280), tope_centavos (nullable = hereda), sin_tope (bool), plazo_dias (nullable = hereda), estado (activo / bloqueado / archivado / anonimizado), revisar_saldo_negativo (bool), aviso_datos_mostrado_at, created_by, created_at, updated_at; cambios en el audit_log
customer_account_movements (append-only) | id (UUID), customer_id, tipo (saldo_inicial / venta_a_cuenta / cobro / devolucion / ajuste_debito / ajuste_credito / incobrable / reversion), sentido (debe / haber), monto_centavos (bigint > 0), fecha_deuda (date, solo saldo_inicial), sale_id (obligatorio en venta_a_cuenta), return_id (obligatorio en devolucion), cash_movement_id (único; obligatorio en cobro si Caja está activa), revierte_a (único), motivo (obligatorio en ajustes, incobrable y reversión), sobre_tope (bool), sobre_tope_offline (bool), autorizado_por, user_id, device_id, offline (bool), client_occurred_at, idempotency_key (único), created_at (timestamptz del servidor); (P1) prev_hash, hash
customer_balances (caché) | customer_id (PK), saldo_centavos (puede ser negativo solo por FC13.5), debe_mas_viejo_fecha, ultimo_cobro_at, ultimo_movimiento_id, updated_at
customer_settings | tope_defecto_centavos (nullable = sin tope; NULL por defecto, el onboarding sugiere 2.000.000 centavos = $20.000), plazo_defecto_dias (30), texto_recordatorio, modulo_activo
customer_reminders | id, customer_id, canal (wa_me / whatsapp_central), user_id, created_at; P1: consent_id, template_name, wamid, estado, costo_estimado_micros_usd
customer_whatsapp_consents (de TV12, P1) | se suma finalidad (ticket / recordatorio_saldo) y customer_id
customer_statement_links (base de control) | token_hash (PK), tenant_id, customer_ref (opaco), expires_at, revoked_at
customer_flags | id, customer_id, tipo (sobre_tope_offline / saldo_negativo / fiado_a_bloqueado / posible_duplicado), movimientos (ids), estado (abierta / resuelta), resuelta_por, resuelta_at, created_at
sales (ampliación) | customer_id, cliente_nombre (congelado)
ticket_payments (ampliación) | tipo (caja / a_cuenta), payment_method_code nullable si es a_cuenta, customer_account_movement_id (único)
cash_movements (C18) | origen cobro_fiado, categoría "Cobro de fiado", cliente_fiado_id, customer_account_movement_id (único)
ticket_counters | clave nueva 'cobro' para el comprobante de cobro

Riesgo | Impacto | Mitigación
--- | --- | ---
Ventas a cuenta offline que superan el tope | Medio | Control con saldo local, marca "sobre el tope (offline)", aviso al Dueño (FC13.4).
Cobros duplicados offline | Medio | Se conservan, saldo a favor marcado y aviso (FC13.5); idempotencia por op_id.
El Empleado ve deudas de otros clientes | Alto (privacidad) | Filtro en el servidor (FC9.1) y tests específicos.
Fiado sin control que el Dueño no ve | Alto | Topes, avisos NE17.4, resumen diario y viernes, auditoría.
Saldos alterados después del hecho | Alto | Append-only, triggers, reversiones con motivo, auditoría.
Recordatorios percibidos como acoso | Medio | wa.me por defecto, texto respetuoso, límite de 1 cada 7 días por número central, BAJA.
Meta clasifica la plantilla como marketing | Medio (costo) | Texto informativo; si no se aprueba, solo wa.me.
Datos personales mal tratados | Alto (legal) | Datos mínimos, cifrado, aviso, anonimización; revisión del abogado.
Cuaderno mal migrado | Medio | Saldo inicial con fecha, ajustes con motivo, P1 CSV con vista previa.
Diferencias entre caja y cuenta | Alto | Misma transacción, vínculo 1:1, verificación nocturna.
Inflación erosiona el valor de la deuda | Medio (negocio) | Fuera de alcance v1; el reporte de antigüedad muestra el riesgo; se evalúa en Fase 3 si el Dueño lo decide.

# | Decisión | Dónde impacta
--- | --- | ---
D1 | Tope por defecto: los clientes nuevos nacen sin tope hasta que el Dueño configure uno; en el onboarding se sugiere $20.000. (Era la pregunta abierta 3.) | FC6.1, Flujo 1, customer_settings
D2 | Alta de cliente por el Empleado: puede dar de alta un cliente desde la venta (nombre y teléfono), con el permiso de vender a cuenta. (Era parte de la pregunta abierta 9.) | FC1.4, FC9 (matriz y FC9.3), AU4.10 (4.18)
D3 | wa.me del Empleado: puede mandar el saldo por wa.me solo al cliente que está atendiendo, desde la venta o el cobro en curso. (Era parte de la pregunta abierta 9.) | FC8.1, FC9 (matriz y FC9.4), AU4.10 (4.18)

Fase | Duración | Alcance
--- | --- | ---
Fase 0. Preparación | 1 semana | Respuestas del contador y el abogado; texto del aviso de datos; envío a Meta de la nueva versión del resumen del viernes; diseño de pantallas.
Fase 1. MVP (P0) | 2–3 semanas, después de venta, ticket y caja con offline v1 | FC1–FC7, FC9–FC17 y FC8 por wa.me: fichas, venta a cuenta, ticket, saldo y estado de cuenta, cobros por los 5 medios, topes, antigüedad, devoluciones, ajustes, incobrables, offline, reportes, avisos y resúmenes.
Piloto | semanas 7–8 | 3–5 kioscos que hoy usan cuaderno; pasaje del cuaderno acompañado.
Fase 2. P1 | meses 2–3 | Recordatorios por número central con consentimiento; importación CSV; fusión de duplicados; tope por empleado; pagos adelantados (si se decide); PDF de estado de cuenta; hash encadenado.
Fase 3. P2 | después | Recordatorios programados; evolución de la deuda; cargos por inflación o intereses solo si el Dueño lo decide, con revisión legal y del contador.
