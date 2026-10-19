---
id: MOD-05-FACTURAS-PROVEEDORES
tipo: spec
estado: propuesto
modulos: [compras, pagos]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: |
  La sugerencia nunca cambia estados: solo arma el borrador. El cambio de estadopago ocurre en la transacción de
  confirmación.
---
> Origen: `PRD - Facturas de Proveedores para Sistema de Inventario.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/purchases`, `src/pages/api/supplier-invoices/*`, `src/db/schema-proveedores.ts`

---

# PRD - Facturas de Proveedores para Sistema de Inventario

Nota sobre datos externos: lo marcado [a verificar] (Google Photos Library API, WhatsApp Cloud API, motores de OCR) debe confirmarse en la documentación oficial antes de implementar.

## 1. Resumen / visión general

### 1.1 Problema

Cuando llega el preventista con 4 cajas de chocolates, deja una factura, un remito o un ticket en papel. Ese papel termina en un cajón, en una carpeta o en la basura. Pasa lo siguiente:

El dueño no sabe cuánto le debe a cada proveedor ni qué facturas ya pagó.

Los pagos a proveedores se registran tarde, con montos aproximados o directamente no se registran, y la caja no refleja lo que salió.

La factura no queda vinculada al pedido de reposición que cubre, y nadie revisa si lo facturado coincide con lo pedido.

Las compras al paso (sin pedido previo) no dejan rastro: la mercadería entra al stock sin que se registre, o no entra nunca.

Cuando el proveedor trabaja en cuenta corriente (cierre semanal o mensual), las facturas pendientes se suman a mano y aparecen diferencias.

### 1.2 Visión

El dueño (o un empleado) le saca una foto a la factura del proveedor y se la manda al bot de WhatsApp. El bot:

Guarda la foto en el Google Photos del comercio, asociada al proveedor y al pedido de reposición.

Lee con OCR la fecha, el monto total y, si puede, el CUIT del proveedor, el número de factura y los productos. Todo lo leído es una sugerencia: el dueño la confirma con un toque o la corrige antes de confirmar.

Busca el pedido de reposición pendiente de pago que esa factura cubre y sugiere marcarlo como Pagado. Si no encuentra ninguno, cruza los productos de la factura con el catálogo y el stock del comercio y arma un pedido nuevo desde la factura, ya vinculado.

Según cómo trabaja ese proveedor, descuenta el pago de la caja en el momento o lo acumula en la cuenta corriente para el cierre semanal o mensual.

### 1.3 Propuesta de valor

"Sacale una foto a la factura y listo: queda guardada, vinculada al proveedor y al pedido, y la plata sale de la caja cuando la pagás."

### 1.4 Alcance del módulo

Es un módulo del mismo producto: misma app Astro, mismos usuarios y roles, misma base de datos por comercio, mismo bot.

Registra facturas de compra de mercadería a proveedores (categoría Mercadería). Otros gastos con comprobante (luz, alquiler) siguen el flujo de la caja (C3.7 del PRD de caja), con la que comparte el mismo patrón de foto en Google Photos.

No es un sistema contable ni fiscal (ver no-objetivos).

## 2. Objetivos y no-objetivos

### 2.1 Objetivos

### 2.2 No-objetivos (fuera de alcance, al menos en el MVP)

No valida facturas electrónicas contra AFIP/ARCA en el MVP: no se consulta el CAE, no se verifica el comprobante en los servicios de ARCA ni se controla la condición fiscal del emisor. El CUIT y el número de factura se guardan tal como los confirma el dueño.

No emite facturas ni comprobantes fiscales (igual que el PRD de caja).

No es un sistema contable: no lleva libro IVA compras, no discrimina IVA para liquidación ni genera asientos.

No se conecta con los sistemas de los proveedores ni recibe facturas por email en el MVP (la carga es por foto vía WhatsApp; carga desde la web en P1).

No reemplaza la decisión del dueño: ningún dato leído por OCR, ningún vínculo con un pedido y ningún pago se registra sin confirmación explícita.

No gestiona notas de crédito ni devoluciones a proveedores en el MVP (P2).

No paga al proveedor: registra el pago que el dueño hizo por fuera (efectivo, transferencia, Mercado Pago, etc.).

## 3. Usuarios

Se usan los mismos roles del PRD principal.

### 3.1 Dueño/a (rol Dueño)

Perfil: el del PRD principal; recibe a los preventistas, vive en WhatsApp, paga en efectivo, por transferencia o por Mercado Pago, y tiene algunos proveedores en cuenta corriente.

Necesidades: no perder facturas, saber cuánto debe y a quién, que la caja refleje lo que pagó, controlar que lo facturado coincida con lo pedido.

Permisos: total: mandar facturas, confirmar datos, vincular con pedidos, crear pedidos desde una factura, registrar pagos y cierres de cuenta corriente, anular facturas, configurar el modo de pago por proveedor, conectar el Google Photos del comercio.

### 3.2 Empleado/a (rol Empleado)

Perfil: recibe la mercadería cuando el dueño no está.

Permisos por defecto (configurables por el dueño): mandar la foto de la factura al bot y confirmar o corregir los datos leídos; sumar stock por la mercadería recibida (si tiene permiso de carga). No marca pedidos como Pagado, no registra pagos ni cierres (salvo que el dueño le habilite la categoría "Pago a proveedores", como en el PRD de caja) y no anula facturas. Si no tiene permiso de pago, la factura queda pendiente de pago y el bot le avisa al dueño.

### 3.3 Proveedor / preventista (no usuario)

Emite la factura en papel o se la pasa al dueño por WhatsApp. No interactúa con el sistema en el MVP.

### 3.4 Administrador de la plataforma

Igual que en el PRD principal: opera desde el Control Plane, ve métricas agregadas (cantidad de facturas, tasa de acierto del OCR, costos) y nunca ve fotos ni montos de un comercio sin consentimiento explícito y registro.

## 4. Funcionalidades

### 4.0 Priorización

### FP1. Recepción de la foto de la factura por el bot (P0)

Descripción: el usuario vinculado (PRD del bot, B1) manda al chat del bot una o varias fotos de la factura, remito o ticket del proveedor. Esto amplía B12.4 del PRD del bot: las fotos de facturas sí se procesan (las de productos siguen yendo a la web).

### Requerimientos:

FP1.1 El bot acepta imágenes (JPEG/PNG) y, opcionalmente, un texto acompañante ("factura de Distribuidora X", "pedido 57"), que se usa como pista para el proveedor y el pedido.

FP1.2 Si el usuario manda varias fotos seguidas (en menos de 60 segundos), el bot pregunta si son páginas de la misma factura: [Misma factura] [Son distintas].

FP1.3 Antes de procesar, el bot clasifica la imagen: si no parece un comprobante (por ejemplo, la foto de un producto), responde como en B12.4 del PRD del bot.

FP1.4 El bot responde en menos de 3 segundos con un acuse ("Recibí la factura, la estoy leyendo…") y con el resultado del OCR en menos de 20 segundos.

FP1.5 Cada foto recibida se procesa una sola vez aunque Meta reintente el webhook (deduplicación por wamid, igual que el PRD del bot).

FP1.6 La resolución número → comercio → base de datos es la del PRD del bot (base de control); nunca se toma el comercio del contenido de la imagen.

### Criterios de aceptación:

☐ Mando la foto de una factura al bot y en menos de 3 segundos recibo el acuse, y en menos de 20 segundos el resumen de lo leído.

☐ Mando 2 fotos de una factura de dos páginas, elijo "Misma factura" y queda una sola factura con 2 fotos.

☐ Si mando la foto de un alfajor, el bot me explica que las fotos de productos se cargan desde la web.

☐ Si Meta reintenta el mismo webhook, no se crean dos borradores.

### FP2. Guardado de la foto en Google Photos (P0)

Descripción: mismo patrón que la foto del comprobante del PRD de caja (C3.7): la foto se sube al Google Photos del comercio mediante la Google Photos Library API, con la cuenta de Google del dueño conectada por OAuth, y se guarda el identificador del media item.

### Requerimientos:

FP2.1 Conexión única por comercio: el dueño conecta su cuenta de Google desde la web (Configuración → Google Photos). Es la misma conexión que usa la caja para los comprobantes; si ya está conectada, no se pide de nuevo.

FP2.2 El bot descarga la imagen de WhatsApp (Cloud API, endpoint de media) y la sube a Google Photos con una descripción del tipo "Factura · Distribuidora X · Pedido #57 · 09/10/2026".

FP2.3 La foto se guarda en un álbum creado por la app ("Facturas de proveedores – Kiosco La Esquina"); (P1) un álbum por proveedor y mes.

FP2.4 La factura guarda el mediaItemId (y el álbum) y queda asociada al proveedor y al pedido de reposición; la URL de visualización se pide de nuevo cada vez que se muestra, porque las URLs de contenido de Google Photos son temporales.

FP2.5 El OCR se hace sobre los bytes descargados de WhatsApp, antes o en paralelo con la subida, sin depender de volver a leer la foto desde Google Photos.

FP2.6 Si el Google Photos del comercio no está conectado o la subida falla, la factura se puede confirmar igual: la foto queda en el almacenamiento temporal del producto (cifrada, con vencimiento) y se reintenta la subida; el dueño recibe el link para conectar Google Photos.

FP2.7 Desde la ficha de la factura (web) y desde el movimiento de caja asociado se ve la foto.

Verificar antes de construir: los scopes y políticas de la Google Photos Library API cambiaron en 2025: las apps solo pueden leer (y administrar) los medios y álbumes que ellas mismas subieron o crearon, y se retiraron los scopes de lectura de toda la biblioteca [a verificar scopes vigentes (por ejemplo, photoslibrary.appendonly y los de datos creados por la app), cuotas y requisitos de verificación de la app OAuth de Google]. Implicancias para este módulo: solo se referencian fotos subidas por la propia app; no se puede "elegir una foto que ya estaba" en el Google Photos del dueño; si el dueño borra la foto desde Google Photos, la app no puede recuperarla.

### Criterios de aceptación:

☐ Con Google Photos conectado, mando una factura y la foto aparece en el álbum "Facturas de proveedores" del Google Photos del dueño, con la descripción del proveedor y el pedido.

☐ La ficha de la factura en la web muestra la foto aunque hayan pasado varios días (la URL se renueva sola).

☐ Sin Google Photos conectado, confirmo la factura igual y recibo el link para conectarlo; al conectarlo, la foto se sube sola.

☐ El refresh token de Google no aparece en ningún log y se guarda cifrado.

### FP3. OCR como sugerencia y confirmación en un toque (P0)

Descripción: el OCR propone los datos; el usuario los confirma con un botón interactivo o los edita antes de confirmar. Es el mismo patrón de "sugerencia + confirmación en un toque" de los comprobantes de la caja: nada leído se registra solo.

### Requerimientos:

FP3.1 Campos que se leen:

Obligatorios para confirmar: fecha de la factura y monto total.

Opcionales: CUIT del emisor, tipo y número de comprobante (por ejemplo, Factura B 0003-00012345), razón social, fecha de vencimiento e ítems (descripción, código, cantidad, precio unitario, subtotal; ver FP8).

FP3.2 Cada campo tiene un nivel de confianza (alta / media / baja). Los de confianza media se muestran marcados con "⚠ revisá"; el botón "Confirmar" queda disponible igual (la decisión es del usuario).

FP3.3 Mensaje de sugerencia con botones: [Confirmar] [Editar] [Descartar]. "Editar" muestra una lista con los campos (Fecha, Monto, Proveedor, N° de factura, CUIT) y el usuario corrige el que elige escribiendo el valor ("monto 164800", "fecha 8/10").

> Nota 2026-10-19: la corrección por texto ya está construida para el Dueño (ADR-0095). Toca "Editar", el bot lista los campos, el Dueño escribe el valor ("monto 164800") y lo aprueba con OK antes de que el cambio se guarde. El Empleado sigue derivado a la web.

FP3.4 Formatos argentinos: fechas dd/mm/aaaa; montos con punto de miles y coma decimal ($164.800,00). El OCR normaliza "164.800,00", "164800" y "$ 164.800" al mismo valor en centavos.

FP3.5 Validaciones: monto mayor a 0; fecha no futura ni anterior a 1 año (advertencia, no bloqueo); CUIT con dígito verificador válido (advertencia si no valida); si hay ítems, la suma de subtotales se compara con el total (advertencia si difiere más del 1%).

FP3.6 Hasta confirmar, la factura es un borrador: no aparece en la cuenta corriente ni en la caja. Los borradores sin confirmar vencen a los 7 días y el bot los recuerda una vez a las 24 h.

FP3.7 Si el OCR no puede leer la fecha o el monto (confianza baja), el bot los pide por texto ("No pude leer el total. ¿Cuánto es?").

### Criterios de aceptación:

☐ Mando una factura legible de $164.800 del 08/10 y el bot me propone "Fecha 08/10/2026 · Total $164.800,00"; toco "Confirmar" y queda registrada con un solo toque.

☐ El OCR leyó $184.800 en lugar de $164.800; toco "Editar" → "Monto", escribo 164800 y el bot me muestra el resumen corregido para confirmar.

☐ Un campo leído con confianza media aparece con "⚠ revisá".

☐ Ninguna factura pasa a pendiente de pago ni genera un egreso sin que alguien toque "Confirmar".

☐ Un CUIT con dígito verificador inválido muestra una advertencia antes de confirmar.

### FP4. Vínculo con el proveedor y categoría Mercadería (P0)

Descripción: cada factura pertenece a un proveedor de la sección Proveedores del PRD principal (F6: nombre, CUIT, contacto, teléfono, WhatsApp, email, condiciones de pago) y se categoriza como Mercadería.

### Requerimientos:

FP4.1 Identificación del proveedor, en este orden: (1) CUIT leído igual al CUIT cargado de un proveedor; (2) texto acompañante o razón social leída, con búsqueda difusa sobre los proveedores del comercio; (3) si no hay coincidencia, el bot muestra una lista con los proveedores más frecuentes y la opción "Otro".

FP4.2 Si el CUIT leído no está cargado en el proveedor elegido, el bot ofrece guardarlo: [Guardar CUIT] [No].

FP4.3 (P1) Alta rápida de proveedor desde el bot (nombre + CUIT leído); el resto se completa en la web.

FP4.4 Categoría de la factura: Mercadería (fija en el MVP). En la caja, el egreso del pago se registra como "Pago a proveedores > Mercadería" (subcategoría a acordar con el PRD de caja; ver 7.2).

FP4.5 Desde la ficha del proveedor (web) se ven sus facturas, su saldo de cuenta corriente y sus pagos.

FP4.6 Las condiciones de pago del proveedor (F6.1) precargan el modo de pago (FP5) y el medio de pago sugerido.

### Criterios de aceptación:

☐ Una factura con el CUIT de Distribuidora X se asocia a Distribuidora X (como sugerencia que confirmo).

☐ Una factura sin CUIT legible me muestra la lista de proveedores para elegir.

☐ Toda factura confirmada tiene proveedor y categoría Mercadería; no se puede confirmar sin proveedor.

☐ En la ficha de Distribuidora X veo todas sus facturas con estado y monto.

### FP5. Modo de pago: pagar ahora o cuenta corriente (P0)

Descripción: el gasto se descuenta de la caja en el momento del pago o se acumula en la cuenta corriente del proveedor (pendiente de pago) para un cierre semanal o mensual. El dueño lo elige por proveedor, con excepción por factura.

### Requerimientos:

FP5.1 Configuración por proveedor (web, ficha del proveedor): modo de pago de facturas = "Pagar en el momento" o "Cuenta corriente"; para cuenta corriente, periodicidad del cierre (semanal o mensual) y día de cierre (por ejemplo, viernes o día 30). Valor inicial derivado de las condiciones de pago de F6.1 (contado o transferencia → pagar en el momento; cuenta corriente a N días → cuenta corriente).

FP5.2 Al confirmar una factura, el bot muestra el modo del proveedor ya elegido y permite cambiarlo solo para esa factura: [Pagar ahora] [A cta. cte.].

FP5.3 Pagar ahora: el bot pide el medio de pago (precargado según el proveedor: Efectivo, Débito, Mercado Pago, Transferencia bancaria) y, al confirmar, se genera un egreso en la caja (PRD de caja, C3) con categoría "Pago a proveedores > Mercadería", origen "factura de proveedor", referencia a la factura, al proveedor y al pedido vinculado, y el usuario que lo confirmó.

FP5.4 Cuenta corriente: la factura queda pendiente de pago, suma al saldo del proveedor y no toca la caja hasta que se registra el pago (FP6). Se calcula la fecha de vencimiento (fecha de factura + N días, o la leída por OCR).

FP5.5 La confirmación de la factura y la creación del egreso (si se paga ahora) ocurren en una misma transacción.

FP5.6 Si el usuario no tiene permiso para registrar pagos, la opción "Pagar ahora" no aparece y la factura queda pendiente de pago, con aviso al dueño (FP12).

### Criterios de aceptación:

☐ Distribuidora X está configurada en "Pagar en el momento"; confirmo su factura de $164.800, elijo Transferencia y la caja muestra el egreso "Pago a proveedores > Mercadería — Distribuidora X — Factura B 0003-00012345"; el saldo de Transferencia baja $164.800.

☐ Golosinas Sur está en "Cuenta corriente, cierre semanal los viernes"; confirmo su factura y no aparece ningún egreso en la caja, pero el saldo de Golosinas Sur sube.

☐ Para una factura de Golosinas Sur que el preventista me cobró en efectivo, toco "Pagar ahora" y se descuenta de la caja sin cambiar la configuración del proveedor.

☐ Si falla la creación del egreso, la factura no queda como pagada.

### FP6. Facturas impagas y cierre de cuenta corriente (P0)

Descripción: las facturas impagas están siempre a la vista, y su pago posterior registra el egreso en la caja.

### Requerimientos:

FP6.1 Pantalla "Facturas impagas" (web): lista por proveedor con fecha, número, monto, días desde la factura y vencimiento (vencidas en rojo), total adeudado por proveedor y total general.

FP6.2 Por el bot: "qué le debo a Golosinas Sur" o "facturas impagas" devuelve el saldo y las facturas pendientes (solo para quien tiene permiso de ver montos de proveedores).

FP6.3 Registrar pago / cierre: el dueño elige el proveedor, el sistema preselecciona las facturas impagas hasta la fecha de cierre, el dueño puede quitar o agregar facturas, elige el medio y la fecha, y confirma. Se genera un egreso en la caja por el total del pago, vinculado a cada factura que cancela.

FP6.4 El monto pagado puede diferir del total de las facturas (descuento por pronto pago, redondeo). P0: pago por el total, o por un monto menor que deja saldo en la factura más reciente; P1: notas de crédito y descuentos.

FP6.5 Al pagar una factura vinculada a un pedido en estado de pago "Facturado (pendiente de pago)", el pedido pasa a Pagado en la misma transacción (ver FP7).

FP6.6 Si se revierte el egreso del pago en la caja (C7 del PRD de caja), las facturas vuelven a pendiente de pago y los pedidos vinculados vuelven a "Facturado (pendiente de pago)", en la misma transacción.

### Criterios de aceptación:

☐ Tengo 3 facturas impagas de Golosinas Sur ($40.000, $35.500 y $28.000); el viernes registro el cierre por transferencia y la caja muestra un único egreso de $103.500 vinculado a las 3 facturas, que pasan a "Pagada".

☐ En "Facturas impagas", una factura vencida hace 5 días aparece en rojo.

☐ Escribo al bot "qué le debo a Golosinas Sur" y recibo el saldo y la lista de facturas.

☐ Revierto el egreso del cierre y las 3 facturas vuelven a "Pendiente de pago".

☐ No puedo pagar dos veces la misma factura.

### FP7. Matching automático con pedidos de reposición (P0)

Descripción: cuando el OCR lee una factura que coincide con un pedido de reposición pendiente de pago (mismo proveedor, monto parecido dentro de una tolerancia y fecha cercana al pedido o a su recepción), el bot sugiere marcar ese pedido como Pagado: vincula la factura con el pedido y, al confirmar, dispara el descuento automático en la caja (C8 del PRD de caja). El cambio de estado solo es definitivo después del toque de confirmación.

Estados de pago del pedido (campo estado_pago que agrega el PRD principal, extendido por este PRD con el estado intermedio "Facturado"):

Pendiente de pago → Facturado (pendiente de pago) → Pagado, o directamente Pendiente de pago → Pagado si se paga en el momento.

### Requerimientos:

FP7.1 Al terminar el OCR, el sistema busca pedidos candidatos: del mismo proveedor, en estado Enviado o Recibido (no Borrador ni Cancelado), con estado de pago "Pendiente de pago" o con saldo pendiente, y calcula un puntaje de coincidencia (ver 6.5).

FP7.2 Un candidato con confianza alta: el bot sugiere "Esta factura parece del pedido #57 (enviado el 06/10, total estimado $166.000)", con botones según el modo de pago: [Sí, marcar pagado] o [Sí, a cta. cte.], más [Otro pedido] y [Editar].

FP7.3 Varios candidatos (o uno de confianza media): el bot muestra una lista interactiva (hasta 10 filas) con número de pedido, fecha y total estimado, ordenada por puntaje, más las filas "Ninguno de estos" y "Sin pedido".

FP7.4 Sin candidatos: se pasa al flujo de pedido desde la factura (FP8).

FP7.5 Al confirmar con "Pagar ahora": en una misma transacción se confirma la factura, se crea el vínculo factura ↔ pedido, el pedido pasa a Pagado y se crea un único egreso en la caja (categoría "Pago a proveedores > Mercadería", referencia a la factura, al pedido y al proveedor). Es el mismo efecto que "Marcar como pagado" de C8 del PRD de caja; nunca se generan dos egresos por el mismo pago.

FP7.6 Al confirmar con "Cuenta corriente": el pedido pasa a Facturado (pendiente de pago) y la factura queda pendiente de pago; el pedido pasa a Pagado cuando se salda la factura en el cierre (FP6.5).

FP7.7 Montos parciales:

Factura menor que el total del pedido, fuera de la tolerancia (entrega parcial): el bot ofrece [Pago parcial] [Cerrar pedido] [Otro pedido]. "Pago parcial" vincula la factura por su monto y deja el pedido con saldo pendiente (sigue en "Pendiente de pago" o "Facturado" hasta completarse); "Cerrar pedido" lo da por completo con el monto de la factura y registra la diferencia con motivo ("faltó mercadería").

Factura mayor que el total estimado, fuera de la tolerancia (aumento de precios, productos agregados): el bot avisa la diferencia ("La factura es $12.000 más que el pedido") y permite vincular igual; el pago es por el monto de la factura.

Un pedido puede tener varias facturas. En el MVP, una factura se vincula a un solo pedido (P1: una factura imputada a varios pedidos del mismo proveedor).

FP7.8 Si el pedido ya está "Pagado" desde la caja (C8), el matching no lo ofrece; si el usuario igual lo elige desde la web, la factura se vincula como comprobante del pago existente, sin generar un egreso nuevo.

FP7.9 Una vez que un pedido tiene una factura vinculada, el botón "Marcar como pagado" del pedido en el inventario lleva al pago de su factura, para que el egreso siempre referencie a ambos.

FP7.10 Solo el Dueño (o un empleado con permiso de pagos) confirma el cambio a Pagado; un empleado sin permiso puede vincular la factura, y el pedido queda "Facturado (pendiente de pago)" con aviso al dueño.

FP7.11 Cada sugerencia (candidatos, puntajes, opción elegida o rechazada) queda registrada para auditoría y para ajustar el algoritmo.

### Criterios de aceptación:

☐ Tengo el pedido #57 a Distribuidora X por $166.000, enviado el 06/10; mando una factura de Distribuidora X por $164.800 del 08/10 y el bot me sugiere el pedido #57.

☐ Toco "Sí, marcar pagado", elijo Transferencia y, en el mismo momento, el pedido #57 queda "Pagado", la factura queda vinculada y la caja muestra un único egreso de $164.800 que referencia la factura y el pedido.

☐ Si toco "Otro pedido" y elijo "Sin pedido", el pedido #57 no cambia de estado.

☐ Con dos pedidos pendientes a Distribuidora X de montos parecidos, el bot me muestra la lista con ambos para elegir.

☐ Con Golosinas Sur en cuenta corriente, al confirmar el pedido sugerido queda "Facturado (pendiente de pago)" y pasa a "Pagado" cuando registro el cierre del viernes.

☐ Una factura de $92.000 contra un pedido de $166.000 me ofrece "Pago parcial"; al elegirlo, el pedido muestra un saldo pendiente de $74.000.

☐ Un pedido ya pagado desde la caja no aparece como candidato.

☐ No existe forma de que un pedido pase a Pagado por el matching sin un toque de confirmación.

### FP8. Pedido desde la factura cuando no hay pedido pendiente (P0)

Descripción: si la factura no coincide con ningún pedido pendiente (compra al paso, preventista que trajo mercadería sin pedido, pedido hecho por teléfono), el bot cruza los productos leídos en la factura (nombres y códigos de los ítems) con la base de productos y el stock del comercio, muestra lo que leyó y, con un toque, crea un pedido de reposición nuevo ya vinculado a la factura.

### Requerimientos:

FP8.1 El OCR extrae los ítems de la factura: descripción, código (EAN o código interno del proveedor, si aparece), cantidad, unidad (unidad, caja, bulto, kg) y, si están, precio unitario y subtotal.

FP8.2 Cada ítem se busca en los productos del comercio, primero por código (product_codes, de tipo unidad o caja) y después por nombre (búsqueda difusa de F1.5 y alias de product_aliases); ver 6.6.

FP8.3 El bot muestra un resumen con proveedor, fecha, monto total y la lista de ítems detectados con sus cantidades, marcando cada uno como:

✅ Existe: nombre del producto del catálogo, cantidad facturada (con equivalencia en unidades, por ejemplo "2 cajas = 48 u.") y stock actual.

❓ Dudoso: coincidencia de confianza media; se muestra el producto sugerido para confirmar o cambiar.

🆕 Nuevo: no existe en el catálogo.

FP8.4 Corrección en el chat: el usuario puede elegir un ítem de la lista y cambiar el producto asociado, la cantidad o la unidad, quitar el ítem o agregar un ítem que el OCR no leyó ("agregá 1 caja de Beldent").

FP8.5 Alta de productos en el momento: los ítems nuevos se crean con el nombre y el código leídos, el proveedor de la factura como proveedor principal y el costo unitario de la factura (si se leyó). La foto, el precio de venta y el umbral se completan después en la web (el bot manda el link). Los productos creados así quedan marcados "Creado desde factura – completar datos".

FP8.6 Creación del pedido: con un toque se crea un pedido de reposición al proveedor de la factura, con origen "desde factura", las líneas confirmadas (cantidades en la unidad de pedido de cada producto, F5.3) y el total igual al de la factura, vinculado a la factura. Su estado de pago respeta el modo de pago (FP5):

Pagar ahora: el pedido nace Pagado y se genera el egreso automático en la caja (mismo mecanismo que FP7.5).

Cuenta corriente: el pedido nace Facturado (pendiente de pago) y pasa a Pagado en el cierre.

FP8.7 Decisión sobre el stock: la recepción se ofrece como opción explícita, propuesta por defecto. Como la factura acompaña mercadería que en general ya llegó, el resumen final incluye "Sumar al stock lo recibido" y el bot ofrece [Crear y sumar stock] [Solo crear pedido]. Con "Crear y sumar stock", en la misma transacción el pedido queda en estado Recibido (el estado de F5.6 y F5.8 del PRD principal) y se genera un ingreso de stock por cada línea en el historial (F3), con origen "factura de proveedor" y referencia al pedido. Con "Solo crear pedido", el pedido queda en estado Enviado (pendiente de recepción) y el stock se suma después, al marcarlo Recibido. Nunca se suma stock sin esta confirmación.

FP8.8 Si el usuario ya cargó esa mercadería con el escáner (Flujo 2 del PRD principal), elige "Solo crear pedido" para no duplicar stock. El bot advierte si detecta ingresos de stock de esos mismos productos en las últimas 12 horas ("Hoy ya cargaste 48 u. de Águila. ¿Sumo igual?").

FP8.9 Fallback: si el OCR no puede leer ítems (ticket ilegible, factura sin detalle) o el usuario lo prefiere, el bot ofrece [Solo guardar fact.]: la factura queda registrada sin pedido (factura independiente), con el mismo tratamiento de pago (FP5).

FP8.10 Solo el Dueño o un empleado con permiso de carga puede sumar stock; crear productos requiere el permiso de alta de productos del PRD principal.

FP8.11 (P1) Actualización de costos: si el costo unitario de la factura difiere del costo cargado, el bot ofrece actualizarlo (F7) y muestra el nuevo margen.

### Criterios de aceptación:

☐ Mando una factura de Golosinas Sur sin pedido pendiente y el bot me muestra los 3 ítems leídos, con "✅ Chocolate Águila 100 g — 2 cajas (48 u.) — stock 5 u." y "🆕 Alfajor Guaymallén — 10 u.".

☐ Cambio la cantidad de un ítem de 1 a 2 cajas desde el chat y el resumen se actualiza con la nueva equivalencia en unidades y la advertencia si la suma ya no coincide con el total.

☐ El ítem nuevo se crea como producto con el nombre y el código leídos, asociado a Golosinas Sur, y aparece en la web como "Creado desde factura – completar datos".

☐ Con "Crear y sumar stock" y el proveedor en "Pagar en el momento", se crea el pedido en estado Recibido y Pagado, el stock de Águila pasa de 5 a 53 u. y la caja muestra el egreso por el total de la factura, todo en una sola operación.

☐ Con el proveedor en cuenta corriente, el pedido nace "Facturado (pendiente de pago)" y la caja no cambia.

☐ Con "Solo crear pedido", el stock no cambia y el pedido queda Enviado hasta que lo marco Recibido.

☐ Un ítem leído por código EAN de caja se asocia al producto correcto y suma unidades según su multiplicador (1 caja de 24 = 24 u.).

☐ Si ya cargué hoy esos productos con el escáner, el bot me advierte antes de sumar stock.

☐ Con una factura sin detalle legible, puedo tocar "Solo guardar fact." y queda registrada sin pedido.

### FP9. Detección de duplicados (P0)

### Requerimientos:

FP9.1 Duplicado seguro: mismo proveedor (o mismo CUIT) + mismo tipo, punto de venta y número de factura → el bot avisa "Esta factura ya está cargada (09/10, $164.800, Pagada)" y no permite confirmarla de nuevo (restricción única en la base).

FP9.2 Misma foto: hash exacto (SHA-256) o hash perceptual de la imagen igual al de una factura ya cargada → aviso de duplicado con la factura existente.

FP9.3 Posible duplicado: mismo proveedor + mismo monto + fecha a ±3 días, sin número de factura → advertencia con [Es otra factura] [Es la misma]; si el usuario confirma que es otra, queda registrado.

FP9.4 Las facturas anuladas no cuentan para la detección de duplicados.

FP9.5 La idempotencia técnica (reintentos de webhook, doble toque en "Confirmar") se resuelve con wamid y claves de idempotencia (ver 6.8), independientemente de esta detección.

### Criterios de aceptación:

☐ Mando dos veces la foto de la misma factura y la segunda vez el bot me dice que ya está cargada y me muestra la original.

☐ Toco dos veces "Confirmar" muy rápido y se registra una sola factura y un solo egreso.

☐ Una factura sin número, del mismo proveedor y monto que otra de ayer, me pide confirmar que es distinta.

### FP10. Inmutabilidad, anulación y auditoría (P0)

### Requerimientos:

FP10.1 Una factura confirmada no se edita ni se borra: proveedor, fecha, monto, número, foto e ítems quedan fijos. Los errores se corrigen anulando la factura (con motivo obligatorio) y cargando una nueva, igual que la reversión de movimientos de la caja.

FP10.2 Al anular una factura pagada, se revierte su egreso en la caja (contra-asiento, C7 del PRD de caja) si el pago cubría solo esa factura; si el pago cubría varias, se pide revertir primero el pago. Los pedidos vinculados vuelven al estado de pago anterior.

FP10.3 Al anular una factura que creó un pedido (FP8), el pedido creado queda Cancelado y, si se sumó stock, se ofrece registrar los egresos de stock correspondientes como movimientos nuevos (nunca se borran movimientos).

FP10.4 Log de auditoría: borrador creado, datos sugeridos por OCR, datos editados (valor sugerido y valor confirmado), confirmación, vínculo con pedido (con puntaje), productos creados, cambios de estado de pago, pagos, anulaciones y cambios de configuración del proveedor; con usuario, origen (web / bot WhatsApp), fecha y hora.

FP10.5 Solo el Dueño anula facturas (P1: el empleado lo pide y el dueño aprueba).

### Criterios de aceptación:

☐ No existe botón ni endpoint para editar o borrar una factura confirmada (verificado con tests automáticos).

☐ Anulo una factura pagada en el momento con motivo "proveedor equivocado" y en la caja aparece la reversión de su egreso; el pedido vuelve a "Pendiente de pago".

☐ En la auditoría veo que el OCR sugirió $184.800 y el usuario confirmó $164.800.

### FP11. Pantallas web (P0)

### Requerimientos:

FP11.1 Facturas (menú Proveedores → Facturas): lista con filtros por proveedor, estado (pendiente de pago, pagada, anulada), fecha, con o sin pedido y origen; búsqueda por número.

FP11.2 Ficha de factura: foto (desde Google Photos), datos confirmados, ítems, pedido vinculado, pago y movimiento de caja, auditoría, botón "Anular".

FP11.3 Cuenta corriente del proveedor: saldo, facturas impagas, pagos y botón "Registrar pago / cierre".

FP11.4 En el pedido de reposición se ven su estado de pago y sus facturas vinculadas; en el movimiento de caja, la factura y la foto.

FP11.5 (P1) Exportación CSV/Excel de las facturas del período para el contador, con enlaces a las fotos.

### Criterios de aceptación:

☐ Desde el pedido #57 abro su factura y veo la foto; desde la factura abro el egreso de la caja.

☐ Filtro "pendientes de pago" y el total coincide al centavo con la suma de los saldos de los proveedores.

### FP12. Avisos (P0 básicos / P1)

### Requerimientos:

FP12.1 (P0) Cuando un empleado carga una factura que queda pendiente de pago, el dueño recibe "Lucas cargó una factura de Distribuidora X por $164.800 (pedido #57)." [Pagar ahora] [A cta. cte.] [Ver] (mensaje interactivo si la ventana de 24 h está abierta; si no, plantilla de utilidad factura_para_revisar [a aprobar por Meta]).

FP12.2 (P0) El día de cierre de cada proveedor en cuenta corriente: "Hoy es el cierre con Golosinas Sur: 3 facturas, $103.500." [Registrar pago] [Ver facturas] (plantilla cierre_cuenta_corriente).

FP12.3 (P1) Facturas vencidas y resumen semanal de deuda con proveedores, sumado al resumen del viernes del PRD del bot.

FP12.4 Los avisos respetan el opt-in, el opt-out y los horarios del PRD del bot (B2).

### Criterios de aceptación:

☐ Cuando el empleado carga una factura sin permiso de pago, recibo el aviso en menos de 1 minuto.

☐ El viernes de cierre recibo el aviso con el total igual al de la web.

## 5. Flujos de usuario

Los botones se muestran entre corchetes y respetan los límites de mensajes interactivos del PRD del bot (hasta 3 botones de hasta 20 caracteres; listas de hasta 10 filas).

### Flujo 1: factura con pedido pendiente y pago en el momento (matching con un candidato)

Llega el preventista de Distribuidora X con el pedido #57 (4 cajas de Chocolate Águila, entre otros productos). El dueño le saca una foto a la factura y se la manda al bot.

Bot: "Recibí la factura, la estoy leyendo… 📄"

Bot:

Leí esto:

Proveedor: Distribuidora X (CUIT 30-71234567-8)

Factura B 0003-00012345 · 08/10/2026

Total: $164.800,00

Parece del pedido #57 (enviado el 06/10, estimado $166.000).

Distribuidora X: pagás en el momento.



[Sí, marcar pagado] [Editar] [Otro pedido]

Dueño toca "Sí, marcar pagado".

Bot: "¿Con qué pagaste?" [Transferencia] [Efectivo] [Otro medio]

Dueño toca "Transferencia".

Bot: "✅ Listo. Pedido #57 Pagado. Egreso de $164.800 por transferencia registrado en la caja (Pago a proveedores > Mercadería). La foto quedó guardada en tu Google Photos."

En la web, el pedido #57 muestra "Pagado — Factura B 0003-00012345" y la caja muestra el egreso con el enlace a la foto.

### Flujo 2: corrección de un dato antes de confirmar

El bot leyó "Total: $184.800,00 ⚠ revisá".

Dueño toca "Editar" → lista [Fecha] [Monto] [Proveedor] [N° de factura] [CUIT] → elige "Monto".

Bot: "Escribí el monto correcto." Dueño: "164800".

Bot reenvía el resumen con "Total: $164.800,00" y [Confirmar] [Editar] [Descartar]. El dueño confirma y sigue el Flujo 1 desde el paso 3 (sugerencia de pedido).

### Flujo 3: varios pedidos candidatos

El dueño manda una factura de Distribuidora X por $98.000.

Bot (lista interactiva): "Encontré 2 pedidos pendientes de Distribuidora X. ¿Cuál cubre esta factura?" [Elegir]

Pedido #61 — 08/10 — $97.500

Pedido #57 — 06/10 — $166.000

Ninguno de estos

Sin pedido

Dueño elige "Pedido #61".

Bot: "Factura $98.000 · Pedido #61 $97.500 (diferencia $500, dentro de la tolerancia). ¿Lo marco Pagado?" [Sí, marcar pagado] [A cta. cte.] [Volver]

Dueño confirma; sigue como el Flujo 1, pasos 5 a 7.

### Flujo 4: proveedor en cuenta corriente y cierre semanal

El empleado recibe la mercadería de Golosinas Sur (cuenta corriente, cierre los viernes) y manda la foto de la factura de $40.000.

Bot: "Leí: Golosinas Sur · 06/10 · $40.000. Parece del pedido #55. Golosinas Sur va a cuenta corriente (cierre el viernes)." [Confirmar] [Editar] [Otro pedido]

Empleado toca "Confirmar". Bot: "✅ Factura cargada. Pedido #55: Facturado (pendiente de pago). Le aviso a Mauricio."

Durante la semana se suman dos facturas más ($35.500 y $28.000), de los pedidos #58 y #60.

Viernes 18:00, Bot al dueño (plantilla): "Hoy es el cierre con Golosinas Sur: 3 facturas, $103.500." [Registrar pago] [Ver facturas]

Dueño toca "Registrar pago" → "¿Con qué pagaste?" → [Transferencia].

Bot: "¿Confirmás el pago de $103.500 a Golosinas Sur por transferencia (3 facturas)?" [Confirmar] [Cambiar] [Cancelar] → Confirmar.

Bot: "✅ Pago registrado. Egreso de $103.500 en la caja. Pedidos #55, #58 y #60 Pagados. Saldo con Golosinas Sur: $0."

### Flujo 5: entrega parcial

El dueño manda una factura de Distribuidora X por $92.000; el pedido #57 era de $166.000 (faltaron 2 cajas).

Bot: "La factura ($92.000) es menor que el pedido #57 ($166.000). ¿Qué hago?" [Pago parcial] [Cerrar pedido] [Otro pedido]

Dueño toca "Pago parcial" y paga en efectivo.

Bot: "✅ Egreso de $92.000 en efectivo. Pedido #57: saldo pendiente $74.000. Cuando llegue el resto, mandame la otra factura."

### Flujo 6: factura sin pedido → pedido desde la factura, con la lista de ítems

Pasa el preventista de Golosinas Sur sin pedido previo y deja chocolates, chicles y alfajores. El dueño manda la foto de la factura.

Bot:

Leí esto:

Proveedor: Golosinas Sur · 09/10/2026 · Total $109.200

No encontré ningún pedido pendiente de Golosinas Sur.

Productos de la factura:

1. ✅ Chocolate Águila 100 g — 2 cajas (48 u.) — stock 5 u.

2. ✅ Beldent menta — 1 caja (20 u.) — stock 12 u.

3. 🆕 Alfajor Guaymallén dulce de leche (cód. 7790000123456) — 10 u.

Los ítems suman $109.200 ✔



[Crear pedido] [Corregir ítems] [Solo guardar fact.]

Dueño toca "Corregir ítems". Bot (lista): [1. Águila — 2 cajas] [2. Beldent — 1 caja] [3. Guaymallén 🆕] [Agregar producto] [Listo]

Dueño elige "2. Beldent". Bot: "Beldent menta, caja x20. Ahora: 1 caja (20 u.)." [−1 caja] [+1 caja] [Otro producto]. Toca "+1 caja". Bot: "Ahora: 2 cajas (40 u.). Ojo: los ítems suman $133.200 y la factura dice $109.200." El dueño se da cuenta de que se equivocó, toca "−1 caja" y vuelve a 1 caja. Toca "Listo".

Bot: "El ítem 3 es nuevo. Lo creo como 'Alfajor Guaymallén dulce de leche' con el código 7790000123456, proveedor Golosinas Sur, costo $600. La foto y el precio de venta los completás en la web." [Crear producto] [Es otro producto] [Quitar ítem] → toca "Crear producto".

Bot:

Resumen:

Pedido nuevo a Golosinas Sur · Total $109.200 (desde factura)

Pago: cuenta corriente (cierre el viernes)

Sumar al stock:

· Águila +48 u. (5 → 53)

· Beldent +20 u. (12 → 32)

· Guaymallén +10 u. (0 → 10)



[Crear y sumar stock] [Solo crear pedido] [Cancelar]

Dueño toca "Crear y sumar stock".

Bot: "✅ Pedido #63 creado: Recibido · Facturado (pendiente de pago). Stock actualizado. Saldo con Golosinas Sur: $149.200. Completá el Guaymallén en la web: "

Variante pago en el momento: si el proveedor estuviera en "Pagar en el momento" (o el dueño eligiera "Pagar ahora" para esta factura), el bot pediría el medio y el pedido #63 nacería Pagado, con el egreso registrado en la caja en la misma operación.

### Flujo 7: duplicado

El dueño reenvía sin querer la foto de la factura del Flujo 1.

Bot: "Esta factura ya está cargada: Distribuidora X, Factura B 0003-00012345, $164.800, Pagada el 09/10 (pedido #57). No la cargo de nuevo." [Ver factura] [Es otra factura]

### Flujo 8: anulación desde la web

El dueño ve que cargó una factura de Golosinas Sur a nombre de Distribuidora X.

En la web abre la ficha de la factura → "Anular" → motivo "proveedor equivocado".

El sistema revierte el egreso en la caja, el pedido vuelve a "Pendiente de pago" y la factura queda "Anulada" (visible, tachada).

El dueño vuelve a mandar la foto al bot y la carga con el proveedor correcto (la detección de duplicados ignora las facturas anuladas).

## 6. Notas técnicas

### 6.1 Arquitectura y stack

Mismo stack que el PRD principal: Astro + TypeScript (SSR, islas), API /api/* o servicio Hono, Zod, Drizzle, PostgreSQL gestionado, cola de jobs (pg-boss / Inngest).

Una base de datos por cliente (por comercio), igual que ModoOps, más una base de control. Todas las tablas de este módulo viven en la base de cada comercio (sin tenant_id). La base de control solo guarda métricas agregadas (cantidad de facturas, uso de OCR, costos), sin contenido.

El bot (PRD del bot) recibe la imagen por webhook, deduplica por wamid, resuelve número → comercio en la base de control y encola el procesamiento. El job de factura: descarga la media de WhatsApp → calcula hashes → OCR → identifica proveedor → matching de pedidos → (si no hay pedido) matching de productos → arma el borrador → responde. La subida a Google Photos corre en paralelo y con reintentos.

Todas las acciones con efecto (confirmar factura, vincular pedido, pagar, crear pedido, crear productos, sumar stock) pasan por la misma capa de servicios que la web, con los permisos del usuario vinculado.

Migraciones con el mismo runner del PRD principal (base de control + todas las bases de clientes).

### 6.2 Modelo de datos

### Estados derivados (no se guardan como columnas editables):

Factura: pendiente_pago (saldo mayor a 0), pagada (saldo igual a 0), anulada (existe registro en supplier_invoice_voids). Saldo de la factura = monto_total − Σ asignaciones de pagos cuyo egreso no fue revertido.

Saldo de cuenta corriente del proveedor = Σ saldos de sus facturas no anuladas.

### 6.3 Reglas de integridad

Dinero en centavos enteros (bigint), igual que el PRD de caja; nunca float. Formato $1.234,50 solo en pantalla.

Registros inmutables: el rol de la app solo tiene INSERT y SELECT sobre supplier_invoices, supplier_invoice_lines, supplier_payments, supplier_payment_allocations y supplier_invoice_voids; un trigger rechaza UPDATE y DELETE. Las correcciones son anulaciones (FP10) y reversiones de egresos (C7 del PRD de caja). Los borradores sí son mutables hasta confirmarse.

Transacciones únicas en la base del comercio:

Confirmar factura + vínculo con pedido + cambio de estado_pago + pago + egreso en cash_movements.

Crear pedido desde factura + alta de productos nuevos + líneas + (si se elige) estado Recibido e ingresos de stock con bloqueo de fila (regla de stock del PRD principal, 6.3) + (si se paga ahora) pago y egreso.

Revertir el egreso de un pago → facturas a pendiente y pedidos a "facturado" o "pendiente_pago".

Un solo egreso por pago: cuando el pedido tiene factura, el egreso de la caja siempre se crea desde supplier_payments; "Marcar como pagado" de C8 en un pedido con factura delega en el pago de la factura. Restricciones únicas en supplier_payments.cash_movement_id y en purchase_orders.pago_movimiento_id.

Consistencia de estado_pago: solo lo cambian las funciones de dominio (confirmar, pagar, revertir, anular), nunca un UPDATE directo desde la API; un job nocturno verifica que el estado coincida con los vínculos y pagos y alerta si no.

### 6.4 OCR: cabecera e ítems

Motor [a verificar costo, precisión y latencia]: opciones a evaluar en la Fase 0: Google Cloud Vision / Document AI (procesador de facturas), AWS Textract (AnalyzeExpense) o un modelo multimodal con salida estructurada (JSON validado con Zod). Criterios: precisión en facturas argentinas (tipos A, B y C, tickets de controlador fiscal, remitos), costo por factura y latencia menor a 15 s.

Dos niveles: cabecera (fecha, total, CUIT, número) siempre; ítems de línea (descripción, código, cantidad, unidad, precio unitario, subtotal) solo cuando no hay un pedido candidato con confianza alta, o para validar el contenido del matching. Así se controla el costo.

Salida estructurada: { fecha, total, cuit, tipo, punto_venta, numero, razon_social, vencimiento, items: [{ descripcion, codigo, cantidad, unidad, precio_unitario, subtotal }] } con confianza por campo (0 a 1).

Normalización: fechas dd/mm/aaaa; montos argentinos (punto de miles, coma decimal) a centavos; CUIT a 11 dígitos con validación del dígito verificador; número de comprobante a PPPP-NNNNNNNN; unidades de los ítems ("CJA", "X24", "BULTO", "UN", "KG") a un vocabulario fijo.

Reglas de coherencia que bajan la confianza: total distinto de la suma de ítems (más de 1%), fecha futura, CUIT inválido, varios candidatos a total en la imagen ("Subtotal", "Total", "IVA"), cantidad × precio unitario distinto del subtotal del ítem.

(P1) QR del comprobante: las facturas electrónicas argentinas suelen incluir un código QR con los datos del comprobante [a verificar formato vigente]; si se puede leer, se usa como fuente de alta confianza para CUIT, fecha, número y monto. No se consulta a ARCA ni se valida el CAE (no-objetivo del MVP).

Umbrales de confianza (ajustables con los datos del piloto): alta ≥ 0,85 (se muestra sin advertencia), media 0,6 a 0,85 (con "⚠ revisá"), baja < 0,6 (se pide el dato).

Privacidad: el motor externo solo recibe la imagen de la factura, sin otros datos del comercio; no se usa para entrenar modelos de terceros (revisar términos); sin montos ni fotos en los logs.

### 6.5 Algoritmo de matching de pedidos y confianza

Candidatos: pedidos del proveedor identificado, en estado Enviado o Recibido, con estado_pago = pendiente_pago (o con saldo pendiente), creados en los últimos 60 días.

Puntaje (0 a 1) = 0,6 × puntaje de monto + 0,3 × puntaje de fecha + 0,1 × puntaje de contenido.

Monto: diferencia relativa d = |total de la factura − total del pedido (o su saldo pendiente)| / total del pedido. Tolerancia por defecto: el mayor entre $1.000 y 3% del pedido (configurable por comercio y por proveedor). Puntaje 1 dentro de la tolerancia, decreciente linealmente hasta 0 con d = 30%.

Fecha: se compara la fecha de la factura con la de envío del pedido y, si existe, con la de recepción. Puntaje 1 entre el envío − 1 día y el envío + 7 días (o ± 2 días de la recepción), decreciente hasta 0 a los 30 días.

Contenido (si hay ítems leídos): proporción de productos de la factura que están en las líneas del pedido. Sin ítems, el peso se reparte entre monto y fecha.

Pistas: si el texto acompañante o la factura mencionan el número de pedido, ese pedido sube a puntaje 1.

### Decisión:

La sugerencia nunca cambia estados: solo arma el borrador. El cambio de estado_pago ocurre en la transacción de confirmación.

Cada sugerencia y la elección del usuario se registran en invoice_match_log, para medir la precisión (% de sugerencias directas aceptadas, % de "Otro pedido") y ajustar pesos y tolerancias (P2: tolerancia aprendida por proveedor).

### 6.6 Matching de productos de los ítems (pedido desde factura)

Por código: el código leído se normaliza (EAN-13, EAN-8, UPC con dígito verificador, igual que 6.5 del PRD principal) y se busca en product_codes. Si coincide un código de tipo caja, la cantidad de la factura se interpreta en cajas y se multiplica por el multiplicador del código. Confianza 0,95.

Por nombre: sin código o sin coincidencia, búsqueda difusa (pg_trgm + unaccent) sobre el nombre del producto y product_aliases, primero entre los productos del mismo proveedor y después en todo el catálogo. Se normalizan abreviaturas típicas de facturas ("CHOC AGUILA 100GR X24" → "chocolate aguila 100 g", caja de 24). Confianza = similitud, con bonificación si coinciden el gramaje y el proveedor.

Clasificación: ✅ existe (confianza ≥ 0,85), ❓ dudoso (0,6 a 0,85: se muestra el producto sugerido para confirmar), 🆕 nuevo (< 0,6 o sin candidatos).

Conversión de unidades por producto (según unidad_pedido y unidades_por_caja de F5.3):

Ítem en cajas o bultos de un producto que se pide por caja → cantidad en cajas; unidades = cajas × unidades_por_caja.

Ítem en unidades de un producto que se pide por caja → se guarda en unidades y el pedido muestra el equivalente ("48 u. = 2 cajas").

Ítem por monto o por kg (fiambre, cigarrillos, carga virtual) → línea por monto; el stock se suma según la unidad de stock del producto (cantidad estimada por costo, como F5.3).

Si la unidad de la factura no se puede inferir, el ítem se marca como dudoso y se pregunta.

Aprendizaje: cuando el usuario corrige un ítem (descripción leída → producto elegido), la descripción se guarda como alias del producto para ese proveedor, para que la próxima factura coincida sola.

Advertencia de doble carga: antes de sumar stock se buscan ingresos de stock de los mismos productos en las últimas 12 horas (FP8.8).

### 6.7 Google Photos Library API

OAuth con la cuenta de Google del dueño, consentimiento explícito y scopes mínimos (subida y acceso solo a lo creado por la app) [a verificar nombres de scopes vigentes]; refresh token cifrado en la base del comercio (misma conexión que la caja).

Subida en dos pasos (subir bytes → crear el media item en el álbum de la app) [a verificar flujo y cuotas vigentes]; se guarda el mediaItemId. Las baseUrl de contenido son temporales: se piden al mostrar.

Cambio de 2025: las apps solo pueden leer los medios que ellas subieron; por eso el OCR se hace con los bytes de WhatsApp y nunca se depende de leer la biblioteca del usuario. Si Google restringe más la API, el plan B es guardar la foto en el almacenamiento de objetos del producto (S3 / R2, como las fotos de productos del PRD principal) con URL firmada.

Verificar antes de construir: scopes disponibles, cuotas por proyecto y por usuario, y requisitos de verificación de la app OAuth (pantalla de consentimiento, posible revisión de seguridad).

Las URLs de descarga de media de WhatsApp son temporales [a verificar vigencia]: la descarga se hace apenas llega el webhook.

### 6.8 Idempotencia

Webhook: deduplicación por wamid (PRD del bot); un wamid genera como máximo un borrador.

Botones: cada botón interactivo lleva un id con el borrador y la acción (draft:<id>:<accion>:<nonce>); la confirmación usa ese id como clave de idempotencia, así un doble toque o un reintento no crea dos facturas, dos pagos, dos pedidos, dos egresos ni dos ingresos de stock.

Borradores: un borrador en "esperando_confirmacion" se confirma una sola vez (transición atómica UPDATE … WHERE estado = 'esperando_confirmacion' en la tabla de borradores, que sí es mutable); si el UPDATE no afecta filas, se responde con el resultado de la confirmación anterior.

Web: idempotency_key generado en el cliente, como los movimientos de caja.

Subida a Google Photos: reintentos con la misma clave; el mediaItemId se asocia una sola vez.

### 6.9 Auditoría, seguridad y calidad

Toda acción de FP10.4 se registra en el audit_log del comercio con origen (web / bot WhatsApp); el log del bot (B11.3 del PRD del bot) guarda el mensaje entrante y la respuesta.

Se guarda siempre el par valor sugerido / valor confirmado de cada campo y de cada ítem, para medir el OCR y para auditoría; las sugerencias de matching quedan en invoice_match_log.

Permisos aplicados en el backend (registrar pagos, sumar stock, crear productos, anular), nunca solo ocultando botones en el bot.

Sin fotos, montos, CUIT ni contenido de mensajes en Sentry o en los logs de aplicación. Datos tratados según la Ley 25.326; las fotos pasan por Meta (WhatsApp), por el motor de OCR y por Google: incluirlo en los términos y la política de privacidad.

Tests: unitarios (Vitest) del normalizador de montos y fechas, del matching de pedidos y de productos, de la conversión de unidades y de los estados de pago; end-to-end (Playwright + payloads de webhook) de los flujos 1 a 8; tests de que UPDATE y DELETE sobre facturas y pagos fallan; tests de aislamiento entre comercios.

Corpus de prueba: 200 o más fotos reales de facturas de proveedores de kioscos (con consentimiento) para medir el OCR y el matching antes del lanzamiento.

## 7. Riesgos y preguntas abiertas

### 7.1 Riesgos

### 7.2 Preguntas abiertas

Categoría en la caja: ¿se agrega la subcategoría "Pago a proveedores > Mercadería" al PRD de caja (C5), o se usa "Pago a proveedores" y la categoría Mercadería vive solo en la factura?

Estado "Facturado": el PRD principal agrega Pendiente de pago → Pagado; ¿se acepta el estado intermedio "Facturado (pendiente de pago)" para la cuenta corriente, o se modela como un atributo del pedido?

Recepción del pedido: F5.8 (Recibido) es P1 en el PRD principal; este PRD necesita una recepción simple en el MVP para "Crear y sumar stock". ¿Se adelanta la recepción sin diferencias por línea al MVP?

Pagos parciales: C8.9 del PRD de caja los deja para P1; este PRD los necesita para entregas parciales (FP7.7). ¿Se adelantan o el MVP solo ofrece "Cerrar pedido" con diferencia?

Tolerancia de monto: ¿3% o $1.000 por defecto es razonable con los aumentos de precios entre el pedido y la entrega? Validar con datos del piloto.

Motor de OCR: ¿servicio especializado en facturas o modelo multimodal? ¿Qué costo por factura es aceptable?

Empleados: ¿pueden sumar stock y crear productos desde una factura por defecto, o solo el dueño?

Google Photos obligatorio: ¿se exige conectar Google Photos o se ofrece el almacenamiento propio por defecto para quien no quiere conectar su cuenta?

Una factura, varios pedidos: ¿es frecuente que el preventista facture juntos dos pedidos? Si lo es, la imputación entre pedidos sube a P0.

Remitos sin precio: ¿se aceptan remitos como comprobante para sumar stock aunque el monto llegue después en la factura?

Actualización de costos desde la factura (FP8.11): ¿P1 o MVP, dado que es lo que más necesita el dueño cuando el proveedor aumenta?

Plan: ¿el módulo está en todos los planes o es diferencial del plan Pro (por el costo de OCR y de mensajes)?

Decisiones tomadas: OCR siempre como sugerencia con confirmación en un toque; categoría Mercadería; modo de pago por proveedor con excepción por factura; un solo egreso por pago; facturas y pagos inmutables, con anulación y reversión; matching de pedidos que solo sugiere y nunca cambia estados sin confirmación; recepción de stock desde la factura como opción explícita (propuesta por defecto) que deja el pedido en Recibido; una base de datos por cliente más base de control, como ModoOps; sin validación de facturas electrónicas AFIP/ARCA en el MVP.

## 8. Plan por fases

Supuesto: el MVP del inventario (con proveedores, pedidos y estado de pago), el MVP de la caja y el MVP del bot (vinculación y mensajes interactivos) están en producción o en beta.

### Fase 0: diseño y validación (2 semanas)

Recolección de 200 o más fotos reales de facturas de 5 a 10 kioscos y sus proveedores; comparación de motores de OCR (precisión de fecha, total, CUIT, número e ítems; costo y latencia).

Verificación de la Google Photos Library API (scopes, cuotas, verificación OAuth) y de la descarga de media de WhatsApp Cloud API.

Acuerdos con los otros PRD: estado_pago con "Facturado", subcategoría Mercadería, recepción simple en el MVP, origen "factura_proveedor" en caja y stock, plantillas factura_para_revisar y cierre_cuenta_corriente.

Guion de conversaciones de los flujos 1, 3, 4 y 6 probado con dueños reales.

### Fase 1a: MVP de facturas y matching de pedidos (semanas 3 a 6)

FP1 recepción por el bot, FP2 Google Photos, FP3 OCR de cabecera con confirmación en un toque y edición.

FP4 proveedor y categoría Mercadería; FP5 pagar ahora o cuenta corriente, con excepción por factura.

FP6 facturas impagas y cierre de cuenta corriente con egreso en la caja.

FP7 matching automático con pedidos: un candidato, varios candidatos, montos parciales (cerrar con diferencia; pago parcial si se adelanta C8.9), estados Facturado y Pagado con confirmación, descuento automático en la caja.

FP9 duplicados, FP10 inmutabilidad y anulación, FP11 pantallas web, FP12 avisos básicos.

Hito: beta con 5 comercios del piloto.

### Fase 1b: pedido desde la factura (semanas 7 a 9)

OCR de ítems de línea, matching de productos por código y después por nombre, confianza por ítem, conversión de unidades y cajas por producto.

FP8: lista de ítems con existentes, dudosos y nuevos con su stock actual, corrección en el chat, alta de productos en el momento, pedido nuevo vinculado (Pagado o Facturado según el modo de pago), opción "Crear y sumar stock" con estado Recibido, advertencia de doble carga y "Solo guardar fact." como alternativa.

Aprendizaje de alias por proveedor.

Hito: módulo disponible para todos los comercios del plan definido.

### Fase 2: comodidad (meses 3 a 5)

Carga desde la web y PDF de facturas reenviados por el proveedor.

Lectura del QR del comprobante como fuente de datos (sin validar contra ARCA).

Actualización de costos y márgenes desde la factura; una factura imputada a varios pedidos.

Vencimientos de facturas en la agenda de la caja (C9) y recordatorios; resumen semanal de deuda en el resumen del viernes del bot.

Álbum por proveedor y mes en Google Photos; alta de proveedor desde el bot; exportación para el contador; solicitud de anulación por empleados.

### Fase 3: inteligencia e integraciones (meses 6 a 12)

Tolerancias y pesos del matching aprendidos por proveedor.

Notas de crédito, devoluciones y descuentos por pronto pago.

Evaluación de validación de facturas electrónicas AFIP/ARCA vía partner y de recepción de facturas por email.

## Anexo A: glosario

Campo | Detalle
--- | ---
Producto | Módulo Facturas de Proveedores del Sistema de Inventario para Kioscos y Comercios
Autor | Mauricio Matasini
Estado | Borrador v1
Fecha | 9 de octubre de 2026
Documentos relacionados | "PRD - Sistema de Inventario para Kioscos y Comercios" (en adelante, PRD principal: proveedores F6, pedidos de reposición F5, productos y códigos F1/F2, costos F7), "PRD - Caja Digital para Sistema de Inventario" (en adelante, PRD de caja: movimientos, reversión, pago de pedidos C8, fotos de comprobantes en Google Photos) y "PRD - Bot de WhatsApp para Sistema de Inventario" (en adelante, PRD del bot: vinculación, mensajes interactivos, ventana de 24 h). Este documento usa la misma terminología.
Stack | Astro + TypeScript, PostgreSQL, una base de datos por cliente más una base de control (igual que ModoOps)

# | Objetivo | Cómo se mide
--- | --- | ---
OF1 | Que toda factura de proveedor quede guardada y encontrable | % de pagos a proveedores en la caja con factura vinculada (meta: más de 70% a los 3 meses)
OF2 | Registrar una factura en segundos | Tiempo desde que se manda la foto hasta la confirmación (meta: menos de 30 segundos para una factura con pedido)
OF3 | Sugerencias de OCR útiles | % de facturas confirmadas sin editar fecha ni monto (meta: más de 80%)
OF4 | Vincular facturas con pedidos | % de facturas con pedido vinculado, por matching o creado desde la factura (meta: más de 85%)
OF5 | Saber cuánto se le debe a cada proveedor | Comercios con proveedores en cuenta corriente que consultan el saldo al menos una vez por semana
OF6 | Cero pagos duplicados | Facturas duplicadas detectadas antes de confirmar; egresos duplicados en caja (meta: 0)
OF7 | Trazabilidad total | 100% de las facturas con foto, usuario, fecha y hora; cero facturas borradas

Prioridad | Significado
--- | ---
P0 - MVP | Imprescindible para el lanzamiento del módulo
P1 - Post-MVP cercano | Dentro de los 2 a 3 meses posteriores
P2 - Futuro | Según demanda

# | Funcionalidad | MVP (P0) | Más adelante (P1/P2)
--- | --- | --- | ---
FP1 | Recepción de la foto por el bot | Foto (o varias páginas) por WhatsApp, con o sin texto | PDF de factura reenviado por el proveedor (P1), carga desde la web (P1)
FP2 | Guardado en Google Photos | Subida al Google Photos del comercio por OAuth, asociada a proveedor y pedido | Álbum por proveedor y mes (P1)
FP3 | OCR como sugerencia y confirmación en un toque | Fecha y monto total; CUIT y número de factura opcionales; botón "Confirmar" y edición previa | Lectura del QR del comprobante como fuente de datos, sin validar contra ARCA (P1)
FP4 | Proveedor y categoría Mercadería | Vínculo obligatorio con un proveedor de F6; categoría Mercadería | Alta de proveedor nuevo desde el bot (P1)
FP5 | Modo de pago: pagar ahora o cuenta corriente | Configurable por proveedor, con excepción por factura | Recordatorio el día de cierre (P1)
FP6 | Facturas impagas y cierre de cuenta corriente | Lista de impagas, saldo por proveedor, pago de una o varias facturas | Vencimientos automáticos en la agenda de la caja (P1)
FP7 | Matching automático con pedidos de reposición | Sugerencia de pedido pendiente (uno, varios o ninguno), montos parciales, marcado Pagado o Facturado con confirmación | Aprendizaje de la tolerancia por proveedor (P2)
FP8 | Pedido desde la factura (sin pedido previo) | Ítems leídos cruzados con productos y stock, corrección, alta de productos, pedido nuevo vinculado, recepción de stock opcional | Actualización de costos desde la factura (P1)
FP9 | Detección de duplicados | Por número de factura, por foto y por proveedor + monto + fecha | —
FP10 | Inmutabilidad, anulación y auditoría | Facturas confirmadas inmutables, anulación con motivo, log | Aprobación del dueño para anulaciones pedidas por empleados (P1)
FP11 | Pantallas web | Lista de facturas, ficha de factura, cuenta corriente del proveedor | Exportación para el contador (P1)
FP12 | Avisos | Factura de empleado pendiente de pago, cierre de cuenta corriente | Resumen semanal de deuda con proveedores (P1)

Tabla | Campos principales
--- | ---
supplier_invoice_drafts (borradores, mutables) | id, user_id, origen (bot / web), wamid(s), resultado OCR crudo (JSON), campos sugeridos con confianza por campo, proveedor sugerido, candidatos de pedido (JSON con puntajes), ítems sugeridos con su matching, estado (leyendo / esperando_confirmacion / confirmado / descartado / vencido), expira_at
supplier_invoices (inmutable) | id (UUID), draft_id, supplier_id, categoria (mercaderia), tipo_comprobante (A / B / C / remito / ticket / otro), punto_venta, numero, cuit_emisor, fecha_emision, fecha_vencimiento, monto_total_centavos (bigint, mayor a 0), modo_pago (pagar_ahora / cuenta_corriente), origen (bot / web), confirmado_por (user_id), confirmado_at, idempotency_key (único), created_at. Índice único parcial (supplier_id, tipo_comprobante, punto_venta, numero) para facturas con número y no anuladas
supplier_invoice_photos | id, draft_id / invoice_id, orden (página), wa_media_id, sha256, phash, mime, photos_media_item_id (mediaItemId de Google Photos), photos_album_id, estado_subida (pendiente / subida / fallida), uploaded_at
supplier_invoice_lines (inmutable) | id, invoice_id, descripcion_leida, codigo_leido, product_id (nullable), cantidad, unidad_factura (unidad / caja / bulto / kg / monto), unidades_equivalentes, precio_unitario_centavos, subtotal_centavos, match_tipo (codigo / nombre / alias / manual / nuevo), match_confianza, producto_creado (bool)
supplier_invoice_order_links | id, invoice_id, purchase_order_id, monto_imputado_centavos, origen (match_sugerido / elegido_de_lista / manual_web / creado_desde_factura), match_score, tipo (total / parcial / cierre_con_diferencia), motivo_diferencia, created_by, created_at
supplier_payments (inmutable) | id, supplier_id, tipo (pago_inmediato / cierre_cc / pago_manual), fecha, metodo_id, monto_centavos, cash_movement_id (único: egreso en la caja), user_id, idempotency_key (único), created_at
supplier_payment_allocations (inmutable) | payment_id, invoice_id, monto_centavos (la suma por factura no puede superar su saldo)
supplier_invoice_voids (inmutable) | invoice_id (único), motivo, user_id, cash_reversal_movement_id (nullable), created_at
invoice_match_log | draft_id, tipo (pedido / producto / proveedor), candidatos y puntajes (JSON), opción mostrada, opción elegida, aceptada (bool), user_id, created_at
suppliers (campos nuevos) | cuit normalizado, modo_pago_facturas, cierre_periodicidad (semanal / mensual), cierre_dia, tolerancia_monto (override), photos_album_id (P1)
purchase_orders (campos nuevos) | estado_pago (pendiente_pago / facturado / pagado: base del PRD principal y de C8 del PRD de caja, más "facturado" de este PRD), saldo_pendiente_centavos (derivado de vínculos y pagos), origen (web / bot / desde_factura), pago_movimiento_id
products (campos nuevos) | creado_desde_factura (bool), requiere_completar (bool)
product_aliases (PRD del bot, uso nuevo) | product_id, alias, supplier_id (nullable: alias aprendido de las facturas de ese proveedor)
cash_movements (PRD de caja, valores nuevos) | origen += "factura_proveedor"; ref_tipo += "supplier_payment"; proveedor_id; comprobante_photos_media_item_id con el mediaItemId de la factura
stock_movements (PRD principal, valores nuevos) | origen += "factura de proveedor"; referencia al pedido y a la factura
google_photos_connections | cuenta de Google, refresh_token cifrado, scopes otorgados, álbumes creados por la app, estado, conectado_por, conectado_at (compartida con la caja)

Situación | Acción del bot
--- | ---
Un candidato con puntaje ≥ 0,8 y ventaja ≥ 0,15 sobre el segundo | Sugerencia directa con botones (FP7.2)
Dos o más candidatos con puntaje ≥ 0,5, o el mejor entre 0,5 y 0,8 | Lista para elegir (FP7.3)
Monto fuera de tolerancia, pero fecha y contenido coinciden | Sugerencia como parcial o con diferencia (FP7.7)
Ningún candidato con puntaje ≥ 0,5 | Pedido desde la factura (FP8)

Riesgo | Impacto | Probabilidad | Mitigación
--- | --- | --- | ---
OCR impreciso en facturas en papel térmico, arrugadas o manuscritas | Alto | Alta | Todo es sugerencia con confirmación, confianza por campo, pedido del dato si no se lee, corpus de prueba y elección del motor en la Fase 0
Cambios o restricciones en la Google Photos Library API (en 2025 las apps quedaron limitadas a leer lo que subieron) | Medio | Media | Verificar antes de construir; OCR sobre los bytes de WhatsApp; plan B con almacenamiento propio
Matching de pedido equivocado que marca Pagado el pedido incorrecto | Alto | Media | Nunca automático: confirmación con un toque, lista cuando hay ambigüedad, reversión y anulación, log de sugerencias
Doble egreso en la caja (pago desde la factura y desde el pedido) | Alto | Media | Un solo egreso por pago, C8 delega en el pago de la factura, restricciones únicas y tests
Stock duplicado (escaneo + recepción desde la factura) | Medio | Media | Recepción como opción explícita, advertencia de ingresos recientes
Catálogo ensuciado con productos creados desde facturas con nombres abreviados | Medio | Alta | Marca "completar datos", revisión desde la web, alias aprendidos, confirmación de cada alta
Costo del OCR y de los mensajes de WhatsApp por factura | Medio | Media | Medir el costo por factura en el piloto, OCR en dos niveles (ítems solo si hacen falta), incluirlo en el precio del plan
Expectativa de validación fiscal ("¿esta factura es válida en ARCA?") | Medio | Media | Comunicar el no-objetivo; evaluar validación vía partner en fases posteriores
Fotos con datos sensibles en servicios de terceros (Meta, OCR, Google) | Medio | Baja | Consentimiento, términos claros, mínimo de datos, sin logs de contenido
Dependencia de los PRD de inventario (estado de pago, recepción), caja (egresos, reversión) y bot (imágenes, plantillas) | Medio | Alta | Coordinar los cuatro PRD en la Fase 0; contratos de servicio definidos

Término | Definición
--- | ---
Factura de proveedor | Comprobante de compra de mercadería (factura, ticket o remito valorizado) cargado por foto
Borrador | Factura leída por OCR que todavía no se confirmó; no afecta la caja ni la cuenta corriente
Sugerencia | Dato propuesto por el OCR o por el matching, que solo se registra después de la confirmación
Confirmación en un toque | Botón interactivo de WhatsApp que acepta la sugerencia tal cual
Matching de pedidos | Búsqueda del pedido de reposición pendiente que cubre una factura
Pedido desde factura | Pedido de reposición creado a partir de los ítems de una factura sin pedido previo
Estado de pago | Pendiente de pago, Facturado (pendiente de pago) o Pagado, en un pedido de reposición
Cuenta corriente | Modo en que las facturas de un proveedor se acumulan y se pagan en un cierre semanal o mensual
Cierre | Pago de las facturas pendientes de un proveedor en cuenta corriente
Anulación | Registro que deja sin efecto una factura confirmada sin borrarla
mediaItemId | Identificador de la foto en el Google Photos del comercio
