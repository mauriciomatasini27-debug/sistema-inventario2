---
id: MOD-04-TICKET-VENTA-PARTE-2
tipo: spec
estado: propuesto
modulos: [caja, fiado, ventas]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: ""
---
> Origen: `PRD - Ticket de Venta para Sistema de Inventario - Parte 2.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/sales/ticket_*`, `src/pages/api/tickets/*`

---

# PRD - Ticket de Venta para Sistema de Inventario — Parte 2 de 2

Documento dividido en dos partes por tamaño. Esta es la Parte 2: sección 4 desde TV1 (TV1 a TV18 y 4.19), secciones 5 a 8 y Anexo A. La Parte 1 (encabezado, secciones 1 a 3 y 4.0 Priorización) está en: https://docs.google.com/document/d/1dA4AIxaHbLXS8ZoATx9Bh4fmBhXKfHA4oWnXprku4cM/edit . La numeración es la del documento completo.

### TV1. Generación automática del ticket (P0)

Descripción: al confirmar una venta en el Modo venta, el sistema crea el ticket en la misma transacción que descuenta el stock y registra el cobro. No hay paso extra ni botón "Generar ticket".

### Requerimientos:

TV1.1 Toda venta confirmada genera exactamente un ticket, cualquiera sea el método de identificación de cada producto (lector láser/USB/Bluetooth, cámara del celular, búsqueda de texto, búsqueda por foto; PRD principal F2.0 a F2.13). Una venta con productos identificados por métodos distintos genera un solo ticket; el método queda guardado por línea.

TV1.2 El ticket agrupa todas las líneas confirmadas juntas en la venta (el "carrito" del Modo venta). Dependencia: si el PRD principal mantiene en el MVP la venta de un producto por confirmación (F2.10 actual), cada confirmación genera un ticket de una línea; el modelo soporta varias líneas desde el día uno.

TV1.3 Atomicidad: el ticket, sus líneas, sus pagos, los movimientos "egreso por venta" (F3) y los ingresos en la caja (C8, si el módulo Caja está activo) se guardan en una sola transacción. No puede existir un ticket sin sus movimientos ni un movimiento de venta sin ticket.

TV1.4 Las ventas registradas por el camino "egreso con motivo venta" del PRD principal (F1.7, Flujo 7) también generan ticket (de una línea).

TV1.5 Al confirmar, la pantalla muestra el ticket recién creado con las acciones Compartir por WhatsApp, Más opciones (PDF, imagen, link, imprimir si está habilitado) y Nueva venta (por defecto, con foco en el escaneo para seguir vendiendo).

TV1.6 Idempotencia: el ticket lleva un id (UUID) generado en el dispositivo y una idempotency_key; un reintento (doble toque, red inestable, reenvío de la cola offline) nunca crea dos tickets.

### Criterios de aceptación:

☐ Vendo un producto escaneado con el lector, otro con la cámara y otro buscado por texto en la misma venta: se genera un solo ticket de 3 líneas y cada línea muestra su método de identificación en el detalle interno.

☐ La misma venta hecha con cualquier método deja el mismo ticket (mismos importes y totales); solo cambia el método por línea.

☐ Si falla el descuento de stock o el registro en la caja, no queda ningún ticket guardado (y viceversa).

☐ Toco dos veces "Confirmar" con mala señal y se crea un solo ticket.

☐ Después de confirmar veo el ticket en menos de 1 s (online) y con un toque vuelvo a escanear para la venta siguiente.

### TV2. Contenido del ticket (P0)

Descripción: datos que lleva el ticket, iguales en pantalla, link público, PDF, imagen e impresión.

### Requerimientos:

TV2.1 Encabezado:

Nombre del comercio (nombre de fantasía configurado; opcionalmente dirección y teléfono si el dueño los carga). El CUIT es opcional y, si se muestra, va como dato del comercio, nunca con formato de factura (ver 7.2).

Fecha y hora de la venta en America/Argentina/Buenos_Aires (formato "09/10/2026 18:42"). Online es la hora del servidor; en un ticket offline se muestra la hora del dispositivo al momento de la venta y el detalle interno guarda además la hora de registro en el servidor (como F3.7).

Número de ticket (TV3): "Ticket N.º 000123"; si es provisorio, "Ticket provisorio A3-0045".

Vendedor: nombre del usuario que hizo la venta (en el link público y el PDF, solo el nombre de pila; en la app, el nombre completo).

TV2.2 Líneas (una por producto): nombre del producto (congelado al momento de la venta), cantidad (en unidades; si se vendió por caja, "2 cajas × 24 = 48 u."), precio unitario, subtotal de la línea (precio × cantidad), descuento de la línea (si hay: "−10% −$90,00" o "−$100,00") y neto de la línea.

TV2.3 Totales: subtotal (suma de netos de línea), descuento del ticket (si hay: "Descuento 5% −$305,50" o "Descuento −$300,00"), total destacado y, si hay descuentos, "Ahorraste $395,50" (P1, configurable).

TV2.4 Pago: medio de pago (TV5) y, en efectivo, "Paga con" y "Vuelto" si se cargaron. Con pago dividido (P1), una línea por medio. En una venta "A cuenta (fiado)" (TV5.8), el ticket muestra "Pago: A cuenta (fiado) — {nombre del cliente}" y el importe cargado a su cuenta.

TV2.5 Leyenda no fiscal (TV7) visible, en mayúsculas, debajo del total.

TV2.6 Estado: si el ticket tiene devoluciones, la vista en la app y el link muestran "Devolución parcial" o "Anulado / devuelto total", con el enlace a cada documento de devolución (TV13); el ticket original no cambia.

TV2.7 Pie: texto configurable por el comercio (P1, por ejemplo "¡Gracias por tu compra!"), sin promociones en lo que se envíe por el número central (TV12). Código QR al link público en PDF, imagen e impresión (P1).

TV2.8 Lo que nunca aparece en el ticket del cliente: costo, ganancia, markup, margen, notas internas, teléfono del cliente, ID de dispositivo, datos de otros clientes.

TV2.9 Líneas de promoción y combo (PRD de Rotación, RT12.5): el ticket admite tipos de línea: producto, promoción y combo. Una promoción (2x1/NxM, segunda unidad al X%) se muestra como una línea de promoción debajo de los productos que la generan ("Promo 2x1 Jorgito −$900,00"); un combo muestra su nombre, sus componentes y su precio ("Combo merienda $2.000,00: Alfajor Jorgito + Coca-Cola 500 ml"). El descuento de la promoción se prorratea entre las líneas que la componen (RT12.7, mayor resto como TV4.5), cada componente conserva su movimiento de stock (RT12.6) y los totales y el "Ahorraste" incluyen las promociones. Las unidades con promoción no admiten descuento manual de línea, salvo que la promoción sea acumulable (RT12.3).

### Criterios de aceptación:

☐ El ticket de una venta de 2 Coca-Cola 500 ml a $1.400 muestra "Coca-Cola 500 ml · 2 × $1.400,00 · $2.800,00", con el nombre del comercio, la fecha y hora de Buenos Aires, el número y mi nombre como vendedor.

☐ Si después cambio el nombre o el precio del producto, el ticket ya emitido sigue mostrando los datos del momento de la venta.

☐ En ningún formato del ticket del cliente aparecen el costo, la ganancia ni el markup, aunque quien lo mire sea el dueño.

☐ El link público muestra solo el nombre de pila del vendedor.

☐ Un ticket con una devolución parcial muestra "Devolución parcial" y el enlace a la devolución, y sus líneas y total originales no cambian.

☐ Con el 2x1 Jorgito activo, vendo 2 Jorgito a $900: el ticket muestra las dos líneas de producto y debajo "Promo 2x1 Jorgito −$900,00", total $900,00, "Ahorraste $900,00", y el stock baja 2 unidades.

☐ Un combo "Combo merienda $2.000,00" muestra su nombre, sus dos componentes y su precio, y genera un movimiento de stock por componente.

### TV3. Numeración secuencial por comercio, segura offline (P0)

Descripción: cada comercio tiene su propia numeración correlativa de tickets (en su propia base de datos), que no se rompe con el modo offline ni con varios dispositivos vendiendo a la vez.

### Requerimientos:

TV3.1 Número definitivo: correlativo por comercio (000001, 000002, …), sin huecos, asignado por el servidor dentro de la transacción que inserta el ticket (contador por comercio con bloqueo de fila, no una SEQUENCE de Postgres, que puede dejar huecos ante un rollback; ver 6.5). Como cada comercio tiene su base, la numeración es independiente entre comercios.

TV3.2 Venta online: el ticket recibe su número definitivo en el momento.

TV3.3 Venta offline: el dispositivo asigna un número provisorio = código corto del dispositivo + secuencia local del dispositivo (por ejemplo, "A3-0045"). El código del dispositivo lo asigna el servidor al registrar el dispositivo en devices (único por comercio) y la secuencia local es monotónica y persistente en la base SQLite del dispositivo. Al sincronizar, el servidor asigna el número definitivo (en el orden en que las ventas llegan al servidor) y guarda el provisorio como alias permanente.

TV3.4 El número provisorio se puede buscar siempre (en el historial, en la devolución, en el link), aunque el ticket ya tenga número definitivo; el ticket muestra ambos: "Ticket N.º 000123 (provisorio A3-0045)".

TV3.5 Un ticket compartido o impreso offline lleva el número provisorio; el cliente que vuelva con ese número se encuentra igual (TV3.4).

TV3.6 Detección de huecos por dispositivo: el servidor controla que las secuencias locales de cada dispositivo lleguen sin huecos (A3-0044, A3-0045, …); si falta una, alerta en el Control Plane y al dueño (dispositivo perdido o base local dañada), en línea con el objetivo de "cero movimientos perdidos" del PRD de Offline.

TV3.7 El orden del número definitivo puede no coincidir con el orden cronológico de las ventas (una venta offline de las 18:05 sincronizada a las 18:40 recibe un número posterior a las ventas online de 18:10 a 18:40). El historial ordena por fecha y hora de la venta y muestra el número; la ayuda lo aclara.

TV3.8 Los documentos de devolución (TV13) tienen su propia numeración correlativa por comercio ("Devolución N.º 000017"), con el mismo esquema online/offline.

### Criterios de aceptación:

☐ Dos celulares venden online al mismo tiempo: los tickets reciben números consecutivos distintos, sin repetidos ni huecos.

☐ Sin conexión vendo 3 veces desde el celular con código "A3": los tickets son A3-0045, A3-0046 y A3-0047; al volver la conexión reciben números definitivos consecutivos y se siguen encontrando por "A3-0046".

☐ Si una transacción falla y se revierte, el próximo ticket no deja un hueco en la numeración.

☐ Si llega al servidor A3-0047 sin A3-0046, se genera una alerta de hueco para ese dispositivo.

☐ Un comercio nuevo empieza en 000001, independientemente de los demás comercios.

### TV4. Descuentos en el ticket (P0)

Descripción: el ticket registra los descuentos aplicados en la venta: por línea y a nivel ticket, en porcentaje o monto fijo. Las reglas de negocio de los descuentos (quién puede aplicarlos, límites, motivos) las define el PRD principal (en edición); acá se propone un comportamiento mínimo y se fijan el cálculo, el redondeo y el prorrateo, que son responsabilidad del ticket.

### Requerimientos:

TV4.1 Descuento por línea: porcentaje (por ejemplo, 10%) o monto fijo (por ejemplo, $100) sobre el subtotal de la línea. Se guarda el tipo, el valor ingresado y el importe resultante en centavos.

TV4.2 Descuento del ticket: porcentaje o monto fijo sobre el subtotal (suma de netos de línea, es decir, después de los descuentos de línea). Un solo descuento de ticket por venta.

TV4.3 Orden de cálculo: (1) subtotal de línea = precio unitario × cantidad; (2) descuento de línea; (3) neto de línea; (4) subtotal del ticket = Σ netos de línea; (5) descuento del ticket; (6) total = subtotal − descuento del ticket.

TV4.4 Redondeo: todos los importes se calculan en centavos enteros; un descuento porcentual se redondea al centavo, mitad hacia arriba (por ejemplo, 10% de $1.234,55 = $123,455 → $123,46). El redondeo comercial del total (a $1 o $10) para efectivo queda como pregunta abierta (7.2).

TV4.5 Prorrateo del descuento del ticket entre las líneas: el importe del descuento del ticket se reparte entre las líneas en proporción a su neto, con el método del mayor resto, para que la suma de lo repartido sea exactamente el descuento (sin perder ni sumar un centavo). Cada línea guarda su parte (descuento_ticket_asignado). Esto permite calcular la ganancia por línea y los reintegros de devoluciones parciales con precisión (TV13, PRD principal F10.5).

TV4.6 Ganancia: la ganancia de cada línea se calcula sobre lo efectivamente cobrado: (neto de línea − descuento del ticket asignado) − costo unitario congelado × cantidad. El precio y el costo se congelan al momento de la venta (PRD principal F2.10, F7). El markup y el margen del producto (F7) no cambian por un descuento; el reporte de ventas muestra el margen realizado.

TV4.7 Límites (propuesta, hasta que el PRD principal los fije): el dueño configura el descuento máximo que puede aplicar un empleado (por defecto, 10% o su equivalente en monto) y si un descuento por encima requiere autorización del dueño (en el mismo dispositivo con su sesión o, P1, remota desde su celular). El total nunca puede ser negativo ni cero en el MVP (un "regalo" se registra como egreso por consumo interno, no como venta con 100% de descuento).

TV4.8 Precio editado: si el dueño habilita editar el precio en la venta (F2.10), el ticket muestra el precio cobrado como precio unitario y, en el detalle interno (no en el del cliente), el precio de lista y la marca "precio editado".

TV4.9 (P1) Motivo de descuento (lista configurable: "cliente habitual", "producto por vencer", "promo", "otro" con nota) y reporte de descuentos por período, empleado y producto.

### Criterios de aceptación:

☐ Venta: 2 Coca-Cola 500 ml a $1.400 ($2.800), 1 Alfajor Jorgito a $900 con 10% de descuento de línea (−$90, neto $810) y 1 Chocolate Águila a $2.500. Subtotal $6.110. Aplico 5% al ticket: descuento $305,50 y total $5.804,50.

☐ En esa venta, el descuento del ticket queda prorrateado en $140,00 (Coca-Cola), $40,50 (alfajor) y $125,00 (chocolate), que suman exactamente $305,50.

☐ Un 10% sobre $1.234,55 da $123,46 de descuento (redondeo al centavo, mitad hacia arriba).

☐ Con un descuento de ticket de monto fijo de $1.000 sobre tres líneas cuyo reparto proporcional da decimales periódicos, la suma de lo asignado a las líneas es exactamente $1.000,00.

☐ Un empleado con tope de 10% no puede confirmar una venta con 15% de descuento sin la autorización del dueño.

☐ No puedo confirmar una venta con total $0 ni negativo.

☐ La ganancia registrada de la línea de Coca-Cola del ejemplo (costo $1.000 por unidad) es $2.800 − $140 − $2.000 = $660.

### TV5. Medio de pago (P0) y pago dividido (P1)

Descripción: el ticket registra con qué se pagó, usando los cinco medios de la caja.

### Requerimientos:

TV5.1 Medio único (P0): al confirmar la venta se elige uno de los cinco medios del PRD de Caja (C4.1): Efectivo, Débito, Mercado Pago, QR, Transferencia bancaria, como botones grandes con ícono (los desactivados por el dueño no aparecen, C4.3). El medio por defecto es configurable (por ejemplo, Efectivo) y la app sugiere el último usado en ese dispositivo, siempre visible antes de confirmar.

TV5.2 QR vs. Mercado Pago: se respeta la distinción de C4.5 ("QR" para cobros con código QR en el mostrador; "Mercado Pago" para link de pago, transferencia al CVU de Mercado Pago, etc.).

TV5.3 Efectivo, "Paga con" y vuelto (P0, opcional): al elegir Efectivo, campo opcional "Paga con" con botones rápidos ($1.000, $2.000, $10.000, $20.000, "Justo") que calcula el vuelto. Se muestran en el ticket; la caja registra solo el importe de la venta (no lo recibido).

TV5.4 Comprobante QR: si la venta fue por QR o Mercado Pago, el ticket muestra (cuando exista) la asociación con el comprobante de pago (PRD de Caja C13: carga al bot o lectura de Gmail por número de operación), por ejemplo "Comprobante asociado ✓ Op. 123456789". La asociación es posterior y no modifica el ticket: se guarda en cash_qr_receipts vinculada al ingreso de caja del ticket.

TV5.5 Pago dividido (P1): el total se reparte entre dos o más medios (por ejemplo, $3.000 en efectivo + $2.804,50 por QR). La suma de los pagos debe ser exactamente el total; cada pago genera su propio ingreso en la caja con su medio (C3), vinculado al ticket.

TV5.6 En el MVP (medio único) el modelo ya usa una tabla de pagos por ticket (ticket_payments, 6.2) con una sola fila, para que el pago dividido no requiera migrar datos.

TV5.7 Un error en el medio de pago no se corrige editando el ticket: ver TV14 (P1). En el MVP, el dueño lo corrige anulando el ticket (devolución total) y rehaciendo la venta (ver 7.2).

TV5.8 "A cuenta (fiado)": además de los cinco medios, al cobrar aparece la opción "A cuenta (fiado)" (si el comercio activó el fiado). Exige elegir o dar de alta el cliente de la cuenta corriente; el ticket muestra el nombre del cliente (TV2.4) y queda vinculado al cargo en su cuenta. No es un medio de la caja: la venta no genera ingreso en la caja al momento; el cobro posterior de la deuda lo registra el PRD de Fiado. Límites de crédito, permisos, cobros y devoluciones de ventas a cuenta se definen en el PRD de Fiado (en redacción); ver 7.2, pregunta 15.

### Criterios de aceptación:

☐ Confirmo una venta de $5.804,50 eligiendo QR: el ticket muestra "Pago: QR $5.804,50" y la caja tiene un ingreso de $5.804,50 en QR, categoría Ventas, vinculado al ticket.

☐ Elijo Efectivo y "Paga con $10.000": el ticket muestra "Vuelto $4.195,50" y la caja registra un ingreso en efectivo de $5.804,50 (no de $10.000).

☐ Si el dueño desactivó Débito, no aparece al cobrar, pero los tickets anteriores en débito siguen mostrando "Débito".

☐ (P1) Divido el pago en $3.000 en efectivo y $2.804,50 por QR: el ticket muestra las dos líneas, la caja tiene dos ingresos vinculados al mismo ticket y no puedo confirmar si los pagos no suman exactamente el total.

☐ Cuando el email de Mercado Pago confirma la operación (C13), el ticket muestra "Comprobante asociado ✓" sin que cambien sus datos.

☐ Elijo "A cuenta (fiado)" y el cliente "Marta Gómez": el ticket muestra "Pago: A cuenta (fiado) — Marta Gómez $5.804,50", la caja no registra ingreso y el cargo queda en la cuenta de Marta vinculado al ticket.

☐ No puedo confirmar una venta "A cuenta (fiado)" sin elegir un cliente.

### TV6. Vínculos con stock y caja, e inmutabilidad (P0)

Descripción: el ticket es el documento que une la venta con su efecto en el stock y en la plata, y es inmutable como el resto de la auditoría.

### Requerimientos:

TV6.1 Vínculo con el stock: cada línea del ticket referencia el movimiento "egreso por venta" inmutable que descontó el stock (ticket_lines.stock_movement_id, único) y cada movimiento referencia el ticket (stock_movements.sale_id, PRD principal 6.3).

TV6.2 Vínculo con la caja: cada pago del ticket referencia su ingreso en la caja (ticket_payments.cash_movement_id, único) y cada ingreso referencia el ticket (cash_movements.origen = venta, con referencia al ticket). Si el módulo Caja no está activo, el pago queda registrado solo en el ticket.

TV6.3 Navegación: desde el ticket se abre cada movimiento de stock ("Ver trazabilidad" del producto, F3.10) y cada ingreso de caja; desde un movimiento de stock o un ingreso de caja se abre el ticket.

TV6.4 Inmutable: un ticket emitido no se edita ni se borra (ni el dueño, ni soporte, ni la API, ni la base). Tablas append-only con permisos y triggers, como stock_movements (PRD principal 6.11) y cash_movements (PRD de Caja 6.3).

TV6.5 Correcciones por documentos vinculados: anulación y devoluciones (TV13) y corrección de medio de pago (TV14, P1). El ticket muestra los documentos vinculados; sus datos originales no cambian.

TV6.6 Consistencia verificable: un job nocturno verifica, por ticket, que total = Σ netos de línea − descuento del ticket = Σ pagos = Σ ingresos de caja vinculados (si Caja está activa), y que cada línea tenga su movimiento con la misma cantidad. Una diferencia genera una alerta interna, sin corrección silenciosa.

TV6.7 (P1) Cadena de hashes de tickets (como F3.11), con el código de verificación en el PDF del ticket.

### Criterios de aceptación:

☐ Desde el ticket N.º 000123 abro el movimiento "Egreso por venta −2" de la Coca-Cola y el ingreso de $5.804,50 en la caja; desde cada uno vuelvo al ticket.

☐ Ni siquiera el dueño ve opciones para editar o borrar un ticket; un UPDATE o DELETE directo sobre las tablas del ticket es rechazado.

☐ El job de consistencia marca un ticket cuyo total no coincide con sus pagos (prueba controlada) y no lo corrige solo.

### TV7. Leyenda no fiscal y alcance fiscal (P0)

Descripción: el ticket no es una factura ni un documento equivalente y tiene que decirlo de forma visible, sin parecerse a un comprobante fiscal.

### Requerimientos:

TV7.1 Leyenda obligatoria en todos los formatos (pantalla, link público, PDF, imagen, texto de wa.me, plantilla de WhatsApp e impresión), en mayúsculas y debajo del total: "DOCUMENTO NO VÁLIDO COMO FACTURA" [a verificar].

Fundamento: la normativa de ARCA (RG AFIP 1415/2003, texto actualizado) usa la fórmula "Documento no válido como factura" para documentos que no son factura (por ejemplo, el art. 28 para remitos y el Anexo V), y su art. 10 enumera documentos que no son comprobantes válidos como factura (documentos no fiscales de controladores fiscales, remitos, presupuestos, recibos, entre otros). No hay una leyenda específica para el comprobante interno de un software no fiscal, por lo que se adopta la fórmula habitual [a verificar con un contador y con la normativa vigente de ARCA].

El guion del video del PRD de Onboarding (escena 5, ON6.4) usa "Comprobante no válido como factura". Se recomienda unificar en la fórmula de ARCA ("Documento no válido como factura") en el video y en el producto (ver 7.2).

TV7.2 Nada que imite una factura: el ticket no lleva la palabra "Factura", ni letra de comprobante (A, B, C, X, R), ni CAE/CAI, ni punto de venta fiscal, ni IVA discriminado, ni la frase "consumidor final". El título es "Ticket de venta" o "Comprobante de venta (no fiscal)".

TV7.3 Aviso al comercio: en la configuración del ticket y en el primer uso: "Este ticket es un resumen de tu venta. No reemplaza la factura: si tenés que facturar, seguí haciéndolo con las herramientas de ARCA." [a verificar texto con un contador].

TV7.4 La leyenda no es configurable por el comercio (no se puede ocultar). Su texto se versiona (leyenda_version) para que un cambio futuro no altere los tickets ya emitidos.

TV7.5 Facturación electrónica ARCA (fuera de alcance): la factura B/C electrónica (web services de ARCA, CAE, puntos de venta) es una consideración futura para comercios más grandes (Fase 3, ver 8). Si se suma, el ticket podría vincularse a la factura emitida, sin dejar de existir como documento interno.

### Criterios de aceptación:

☐ La leyenda "DOCUMENTO NO VÁLIDO COMO FACTURA" se ve en la pantalla del ticket, en el link público, en el PDF, en la imagen, en el texto de wa.me y en la impresión.

☐ No existe configuración para ocultar la leyenda.

☐ Ningún formato del ticket contiene "Factura", una letra de comprobante, CAE ni IVA discriminado.

☐ Al usar el ticket por primera vez, el dueño ve el aviso de que no reemplaza la factura.

### TV8. Historial de tickets: búsqueda y filtros (P0)

Descripción: lista de todos los tickets del comercio, pensada primero para el celular, para encontrar una venta rápido.

### Requerimientos:

TV8.1 Acceso: "Vender" → "Ventas" (y desde Caja → ingreso de venta, o Inventario → movimiento). En el celular, lista de tarjetas (número, hora, total, medio, vendedor, cantidad de ítems, estado); en la PC, tabla.

TV8.2 Búsqueda: por número (definitivo o provisorio, exacto o parcial: "123" encuentra 000123), por producto (nombre, con la misma búsqueda difusa de F2.12, o escaneando el código con lector o cámara) y por monto (exacto, por ejemplo "5804,50").

TV8.3 Filtros: rango de fechas (hoy, ayer, esta semana, jornada de caja, personalizado), vendedor, medio de pago, estado (normal / con devolución parcial / anulado-devuelto total / provisorio pendiente de sincronizar), con descuento (sí/no), dispositivo, compartido (sí/no).

TV8.4 Totales del filtro: cantidad de tickets, total vendido, total de descuentos, devoluciones y neto; ticket promedio. Los totales coinciden con el resumen de la caja para la misma jornada (C12).

TV8.5 Permisos: el empleado ve por defecto sus tickets de la jornada en curso; con permiso, todos. Costos y ganancias, solo con permiso (F7.6).

TV8.6 Rendimiento: primera página en menos de 1 s con 100.000 tickets; paginación por cursor (fecha, id).

TV8.7 Offline: el historial muestra los tickets del dispositivo y los últimos sincronizados guardados en la base local (por ejemplo, los últimos 7 días, a definir con el PRD de Offline), con la marca "pendiente de sincronizar" en los provisorios.

TV8.8 (P1) Exportar el historial filtrado a CSV/Excel y PDF (mismo patrón que F3.12: generación en el servidor y registro en el log de auditoría).

### Criterios de aceptación:

☐ Escribo "123" y aparece el ticket 000123; escribo "A3-0046" y aparece el ticket que se hizo offline con ese número provisorio.

☐ Escaneo con la cámara una Coca-Cola 500 ml y veo los tickets recientes que la incluyen.

☐ Filtro "ayer, QR, vendedor Lucas" y veo la cantidad de tickets y el total, y ese total coincide con los ingresos por QR de Lucas en la caja de ayer.

☐ Un empleado sin permiso no ve los tickets de otros días ni de otros vendedores.

☐ Con 100.000 tickets, la primera página carga en menos de 1 s en el celular con 4G.

### TV9. Vista del ticket y link público (P0)

Descripción: cómo se ve el ticket dentro de la app y cómo lo ve el cliente con un link, sin cuenta.

### Requerimientos:

TV9.1 Vista en la app: el ticket con el formato del cliente (TV2) y, debajo, el detalle interno: método de identificación por línea, dispositivo, hora del dispositivo y del servidor (si fue offline), vínculos a movimientos y caja, documentos vinculados, historial de envíos (canal, fecha, estado) y, con permiso, costo y ganancia.

TV9.2 Link público: https://<dominio>/t/<token>, con un token aleatorio no adivinable de al menos 128 bits (por ejemplo, 22 caracteres base64url), independiente del número de ticket y del comercio (no se puede deducir uno del otro ni recorrer tickets cambiando el número).

TV9.3 Vencimiento: el link vence por defecto a los 90 días (configurable por el dueño entre 7 y 365 días). Vencido, muestra "Este comprobante ya no está disponible. Pedíselo a {comercio}." sin datos de la venta.

TV9.4 Revocación: el dueño puede revocar el link de un ticket (por ejemplo, si se lo mandó a un número equivocado) y generar uno nuevo.

TV9.5 Contenido de la página pública: solo lo de TV2 (formato cliente), con la leyenda y el botón "Descargar PDF", sin ningún dato interno. Página noindex, sin scripts de terceros ni analytics que expongan el token, con Referrer-Policy: no-referrer.

TV9.6 Abuso: límite de pedidos por IP y por token; cada acceso suma un contador y la fecha del último acceso (sin guardar la IP completa).

TV9.7 Un ticket creado offline puede tener link desde el principio (el token se genera en el dispositivo); hasta que se sincroniza, el link muestra "Este comprobante se está sincronizando, probá de nuevo en unos minutos".

### Criterios de aceptación:

☐ Abro el link de un ticket en un navegador sin sesión y veo el ticket con la leyenda y el botón de PDF, sin costos, sin teléfono del cliente y con el nombre de pila del vendedor.

☐ Cambiar un carácter del token muestra "no disponible" y no revela si existe otro ticket.

☐ A los 91 días (con el vencimiento por defecto) el link muestra "no disponible".

☐ Revoco el link y deja de funcionar en el acto; el link nuevo funciona.

☐ El link de un ticket offline muestra "se está sincronizando" hasta que el ticket llega al servidor y, después, el ticket.

### TV10. PDF e imagen del ticket (P0)

Descripción: el ticket se puede bajar o compartir como PDF o imagen, con la misma plantilla en todos los formatos.

### Requerimientos:

TV10.1 PDF en formato de tira (ancho de 58 mm u 80 mm según la configuración del comercio; por defecto, 80 mm), legible en el celular.

TV10.2 Imagen PNG del ticket (para compartir en WhatsApp como foto), con un ancho pensado para pantalla de celular.

TV10.3 Una sola plantilla (componente de renderizado compartido) para pantalla, link, PDF, imagen e impresión, para que los datos y el formato coincidan siempre.

TV10.4 Online, el PDF se genera en el servidor a partir de los datos de la base; offline, la imagen (y, si es viable, el PDF) se genera en el dispositivo con la misma plantilla y los datos locales (6.6).

TV10.5 El PDF incluye el número (definitivo y/o provisorio), la leyenda, el código QR al link público (P1) y la versión de la leyenda.

### Criterios de aceptación:

☐ Descargo el PDF del ticket 000123 y coincide línea por línea con la pantalla.

☐ Sin conexión, genero la imagen de un ticket provisorio y la comparto por WhatsApp.

☐ El PDF de 58 mm no corta nombres largos de productos: los parte en dos renglones.

### TV11. Compartir desde el WhatsApp del comerciante (P0, opción por defecto)

Descripción: la forma por defecto de mandarle el ticket al cliente es desde el WhatsApp del propio comerciante (su app de WhatsApp en el celular o WhatsApp Web en la PC), sin usar la API de WhatsApp de la plataforma. No tiene costo para la plataforma ni para el comercio y no consume el cupo de mensajes del plan.

### Requerimientos:

TV11.1 Botón "Compartir por WhatsApp" en el ticket recién creado y en cualquier ticket del historial.

TV11.2 Con número del cliente (wa.me): si el cliente da su número, el comerciante lo escribe (teclado numérico, con +54 por defecto) y la app abre https://wa.me/<número E.164 sin +>?text=<texto>, que abre el chat con ese número en el WhatsApp del comerciante con el texto precargado; el comerciante toca Enviar. Normalización de números argentinos (54 9 + característica + número, sin 0 ni 15), igual que en el PRD del bot (B1).

TV11.3 Sin número (elegir contacto): https://wa.me/?text=<texto> abre WhatsApp para elegir el chat (por ejemplo, si el cliente ya está agendado).

TV11.4 Texto precargado (corto, sin promociones), por ejemplo: "Hola, te paso el comprobante de tu compra en {Comercio}: Ticket N.º 000123 del 09/10/2026 18:42, total $5.804,50 (QR). Ver detalle: https:///t/ — DOCUMENTO NO VÁLIDO COMO FACTURA". Si el link no está disponible, el texto incluye el detalle resumido de las líneas.

TV11.5 Compartir PDF o imagen (Web Share API): "Más opciones" → "Compartir PDF" / "Compartir imagen" usa la hoja de compartir del sistema (navigator.share con archivos), desde donde el comerciante elige WhatsApp u otra app [a verificar soporte de compartir archivos en Chrome Android y Safari iOS con la PWA instalada]. Si el navegador no lo soporta, se descarga el archivo para adjuntarlo a mano.

TV11.6 Número del cliente: el número que se escribe para wa.me no se guarda por defecto (solo se usa para armar el link). El dueño puede activar "Recordar números de clientes" (P2) con aviso de privacidad (TV18).

TV11.7 Se registra el evento de compartir (canal wa.me / Web Share / link copiado, usuario, fecha y hora) en el ticket, sin el número del cliente; la app no puede saber si el mensaje efectivamente se envió.

TV11.8 Offline: wa.me funciona sin conexión (WhatsApp encola el mensaje y lo manda cuando vuelve la señal); el link del texto queda disponible al sincronizar (TV9.7).

### Criterios de aceptación:

☐ Después de una venta toco "Compartir por WhatsApp", escribo 11 2345-6789 y se abre mi WhatsApp en el chat de +54 9 11 2345-6789 con el texto del ticket y el link precargados.

☐ Sin número, se abre WhatsApp para elegir el contacto con el mismo texto.

☐ En un Android con la PWA instalada, "Compartir imagen" abre la hoja de compartir y puedo elegir WhatsApp.

☐ Compartir por wa.me no descuenta nada del cupo de mensajes del plan ni genera costo de WhatsApp para la plataforma.

☐ El número que escribí no queda guardado en el ticket ni en ningún otro lado (con "Recordar números" desactivado).

### TV12. Envío desde el número central de WhatsApp (P1, opcional por comercio)

Descripción: como alternativa, el ticket se puede enviar desde el número central de la plataforma (el único número de WhatsApp Business, según el PRD de Onboarding y el documento de costos), sin que el comerciante abra su WhatsApp. Es un mensaje iniciado por la empresa a un tercero (el cliente del comercio, que no le escribió al número central), por lo que solo se puede enviar con una plantilla aprobada por Meta (categoría utilidad) y con el consentimiento del cliente, y tiene costo.

### Requerimientos:

TV12.1 Activación por comercio: apagado por defecto. El dueño lo activa en Configuración → Ticket, con el aviso: "Cada ticket enviado desde nuestro número usa un mensaje de tu cupo mensual. La opción gratis es compartirlo desde tu WhatsApp."

TV12.2 Plantilla de utilidad aprobada (por ejemplo, ticket_venta, es_AR), transaccional y sin promociones [a verificar la categorización vigente de Meta para comprobantes de compra; Meta puede recategorizar plantillas]. Contenido propuesto:

Cuerpo: "Hola. {{1}} te envía el comprobante de tu compra N.º {{2}} del {{3}}, total {{4}}. DOCUMENTO NO VÁLIDO COMO FACTURA."

Botón URL con sufijo variable: "Ver comprobante" → https://<dominio>/t/{{token}} [a verificar soporte de botones URL dinámicos en plantillas de utilidad].

Botón de respuesta rápida: "No recibir más" (BAJA).

Alternativa: encabezado de tipo documento con el PDF [a verificar].

TV12.3 Consentimiento del cliente (obligatorio): antes de enviar, el vendedor marca "El cliente pidió recibir su ticket por WhatsApp en este número" (casilla sin premarcar). Se guarda el consentimiento (número cifrado, fecha y hora, usuario, ticket) en la base del comercio. Las políticas de WhatsApp Business exigen opt-in del destinatario [a verificar requisitos de Meta cuando el opt-in lo recoge un tercero (el comercio) para el número de la plataforma].

TV12.4 Costo y cupo: cada mensaje entregado cuesta ~USD 0,026 (plantilla de utilidad en Argentina, según el documento de costos [a verificar contra la tarifa oficial de Meta]) y descuenta 1 mensaje del cupo mensual del plan del comercio (Básico 100, Plus 300, Pro 600 mensajes por mes, según el documento de costos). La app muestra el cupo restante antes de enviar. Con el cupo agotado, el envío por número central se bloquea y se ofrece wa.me (gratis) o el paquete extra.

TV12.5 Registro de uso: cada envío se registra en whatsapp_usage con la marca ticket_cliente (tenant, categoría utilidad, costo estimado, wamid, estado de entrega), para el control de costos del Control Plane.

TV12.6 Opt-out del cliente: si el cliente toca "No recibir más" o escribe "BAJA", ese número queda bloqueado para tickets de ese comercio (se evalúa un bloqueo global en el número central; ver 7.2). El sistema no vuelve a enviarle tickets y el vendedor ve "Este cliente pidió no recibir mensajes" al intentar.

TV12.7 Respuestas del cliente al número central: si el cliente responde, el bot contesta una sola vez con un mensaje fijo ("Este número solo envía comprobantes de {comercio}. Para consultas, contactá directamente al comercio.") y no sigue la conversación. Esa respuesta es un mensaje de servicio y tiene costo (documento de costos). El número del cliente no se vincula a ningún comercio como usuario del bot.

TV12.8 Límite de mensajería de Meta: los tickets a clientes son mensajes fuera de ventana a usuarios únicos nuevos y cuentan contra el límite de mensajería del portfolio (250 / 2.000 / 10.000 usuarios únicos por 24 h, según el documento de costos). El sistema aplica un tope diario por comercio (por ejemplo, 50 tickets por día, configurable desde el Control Plane) y un tope global; al acercarse al límite, prioriza las alertas al dueño (PRD del bot) y deriva los tickets a wa.me.

TV12.9 Calidad del número: como el número central es compartido por todos los comercios, los bloqueos o denuncias de clientes afectan la calificación de calidad de todo el servicio. El Control Plane monitorea la calidad y puede suspender el envío de tickets de un comercio con una tasa alta de bloqueos.

TV12.10 Estados: el ticket muestra el estado del envío (en cola, enviado, entregado, leído, fallido) y, si falla, ofrece wa.me.

TV12.11 Offline: el envío por número central queda en cola y sale al sincronizar; se cobra solo si se entrega.

### Criterios de aceptación:

☐ (P1) Con el envío por número central activado, ingreso el número del cliente, marco el consentimiento y toco "Enviar desde [plataforma]": al cliente le llega la plantilla con el nombre del comercio, el número de ticket, el total, la leyenda y el botón "Ver comprobante".

☐ (P1) Sin marcar el consentimiento, el botón de envío no se habilita.

☐ (P1) El envío descuenta 1 mensaje del cupo del plan: el contador de la app pasa de 87 a 86 y el registro en whatsapp_usage tiene la marca ticket_cliente.

☐ (P1) Con el cupo en 0, el envío por número central se bloquea y se me ofrece compartir desde mi WhatsApp.

☐ (P1) El cliente toca "No recibir más": la próxima vez que intento enviarle un ticket, la app me avisa que pidió no recibir mensajes y no se envía.

☐ (P1) El cliente responde "gracias" y recibe una sola respuesta automática que indica que el número solo envía comprobantes.

☐ (P1) Al llegar al tope diario del comercio, la app ofrece wa.me en lugar del número central.

### TV13. Devoluciones y anulación sobre el ticket (P0)

Descripción: el ticket es el punto de partida de las devoluciones del PRD principal (F10) y del PRD de Caja (C14). Como el ticket es inmutable, una devolución o una anulación es un documento nuevo vinculado al ticket.

### Requerimientos:

TV13.1 Desde el ticket: botón "Devolver" en la vista del ticket (además de "Vender" → "Devolución", buscando por número, ventas recientes o escaneo, F10.1).

TV13.2 Documento de devolución: "Devolución N.º 000017" (numeración propia, TV3.8) con fecha y hora, usuario, ticket original, líneas devueltas (producto, cantidad, importe), motivo, apto o no apto para la venta (F10.4), importe reintegrado, medio de reintegro elegido (y, como referencia, el medio de pago original de la venta) y la misma leyenda no fiscal. Se puede compartir igual que un ticket (wa.me, PDF, link).

TV13.3 Anulación: anular un ticket es una devolución total con motivo "anulación" (por ejemplo, se cobró dos veces o se confirmó por error) y sigue las mismas reglas (el stock vuelve y el reintegro se registra en la caja). El ticket queda marcado "Anulado" con el vínculo al documento.

TV13.4 Importes de reintegro con descuentos: se reintegra lo efectivamente cobrado por esa línea, es decir, el neto de línea menos el descuento del ticket asignado (TV4.5). Para devoluciones parciales de una línea, el reintegro acumulado de k unidades devueltas es redondeo(cobrado_línea × k / cantidad) y el reintegro de cada devolución es la diferencia con lo ya devuelto; así, devolver todas las unidades reintegra exactamente lo cobrado. La ganancia se revierte con el mismo criterio (F10.5).

TV13.5 Medio de reintegro (decisión tomada, ver 7.2 pregunta 5): el operador elige el medio con el que reintegra la plata, entre cualquiera de los cinco medios de la caja (Efectivo, Débito, Mercado Pago, QR, Transferencia bancaria), aunque sea distinto del medio con el que se cobró la venta (por ejemplo, una venta cobrada por QR se puede reintegrar en efectivo).

Precarga: la pantalla de devolución precarga el medio de pago de la venta (con pago dividido, P1, el de mayor monto; si hubo una corrección de medio, TV14, el medio vigente), pero el operador puede cambiarlo con un toque. Los medios desactivados por el dueño (C4.3) no aparecen.

Registro en la caja: el egreso "Devolución" se registra con el medio elegido (metodo_id) y guarda como referencia el medio de pago original de la venta (metodo_venta_original_id; con pago dividido, los medios originales). El saldo que baja es el del medio elegido (por ejemplo, reintegro en efectivo de una venta por QR: baja el saldo de efectivo, no el de QR).

Auditoría: el egreso queda con usuario, fecha y hora del servidor, origen y dispositivo, y se registra en el log de auditoría de la caja (cash_audit_log) la elección del medio: medio elegido, medio original de la venta, si difieren (medio_distinto) y nota opcional. El movimiento es inmutable: un error en el medio elegido se corrige revirtiendo el egreso (C7) y registrando un nuevo egreso de reintegro con el medio correcto, vinculado a la misma devolución, sin un nuevo movimiento de stock.

Tope: el monto reintegrado se controla contra lo cobrado en el ticket (TV13.4), no contra lo cobrado por cada medio: la suma de las devoluciones vigentes de un ticket nunca supera su total, cualquiera sea el medio elegido.

Medios electrónicos: igual que en C14.5, la caja solo registra; el reintegro real (en Mercado Pago, el banco o el posnet) lo hace el comerciante. La pantalla lo recuerda según el medio elegido.

Impacto en los otros PRD: esta regla reemplaza "el medio no se elige: se toma de la venta" (PRD de Caja C4.6 y C14.2, y la restricción de 6.3 que exige que el medio de la devolución sea igual al de la venta) y la regla del PRD principal F10.6 ("mismo medio de pago" y "otro medio solo con motivo obligatorio si el mismo no es posible"). Este documento no modifica esos PRD; quedan para actualizar (ver 7.2, pregunta 5).

TV13.6 Vínculos: el documento de devolución referencia el ticket, cada línea vendida (ticket_lines), los movimientos "devolución" (+) y, si aplica, "egreso por merma de devolución" (−), y el egreso de caja "Devolución" (C14.4) con el medio elegido y el medio original como referencia (TV13.5). Todo en una transacción (F10.6), incluida la entrada en cash_audit_log.

TV13.7 Vista del ticket: "Devuelto: 2 de 3" por línea y saldo devolvible (F10.8), y estado del ticket (TV2.6).

TV13.8 Permisos y plazos: los del PRD principal (F10.9) y del PRD de Caja (C14.9).

TV13.9 (P1) Cambio por otro producto (F10.10): devolución y ticket nuevo vinculados, con diferencia a cobrar o reintegrar.

### Criterios de aceptación:

☐ Desde el ticket 000123 (el del ejemplo de TV4), devuelvo 1 Coca-Cola apta: se crea la Devolución N.º 000017 por $1.330,00 ($2.800 − $140 = $2.660 cobrados por 2 unidades), el stock sube 1, la ganancia se reduce $330 y la caja registra un egreso "Devolución" de $1.330 con el medio que elegí, vinculado al ticket.

☐ Al abrir la devolución de un ticket cobrado por QR, el medio precargado es QR y puedo cambiarlo por cualquiera de los cinco medios activos (Efectivo, Débito, Mercado Pago, QR, Transferencia bancaria).

☐ Reintegro en efectivo $1.330 de una venta cobrada por QR: la caja registra un egreso "Devolución" de $1.330 con medio Efectivo y medio original de la venta QR como referencia; baja el saldo de efectivo y el de QR no cambia.

☐ Esa devolución queda en el log de auditoría de la caja con mi usuario, la fecha y hora del servidor, el medio elegido (Efectivo), el medio original (QR) y la marca "medio distinto"; en el detalle del egreso y en el documento de devolución se ven los dos medios.

☐ No puedo editar el medio de una devolución ya registrada: para corregirlo, revierto el egreso (C7) y registro un nuevo egreso de reintegro con el medio correcto, vinculado a la misma devolución; el stock no se mueve de nuevo.

☐ Elegir un medio distinto no permite reintegrar más de lo cobrado: la suma de las devoluciones de un ticket nunca supera su total.

☐ Sobre una línea de 3 unidades con $1.000,00 cobrados, devuelvo de a una: los reintegros son $333,33, $333,34 y $333,33, y suman exactamente $1.000,00.

☐ Anulo un ticket cobrado dos veces: se crea una devolución total con motivo "anulación", todo el stock vuelve, la caja registra el egreso y el ticket queda "Anulado" sin que cambien sus datos.

☐ No puedo devolver más unidades de las vendidas en una línea.

☐ Comparto la devolución por wa.me y el cliente ve el documento con la leyenda no fiscal.

### TV14. Corrección de medio de pago (P1)

Descripción: cuando el vendedor eligió mal el medio (marcó Efectivo y era QR), se corrige sin tocar el ticket ni el stock.

### Requerimientos:

TV14.1 El dueño (o un empleado con permiso) elige "Corregir medio de pago" en el ticket, indica el medio correcto y un motivo obligatorio.

TV14.2 En una transacción: se crea un documento ticket_payment_corrections vinculado al ticket, se revierte el ingreso de caja original (C7) y se crea un ingreso nuevo con el medio correcto. El stock no cambia.

TV14.3 El ticket muestra "Medio corregido: Efectivo → QR (motivo, usuario, fecha)"; el link público muestra el medio vigente con la nota "corregido". Las devoluciones posteriores precargan el medio vigente (el operador puede elegir otro, TV13.5).

TV14.4 Si la jornada del ticket ya cerró, la corrección se imputa como ajuste posterior al cierre (C12.7).

### Criterios de aceptación:

☐ (P1) Corrijo el medio del ticket 000124 de Efectivo a QR: en la caja aparecen la reversión del ingreso en efectivo y un ingreso nuevo por QR, el ticket muestra la corrección y su total no cambia.

### TV15. Impresión en impresora térmica de 58/80 mm (P2)

Descripción: para los comercios que quieran entregar el ticket en papel.

### Requerimientos:

TV15.1 Configuración de la impresora: ancho de papel de 58 mm u 80 mm (ancho imprimible aproximado de 48 mm / 72 mm, unos 32 / 42 a 48 caracteres por renglón [a verificar por modelo]) e impresión automática al confirmar (sí/no) o manual.

TV15.2 Métodos, en orden de preferencia [a verificar compatibilidad]: (a) diálogo de impresión del sistema con CSS de tira (impresoras instaladas en la PC o en Android); (b) ESC/POS por Web Bluetooth o WebUSB desde Chrome (Android/PC; no disponible en Safari iOS); (c) app puente de impresión en Android mediante intent.

TV15.3 Misma plantilla que TV10, con la leyenda; QR al link público opcional.

TV15.4 Reimpresión desde el historial, marcada "REIMPRESIÓN" con fecha y hora.

### Criterios de aceptación:

☐ (P2) Con una impresora térmica Bluetooth de 58 mm emparejada a un Android, al confirmar la venta se imprime el ticket con la leyenda en menos de 5 s.

☐ (P2) Una reimpresión lleva la marca "REIMPRESIÓN".

### TV16. Integraciones (P0 / P1)

### TV17. Funcionamiento offline (P0)

### Requerimientos:

TV17.1 Sin conexión, la venta genera el ticket en la base SQLite local con número provisorio (TV3.3), en la misma transacción local que el movimiento de stock y el ingreso de caja locales.

TV17.2 La vista del ticket, la imagen y el compartir por wa.me funcionan offline; el link público queda disponible al sincronizar.

TV17.3 Al sincronizar, el servidor inserta el ticket completo (cabecera, líneas, pagos, movimientos, ingresos) en una transacción, asigna el número definitivo y devuelve el mapeo provisorio → definitivo; el dispositivo actualiza su copia local. Idempotencia por la idempotency_key del ticket.

TV17.4 Si el servidor rechaza un ticket offline (por ejemplo, usuario revocado o producto inexistente), el ticket queda en cuarentena según el PRD de Offline; nunca se descarta en silencio y lo resuelve el dueño.

TV17.5 Sobreventa entre dispositivos offline: el ticket se acepta igual (es una venta que ocurrió) y el stock negativo se marca para revisión, según el PRD de Offline.

### Criterios de aceptación:

☐ En modo avión vendo, veo el ticket A3-0045, lo comparto por wa.me y, al volver la conexión, el ticket pasa a 000130 (A3-0045) sin que haga nada.

☐ La cola offline reenviada dos veces no duplica el ticket.

### TV18. Permisos y privacidad (P0)

### Requerimientos:

TV18.1 Matriz de permisos (por defecto):

TV18.2 Datos del cliente (Ley 25.326): el número de WhatsApp del cliente solo se guarda si el ticket se envió por número central (para el consentimiento, el opt-out y el estado de entrega) o si el dueño activó "Recordar números" (P2). Se guarda cifrado en la base del comercio, con hash para búsquedas, y solo se usa para enviar tickets de ese comercio. Retención propuesta: 12 meses desde el último envío [a definir con asesoría legal]. Nunca se usa para marketing ni se comparte entre comercios.

TV18.3 Todas las acciones sensibles (anulación, devolución, corrección de medio, revocación de link, envío por número central, cambio de configuración) quedan en el log de auditoría append-only.

TV18.4 El soporte de la plataforma accede a los tickets solo en modo lectura y con consentimiento del comercio (PRD principal 6.4).

### Criterios de aceptación:

☐ Un empleado sin permiso no ve los botones "Revocar link" ni "Corregir medio de pago".

☐ En la base del comercio, el número de un cliente al que se le envió un ticket por número central está cifrado y no aparece en texto plano en los logs.

### 4.19 Respuesta a la pregunta abierta del PRD de Onboarding

El PRD de Onboarding (ON6.4 y 8.2, pregunta 2) pregunta si se suma un comprobante de venta no fiscal para la escena de "facturación" del video, si va en el MVP o en P1, y cuándo se evalúa la facturación de ARCA. Respuesta de este PRD:

Sí: el ticket de venta no fiscal queda definido en este documento (TV1 a TV18).

En el MVP (P0): generación, contenido, numeración (con offline), descuentos, medio de pago único, vínculos e inmutabilidad, leyenda, historial, link público, PDF/imagen, compartir desde el WhatsApp del comerciante (wa.me / Web Share) y devoluciones vinculadas. Así, la escena 5 del video se puede grabar con funciones reales: al cobrar se muestra el ticket con cantidad, descripción, precio unitario y total, y se comparte desde el WhatsApp del comerciante.

P1: envío desde el número central (con plantilla, consentimiento y costo), pago dividido y corrección de medio de pago. P2: impresión térmica.

Leyenda: se recomienda que el video use la misma leyenda que el producto, "DOCUMENTO NO VÁLIDO COMO FACTURA" [a verificar], en lugar de "Comprobante no válido como factura" (7.2).

Facturación ARCA: fuera de alcance; evaluación en Fase 3 para comercios más grandes (8).

## 5. Flujos de usuario

### Flujo 1: venta con descuento (celular, sin lector)

Lucas (empleado) abre "Vender" en su celular. Escanea con la cámara 2 Coca-Cola 500 ml ($1.400 c/u); el alfajor no lee, así que toca "¿No lee? Buscar", escribe "jorjito" y elige Alfajor Jorgito ($900). Escanea un Chocolate Águila ($2.500).

El cliente dice que el alfajor está golpeado: Lucas toca la línea → "Descuento" → 10%. La línea muestra "−$90,00 · $810,00".

Es un cliente habitual: Lucas toca "Descuento al ticket" → 5%. El total pasa de $6.110,00 a $5.804,50 (descuento de $305,50). Está dentro de su tope de 10%, así que no hace falta autorización.

Toca "Cobrar" → Efectivo → "Paga con $10.000": vuelto $4.195,50. Confirma.

En una transacción se crea el Ticket N.º 000123 con 3 líneas, se descuentan los stocks (3 movimientos "egreso por venta" vinculados) y se registra el ingreso de $5.804,50 en efectivo en la caja.

La pantalla muestra el ticket con la leyenda y los botones "Compartir por WhatsApp" y "Nueva venta". Lucas toca "Nueva venta" y sigue atendiendo.

### Flujo 2: cobro con QR

Ana (dueña) vende un pack de pilas ($8.500) escaneándolo con el lector Bluetooth emparejado a su celular.

Toca "Cobrar" → QR. El cliente escanea el QR de Mercado Pago del mostrador y le muestra el pago aprobado en su celular. Ana confirma.

Se crea el Ticket N.º 000124 con "Pago: QR $8.500,00" y el ingreso por QR en la caja, vinculado.

Minutos después, la lectura de Gmail (beta cerrada, C13) encuentra el email de Mercado Pago con el número de operación y el monto, y lo asocia al ingreso del ticket. El ticket muestra "Comprobante asociado ✓ Op. 123456789", sin que cambien sus datos.

Si hubiera estado sin conexión, el ticket sería provisorio (por ejemplo, A1-0012) con el QR declarado por Ana, y la asociación del comprobante se haría después de sincronizar.

### Flujo 3: envío del ticket al cliente

### Camino por defecto (gratis, desde el WhatsApp del comerciante):

Después de confirmar el Ticket N.º 000123, el cliente pide el comprobante. Lucas toca "Compartir por WhatsApp" y escribe el número del cliente (11 2345-6789).

Se abre el WhatsApp de Lucas en el chat con +54 9 11 2345-6789, con el texto precargado (comercio, número, fecha, total, link y leyenda). Lucas toca Enviar.

El cliente abre el link y ve el ticket; puede bajar el PDF. El ticket registra "Compartido por wa.me" (sin guardar el número).

Alternativa: "Más opciones" → "Compartir imagen" abre la hoja de compartir del celular y Lucas elige WhatsApp.

### Camino opcional (P1, desde el número central):

El comercio tiene activado el envío por número central. Lucas toca "Enviar desde [plataforma]", escribe el número y marca "El cliente pidió recibir su ticket por WhatsApp en este número". La app muestra "Te quedan 86 mensajes este mes".

El sistema envía la plantilla de utilidad ticket_venta desde el número central, descuenta 1 mensaje del cupo y registra ~USD 0,026 en whatsapp_usage (ticket_cliente).

El ticket muestra "Enviado ✓ → Entregado ✓✓". Si el cliente toca "No recibir más", su número queda bloqueado para tickets de ese comercio.

### Flujo 4: consulta del historial

Al otro día, una clienta vuelve: "Ayer me cobraron dos veces el cargador". Ana abre "Ventas", filtra "Ayer" y escanea el cargador con la cámara.

Aparecen dos tickets de ayer, a las 19:02 y a las 19:03, con el cargador, mismo monto, mismo vendedor y medio QR.

Ana abre el segundo, revisa el detalle interno (dispositivo, hora, ingreso de caja) y confirma que fue un doble cobro.

Toca "Devolver" → "Anular ticket" con motivo "cobro duplicado" (Flujo 5) y hace la devolución del QR en Mercado Pago (C14.5).

### Flujo 5: devolución desde el ticket

Un cliente trae una Coca-Cola del Ticket N.º 000123 (o muestra el ticket en su WhatsApp). Lucas abre "Vender" → "Devolución" y escribe "123" (o escanea la botella y elige el ticket entre las ventas recientes).

Elige la línea Coca-Cola, cantidad 1, "Apta para la venta" y motivo "cambio de opinión". La app calcula el reintegro: $1.330,00 (lo cobrado por esa unidad, con los descuentos prorrateados) y precarga el medio de la venta (Efectivo). El cliente prefiere que se lo pasen por Mercado Pago, así que Lucas cambia el medio a Mercado Pago con un toque (podría elegir cualquiera de los cinco) y agrega la nota "cliente pidió MP".

Confirma (está dentro de su plazo y monto permitidos). En una transacción se crean la Devolución N.º 000017, el movimiento "Devolución +1" vinculado a la venta, la reversión proporcional de la ganancia ($330), el egreso "Devolución" de $1.330 por Mercado Pago en la caja (con "medio original de la venta: Efectivo" como referencia) y la entrada en el log de auditoría de la caja con el medio elegido, el original y la marca "medio distinto". Baja el saldo de Mercado Pago; el de efectivo no cambia. La pantalla le recuerda hacer la transferencia desde Mercado Pago (C14.5).

El ticket 000123 muestra "Devolución parcial · Coca-Cola: devuelto 1 de 2" con el enlace a la devolución. Lucas comparte la devolución por wa.me si el cliente la quiere.

### Flujo 6: venta sin conexión

Se corta el Wi-Fi y el indicador muestra "Sin conexión". Lucas sigue vendiendo con la cámara: el ticket sale como provisorio A3-0045.

Lo comparte por wa.me con el texto completo; WhatsApp lo envía cuando vuelve la señal.

Al volver la conexión, la app sincroniza sola: el ticket pasa a N.º 000130 (A3-0045), el link empieza a funcionar y el ingreso entra en la caja de la jornada correspondiente.

## 6. Notas técnicas

### 6.1 Principios

Una venta, una transacción, un ticket. El ticket no es un reporte derivado: es la cabecera de la venta y se escribe junto con los movimientos de stock y de caja.

Una base de datos por cliente. Tickets, líneas, pagos, devoluciones, envíos y consentimientos viven en la base del comercio. La base de control solo guarda lo mínimo para resolver un link público (6.7) y el uso de WhatsApp del número central (whatsapp_usage).

Inmutable y append-only, con las mismas barreras que stock_movements y cash_movements (permisos + triggers).

Dinero en centavos enteros (bigint), nunca float (PRD de Caja 6.3).

Mobile-first y offline-first: la plantilla y el cálculo de totales corren igual en el dispositivo (SQLite) y en el servidor.

### 6.2 Modelo de datos

sales es la misma entidad "ventas / tickets" del PRD principal (6.3). Este PRD la amplía y propone reemplazar sales.payment_method_id y sales.caja_movement_id por la tabla ticket_payments (para el pago dividido) y sumar ticket_lines como detalle con datos congelados (hoy el PRD principal usa los stock_movements como líneas; las dos tablas se vinculan 1 a 1). Todas las tablas están en la base del comercio, salvo indicación.

### Restricciones e índices:

UNIQUE (numero), UNIQUE (numero_provisorio) y UNIQUE (idempotency_key) en sales; UNIQUE (stock_movement_id) en ticket_lines; UNIQUE (cash_movement_id) en ticket_payments.

Trigger de restricción diferida (al COMMIT) que verifica: Σ ticket_lines.cobrado_centavos = sales.total_centavos = Σ ticket_payments.monto_centavos; Σ descuento_ticket_asignado_centavos = descuento_ticket_centavos; cada línea de producto (y cada componente de combo) tiene su movimiento con sale_id y la misma cantidad (con signo negativo).

Índices: (created_at DESC, id) para el historial por cursor; (user_id, created_at); (device_id, device_seq); (payment_method_code, sale_id) en pagos; (product_id, sale_id) en líneas (búsqueda por producto y rotación); (total_centavos) para la búsqueda por monto; trigramas sobre numero::text y numero_provisorio para la búsqueda parcial.

Append-only: el rol de la aplicación tiene solo INSERT, SELECT sobre sales, ticket_lines, ticket_payments y ticket_payment_corrections; triggers BEFORE UPDATE OR DELETE y BEFORE TRUNCATE que lanzan una excepción (PRD principal 6.11).

### 6.3 Transacción de confirmación de venta

En la base del comercio, dentro de una transacción:

Validar sesión, permisos, topes de descuento y productos (Zod en el dominio).

Recalcular en el servidor todos los importes (TV4) a partir de los precios y descuentos enviados; si difieren del cálculo del cliente, rechazar (online) o marcar para revisión (offline, según el PRD de Offline).

Asignar numero con ticket_counters (FOR UPDATE).

Insertar en sales.

Por línea: llamar a registrar_movimiento (PRD principal 6.11) con sale_id para obtener el stock_movement_id; insertar en ticket_lines.

Por pago: insertar el ingreso en cash_movements (si Caja está activa, con idempotency_key derivada del ticket y del pago); insertar en ticket_payments.

Insertar los eventos en notification_events (outbox), si corresponde.

COMMIT (se ejecutan los triggers diferidos de consistencia).

Online, la respuesta objetivo es menor a 500 ms para un ticket de hasta 20 líneas.

### 6.4 Dinero y redondeo

Montos en centavos (bigint); porcentajes en puntos básicos (10% = 1.000) para evitar decimales.

Descuento porcentual: round_half_up(base_centavos × pb / 10.000), con aritmética entera: (base × pb + 5.000) div 10.000 (base positiva).

Prorrateo por mayor resto: para cada línea, cuota_i = floor(D × neto_i / Σneto); el resto D − Σcuota_i se reparte de a 1 centavo entre las líneas con mayor parte fraccionaria (en caso de empate, mayor neto y luego menor linea_n). Es determinístico, para que el dispositivo y el servidor den lo mismo.

Reintegro parcial (TV13.4): acumulado(k) = round_half_up(cobrado_línea × k / cantidad); reintegro = acumulado(k_prev + k) − acumulado(k_prev).

Una única librería de dominio (TypeScript) compartida por el cliente (offline) y el servidor, con tests de propiedades (la suma de las partes siempre es igual al todo).

### 6.5 Numeración

Número definitivo con un contador en tabla (ticket_counters) bloqueado dentro de la transacción: garantiza correlatividad sin huecos (una SEQUENCE no lo garantiza ante rollbacks). La contención es baja (pocos dispositivos por comercio y una base por comercio).

Código de dispositivo: asignado por el servidor al registrar el dispositivo en devices (por ejemplo, letra + número, "A3"), único por comercio y nunca reutilizado.

Secuencia local del dispositivo: contador persistente en SQLite, incrementado en la misma transacción local que crea el ticket; si la base local se reinstala, el dispositivo pide un código nuevo (para no repetir provisorios).

El servidor registra el último device_seq recibido por dispositivo y detecta huecos (TV3.6).

### 6.6 Generación de PDF e imagen

Plantilla única en HTML/CSS (componente Astro/isla) parametrizada por ancho (58 mm / 80 mm / pantalla).

Servidor (online): PDF renderizado con Chromium headless (Playwright) o con una librería liviana (pdfmake / PDFKit) en el worker de la cola de jobs, como en F3.12. El PDF del ticket es chico: se genera bajo demanda (sincrónico) y se cachea en el almacenamiento de objetos con URL firmada de corta duración. PNG del ticket a partir del mismo HTML (captura de Chromium o Satori/resvg).

Dispositivo (offline): imagen PNG generada en el cliente (render a <canvas> o SVG → PNG) con los datos de la base local; PDF en el cliente con una librería JS liviana (por ejemplo, pdf-lib o jsPDF) si el rendimiento en un Android de gama media lo permite [a verificar].

Tipografía embebida con soporte de tildes y "ñ"; montos con formato argentino ($1.234,50).

Compartir archivos: Web Share API Level 2 (navigator.canShare({ files })) [a verificar soporte en Safari iOS y Chrome Android con la PWA instalada]; fallback de descarga.

### 6.7 Link público con token no adivinable y vencimiento

Token: 16 bytes aleatorios de un CSPRNG (crypto.getRandomValues), codificados en base64url (22 caracteres). Se puede generar en el dispositivo (offline) o en el servidor.

Resolución: la ruta pública /t/<token> calcula SHA-256(token), busca en public_ticket_links (base de control) el tenant_id y la referencia opaca, verifica vencimiento y revocación, abre la base del comercio y lee el ticket. La base de control no guarda datos de la venta.

El token en claro se guarda cifrado en la base del comercio (ticket_shares.token_cifrado, con clave por comercio en el gestor de secretos) para poder volver a compartir el mismo link; alternativamente, cada "Compartir" genera un link nuevo.

Vencimiento por defecto de 90 días (configurable entre 7 y 365); página con noindex, Cache-Control: private, no-store, Referrer-Policy: no-referrer y sin scripts de terceros; rate limiting por IP y por token; respuesta idéntica para token inexistente, vencido o revocado (no revela si existe).

Se registran accesos agregados (contador, último acceso), sin la IP completa.

### 6.8 WhatsApp

wa.me (P0): https://wa.me/<E164 sin +>?text=<urlencode(texto)> o https://wa.me/?text=...; sin API y sin costo, abre la app del comerciante. Texto corto (WhatsApp y los navegadores limitan el largo de la URL; se recomienda menos de ~1.000 caracteres [a verificar]).

Número central (P1): WhatsApp Business Platform (Cloud API) del PRD del bot (6.4). Plantilla de utilidad ticket_venta en es_AR, aprobada antes de habilitar la función; envío por la cola de jobs, con idempotencia por (ticket, número); los webhooks de estado (enviado, entregado, leído, fallido) actualizan ticket_whatsapp_deliveries; el costo se registra en whatsapp_usage (ticket_cliente) al confirmarse la entrega. Las respuestas entrantes de clientes (no vinculados) se resuelven con una respuesta fija única y "BAJA". Tope diario por comercio y global, y monitoreo de la calidad del número (TV12.8, TV12.9).

Precios [a verificar]: ~USD 0,026 por plantilla de utilidad entregada en Argentina (fuentes de terceros citadas en el documento de costos). Desde el 1/10/2026 las plantillas de utilidad se cobran incluso dentro de la ventana de 24 h (documento de costos), por lo que no hay envío gratis desde el número central.

### 6.9 Offline

Esquema SQLite local espejo de sales, ticket_lines, ticket_payments y ticket_shares (sin datos de otros dispositivos más allá de la ventana de historial cacheada).

Cola de sincronización: el ticket viaja como una unidad (cabecera + líneas + pagos + movimientos + ingresos) con su idempotency_key; la respuesta trae el numero asignado.

El detalle de conflictos, cuarentena, sobreventa y cifrado de la base local está en el PRD de Offline.

### 6.10 Seguridad, calidad y rendimiento

Permisos aplicados en el backend; el link público nunca expone datos internos.

Tests unitarios (Vitest) de cálculo (descuentos, redondeo, prorrateo, reintegros parciales y totales, con tests de propiedades), numeración concurrente (sin huecos ni repetidos con 10 dispositivos en paralelo), idempotencia e inmutabilidad (UPDATE/DELETE rechazados).

Tests E2E (Playwright) de los flujos 1 a 6 en viewport de celular (360 px) y de PC; prueba de wa.me y Web Share en dispositivos reales Android e iOS.

Rendimiento: confirmación < 500 ms (online, 20 líneas); historial < 1 s con 100.000 tickets; PDF del ticket < 2 s.

Backups por cliente (RPO 24 h / RTO < 4 h), igual que el resto de la base del comercio.

## 7. Riesgos y preguntas abiertas

### 7.1 Riesgos

### 7.2 Preguntas abiertas

Leyenda: ¿se confirma "DOCUMENTO NO VÁLIDO COMO FACTURA" (fórmula de la RG 1415) o se usa "Comprobante no válido como factura" (guion del video, ON6.4)? Validar con un contador y unificar en el producto y en el video [a verificar].

Carrito multiproducto en el MVP: ¿el Modo venta del PRD principal (en edición) agrupa varias líneas por venta en el MVP? Si no, el ticket del MVP es de una línea por confirmación.

Reglas de descuento: topes por rol, autorización del dueño (local o remota), motivos obligatorios: ¿los fija el PRD principal tal como se propone en TV4.7?

Cupo de mensajes: el documento de costos define el cupo del plan como "mensajes del bot (servicio)" y deja las plantillas de alerta aparte. Este PRD propone que cada ticket enviado por el número central descuente 1 mensaje del cupo. ¿Se confirma, o los tickets tienen un cupo propio o se venden solo como paquete extra? Hay que actualizar el documento de costos.

Medio de reintegro — RESUELTA (9/10/2026): el PRD principal (F10.6) permitía otro medio solo con motivo si el original no era posible y el PRD de Caja (C14.2) no permitía cambiarlo. Decisión: el operador elige el medio de reintegro entre cualquiera de los cinco medios; el medio elegido se registra y se audita en el movimiento de caja, con el medio original de la venta guardado como referencia (TV13.5, 6.2). Con pago dividido (P1), el operador elige el medio y el tope es el total del ticket, no lo cobrado por cada medio. Pendiente: actualizar C4.6, C14.2, C14.3 y la restricción de 6.3 del PRD de Caja, y F10.6 del PRD principal, para reflejar la decisión.

Corrección de medio de pago en el MVP: ¿alcanza con anular y rehacer la venta, o hace falta TV14 en el MVP? (Es un error frecuente en el mostrador.)

Redondeo comercial del total en efectivo (a $1 o $10, por falta de monedas): ¿se ofrece como opción (registrado como una línea "redondeo") o queda afuera?

Vencimiento del link público: ¿90 días por defecto es adecuado? Si el cliente lo pide más tarde, ¿el comercio genera un link nuevo?

Opt-out global: si un cliente pide BAJA a los tickets de un comercio, ¿se bloquea su número para los tickets de todos los comercios del número central?

Consentimiento: ¿qué exige Meta cuando el opt-in lo recoge el comercio en el mostrador para un mensaje que sale del número de la plataforma? ¿Alcanza la casilla del vendedor o hace falta que el cliente lo confirme (por ejemplo, escribiendo primero por wa.me al número central, lo que además abre la ventana de 24 h)? [a verificar]

Productos por peso o fraccionados (fiambrería, verdulería): ¿cantidades decimales en el ticket? Hoy el modelo es en unidades enteras.

Datos del comercio en el ticket: ¿se muestra el CUIT si está cargado, o se evita para no inducir a confundirlo con una factura?

Ventana del historial offline: ¿cuántos días de tickets se guardan en la base local del celular (propuesta: 7)? Coordinar con el PRD de Offline.

Unificación de nombres de campos con el PRD principal (sales.payment_method_id, caja_movement_id) y con el PRD de Caja (sale_id en cash_movements).

Fiado: alinear con el PRD de Fiado (en redacción) cómo se devuelve una venta "A cuenta (fiado)" (¿crédito a la cuenta del cliente en lugar de egreso de caja?), si se permite pago dividido entre un medio y "A cuenta" y qué datos del cliente se muestran en el link público.

## 8. Plan por fases

### Fase 0: diseño y validación (1 a 2 semanas)

Validar con un contador la leyenda y los textos de aviso (TV7), y la recomendación de no mostrar letra ni datos fiscales [a verificar].

Diseño mobile-first del ticket (pantalla, link, PDF de 58/80 mm, imagen) y prueba con 5 comercios: ¿lo comparten?, ¿por qué canal?

Pruebas en dispositivos reales: wa.me, Web Share con archivos (Android/iOS, PWA instalada) y generación de la imagen offline.

Cerrar con el PRD principal el carrito multiproducto y las reglas de descuento (preguntas 2 y 3), y alinear el PRD de Caja y el PRD principal con la decisión ya tomada sobre el medio de reintegro (pregunta 5, resuelta).

Iniciar la aprobación de la plantilla ticket_venta en Meta y la consulta de requisitos de opt-in (para P1).

### Fase 1: MVP del ticket (3 a 4 semanas, junto con el Modo venta del MVP)

P0: TV1 generación automática; TV2 contenido; TV3 numeración con provisorio offline; TV4 descuentos (cálculo, redondeo, prorrateo); TV5 medio único con "Paga con" y vuelto; TV6 vínculos e inmutabilidad, con el job de consistencia; TV7 leyenda; TV8 historial con búsqueda y filtros; TV9 vista y link público; TV10 PDF e imagen; TV11 wa.me y Web Share; TV13 devoluciones y anulación vinculadas; TV16 integraciones con caja, inventario, descuentos, devoluciones y eventos de notificación; TV17 offline; TV18 permisos.

Grabación de la escena 5 del video de onboarding con el ticket real (ON6.4).

### Fase 2: comodidad y canales (meses 2 y 3)

P1: pago dividido (TV5.5); envío por número central con plantilla, consentimiento, cupo y topes (TV12); corrección de medio de pago (TV14); cambio por otro producto (TV13.9); motivos y reporte de descuentos (TV4.9); exportación del historial (TV8.8); cadena de hashes (TV6.7); QR del link en el PDF; pie configurable y logo; datos de líneas para los reportes de rotación (TV16); alertas de descuento alto.

### Fase 3: papel y fiscal (meses 4 a 12)

P2: impresión térmica de 58/80 mm (TV15); envío por email; "Recordar números de clientes" con controles de privacidad.

Evaluación de facturación electrónica de ARCA (factura B/C, CAE) para comercios más grandes, por integración directa con los web services de ARCA o vía partner, con el ticket vinculado a la factura emitida. La decisión depende de la demanda, el costo de homologación y el soporte.

## Anexo A: glosario

Módulo | Integración | Prioridad
--- | --- | ---
Caja (PRD de Caja) | Cada pago del ticket = un ingreso en cash_movements (categoría Ventas, origen venta, vinculado al ticket) en la misma transacción; la jornada de caja se toma del ticket (online, hora del servidor; offline, reglas del PRD de Offline y C12.7 para jornadas cerradas); el resumen de cierre (C12.5) suma los tickets por medio; las devoluciones del ticket son egresos "Devolución" (C14) con el medio elegido por el operador y el medio original de la venta como referencia (TV13.5); los comprobantes QR (C13) se asocian al ingreso del ticket. Con el ticket, el "Registrar cobro" opcional de C8.8 pasa a ser parte de la confirmación de la venta. | P0
Inventario (PRD principal) | Cada línea = un movimiento "egreso por venta" inmutable (F3) creado por la función única de movimientos (6.11), con sale_id; precio, costo y ganancia congelados (F2.10, F7); el ticket aparece en "Ver trazabilidad" (F3.10). | P0
Descuentos (PRD principal, en edición) | El ticket registra los descuentos de línea y de ticket con el cálculo, el redondeo y el prorrateo de TV4; las reglas (límites, permisos, motivos) las define el PRD principal. | P0
Devoluciones (PRD principal F10 / PRD de Caja C14) | Documento de devolución vinculado; importes con descuentos prorrateados (TV13.4). | P0
Reportes de rotación | Las líneas de ticket (netas de devoluciones) alimentan unidades vendidas por producto y período, días sin venta, ticket promedio, descuentos por producto y ventas por hora, que usan los reportes de rotación (a definir en el PRD principal o en un módulo de reportes) y la sugerencia de umbrales y de urgencia (F4 P2, PRD del bot B5 P2). | P1
Notificaciones (PRD del bot / email) | Eventos en el outbox (notification_events): venta_descuento_alto (descuento por encima del tope, P1), ticket_anulado, devolucion_registrada, hueco_numeracion. Para no sumar plantillas pagas, se informan dentro de los mensajes existentes (resumen diario, resumen de cierre, aviso matutino) y no como mensajes aparte, salvo alertas de seguridad. El resumen de cierre suma cantidad de tickets, ticket promedio y total de descuentos. | P0 (eventos) / P1 (alertas)
Fiado (PRD de Fiado, en redacción) | La opción "A cuenta (fiado)" (TV5.8) vincula el ticket al cargo en la cuenta corriente del cliente; el ticket muestra su nombre; sin ingreso de caja al vender. | P0 [a confirmar con el PRD de Fiado]
Promociones y combos (PRD de Rotación, RT12) | Líneas de promoción y combo en el ticket (TV2.9), con promotion_id por línea para los reportes (RT12.13); el motor de promociones aplica las promociones antes de confirmar. | P0
Offline (PRD de Offline) | Ticket provisorio, numeración por dispositivo, vista e imagen locales, cola de envíos. | P0
Onboarding (PRD de Onboarding) | Responde ON6.4 y la pregunta abierta 8.2 n.º 2 (ver 4.19). | P0

Acción | Dueño | Empleado
--- | --- | ---
Ver tickets propios de la jornada | Sí | Sí
Ver todos los tickets / historial completo | Sí | Con permiso
Ver costo y ganancia en el ticket | Sí | Con permiso (F7.6)
Compartir por wa.me / PDF / imagen | Sí | Sí
Enviar por número central (P1) | Sí | Con permiso
Revocar link | Sí | No
Devolver / anular | Sí | Dentro de plazo y monto (F10.9)
Corregir medio de pago (P1) | Sí | Con permiso
Configurar el ticket (la leyenda no es editable) | Sí | No

Tabla | Campos principales
--- | ---
sales (ventas / tickets), append-only | id (UUID generado en el dispositivo), numero (bigint, único, asignado por el servidor), numero_provisorio (text, nullable, único; ej. "A3-0045"), device_id, device_seq (nullable), user_id, vendedor_nombre (congelado), user_rol, origen (web_pc / app_movil / bot_whatsapp…), comercio_nombre (congelado), comercio_datos (JSON congelado: dirección, teléfono, CUIT opcional), subtotal_bruto_centavos, descuento_lineas_centavos, subtotal_centavos, descuento_ticket_tipo (porcentaje / monto / null), descuento_ticket_valor (puntos básicos o centavos), descuento_ticket_centavos, total_centavos (> 0), ganancia_total_centavos, autorizado_por (nullable, si superó el tope de descuento), leyenda_version, client_occurred_at (nullable, hora del dispositivo), created_at (timestamptz, servidor), idempotency_key (único); (P1) prev_hash, hash
ticket_lines, append-only | id, sale_id, linea_n, product_id, producto_nombre (congelado), codigo (congelado, nullable), presentacion (unidad / caja), cajas (nullable), cantidad (unidades), precio_lista_centavos, precio_unitario_centavos, precio_editado (bool), subtotal_bruto_centavos, descuento_linea_tipo, descuento_linea_valor, descuento_linea_centavos, neto_linea_centavos, descuento_ticket_asignado_centavos, cobrado_centavos (= neto − asignado), costo_unitario_centavos (congelado), ganancia_centavos, metodo_identificacion (lector / camara / busqueda_manual / foto), stock_movement_id (único, FK a stock_movements); tipo_linea (producto / promocion / combo), promotion_id (nullable, FK a la promoción de RT12), promo_nombre (congelado), parent_line_id (nullable: componente de un combo o línea de promoción que se aplica a líneas de producto), descuento_promo_asignado_centavos. Las líneas de tipo promocion y combo no tienen movimiento de stock propio (stock_movement_id nulo); el stock lo mueven sus componentes (RT12.6)
ticket_payments, append-only | id, sale_id, orden, payment_method_code (efectivo / debito / mercado_pago / qr / transferencia; FK a cash_payment_methods; o a_cuenta para "A cuenta (fiado)"), monto_centavos (> 0), paga_con_centavos (nullable, solo efectivo), vuelto_centavos (nullable), cash_movement_id (único; nullable si Caja no está activa o si es a_cuenta), customer_account_id y cliente_nombre (congelado; obligatorios si es a_cuenta; tabla del PRD de Fiado)
ticket_payment_corrections (P1), append-only | id, sale_id, ticket_payment_id, medio_anterior, medio_nuevo, motivo, reversal_cash_movement_id, new_cash_movement_id, user_id, created_at
sale_returns / sale_return_lines (PRD principal) | Se suman: numero (correlativo propio), numero_provisorio, es_anulacion (bool); en las líneas, ticket_line_id y reintegro_centavos calculado según TV13.4; en la cabecera, refund_payment_method_code (medio elegido por el operador) y sale_payment_method_code (medio original de la venta, referencia); con pago dividido (P1), sale_return_payments (return_id, payment_method_code elegido, monto_centavos, cash_movement_id, medio_original_referencia)
ticket_shares | id, sale_id (o return_id), canal (link / wa_me / web_share / pdf / imagen / whatsapp_central / impresion), token_cifrado (nullable; el token del link, cifrado para poder volver a compartirlo), token_hash, expires_at, revoked_at (nullable; la revocación es la única actualización permitida y queda en el log de auditoría), created_by, created_at, accesos, ultimo_acceso_at
ticket_whatsapp_deliveries (P1) | id, sale_id, telefono_cifrado, telefono_hash, consent_id, template_name, template_version, wamid, estado (en_cola / enviado / entregado / leido / fallido), error, costo_estimado_micros_usd, cuenta_en_cupo (bool), created_at
customer_whatsapp_consents (P1) | id, telefono_hash, telefono_cifrado, otorgado_at, otorgado_por (user_id), sale_id, revocado_at (nullable, por "BAJA"), origen_revocacion
cash_movements (PRD de Caja, campos nuevos para devoluciones) | metodo_id = medio de reintegro elegido por el operador (cualquiera de los cinco); metodo_venta_original_id (FK a cash_payment_methods, referencia al medio de pago original de la venta; obligatorio cuando origen = devolucion; con pago dividido, el de mayor monto, y el detalle completo en sale_return_payments); medio_distinto (bool, generado: metodo_id ≠ metodo_venta_original_id). Se elimina la restricción de C14 / 6.3 del PRD de Caja que exige metodo_id igual al de la venta; se mantiene el tope por monto (Σ devoluciones vigentes ≤ total del ticket)
cash_audit_log (PRD de Caja) | Por cada devolución, una entrada con acción devolucion_medio, entidad_id = egreso, valor_nuevo (JSON: medio elegido, medio original de la venta, medio_distinto, sale_id, return_id, nota), user_id, created_at (servidor); append-only
ticket_counters | clave ('ticket' / 'devolucion'), ultimo_numero; una fila por clave, bloqueada con SELECT … FOR UPDATE al asignar
device_sequences | device_id, ultimo_seq_recibido, huecos_detectados (para TV3.6)
public_ticket_links (base de control) | token_hash (PK, SHA-256), tenant_id, sale_ref (id opaco), expires_at, revoked_at; sin datos de la venta
whatsapp_usage (base de control, definida en los PRD de Onboarding y del bot) | Se suma la marca ticket_cliente

Riesgo | Impacto | Probabilidad | Mitigación
--- | --- | --- | ---
El comercio (o el cliente) usa el ticket como si fuera una factura, o se interpreta como una forma de evitar facturar | Alto | Media | Leyenda obligatoria no editable, nada que imite una factura (TV7.2), aviso al comercio de que debe seguir facturando, validación con un contador [a verificar]
Leyenda incorrecta o insuficiente frente a ARCA | Medio | Baja | Verificación en Fase 0 con asesoría contable; texto versionado (leyenda_version) para cambiarlo sin tocar tickets viejos
El envío desde el número central se percibe como spam (el cliente no conoce a la plataforma) y genera bloqueos o denuncias que bajan la calidad del número compartido por todos los comercios | Alto | Media | wa.me por defecto; número central solo con activación del dueño y consentimiento explícito; nombre del comercio en la plantilla; BAJA en un toque; monitoreo de calidad y suspensión por comercio
Costo de WhatsApp por ticket (~USD 0,026) que consume el cupo del plan (100 tickets agotan el plan Básico) | Medio | Alta | Descuenta del cupo y se muestra antes de enviar; bloqueo con cupo agotado; paquete extra; wa.me como alternativa gratis
Los tickets a clientes nuevos consumen el límite de mensajería de Meta (usuarios únicos por 24 h) y desplazan las alertas al dueño | Alto | Media (crece con la escala) | Tope diario por comercio y global; prioridad a las alertas del bot; verificación del negocio y escalado de nivel antes de habilitarlo a escala
Meta rechaza o recategoriza la plantilla ticket_venta como marketing (más cara) | Medio | Media | Texto estrictamente transaccional; plantilla alternativa; es P1 y no bloquea el MVP (wa.me)
Confusión por número provisorio y definitivo, o por números fuera de orden cronológico | Bajo | Media | Mostrar ambos; búsqueda por los dos; explicación en la ayuda; historial ordenado por fecha
Diferencias de un centavo entre dispositivo y servidor en los descuentos | Medio | Baja | Librería de dominio única, enteros, prorrateo determinístico, tests de propiedades, recálculo en el servidor
Links públicos reenviados por el cliente | Bajo | Media | Datos mínimos, sin datos personales, vencimiento, revocación, token no adivinable
Web Share de archivos o Web Bluetooth no soportados en algunos navegadores (iOS) | Bajo | Media | wa.me con link como camino universal; descarga del archivo; impresión por el diálogo del sistema
Datos personales de clientes finales (teléfonos) en la base del comercio | Medio | Baja | Se guardan solo cuando hace falta, cifrados, con retención limitada y sin uso para marketing (Ley 25.326)
Dependencia del PRD principal en edición (carrito multiproducto, reglas de descuento) | Medio | Media | Modelo que soporta varias líneas desde el inicio; revisión cruzada al cerrar la edición

Término | Definición
--- | ---
Ticket (de venta) | Resumen inmutable de una venta para el comerciante y el cliente. Comprobante no fiscal: no es factura
Número definitivo | Correlativo por comercio, sin huecos, asignado por el servidor
Número provisorio | Código del dispositivo + secuencia local (ej. A3-0045) que recibe un ticket creado offline; queda como alias permanente
Descuento de línea / de ticket | Rebaja sobre una línea o sobre el subtotal de la venta, en porcentaje o monto fijo
Prorrateo (mayor resto) | Reparto del descuento del ticket entre las líneas en proporción a su neto, sin perder ni sumar centavos
Documento de devolución | Documento vinculado a un ticket que registra una devolución total o parcial; la anulación es una devolución total
Link público | URL con token aleatorio no adivinable y vencimiento para ver el ticket sin cuenta
wa.me | Link de WhatsApp que abre un chat en la app del propio usuario con texto precargado; no usa la API ni tiene costo
Web Share | Función del navegador que abre la hoja de compartir del sistema para mandar un archivo (PDF o imagen) a otra app
Número central | El único número de WhatsApp Business de la plataforma, compartido por todos los comercios
Plantilla de utilidad | Mensaje aprobado por Meta para avisos transaccionales; necesario para escribirle a alguien que no abrió una ventana de 24 h
Cupo de mensajes | Cantidad de mensajes de WhatsApp por mes incluidos en el plan del comercio
Leyenda no fiscal | Texto obligatorio "DOCUMENTO NO VÁLIDO COMO FACTURA" [a verificar]
ARCA | Agencia de Recaudación y Control Aduanero (ex AFIP)
