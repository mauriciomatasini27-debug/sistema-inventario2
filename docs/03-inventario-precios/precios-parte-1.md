> Origen: `PRD - Gestión de Precios para Sistema de Inventario (Parte 1).docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/pricing`, `src/pages/api/prices/*`, `src/db/schema-precios.ts`

---

# PRD - Gestión de Precios para Sistema de Inventario (Parte 1)

Documento dividido en 2 partes (por tamaño; la numeración es continua y no se quitó contenido).

Parte 1 (este documento): encabezado, decisiones tomadas, 1. Resumen, 2. Objetivos y no-objetivos, 3. Usuarios, 4. Funcionalidades GP1 a GP6.

Parte 2: https://docs.google.com/document/d/1QmuuttCCqfkGO26eBaZyxBhlR6XWLn1afWxJHM58nq8/edit (4. Funcionalidades GP7 a GP11, 5. Flujos, 6. Notas técnicas, 7. Riesgos y preguntas abiertas, 8. Plan por fases y Anexo A). Las referencias a GP7 a GP11 y a las secciones 5 a 8 de esta parte están en la Parte 2.

Decisión tomada (9/10/2026): modo offline de venta, stock y caja en v1 (MVP). El dueño resolvió la diferencia entre el PRD de offline y el PRD principal: la venta, el stock y la caja offline con SQLite local en el celular entran en el MVP, como propone el PRD de offline; el PRD principal se está alineando a esa decisión. Todo el comportamiento offline de este PRD (GP4, Flujo 6) asume offline en v1. Ver 7.2.

Decisiones tomadas (9/10/2026), además: (1) el historial de costos (cost_history, GP5.6) entra en v1 (MVP); el F7.7 del PRD principal se está alineando. (2) La recomendación de markup (GP6) incluye como costos fijos los Sueldos pagados desde la caja y considera el retiro del dueño como un dato aparte (promedio registrado u objetivo), mostrando la recomendación con y sin retiro. Ver 7.2.

## 1. Resumen

### 1.1 Problema

En el kiosco y el comercio chico argentino los precios cambian todo el tiempo: llegan listas nuevas de los proveedores cada pocas semanas, sube el costo de un producto con cada factura y el dueño remarca "a ojo", producto por producto, muchas veces fuera de hora o el domingo a la noche para arrancar el lunes con precios nuevos. El resultado:

Remarcar cientos de productos lleva horas y se hace tarde o se hace mal (precios que quedan viejos, otros que se suben dos veces).

No hay una regla clara de redondeo: los precios terminan en $1.512 o $918, incómodos para dar el vuelto.

No se sabe qué precio se cobró en cada venta cuando el precio cambió en el medio del día, ni quién lo cambió.

El dueño confunde "le cargo 40%" (markup sobre el costo) con "gano 40%" (margen sobre el precio), y no sabe si lo que le carga a la mercadería alcanza para pagar la luz, el alquiler y ARCA.

Cuando cambia el costo, el precio de venta no acompaña y el margen se come sin que nadie se dé cuenta.

### 1.2 Visión

Que el dueño pueda subir (o bajar) todos los precios, o los de una categoría, en un minuto desde el celular, ver antes y después con el redondeo que usa su negocio, elegir desde cuándo rige (ya o, por ejemplo, el lunes a primera hora) y confirmar. Cada precio queda en un historial inmutable con vigencia, cada venta guarda el precio que efectivamente se aplicó, y los celulares que estaban sin conexión cobran el precio correcto según la hora de la venta.

Cada producto muestra costo, precio, ganancia en pesos, markup sobre el costo y margen sobre el precio, con la opción de fijar un markup y que el precio salga solo del costo. Después de un mes de ventas, el bot de WhatsApp le recomienda un markup mínimo calculado con sus costos fijos reales (luz, gas, tasas municipales, ARCA, alquiler y servicios), con una cuenta determinística y explicable. El dueño siempre puede poner su propio valor, que manda sobre la sugerencia.

### 1.3 Propuesta de valor

"Remarcás todo el kiosco en un minuto desde el celular, con redondeo prolijo y a partir del día y la hora que elijas, sabés cuánto ganás en cada producto y si lo que le cargás alcanza para pagar los gastos fijos."

### 1.4 Alcance del módulo

Incluye: ajuste masivo por porcentaje (general y por categoría; por proveedor en P1), vista previa antes/después con redondeo configurable, vigencia inmediata o programada, historial de precios y costos con vigencia (sin sobrescribir), precio aplicado congelado en cada línea de venta, reglas de precio para ventas offline, cancelación de ajustes programados y reversión de aplicados por un ajuste nuevo, costo/precio/ganancia/markup/margen por producto, markup manual por producto, recálculo del precio cuando cambia el costo, recomendación mensual de markup mínimo (con sueldos y con y sin retiro del dueño), asesor de costos por proveedor (P1, GP11; el MVP junta los datos), la pantalla Configuración de precios y alertas (redondeo, topes de aumento, umbral de revisión y umbral de stock bajo por defecto y por producto), auditoría de todo lo anterior e integraciones con descuentos, rotación, consumos, tickets, caja, offline, roles y bot.

No incluye: listas de precios múltiples (mayorista/minorista), precios dinámicos automáticos, importación de listas de proveedores (P1 del PRD principal, F7.7), liquidación de impuestos ni asesoramiento contable.

Promociones y combos (decisión 9/10/2026): están en v1 y los define RT12 del PRD de rotación; este PRD solo define su interacción con los precios (aviso de precio promocional contra el costo, no acumulación con descuentos manuales por defecto y cálculo del margen; GP9.12).

## 2. Objetivos y no-objetivos

### 2.1 Objetivos

### 2.2 No-objetivos (fuera de alcance, al menos en el MVP)

No cambia precios solo: ni la recomendación del bot ni un cambio de costo modifican un precio sin la confirmación del dueño (salvo el ajuste programado que el propio dueño confirmó).

No usa IA para calcular: la recomendación de markup y todas las cuentas de precios son aritmética determinística; un modelo de lenguaje, si se usa, solo interpreta mensajes del bot cuando las reglas no alcanzan, nunca hace cuentas ni decide precios.

No edita precios offline: los cambios de precio y costo y los ajustes masivos son acciones sensibles solo online (OF9.5 del PRD de offline).

No reescribe ventas cerradas: ningún ajuste ni sincronización recalcula el importe de un ticket cerrado.

No maneja listas de precios por cliente ni precios mayoristas. (Las promociones y combos sí están en v1, definidos en RT12 del PRD de rotación; acá solo su interacción con precios, GP9.12.)

No reemplaza al contador: el markup mínimo es una referencia de gestión, no un análisis impositivo.

## 3. Usuarios

### 3.1 Dueño/a (rol Dueño)

Es quien decide los precios. Remarca cuando llega una lista nueva, cuando sube un costo o los fines de semana para arrancar la semana con precios nuevos, casi siempre desde el celular. Quiere ver antes de confirmar, no equivocarse con un número (un 80% en lugar de un 8%) y saber si lo que le carga alcanza. Es el único rol que puede cambiar precios, costos, markups, la configuración de precios y alertas, y crear, cancelar o revertir ajustes (AU4: "Editar costos y precios de venta, aumento masivo" = 🔒 no delegable en el MVP).

### 3.2 Empleado/a (rol Empleado)

Vende. Ve el precio de venta vigente (y, en la venta, el precio que se va a cobrar) pero no ve costos, ganancias, markups, márgenes ni recomendaciones (AU4.3: se filtran en el servidor, y el catálogo offline del empleado no los tiene). No puede cambiar precios ni la configuración; puede aplicar descuentos en la venta solo dentro de lo que el dueño le habilitó (ver GP9.2).

### 3.3 Administrador de la plataforma (equipo propio)

Opera desde el Control Plane: monitorea los jobs de ajustes programados y de recomendación mensual, métricas agregadas por comercio (cantidad de ajustes, fallas de jobs, diferencias offline), sin ver precios ni montos de un comercio salvo con consentimiento y registro (mismo criterio que el PRD principal).

## 4. Funcionalidades

### 4.0 Priorización

### GP1. Ajuste masivo general por porcentaje (P0)

Descripción: el dueño aplica un porcentaje a todos los precios de venta de una vez, en más (aumento) o en menos (baja), con vista previa, redondeo, controles contra errores y confirmación.

### Requerimientos:

GP1.1 Entrada: desde "Precios" → "Ajustar precios" (web y celular, mismo flujo, mobile-first). El dueño elige Aumentar o Bajar e ingresa el porcentaje con hasta 2 decimales (ej.: 8; 12,5). Rango permitido: aumento de 0,01% a 300%; baja de 0,01% a 90%.

GP1.2 Alcance "Todos los productos": incluye todos los productos activos con precio de venta cargado. Se excluyen automáticamente y se listan aparte: productos archivados, productos sin precio y productos marcados "Excluir de ajustes masivos" (por ejemplo, cigarrillos u otros con precio fijado por el fabricante). El dueño puede destildar productos puntuales en la vista previa.

GP1.3 Cálculo: precio nuevo sin redondear = precio vigente al momento de la vigencia × (1 + p) para aumentos o × (1 − p) para bajas, calculado en centavos enteros (6.3). Después se aplica el redondeo configurado (GP7.2), que el dueño puede cambiar solo para ese ajuste.

GP1.4 Vista previa antes/después (obligatoria): lista con foto miniatura, nombre, precio actual → precio nuevo (con redondeo), diferencia en $ y %, y para el Dueño también costo, markup actual → nuevo y margen actual → nuevo. Resumen arriba: cantidad de productos afectados, excluidos y con aviso; variación promedio real (después del redondeo). Filtros "Con aviso", "Excluidos", buscador. En el celular, la lista pagina de a 50 y el resumen queda fijo arriba.

GP1.5 Avisos en la vista previa:

Bajo costo: el precio nuevo queda por debajo del costo (en rojo).

Debajo del markup mínimo activo (GP6): el markup nuevo queda por debajo del mínimo (en ámbar).

Supera el tope (GP7.3): el aumento de ese producto supera el tope en $ o en % que le corresponde.

Redondeo grande: el redondeo cambia el precio más de 5% respecto del cálculo sin redondear (típico en productos muy baratos).

GP1.6 Topes de aumento (GP7.3): para los productos que superan su tope, el dueño elige en la vista previa (para todos o por producto): [Limitar al tope] (el aumento queda en el máximo permitido, redondeado hacia abajo al paso de redondeo para no pasarlo), [Excluir] o [Superar el tope] (requiere la confirmación reforzada de GP1.7). La opción por defecto es "Limitar al tope".

GP1.7 Umbral de revisión (GP7.4, por defecto 20%, configurable): si el porcentaje ingresado, o el aumento real de algún producto después del redondeo o del recálculo, supera el umbral, la confirmación pasa a revisión reforzada: pantalla con los productos que superan el umbral, el texto "Vas a subir precios más de 20%. Escribí el porcentaje para confirmar" (el dueño tipea el número) y reautenticación reciente (AU10). Protege contra el error típico de tipear 80 en vez de 8.

GP1.8 Vigencia: el dueño elige "Ahora" o "Programar" con fecha y hora (GP3).

GP1.9 Confirmación: botón "Confirmar ajuste" con resumen ("Aumento 8% · 412 productos · rige el lunes 12/10 a las 00:00 · redondeo hacia arriba a $10"). El ajuste se crea en una sola transacción con su idempotency_key (un doble toque no crea dos ajustes).

GP1.10 Acción sensible: crear un ajuste masivo requiere conexión (OF9.5) y sesión con reautenticación reciente (AU10; si la ventana venció, se pide de nuevo).

GP1.11 Resultado: pantalla "Ajuste creado" con link al detalle (GP3.6) y, si es inmediato, el precio nuevo llega a los demás dispositivos conectados en menos de 2 minutos (OF3.3).

### Criterios de aceptación:

☐ Con 3 productos a $1.400, $850 y $2.990, aumento 8% con redondeo hacia arriba a $10, la vista previa muestra $1.520, $920 y $3.230 y la variación promedio real.

☐ Bajo 10% con redondeo al más cercano a $10: $1.400 → $1.260; $855 → $770 ($769,50 se redondea a $770).

☐ Un producto marcado "Excluir de ajustes masivos" aparece en la lista de excluidos y su precio no cambia.

☐ Si un precio nuevo queda debajo del costo, la fila aparece en rojo y el resumen dice "1 producto quedaría por debajo del costo".

☐ Ingreso 80% con umbral de revisión 20%: no puedo confirmar sin escribir "80" y reautenticarme.

☐ Con tope por defecto de 30%, un ajuste de 35% limita esos productos a 30% por defecto, y puedo elegir excluirlos o superar el tope con confirmación reforzada.

☐ Toco dos veces "Confirmar ajuste" con mala conexión y queda un solo ajuste.

☐ Como Empleado no veo la opción "Ajustar precios" y la API devuelve 403 "No tenés permiso para cambiar precios".

☐ Offline, el botón "Ajustar precios" aparece deshabilitado con "Necesita conexión".

☐ El ajuste completo se hace desde el celular sin PC.

### GP2. Ajuste por categoría (P0; por proveedor P1)

Descripción: el mismo ajuste de GP1, limitado a una o más categorías elegidas.

### Requerimientos:

GP2.1 Alcance "Por categoría": selector múltiple de categorías (con buscador y cantidad de productos de cada una). El ajuste aplica solo a los productos activos de esas categorías, con las mismas exclusiones de GP1.2.

GP2.2 Todo lo demás es igual a GP1: cálculo, redondeo, vista previa, avisos, topes, umbral de revisión, vigencia, confirmación y auditoría. El resumen dice el alcance ("Golosinas y Galletitas · 96 productos").

GP2.3 Un producto sin categoría solo entra en ajustes generales (o, en P1, por selección manual); la vista previa del ajuste por categoría avisa cuántos productos "Sin categoría" quedan afuera.

GP2.4 (P1) Por proveedor: alcance "Por proveedor" con uno o más proveedores (proveedor principal del producto, F6 del PRD principal), combinable con categoría ("Bebidas de Distribuidora X"). Ver 7.2 sobre la prioridad respecto de F7.4 del PRD principal.

GP2.5 (P1) Por selección manual (lista de productos tildados) y desde la lista de baja rotación del PRD de rotación (RT4): "Bajar precio a estos productos" precarga el alcance con los productos dormidos elegidos.

GP2.6 (P1) Ajuste sobre el costo: aplicar un % al costo (cuando el proveedor avisa un aumento, Flujo 6 del PRD principal), con la opción "mantener el markup" (el precio se recalcula) o "solo el costo".

### Criterios de aceptación:

☐ Elijo "Golosinas" y "Galletitas", aplico +12% y solo cambian los productos de esas dos categorías; el resumen muestra la cantidad por categoría.

☐ Los productos de otras categorías y los "Sin categoría" no cambian, y la vista previa informa cuántos "Sin categoría" quedaron afuera.

☐ (P1) Elijo el proveedor "Distribuidora X" y la categoría "Bebidas" y solo cambian los productos que cumplen las dos condiciones.

### GP3. Vigencia, historial de precios y ajustes programados (P0)

Descripción: cada precio tiene una vigencia. Los precios nunca se sobrescriben: cada cambio agrega un registro nuevo al historial con su "vigente desde". Las ventas usan el precio vigente a su hora; un ajuste programado se puede cancelar antes de que rija, y uno aplicado solo se revierte con un ajuste nuevo.

### Requerimientos:

GP3.1 Historial de precios (price_history): cada producto tiene una serie de registros de precio de venta con valid_from (vigente desde) y valid_to (vigente hasta, derivado: es el valid_from del registro siguiente; abierto en el último). Todo cambio de precio (alta del producto, edición individual, ajuste masivo, recálculo por markup, reversión, alta offline aceptada) agrega un registro; ninguno se modifica ni se borra (append-only, 6.2).

GP3.2 Precio vigente de un producto a la hora T = el registro con el mayor valid_from ≤ T entre los registros no anulados (los de un ajuste cancelado se ignoran). Las ventas anteriores a la vigencia usan el precio viejo y las posteriores, el nuevo.

GP3.3 Vigencia inmediata: valid_from = hora del servidor al confirmar. Vigencia programada: fecha y hora elegidas por el dueño en la zona del comercio (America/Argentina/Buenos_Aires), al menos 5 minutos en el futuro y hasta 90 días. Atajos: "Mañana a la apertura" (hora de apertura habitual, si la caja la tiene), "Lunes 00:00", "Elegir fecha y hora".

GP3.4 Ajuste programado: al confirmarlo, los registros de precio futuros se crean enseguida (con su valid_from futuro), el ajuste queda Programado y los registros se envían a los dispositivos en la sincronización normal (OF3.3), para que un celular que quede offline cobre el precio nuevo a la hora indicada (GP4.3).

GP3.5 Un solo ajuste programado pendiente por producto (MVP): si un producto ya está en un ajuste programado pendiente, un ajuste nuevo que lo incluye avisa "12 productos ya tienen un ajuste programado para el lunes" y ofrece excluirlos o cancelar el anterior y crear este. Así el precio base de cada ajuste programado es siempre conocido. (P1: encadenar ajustes programados recalculando el posterior.) Una edición individual del precio de un producto con un ajuste programado pendiente avisa que el ajuste se calculó sobre el precio anterior.

GP3.6 Detalle del ajuste: estado (Programado / Aplicado / Cancelado / Revertido), quién lo creó, cuándo, %, alcance, redondeo, topes usados, vigencia, cantidad de productos afectados y excluidos, y la lista antes/después. Lista "Ajustes" con filtros por estado y fecha.

GP3.7 Cancelar un programado: "Cancelar ajuste" solo mientras falte más de 1 minuto para la vigencia. La cancelación es un evento (no un borrado): los registros de precio de ese ajuste quedan anulados y los dispositivos los descartan al sincronizar. Requiere confirmación y queda en la auditoría con motivo opcional.

GP3.8 "Modificar" un programado = cancelarlo y crear uno nuevo con los datos precargados (no hay edición en el lugar).

GP3.9 Revertir un aplicado: "Revertir ajuste" crea un ajuste nuevo de reversión (inmediato o programado) que vuelve cada producto al precio anterior que figura en el detalle. Los productos cuyo precio cambió después de ese ajuste (por otra edición) se listan aparte y quedan excluidos por defecto. El ajuste original queda "Revertido por #N" y nada del historial se modifica.

GP3.10 Aplicación de los programados: a la hora de vigencia, el precio nuevo rige solo por la regla de GP3.2 (no depende de que un job corra a tiempo). Un job (6.5) marca el ajuste como Aplicado, actualiza el precio vigente cacheado del producto y avisa al dueño en la app (y, si lo tiene activado, por el bot; GP9.8).

GP3.11 Historial por producto: en la ficha, "Historial de precios" muestra cada precio con su vigencia, origen (ajuste #N, edición manual, recálculo por markup, reversión) y usuario; para el Dueño, también el historial de costos.

### Criterios de aceptación:

☐ Programo +8% para el lunes 12/10 a las 00:00; el domingo a las 23:59 la Coca-Cola 500 ml se vende a $1.400 y el lunes a las 00:01, a $1.520, sin que nadie toque nada.

☐ Si el job de aplicación se demora, una venta online a las 00:01 igual sale a $1.520.

☐ Cancelo un ajuste programado el domingo a las 20:00; el lunes los precios siguen iguales y el ajuste figura "Cancelado" con quién y cuándo.

☐ A menos de 1 minuto de la vigencia, "Cancelar ajuste" ya no está disponible y se ofrece "Revertir" después de que rija.

☐ Revierto un ajuste aplicado de +12%: se crea el ajuste de reversión y los precios vuelven a los anteriores; el historial muestra los tres registros (anterior, +12%, reversión).

☐ Ningún registro de price_history se puede modificar ni borrar desde la app, la API ni el rol de aplicación de la base.

☐ Un producto que ya está en un ajuste programado pendiente no entra en un segundo sin que yo elija excluirlo o cancelar el primero.

### GP4. Precio aplicado en la venta (snapshot) y ventas offline (P0)

Descripción: cada línea de venta guarda el precio que se aplicó; un ajuste nunca toca ventas cerradas. Para los celulares que estuvieron sin conexión durante la vigencia, se define qué precio corresponde y cómo se marcan las diferencias. Asume la decisión de offline en v1 (nota inicial y 7.2).

### Requerimientos:

GP4.1 Snapshot por línea de venta: cada línea (movimiento egreso_venta del PRD principal y línea del ticket del PRD de tickets) guarda, en centavos: precio de lista unitario (el vigente, GP3.2), referencia al registro de precio usado (price_history_id), descuento aplicado (GP9.2), precio unitario cobrado, costo unitario (con su cost_history_id), importe y ganancia (F2.10 y F7.8 del PRD principal). Esos valores no cambian nunca: devoluciones (F10.5), reportes (RT1.3) y reimpresiones de ticket usan el snapshot, no el precio actual.

GP4.2 Venta online: el servidor resuelve el precio vigente a su hora (created_at) y lo congela en la línea. Si la venta se armó antes de la vigencia y se confirma después, se cobra el precio vigente al confirmar y la pantalla avisa "Cambió el precio de 1 producto: $1.400 → $1.520" antes de confirmar.

GP4.3 Venta offline (v1): el celular tiene en su catálogo local los registros de precio vigentes y los futuros ya programados (GP3.4). Al vender offline, calcula el precio con la misma regla de GP3.2 usando su hora local, y ese es el importe cobrado (lo que pagó el cliente; OF2.3).

GP4.4 Precio de referencia de una venta offline: al sincronizar, el servidor determina el precio que correspondía según la hora validada de la venta (client_occurred_at validado por OF8.4; si el reloj del dispositivo no es confiable, la hora de recepción, y la venta se marca "reloj desfasado").

GP4.5 La sincronización no recalcula tickets cerrados: si el precio cobrado difiere del de referencia (por ejemplo, el celular quedó offline antes de recibir un ajuste, o recibió un ajuste que después se canceló), la venta no se modifica: se marca "vendida con precio desactualizado" con la diferencia en $ (anomalía precio_desactualizado del PRD de offline, informativa y agregada en un reporte; no dispara alertas individuales). La ganancia de la venta offline se calcula con el costo vigente a la hora validada (6.6 del PRD de offline).

GP4.6 Reporte de diferencias de precio (P0 simple): "Precios → Diferencias offline" lista por período las ventas con precio desactualizado: producto, dispositivo, empleado, precio cobrado, precio de referencia, diferencia y total del período. Solo Dueño.

GP4.7 Cancelaciones ya descargadas: si un dispositivo descargó un ajuste programado que después se canceló y no volvió a sincronizar antes de la vigencia, puede cobrar el precio del ajuste cancelado; esas ventas quedan marcadas según GP4.5.

GP4.8 Antigüedad de precios offline: el celular muestra "Precios actualizados hace X" (OF3.6); si hay un ajuste programado descargado, la pantalla de venta muestra un aviso discreto "Precios nuevos desde el lunes 00:00" en las 24 h previas.

### Criterios de aceptación:

☐ Un celular sincronizó el viernes con el ajuste +8% programado para el lunes 00:00, quedó offline desde el domingo 22:00 y vendió una Coca-Cola el domingo 23:50 a $1.400 y otra el lunes 00:10 a $1.520; al sincronizar, ninguna se marca como diferencia.

☐ Un celular offline desde antes de que se creara el ajuste vende el lunes 08:30 a $1.400; al sincronizar, el ticket sigue en $1.400 y la venta aparece en "Diferencias offline" con −$120.

☐ Un ticket cerrado nunca cambia de importe por un ajuste ni por una sincronización.

☐ La reimpresión de un ticket del sábado muestra el precio del sábado aunque hoy el precio sea otro.

☐ Con el reloj del celular adelantado 2 horas, la referencia usa la hora de recepción y la venta queda marcada "reloj desfasado".

### GP5. Costo, precio de venta, ganancia, markup y margen (P0)

Descripción: detalle de F7 del PRD principal. Cada producto tiene costo y precio de venta; la ganancia se calcula sola; el dueño puede fijar un markup y que el precio salga del costo.

### Requerimientos:

GP5.1 Campos: costo unitario (si se carga por caja, se divide por las unidades por caja, F7.1) y precio de venta unitario, ambos en pesos con centavos (guardados en centavos enteros).

GP5.2 Cálculos automáticos (visibles solo para el Dueño, F7.6 y AU4.3):

Ganancia por unidad ($) = precio − costo.

Markup sobre el costo (%) = (precio − costo) / costo. Es "el porcentaje que se le carga" al costo; es el valor que usa el kiosco para remarcar.

Margen sobre el precio (%) = (precio − costo) / precio. Es la parte del precio de venta que queda como ganancia bruta.

El comercio elige cuál mostrar como principal (F7.2); los dos siempre están a un toque.

GP5.3 Diferencia entre markup y margen (con fórmulas):

Precio desde el markup: precio = costo × (1 + markup).

Precio desde el margen: precio = costo / (1 − margen).

Conversión: margen = markup / (1 + markup) y markup = margen / (1 − margen).

Ejemplo: costo $1.000 y precio $1.400 → ganancia $400; markup = 400 / 1.000 = 40%; margen = 400 / 1.400 = 28,57% (el PRD principal lo muestra redondeado a 28,6%). Si el dueño quiere "ganar 40% del precio" (margen 40%), el precio es 1.000 / 0,60 = $1.666,67, no $1.400. La app muestra esta aclaración la primera vez que se carga un markup ("Cargarle 40% al costo no es lo mismo que ganar 40% de lo que cobrás").

Para un mismo producto con ganancia positiva, el markup siempre es mayor que el margen; un markup de 100% equivale a un margen de 50%.

GP5.4 Modo de precio por producto: Manual (el dueño carga el precio; el markup se calcula) o Por markup (el dueño carga el markup %; el precio se deriva: costo × (1 + markup), redondeado según GP7.2). Por defecto, Manual. Ejemplo de F7.3: costo $1.000 + 40% = $1.400.

GP5.5 Markup en ajustes masivos: un ajuste masivo cambia el precio de productos en modo "Por markup" igual que el resto; la vista previa avisa "Estos 30 productos tienen markup fijo: pasan a modo Manual con el precio nuevo" y el dueño puede excluirlos. El modo cambia solo si confirma.

GP5.6 Historial de costos (cost_history): cada cambio de costo agrega un registro con vigencia (misma lógica que GP3.1), origen (alta, edición manual, factura de proveedor P1, ajuste de costo P1) y usuario. Se necesita en el MVP para calcular la ganancia de ventas offline con el costo vigente a su hora (PRD de offline, 6.6) y el CMV de la recomendación (GP6). Ver 7.2 sobre F7.7 del PRD principal. Decisión tomada (9/10/2026): el historial de costos está en v1 (MVP); el F7.7 del PRD principal (hoy en P1) se está alineando a esta decisión. El costo por proveedor (GP11) se guarda aparte, en product_supplier_costs, también desde el MVP.

GP5.7 Cambio de costo → recálculo del precio: cuando cambia el costo (edición manual en el MVP; desde la factura del proveedor en P1, FP8.11 del PRD de facturas):

Productos Por markup: se ofrece "Recalcular el precio con tu markup de 40%: $4.200 → $4.620" con vista previa, vigencia (ahora o programada) y confirmación. Si el dueño no confirma, el precio queda y el producto muestra "Costo actualizado, precio sin recalcular".

Productos Manuales: se muestran el markup y el margen nuevos, y se avisa si quedan bajo costo o por debajo del markup mínimo activo (GP6), con el atajo "Ajustar precio".

Si cambian varios costos a la vez (por ejemplo, una factura), el recálculo se ofrece en lote, como un ajuste de tipo "recálculo por markup" con su detalle y auditoría.

El recálculo respeta los topes y el umbral de revisión (GP7.3 y GP7.4).

GP5.8 Alertas: precio menor al costo en rojo (F7); markup por debajo del mínimo activo (GP6) en ámbar, con filtro "Debajo del mínimo" en el listado de productos.

### Criterios de aceptación:

☐ Cargo costo $1.000 y precio $1.400 y veo ganancia $400, markup 40% y margen 28,57% (28,6% redondeado).

☐ Pongo un producto en modo "Por markup" con 40% y costo $3.000; el precio queda en $4.200.

☐ Cambio el costo de ese producto a $3.300 y la app me ofrece recalcular a $4.620 (redondeo a $10) o $4.650 (redondeo a $50); si confirmo, el precio nuevo queda en el historial con origen "recálculo por markup".

☐ Si no confirmo el recálculo, el precio no cambia y el producto queda marcado "Costo actualizado, precio sin recalcular".

☐ En un producto manual, al subir el costo por encima del precio, la ficha muestra el margen negativo en rojo.

☐ Un Empleado no ve costo, ganancia, markup ni margen en la app ni en la respuesta de la API.

### GP6. Recomendación de markup mínimo del bot (P0)

Descripción: después de un mes de ventas, el sistema calcula un markup mínimo para cubrir los costos fijos del mes con lo que se vendió, y el bot se lo informa al dueño. Es una sugerencia: el valor manual del dueño siempre manda y el sistema registra cuál está activo.

### Requerimientos:

GP6.1 Cuándo: se calcula por mes calendario cerrado, el día 1 de cada mes a las 09:00 (hora del comercio), cuando el comercio tiene al menos un mes calendario completo de ventas (desde el mes siguiente al de su primera venta). Se recalcula todos los meses. El dueño puede tocar "Recalcular" en cualquier momento sobre el último mes cerrado.

GP6.2 Datos de entrada (del mes cerrado):

Ventas netas (V) = ingresos netos del mes (RT1.3 del PRD de rotación): Σ importes de ventas con los precios cobrados (descuentos incluidos) − reintegros de devoluciones.

CMV (costo de la mercadería vendida) = Σ (costo unitario congelado × cantidad) de las ventas del mes − costo de lo devuelto (F10.5). Equivale a V − ganancia bruta neta.

Costos fijos del mes (CF) = egresos y vencimientos del mes en las categorías de costos fijos de la caja: Luz, Gas, Impuestos > Tasas municipales, Impuestos > ARCA, Alquiler y Servicios (agua, internet, teléfono; PRD de consumos CS2.1 y PRD de caja C5). Se toma cada factura una sola vez (vínculo factura ↔ egreso de CS5.6) y se imputa al mes del período del comprobante si se conoce; si no, al mes del egreso o del vencimiento. El dueño puede marcar o desmarcar otras categorías como "costo fijo" en GP7 (por ejemplo, sueldos; ver 7.2).

Sueldos (decisión 9/10/2026): los egresos de la categoría "Sueldos y adelantos" de la caja (C5.2 del PRD de caja; los sueldos se pagan desde la caja y se registran como egreso) se suman a los costos fijos del mes por defecto.

Retiros de efectivo "compra para el negocio": un retiro del cajón para comprar algo del negocio no es un retiro del dueño: cuenta como gasto en la categoría que se le asigna (por ejemplo, Servicios u Otros egresos) y suma a CF si esa categoría es de costo fijo. Si es mercadería (Pago a proveedores), no suma a CF porque ya entra por el CMV. (El tipo "compra para el negocio" se propone como referencia cruzada al PRD de caja; ese documento no se modificó.)

No suman a CF: Pago a proveedores (mercadería, ya está en el CMV), Devolución, Aporte del dueño y el Retiro del dueño, que va como dato aparte (siguiente punto). "Sin factura" y "Otros egresos" no suman por defecto; el dueño puede marcarlas en GP7. Si se carga la alícuota de Ingresos Brutos como porcentaje (GP6.13), los egresos de "Impuestos > Ingresos brutos" se excluyen de CF para no contarlos dos veces.

GP6.2 bis Retiro del dueño (R), dato aparte (decisión 9/10/2026): lo que el dueño se lleva por mes (categoría "Retiro del dueño" de la caja, separada de los gastos del negocio, Flujo 8 del PRD de caja) se modela como una entrada propia, no mezclada con CF:

Por defecto: el promedio mensual de los retiros registrados en los últimos 3 meses cerrados (o en los meses cerrados disponibles, si son menos).

Objetivo del dueño: "¿Cuánto querés llevarte por mes?", un monto que el dueño carga en GP7 o desde el bot; si está cargado, reemplaza al promedio.

Sin retiros registrados ni objetivo, R = 0 y el detalle lo aclara ("No registraste retiros: cargá cuánto querés llevarte por mes").

La recomendación se muestra siempre con y sin el retiro, para que se vea cuánto pesa cada parte.

GP6.3 Fórmula (determinística):

### Markup mínimo = (CMV + CF) / CMV − 1 = CF / CMV.

Es el markup sobre el costo que, vendiendo la misma mercadería (mismo volumen y mismos costos), genera una ganancia bruta igual a los costos fijos: CMV × markup = CF. Por debajo, el mes no cubre los gastos fijos.

Expresado con el margen real: CF / V es la parte de las ventas que se necesita para los costos fijos (un margen, no un markup). Para pasarlo a markup sobre el costo hay que usar el margen bruto real del mes, g = (V − CMV) / V: markup mínimo = (CF / V) / (1 − g), que da exactamente lo mismo que CF / CMV, porque V × (1 − g) = CMV.

Margen mínimo equivalente = markup mínimo / (1 + markup mínimo) = CF / (CMV + CF).

Con el retiro del dueño (decisión 9/10/2026): markup mínimo con retiro = (CMV + CF + R) / CMV − 1 = (CF + R) / CMV; sin retiro = CF / CMV. El recomendado (el que se usa si la fuente activa es "Recomendado", GP6.9) es el con retiro; el sin retiro se muestra al lado. Equivalente con el margen real: ((CF + R) / V) / (1 − g).

Para el dueño, en palabras simples: "gastos / lo vendido" da un porcentaje del precio de venta (es decir, un margen: de cada $100 que cobrás, cuántos se van en gastos). El kiosco remarca con un porcentaje sobre el costo (markup). Por eso el sistema convierte uno en otro dividiendo por (1 − margen bruto real). La app muestra los dos: "Tus gastos son el 17% de lo que vendés" (margen) y "Necesitás cargarle 24,29% a tus costos" (markup), con los números del ejemplo de GP6.4.

Error que el sistema evita: usar CF / V directamente como markup. Ese porcentaje es una parte del precio, no un recargo sobre el costo, y aplicado como markup da menos ganancia que los costos fijos (ver el ejemplo).

GP6.4 Ejemplo resuelto (datos de ejemplo, números redondos):

Cálculo con el ejemplo:

Markup mínimo = (7.000.000 + 900.000) / 7.000.000 − 1 = 12,86% (12,857…%, redondeado hacia arriba a 2 decimales).

Comprobación con el margen: CF / V = 900.000 / 10.000.000 = 9% de las ventas; 9% / (1 − 0,30) = 9% / 0,70 = 12,86%. Coincide.

Margen mínimo equivalente = 900.000 / 7.900.000 = 11,39%.

Con 12,86% de markup, la misma mercadería se vende a 7.000.000 × 1,1286 ≈ $7.900.000 y la ganancia bruta (≈ $900.000) cubre los costos fijos.

Si se usara 9% como markup (el error de GP6.3): 7.000.000 × 9% = $630.000 de ganancia bruta, $270.000 menos que los costos fijos.

Lectura: el markup realizado del mes (42,86%) es mayor que el mínimo (12,86%), así que este comercio de ejemplo cubrió sus costos fijos con holgura; los productos con markup menor a 12,86% se marcan "Debajo del mínimo".

Ejemplo ampliado con sueldos y retiro del dueño (decisión 9/10/2026; datos de ejemplo, mismo mes): al subtotal anterior ($900.000 de servicios, impuestos y alquiler) se suman los sueldos, y el retiro va aparte:

Cálculo con sueldos y retiro (datos de ejemplo):

Sin retiro: 1.700.000 / 7.000.000 = 24,29% (24,2857…%, hacia arriba). Margen equivalente: 1.700.000 / 8.700.000 = 19,54%. Gastos sobre lo vendido: 1.700.000 / 10.000.000 = 17% (margen), que con g = 30% da 17% / 0,70 = 24,29% (markup). Coincide.

Con retiro promedio: (1.700.000 + 1.100.000) / 7.000.000 = 2.800.000 / 7.000.000 = 40,00%. Margen equivalente: 2.800.000 / 9.800.000 = 28,57%. Comprobación: 28% de lo vendido / 0,70 = 40%.

Con retiro objetivo: (1.700.000 + 1.500.000) / 7.000.000 = 45,72% (45,714…%, hacia arriba). Margen equivalente: 3.200.000 / 10.200.000 = 31,37%.

Lectura: con el markup realizado de 42,86% (ganancia bruta $3.000.000), el comercio cubre gastos y el retiro promedio (necesita $2.800.000; sobran $200.000), pero no el objetivo de $1.500.000 (necesita $3.200.000; faltan $200.000).

Error evitado: usar 17% como markup daría 7.000.000 × 17% = $1.190.000 de ganancia bruta, $510.000 menos que CF.

GP6.5 Qué incluye y qué no: el markup mínimo es un punto de equilibrio de los costos fijos cargados, con el volumen del mes. No incluye lo que no esté cargado en la caja (redacción original: "por ejemplo, sueldos o el retiro del dueño, salvo que se marquen como costo fijo"; actualizado por la decisión del 9/10/2026: los sueldos de la caja se incluyen por defecto en CF y el retiro del dueño entra como dato aparte, GP6.2 y GP6.2 bis), ni una ganancia objetivo (P1: markup objetivo = (CMV + CF + ganancia deseada) / CMV − 1). El mensaje del bot lo dice en una línea.

GP6.6 Datos incompletos: si falta algún costo fijo habitual del mes (por ejemplo, no hay Alquiler cargado pero sí lo hubo en meses anteriores) o hay menos de 20 días con ventas, la recomendación se emite como "parcial" con la lista de lo que falta ("No encontré Alquiler en septiembre: si lo cargás, recalculo"). Si CMV = 0 (no hay costos cargados en las ventas), no se calcula y se avisa "Cargá los costos de tus productos para recibir la recomendación".

GP6.7 Cálculo determinístico, no IA: lo hace una función del dominio con aritmética entera (6.3), versionada (version_formula); el bot solo arma el mensaje con plantilla a partir del resultado. Mismos datos → mismo resultado.

GP6.8 Aviso del bot: el bot (número central) le manda al Dueño el resumen: "En septiembre vendiste $10.000.000 y tus gastos fijos fueron $900.000. Para cubrirlos necesitás cargarle al menos 12,86% a tus costos (tu promedio fue 42,86%). Hay 37 productos por debajo." [Ver detalle] [Usar como mínimo] [Poner mi valor]. Con sueldos y retiro (decisión 9/10/2026), el mensaje muestra las dos cifras: "Gastos fijos con sueldos: $1.700.000 (17% de lo que vendiste). Necesitás cargarle 24,29% sin tu retiro y 40,00% con tu retiro promedio de $1.100.000 (tu promedio fue 42,86%). Hay 23 productos por debajo del precio recomendado." [Ver detalle] [Ver precios sugeridos] [Usar como mínimo] [Poner mi valor] [Cambiar mi retiro]. Los precios sugeridos van en el mismo mensaje mensual: no suman plantillas pagas. Como notificación proactiva, sale por WhatsApp y email a la vez si el dueño la tiene activada (B2 del PRD del bot y PRD de notificaciones por email); es una plantilla de utilidad paga, una por mes y comercio (documento de costos).

GP6.9 Override manual y valor activo: el markup mínimo activo del comercio tiene una fuente: Manual (el dueño cargó su valor; siempre manda), Recomendado (el dueño aceptó usar la recomendación, que se actualiza cada mes) o Ninguno. Si hay valor manual, la recomendación mensual se sigue calculando y mostrando, pero no reemplaza al manual; el bot dice "Tu mínimo manual de 25% sigue activo; la recomendación de este mes es 12,86%". Cada cambio de valor o de fuente queda en la auditoría.

GP6.10 Para qué se usa el mínimo activo: como referencia y alerta (GP1.5, GP5.8, GP9.2), nunca para cambiar precios solo. (P1) Botón "Ajustar los productos debajo del mínimo" que abre una vista previa de recálculo.

GP6.11 Detalle web y celular: pantalla "Recomendación de markup" con los datos de entrada, la fórmula con los números del comercio, el historial mensual (recomendado, manual, activo) y la lista de productos debajo del mínimo. Solo Dueño.

Recomendación de precio por producto (extensión de GP6, P0): a partir del markup de costos fijos del comercio, el bot y la web sugieren un precio de venta por producto que además cubre los costos que son un porcentaje del precio (impuestos sobre la venta y comisiones de cobro) y una ganancia deseada. Es matemática determinística, no IA; es solo una sugerencia; el valor manual del dueño siempre manda y nada cambia sin un toque del dueño.

GP6.12 Entradas por producto y del comercio:

Costo (c): el costo vigente del producto (cost_history, GP5.6). (P1, con GP11) Opcionalmente, el costo del proveedor más barato con costo vigente y no desactualizado, mostrado como alternativa ("Si se lo comprás a Mayorista Y").

Markup de costos fijos (k): el markup mínimo activo de GP6.9: si el dueño cargó un valor manual, se usa ese (manda siempre); si no, el recomendado con retiro = (CF + R) / CMV, con CF que incluye servicios, alquiler, impuestos fijos (como el monotributo) y sueldos, y R el retiro del dueño (GP6.2 bis). Siempre se muestra también el precio sin retiro (k = CF / CMV).

Impuestos sobre la venta (t): alícuota de Ingresos Brutos en % (configurable en GP7, según la jurisdicción y la actividad [a verificar con el contador de cada comercio]). La cuota fija del monotributo no va acá: es un monto fijo y entra en CF (Impuestos > ARCA). El IVA solo aplica a responsables inscriptos y queda fuera del MVP (7.2).

Comisiones de cobro ponderadas (w): comisión % de cada medio de pago (Débito, Mercado Pago, QR; Efectivo y Transferencia en 0% salvo que se cargue otra cosa), configurables en GP7 [a verificar las tasas vigentes de cada proveedor], ponderadas por la mezcla real de cobros del comercio en la caja: w = Σ (participación del medio en el importe de las ventas del período × comisión del medio). Período: último mes cerrado (o los últimos 3, configurable).

Ganancia deseada (g): % del precio de venta que el dueño quiere que quede como ganancia después de todo (configurable en GP7; vacío = 0%).

GP6.13 Fórmula:

Precio recomendado = c × (1 + k) / (1 − (t + w + g)), y después el redondeo de GP7.2 (por defecto, hacia arriba a $10).

El numerador cubre el costo y su parte de los costos fijos (k es un markup sobre el costo, por eso multiplica). El denominador cubre lo que es porcentaje del precio (impuestos, comisiones y ganancia deseada son partes del precio, por eso dividen): si t + w + g = 14,35%, solo el 85,65% de lo que se cobra queda para costo y costos fijos.

Recordatorio para el dueño (mismo criterio de GP6.3): "gastos / lo vendido" es un porcentaje del precio (margen); para usarlo como recargo sobre el costo hay que convertirlo a markup. La pantalla muestra los dos: el markup k y el margen equivalente k / (1 + k).

Validación: si t + w + g ≥ 60%, no se calcula y se pide revisar la configuración ("Impuestos, comisiones y ganancia suman más del 60% del precio").

Supuesto explícito: los costos fijos se reparten entre los productos en proporción a su costo (el mismo k para todos). (P2: k por categoría.)

GP6.14 Ejemplo resuelto (datos de ejemplo): k = 40,00% (con retiro promedio, ejemplo ampliado de GP6.4); sin retiro, 24,29%. Ingresos Brutos t = 3,5%. Mezcla de cobros del mes y comisiones: Efectivo 50% × 0% + Débito 20% × 1,5% + Mercado Pago 15% × 3,0% + QR 10% × 1,0% + Transferencia 5% × 0% → w = 0,30% + 0,45% + 0,10% = 0,85%. Ganancia deseada g = 10%. Total porcentual t + w + g = 14,35%; denominador 1 − 0,1435 = 0,8565.

Comprobaciones del ejemplo:

Comprobación con la Coca-Cola a $1.640: Ingresos Brutos 3,5% = $57,40; comisiones 0,85% = $13,94; ganancia deseada 10% = $164,00; quedan 1.640 − 235,34 = $1.404,66 para el costo ($1.000) y su parte de costos fijos y retiro ($400). Cubre (el excedente de $4,66 es del redondeo).

(P1, con GP11) Si el proveedor más barato vende la Coca-Cola a $940: 940 × 1,40 / 0,8565 = $1.536,49 → $1.540, mostrado como alternativa.

GP6.15 Qué se sugiere: solo para productos con costo cargado y precio actual menor al recomendado con retiro: se propone subir al recomendado. Los productos por encima se muestran como "Por encima del recomendado" (informativo); en el MVP no se sugieren bajas. Se excluyen los marcados "Excluir de ajustes masivos" (GP1.2) y los marcados "No recomendar precio".

GP6.16 Override manual: el precio que el dueño carga a mano nunca se pisa; la sugerencia solo aparece al lado. Por producto, el dueño puede marcar "No recomendar precio" (precio fijo a mano) y, en P1, una ganancia deseada propia del producto. A nivel comercio, el markup mínimo manual (GP6.9) reemplaza a k. Se registra qué valores se usaron (manual o recomendado) en cada sugerencia.

GP6.17 Dónde se muestra: en la ficha del producto ("Precio recomendado: $1.640 · con tu retiro · sin retiro $1.460", con el desglose), en la lista "Precios sugeridos" (web y celular, con filtros y totales) y en el bot (mensaje mensual de GP6.8 y consulta "¿a cuánto tendría que vender la coca?", respondida con herramientas determinísticas). Solo Dueño (es información de costos, AU4.3).

GP6.18 Aceptar todos, algunos o ninguno: desde la lista o el bot, el dueño elige [Aceptar todos], [Elegir] (tilda productos) o [Ninguno]. Lo aceptado crea un ajuste de tipo "recomendación" (GP3) con la vista previa, los topes y el umbral de revisión de GP7, vigencia ahora o programada, y auditoría. En el bot: [Aceptar todos] muestra el resumen ("23 productos · +9,8% promedio · rige ahora") con [Confirmar]; si algún producto supera un tope o el umbral de revisión, o si el dueño toca [Elegir], el bot manda el link a la vista previa en la app. [Ninguno] deja todo igual y la sugerencia vuelve a aparecer con la próxima recomendación mensual.

GP6.19 Recalculo: las sugerencias se recalculan con la recomendación mensual, cuando cambia un costo (GP5.7) y cuando cambia la configuración de GP7. Cada cálculo guarda sus entradas (c, k, t, w, g, mezcla de cobros) para que sea reproducible.

### Criterios de aceptación:

☐ Con los datos del ejemplo de GP6.4, el sistema calcula 12,86% y el margen equivalente 11,39%.

☐ El cálculo con CF / CMV y con (CF / V) / (1 − g) da el mismo resultado en los tests.

☐ El 1/11 a las 09:00 recibo por el bot la recomendación de octubre con los botones [Ver detalle] [Usar como mínimo] [Poner mi valor].

☐ Cargo 25% como mínimo manual; en noviembre la recomendación cambia a 14% y el mínimo activo sigue en 25% (fuente Manual).

☐ Si borro el valor manual y toco "Usar recomendado", el activo pasa a la recomendación vigente y la auditoría registra los dos cambios.

☐ Sin alquiler cargado en el mes, la recomendación sale "parcial" con el aviso de lo que falta.

☐ Un comercio que empezó a vender el 15/9 recibe la primera recomendación el 1/11 (octubre completo).

☐ Un Empleado no recibe la recomendación ni la ve en la app.

☐ (Decisión 9/10/2026) Con los datos del ejemplo ampliado de GP6.4, CF suma $1.700.000 con sueldos y el sistema muestra 24,29% sin retiro y 40,00% con el retiro promedio de $1.100.000.

☐ Cargo un objetivo de retiro de $1.500.000 y la recomendación con retiro pasa a 45,72%; el sin retiro sigue en 24,29%.

☐ Sin retiros registrados ni objetivo cargado, las dos cifras coinciden y el detalle me pide cargar cuánto quiero llevarme por mes.

☐ Un retiro del cajón marcado "compra para el negocio" en la categoría Servicios suma a CF y no al retiro del dueño.

☐ El detalle muestra "Tus gastos son el 17% de lo que vendés" (margen) y "Necesitás cargarle 24,29% a tus costos" (markup).

☐ Con k = 40%, t = 3,5%, la mezcla de cobros del ejemplo (w = 0,85%) y g = 10%, la Coca-Cola de costo $1.000 tiene precio recomendado $1.640 (sin retiro, $1.460).

☐ Si cargo un markup mínimo manual de 50%, el precio recomendado usa 50% en lugar del recomendado.

☐ Un producto con precio cargado a mano no cambia nunca por la recomendación; un producto marcado "No recomendar precio" no aparece en la lista.

☐ En el bot toco [Aceptar todos] y [Confirmar]: se crea un solo ajuste de tipo "recomendación" con los 23 productos, en la auditoría.

☐ Toco [Elegir], tildo 5 productos y solo esos cambian; toco [Ninguno] y no cambia nada.

☐ Si un producto del lote supera el umbral de revisión, el bot no lo confirma en el chat y me manda a la vista previa en la app.

☐ Si impuestos, comisiones y ganancia deseada suman 60% o más, no se calcula y se me pide revisar la configuración.

☐ Un Empleado no ve precios recomendados ni puede consultarlos al bot.

Continúa en la Parte 2: https://docs.google.com/document/d/1QmuuttCCqfkGO26eBaZyxBhlR6XWLn1afWxJHM58nq8/edit (desde GP7. Configuración de precios y alertas).

Campo | Detalle
--- | ---
Producto | Sistema de Inventario para Kioscos y Comercios (SaaS, nombre comercial a definir)
Módulo | Gestión de Precios
Autor | Mauricio Matasini
Estado | Borrador v1
Fecha | 9 de octubre de 2026
Documentos relacionados | "PRD - Sistema de Inventario para Kioscos y Comercios" (en adelante, PRD principal: https://docs.google.com/document/d/1yqHU3xK1EYQle8J5Gag0wweTs9llCHH_X8uo4_km_AA/edit; F2.10 venta por escaneo, F3 historial inmutable, F4 alertas de stock bajo, F7 costo, precio de venta y margen, F8 roles, F10 devoluciones, F11 celular, 6.4 una base por cliente, 6.11 auditoría), "PRD - Modo Offline para Sistema de Inventario" (PRD de offline: https://docs.google.com/document/d/1NvVipeJhXBgH5oae8D2SWzpqzBLybEaQ5Tc77G03Vw4/edit; OF2.3 precio en la venta offline, OF3 catálogo local, OF8 auditoría y reloj, OF9.5 acciones sensibles solo online, OF10.7 "gana el servidor"), "PRD - Caja Digital para Sistema de Inventario" (PRD de caja: https://docs.google.com/document/d/14hdf2BbXewzSkjKE25zC8NEMJsDsy2ObI0IKBSt6u0U/edit; C3 movimientos, C5 categorías, C9 vencimientos, C14 devoluciones), "PRD - Consumos de Servicios para Sistema de Inventario" (PRD de consumos: https://docs.google.com/document/d/1LbXg794HQq7DFq7CvhDosut8wYHlpldKNhzsJg9RWqE/edit; CS2 tipos de servicio, CS5 registro en la caja), "PRD - Bot de WhatsApp para Sistema de Inventario" (PRD del bot: https://docs.google.com/document/d/1lp7TnN3MiX60OJihJdv7h_26XEAZdmyPtwjwSGEgPv8/edit; número central, B2 preferencias, B11 auditoría), "PRD - Facturas de Proveedores para Sistema de Inventario" (PRD de facturas: https://docs.google.com/document/d/1I38DsgM56HRIyXimafn9wAGPNasTfV8sA4b4Fceoo50/edit; FP8.11 actualización de costos), "PRD - Autenticación y Gestión de Usuarios para Sistema de Inventario" (PRD de autenticación: https://docs.google.com/document/d/18v4qo1sCDIfs31L1atBI3lxcaVC_2mlp9OpI4E1i2RM/edit; AU4 matriz de permisos, AU10 reautenticación), "PRD - Reportes de Rotación de Productos para Sistema de Inventario" (PRD de rotación: https://docs.google.com/document/d/1ABXzORmd9_o3oYxmBm6878l2VZufCKgrIyAXTifdPeQ/edit; RT1.3 ingresos netos, RT2.2 margen y markup realizado, RT4 baja rotación), "PRD - Ticket de Venta para Sistema de Inventario" (PRD de tickets: https://docs.google.com/document/d/1dA4AIxaHbLXS8ZoATx9Bh4fmBhXKfHA4oWnXprku4cM/edit; TV2 contenido, TV4 descuentos por línea y por ticket con prorrateo), "PRD - Notificaciones por Email para Sistema de Inventario" (https://docs.google.com/document/d/1RUZ1PY_98eE0cvmL5lL5Ij39cO0nC627I0qAgICf4W0/edit) y "Costos estimados por cliente - Sistema de Inventario" (documento de costos: https://docs.google.com/document/d/1h7YaBE-1ZcDfQxt7HWNG-qh5LEraybFIvSngqOnM1pA/edit). Todos en la misma carpeta y en borrador; si cambian, este PRD se alinea a ellos.
Relación con el PRD principal | Este documento es el lugar detallado de las funciones de precios que el PRD principal ya enuncia en F7 (costo y precio de venta, ganancia, markup manual, aumento masivo) y de la recomendación de markup del bot. No cambia esas definiciones: las amplía. Donde este PRD propone algo distinto, se marca en la sección 7.2.
Terminología | La de los documentos relacionados: comercio/tenant, base de control, roles Dueño/Empleado, movimiento de stock, movimiento compensatorio, caja, jornada, dispositivo, origen, idempotency_key, client_occurred_at, "Sistema" (actor de los jobs). Términos nuevos en el Anexo A.

# | Objetivo | Métrica
--- | --- | ---
OG1 | Remarcar rápido | Tiempo desde "Ajustar precios" hasta confirmar un ajuste general: menos de 60 segundos en el celular (mediana)
OG2 | Precios correctos en cada venta | 100% de las líneas de venta con precio aplicado y referencia al registro de precio vigente; 0 tickets cerrados modificados por un ajuste
OG3 | Trazabilidad total | 100% de los ajustes con registro en la auditoría (quién, cuándo, %, alcance, cantidad de productos)
OG4 | Margen visible | Porcentaje de productos activos con costo y precio cargados (meta: más de 80% a los 2 meses, alineado con O4 del PRD principal)
OG5 | Que el precio acompañe al costo | Porcentaje de cambios de costo en productos con markup que terminan en recálculo confirmado del precio (meta: más de 70%)
OG6 | Que la recomendación se use | Porcentaje de comercios con más de un mes de ventas que abren la recomendación mensual (meta: más de 50%)
OG7 | Precio correcto offline | Porcentaje de ventas offline cobradas con el precio vigente a su hora validada (meta: más de 98%; el resto queda marcado como diferencia)

Prioridad | Significado
--- | ---
P0 - MVP | Imprescindible para el lanzamiento
P1 - Post-MVP cercano | Dentro de los 2 a 3 meses posteriores al lanzamiento
P2 - Futuro | Según demanda

# | Funcionalidad | MVP (P0) | Más adelante (P1/P2)
--- | --- | --- | ---
GP1 | Ajuste masivo general por porcentaje | % sobre todos los precios de venta (aumento o baja), vista previa antes/después, redondeo configurable, topes y umbral de revisión, confirmación | Terminaciones "psicológicas" ($x90, $x99) (P2)
GP2 | Ajuste por categoría | Mismo flujo limitado a una o más categorías | Por proveedor (P1), por selección manual o desde la lista de baja rotación (P1), sobre el costo (P1)
GP3 | Vigencia e historial de precios | Vigencia inmediata o programada (fecha y hora), historial con valid_from/valid_to sin sobrescribir, cancelar un programado, revertir un aplicado con un ajuste nuevo | Vigencia hasta (precio temporal que vuelve solo al anterior) (P1)
GP4 | Precio aplicado en la venta y ventas offline | Precio unitario congelado en cada línea de venta; precios futuros precargados en el celular; regla del precio vigente a la hora validada; diferencias marcadas sin tocar tickets | Reporte de diferencias por dispositivo y por empleado (P1)
GP5 | Costo, precio, ganancia, markup y margen | Ganancia en $ y %, markup y margen con fórmulas, markup manual por producto que deriva el precio del costo, historial de costos, recálculo ofrecido al cambiar el costo | Recálculo automático opcional para productos con markup (P1); costo desde la factura del proveedor (P1, FP8.11)
GP6 | Recomendación de markup mínimo del bot | Cálculo mensual determinístico con costos fijos (incluidos sueldos) y CMV del mes, retiro del dueño como dato aparte (promedio registrado u objetivo) con recomendación con y sin retiro, precio recomendado por producto (costo, costos fijos, Ingresos Brutos, comisiones ponderadas y ganancia deseada) con aceptar todos/algunos/ninguno, aviso del bot, override manual del dueño, registro de cuál está activo | Markup con ganancia objetivo (P1), mínimo por categoría (P2)
GP7 | Configuración de precios y alertas | Pantalla única (botón "Configuración de precios y alertas", solo Dueño, usable desde el celular): redondeo, topes de aumento en $ y en % (por defecto + por producto, vacíos = sin tope), umbral de revisión (por defecto 20%), umbral de stock bajo por defecto y por producto (regla definida en F4 del PRD principal) | Topes y redondeo por categoría (P1)
GP8 | Auditoría de precios | Cada ajuste, cancelación, reversión, cambio de precio, costo, markup y configuración en la auditoría inmutable | Exportación PDF del historial de precios de un producto (P1)
GP9 | Integraciones | Inventario, descuentos (aviso de venta bajo costo), promociones y combos de RT12 (aviso contra el costo, sin acumulación por defecto, margen), rotación, consumos, tickets, caja, offline, roles, bot | Programar ajustes desde el bot (P1)
GP10 | Una base por cliente | Todas las tablas en la base del comercio | —
GP11 | Asesor de costos por proveedor | Captura de datos: costo por producto y proveedor (product_supplier_costs) desde facturas confirmadas y carga manual por proveedor | Comparación de proveedores, ahorro por unidad y por mes, dos opciones (bajar precio o ganar más margen), consejo en el resumen del viernes, consulta al bot y pedido con el proveedor recomendado, vista web (P1); listas de precios importadas (P2)

Concepto (mes de ejemplo) | Monto
--- | ---
Ventas netas (V) | $10.000.000
CMV | $7.000.000
Ganancia bruta (V − CMV) | $3.000.000
Margen bruto real g = 3.000.000 / 10.000.000 | 30%
Markup realizado = 3.000.000 / 7.000.000 | 42,86%
Luz | $180.000
Gas | $60.000
Tasas municipales | $70.000
ARCA (monotributo) | $90.000
Alquiler | $450.000
Servicios (agua, internet, teléfono) | $50.000
Costos fijos (CF) | $900.000

Concepto (mes de ejemplo) | Monto
--- | ---
Subtotal servicios, impuestos y alquiler (tabla anterior) | $900.000
Sueldos y adelantos (caja) | $800.000
Costos fijos (CF) | $1.700.000
Retiros del dueño registrados: julio $1.000.000, agosto $1.200.000, septiembre $1.100.000 | Promedio R = $1.100.000
Objetivo de retiro cargado por el dueño (alternativa) | R = $1.500.000

Producto (ejemplo) | Costo | Precio actual | Recomendado con retiro | Recomendado sin retiro | Estado
--- | --- | --- | --- | --- | ---
Coca-Cola 500 ml | $1.000 | $1.400 | 1.000 × 1,40 / 0,8565 = $1.634,56 → $1.640 | 1.000 × 1,2429 / 0,8565 = $1.451,14 → $1.460 | Debajo del recomendado
Alfajor | $600 | $950 | 600 × 1,40 / 0,8565 = $980,74 → $990 | 600 × 1,2429 / 0,8565 = $870,68 → $880 | Debajo del recomendado
Chocolate | $1.200 | $2.500 | 1.200 × 1,40 / 0,8565 = $1.961,47 → $1.970 | 1.200 × 1,2429 / 0,8565 = $1.741,37 → $1.750 | Por encima: no se sugiere cambio
