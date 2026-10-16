---
id: MOD-08-REPORTES-ROTACION
tipo: spec
estado: propuesto
modulos: [admin]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: |
  El dueño de un kiosco sabe "más o menos" qué se vende, pero no tiene números: compra de más lo que no sale (y
  se le vence o le inmoviliza plata) y se queda sin lo que más rota.
---
> Origen: `PRD - Reportes de Rotación de Productos para Sistema de Inventario.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/analytics`, `src/pages/api/analytics/*`, `src/db/schema-analytics.ts`

---

# PRD - Reportes de Rotación de Productos para Sistema de Inventario

Nota sobre datos externos: los costos de WhatsApp (plantillas de utilidad ~USD 0,026 por mensaje en Argentina, cupos de mensajes del bot por plan, límites de mensajería) se toman del documento "Costos estimados por cliente" y llevan [a verificar] contra las tarifas vigentes de Meta antes de implementar.

## 1. Resumen / visión general

### 1.1 Problema

El dueño de un kiosco sabe "más o menos" qué se vende, pero no tiene números: compra de más lo que no sale (y se le vence o le inmoviliza plata) y se queda sin lo que más rota. Hoy el sistema ya registra cada venta, devolución, carga y ajuste en un historial inmutable (F3 del PRD principal), pero esa información no se convierte en decisiones:

No sabe cuáles son sus productos más vendidos ni cuáles están "dormidos" en la góndola o en la heladera.

No sabe cuánto le dura el stock de cada producto ni qué conviene pedir primero cuando la plata no alcanza para todo.

No sabe cuánto gana por producto en un período (ingresos y ganancia bruta netos de devoluciones).

No tiene un criterio para decidir qué poner en promoción o en oferta para liberar plata inmovilizada.

### 1.2 Visión

Un módulo de reportes de rotación que transforma el historial de movimientos en respuestas simples, desde el celular:

Qué se vende más y qué no se vende, calculado sobre el historial inmutable y neto de devoluciones.

Métricas por producto fáciles de leer: unidades vendidas por día, semana y mes; ingresos; ganancia bruta; rotación de inventario; veces que se repuso; días de cobertura; días desde la última venta. Clasificación ABC (Pareto) como P1.

Un resumen periódico por WhatsApp y por email que destaca lo que más rota, lo que no se mueve y qué reponer primero, con acceso directo al pedido de reposición.

Un tablero de rotación (web y celular) con filtros por fechas, categoría y ubicación (góndola, heladera), ordenamiento y exportación a PDF y CSV.

Productos de baja rotación marcables para promoción o descuento, conectados con la funcionalidad de descuentos del PRD principal; el comerciante siempre confirma.

Principio: 100% operable desde el celular (F11 del PRD principal). El tablero, los filtros, la exportación, el marcado para promoción y la configuración del resumen se usan completos desde la PWA en un Android de gama media; la PC es opcional.

### 1.3 Propuesta de valor

"Sabé qué se vende, qué está dormido y qué tenés que pedir primero, sin hacer una sola cuenta."

### 1.4 Alcance del módulo

## 2. Objetivos y no-objetivos

### 2.1 Objetivos

### 2.2 No-objetivos (fuera de alcance, al menos en el MVP del módulo)

No es un pronóstico con IA: las recomendaciones son reglas deterministas (cobertura, rotación, umbrales). Un modelo de demanda con estacionalidad queda para el futuro (P2) y siempre detrás de las herramientas deterministas.

No compra solo: el sistema sugiere y prioriza; el pedido lo confirma una persona (igual que el PRD principal, F5).

No aplica descuentos solo: marcar un producto para promoción abre la funcionalidad de descuentos con una sugerencia; el comerciante confirma.

No hace arqueo ni conteo de efectivo, ni exige tomas de inventario físicas para calcular la rotación: todo sale de los movimientos registrados.

No reemplaza la contabilidad ni calcula ganancia neta (no descuenta gastos fijos, servicios, sueldos ni impuestos): reporta ganancia bruta por producto.

No consolida varios comercios en un solo reporte en el MVP (depende de "varios comercios por cuenta", AU14, P1).

No guarda ni calcula datos fuera de la base del comercio: no hay un data warehouse compartido entre clientes.

## 3. Usuarios

### 3.1 Dueño/a del comercio (rol Dueño)

Perfil: el mismo del PRD principal (3.1). Mira los números desde el celular, en general a la noche o el fin de semana.

Necesidades: saber qué se vende y qué no, cuánto gana por producto, qué pedir primero y qué liquidar.

Permisos: ve todo el módulo, incluidos ingresos y ganancia bruta, valorización a costo, clasificación ABC por ingresos o ganancia, exportaciones y configuración de umbrales y del resumen periódico.

### 3.2 Empleado/a (rol Empleado)

Perfil: el del PRD principal (3.2): atiende el mostrador y repone góndola y heladera.

### Permisos, según la matriz AU4 del PRD de autenticación:

Por defecto no accede al tablero de rotación: es un permiso ⚙️ que el Dueño puede habilitar (ver 4.16, ajuste propuesto al PRD de autenticación).

Con el permiso habilitado, ve solo métricas en unidades: unidades vendidas, rotación, veces repuesto, días de cobertura, días desde la última venta y la marca de baja rotación, filtrables por ubicación (útil para reponer "Heladera A").

Nunca ve ingresos, ganancia bruta, costos, markup, valorización ni la clasificación ABC por ingresos o ganancia (🔒, no delegable en el MVP, igual que AU4.3 y AU4.5). Los campos financieros se filtran en el servidor, no en el cliente.

No exporta reportes (🔒), no cambia umbrales ni la configuración del resumen y no marca productos para promoción.

Recibe el resumen periódico solo si el Dueño lo activa (igual que el resumen del viernes en AU4), y en ese caso en la versión en unidades, sin datos financieros.

### 3.3 Administrador de la plataforma (equipo propio)

No ve reportes de ningún comercio salvo soporte con consentimiento y acceso auditado (6.4 del PRD principal), de solo lectura. En el Control Plane ve métricas técnicas del módulo (duración de los jobs de agregados, consumo de plantillas en whatsapp_usage, errores de conciliación), nunca datos comerciales.

## 4. Funcionalidades

### 4.0 Priorización

### RT1. Ranking de más y menos vendidos (P0)

Descripción: listas de los productos que más y que menos se venden en un período, calculadas solo a partir del historial inmutable de movimientos (F3 del PRD principal) y netas de devoluciones (F10).

### Requerimientos:

RT1.1 Fuente única: los rankings se calculan sobre stock_movements, directamente o a través de los agregados diarios de 6.2, que se derivan de él. No existe otra fuente de ventas: si no está en el historial, no cuenta.

RT1.2 Unidades vendidas netas de un producto en un período = Σ cantidades de los movimientos egreso_venta − Σ cantidades de los movimientos devolucion del producto − Σ unidades corregidas por compensatorios de ventas (movimientos compensatorio cuyo corrige_movimiento_id apunta a un egreso_venta).

Una devolución no apta para venta (F10.4) también descuenta de las unidades vendidas (el cliente devolvió el producto); la merma asociada se informa aparte como "mermas por devolución", no como venta.

Las devoluciones y los compensatorios se imputan al día en que se registran (no al día de la venta original), para que los totales de un período cerrado no cambien retroactivamente. La ficha muestra "vendidas" y "devueltas" por separado.

Roturas, vencimientos, consumo interno, ajustes manuales y cargas no son ventas y no entran en el ranking.

RT1.3 Ingresos netos = Σ importe de los egreso_venta − Σ importe_reintegrado de las devoluciones del período, con los valores congelados de cada venta (incluidos descuentos y precios editados). Ganancia bruta neta = Σ ganancia de las ventas − Σ ganancia_revertida de las devoluciones (F10.5).

RT1.4 Rankings disponibles: "Más vendidos" y "Menos vendidos", ordenables por unidades netas (por defecto), ingresos netos o ganancia bruta neta (estas dos, solo para el Dueño).

RT1.5 Menos vendidos considera solo productos activos (no archivados) con stock mayor a 0 al final del período. Los productos con 0 ventas aparecen primero ("0 u."), ordenados por valorización a costo descendente (Dueño) o por días sin venta (Empleado). Un producto sin stock y sin ventas no aparece como "menos vendido" (no había nada para vender).

RT1.6 Productos nuevos: un producto creado dentro del período se evalúa solo desde su fecha de alta y se marca "Nuevo (desde el 3/10)"; no se considera de baja rotación hasta cumplir el mínimo de historia (6.6).

RT1.7 Tamaño de las listas: top 10 en la vista resumida y en el bot (paginado de a 10, como B13); lista completa paginada por cursor en el tablero.

RT1.8 Desempate determinista: a igual valor, se ordena por ingresos netos, luego por nombre y luego por product_id, para que dos consultas iguales devuelvan siempre el mismo orden.

RT1.9 Siempre en unidades: las ventas por código de caja (multiplicador en product_codes) ya se registran en unidades en el movimiento; el ranking se expresa en unidades del producto.

### Criterios de aceptación:

☐ En una semana vendí 84 Coca-Cola 500 ml y me devolvieron 1: el ranking muestra 83 unidades netas, con el detalle "84 vendidas, 1 devuelta".

☐ Una devolución "no apta" (envase roto) baja las unidades netas en 1 y aparece en "mermas por devolución", no como venta.

☐ Una rotura de 2 unidades no cambia las unidades vendidas ni el ranking.

☐ Corrijo con un compensatorio una venta mal registrada de 5 unidades (era 1): el ranking cuenta 1 unidad por esa venta.

☐ La suma de unidades netas de todos los productos de un día coincide con la suma de egreso_venta menos devolucion menos compensatorios de venta de ese día en el historial (test de conciliación).

☐ Ingresos y ganancia netos del ranking coinciden con los totales netos de ventas del PRD principal (F10.5) para el mismo período.

☐ Una devolución registrada el 10/10 de una venta del 7/10 no cambia el total de la semana del 1 al 7/10 y sí descuenta en la del 8 al 14/10.

☐ Como Empleado con permiso solo puedo ordenar por unidades; la API no devuelve ingresos ni ganancia (test de contrato).

☐ Dos consultas consecutivas del mismo ranking con los mismos filtros devuelven exactamente el mismo orden.

### RT2. Métricas por producto (P0)

Descripción: cada producto tiene un conjunto fijo de métricas, calculadas con fórmulas deterministas sobre el historial de movimientos, para el período elegido (por defecto, últimos 30 días). Cada fórmula se puede ver en la app con un "¿Cómo se calcula?" en lenguaje simple.

Definiciones base (para un producto y un período de D días calendario, en la zona horaria del comercio, America/Argentina/Buenos_Aires):

Día del movimiento: fecha local del movimiento. Para movimientos hechos offline se usa client_occurred_at si existe y está dentro de una tolerancia (por defecto, hasta 72 h antes de created_at); si no, el created_at del servidor (ver 6.3).

Stock al cierre de un día: stock_resultante del último movimiento del producto hasta el final de ese día (equivale a la suma de todos sus movimientos hasta ese momento, F3.9). Si ese día no tuvo movimientos, se arrastra el stock del cierre anterior.

D efectivo: días del período desde la fecha de alta del producto (si se creó dentro del período) hasta el último día del período (o hoy, si el período incluye el día actual).

### Requerimientos (fórmulas):

RT2.1 Unidades vendidas netas (RT1.2), mostradas como:

Por día (promedio) = unidades netas / D efectivo.

Por semana (promedio) = unidades netas / D efectivo × 7.

Por mes (promedio) = unidades netas / D efectivo × 30.

Además, totales por día, por semana calendario (lunes a domingo) y por mes calendario en la ficha del producto (serie temporal).

RT2.2 Ingresos netos y ganancia bruta neta del período (RT1.3), con margen bruto del período = ganancia bruta neta / ingresos netos y markup realizado = ganancia bruta neta / (ingresos netos − ganancia bruta neta), es decir, sobre el costo de lo vendido. Ambos usan los valores congelados de cada venta (precio con descuento aplicado y costo al momento de la venta), no los vigentes. Solo Dueño.

RT2.3 Stock promedio del período = promedio simple del stock al cierre de cada día del período:

### Stock promedio = (Σ stock al cierre del día d, para d = 1 … D) / D

Se calcula desde los movimientos, no desde una foto del stock (ver 6.4). No se usa la fórmula simplificada (stock inicial + stock final) / 2 porque, en productos que se reponen varias veces en el período, distorsiona mucho el resultado (ver el ejemplo).

RT2.4 Rotación de inventario (veces en el período):

### Rotación = unidades vendidas netas del período / stock promedio del período

Se lee como "cuántas veces se vendió el equivalente al stock promedio en el período". Si el stock promedio es 0 (sin stock todo el período), se muestra "n/d (sin stock en el período)" y, si el producto tuvo ventas en el período anterior, se marca para revisión.

RT2.5 Veces repuesto en el período:

### Veces repuesto = cantidad de eventos de reposición del producto en el período

Un evento de reposición es: (a) cada recepción de pedido distinta (ingreso_pedido, contada una vez por pedido aunque tenga varias líneas del mismo producto), o (b) cada día con al menos una carga manual de ingreso (ingreso), agrupando todas las cargas del mismo día como un solo evento. No cuentan como reposición: devoluciones de clientes, ajustes manuales positivos, compensatorios ni el stock inicial del alta. Se muestra junto con las unidades ingresadas en el período.

RT2.6 Días de cobertura:

### Cobertura (días) = stock actual / venta promedio diaria

donde venta promedio diaria = unidades netas de los últimos 28 días / D efectivo de esa ventana (ventana configurable por comercio: 14, 28 o 56 días, independiente del período del tablero para que la cobertura no cambie al mover el filtro de fechas). Se redondea a 1 decimal. Si la venta promedio diaria es 0, se muestra "∞ (sin ventas en 28 días)"; si el stock es 0, la cobertura es 0.

RT2.7 Días desde la última venta = fecha de hoy − fecha local del último egreso_venta del producto, en días enteros. Si nunca se vendió: "Nunca vendido (alta hace N días)". Si la última venta se devolvió completa, se sigue contando desde esa venta (regla simple y verificable; la ficha muestra el detalle).

RT2.8 Valorización del stock a costo y a precio de venta (F7.5) junto a las métricas, para ver la plata inmovilizada (solo Dueño).

RT2.9 Pocos datos: si el producto tiene menos de 7 días de historia o menos de 3 ventas en la ventana de cobertura, rotación y cobertura se muestran con la etiqueta "pocos datos" y el producto no entra en recomendaciones de reposición ni en baja rotación (ver 6.6).

RT2.10 (P1) Venta diaria ajustada por días con stock: opción de calcular la venta promedio diaria solo sobre los días en que el producto tuvo stock mayor a 0 en algún momento del día, para no subestimar la demanda de productos que estuvieron agotados.

### Ejemplo resuelto (Coca-Cola 500 ml, del 1/10 al 7/10, D = 7 días, precio $1.400, costo $1.000):

Stock al cierre del 30/9: 24 unidades.

Unidades vendidas netas = 84 − 1 = 83.

Promedios: 83 / 7 = 11,86 u. por día; 11,86 × 7 = 83 u. por semana; 11,86 × 30 ≈ 355,7 u. por mes.

Stock promedio = 188 / 7 = 26,86 u.

Rotación = 83 / 26,86 = 3,09 veces en la semana. Con la fórmula simplificada, (24 + 13) / 2 = 18,5 y la rotación daría 4,49: una sobreestimación del 45%. Por eso se usa el promedio de los cierres diarios.

Veces repuesto = 2 (recepción del pedido #42 el 2/10 y carga manual del 6/10), con 72 unidades ingresadas.

Ingresos netos = 84 × $1.400 − 1 × $1.400 = $116.200. Ganancia bruta neta = 83 × ($1.400 − $1.000) = $33.200. Margen bruto 28,6%; markup realizado 40%.

Cobertura al 7/10 (suponiendo que la venta promedio de los últimos 28 días es igual a la de la semana, 11,86 u./día) = 13 / 11,86 = 1,1 días: rotación alta y cobertura baja → reponer primero (RT5).

Días desde la última venta = 0 (vendió hoy).

Ejemplo de baja rotación (Shampoo sachet 10 ml, últimos 30 días): 0 ventas y stock 30 todo el período. Stock promedio = 30; rotación = 0 / 30 = 0; veces repuesto = 0; cobertura = ∞; días desde la última venta = 47 → marcado como baja rotación (RT4).

### Criterios de aceptación:

☐ Con los movimientos del ejemplo, la ficha de la Coca-Cola 500 ml del 1/10 al 7/10 muestra exactamente: 83 u. netas, 11,86 u./día, stock promedio 26,86, rotación 3,09, veces repuesto 2, ingresos $116.200 y ganancia bruta $33.200.

☐ El "¿Cómo se calcula?" de la rotación muestra la fórmula y los números usados (83 / 26,86).

☐ Tres cargas manuales del mismo producto el mismo día cuentan como 1 vez repuesto; dos pedidos distintos recibidos el mismo día cuentan como 2.

☐ Una devolución de cliente o un ajuste positivo no suman "veces repuesto".

☐ Un producto con stock 0 todo el período muestra rotación "n/d (sin stock en el período)", no un error.

☐ Un producto sin ventas en 28 días muestra cobertura "∞ (sin ventas en 28 días)".

☐ Cambiar el filtro de fechas del tablero no cambia la cobertura; cambiar la ventana a 14 días en la configuración sí.

☐ Un producto creado el 3/10 calcula sus promedios del período 1–7/10 sobre 5 días y muestra "Nuevo (desde el 3/10)".

☐ El stock al cierre de cualquier día usado en el cálculo coincide con el "stock al momento" de "Ver trazabilidad" (F3.10) al final de ese día.

☐ Un Empleado con permiso ve unidades, rotación, veces repuesto, cobertura y días desde la última venta, pero no ingresos, ganancia, margen, markup ni valorización.

☐ Un producto con 2 ventas en la ventana muestra "pocos datos" y no aparece en recomendaciones ni en baja rotación.

### RT3. Clasificación ABC (Pareto) (P1)

Descripción: clasificación de los productos según su peso en las ventas del período, para que el dueño sepa cuáles son los pocos productos que explican la mayor parte de su negocio.

### Requerimientos:

RT3.1 Criterio configurable: ingresos netos (por defecto), ganancia bruta neta o unidades netas. Los dos primeros, solo para el Dueño; el Empleado con permiso ve la clasificación por unidades.

RT3.2 Cálculo: se ordenan los productos con ventas netas positivas de mayor a menor según el criterio, se calcula el porcentaje acumulado sobre el total y se asigna:

A: productos cuyo acumulado llega hasta el 80% (incluido el producto que cruza el 80%).

B: los siguientes, hasta el 95%.

C: el resto de los productos con ventas.

Sin ventas: productos activos con stock y sin ventas netas en el período (clase aparte, no C). Los cortes (80/95) son configurables por comercio.

RT3.3 Período por defecto: últimos 90 días; se muestra solo si el comercio tiene al menos 30 días de ventas (si no, "se necesitan al menos 30 días de ventas").

RT3.4 La clase se muestra en el tablero (columna y filtro) y en la ficha del producto, y se usa en las recomendaciones (RT5.2 y RT5.3).

RT3.5 Se recalcula en el job nocturno (6.2) para el período estándar y bajo demanda para períodos personalizados.

### Criterios de aceptación:

☐ Con 1.000 productos con ventas, el tablero muestra cuántos son A, B y C y qué porcentaje de los ingresos explica cada clase (por ejemplo, "A: 142 productos, 80% de los ingresos").

☐ El producto que cruza el 80% acumulado queda en A.

☐ Un producto con stock y sin ventas aparece como "Sin ventas", no como C.

☐ Cambio el criterio a "ganancia bruta" y la clasificación se recalcula; como Empleado no veo esa opción.

☐ Un comercio con 20 días de historia ve "se necesitan al menos 30 días de ventas" en lugar de la clasificación.

### RT4. Productos de baja rotación (P0)

Descripción: el sistema marca como baja rotación ("producto dormido") a los productos que cumplen umbrales configurables, para que el dueño decida qué hacer (promoción, descuento, dejar de comprarlo).

### Requerimientos:

RT4.1 Reglas configurables por comercio (se marca si se cumple cualquiera de las activas):

Sin ventas en N días: días desde la última venta ≥ N (por defecto, 30) y stock > 0.

Cobertura mayor a X días: cobertura ≥ X (por defecto, 60) y stock > 0.

(Opcional) Rotación menor a R en los últimos 30 días (desactivada por defecto).

RT4.2 Exclusiones: productos con "pocos datos" (RT2.9), con stock 0, archivados o marcados por el dueño como "Excluir de baja rotación" (por ejemplo, un artículo que se vende poco pero tiene que estar).

RT4.3 La marca se recalcula en el job nocturno (6.2) y se muestra en el tablero (pestaña "Dormidos" y filtro), en la ficha del producto ("Dormido: 47 días sin ventas · 30 u. · $7.500 a costo") y en el resumen periódico (RT6).

RT4.4 Para el Dueño se informa la plata inmovilizada = stock actual × costo unitario vigente, por producto y total.

RT4.5 (P1) Umbrales por categoría (por ejemplo, cigarrillos y gaseosas con N = 7; librería con N = 90).

### Criterios de aceptación:

☐ Con N = 30, un producto con stock 30 y última venta hace 47 días aparece como baja rotación con el motivo "47 días sin ventas".

☐ Con X = 60, un producto con stock 120 y venta promedio de 1,5 u./día (cobertura 80 días) aparece con el motivo "cobertura 80 días".

☐ Un producto sin stock nunca aparece como baja rotación.

☐ Marco un producto "Excluir de baja rotación" y deja de aparecer en la lista y en el resumen; el cambio queda en el audit_log.

☐ Cambio N de 30 a 15 y, al día siguiente (o al tocar "Recalcular"), la lista refleja el nuevo umbral.

☐ Como Dueño veo el total de plata inmovilizada de la lista; como Empleado, no.

### RT5. Recomendaciones de reposición: qué reponer primero (P0)

Descripción: lista priorizada y determinista de los productos que conviene reponer primero, combinando cobertura baja y rotación alta, integrada con los pedidos de reposición (F5) y la lista del viernes del bot (B6).

### Requerimientos:

RT5.1 Candidatos: productos activos, con venta promedio diaria > 0 y sin "pocos datos", que cumplen cobertura ≤ C días (por defecto C = 7, configurable) o están en alerta de stock bajo (stock ≤ umbral, F4).

RT5.2 Rotación alta: un candidato es de rotación alta si está en el tercio superior de venta promedio diaria entre los productos con ventas del comercio (o en clase A, cuando RT3 esté disponible).

RT5.3 Orden de prioridad (determinista):

Primero los de rotación alta, después el resto.

Dentro de cada grupo, menor cobertura primero (los sin stock, cobertura 0, al principio).

A igual cobertura, mayor venta promedio diaria.

Desempate: clase ABC (P1), nombre y product_id. Cada recomendación muestra su motivo en una línea: "Cobertura 1,1 días · vende 11,9 u./día · stock 13".

RT5.4 Cobertura frente a la visita del proveedor: si el proveedor tiene días de visita cargados (F6.1), se marca "No llega a la próxima visita (jueves)" cuando la cobertura es menor a los días que faltan para esa visita; esos productos suben al principio de su grupo.

RT5.5 Acciones desde cada recomendación (tablero, ficha o resumen del bot):

"Agregar al pedido": agrega el producto al pedido en borrador de su proveedor (crea uno si no existe) con la cantidad sugerida de F5.4 (MVP). No se confirma ni se envía nada: el pedido sigue el flujo de F5 y B7/B8, con su confirmación explícita.

"Guardar para el viernes": lo agrega a la lista del viernes (B6.2) sin duplicarlo.

Acción masiva "Agregar los 10 primeros al pedido", agrupando por proveedor.

RT5.6 (P1) Cantidad sugerida por cobertura objetivo: cantidad = máx(0, ⌈venta promedio diaria × días objetivo − stock actual⌉), con días objetivo = días hasta la próxima visita del proveedor + días de seguridad (por defecto 3), redondeada hacia arriba a cajas enteras si el producto se pide por caja (F5.3). Se muestra al lado de la sugerida por F5.4 y el usuario elige. Se propone adelantar a P1 la "sugerencia de cantidades" que el PRD principal tiene como P2 (ver 4.16).

RT5.7 La lista usa el mismo ranking que el "qué se está acabando" del bot (B13.4), para que la web y el bot nunca se contradigan: este PRD fija las fórmulas de cobertura y venta diaria que B13.4 deja "a calibrar".

RT5.8 El Empleado con acceso al tablero ve las recomendaciones (en unidades) y puede agregarlas a un borrador (permitido en AU4: "Armar o editar un borrador de pedido"); confirmar y enviar sigue requiriendo el rol Dueño o el permiso ⚙️ correspondiente.

### Criterios de aceptación:

☐ Con la Coca-Cola 500 ml en cobertura 1,1 días y rotación alta, y un alfajor en cobertura 5 días y rotación baja, la Coca-Cola aparece antes que el alfajor.

☐ Un producto sin stock y con ventas diarias altas aparece primero de todo.

☐ Un producto sin ventas en 28 días nunca aparece en "Reponer primero", aunque esté en alerta de stock bajo (aparece en las alertas de F4, no acá).

☐ Toco "Agregar al pedido" en la Coca-Cola y queda en el borrador del pedido a su proveedor con la cantidad sugerida; si ya estaba, no se duplica.

☐ Toco "Agregar los 10 primeros al pedido" y se crean o actualizan los borradores de cada proveedor involucrado; ningún pedido se envía sin confirmación.

☐ Con un proveedor que visita los jueves y hoy lunes, un producto con cobertura 2 días aparece marcado "No llega a la próxima visita (jueves)".

☐ "Reponer primero" en la web y la respuesta del bot a "qué se está acabando" muestran el mismo orden para los mismos datos.

☐ (P1) Con venta diaria 11,86, días objetivo 6 y stock 13, la cantidad sugerida es ⌈71,16 − 13⌉ = 59 u.; si se pide por caja de 12, sugiere 5 cajas (60 u.).

### RT6. Resumen periódico de rotación por WhatsApp y email (P0)

Descripción: el bot de WhatsApp (número central de la plataforma) y el email envían un resumen periódico con lo que más rota, lo que no se mueve y qué reponer primero, con botones para actuar. Es una notificación clave: según el PRD de Notificaciones por Email, cuando está activada se envía por los dos canales (WhatsApp y email).

### Requerimientos:

RT6.1 Frecuencia configurable por el Dueño: semanal (por defecto), quincenal o mensual, con día y hora (por defecto, viernes 18:00, hora del comercio). Activar o desactivar el resumen aplica a los dos canales.

RT6.2 Integrado al resumen del viernes (B9), por defecto: con frecuencia semanal y el mismo día y hora que el resumen del viernes, la parte de rotación se incorpora al resumen del viernes (la plantilla de B9 se amplía) en lugar de enviarse como plantilla aparte, así no se agrega ninguna plantilla paga. Si el Dueño elige otro día u otra frecuencia, o desactiva el resumen del viernes, el de rotación sale como plantilla propia.

RT6.3 Contenido (texto corto, un solo mensaje):

Período y nombre del comercio.

Top 3 más vendidos (unidades netas) y, para el Dueño, ingresos netos y ganancia bruta del período.

Reponer primero: los 3 primeros de RT5 con su cobertura.

Baja rotación: cantidad de productos dormidos y, para el Dueño, plata inmovilizada total.

Botones de respuesta rápida: "Reponer primero" (lista de RT5 paginada de a 10, con "Agregar al pedido"), "Ver dormidos" (lista de RT4 con "Marcar para promoción") y "Ver tablero" (link a la PWA) [a verificar límites de botones por plantilla].

RT6.4 Email: el mismo contenido con más detalle (top 10 más vendidos, top 10 para reponer, top 10 dormidos), tablas simples y links al tablero con los filtros aplicados, enviado por el proveedor transaccional del PRD principal (6.7) con el formato del PRD de Notificaciones por Email. El email no tiene costo por mensaje.

RT6.5 Mismo snapshot en los dos canales: el job genera un único snapshot (evento resumen_rotacion) que consumen el bot y el servicio de email, como el resumen de cierre de la Caja Digital; los números son idénticos en WhatsApp, email y tablero para ese período.

RT6.6 Destinatarios: el Dueño (con opt-in de WhatsApp según B2) y los empleados que el Dueño active (versión sin datos financieros, AU4). Sin opt-in de WhatsApp, solo email. Si el envío por WhatsApp falla, queda registrado y el email sale igual (B5.6).

RT6.7 Costo y cupos (visibles en la configuración):

Cada resumen enviado por WhatsApp como plantilla propia es una plantilla de utilidad paga, ~USD 0,026 por mensaje en Argentina [a verificar], que se cobra incluso dentro de la ventana de 24 h. Semanal ≈ 4,3 plantillas por destinatario por mes (≈ USD 0,11); quincenal ≈ 2; mensual, 1. Integrado al resumen del viernes: 0 plantillas adicionales.

Las respuestas a los botones ("Reponer primero", "Ver más") son mensajes de servicio (~USD 0,026 cada uno una vez agotado el cupo gratis compartido del número central) y consumen el cupo de mensajes del bot del plan del comercio. Por eso las listas largas y el detalle se llevan al tablero (PWA, sin costo por mensaje) con "Ver tablero".

Las plantillas fuera de ventana cuentan contra el límite de mensajería (usuarios únicos por 24 h del portfolio); los envíos se reparten en el tiempo entre comercios (6.6 del PRD del bot).

El consumo se registra en whatsapp_usage (base de control) con la categoría "resumen de rotación".

RT6.8 Contenido transaccional: la plantilla informa el estado del inventario del propio comercio, sin promociones de la plataforma, para que Meta la acepte como utilidad [a verificar categorización]. "Ver dormidos" le sugiere al comerciante acciones sobre su propio stock; el texto evita lenguaje de marketing.

RT6.9 Sin ventas en el período: se envía igual con "No hay ventas registradas en este período" y las listas de reposición y dormidos si las hay (como B9). El Dueño puede elegir "No enviar si no hay ventas" para ahorrar plantillas.

RT6.10 El cálculo es 100% determinista (consultas sobre los agregados de 6.2) y el texto sale de una plantilla fija: no se genera texto con IA.

### Ejemplo (plantilla, texto tentativo a aprobar):

Rotación de Kiosco La Esquina (1 al 7/10)

Más vendidos: Coca-Cola 500 ml (83), Alfajor Jorgito (71), Beldent (64).

Reponer primero: Coca-Cola 500 ml (1,1 días), Marlboro box (1,5 días), Agua 500 ml (2 días).

Dormidos: 18 productos ($96.400 inmovilizados).

[Reponer primero]  [Ver dormidos]  [Ver tablero]



### Criterios de aceptación:

☐ Con el resumen semanal de rotación el viernes 18:00 y el resumen del viernes activo, recibo un solo mensaje de WhatsApp con las dos partes y whatsapp_usage registra una sola plantilla.

☐ Cambio el resumen de rotación a mensual (día 1, 9:00) y recibo una plantilla aparte ese día; la configuración me muestra "Costo aprox.: 1 plantilla paga por mes por destinatario (~USD 0,026)".

☐ Con el resumen activado, lo recibo por WhatsApp y por email con los mismos números; si lo desactivo, no llega por ninguno de los dos.

☐ Los números del resumen coinciden con los del tablero para el mismo período sin filtros.

☐ Toco "Reponer primero", veo los 10 primeros con "Agregar al pedido" y, al tocarlo, el producto queda en el borrador de su proveedor.

☐ Un empleado con el resumen activado recibe la versión sin ingresos, ganancia ni plata inmovilizada.

☐ Si mi número no tiene opt-in de WhatsApp, recibo solo el email.

☐ Si el envío por WhatsApp falla, queda registrado y el email sale igual.

☐ Ningún mensaje del resumen supera los límites de largo de WhatsApp con un catálogo de 8.000 productos (texto acotado a top 3).

### RT7. Tablero de rotación (web y celular) (P0)

Descripción: pantalla "Reportes → Rotación" de la PWA, diseñada primero para el celular (360 px), con indicadores, rankings, recomendaciones y la lista completa de productos con sus métricas.

### Requerimientos:

RT7.1 Indicadores del período (Dueño): unidades netas, ingresos netos, ganancia bruta, productos con ventas, productos dormidos y plata inmovilizada, cantidad de "reponer primero". El Empleado con permiso ve solo los indicadores en unidades.

RT7.2 Pestañas: "Más vendidos", "Menos vendidos", "Reponer primero", "Dormidos" y "Todos"; en P1, "ABC".

RT7.3 Filtros:

Rango de fechas: atajos (Hoy, Últimos 7 días, Últimos 30 días, Este mes, Mes anterior) y rango personalizado (máximo 13 meses), en la zona horaria del comercio.

Categoría (una o varias).

Ubicación (F9): una o varias ubicaciones con nombre propio, por ejemplo "Góndola B" o "Heladera A", más "Sin ubicación". Se usa la ubicación actual del producto (aclarado en pantalla); en el MVP no se reparten ventas según ubicaciones anteriores.

(P1) Proveedor, clase ABC, solo productos con stock.

Los filtros se combinan y se guardan en la URL (para compartir el link y para los links del resumen).

RT7.4 Ordenamiento por cualquier columna: unidades netas, ingresos, ganancia, rotación, veces repuesto, cobertura, días desde la última venta, stock y plata inmovilizada (las financieras, solo Dueño), ascendente o descendente, con desempate determinista (RT1.8).

RT7.5 Vista celular: cada producto como tarjeta (foto, nombre, ubicación, unidades netas, rotación, cobertura con semáforo, días sin venta y, para el Dueño, ganancia); orden y filtros en una hoja inferior (bottom sheet); paginación por cursor con scroll infinito (50 por página). En PC, tabla con columnas.

RT7.6 Ficha de rotación del producto: sus métricas del período (RT2), serie diaria/semanal de unidades vendidas y de stock al cierre, eventos de reposición, precio y markup vigentes (Dueño) y botones "Ver trazabilidad" (F3.10), "Agregar al pedido" (RT5) y "Marcar para promoción" (RT9).

RT7.7 Actualidad de los datos: el tablero muestra "Datos actualizados: 9/10 19:15" (hora del comercio); el día actual se calcula en vivo y los días cerrados salen de los agregados (6.2).

RT7.8 Explicaciones: cada métrica tiene un "?" que abre la fórmula en lenguaje simple y, en la ficha, con los números del producto.

RT7.9 Disponibilidad por plan: el módulo se ofrece en los planes que incluyan reportes según el modelo de negocio del PRD principal (Pro; a validar si el Básico tiene una versión reducida, ver 7.2).

### Criterios de aceptación:

☐ En un Android de gama media con 4G y 8.000 productos, abro "Rotación" con "Últimos 30 días" y veo indicadores y la primera página de "Más vendidos" en menos de 2 segundos (p95).

☐ Filtro "Heladera A" + categoría "Bebidas" + "Últimos 7 días" y veo solo esos productos, con los indicadores recalculados para el filtro.

☐ Ordeno "Todos" por cobertura ascendente y veo primero los productos sin stock que tienen ventas.

☐ Ordeno por "días desde la última venta" descendente y veo primero los más dormidos.

☐ Copio el link con los filtros, lo abro en otro dispositivo con mi usuario y veo los mismos filtros.

☐ Todo el tablero se usa en 360 px de ancho sin scroll horizontal ni funciones "solo web".

☐ Como Empleado sin permiso no veo "Reportes → Rotación" y la API devuelve 403; con permiso, no veo columnas financieras ni puedo ordenar por ellas.

☐ Desde la ficha de un producto toco "Ver trazabilidad" y llego a su línea de tiempo filtrada por el mismo período.

### RT8. Exportación a PDF y CSV (P0)

Descripción: exportar lo que se ve en el tablero (pestaña, filtros y orden aplicados) a CSV y a PDF, para guardar, imprimir o compartir.

### Requerimientos:

RT8.1 CSV (UTF-8 con BOM, separador configurable "," o ";" para Excel en castellano): una fila por producto con todas las métricas visibles para el usuario; período, filtros, fecha de generación y usuario en las primeras filas; números sin separador de miles.

RT8.2 PDF: nombre del comercio (y CUIT si está cargado), título del reporte, período y filtros aplicados, fecha y hora de generación (America/Argentina/Buenos_Aires) y quién lo generó, indicadores, la lista paginada ("página 3 de 12"), una sección "Cómo se calculan las métricas" con las fórmulas de RT2 y un identificador único del reporte.

RT8.3 Generación en el servidor con el mismo mecanismo que F3.12 (worker de la cola de jobs, snapshot consistente REPEATABLE READ, lectura por cursor en lotes): sincrónica para listas chicas (por ejemplo, menos de 2.000 productos) y en segundo plano, con aviso al terminar, para las grandes.

RT8.4 Compartir desde el celular con el menú nativo del teléfono (WhatsApp, email, Drive), como F11.6.

RT8.5 Permisos y auditoría: solo el Dueño exporta (🔒 en el MVP, en línea con AU4 para exportaciones con datos financieros). Cada exportación queda en el audit_log (quién, cuándo, formato, filtros) y en una tabla de exportaciones (report_exports, análoga a history_exports).

RT8.6 Los totales del PDF y del CSV coinciden con los del tablero para los mismos filtros.

### Criterios de aceptación:

☐ Exporto a CSV la pestaña "Todos" con "Heladera A" y "Últimos 30 días", lo abro en Excel en castellano y las columnas y números se leen bien (sin caracteres rotos).

☐ Exporto a PDF "Más vendidos" del mes anterior desde el celular y lo comparto por WhatsApp; el PDF muestra comercio, período, filtros, fecha y hora de generación, mi usuario y las fórmulas.

☐ Exporto la lista completa de 8.000 productos a PDF y recibo el aviso cuando está listo, sin que la app se cuelgue.

☐ Los totales del PDF coinciden con los indicadores del tablero.

☐ Como Empleado no veo la opción de exportar y la API responde 403; el intento queda registrado.

☐ Cada exportación aparece en el audit_log con usuario, fecha y hora, formato y filtros.

### RT9. Marcado para promoción o descuento (P0)

Descripción: los productos de baja rotación (RT4) se pueden marcar para promoción y, desde ahí, abrir la funcionalidad de descuentos del PRD principal (sección de costo, precio, markup y descuentos, en edición) con una sugerencia calculada. El comerciante siempre confirma: nada se aplica solo.

### Requerimientos:

RT9.1 Marcar para promoción desde el tablero (individual o masivo), la ficha del producto o el botón "Ver dormidos" del resumen. La marca guarda producto, motivo (regla de RT4 que se cumplió, con sus valores), usuario, fecha y hora del servidor y origen (web, app móvil, bot), y queda en el audit_log append-only.

RT9.2 "Crear descuento" abre el formulario de descuentos del PRD principal precargado con el producto (o la selección) y una sugerencia determinista:

Descuento sugerido configurable; por defecto 10%, 15% o 20% según la antigüedad sin ventas (30–59, 60–89 y 90 días o más).

Nunca por debajo del costo: precio con descuento ≥ costo unitario × (1 + markup mínimo configurable, por defecto 0%). Si el descuento sugerido rompe ese piso, se recorta y se avisa.

Muestra el markup y el margen resultantes y la ganancia por unidad con el descuento (fórmulas de F7.2), y la plata que se recuperaría vendiendo el stock actual a ese precio.

RT9.3 Confirmación del comerciante: el descuento solo se crea al tocar "Confirmar" en la funcionalidad de descuentos; el tipo (porcentaje, precio promocional, 2×1, vigencia) lo define el PRD principal. Sin confirmación, el producto queda solo "marcado para promoción".

RT9.4 Estado visible: el producto muestra "Marcado para promoción" o "En promoción hasta el 20/10" en el tablero y la ficha; se puede desmarcar (queda registrado).

RT9.5 Ventas con descuento: guardan el precio con descuento congelado (F3.1), así que ingresos y ganancia de RT2 ya reflejan el descuento, sin cálculos aparte.

RT9.6 (P1) Efecto de la promoción: comparación de unidades por día y ganancia bruta antes (mismo número de días previos) y durante la promoción, con aviso al terminar la vigencia ("Shampoo sachet: vendiste 22 u. con 15% off; quedan 8").

RT9.7 Permisos: marcar y crear descuentos es del Dueño (precios 🔒 en AU4). El Empleado con acceso al tablero ve la marca, pero no la crea.

RT9.8 Mientras la funcionalidad de descuentos no esté disponible, "Crear descuento" ofrece "Cambiar precio de venta" (F7) con la misma sugerencia y el mismo piso de costo, y la marca queda guardada.

### Criterios de aceptación:

☐ En "Dormidos" selecciono 5 productos, toco "Marcar para promoción" y quedan marcados, con el motivo y mi usuario en el audit_log.

☐ En el Shampoo sachet (47 días sin ventas, costo $250, precio $400) toco "Crear descuento" y el sistema sugiere 10%: precio $360, ganancia $110 por unidad y markup 44%; el descuento se crea solo cuando toco "Confirmar".

☐ Si el costo es $380 y el precio $400, el sistema no sugiere un descuento que deje el precio por debajo de $380 y me explica por qué.

☐ Desde "Ver dormidos" en el resumen de WhatsApp marco un producto para promoción y el bot me devuelve el link para crear el descuento en la app.

☐ Desmarco un producto y el cambio queda registrado.

☐ Un empleado no puede marcar productos ni crear descuentos; la API responde 403.

☐ (P1) Al terminar la promoción recibo la comparación de ventas antes y durante.

### RT10. Permisos y visibilidad (P0, transversal)

### Requerimientos:

RT10.1 Se aplican los roles y la matriz del PRD de autenticación (AU4). Este módulo agrega las siguientes filas (propuesta en 4.16):

RT10.2 Los campos financieros se excluyen en el servidor: en la API, la exportación, el bot y el caché offline del Empleado (igual que AU4.3).

RT10.3 Un acceso denegado devuelve 403 con un mensaje en castellano ("No tenés permiso para ver la ganancia") y queda registrado (AU4.6).

### Criterios de aceptación:

☐ Un test automático recorre todos los endpoints del módulo con un Empleado (con y sin el permiso ⚙️) y verifica la tabla de RT10.1.

☐ El JSON del tablero para un Empleado no contiene ingresos, ganancia, costo, markup ni valorizacion.

☐ El caché offline del tablero de un Empleado no contiene datos financieros.

### RT11. Tablero sin conexión (P0 básico)

Descripción: sin conexión, el tablero se muestra con los datos de la última sincronización, según el PRD de Modo Offline.

### Requerimientos:

RT11.1 En cada sincronización, la PWA guarda en la base SQLite local del teléfono un snapshot compacto de los períodos estándar (Últimos 7 días, Últimos 30 días, Este mes): una fila por producto con sus métricas (≈ 8.000 filas, del orden de 1 a 2 MB), más los indicadores y las listas "Reponer primero" y "Dormidos" ya ordenadas.

RT11.2 Sin conexión se muestra un aviso fijo: "Sin conexión · datos al 9/10 18:40". Funcionan los filtros por categoría y ubicación y el ordenamiento sobre el snapshot; el rango personalizado, la exportación y la creación de descuentos requieren conexión (se indica en cada botón).

RT11.3 "Agregar al pedido" sin conexión se encola como cualquier otra operación offline y se sincroniza al volver la conexión.

RT11.4 Los movimientos registrados offline y todavía no sincronizados no se reflejan en las métricas hasta sincronizar (se aclara en el aviso). (P2) Estimación local con la cola pendiente.

RT11.5 El snapshot del Empleado no incluye campos financieros (RT10.2).

### Criterios de aceptación:

☐ Con el celular en modo avión, abro "Rotación", veo "Últimos 30 días" con el aviso "datos al…" y puedo filtrar por "Heladera A" y ordenar por cobertura.

☐ Sin conexión, "Exportar" y "Rango personalizado" aparecen deshabilitados con el motivo.

☐ Agrego un producto al pedido sin conexión y, al volver la conexión, aparece en el borrador del proveedor.

### 4.15 Integración con los demás módulos

### 4.16 Ajustes propuestos a otros PRDs (para unificar; no se modifican desde este documento)

PRD de autenticación (AU4): agregar las filas de RT10.1 a la matriz de permisos, con "Ver tablero de rotación en unidades" como ⚙️ y las vistas financieras del módulo como 🔒.

PRD del bot (B9 y B13.4): ampliar la plantilla del resumen del viernes con la parte de rotación y reemplazar los pesos "a calibrar" de B13.4 por las fórmulas de RT2.6 y el orden de RT5.3.

PRD principal (F5.4 y roadmap): evaluar adelantar a P1 la sugerencia de cantidades por cobertura (RT5.6), hoy P2 / Fase 3; prever en la sección de descuentos (en edición) la entrada "crear descuento desde un producto marcado" que usa RT9.

PRD principal (F9.7): el filtro por ubicación de los reportes pasa a P0 de este módulo; el del listado general puede seguir en P1.

PRD de Notificaciones por Email: incluir el evento resumen_rotacion entre las notificaciones clave enviadas por los dos canales.

## 5. Flujos de usuario

### Flujo 1: el dueño revisa la rotación desde el celular

A la noche, el dueño abre la PWA → "Reportes" → "Rotación". Por defecto ve "Últimos 30 días".

Mira los indicadores: 3.420 u. vendidas netas, $2.380.000 de ingresos netos, $690.000 de ganancia bruta, 18 dormidos ($96.400 inmovilizados) y 12 productos para reponer primero.

Cambia el período a "Últimos 7 días"; en "Más vendidos" ve la Coca-Cola 500 ml arriba, toca la tarjeta y la ficha le muestra la rotación de la semana (3,09), las veces que se repuso (2) y la cobertura (1,1 días).

Toca el "?" de la rotación y lee: "Vendiste 83 u.; en promedio tuviste 26,86 u. en el local; 83 / 26,86 = 3,09 veces".

Toca "Agregar al pedido" y vuelve al tablero.

### Flujo 2: resumen semanal → reponer primero → pedido

El viernes a las 18:00 llega por WhatsApp el resumen del viernes con la parte de rotación (una sola plantilla) y, al mismo tiempo, el mismo contenido por email.

El dueño toca "Reponer primero" y el bot le muestra los 10 primeros con su cobertura ("10 de 12").

Toca "Agregar los 10 al pedido"; el bot arma o actualiza los borradores por proveedor (B7) con las cantidades sugeridas.

Ajusta cantidades y elige "Programar para el lunes" (B9.4); el lunes el sistema recalcula en vivo y envía después de su confirmación.

### Flujo 3: productos dormidos → promoción

En el tablero, el dueño abre "Dormidos" y filtra "Góndola B".

Ve el Shampoo sachet: 47 días sin ventas, 30 u., $7.500 a costo.

Selecciona 5 productos → "Marcar para promoción" → "Crear descuento".

El sistema sugiere 10% (precio $360, markup 44%) y le muestra el piso de costo; el dueño cambia a 15% en dos productos y toca "Confirmar".

Los productos quedan "En promoción hasta el 20/10"; las ventas con descuento se reflejan en el tablero con el precio congelado.

### Flujo 4: el dueño duda de una métrica

Un producto aparece como dormido, pero el dueño cree que se vendió.

Desde la ficha toca "Ver trazabilidad" (F3.10) para el mismo período: no hay egresos por venta, solo un ajuste manual de −3 hecho por un empleado.

Concluye que se vendió sin registrar la venta; lo habla con el empleado y, si corresponde, se corrige con un movimiento compensatorio. El reporte se actualiza solo con los movimientos nuevos.

### Flujo 5: una empleada repone la heladera con lo que más rota

Sofía, empleada con el permiso ⚙️ "Ver tablero de rotación", abre "Rotación" → "Reponer primero" y filtra "Heladera A".

Ve los productos ordenados por cobertura, en unidades, sin ingresos ni ganancia.

Repone la heladera desde el depósito y agrega dos productos sin stock al borrador del pedido; el dueño lo confirma después.

### Flujo 6: sin conexión

Sin señal en el local, el dueño abre "Rotación" y ve "Sin conexión · datos al 9/10 18:40".

Filtra por "Bebidas" y ordena por cobertura sobre el snapshot local.

Intenta exportar a PDF y el botón le indica que necesita conexión; agrega un producto al pedido y la operación queda encolada.

Al volver la conexión, el pedido se sincroniza y el tablero se actualiza.

### Flujo 7: exportar y compartir el reporte del mes

El 1/11, el dueño elige "Mes anterior", pestaña "Todos", orden por ganancia descendente.

Toca "Exportar → PDF"; el PDF se genera en el servidor y lo comparte por WhatsApp con su contador o su socio desde el menú del teléfono.

La exportación queda registrada en el audit_log.

### Flujo 8: configuración de umbrales y del resumen

El dueño abre "Configuración → Reportes de rotación".

Cambia "Sin ventas en N días" a 21, "Cobertura mayor a X días" a 45 y la cobertura máxima para "Reponer primero" a 5 días.

Elige el resumen "Semanal, viernes 18:00 (junto al resumen del viernes)" y la pantalla le muestra "Sin costo adicional de WhatsApp". Si eligiera "Lunes 9:00", vería "~4,3 plantillas pagas por mes por destinatario (~USD 0,11)".

Activa el resumen para Sofía (versión en unidades). Los cambios quedan en el audit_log.

## 6. Notas técnicas

### 6.1 Principios

El historial es la fuente de verdad: stock_movements (append-only, F3 y 6.11 del PRD principal) es la única fuente. Todo lo demás (agregados diarios, vistas materializadas, snapshots offline, resúmenes) es derivado, reconstruible y verificable: se puede borrar y recalcular desde los movimientos sin perder nada.

Herramientas deterministas antes que IA: fórmulas en SQL y TypeScript con tests unitarios (Vitest) y los ejemplos de este documento como casos de prueba. El bot responde con plantillas, botones y listas (documento de costos, sección 7); la IA solo interviene, como en el PRD del bot, para interpretar texto libre ambiguo, nunca para calcular ni para decidir.

Una base por cliente: cada comercio tiene sus agregados en su propia base PostgreSQL; los jobs corren por comercio y resuelven la base desde la base de control (6.4 del PRD principal). No hay consultas entre bases ni tablas de reportes compartidas.

Mobile-first y barato de servir: respuestas pre-agregadas y paginadas, sin cálculos pesados en el teléfono.

### 6.2 Agregados diarios y vistas materializadas construidos desde los movimientos

Entidades nuevas (todas en la base de cada comercio):

Una fila solo por día con actividad: product_daily_stats guarda filas para los días en que el producto tuvo movimientos (no 8.000 × 365 filas). Los días sin movimientos se resuelven arrastrando el stock_cierre anterior (6.4).

Job incremental (cola pg-boss / Inngest del PRD principal, por comercio): cada 10 a 15 minutos lee los movimientos nuevos por cursor (id > último procesado), identifica los pares (product_id, fecha) afectados y recalcula cada par completo desde stock_movements (INSERT … ON CONFLICT DO UPDATE). Recalcular el par entero, en lugar de sumar deltas, hace que los reintentos y los movimientos tardíos nunca dupliquen nada (idempotente).

Movimientos tardíos (offline): si un movimiento sincronizado tarde cae en un día pasado (por client_occurred_at), el job recalcula ese día, arrastra el stock_cierre a los días siguientes con actividad y marca para regenerar los snapshots afectados.

Día actual en vivo: el tablero combina los agregados de los días cerrados con una consulta directa a stock_movements del día de hoy (índice (created_at)), para no depender del job.

Vistas materializadas para los períodos estándar: mv_rotation_7d y mv_rotation_30d (y mv_rotation_90d para ABC, P1), con una fila por producto activo y todas las métricas de RT2 y RT4 calculadas. Se refrescan con REFRESH MATERIALIZED VIEW CONCURRENTLY (requiere índice único por product_id) en el job nocturno y después de las corridas incrementales con cambios (como mínimo cada 15 minutos). Los períodos personalizados se calculan al vuelo desde product_daily_stats.

Job nocturno (después del cierre del día, en la zona del comercio, con jitter entre comercios): cierra el día, refresca las vistas, recalcula ABC, baja rotación y recomendaciones y genera los snapshots.

Conciliación nocturna (O5): para el día cerrado, compara Σ de product_daily_stats con la Σ directa de stock_movements por tipo, y el stock_cierre más reciente con products.stock_actual. Si difieren, alerta interna (Sentry / Control Plane) y recálculo del día; nunca se corrigen movimientos en silencio (igual que 6.11 del PRD principal).

Versión de fórmulas: si cambia una fórmula, se incrementa la versión en aggregation_state y un job recalcula los agregados desde los movimientos, algo posible porque el historial es completo e inmutable.

### 6.3 Imputación por día y zona horaria

fecha = (coalesce(client_occurred_at_valido, created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, donde client_occurred_at_valido es client_occurred_at solo si está entre created_at − 72 h y created_at (tolerancia configurable); fuera de ese rango se usa created_at y se registra la anomalía.

La zona horaria sale de la configuración del comercio (por defecto, America/Argentina/Buenos_Aires).

Devoluciones y compensatorios se imputan a su propia fecha (RT1.2).

### 6.4 Cálculo del stock promedio desde los movimientos

Stock al inicio del período: stock_cierre de la última fila de product_daily_stats anterior a desde o, si no existe, SUM(cantidad) de stock_movements del producto con fecha anterior a desde (coherente con F3.9); 0 si el producto no existía.

Stock-días del período: se toman las filas del producto con actividad dentro del período ordenadas por fecha; con LEAD(fecha) se calcula cuántos días rige cada stock_cierre hasta la fila siguiente (o hasta el fin del período), y se suma el tramo inicial con el stock al inicio hasta la primera fila:

stock_días = stock_inicio × (días anteriores a la primera actividad) + Σ stock_cierre(i) × (días desde la fila i hasta la siguiente o hasta el fin del período, incluido el día i)

### Stock promedio = stock_días / D efectivo.

Es equivalente al promedio de cierres diarios de RT2.3, pero sin materializar un día por producto; con 8.000 productos y pocas filas por producto por mes es una sola consulta con funciones de ventana.

Consistencia con el ejemplo de RT2: stock_días = 188 y D = 7 → 26,86.

Un producto sin actividad en el período tiene stock promedio = stock al inicio, y es candidato a baja rotación si tiene stock.

### 6.5 Índices

stock_movements: los del PRD principal (6.11) y del bot (6.11): (product_id, created_at DESC, id), (created_at), (tipo, created_at), (product_id, tipo, created_at). Se agrega un índice parcial (product_id, created_at DESC) WHERE tipo = 'egreso_venta' para "última venta"; la clave primaria id sirve al cursor del job incremental.

product_daily_stats: PK (product_id, fecha) e índice (fecha, product_id) para rangos de fechas sobre todos los productos; índice (product_id, fecha DESC) INCLUDE (stock_cierre) para el stock al inicio.

products: (categoria_id), (location_id) (ya previsto en F9), (proveedor_id) e índice parcial de activos WHERE archivado = false.

Vistas materializadas: índice único (product_id) (necesario para el refresco concurrente) e índices por las columnas de orden más usadas: (unidades_netas DESC, product_id), (cobertura, product_id), (dias_sin_venta DESC, product_id), (location_id), (categoria_id).

sale_returns y sus líneas: (created_at) y (venta_movimiento_id) para netear devoluciones.

Paginación del tablero y del bot por cursor (keyset) sobre (columna de orden, product_id), nunca por OFFSET.

### 6.6 Datos mínimos necesarios

La calidad del reporte depende de que las ventas se registren: si el comercio no registra todas sus ventas, la rotación se subestima (ver riesgos). Para el Dueño, el tablero muestra el porcentaje de días del período con al menos una venta registrada como indicador de cobertura de datos.

### 6.7 Rendimiento con 8.000 productos

Volumen de referencia: 8.000 productos activos, ~300 ventas por día, ~500.000 movimientos por año; product_daily_stats con ~1.500 a 3.000 filas por día con actividad (≈ 0,5 a 1 millón de filas por año), liviano para PostgreSQL con los índices de 6.5.

### Objetivos (a validar en la beta):

Tablero con período estándar (vista materializada): consulta en la base < 300 ms y primera página en el celular < 2 s (p95, 4G, gama media).

Período personalizado de hasta 13 meses sobre product_daily_stats: < 1,5 s en la base (p95).

Job incremental por comercio: < 30 s; job nocturno completo (vistas y snapshots): < 2 min por comercio.

Snapshot offline: < 2 MB comprimido.

Bot: "Reponer primero" devuelve los 10 primeros en < 3 s de punta a punta (como B13).

Escala multi-comercio: con una base por cliente, los jobs se reparten por comercio con jitter y concurrencia limitada por servidor de base (pg-boss), para no saturar el pooling ni coincidir con las horas pico de venta.

Pruebas: catálogo sintético de 8.000 productos con un año de movimientos en CI/staging; EXPLAIN ANALYZE de las consultas del tablero, del job y de la exportación; Playwright en viewport de celular.

### 6.8 Resumen periódico (jobs, bot y email)

Job programado por comercio según rotation_settings (zona del comercio), en la misma cola que el aviso matutino y el resumen del viernes (6.6 del PRD del bot), con distribución en el tiempo para respetar el límite de mensajería.

Genera un rotation_snapshot y emite el evento resumen_rotacion, que consumen el bot y el servicio de email. Con la integración al resumen del viernes, el job de B9 incluye la sección de rotación del mismo snapshot.

Plantilla de utilidad aprobada por Meta en el número central (WABA de la plataforma), con variables acotadas (top 3) para respetar los límites de largo [a verificar]. Cada envío se registra en bot_message_log (base del comercio) y en whatsapp_usage (base de control, sin contenido).

Los botones devuelven listas interactivas paginadas de a 10 (B13.3) o el link al tablero con los filtros en la URL.

### 6.9 Exportación

Reutiliza la infraestructura de F3.12 (worker, plantilla HTML a PDF con Chromium headless o pdfmake/PDFKit, almacenamiento de objetos con URL firmada y vencimiento), con la consulta del tablero dentro de una transacción REPEATABLE READ y lectura por cursor.

CSV en streaming desde la base; el archivo nunca se arma en el navegador.

### 6.10 Offline

Snapshot de RT11 servido por un endpoint versionado (ETag por generado_at) y descargado en cada sincronización con datos nuevos; se guarda en la SQLite local del teléfono (SQLite WASM sobre OPFS, según el PRD de Modo Offline).

Filtros y orden locales sobre el snapshot (índices en la tabla local por categoría, ubicación y columnas de orden).

Sin campos financieros en el snapshot del Empleado.

### 6.11 Seguridad, calidad y observabilidad

Permisos en el backend en cada request (AU4.2); tests de contrato que verifican la ausencia de campos financieros para el Empleado.

Tests unitarios de cada fórmula con los ejemplos de este documento y casos borde: stock 0 todo el período, producto nuevo, devoluciones tardías, compensatorios, movimientos offline tardíos, ventas por código de caja.

Tests de conciliación (agregados = movimientos) en CI con datos sintéticos.

Métricas: duración de los jobs por comercio, diferencias de conciliación, latencia del tablero, plantillas enviadas por comercio y mes, tasa de acciones desde el resumen (O4).

## 7. Riesgos y preguntas abiertas

### 7.1 Riesgos

### 7.2 Preguntas abiertas

Criterio por defecto del ranking y del ABC: ¿unidades (más intuitivo) o ganancia bruta (más útil para el negocio) para el Dueño?

Período y ventana por defecto: ¿30 días para el tablero y 28 para la cobertura son adecuados para kioscos, o conviene 14 días por la inflación y los cambios de surtido?

Umbrales por defecto de baja rotación: ¿N = 30 días y X = 60 días de cobertura? ¿Distintos por rubro (kiosco, almacén, librería) desde el onboarding?

Resumen: ¿integrado siempre al resumen del viernes o como mensaje propio? ¿Se ofrece frecuencia diaria (más plantillas pagas) o se limita a semanal, quincenal y mensual?

Devoluciones no aptas: ¿descuentan de las unidades vendidas (propuesta actual) o se cuentan como venta más merma?

Imputación de devoluciones: ¿al día de la devolución (propuesta: períodos cerrados estables) o al día de la venta original (más "exacto", pero cambia reportes pasados)?

Permisos del Empleado: ¿el acceso al tablero en unidades debe ser ⚙️ (propuesta) o ✅ por defecto? ¿Podría marcar productos para promoción con un permiso ⚙️ en el futuro?

Exportación: ¿requiere reautenticación (AU10) como la exportación del historial, o alcanza con el rol Dueño porque no incluye datos de auditoría?

Plan: ¿el módulo es solo para el plan Pro (como sugiere el modelo de negocio del PRD principal) o el Básico tiene una versión reducida (top 10 y dormidos, sin exportación)?

Ubicación histórica: ¿hace falta repartir ventas según la ubicación que tenía el producto al momento de la venta (requiere guardar location_id en el movimiento) o alcanza con la ubicación actual?

Sugerencia de descuento: ¿la escala 10/15/20% por antigüedad es razonable? ¿Conviene redondear el precio sugerido con el redondeo de F7.3?

Cantidad sugerida por cobertura (RT5.6): ¿se adelanta a P1 en el PRD principal (hoy P2)?

## 8. Plan por fases

El MVP de este módulo corresponde a la línea "Reportes: productos más vendidos, rotación, valorización" de la Fase 2 del PRD principal (meses 3 a 5) y requiere que estén en producción F3 (historial inmutable), F9 (ubicaciones), F10 (devoluciones) y el bot con B9.

### Fase 0: diseño y validación (2 semanas, al inicio de la Fase 2 del PRD principal)

Validar las fórmulas de RT2 con datos reales de 3 a 5 comercios de la beta (comparar con lo que el dueño "siente" que rota).

Prototipo clickeable del tablero en celular (360 px), probado con 5 dueños y 2 empleados.

Definir los umbrales por defecto (RT4) y la ventana de cobertura.

Redactar y enviar a aprobación de Meta la ampliación de la plantilla del resumen del viernes y la plantilla propia de rotación.

Acordar con el PRD principal el punto de entrada a la funcionalidad de descuentos (RT9) y con el PRD de Notificaciones por Email el evento resumen_rotacion.

### Fase 1: MVP del módulo (semanas 3 a 8 de la Fase 2)

product_daily_stats, job incremental, job nocturno, vistas materializadas de 7 y 30 días y conciliación nocturna.

RT1 rankings, RT2 métricas (con "¿Cómo se calcula?"), RT4 baja rotación, RT5 "Reponer primero" con "Agregar al pedido" y "Guardar para el viernes".

RT7 tablero mobile-first con filtros por fechas, categoría y ubicación y ordenamiento; ficha de rotación con "Ver trazabilidad".

RT8 exportación a PDF y CSV en el servidor.

RT9 marcado para promoción y "Crear descuento" con sugerencia y piso de costo (o la alternativa de cambio de precio).

RT6 resumen semanal por WhatsApp (integrado al resumen del viernes) y por email, con frecuencia configurable.

RT10 permisos y RT11 snapshot offline.

Beta con los comercios de la beta del PRD principal y medición de O1 a O6.

### Fase 2: profundización (meses 2 y 3 después del lanzamiento del módulo)

RT3 clasificación ABC (90 días) y su uso en las recomendaciones.

RT5.6 cantidad sugerida por cobertura objetivo y días de visita del proveedor.

RT2.10 venta diaria ajustada por días con stock.

RT9.6 medición del efecto de las promociones.

Comparación contra el período anterior, filtro por proveedor y gráficos de tendencia.

Umbrales por categoría (RT4.5), resumen mensual con comparativa y envío programado del PDF por email.

### Fase 3: inteligencia (meses 6 a 12)

Estacionalidad y matriz ABC × cobertura; umbral de stock bajo sugerido por rotación (F4, P2 del PRD principal).

Estimación local offline con movimientos pendientes (RT11.4).

Ventas por ubicación histórica, si la pregunta 10 lo justifica.

Modelos de demanda con IA solo como complemento de las reglas deterministas, si la beta muestra que agregan valor y su costo se justifica.

## Anexo A: glosario

Campo | Detalle
--- | ---
Producto | Módulo de reportes de rotación del Sistema de Inventario para Kioscos y Comercios (nombre comercial a definir)
Autor | Mauricio Matasini
Estado | Borrador v1
Fecha | 9 de octubre de 2026
Documentos relacionados | "PRD - Sistema de Inventario para Kioscos y Comercios" (en adelante, PRD principal: F3 historial inmutable, F4 alertas, F5 pedidos, F7 costo, precio, markup y descuentos, F9 ubicaciones, F10 devoluciones, F11 celular; la sección de precios y descuentos está en edición), "PRD - Bot de WhatsApp para Sistema de Inventario" (B2 preferencias, B6 lista del viernes, B9 resumen del viernes, B13 escala), "PRD - Autenticación y Gestión de Usuarios para Sistema de Inventario" (AU4 matriz de permisos, AU10 reautenticación), "PRD - Notificaciones por Email para Sistema de Inventario" (en redacción), "PRD - Modo Offline para Sistema de Inventario" (en redacción), "PRD - Caja Digital para Sistema de Inventario" y "Costos estimados por cliente - Sistema de Inventario". Todos en la misma carpeta.
Arquitectura de datos | Una base de datos PostgreSQL por cliente (por comercio), más una base de control del Control Plane, igual que el PRD principal (6.4). Todos los reportes se calculan dentro de la base de cada comercio, a partir de su historial de movimientos inmutable.
Principio de cálculo | Herramientas deterministas antes que IA: todas las métricas, rankings, umbrales y recomendaciones de este documento son fórmulas y reglas fijas (SQL y código), explicables y reproducibles. No se usa IA para calcular ni para decidir qué reponer o qué promocionar.

Incluido | No incluido (ver 2.2)
--- | ---
Rankings, métricas por producto, cobertura, baja rotación, recomendaciones deterministas de reposición, resumen periódico por WhatsApp y email, tablero con filtros y exportación, marcado para promoción | Pronóstico de demanda con IA, compras automáticas, descuentos automáticos, arqueo de caja, toma de inventario física obligatoria, reportes fiscales o contables

# | Objetivo | Cómo se mide
--- | --- | ---
O1 | Que el dueño identifique sus productos más vendidos y los de baja rotación en menos de 30 segundos desde el celular | Tiempo desde abrir el tablero hasta ver el ranking (prueba de usabilidad); p95 de carga del tablero
O2 | Reducir quiebres de stock de productos de alta rotación | Productos de alta rotación (tercio superior o clase A) con stock 0 por semana, antes y después de usar el módulo
O3 | Reducir plata inmovilizada en productos dormidos | Valorización a costo de productos marcados como baja rotación, a 30 y 90 días
O4 | Convertir el resumen en acción | Porcentaje de resúmenes periódicos con al menos un "Agregar al pedido" o "Marcar para promoción"
O5 | Números confiables y verificables | 100% de las métricas reproducibles desde el historial de movimientos (conciliación nocturna sin diferencias)
O6 | Costo de mensajería controlado | Plantillas pagas de WhatsApp agregadas por este módulo: 0 adicionales si el resumen va dentro del resumen del viernes; como máximo ~4,3 por destinatario por mes si va aparte

Prioridad | Significado
--- | ---
P0 - MVP del módulo | Imprescindible para lanzar el módulo de reportes de rotación (dentro de la Fase 2 del PRD principal, "Reportes: productos más vendidos, rotación, valorización")
P1 - Post-MVP cercano | Dentro de los 2 a 3 meses posteriores al lanzamiento del módulo
P2 - Futuro | Según demanda

# | Funcionalidad | MVP (P0) | Más adelante (P1/P2)
--- | --- | --- | ---
RT1 | Ranking de más y menos vendidos | Top y bottom por unidades netas, ingresos y ganancia bruta, netos de devoluciones, desde el historial inmutable | Comparación contra el período anterior (P1)
RT2 | Métricas por producto | Unidades por día/semana/mes, ingresos, ganancia bruta, rotación, veces repuesto, cobertura, días desde la última venta, con fórmulas fijas | Venta diaria ajustada por días con stock (P1), estacionalidad (P2)
RT3 | Clasificación ABC (Pareto) | – | ABC por ingresos, ganancia o unidades (P1); matriz ABC × cobertura (P2)
RT4 | Productos de baja rotación | Umbrales configurables (sin ventas en N días, cobertura mayor a X días), marca visible en tablero y resumen | Umbrales por categoría (P1)
RT5 | Recomendaciones de reposición | Prioridad determinista "qué reponer primero" (cobertura baja + rotación alta), "Agregar al pedido" o a la lista del viernes | Cantidad sugerida por cobertura objetivo y días de visita del proveedor (P1)
RT6 | Resumen periódico de rotación | Por WhatsApp (bot, número central) y por email, frecuencia configurable (por defecto semanal, dentro del resumen del viernes) | Resumen mensual con comparativa (P1)
RT7 | Tablero de rotación (web y celular) | Filtros por rango de fechas, categoría y ubicación; ordenamiento; ficha de rotación por producto; mobile-first | Filtro por proveedor y gráficos de tendencia (P1)
RT8 | Exportación | PDF y CSV generados en el servidor, con los filtros aplicados | Envío programado del PDF por email (P1)
RT9 | Marcado para promoción o descuento | Marcar productos de baja rotación y abrir la funcionalidad de descuentos con sugerencia; confirma el comerciante | Medición del efecto de la promoción (P1)
RT10 | Permisos y visibilidad | Dueño ve todo; Empleado solo unidades con permiso ⚙️; filtrado en el servidor | Permisos finos (P2, según el PRD de autenticación)
RT11 | Tablero sin conexión | Tablero desde la última sincronización con aviso de fecha y hora | Estimación local con movimientos offline pendientes (P2)

Día | Ventas | Devoluciones | Ingresos (reposición) | Stock al cierre
--- | --- | --- | --- | ---
1/10 | 10 | 0 | – | 14
2/10 | 12 | 0 | +48 (pedido #42 recibido) | 50
3/10 | 11 | 1 | – | 40
4/10 | 14 | 0 | – | 26
5/10 | 9 | 0 | – | 17
6/10 | 13 | 0 | +24 (carga manual) | 28
7/10 | 15 | 0 | – | 13
Total | 84 | 1 | +72 en 2 eventos | Σ = 188

Acción | Dueño | Empleado
--- | --- | ---
Ver el tablero de rotación en unidades (rankings, rotación, cobertura, días sin venta, dormidos, reponer primero) | ✅ | ⚙️
Ver ingresos, ganancia bruta, margen, markup, valorización, plata inmovilizada y ABC por ingresos o ganancia | ✅ | ❌ 🔒
Exportar reportes de rotación (PDF, CSV) | ✅ | ❌ 🔒
Configurar umbrales, ventanas y resumen periódico | ✅ | ❌ 🔒
Recibir el resumen periódico (versión en unidades) | ✅ | ⚙️
Agregar recomendaciones a un borrador de pedido | ✅ | ✅ (si tiene acceso al tablero)
Marcar para promoción y crear descuentos | ✅ | ❌ 🔒

Módulo / PRD | Cómo se integra
--- | ---
Historial de movimientos inmutable (F3, PRD principal) | Única fuente de datos. Los reportes solo leen stock_movements (append-only) y sus derivados; nunca escriben ni corrigen movimientos. Las correcciones por compensatorio se reflejan automáticamente. "Ver trazabilidad" se abre desde cualquier métrica para verificarla.
Devoluciones (F10) | Todas las métricas de venta son netas de devoluciones (unidades, ingresos y ganancia, con los valores congelados de la venta).
Costo, precio, markup y descuentos (F7, en edición) | Ingresos y ganancia salen de los valores congelados en cada venta; la valorización y la plata inmovilizada usan el costo vigente; RT9 abre la funcionalidad de descuentos con sugerencia y piso de costo.
Ubicaciones (F9) | Filtro por ubicación (góndola, heladera, etc.) en el tablero, la exportación y el snapshot offline. Para los reportes, adelanta a P0 el filtro por ubicación que F9.7 tiene como P1.
Alertas y pedidos de reposición (F4, F5) | "Reponer primero" incluye los productos en alerta con ventas; "Agregar al pedido" crea o actualiza borradores de purchase_orders por proveedor; la confirmación y el envío siguen F5/F6.
Bot de WhatsApp (B6, B9, B13) | El resumen de rotación se integra por defecto al resumen del viernes; los botones llevan a listas paginadas de a 10 (B13.3) o al tablero; el ranking de urgencia de B13.4 usa las fórmulas de cobertura y venta diaria de este PRD. Número central, plantillas pagas y cupos según el documento de costos.
Notificaciones por email (PRD en redacción) | El resumen periódico es una notificación clave: sale por WhatsApp y por email con el mismo snapshot (evento resumen_rotacion).
Autenticación (AU4, AU10) | Permisos de la tabla de RT10.1; filtrado de campos financieros en el servidor.
Modo Offline (en redacción) | Snapshot del tablero en SQLite local; operaciones encoladas.
Caja Digital | Sin dependencia directa: los reportes de rotación no usan la caja (no hay arqueo). Los totales de ventas netas coinciden con las ventas registradas.
Control Plane / base de control | Solo registra el consumo de plantillas (whatsapp_usage) y métricas técnicas de los jobs; los datos comerciales quedan en la base de cada comercio.

Tabla | Campos principales
--- | ---
product_daily_stats | product_id, fecha (date local del comercio), unidades_vendidas, unidades_devueltas, unidades_devueltas_no_aptas, unidades_compensadas_venta (con signo), importe_ventas, importe_reintegrado, ganancia_ventas, ganancia_revertida (centavos), unidades_ingresadas, reposiciones (eventos según RT2.5), mermas, ajustes_netos, stock_cierre, ultima_venta_at, calculado_at. PK (product_id, fecha). Derivada: se recalcula, no es fuente de verdad
rotation_snapshots | id, periodo (7d, 30d, mes, personalizado), desde, hasta, filtros, generado_at, version_formulas, datos por producto (tabla hija o JSONB compacto); lo usan el resumen (RT6.5), la exportación y el offline
rotation_settings | ventana de cobertura (14/28/56), umbrales de RT4, cobertura máxima de RT5, cortes ABC, frecuencia, día y hora del resumen, integración con el resumen del viernes, destinatarios, "no enviar si no hay ventas"; cambios registrados en audit_log
product_flags | product_id, tipo (promocion, excluir_baja_rotacion), motivo (JSON con la regla y los valores), activo, user_id, origen, created_at; cada alta y baja también en audit_log
aggregation_state | último stock_movements.id procesado por el job incremental, versión de fórmulas, última corrida
report_exports | como history_exports del PRD principal: usuario, formato, filtros, estado, archivo, created_at

Métrica | Datos mínimos | Si faltan
--- | --- | ---
Unidades vendidas, rankings, días desde la última venta | Movimientos egreso_venta con cantidad y fecha (siempre presentes según F3.1) | –
Ingresos y ganancia bruta | importe y ganancia congelados en cada venta (F3.1, F7.8), con costo cargado | Las ventas sin costo cuentan en ingresos y se marca "ganancia incompleta: N ventas sin costo cargado"
Rotación y stock promedio | Stock inicial del producto (alta o carga) y todos sus movimientos | "Pocos datos" hasta tener 7 días de historia
Veces repuesto | Movimientos ingreso / ingreso_pedido | 0
Cobertura, recomendaciones y baja rotación | ≥ 7 días de historia y ≥ 3 ventas en la ventana (configurable) | "Pocos datos"; fuera de recomendaciones y de baja rotación
ABC (P1) | ≥ 30 días de ventas del comercio | "Se necesitan al menos 30 días de ventas"
"No llega a la próxima visita" | Días de visita del proveedor (F6.1) | No se muestra esa marca
Filtros por categoría y ubicación | Categoría y ubicación del producto | "Sin categoría" / "Sin ubicación"

Riesgo | Impacto | Probabilidad | Mitigación
--- | --- | --- | ---
Ventas no registradas (el comercio vende sin escanear) | Alto: rotación subestimada, falsos "dormidos" | Alta | Indicador de cobertura de datos (6.6); "Ver trazabilidad" desde cada métrica; aviso en la ficha cuando hay ajustes negativos frecuentes ("posibles ventas sin registrar")
Stock inicial mal cargado | Medio: stock promedio y cobertura erróneos | Media | "Pocos datos" los primeros 7 días; la cobertura se corrige sola a medida que entran movimientos; sugerencia de ajuste con motivo
Productos agotados parecen de baja venta | Medio: no se recomienda reponer lo que se agotó | Media | Exclusión por stock 0 en "Menos vendidos"; venta diaria ajustada por días con stock (RT2.10, P1)
Estacionalidad (helados, útiles escolares) | Medio: recomendaciones fuera de temporada | Media | Ventana de cobertura configurable; umbrales por categoría (P1); estacionalidad (P2)
Costo de WhatsApp (plantillas y mensajes de servicio) | Medio | Media | Integración con el resumen del viernes (0 plantillas adicionales), top 3 en un mensaje, detalle en la web, costo visible en la configuración, cupos por plan
Límite de mensajería del número central | Medio | Media | Envíos repartidos en el tiempo, opt-in, verificación del negocio en Meta antes de ~100 clientes (documento de costos)
Meta recategoriza la plantilla como marketing (~USD 0,0618) | Medio | Baja / Media | Contenido estrictamente transaccional (RT6.8); monitorear la categoría asignada
El usuario malinterpreta las métricas | Medio | Alta | Pocas métricas, lenguaje simple, "¿Cómo se calcula?" con los números, semáforos en la cobertura
Descuentos por debajo del costo | Medio | Media | Piso de costo con markup mínimo (RT9.2) y confirmación obligatoria
Carga en las bases por los jobs de muchos comercios | Medio | Media | Agregados incrementales, vistas materializadas, jitter y concurrencia limitada
Movimientos offline tardíos cambian días pasados | Bajo | Media | Recálculo idempotente por (producto, día), snapshots marcados para regenerar, tolerancia de 72 h
Dependencia de la funcionalidad de descuentos (en edición) | Medio | Media | Alternativa "Cambiar precio de venta" (RT9.8)

Término | Definición
--- | ---
Unidades vendidas netas | Unidades vendidas menos devueltas (y menos correcciones de ventas) en un período, según el historial de movimientos
Ingresos netos | Importe de las ventas menos los reintegros por devoluciones, con los precios congelados de cada venta (incluidos descuentos)
Ganancia bruta neta | Ganancia de las ventas (precio − costo al momento de la venta) menos la ganancia revertida por devoluciones; no descuenta gastos fijos
Stock promedio | Promedio del stock al cierre de cada día del período, reconstruido desde los movimientos
Rotación de inventario | Unidades vendidas netas / stock promedio del período: cuántas veces "se vendió el stock" en el período
Veces repuesto | Cantidad de eventos de reposición (pedidos recibidos y días con cargas de ingreso) en el período
Venta promedio diaria | Unidades vendidas netas de la ventana de cobertura (por defecto, 28 días) / días de la ventana
Días de cobertura | Stock actual / venta promedio diaria: cuántos días dura el stock al ritmo de venta actual
Días desde la última venta | Días transcurridos desde el último egreso por venta del producto
Baja rotación (producto dormido) | Producto con stock que cumple un umbral configurable (sin ventas en N días o cobertura mayor a X días)
Plata inmovilizada | Stock actual × costo unitario vigente de los productos de baja rotación
Clasificación ABC (Pareto) | Agrupación de productos según su peso acumulado en las ventas: A hasta el 80%, B hasta el 95%, C el resto
Reponer primero | Lista priorizada de productos con cobertura baja y rotación alta
Agregado diario | Resumen por producto y día derivado de los movimientos; reconstruible y verificable, no es fuente de verdad
Vista materializada | Consulta precalculada y guardada en la base para responder rápido; se refresca periódicamente
Herramientas deterministas | Fórmulas y reglas fijas (matemáticas y de negocio) que se usan antes de cualquier IA
Plantilla de utilidad | Mensaje de WhatsApp aprobado por Meta para avisos transaccionales; pago (~USD 0,026 en Argentina, a verificar)
Número central | Único número de WhatsApp Business de la plataforma, compartido por todos los comercios
