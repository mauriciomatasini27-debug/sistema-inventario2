---
id: MOD-03-PRECIOS-PARTE-2
tipo: spec
estado: propuesto
modulos: [inventario, precios]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: ""
---
> Origen: `PRD - Gestión de Precios para Sistema de Inventario (Parte 2).docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/pricing`, `src/pages/api/prices/*`

---

# PRD - Gestión de Precios para Sistema de Inventario (Parte 2)

Documento dividido en 2 partes (por tamaño; la numeración es continua y no se quitó contenido).

Parte 1: https://docs.google.com/document/d/15gnWW2l2lkCFC-3shvHe9A6WfxfF2xje6IDj20ysyso/edit (encabezado, decisiones tomadas, 1. Resumen, 2. Objetivos y no-objetivos, 3. Usuarios, 4. Funcionalidades GP1 a GP6).

Parte 2 (este documento): 4. Funcionalidades GP7 a GP11 (continuación), 5. Flujos, 6. Notas técnicas, 7. Riesgos y preguntas abiertas, 8. Plan por fases y Anexo A.

## 4. Funcionalidades (continuación de la Parte 1)

### GP7. Configuración de precios y alertas (P0)

Descripción: una pantalla única, "Configuración de precios y alertas", a la que se llega con un botón desde "Precios" (y desde Configuración). Es solo para el Dueño y se opera completa desde el celular. Reúne los valores que gobiernan los ajustes de precio y el umbral de stock bajo; ningún valor está fijo en el código: todos son configurables, con un valor por defecto del comercio y, donde corresponde, un override por producto. Los cambios quedan en la auditoría y rigen desde ese momento (no recalculan ajustes ya creados ni ventas pasadas).

### Requerimientos:

GP7.1 Acceso: botón "Configuración de precios y alertas" (ícono de engranaje) en la pantalla "Precios" y en Configuración. Visible y accesible solo para el rol Dueño (AU4.5: configuración del comercio 🔒); un Empleado no ve el botón y la API devuelve 403. Requiere conexión (OF9.5). Diseño mobile-first: secciones plegables, campos numéricos con teclado numérico y guardado por sección.

GP7.2 Redondeo: paso ($1, $10, $50 o $100; por defecto $10) y dirección (hacia arriba, al más cercano o hacia abajo; por defecto hacia arriba). Se aplica a ajustes masivos, recálculos por markup y precios derivados (GP5.4). (P1: redondeo por categoría.)

GP7.3 Topes de aumento: límites al aumento de precio de un producto en un solo cambio (ajuste masivo, recálculo o edición individual), para evitar errores:

Tope en pesos (ej.: no subir más de $1.500 por unidad de una vez) y tope en porcentaje (ej.: no subir más de 30% de una vez).

Cada uno tiene un valor por defecto del comercio y un override por producto (en la ficha del producto y en una lista "Topes por producto" dentro de esta pantalla).

Cualquiera puede quedar vacío = sin tope. El override del producto, si está cargado, reemplaza al valor por defecto para ese tope; si está vacío, se usa el por defecto. Override con la opción "Sin tope para este producto".

Si hay tope en $ y en %, rige el más restrictivo para ese producto.

Al superarlo: comportamiento de GP1.6 (limitar, excluir o superar con confirmación reforzada). En una edición individual, se pide la confirmación reforzada.

Valores por defecto de fábrica: los dos vacíos (sin tope); el onboarding sugiere cargarlos.

GP7.4 Umbral de revisión: porcentaje a partir del cual un aumento pide revisión reforzada (GP1.7). Por defecto 20%, configurable (de 1% a 300%). Aplica al % ingresado y al aumento real de cada producto.

GP7.5 Umbral de stock bajo (regla definida en F4 del PRD principal): en esta misma pantalla se editan el valor por defecto del comercio (F4.1: "valor por defecto configurable a nivel comercio, ej.: 0 = sin alerta") y los overrides por producto (lista con buscador, filtro por categoría y edición rápida; también en la ficha del producto). La lógica de las alertas (alerta cuando stock ≤ umbral, se resuelve sola, umbral 0 = sin alerta, panel y pedido de reposición) la define y la mantiene el PRD principal (F4); esta pantalla solo es el lugar donde se configuran los valores y no cambia esa lógica. Un producto sin override usa el valor por defecto vigente.

GP7.6 Otros valores de precios: métrica principal (markup o margen, F7.2), markup mínimo manual y fuente activa (GP6.9), categorías que cuentan como costo fijo (GP6.2), exclusión de productos o categorías de los ajustes masivos (GP1.2) y aviso de descuento debajo del markup mínimo (GP9.2).

GP7.7 Vigencia de los cambios: cada cambio rige desde que se guarda. No modifica ajustes ya programados (que guardan su redondeo y topes en su snapshot, 6.2) ni ventas pasadas. Un cambio del umbral de stock bajo se evalúa en el momento (los productos que quedan en o debajo del nuevo umbral entran en alerta según F4.2).

GP7.8 Auditoría: cada cambio queda en el audit_log inmutable: campo, valor anterior y nuevo, alcance (comercio o producto), usuario, timestamptz del servidor, origen y dispositivo.

GP7.9 Validaciones: números positivos; tope en % entre 0,01% y 300%; tope en $ mayor a $0; umbral de stock entero ≥ 0; mensajes en castellano ("El tope tiene que ser mayor a $0 o quedar vacío").

GP7.10 Entradas de la recomendación (GP6, decisiones 9/10/2026): en la sección "Recomendación de precios":

Costos fijos: categorías de la caja que cuentan como costo fijo, con Sueldos y adelantos marcada por defecto (GP6.2).

Retiro del dueño: "¿Cuánto querés llevarte por mes?" (monto objetivo; vacío = se usa el promedio de los retiros registrados de los últimos 3 meses cerrados) (GP6.2 bis).

Condición fiscal: monotributo (por defecto) o responsable inscripto (el IVA para RI queda fuera del MVP; con RI se avisa "El cálculo no incluye IVA todavía").

Ingresos Brutos: alícuota % sobre la venta (vacío = 0%) [a verificar según jurisdicción y actividad].

Comisiones por medio de pago: % para Débito, Mercado Pago, QR y, si corresponde, Efectivo y Transferencia (vacío = 0%), y período de la mezcla de cobros (último mes o últimos 3 meses).

Ganancia deseada: % del precio (vacío = 0%).

Validación: impuestos + comisiones + ganancia deseada < 60%.

GP7.12 Promociones (interacción con precios, GP9.12): "Permitir acumular descuentos manuales sobre productos en promoción" (por defecto, desactivado) y "Avisar si la promoción queda debajo del markup mínimo" (por defecto, activado). Las promociones en sí se configuran según RT12 del PRD de rotación.

GP7.11 Asesor de costos por proveedor (GP11, P1): umbral de ahorro para avisar (por defecto 5%), cantidad de productos en el aviso del viernes (por defecto 5), antigüedad para marcar un costo "desactualizado" (por defecto 60 días) e incluir o no el consejo en el resumen del viernes. Todos configurables, ninguno fijo en el código.

### Criterios de aceptación:

☐ Como Dueño, desde el celular toco "Configuración de precios y alertas" en "Precios" y edito todos los valores sin PC.

☐ Como Empleado no veo el botón y la API responde 403.

☐ Cargo tope por defecto de 30% y dejo vacío el tope en $; un ajuste de +35% marca como "supera el tope" a todos los productos sin override.

☐ Al Fernet 750 le cargo un tope de $1.500; un ajuste de +15% sobre $12.000 (+$1.800) lo limita a $13.500 por defecto, aunque el tope en % no se supere.

☐ Marco un producto "Sin tope" y no recibe avisos de tope.

☐ Dejo los dos topes por defecto vacíos y ningún ajuste muestra avisos de tope.

☐ Cambio el umbral de revisión de 20% a 15%; un ajuste nuevo de 18% pide revisión reforzada; un ajuste de 18% ya programado antes no cambia.

☐ Cambio el umbral de stock bajo por defecto de 0 a 5; los productos sin override con stock ≤ 5 aparecen en alertas (según F4) y los que tienen override mantienen el suyo.

☐ Cargo override de stock bajo 3 al Chocolate Águila y el producto alerta en 3 aunque el valor por defecto sea 5.

☐ Cada cambio aparece en la auditoría con valor anterior, valor nuevo, usuario y hora.

☐ Cargo Ingresos Brutos 3,5%, comisiones (Débito 1,5%, Mercado Pago 3%, QR 1%) y ganancia deseada 10%; los precios recomendados se recalculan y el cambio queda en la auditoría.

☐ Cargo "quiero llevarme $1.500.000 por mes" y la recomendación con retiro usa ese monto en lugar del promedio.

☐ Desmarco "Sueldos y adelantos" como costo fijo y la recomendación deja de incluirlos (y la auditoría lo registra).

☐ Si impuestos + comisiones + ganancia deseada suman 60% o más, no me deja guardar.

☐ Activo "Permitir acumular descuentos manuales sobre productos en promoción" y el cambio queda en la auditoría; desde ese momento la venta permite el descuento y el aviso contra el costo se evalúa sobre el precio final.

☐ (P1) Cambio el umbral de ahorro del asesor de 5% a 8% y el próximo resumen del viernes solo incluye productos con ahorro mayor a 8%.

### GP8. Auditoría de precios (P0)

Descripción: todo cambio de precios queda en la auditoría inmutable del PRD principal (F3, 6.11).

### Requerimientos:

GP8.1 Ajustes: creación, aplicación, cancelación y reversión, con quién (o "Sistema" para la aplicación por job), cuándo (hora del servidor), %, tipo (aumento/baja), alcance (todos, categorías, proveedores P1), vigencia, redondeo, topes, si hubo revisión reforzada, cantidad de productos afectados y excluidos, y referencia al detalle producto por producto.

GP8.2 Cambios individuales: precio, costo, modo de precio, markup del producto, exclusión de ajustes masivos y overrides (GP7), con valor anterior y nuevo.

GP8.3 Recomendación y mínimo activo: cada recomendación emitida (con sus datos de entrada) y cada cambio del valor manual o de la fuente activa.

GP8.4 La vista "Ver trazabilidad" de cada producto (F3 del PRD principal) muestra los cambios de precio y costo junto a los movimientos de stock.

GP8.5 El bot registra en su auditoría (B11) las consultas de precio y las acciones de precios hechas desde el chat.

### Criterios de aceptación:

☐ Después de un ajuste de +8%, la auditoría muestra "Mauricio · 9/10 19:40 · Aumento 8% · Todos · 412 productos · 21 excluidos · rige 12/10 00:00".

☐ La aplicación del ajuste el lunes figura como hecha por "Sistema".

☐ No hay forma de editar ni borrar un registro de auditoría de precios.

### GP9. Integraciones (P0 salvo indicación)

GP9.1 Inventario (PRD principal): el precio vigente y su historial viven en la ficha del producto (F1, F7); la valorización a precio de venta (F7.5) usa el precio vigente; el alta de producto (F1.1, F2.6) crea el primer registro de precio y de costo; los productos archivados no entran en ajustes.

GP9.2 Descuentos en la venta (reglas de negocio en la sección de precios y descuentos del PRD principal, en edición; cálculo, redondeo y prorrateo en TV4 del PRD de tickets): los descuentos por línea y por ticket se aplican sobre el precio de lista vigente y quedan en el snapshot (GP4.1). El control de "bajo costo" se hace por línea sobre lo efectivamente cobrado: neto de línea − descuento del ticket asignado (TV4.5) comparado con costo unitario × cantidad. Un descuento no puede dejar el precio por debajo del costo en silencio:

Dueño: si el precio con descuento queda debajo del costo, aviso "Con este descuento vendés por debajo del costo ($X de pérdida)" y confirmación explícita; opcional en GP7: aviso también debajo del markup mínimo activo.

Empleado (que no ve costos, AU4.3): solo puede aplicar descuentos hasta el máximo que el dueño le habilitó (TV4.7: por defecto 10%); si con conexión el servidor detecta que el precio queda debajo del costo, se muestra "Este descuento necesita autorización del dueño" sin mostrar el costo. Offline, la venta no se frena (el mostrador sigue): se marca "venta bajo costo" al sincronizar y el dueño la ve en el reporte.

Toda venta bajo costo queda marcada en la línea y en el reporte de diferencias.

GP9.3 Rotación (PRD de rotación): los productos de baja rotación (RT4) muestran el atajo "Revisar precio"; la lista de dormidos permite iniciar un ajuste (baja) sobre los elegidos (P1, GP2.5). El margen y el markup realizados (RT2.2) usan los snapshots de GP4.1, y GP6 usa los mismos ingresos netos (RT1.3).

GP9.4 Consumos (PRD de consumos): las facturas de servicios confirmadas (Luz, Gas, Servicios, Impuestos > ARCA, Impuestos > Tasas municipales) y el alquiler de la caja son la fuente de los costos fijos de GP6; el detalle de la recomendación enlaza cada factura.

GP9.5 Tickets (PRD de tickets): cada línea del ticket muestra el precio unitario aplicado, el descuento y el total; la reimpresión usa el snapshot. Un ajuste nunca cambia un ticket emitido.

GP9.6 Caja (PRD de caja): las ventas entran a la caja por el importe cobrado (snapshot); un ajuste de precios no genera movimientos de caja; las devoluciones reintegran el precio cobrado (F10.5 y C14).

GP9.7 Offline (PRD de offline, decisión v1): el catálogo local incluye precios vigentes y futuros programados (GP3.4); los costos solo para quien puede verlos (OF3.1); los cambios de precio y la configuración son solo online (OF9.5); "gana el servidor" para el precio de lista (OF10.7); las diferencias se marcan sin tocar tickets (GP4.5).

GP9.8 Bot de WhatsApp (PRD del bot, número central): el bot resuelve primero con herramientas determinísticas (consultar el precio de un producto, listar ajustes programados, ver la recomendación, cancelar un ajuste programado con confirmación) y solo si las reglas no entienden el mensaje usa IA para interpretarlo, nunca para calcular. En el MVP: consultas de precio (Dueño y Empleado), aviso de ajuste aplicado (opcional; en la app por defecto para no sumar plantillas pagas), recordatorio la víspera de un ajuste programado (opcional) y la recomendación mensual (GP6.8). (P1) Crear un ajuste desde el chat ("subí 8% todo desde el lunes"): el bot arma el borrador con herramientas determinísticas, manda el resumen y un link a la vista previa, y el ajuste solo se crea con la confirmación del dueño (y AU10 si supera el umbral de revisión).

GP9.9 Roles (PRD de autenticación): solo el Dueño cambia precios, costos, markups, configuración y ajustes (AU4, 🔒 no delegable en el MVP); permisos evaluados en el backend en cada request (AU4.2); el job de aplicación actúa como "Sistema" (AU4.8); reautenticación reciente para ajustes masivos (AU10).

GP9.10 Asesor de costos por proveedor (GP11, P1): referencias cruzadas propuestas con el PRD del bot (B9 resumen del viernes, B7 pedido, B3 consultas), el PRD de facturas (costos por proveedor desde el OCR), el PRD de rotación (venta promedio diaria) y F6 del PRD principal (proveedores alternativos). Ver la tabla de GP11.9; esos documentos no se modificaron.

GP9.12 Promociones y combos (v1, decisión 9/10/2026; definidos en RT12 del PRD de rotación): las promociones (precio promocional, porcentaje, 2×1 y similares) y los combos, con su vigencia y su alta, los define RT12; este PRD define solo su interacción con los precios:

Precio promocional contra el costo: al crear o editar una promoción, el sistema calcula el precio efectivo por unidad (en un 2×1, precio / 2; en un combo, el precio del combo repartido entre sus productos en proporción a su precio de lista, con el método del mayor resto de TV4.5 para que la suma dé exacta) y lo compara con el costo vigente (cost_history). Si queda debajo del costo, aviso en rojo con la pérdida por unidad y por promoción y confirmación explícita del Dueño; si queda debajo del markup mínimo activo (GP6.9), aviso en ámbar. Nunca se bloquea: decide el dueño, y la marca queda en la auditoría.

Sin acumulación por defecto: sobre una línea que ya tiene promoción no se puede aplicar un descuento manual (de línea ni la parte del descuento de ticket que le tocaría): la venta muestra "Este producto ya está en promoción". El Dueño puede habilitar la acumulación en GP7.12 (por defecto, desactivada); si la habilita, el aviso contra el costo se evalúa sobre el precio final.

Cálculo del margen: la línea guarda el precio de lista, la promoción aplicada (promotion_id), el importe de la promoción y el precio efectivamente cobrado (snapshot de GP4.1). La ganancia = cobrado − costo unitario × cantidad; el margen y el markup realizados (RT2.2) usan lo cobrado. El markup y el margen de lista del producto (GP5.2) no cambian por la promoción.

Independencia del historial de precios: una promoción no crea registros en price_history (no es un cambio del precio de lista); un ajuste masivo no modifica el precio promocional ya definido, y si deja el precio de lista por debajo del promocional, la vista previa lo avisa. La recomendación de precio (GP6.12) se calcula sobre el precio de lista y muestra "En promoción hasta el 20/10".

Offline (v1): las promociones vigentes y futuras viajan en el catálogo local como los precios programados (GP3.4) y se aplican según la hora local; al sincronizar, la referencia es la promoción vigente a la hora validada, con las mismas reglas de diferencias de GP4.5.

GP9.11 Caja (recomendación, decisiones 9/10/2026): GP6 lee de la caja los Sueldos y adelantos, los retiros del dueño, los retiros "compra para el negocio" (tipo propuesto al PRD de caja como referencia cruzada) y la mezcla de cobros por medio de pago (C4).

### Criterios de aceptación:

☐ Como Dueño, aplico un descuento que deja un alfajor de costo $600 en $550 y la app me avisa la pérdida de $50 y me pide confirmar.

☐ Como Empleado con conexión, el mismo descuento pide autorización del dueño sin mostrarme el costo.

☐ Offline, como Empleado, la venta con descuento bajo costo se hace y, al sincronizar, queda marcada "venta bajo costo".

☐ Le pregunto al bot "¿a cuánto está la coca de 500?" y responde el precio vigente con la herramienta de consulta, sin usar IA para el cálculo.

☐ Un ajuste de precios no genera ningún movimiento en la caja.

☐ Un producto dormido (RT4) muestra el atajo "Revisar precio".

☐ (Promos, RT12) Creo un 2×1 de un alfajor de precio $950 y costo $600: el precio efectivo es $475 por unidad y la app me avisa en rojo que pierdo $125 por unidad ($250 por promoción) y me pide confirmar.

☐ Un combo Coca-Cola 500 ml ($1.400, costo $1.000) + Alfajor ($950, costo $600) a $2.100 se reparte en $1.251,06 y $848,94 (suma exacta $2.100); la ganancia del combo es $500, margen 23,81% y markup 31,25%, sin aviso de bajo costo.

☐ Con la acumulación desactivada (por defecto), no puedo aplicar un descuento manual a una línea en promoción, ni le toca parte del descuento del ticket.

☐ La promoción no crea registros en price_history y el markup de lista del producto no cambia; la ganancia de la venta usa lo cobrado.

### GP10. Una base de datos por cliente (P0)

GP10.1 Todas las tablas de este módulo viven en la base de datos de cada comercio (una base por cliente, igual que ModoOps; 6.4 del PRD principal), sin tenant_id. La base de control solo guarda métricas agregadas (cantidad de ajustes, estado de los jobs), sin precios ni montos.

GP10.2 Los jobs (6.5) recorren los comercios desde la base de control y se ejecutan en la base de cada uno, aislados: la falla de un comercio no frena a los demás.

### Criterios de aceptación:

☐ Un ajuste en el comercio A no tiene forma técnica de leer ni modificar precios del comercio B.

☐ La restauración del backup de un comercio incluye su historial de precios, ajustes y recomendaciones completos.

### GP11. Asesor de costos por proveedor (P1; el MVP junta los datos)

Descripción: una capacidad del bot, con su vista web, que compara lo que le cobra cada proveedor al comercio por el mismo producto y le avisa al dueño cuándo otro proveedor es más barato, cuánto ahorraría por unidad y por mes, y qué puede hacer con ese ahorro (vender más barato con el mismo margen o mantener el precio y ganar más). Es solo un consejo: el comerciante decide y nada cambia automáticamente. La lógica es determinística (cuentas, no IA).

### Requerimientos:

GP11.1 Datos: varios proveedores por producto, con su costo (captura en el MVP). Un producto puede tener varios proveedores (formaliza los "proveedores alternativos" de F6.2 del PRD principal, hoy P1), cada uno con su historial de costos por proveedor (product_supplier_costs, append-only, 6.8). Fuentes:

Facturas de proveedores leídas por OCR (PRD de facturas): cada ítem confirmado de una factura registra el costo de ese producto para ese proveedor, con la fecha del comprobante. Desde el MVP, aunque la comparación sea P1.

Carga manual por proveedor (MVP): en la ficha del producto, "Costos por proveedor" → [Agregar costo] (proveedor, presentación, costo, fecha).

(P2) Listas de precios importadas del proveedor (F7.7 del PRD principal).

GP11.2 Identidad del producto entre proveedores: por código de barras (unidad o caja, product_codes, F2.5) o código interno. Si una línea de factura no trae código, el dueño la asocia una vez al producto y el sistema guarda el código del proveedor para las próximas (product_suppliers.codigo_proveedor).

GP11.3 Unidad de comparación normalizada: siempre costo por unidad. Si el proveedor factura por caja o pack, costo por unidad = costo de la presentación / unidades por presentación (por ejemplo, caja de 24 a $24.000 → $1.000 por unidad). Se compara en la misma base fiscal: el costo final para el comercio (para monotributistas, con IVA incluido, porque no lo computan como crédito fiscal) y neto de las bonificaciones de la línea.

GP11.4 Comparación (determinística): para cada producto, el último costo vigente de cada proveedor, con su fecha y una marca de frescura: si tiene más de 60 días (configurable en GP7.11) es "desactualizado". El proveedor actual es el proveedor principal (F6.2) o, si no hay, el de la última compra. Los costos desactualizados se muestran con su marca pero no entran en los avisos proactivos.

GP11.5 Ahorro y las dos opciones (fórmulas en 6.8):

Ahorro por unidad = costo actual − costo alternativo; ahorro % = ahorro por unidad / costo actual.

Ahorro por mes = ahorro por unidad × venta mensual estimada, con la venta promedio diaria del PRD de rotación (RT2.6, ventana de 28 días) × 30. Con "pocos datos" (RT2.9) se muestra solo el ahorro por unidad.

Opción A, vender más barato con el mismo margen: precio nuevo = costo alternativo × (1 + markup actual), redondeado (GP7.2). Mantener el markup es lo mismo que mantener el margen, porque margen = markup / (1 + markup). Se muestra el precio nuevo y la ganancia por unidad y por mes.

Opción B, mantener el precio y ganar más margen: se muestran el markup y el margen nuevos y la ganancia extra por mes (= ahorro por mes).

Las dos opciones se muestran siempre juntas, con sus números; si GP6 está activo, también el precio recomendado con el costo del proveedor más barato (GP6.14).

GP11.6 Bot (número central):

Consejo proactivo en el resumen del viernes (B9 del PRD del bot), sin plantillas pagas extra: una línea dentro del mismo resumen ("Podés ahorrar ~$18.400 por mes comprándole a otros proveedores 5 productos") con el botón [Ver ahorro]. Al tocarlo se abre la ventana de atención y el detalle va como respuesta de servicio: los N productos (por defecto 5) en los que otro proveedor es más barato por más del umbral (por defecto 5%), ordenados por ahorro por mes, con el impacto mensual total. El email del resumen trae la lista completa. Sumar la línea y el botón requiere volver a aprobar la plantilla de B9 [a verificar]; si no se aprueba, el consejo va solo en el email y en la web, nunca en una plantilla aparte.

Consulta a pedido: "¿quién me vende más barata la Coca?" → herramientas determinísticas (reglas de intención + búsqueda difusa de productos, 6.10 del PRD principal); si hay varias "Coca", el bot pide elegir. La IA solo interpreta el mensaje cuando las reglas no alcanzan; nunca calcula.

Botón [Armar el próximo pedido con Mayorista Y]: pasa el producto al borrador del próximo pedido de reposición de ese proveedor (B7 del PRD del bot, F5 del PRD principal) y lo saca del borrador del proveedor actual solo para ese pedido. El pedido sigue el flujo normal de confirmación. Cambiar el proveedor principal es otro toque explícito ("¿Hacer a Mayorista Y el proveedor principal de este producto?") y queda en la auditoría.

GP11.7 Vista web (y celular): "Precios → Asesor de costos por proveedor": por producto, cada proveedor con costo por unidad, fecha, frescura, diferencia, ahorro por mes y las dos opciones; filtros por proveedor, categoría y "solo con ahorro mayor al umbral"; total de ahorro mensual posible; exportación CSV. Solo Dueño (costos, AU4.3).

GP11.8 Advertencias visibles (siempre en la vista y en el detalle del bot):

En v1 no se comparan las condiciones de pago, el pedido mínimo, la entrega (días, flete) ni la calidad: "Comparamos solo el costo por unidad. Revisá condiciones de pago, pedido mínimo y entrega".

Si el proveedor tiene cargadas sus condiciones de pago y su pedido mínimo (F6.1), se muestran al lado ("Mayorista Y: contado · pedido mínimo $150.000").

Solo con los datos del propio comercio: las comparaciones usan únicamente las facturas y costos de este comercio; nunca datos de otros comercios (una base por cliente, GP10). No hay "precios de referencia del mercado".

GP11.9 Referencias cruzadas propuestas (esos documentos no se modificaron):

GP11.10 Prioridad: P1, porque necesita historial de costos por proveedor; en el MVP solo se juntan los datos (GP11.1). La comparación, el consejo del viernes, la consulta al bot, el botón de pedido y la vista web son P1; las listas importadas, P2.

### Criterios de aceptación:

☐ (MVP) Confirmo una factura de Mayorista Y con Coca-Cola 500 ml a $940 por unidad y queda un registro en product_supplier_costs para ese producto y proveedor con la fecha de la factura, aunque la comparación todavía no esté activa.

☐ (MVP) Cargo a mano un costo de Bebidas Sur para la Coca-Cola y queda en el historial por proveedor, en la auditoría.

☐ Una factura por caja de 24 a $24.000 se compara como $1.000 por unidad.

☐ Una línea sin código que asocio una vez a un producto se reconoce sola en la próxima factura del mismo proveedor.

☐ Con los datos del ejemplo de 6.8, la vista muestra ahorro $60 por unidad (6%) y $5.760 por mes, la opción A a $1.320 y la opción B con markup 48,94%, margen 32,86% y +$5.760 por mes.

☐ Un costo de hace 81 días aparece como "desactualizado" y no entra en el consejo del viernes.

☐ Con umbral 5%, un proveedor 4% más barato no aparece en el consejo; uno 6% más barato, sí.

☐ El resumen del viernes incluye la línea de ahorro con los N productos de mayor ahorro mensual sin mandar ninguna plantilla adicional.

☐ Pregunto al bot "¿quién me vende más barata la Coca?" y recibo los proveedores con costo por unidad, fecha y frescura, y las condiciones de pago si están cargadas.

☐ Toco [Armar el próximo pedido con Mayorista Y] y el producto pasa al borrador de ese proveedor; el proveedor principal no cambia salvo que lo confirme aparte.

☐ Ningún precio, costo, proveedor principal ni pedido cambia sin un toque del dueño.

☐ La vista y el bot muestran la advertencia de que no se comparan condiciones de pago, pedido mínimo, entrega ni calidad.

☐ Las comparaciones nunca usan datos de otro comercio (no hay forma técnica: una base por cliente).

☐ Un Empleado no ve el asesor ni puede consultarlo al bot.

## 5. Flujos

### Flujo 1: aumento general de 8% programado para el lunes

Viernes 9/10, 19:30. Mauricio (Dueño) abre "Precios" en el celular → "Ajustar precios".

Elige Aumentar, escribe 8, alcance Todos los productos.

Vista previa: 412 productos; Coca-Cola 500 ml $1.400 → $1.520; Alfajor $850 → $920; Galletitas $2.990 → $3.230 (redondeo hacia arriba a $10). Excluidos: 18 cigarrillos (marcados "Excluir de ajustes masivos") y 3 sin precio. Avisos: 2 productos quedarían debajo del markup mínimo activo. Ningún producto supera el tope (30%) ni el umbral de revisión (20%).

Vigencia: Programar → "Lunes 00:00" (12/10/2026, 00:00 hora Argentina).

Confirma: "Aumento 8% · 412 productos · rige el lunes 12/10 a las 00:00 · redondeo hacia arriba a $10". Se reautentica con Google si su ventana de AU10 venció.

El ajuste queda Programado; los precios futuros bajan a los celulares en la próxima sincronización.

Domingo 20:00 (opcional): el bot recuerda "Mañana a las 00:00 rige el aumento de 8% en 412 productos" [Ver] [Cancelar ajuste].

Lunes 00:00: rigen los precios nuevos. El job marca el ajuste Aplicado (actor "Sistema") y la app muestra el aviso. La auditoría tiene la creación y la aplicación.

### Flujo 2: aumento por categoría

Llega la lista nueva de golosinas. Mauricio entra en "Ajustar precios" → Aumentar 12% → alcance Por categoría → elige "Golosinas" y "Galletitas" (96 productos).

En la vista previa cambia el redondeo a $50 solo para este ajuste (el valor por defecto del comercio no cambia).

4 productos ya tienen el ajuste del lunes programado: la app ofrece excluirlos o cancelar el anterior y crear este; Mauricio los excluye.

1 producto ($200 → $250 con redondeo, +25%) supera el umbral de revisión: aparece la revisión reforzada, Mauricio lo destilda y confirma el resto con vigencia Ahora.

Los precios cambian al instante; los otros celulares conectados los ven en menos de 2 minutos.

### Flujo 3: fijar un markup y cambio de costo

Mauricio abre la ficha "Yerba 1 kg": costo $3.000, precio $4.100 (markup 36,67%, margen 26,83%).

Pasa el producto a modo Por markup con 40%: el precio derivado es $4.200; confirma (vigencia ahora).

Una semana después carga el costo nuevo: $3.300 (edición manual; en P1, desde la factura del proveedor).

La app ofrece: "Recalcular con tu markup de 40%: $4.200 → $4.620" (redondeo a $10). El aumento (10%) no supera el tope ni el umbral.

Mauricio elige vigencia Ahora y confirma. El historial muestra el costo nuevo y el precio con origen "recálculo por markup".

Si no hubiera confirmado, el producto quedaría marcado "Costo actualizado, precio sin recalcular".

### Flujo 4: recomendación mensual del bot y override manual

1/11, 09:00. El job calcula octubre: V = $10.000.000, CMV = $7.000.000, CF = $900.000 (datos de ejemplo).

El bot (y el email, si la notificación está activada) avisa: "Para cubrir tus gastos fijos necesitás cargarle al menos 12,86% a tus costos (tu promedio fue 42,86%). Hay 37 productos por debajo." [Ver detalle] [Usar como mínimo] [Poner mi valor].

Mauricio toca [Poner mi valor] y escribe 25 (quiere un colchón para sueldos y ganancia). El mínimo activo queda en 25% con fuente Manual; la auditoría registra el cambio.

1/12: la recomendación de noviembre es 14%. El bot dice "Tu mínimo manual de 25% sigue activo; la recomendación de noviembre es 14%" [Seguir con 25%] [Usar 14%].

En la web o el celular, "Recomendación de markup" muestra el historial mensual: recomendado, manual y activo.

Con sueldos y retiro (decisión 9/10/2026; datos de ejemplo): el mismo mensaje de octubre suma los Sueldos y adelantos de la caja ($800.000) a CF ($1.700.000) y muestra "24,29% sin tu retiro · 40,00% con tu retiro promedio de $1.100.000". Mauricio toca [Cambiar mi retiro] y carga "quiero llevarme $1.500.000 por mes": la recomendación con retiro pasa a 45,72% y el bot aclara que con su markup realizado (42,86%) no llega a ese objetivo. Como su mínimo manual de 25% sigue activo, el bot le recuerda que ese valor manual manda y le ofrece [Usar 45,72%] [Seguir con 25%].

### Flujo 5: configuración de precios y alertas

Mauricio toca el engranaje "Configuración de precios y alertas" en "Precios" (desde el celular).

Redondeo: $10 hacia arriba. Topes por defecto: 30% y vacío en $. Umbral de revisión: lo baja de 20% a 15%.

En "Topes por producto" busca "Fernet 750" y le carga tope $1.500.

En "Stock bajo" cambia el valor por defecto de 0 a 5 y le deja al Chocolate Águila su override de 3 (la regla de alertas es la de F4 del PRD principal).

Guarda: cada cambio queda en la auditoría y rige desde ese momento; los ajustes programados existentes no cambian. El panel de alertas suma los productos sin override con stock ≤ 5.

### Flujo 6: venta con un celular offline durante la vigencia

El celular de Ana (Empleada) sincronizó el viernes 9/10 a las 21:00: ya tiene el +8% programado para el lunes 00:00.

Domingo 22:00 se corta internet. Ana vende una Coca-Cola el domingo 23:50: el celular cobra $1.400 (vigente a su hora).

Lunes 00:10 vende otra: el celular, con su hora local, ya aplica el registro nuevo y cobra $1.520.

El celular de Juan, en cambio, estuvo offline desde el viernes 18:00 (antes de que se creara el ajuste) y el lunes 08:30 vende una Coca-Cola a $1.400.

Lunes 10:00 vuelve la conexión. El servidor valida las horas (OF8.4): las dos ventas de Ana coinciden con el precio de referencia; la de Juan no (referencia $1.520).

Ningún ticket se modifica. La venta de Juan queda "vendida con precio desactualizado" (−$120) en "Diferencias offline"; la ganancia se calcula con el costo vigente a las 08:30. Los dos celulares bajan los precios vigentes.

### Flujo 7: consejo del viernes sobre proveedores y pedido con el proveedor recomendado (GP11, P1)

Viernes 18:00. El resumen semanal (B9) incluye, en el mismo mensaje: "Podés ahorrar ~$18.400 por mes comprándole a otros proveedores 5 productos" [Ver ahorro] (datos de ejemplo).

Mauricio toca [Ver ahorro]. El bot responde (mensaje de servicio, sin plantilla extra): "Coca-Cola 500 ml: Distribuidora X $1.000/u (2/10) · Mayorista Y $940/u (25/9) → ahorrás $60/u, ~$5.760/mes. A) Bajala a $1.320 con el mismo margen. B) Dejala en $1.400 y ganás 32,86% de margen (+$5.760/mes). Bebidas Sur $900/u es de hace 81 días (desactualizado). Mayorista Y: contado · pedido mínimo $150.000. No comparamos condiciones de pago, pedido mínimo, entrega ni calidad." [Armar el próximo pedido con Mayorista Y] [Ver todos] [No, gracias].

Toca [Armar el próximo pedido con Mayorista Y]: la Coca-Cola pasa del borrador de Distribuidora X al de Mayorista Y para el pedido del lunes. El bot pregunta "¿Hacemos a Mayorista Y el proveedor principal de este producto?" [Sí] [Solo esta vez]; Mauricio elige [Solo esta vez].

El lunes confirma el pedido como siempre (B9.4). Ningún precio cambió: si quiere la opción A, la aplica desde la ficha o como ajuste.

### Flujo 8: consulta a pedido "¿quién me vende más barata la Coca?" (GP11, P1)

Mauricio escribe al bot: "¿quién me vende más barata la Coca?".

Las reglas detectan la intención y la búsqueda encuentra 3 productos "Coca"; el bot pregunta cuál [Coca-Cola 500 ml] [Coca-Cola 1,5 L] [Coca-Cola Zero 500 ml].

Elige 500 ml y recibe la lista de proveedores con costo por unidad, fecha, frescura, ahorro por mes y las dos opciones, más las advertencias.

Si un empleado hace la misma pregunta, el bot responde "No tenés permiso para ver costos".

### Flujo 9: el bot propone precios nuevos por producto y el dueño acepta algunos (GP6)

1/11, 09:00, junto con la recomendación mensual: "Hay 23 productos por debajo del precio recomendado (con tu retiro). Ejemplo: Coca-Cola 500 ml $1.400 → $1.640 (sin retiro, $1.460)" [Ver precios sugeridos] [Aceptar todos] [Ninguno] (datos de ejemplo de GP6.14).

Mauricio toca [Ver precios sugeridos] y se abre la lista en el celular: cada producto con precio actual, recomendado con y sin retiro, desglose (costo, costos fijos, Ingresos Brutos, comisiones, ganancia deseada) y casilla.

Destilda 5 productos que prefiere dejar como están (marca 2 como "No recomendar precio") y toca [Aceptar seleccionados].

Se abre la vista previa del ajuste de tipo "recomendación" (18 productos) con topes y umbral de revisión: uno supera el 20% y pide revisión reforzada; Mauricio lo confirma tipeando el porcentaje. Elige vigencia "Lunes 00:00".

El ajuste queda programado y en la auditoría. Si hubiera tocado [Ninguno], no cambia nada y las sugerencias vuelven el mes siguiente; si hubiera tocado [Aceptar todos] en el chat, el bot le habría pedido [Confirmar] y lo habría mandado a la app por el producto que supera el umbral.

### Flujo 10: promoción 2×1 con aviso contra el costo (RT12 + GP9.12)

Mauricio marca el Alfajor como dormido para promoción (RT9) y crea un 2×1 desde la funcionalidad de promociones (RT12) (datos de ejemplo: precio $950, costo $600).

La app calcula el precio efectivo ($475 por unidad) y avisa: "Con este 2×1 vendés por debajo del costo: perdés $125 por unidad ($250 por promoción)". Mauricio lo cambia por "2 alfajores a $1.500" (efectivo $750, markup 25%, sobre el costo); con un mínimo activo de 40% (datos de ejemplo) ve el aviso en ámbar y confirma igual.

En la venta, Ana escanea dos alfajores: se aplica la promoción y el botón de descuento de esa línea queda deshabilitado ("Este producto ya está en promoción").

El ticket muestra el precio de lista, la promoción y lo cobrado; la ganancia de la línea es $1.500 − 2 × $600 = $300; el markup de lista del alfajor sigue igual.

## 6. Notas técnicas

### 6.1 Principios

Mismo stack del PRD principal: PWA mobile-first en Astro + TypeScript, validación con Zod compartida entre cliente y servidor, PostgreSQL con una base por cliente (6.4 del PRD principal, igual que ModoOps) y SQLite local en el celular para offline (PRD de offline).

Nada se sobrescribe: precios, costos, ajustes, eventos y recomendaciones son append-only; los estados se derivan de eventos.

Dinero en centavos enteros (bigint) y porcentajes en puntos básicos enteros (1 pb = 0,01%; 8% = 800 pb), sin float en ningún cálculo.

El precio vigente se deriva del tiempo, no de un job: la regla de GP3.2 es la fuente de verdad; las columnas cacheadas son derivadas y reconstruibles.

### 6.2 Modelo de datos (base del comercio)

Inmutabilidad: las tablas append-only tienen REVOKE UPDATE, DELETE para el rol de la aplicación y un trigger que rechaza UPDATE/DELETE (mismo patrón que 6.11 del PRD principal); entran en la cadena de hashes cuando esté activa (P1).

Registros de un ajuste cancelado: se excluyen en la vista de vigencias uniendo con el estado derivado del ajuste; nunca se borran.

### 6.3 Cálculo y redondeo

Precio sin redondear (escala 10.000): raw = precio_centavos × (10.000 ± porcentaje_pb), en bigint.

Redondeo a un paso S (en centavos), con d = 10.000 × S y división entera:

hacia arriba: ((raw + d − 1) / d) × S;

al más cercano: ((raw + d / 2) / d) × S (mitades hacia arriba);

hacia abajo: (raw / d) × S.

Tope: precio máximo = mínimo entre (precio_anterior + tope_centavos) y (precio_anterior × (10.000 + tope_pct_pb) / 10.000), considerando solo los topes que existen; "Limitar al tope" redondea hacia abajo al paso para no pasarlo. Si el redondeo hacia abajo deja el precio igual al anterior, el producto se marca "sin cambio por tope".

Markup y margen: se guardan en puntos básicos: markup_pb = (precio − costo) × 10.000 / costo; margen_pb = (precio − costo) × 10.000 / precio; se muestran con 2 decimales. Precio por markup = costo × (10.000 + markup_pb) / 10.000, redondeado como arriba.

Markup mínimo: markup_minimo_pb = ceil(CF × 10.000 / CMV); margen mínimo = CF × 10.000 / (CMV + CF). Tests de propiedad: CF / CMV = (CF / V) / (1 − g) para cualquier V > CMV > 0.

Markup mínimo con retiro (decisión 9/10/2026): markup_con_retiro_pb = ceil((CF + R) × 10.000 / CMV); sin retiro, la fórmula anterior. CF incluye Sueldos y adelantos; R = objetivo del dueño o promedio de retiros registrados de los últimos 3 meses cerrados.

Precio recomendado por producto (GP6.13): con s_pb = t_pb + w_pb + g_pb (debe ser < 6.000) y paso S: precio = ceil(c × (10.000 + k_pb) / ((10.000 − s_pb) × S)) × S en división entera (hacia arriba, (num + den − 1) / den). w_pb = Σ (importe_medio × comision_medio_pb) / Σ importe_medio sobre los ingresos por venta de la caja del período, redondeado al pb.

La misma librería de cálculo (TypeScript puro, sin dependencias) corre en el servidor y en el celular offline, con los mismos casos de test.

### 6.4 Resolución del precio vigente

Servidor: SELECT … FROM price_history_vigencias WHERE product_id = $1 AND valid_from <= $t ORDER BY valid_from DESC, id DESC LIMIT 1, dentro de la transacción de la venta.

Celular: el catálogo SQLite local guarda los registros de precio vigentes y los futuros no cancelados (price_history_local), sincronizados por el pull (OF3.3, change_log); la venta aplica la misma consulta con la hora local.

Sincronización de ventas offline: el servidor calcula precio_referencia con la hora validada (OF8.4), compara con el cobrado, marca la diferencia y nunca cambia el importe; procesa cada operación una sola vez por op_id (sync_receipts).

### 6.5 Jobs

Aplicación de ajustes programados: cada minuto, por comercio, toma los ajustes con valid_from <= now() sin evento aplicado ni cancelado (FOR UPDATE SKIP LOCKED), inserta el evento aplicado (único por ajuste: un reintento no duplica), actualiza la caché precio_vigente_centavos, emite el cambio al change_log y encola la notificación. Si el job se atrasa, las ventas igual usan el precio correcto (6.1).

Cancelación vs. aplicación: la cancelación toma el mismo lock del ajuste y verifica valid_from > now() + 1 minuto; si no se cumple, se rechaza con "Ya está por regir: revertilo después".

Recomendación mensual: día 1 a las 09:00 hora del comercio; recorre los comercios desde la base de control, calcula sobre el mes cerrado (ventas por jornada, incluidas las offline ya sincronizadas) e inserta la recomendación; única por (periodo, origen = job). Las ventas offline que lleguen después no cambian la recomendación emitida; el dueño puede tocar "Recalcular" (registro nuevo).

Recordatorio de ajuste programado (opcional): la víspera a las 20:00.

Verificación de cachés: job nocturno que compara precio_vigente_centavos y costo_vigente_centavos con los historiales y corrige la caché (nunca los historiales), con métrica de discrepancias en el Control Plane.

### 6.6 Idempotencia y concurrencia

Crear un ajuste lleva una idempotency_key generada en el cliente al abrir la vista previa; el servidor devuelve el mismo ajuste ante reintentos (doble toque, reintentos del bot, red inestable).

La creación bloquea las filas product_pricing del alcance (FOR UPDATE) y valida que no haya otro ajuste programado pendiente para esos productos (GP3.5).

La vista previa guarda un hash del estado de precios usado; si al confirmar cambió algún precio del alcance, se pide revisar la vista previa de nuevo.

Los eventos de jobs y del bot usan claves únicas por (ajuste, evento) y por (periodo, origen).

### 6.6 bis Datos de la recomendación ampliada (GP6, decisiones 9/10/2026)

pricing_settings suma: retiro_objetivo_mensual_centavos (nullable), condicion_fiscal (monotributo / responsable_inscripto), iibb_pb (nullable = 0), comisiones_medio_pago (JSON: medio → pb; vacío = 0), periodo_mezcla_cobros (1 / 3 meses), ganancia_deseada_pb (nullable = 0); categorias_costo_fijo incluye "Sueldos y adelantos" por defecto. Cambios en audit_log.

markup_recommendations suma: sueldos_centavos, retiro_mensual_centavos, retiro_fuente (objetivo / promedio_registrado / ninguno), retiro_meses_promedio, markup_minimo_sin_retiro_pb, markup_minimo_con_retiro_pb (markup_minimo_pb pasa a ser el con retiro), compras_negocio_centavos.

product_price_recommendations (append-only): id, recommendation_id (nullable), product_id, costo_centavos, costo_fuente (cost_history / proveedor_mas_barato), k_pb, k_fuente (manual / recomendado), iibb_pb, comisiones_ponderadas_pb, mezcla_cobros (JSON), ganancia_deseada_pb, precio_sin_redondeo_centavos, precio_recomendado_centavos, precio_recomendado_sin_retiro_centavos, precio_actual_centavos, estado (sugerida / aceptada / no_aceptada / excluida), adjustment_id (nullable), calculado_at.

Promociones (RT12, interacción GP9.12): la línea de venta suma promotion_id (nullable), promocion_centavos y promocion_asignada_centavos (en combos, la parte prorrateada por mayor resto); pricing_settings suma permitir_acumular_descuento_promo (bool, por defecto false) y aviso_promo_bajo_minimo (bool, por defecto true). La validación contra el costo vive en una función de dominio compartida con la venta y con el alta de promociones; las tablas de promociones las define el PRD de rotación.

price_adjustments.tipo suma el valor recomendacion; product_pricing suma no_recomendar_precio (bool) y, en P1, ganancia_deseada_pb por producto.

### 6.7 Rendimiento y seguridad

Vista previa de hasta 5.000 productos en menos de 2 segundos (cálculo en el servidor, paginado al cliente).

Permisos en el backend en cada request (AU4.2); campos financieros filtrados en el servidor (AU4.3); reautenticación para ajustes masivos (AU10).

Zona horaria del comercio para mostrar y elegir vigencias; todo se guarda en timestamptz.

### 6.8 Asesor de costos por proveedor (GP11)

### Modelo de datos (base del comercio):

### Fórmulas (centavos y pb enteros):

Costo unitario normalizado: cu = (costo_presentacion − bonificacion) / unidades_por_presentacion (redondeo al centavo, mitad hacia arriba).

Último costo vigente por proveedor: el registro con mayor valid_from por (producto, proveedor). Frescura: desactualizado si hoy − valid_from > antiguedad_dias (por defecto 60).

ahorro_u = cu_actual − cu_alt; ahorro_pb = ahorro_u × 10.000 / cu_actual; aviso si ahorro_pb > umbral_pb (por defecto 500 = 5%) y ambos costos son frescos.

venta_mensual = venta_promedio_diaria (RT2.6) × 30; ahorro_mensual = ahorro_u × venta_mensual.

Opción A: precio_A = redondeo(cu_alt × (10.000 + markup_actual_pb) / 10.000) con markup_actual_pb = (P − cu_actual) × 10.000 / cu_actual. Opción B: markup_B_pb = (P − cu_alt) × 10.000 / cu_alt, margen_B_pb = (P − cu_alt) × 10.000 / P, ganancia extra mensual = ahorro_mensual.

Ranking del viernes: productos que cumplen el umbral, ordenados por ahorro_mensual descendente; se toman los N primeros (por defecto 5); impacto = Σ ahorro_mensual de esos N.

Ejemplo resuelto (datos de ejemplo, al 9/10/2026): Coca-Cola 500 ml, precio $1.400, venta promedio diaria 3,2 u.

Bebidas Sur no entra en el aviso (desactualizado), aunque se muestra.

Ahorro con Mayorista Y: $1.000 − $940 = $60 por unidad (6% > umbral de 5%). Venta mensual = 3,2 × 30 = 96 u. Ahorro por mes = $60 × 96 = $5.760.

Hoy: markup 40%, margen 28,57%, ganancia $400 por unidad, $38.400 por mes.

Opción A (mismo margen): 940 × 1,40 = $1.316 → $1.320 (redondeo hacia arriba a $10); markup 40,43%, margen 28,79%; ganancia $380 por unidad, $36.480 por mes con el mismo volumen (cobra menos al cliente; podría vender más).

Opción B (mismo precio): $1.400 con costo $940 → ganancia $460 por unidad; markup 460 / 940 = 48,94%; margen 460 / 1.400 = 32,86%; $44.160 por mes (+$5.760).

Con GP6 activo: precio recomendado con el costo de Mayorista Y = $1.540 (GP6.14).

### Bot y jobs:

El ranking del viernes lo calcula el mismo job que arma el resumen B9, en la base del comercio, justo antes del envío; guarda supplier_cost_advice y pasa el total como variable de la plantilla (sin mensaje extra).

La consulta a pedido es una herramienta del bot (comparar_proveedores(product_id)) que lee solo la base del comercio vinculado al número (B1); la IA, si interviene, solo traduce el mensaje a la llamada de la herramienta.

[Armar el próximo pedido con…] usa las funciones de dominio de pedidos (F5/B7) con idempotency_key por (aviso, producto): un doble toque no duplica la línea.

Aislamiento: no existe ninguna consulta entre bases de comercios; la base de control solo guarda contadores (avisos enviados, pedidos armados), sin costos ni proveedores.

## 7. Riesgos y preguntas abiertas

### 7.1 Riesgos

### 7.2 Decisiones y preguntas abiertas

#### Decisiones tomadas (9/10/2026)

Decisión tomada (9/10/2026): modo offline de venta, stock y caja en v1. El PRD de offline (https://docs.google.com/document/d/1NvVipeJhXBgH5oae8D2SWzpqzBLybEaQ5Tc77G03Vw4/edit) proponía adelantar al MVP (v1) la venta, el stock y la caja offline, mientras el PRD principal tenía el offline completo en una etapa posterior (P1, 6.2 y Fase 2). El dueño decidió que la venta, el stock y la caja offline entran en v1; el PRD principal se está alineando. Este PRD asume offline en v1: precios futuros precargados en el celular, precio de referencia por hora validada, diferencias marcadas sin tocar tickets (GP4, Flujo 6). Los cambios de precio y la configuración siguen siendo solo online (OF9.5).

Decisión tomada (9/10/2026): historial de costos en v1. Antes era la pregunta abierta "Historial de costos: el PRD principal lo tiene en P1 (F7.7); este PRD lo necesita en el MVP (GP5.6) para las ventas offline y el CMV. ¿Se adopta en el PRD principal?". El dueño confirmó que cost_history (GP5.6) entra en v1 (MVP); el F7.7 del PRD principal se está alineando. El plan por fases lo muestra en la Fase 1.

Decisión tomada (9/10/2026): costos fijos y retiro del dueño. Antes era la pregunta abierta "Costos fijos: ¿se incluyen sueldos, cargas sociales y el retiro del dueño en la recomendación por defecto?". El dueño decidió: la recomendación de GP6 incluye los Sueldos (egresos "Sueldos y adelantos" pagados desde la caja) como costo fijo; el retiro del dueño (categoría propia de la caja) también cuenta, modelado como dato aparte (promedio mensual de los retiros registrados u objetivo "cuánto quiero llevarme por mes"), y la recomendación se muestra con y sin retiro. Los retiros de efectivo "compra para el negocio" cuentan como gasto en su categoría. Ver GP6.2, GP6.2 bis, GP6.3, GP6.4 y GP7.10.

Decisión tomada (9/10/2026): promociones y combos en v1. Se quitaron de los no-objetivos (1.4 y 2.2) "promociones complejas (2x1, combos)" y "promociones (2x1, combos, happy hour)". Las promociones y combos están en v1 y los define RT12 del PRD de rotación; este PRD define solo la interacción con precios (GP9.12, GP7.12, Flujo 10).

#### Preguntas abiertas

Ajuste por proveedor: el PRD principal (F7.4, Flujo 6 y su criterio "+15% a Distribuidora X") lo tiene en el aumento masivo P0, sobre costo y/o precio; este PRD lo deja en P1 (GP2.4 y GP2.6). ¿Se adelanta al MVP o se ajusta F7.4 a "por categoría" en el PRD principal?

Historial de costos → resuelta, ver "Decisiones tomadas" #2.

IVA y cargas sociales (lo que quedó abierto de la antigua pregunta de costos fijos, resuelta en "Decisiones tomadas" #3): ¿cómo se trata el IVA para responsables inscriptos (¿CMV sin IVA?, ¿IVA en el precio recomendado?; fuera del MVP)? ¿Las cargas sociales se cargan en la caja como categoría propia o dentro de Sueldos?

Descuentos de empleados: ¿el máximo por empleado es un % fijo o por categoría? ¿Hace falta autorización remota del dueño por el bot (P1)?

Vigencia hasta (precio temporal): ¿se necesita en el MVP para promociones de fin de semana o alcanzan dos ajustes programados?

Redondeo y topes por categoría: ¿hacen falta en el MVP (por ejemplo, cigarrillos a $10 y almacén a $50)?

Recomendación mensual: ¿mes calendario o últimos 30 días móviles? ¿Se usa el volumen del mes o un promedio de 3 meses para suavizar la estacionalidad?

Notificaciones: ¿la recomendación mensual se suma como notificación clave en B2 (WhatsApp y email) o queda solo en la app con aviso del bot cuando el dueño escribe?

Retiro "compra para el negocio": el PRD de caja hoy tiene la categoría "Retiro del dueño" pero no un tipo de retiro "compra para el negocio". ¿Se agrega como tipo propio en la caja (referencia cruzada propuesta; ese documento no se modificó)?

Ingresos Brutos y comisiones: ¿se precargan alícuotas y comisiones de referencia por jurisdicción y proveedor de cobro, o se dejan siempre vacías para que las cargue el dueño (o su contador)?

Precio recomendado: ¿se sugieren también bajas para productos muy por encima del recomendado (hoy solo informativo)?

Asesor de proveedores (GP11): ¿se suma el pedido mínimo y el flete al costo comparado en una versión posterior? ¿60 días es la antigüedad correcta con la inflación actual?

Plantilla del viernes: ¿se reaprueba la plantilla B9 con la línea de ahorro y el botón [Ver ahorro], o el consejo va solo en el email?

Promociones (referencia cruzada): al redactar este cambio, RT12 todavía no aparece en el documento de rotación; cuando se publique, revisar que sus tipos de promoción y su vigencia coincidan con GP9.12.

## 8. Plan por fases

### Fase 0: validación y diseño (semanas 1 y 2)

Entrevistas con 5 a 10 kiosqueros: cómo remarcan, qué redondeo usan, cada cuánto, si programan para el lunes, cómo entienden markup y margen, qué topes les servirían.

Prototipo de la vista previa y de la pantalla "Configuración de precios y alertas" en el celular.

Diseño del modelo (price_history, price_adjustments, eventos, product_pricing, pricing_settings) y librería de cálculo compartida con tests de propiedad.

Validar con el PRD de offline el formato de precios futuros en el catálogo local.

### Fase 1: MVP (junto con el MVP del sistema, con offline v1)

GP1 ajuste general, GP2 por categoría, GP3 vigencia e historial (programar, cancelar, revertir), GP4 snapshot y ventas offline (v1), GP5 costo/precio/markup/margen con historial de costos (cost_history, en v1 por decisión del 9/10/2026; F7.7 del PRD principal en alineación) y recálculo ofrecido, GP7 configuración de precios y alertas, GP8 auditoría, GP9 integraciones P0, GP10.

GP6 recomendación de markup mínimo: incluida en el MVP; la primera recomendación de cada comercio llega después de su primer mes completo de ventas.

GP6 ampliada (decisiones 9/10/2026): sueldos en costos fijos, retiro del dueño con y sin, y precio recomendado por producto (Ingresos Brutos, comisiones ponderadas, ganancia deseada) con aceptar todos, algunos o ninguno; entradas en GP7.10.

GP11 (captura de datos): product_suppliers y product_supplier_costs alimentados por las facturas confirmadas y la carga manual por proveedor.

### Fase 2: post-MVP cercano (meses 2 y 3)

Ajuste por proveedor, por selección y desde la lista de baja rotación; ajuste sobre el costo.

Costo desde la factura del proveedor (FP8.11) con recálculo en lote.

Programar ajustes desde el bot; reporte de diferencias por dispositivo y empleado.

GP11 Asesor de costos por proveedor: comparación, consejo en el resumen del viernes, consulta al bot, botón de pedido con el proveedor recomendado y vista web.

Costo del proveedor más barato como alternativa en el precio recomendado (GP6.12); ganancia deseada por producto.

Markup objetivo con ganancia deseada; redondeo y topes por categoría; vigencia hasta (precios temporales); encadenar ajustes programados.

### Fase 3: futuro

Terminaciones psicológicas de precio, mínimo por categoría, sugerencias de precio por rotación, listas de precios múltiples.

Listas de precios importadas de proveedores para el asesor (GP11); IVA para responsables inscriptos en la recomendación; k por categoría.

## Anexo A: glosario

Documento | Referencia propuesta
--- | ---
PRD del bot | B9 resumen del viernes: línea de ahorro y botón [Ver ahorro] dentro de la misma plantilla; B7 armado del pedido: mover un producto al pedido del proveedor recomendado; B3 consultas: "¿quién me vende más barato…?" como herramienta determinística
PRD de facturas | Cada ítem confirmado de una factura (OCR como sugerencia + confirmación) alimenta product_supplier_costs desde el MVP; FP8.11 (actualización de costos, P1) sigue rigiendo el costo del producto (cost_history)
PRD de rotación | Venta promedio diaria (RT2.6) y "pocos datos" (RT2.9) para el ahorro por mes
PRD principal F6 (y F5) | F6.2 proveedores alternativos: se formalizan con product_suppliers; F6.1 condiciones de pago y pedido mínimo se muestran como advertencia; F5 pedido de reposición con el proveedor recomendado

Tabla | Campos principales
--- | ---
price_history (append-only) | id (bigint secuencial), product_id, precio_centavos, valid_from (timestamptz), adjustment_id (nullable), origen (alta_producto / edicion_manual / ajuste_masivo / ajuste_categoria / ajuste_proveedor (P1) / recalculo_markup / reversion / alta_offline), created_by (user_id o Sistema), created_at (timestamptz DEFAULT now()), idempotency_key. valid_to no se guarda en la fila: se deriva con lead(valid_from) sobre los registros no anulados (vista price_history_vigencias). Índice (product_id, valid_from DESC, id DESC).
cost_history (append-only) | id, product_id, costo_unitario_centavos, valid_from, origen (alta / edicion_manual / factura_proveedor (P1) / ajuste_costo (P1)), supplier_invoice_id (nullable), created_by, created_at, idempotency_key. Misma derivación de valid_to.
price_adjustments (append-only) | id, tipo (aumento / baja / recalculo_markup / reversion), porcentaje_pb, alcance (JSON validado: todos / categorias[] / proveedores[] (P1) / productos[] (P1)), redondeo_snapshot (paso_centavos, direccion), topes_snapshot, umbral_revision_pb_snapshot, revision_reforzada (bool), valid_from, revierte_adjustment_id (nullable), productos_afectados, productos_excluidos, created_by, created_at, idempotency_key (única).
price_adjustment_items (append-only) | adjustment_id, product_id, precio_anterior_centavos, precio_calculado_centavos (sin redondeo), precio_nuevo_centavos, resultado (aplicado / limitado_por_tope / excluido_manual / excluido_regla / excluido_programado_pendiente / bajo_costo_confirmado), price_history_id (nullable).
price_adjustment_events (append-only) | id, adjustment_id, evento (creado / aplicado / cancelado / revertido), actor (user_id o Sistema), motivo, created_at. Único (adjustment_id, evento). El estado del ajuste se deriva de sus eventos.
product_pricing (configuración de markup y topes por producto) | product_id (PK), modo_precio (manual / markup), markup_pb (nullable), excluir_ajuste_masivo (bool), tope_aumento_pct_pb (nullable = usa el por defecto), tope_aumento_centavos (nullable = usa el por defecto), sin_tope (bool), precio_vigente_centavos y costo_vigente_centavos (caché derivada), costo_actualizado_sin_recalcular (bool). Cambios registrados en audit_log en la misma transacción (trigger). El umbral de stock bajo por producto sigue en products según F4 del PRD principal; GP7 solo lo edita.
pricing_settings (una fila por comercio) | metrica_principal (markup / margen), redondeo_paso_centavos (100 / 1.000 / 5.000 / 10.000), redondeo_direccion (arriba / cercano / abajo), tope_aumento_pct_pb_default (nullable), tope_aumento_centavos_default (nullable), umbral_revision_pb (default 2.000), markup_minimo_manual_pb (nullable), markup_minimo_fuente (manual / recomendado / ninguno), categorias_costo_fijo (ids de cash_categories), aviso_descuento_bajo_minimo (bool). El umbral de stock bajo por defecto es el campo del comercio de F4.1; esta pantalla lo edita. Cambios en audit_log.
markup_recommendations (append-only) | id, periodo (año-mes), ventas_netas_centavos, cmv_centavos, costos_fijos_centavos, detalle_costos_fijos (JSON: categoría, monto, referencias a facturas y egresos), margen_bruto_real_pb, markup_realizado_pb, markup_minimo_pb, margen_minimo_pb, estado (completa / parcial / sin_datos), faltantes (JSON), version_formula, calculado_at, origen (job / recalcular_manual), notificado_at.
Línea de venta (ampliación de stock_movements tipo egreso_venta y de la línea del ticket) | precio_lista_centavos, price_history_id, descuento_centavos, precio_unitario_centavos (cobrado), costo_unitario_centavos, cost_history_id, fuente_precio (servidor / catalogo_local), precio_referencia_centavos (en offline), precio_desactualizado (bool), diferencia_centavos, bajo_costo (bool).
stock_anomalies (del PRD de offline) | Se reutiliza el tipo precio_desactualizado; se agrega venta_bajo_costo.

Tabla | Campos principales
--- | ---
product_suppliers | product_id, supplier_id, es_principal (bool; uno por producto), codigo_proveedor (nullable, código del ítem en las facturas de ese proveedor), presentacion_habitual, unidades_por_presentacion, activo, created_at. Formaliza los proveedores alternativos de F6.2. Cambios en audit_log.
product_supplier_costs (append-only; captura desde el MVP) | id, product_id, supplier_id, presentacion (unidad / caja / pack), unidades_por_presentacion, costo_presentacion_centavos, bonificacion_centavos, costo_unitario_centavos (normalizado), incluye_iva (bool), valid_from (fecha del comprobante o de la carga), origen (factura_ocr / manual / lista_importada (P2)), supplier_invoice_id y supplier_invoice_line_id (nullable), created_by, created_at, idempotency_key (por línea de factura: un reintento no duplica). Índice (product_id, supplier_id, valid_from DESC, id DESC). Mismo patrón de inmutabilidad que 6.2.
supplier_cost_advice (append-only, P1) | id, generado_at, product_id, proveedor_actual_id, costo_actual_centavos, costo_actual_fecha, proveedor_alt_id, costo_alt_centavos, costo_alt_fecha, ahorro_unitario_centavos, ahorro_pb, venta_promedio_diaria (decimal fijo ×10), ahorro_mensual_centavos, opcion_a_precio_centavos, opcion_b_markup_pb, opcion_b_margen_pb, incluido_en_resumen (fecha del viernes, nullable), accion (ninguna / pedido_armado / proveedor_principal_cambiado), order_id (nullable).

Proveedor | Presentación y costo | Costo por unidad | Fecha | Frescura
--- | --- | --- | --- | ---
Distribuidora X (principal) | Caja de 24 a $24.000 | $1.000 | 2/10/2026 | Vigente
Mayorista Y | Unidad a $940 | $940 | 25/9/2026 | Vigente (14 días)
Bebidas Sur | Pack de 24 a $21.600 | $900 | 20/7/2026 | Desactualizado (81 días)

Riesgo | Impacto | Probabilidad | Mitigación
--- | --- | --- | ---
Error de tipeo en un ajuste masivo (80% en lugar de 8%) | Alto | Media | Vista previa obligatoria, umbral de revisión con porcentaje tipeado, topes configurables, reversión con un toque
Celulares offline cobran precios viejos | Medio | Media | Precios futuros precargados, aviso de antigüedad, reporte de diferencias
Relojes de celulares mal configurados | Medio | Alta | Hora validada (OF8.4), marca "reloj desfasado", referencia con la hora de recepción
El dueño confunde markup y margen | Medio | Alta | Fórmulas y aclaración en la app, los dos valores siempre visibles
Recomendación engañosa por datos incompletos (sin costos de productos o sin alquiler cargado) | Alto | Media | Estado "parcial" con faltantes, no se calcula con CMV = 0, explicación de qué incluye
El empleado infiere costos a partir de los avisos de descuento | Bajo | Media | Mensaje genérico sin montos; descuento máximo definido por el dueño
Ajustes programados superpuestos | Medio | Baja | Un solo programado pendiente por producto en el MVP
Costo de plantillas de WhatsApp por avisos de precios | Bajo | Media | Solo la recomendación mensual va por defecto; avisos de ajuste en la app
Recomendación de precio demasiado alta por configuración errónea (Ingresos Brutos, comisiones o ganancia deseada) | Alto | Media | Validación < 60%, desglose visible, valores vacíos = 0, nada cambia sin un toque, topes y umbral de revisión
Retiro del dueño mal estimado (meses atípicos) | Medio | Media | Promedio de 3 meses, objetivo editable, recomendación con y sin retiro siempre visibles
Asesor de proveedores: costos viejos o no comparables (IVA, bonificaciones, presentación) | Medio | Media | Normalización por unidad y base fiscal, marca "desactualizado" a 60 días, advertencias de lo que no se compara
El consejo del viernes requiere reaprobar la plantilla B9 | Bajo | Media | Si no se aprueba, el consejo va solo por email y web; nunca una plantilla extra

Término | Definición
--- | ---
Ajuste masivo | Cambio de precio por porcentaje sobre todos los productos o un alcance (categorías, proveedores)
Vigencia (valid_from / valid_to) | Desde y hasta cuándo rige un precio; valid_to se deriva del registro siguiente
Ajuste programado | Ajuste con vigencia futura; se puede cancelar hasta 1 minuto antes
Reversión | Ajuste nuevo que vuelve los precios de un ajuste aplicado a los anteriores
Snapshot de precio | Precio de lista, descuento, precio cobrado y costo guardados en la línea de venta
Precio de referencia | Precio que correspondía a una venta offline según su hora validada
Markup | Ganancia sobre el costo: (precio − costo) / costo
Margen | Ganancia sobre el precio de venta: (precio − costo) / precio
CMV | Costo de la mercadería vendida en el período
Costos fijos | Gastos del mes que no dependen de lo vendido: luz, gas, tasas municipales, ARCA, alquiler, servicios y, por decisión del 9/10/2026, sueldos
Markup mínimo | CF / CMV: markup sobre el costo que cubre los costos fijos con el volumen del mes
Mínimo activo | El markup mínimo en uso: manual (manda siempre) o recomendado
Tope de aumento | Máximo aumento por cambio, en $ y/o %, por defecto y por producto; vacío = sin tope
Umbral de revisión | % a partir del cual un aumento pide confirmación reforzada (por defecto 20%)
Punto básico (pb) | 0,01%; los porcentajes se guardan como enteros en pb
Retiro del dueño (R) | Lo que el dueño se lleva por mes; dato aparte de los costos fijos (promedio registrado u objetivo)
Compra para el negocio | Retiro de efectivo del cajón para un gasto del negocio; cuenta en la categoría del gasto, no como retiro
Precio recomendado | c × (1 + k) / (1 − (t + w + g)), redondeado; sugerencia, nunca se aplica sola
Comisión ponderada (w) | Promedio de las comisiones de cobro según la mezcla real de medios de pago
Ganancia deseada (g) | % del precio que el dueño quiere que quede como ganancia
Asesor de costos por proveedor | Comparación de costos por unidad entre proveedores del mismo producto, con ahorro y dos opciones
Costo desactualizado | Costo de un proveedor con más de 60 días (configurable)
Promoción / combo | Precio especial con vigencia (RT12 del PRD de rotación); no cambia el precio de lista ni se acumula con descuentos manuales por defecto
