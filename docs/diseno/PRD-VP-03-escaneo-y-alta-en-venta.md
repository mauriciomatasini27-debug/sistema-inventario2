---
id: PRD-VP-03
tipo: prd
estado: aceptado
modulos: [ventas, catalogo, inventario, offline, tickets]
depende_de: [ADR-0106, ADR-0121, ADR-0128]
reemplaza: []
reemplazado_por: ""
modifica: [ADR-0106]
modificado_por: []
resumen: |
  Escaneo en /venta por pasos: un Código de producto conocido pide la cantidad antes de sumarlo al ticket;
  uno desconocido notifica y da de alta el producto con stock, lote y ubicación (offline cae al Producto
  provisorio). Sin cambios de esquema ni migraciones.
---
# PRD-VP-03 - Escaneo con confirmación de cantidad y alta de producto en /venta

> Estado al 2026-11-25: aceptado. Cierra el [mapa #527](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/527). La ejecución en código queda fuera del mapa y se hace en una rama posterior; este PRD entrega la spec lista para implementar.

Fuente: [Mapa: escaneo con confirmación de cantidad y alta de producto nuevo en /venta (#527)](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/527), decisiones [paso de cantidad (#528)](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/528) y [alta completa (#529)](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/529), y [maqueta validada (#530)](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/530) (variante C «paso a paso»). Restringido por ADR-0106 (que modifica en parte), ADR-0121 y ADR-0128.

## Problema

Hoy `/venta` suma la línea en cuanto el escáner resuelve un Código de producto conocido: `incorporarLectura` llama a `agregarLineaDesdeFormulario()` con `#qty` (`1`) sin frenar a confirmar la cantidad, y `resolverLectura` descarta `nombre`, `precio_centavos` y `por_peso` cuando el producto no estaba en el snapshot `offline:catalogo:<tenantId>`. Un Código de producto desconocido solo cambia el estado y destapa el campo de nombre: no hay forma de dar de alta el producto con stock, lote y ubicación desde el mostrador, y el alta queda trunca o provisoria sin stock.

Este PRD fija el flujo unificado de escaneo en el mostrador, presentado por pasos:

1. **Código conocido**: cargar la ficha con Nombre, Código de producto, Precio (o «Precio por kg») y Stock disponible, y preguntar la **Cantidad a vender** antes de sumarlo al ticket.
2. **Código desconocido**: notificar *«Este producto no está cargado en la base de datos»*, ofrecer «Cargar producto» con **Nombre**, **Precio de venta**, **Stock**, **Fecha de vencimiento** y **Ubicación**, y al pulsar «Guardar» persistir el producto con su lote y ubicación y sumarlo al ticket. Sin conexión, cae al **Producto provisorio**.

## Épica VP3-E1. Escaneo de un Código de producto conocido y paso de cantidad

Requisito VP3-R1. El flujo de escaneo se presenta por pasos (transversal a las dos escenas).

- Historia VP3-S1. Stepper y ticket como resumen. AC: Given el flujo de escaneo en /venta When se mira en 390px y en escritorio Then la escena se presenta por pasos con un stepper grande «Escanear → Cantidad/alta → Ticket», el ticket queda como resumen que no estorba mientras se confirma la cantidad o se da de alta un producto, y la vista móvil no pierde funcionalidad. ADR: —. Talla M. Depende de: nada.

Requisito VP3-R2. Un Código de producto conocido arma la ficha y pregunta la cantidad antes de sumarlo al ticket.

- Historia VP3-S2. Ficha completa. AC: Given un Código de producto conocido When se resuelve por escáner o por un resultado de la búsqueda manual Then `resolverLectura` devuelve la ficha completa (`sku`, `nombre`, `precioCentavos`, `porPeso`, `codigo`) y la ficha muestra Nombre, Código de producto, Precio (o «Precio por kg») y Stock disponible; el snapshot `offline:catalogo:<tenantId>` suma un mapa opcional `nombres` sin cambiar `VERSION_CATALOGO`; si no hay nombre por ninguna vía se muestra el Código de producto. ADR: 0121. Talla M. Depende de: VP3-S1.
- Historia VP3-S3. Paso de cantidad y foco. AC: Given una ficha armada When el cajero confirma con Enter Then se suma la línea con la cantidad vigente; el foco se queda en `#sku` (Enter confirma, Tab o clic van a `#qty`/`#precio`, Esc o «Cancelar» descartan) y nada se suma sin confirmar; al confirmar o cancelar, `#sku` se limpia y recupera el foco, la cantidad vuelve a `1` (unidades) o vacía (peso) y el precio vuelve al del catálogo. ADR: 0121. Talla M. Depende de: VP3-S2.
- Historia VP3-S4. Cantidad en unidades y en peso. AC: Given un producto por unidades Then la cantidad se prellena en `1`, `−`/`+` de a 1 y máximo 999; given un producto `por_peso` Then la cantidad se prellena vacía con placeholder «Ej. 0,250», `−`/`+` de a 100 g, acepta coma o punto, hasta 3 decimales y máximo `1000,000` kg, y se convierte a gramos con `convertirKgAGramos`; given una cantidad inválida (vacía, 0, negativa o fuera de rango) Then hay error inline, no se suma y la ficha sigue armada. ADR: 0121. Talla M. Depende de: VP3-S3.
- Historia VP3-S5. Re-escaneo y precio. AC: Given un Código que ya está en el ticket When se re-escanea Then se arma la misma ficha con el helper «Ya en el ticket: N — quedaría en N+1» y al confirmar suma vía `fusionarLinea`; el precio es editable solo cuando la línea es nueva (la edición vale para esa línea, no para el catálogo) y en una línea ya cargada queda bloqueado al precio de la línea. ADR: 0121. Talla S. Depende de: VP3-S3.
- Historia VP3-S6. Stock avisa, no bloquea. AC: Given una ficha con stock estimado 0 o menor a la cantidad When se confirma Then se avisa pero no se bloquea; el stock local es `snapshot − cola − carrito` y, si el producto no está en el snapshot, se muestra «Stock sin dato»; la regla del servidor (unidades permiten sobreventa, peso sin stock se rechaza con `SIN_STOCK` al cobrar) no se duplica en la pantalla. ADR: 0121. Talla S. Depende de: VP3-S2.

## Épica VP3-E2. Código desconocido y Alta al vuelo completa (online)

Requisito VP3-R3. Un Código de producto desconocido notifica y permite dar de alta el producto completo.

- Historia VP3-S7. Notificación e identidad. AC: Given un Código de producto que no existe When se escanea o se busca Then aparece un aviso inline «Este producto no está cargado en la base de datos» con el código leído debajo y los botones «Cargar producto» y «Cancelar»; el foco se queda en `#sku`, Enter activa «Cargar producto» y Esc o «Cancelar» descartan; el producto nuevo usa SKU = código escaneado (normalizado a mayúsculas) y `codigo` igual, con la convención `elegirSkuDesdeCodigo`, y el Código de producto se muestra read-only y precargado. ADR: 0128. Talla M. Depende de: VP3-S1.
- Historia VP3-S8. Formulario de alta completa. AC: Given el formulario inline When se completa Then pide Nombre (obligatorio, 1..120), Precio de venta (obligatorio, `parsearPesos`, centavos > 0, máximo 999.999.999), Stock inicial (obligatorio, entero 1..999), Fecha de vencimiento (opcional, no anterior a hoy), Ubicación (opcional, selector de `GET /api/locations` + «Sin ubicación») y Cantidad a vender (obligatorio, entero 1..stock, por defecto 1); no se exponen `por_peso` (va `false`) ni `costo_centavos` (va 0) y no se pueden crear ubicaciones desde el formulario; un campo inválido muestra mensajes inline y no se hace ningún POST. ADR: 0128. Talla L. Depende de: VP3-S7.
- Historia VP3-S9. Vencimiento y lote. AC: Given una Fecha de vencimiento When se guarda Then el producto nace con `controla_vencimiento = true` y el lote con `vence_el` a las 23:59:59.999 de Argentina de ese día (convertido a ISO UTC); given sin fecha Then nace con `controla_vencimiento = false` y lote genérico (`vence_el: null`); un producto que controla vencimiento exige fecha en los ingresos futuros. ADR: 0106. Talla S. Depende de: VP3-S8.
- Historia VP3-S10. Guardado idempotente. AC: Given el botón «Guardar y agregar al ticket» When se toca Then dispara `POST /api/products` con `Idempotency-Key` (la misma en cada reintento) y luego `POST /api/stock/ingreso` con otra key; `POST /api/products` pasa a respetar `Idempotency-Key` (reintentar por una respuesta perdida devuelve el mismo producto, no un 409); actualiza `offline:catalogo:<tenantId>` (stock, precio, `porPeso = false`, `codigos[código] = sku`, `nombres[sku] = nombre`) y agrega la línea al ticket con `fusionarLinea` sin pasar por el paso de VP3-E1 y sin `alta` (el producto ya existe). ADR: 0106. Talla L. Depende de: VP3-S9.
- Historia VP3-S11. Fallos y duplicados. AC: Given que falla `POST /api/stock/ingreso` tras crear el producto Then el formulario queda bloqueado con «Producto creado, pero no se cargó el stock inicial» y «Reintentar» manda solo el lote con la misma key; given un 409 real (otro dispositivo creó el código) Then se relee por código, se muestra «Ya está cargado: <nombre>» y «Usar este producto» arma la ficha de VP3-E1; given red o 503 Then se conserva lo cargado, se muestra el error y se reintenta (sin caer al camino offline); given un ticket lleno (50 líneas) Then producto y lote quedan guardados, no se agrega la línea y se avisa. ADR: 0106. Talla M. Depende de: VP3-S10.

## Épica VP3-E3. Alta provisoria offline

Requisito VP3-R4. Sin conexión, la venta no se frena y el alta queda como Producto provisorio.

- Historia VP3-S12. Alta provisoria offline. AC: Given el dispositivo sin conexión When se escanea un Código desconocido Then el aviso ofrece «Cargar provisorio» en lugar del formulario completo, con la aclaración «Sin conexión: se carga provisorio; completá el stock cuando vuelvas a tener red»; el formulario provisorio pide Nombre, Precio de venta y Cantidad a vender (sin stock, vencimiento ni ubicación) y al confirmar agrega la línea con `alta: { nombre }` y actualiza el snapshot con `agregarProvisorio` (stock 0, precio). ADR: 0106. Talla M. Depende de: VP3-S7.
- Historia VP3-S13. Cola de stock inicial y conservación de `linea.alta`. AC: Given un alta online Then crea un producto normal (`origen` nulo) con movimiento ALTA y **no** entra a la cola «Cargá el stock inicial»; given un alta provisoria offline Then crea un Producto provisorio (`origen = "alta_al_vender"`, stock 0) y sí entra a la cola; el camino `linea.alta` de `POST /api/sales` y `aplicarVentaOutbox` se conserva en el servidor y en la UI offline, y solo desaparece del camino online. ADR: 0106. Talla S. Depende de: VP3-S12.

## Dependencias externas

- Endpoints existentes: `GET /api/products?codigo=` / `?q=`, `POST /api/products`, `POST /api/stock/ingreso` (alias de `POST /api/lots`), `GET /api/locations`, `POST /api/sales` y `POST /api/sync/push`. No se crea ningún endpoint nuevo.
- `POST /api/products` debe pasar a respetar `Idempotency-Key` (cambio de código sin migración; fallback: releer por código tras un 409).
- Snapshot `offline:catalogo:<tenantId>`: se suma un mapa opcional `nombres` sin cambiar `VERSION_CATALOGO`.
- Permisos: Dueño y Empleado ven el flujo; `POST /api/products` ya no exige `crear_productos` (ADR-0128). Un 403 se muestra como «No tenés permiso para dar de alta productos».
- Sin cambios en `drizzle/*.sql`, sin migraciones: `products`, `stock_lots`, `stock_movements` y `locations` ya soportan todos los datos requeridos.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Código conocido | escaneo de un producto existente | ficha con nombre, código, precio y stock; la línea se suma solo al confirmar la cantidad |
| Feliz | Re-escaneo | escaneo de un código ya en el ticket | «Ya en el ticket: N → N+1» y al confirmar suma con `fusionarLinea` |
| Feliz | Alta completa | código desconocido + formulario completo | doble POST idempotente, producto normal con lote, línea sin `alta`, no entra a la cola de stock inicial |
| Borde | Vencimiento | fecha 2026-11-25 | lote con `vence_el` a las 23:59:59.999 de Argentina; la fecha mostrada no se corre un día |
| Borde | Lote genérico | sin fecha | `controla_vencimiento = false`, lote genérico (`vence_el: null`) |
| Fallo | Lote falla | producto creado, `POST /api/stock/ingreso` falla | formulario bloqueado con «Reintentar» que manda solo el lote con la misma key |
| Fallo | 409 real | otro dispositivo creó el código | releer por código y «Usar este producto», sin crear lote ajeno |
| Fallo | Stock insuficiente | ficha con stock 0 o menor a la cantidad | aviso sin bloquear (unidades); peso se rechaza con `SIN_STOCK` al cobrar |
| Offline | Alta provisoria | sin conexión, código desconocido | «Cargar provisorio», línea con `alta: { nombre }`, snapshot stock 0, entra a la cola de stock inicial |
| Permisos | Sin `crear_productos` | Empleado ve el flujo | alta permitida (ADR-0128); un 403 se muestra como mensaje de permiso |
| Diseño | 390px | primer pantallazo en móvil | stepper grande, ticket como resumen, sin perder funcionalidad |

## Cierre del mapa

| Decisión | Gist |
|---|---|
| [Paso de confirmación de cantidad (#528)](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/528) | Ficha completa (nombre, código, precio, stock), foco en `#sku`, Enter confirma, re-escaneo suma con `fusionarLinea`, precio editable solo en línea nueva, stock avisa no bloquea. |
| [Notificación y formulario de alta completa (#529)](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/529) | Aviso inline en dos pasos; alta online con SKU = código, stock 1..999, vencimiento opcional y ubicación existente; doble POST idempotente; offline cae al alta provisoria con `linea.alta`. |
| [Maqueta de /venta (#530)](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/530) | Gana la variante C «paso a paso» (stepper grande, ticket como resumen), mejor en móvil; el contrato de #528/#529 no cambia, solo su piel. |
| [Forma del PRD, ADR-0106 y glosario (#531)](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/531) | PRD-VP-03 aceptado, tres épicas, modifica ADR-0106 y actualiza el glosario. |

**No queda nada por decidir antes de ejecutar.**

## Fuera de alcance

- La ejecución en código de `/venta` (`src/pages/venta.astro`, `src/modules/stock/escaner.ts`, tests): este PRD entrega la spec lista para implementar después.
- Exponer `por_peso` o costo en el mostrador, y stock inicial mayor a 999.
- Crear ubicaciones al vuelo desde `/venta`.
- Encolar el alta completa (producto + lote) en el outbox offline.
- Cambios en `/panel/stock` (ya en `PRD-STOCK-04`) o en el paso de cobro/medios de pago (`#paso-cobro`).
- Migraciones de base de datos (`drizzle/*.sql`).
