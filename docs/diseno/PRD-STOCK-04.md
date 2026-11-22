---
id: PRD-STOCK-04
tipo: prd
estado: aceptado
modulos: [inventario, panel]
depende_de: [ADR-0124, ADR-0107, PRD-CAT-01, PRD-STOCK-01, PRD-STOCK-03]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Simplificación de /panel/stock: una próxima acción por estado del negocio, cola única
  «Completá tu catálogo», campo de código único y catálogo denso. Stock disponible se deriva
  del Historial. Sin cambios de esquema ni migraciones.
---
# PRD-STOCK-04 - Simplificación de /panel/stock

> Estado al 2026-11-22: aceptado. Las decisiones están cerradas en el mapa #421; la ejecución es posterior y se hace en la rama `mauri/ui-productos-simplificacion`.

Fuente: [Mapa: simplificar la UI de Productos (/panel/stock) con datos y lógica de la app](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/421) y [maqueta validada (variante A)](https://github.com/mauriciomatasini27-debug/sistema-inventario2/blob/prototype/ui-productos-stock/prototipos/ui-productos-stock.html). Restringido por [ADR-0124](../adr/0124-historial-stock-unica-fuente.md).

## Problema

`/panel/stock` es hoy la pantalla más cargada del panel: 9 paneles (7 de ellos formularios), 4 acciones rápidas, 4 campos de código de producto repetidos y 6 fetches incondicionales. En 390px el comerciante tiene que recorrer formularios para descubrir qué tiene pendiente; las deudas de onboarding (precio, stock inicial, catálogo sugerido) viven en paneles separados y el mismo movimiento se registra desde dos caminos distintos. El KPI «Con stock mínimo» cuenta productos con `min_stock` cargado, no productos bajo el mínimo, y `stock_actual` se muestra como si fuera la verdad cuando [ADR-0124](../adr/0124-historial-stock-unica-fuente.md) manda derivar el stock del Historial.

Este PRD fija una sola regla: **la pantalla muestra la próxima acción que el estado del negocio pide**, con el catálogo como fondo permanente. Los controles se derivan de datos, permisos y plan que la app ya tiene. No se agrega esquema, columna, migración, ruta ni permiso nuevo. En texto nuevo se escribe «Código de producto», nunca «SKU».

> Nota de numeración: `STOCK-E4` ya pertenece a [PRD-STOCK-03](PRD-STOCK-03-escaner.md) y `STOCK-E5` a los avances de alta de códigos. Esta épica usa `STOCK-E6`, requisitos `STOCK-R5`–`STOCK-R8` e historias `STOCK-S20`–`STOCK-S28`. Es una desviación mecánica de la decisión del mapa (que proponía `STOCK-E4`), no un cambio de contenido.

## Épica STOCK-E6. Una próxima acción por estado del negocio en /panel/stock

Requisito STOCK-R5. La pantalla elige una sola acción ganadora a partir de los datos existentes, con el catálogo siempre detrás.

- Historia STOCK-S20. Precedencia de la próxima acción. AC: Given pendientes de precio, de stock inicial, catálogo sugerido vigente y aviso de mínimo When entra a `/panel/stock` Then se evalúan en ese orden y solo se muestra la primera que aplica, con un contador «quedan N» alimentado por los totales; el aviso de mínimo nunca gana ni bloquea. Orden: `precio_centavos = 0` con `origen ∈ {plantilla_rubro, alta_al_vender}` (por ventas en 30 días) → `origen = 'alta_al_vender'` sin movimiento ALTA (por ventas en 30 días) → `leerSiembraProductos(tenantId) = false` (Dueño) → aviso informativo de mínimo → «todo al día». Talla L. Depende de: nada.
- Historia STOCK-S21. Permisos, plan y layout. AC: Given una fuente que exige crear productos y un rol sin `crear_productos` When se evalúa la precedencia Then esa fuente se omite y se evalúa la siguiente; completar precio y cargar stock inicial no son altas y sí se muestran; las features de plan (`alertas_email`, `alertas_whatsapp`, `bot_consulta`, `asistente_ia`) no aparecen en la pantalla y solo gobiernan accesos de **Más**. En escritorio: dos columnas, catálogo a la izquierda y acción a la derecha; en 390px: bloque de acción arriba y tabla debajo, sin overlay que tape la tabla. Talla M. Depende de: STOCK-S20.

Requisito STOCK-R6. Una cola única «Completá tu catálogo» sustituye a los tres paneles de deuda de onboarding.

- Historia STOCK-S22. Encadenamiento visible. AC: Given una deuda confirmada When se recalcula la precedencia Then la siguiente aparece dentro de la misma vista, sin navegación; el indicador de pasos cuenta solo los tipos disponibles para ese rol y ese momento (Dueño con catálogo resuelto: «1 de 2»; Empleado: «1 de 2»), se oculta con un solo tipo, los restantes se listan compactos y no accionables, y el Empleado omite el sugerido sin dejar hueco. Talla M. Depende de: STOCK-S20.
- Historia STOCK-S23. Descarte persistido y apagado. AC: Given el Dueño elige «Omitir sugerencias» When se descarta el catálogo sugerido Then se persiste en `tenantProductSeeds` con `cantidad: 0` y la `version` de la plantilla vigente, sin columnas nuevas; el descarte vale para todo el Comercio, no reaparece por `localStorage` ni por marca en memoria, y solo vuelve si cambia la versión de la plantilla. Given los tres totales (`listarPendientesStockInicial`, `listarPendientesPrecio` y sugerido) dan 0 When se re-evalúa tras una confirmación Then la cola desaparece y entra el estado «todo al día»: catálogo + CTA «Agregar producto» (si `crear_productos`) + acceso compacto a «Registrar movimiento». Talla L. Depende de: STOCK-S22.

Requisito STOCK-R7. Un solo campo de código y una sola forma de registrar movimientos.

- Historia STOCK-S24. Selector y escáner contextual. AC: Given el campo de código compartido When se elige entre «Agregar producto» (solo con `crear_productos`), «Registrar ingreso», «Contar stock» y «Consultar lotes» Then ese campo alimenta la acción activa y desaparecen los cuatro campos duplicados y el botón de cámara repetido; el escáner escribe siempre ahí, rellena y ejecuta con código conocido, y con código desconocido avisa «producto no encontrado» y ofrece el alta solo si hay permiso (en alta, precarga el código). Talla M. Depende de: STOCK-S21.
- Historia STOCK-S25. Ingreso fusionado e idempotente. AC: Given un ingreso de mercadería When se confirma Then es la misma operación que el alta de lote y no hay bloque separado de «Lotes FEFO» (queda como consulta); el formulario pide **Costo separado del Precio de venta** (0 por defecto, con aviso si se deja en 0), «Vence el» es opcional (con fecha crea lote con vencimiento; sin fecha usa el lote genérico), y un solo submit dispara dos POST (`/api/products` y `/api/stock/ingreso`) con `Idempotency-Key` distinto por operación; si falla el ingreso se ofrece reintentar solo el ingreso desde el campo de código, sin recrear el producto. La alta deja de registrar el precio de venta como costo. Talla L. Depende de: STOCK-S24.
- Historia STOCK-S26. Conteo con rol real y ubicaciones bajo demanda. AC: Given un conteo When se confirma Then se envía el rol efectivo real (`resolverRolEfectivo`) y desaparece el `rol: "dueno"` hardcodeado: Dueño confirma con motivo → `confirmado` + `AJUSTE_CONTEO`; Empleado confirma sin motivo → `listo_revisar`. Given «Ubicaciones» When se abre Then muestra un panel lateral con el alta y el renombrado actuales, sin panel permanente ni aviso descartable, sin ruta ni permiso nuevo. Talla M. Depende de: STOCK-S24.

Requisito STOCK-R8. Catálogo denso con KPIs que no mienten.

- Historia STOCK-S27. Columnas y Stock disponible. AC: Given el catálogo When se renderiza Then muestra cinco columnas — **Código de producto, Nombre, Precio, Stock disponible, Mínimo** — con el Nombre como jerarquía principal y sin «A reponer» (vive en `/panel/alertas/umbrales`); «Stock disponible» se deriva del Historial de stock (`Σ delta` de `stock_movements` del tenant, excluyendo sobreventa), `products.stock_actual` y `stock_lots.cantidad_restante` son solo proyecciones a verificar, y si desvían o no hay base la celda muestra «—» con aviso, nunca un número falso. Talla L. Depende de: STOCK-S21.
- Historia STOCK-S28. KPI «Bajo mínimo» y mínimo vacío. AC: Given el Stock disponible verificable When se calcula el KPI Then «Bajo mínimo» cuenta los productos con Stock disponible < `min_stock`, los no verificables se excluyen y se informan aparte como «N sin verificar», y el resumen dice «N productos · N con mínimo cargado» en vez del viejo KPI «Con stock mínimo». Given `min_stock = null` When se muestra la celda Then dice «—» con la pista «sin mínimo cargado: la alerta usa rotación de 7 días», sin calcular la rotación en la tabla. Talla M. Depende de: STOCK-S27.

## Deudas declaradas

No se gradúan a tickets ni sacan contenido de esta spec; quedan explícitas para no confundir «no se muestra» con «se eliminó»:

- **Campos de API sin uso por el panel**: `sector`, `controla_vencimiento`, `min_stock`, `reorder_qty` y `foto`. No se agregan controles nuevos; cada uno ya tiene su flujo (umbrales, siembra por rubro, carga de fotos).
- **Foto e iniciales**: `FichaListado` las calcula en servidor pero `ProductoCatalogo` las descarta; no entran en esta iteración para mantener la tabla legible en 390px.
- **Revisión de conteos de Empleado** (`listo_revisar`): no se implementa acá; queda para un ítem posterior a #163. Esta spec solo evita que un conteo de Empleado se confirme falsamente como Dueño.
- **Métrica de pasos hasta resolver cada pendiente**: no se define en este PRD; el contador «quedan N» y el indicador de pasos son lo que se entrega ahora.
- **Satélites**: `/panel/precios`, `/panel/alertas/umbrales` y `/panel/stock/importar` quedan fuera del alcance elegido (solo `/panel/stock`).
- **Componentes huérfanos**: reaprovechar `StockCard.astro`, `PreciosCard.astro` y el aviso de stock bajo del Inicio de #158 no es parte de esta entrega.
- **ADR-0124 pendiente de implementación**: la agregación del Historial para el catálogo es lógica de app nueva; `npm run conciliar:stock` hoy solo reporta desvíos, no los corrige.

## Dependencias externas

- Funciones y repos ya presentes: `listarPendientesPrecio`, `listarPendientesStockInicial` (ambos `{ items, total }`), `leerSiembraProductos`, `VERSION_PLANTILLAS_PRODUCTOS_RUBRO`, `resolverRolEfectivo`, `panel-resumen.ts`, `catalogo-panel.ts` (hay que extender `ProductoCatalogo` con el Stock disponible derivado), `tenantProductSeeds`, `catalogo-aviso.ts` y `eventos-control.ts` (pierden la fuente de verdad del descarte).
- Endpoints existentes de productos, movimientos, lotes, conteos y ubicaciones. `POST /api/lots` y `/api/stock/ingreso` son alias; no se crea uno nuevo. Escáner según [PRD-STOCK-03](PRD-STOCK-03-escaner.md) / ADR-0114 y plantillas por rubro según [ADR-0107](../adr/0107-plantilla-catalogo-por-rubro.md).
- Carga: 4 fetches eager (catálogo + tres fuentes de deuda) y 2 lazy (búsqueda de lotes y ubicaciones). Tras confirmar se recarga solo la fuente resuelta y el catálogo.
- Sin cambios en `drizzle/*.sql`, sin migraciones, sin feature flags ni matriz nueva permisos × plan. El plan solo filtra accesos de **Más**.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Precedencia | precio pendiente + stock inicial pendiente + sugerido vigente | aparece solo «Completar precio» con «quedan N» |
| Feliz | Encadenamiento | se completa el precio y queda stock inicial | la cola muestra la siguiente sin navegación |
| Feliz | Todo al día | los tres totales en 0 | catálogo + CTA «Agregar producto» + acceso a «Registrar movimiento» |
| Permisos | Sin `crear_productos` | Empleado con precio pendiente y sugerido vigente | ve precio y stock inicial; omite el sugerido sin hueco y no ve el alta |
| Persistencia | Descarte | «Omitir sugerencias» con versión vigente | fila en `tenantProductSeeds` con `cantidad: 0`; no reaparece en otro dispositivo |
| Persistencia | Cambio de versión | plantilla nueva tras el descarte | el sugerido reaparece automáticamente, sin re-apertura manual |
| Feliz | Código único | código conocido en «Contar stock» | rellena el campo y ejecuta esa acción; no hay campos duplicados |
| Fallo | Código desconocido | ingreso por escáner con permiso | avisa «producto no encontrado» y ofrece el alta; sin permiso, no la ofrece |
| Fallo | Doble POST | falla `/api/stock/ingreso` tras crear el producto | avisa y ofrece reintentar solo el ingreso; `Idempotency-Key` distinto por operación |
| Rol | Conteo | Empleado confirma | estado `listo_revisar`, nunca `confirmado` como Dueño |
| Datos | Desvío de stock | Historial ≠ proyección | celda «—» con aviso; el producto no cuenta para «Bajo mínimo» y suma a «N sin verificar» |
| Datos | Mínimo vacío | `min_stock = null` | «—» con pista de rotación 7d; no se calcula la rotación en la tabla |
| Diseño | 390px | primer pantallazo en móvil | bloque de acción arriba, tabla debajo, nav fija sin tapar contenido |

## Handoff a #163

Este PRD entrega **solo `/panel/stock`**. A [Adaptar el resto de las pantallas al tablero B y validar en móvil](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/163) se le pasa el enlace a este documento y un resumen de cinco líneas, sin modificar sus criterios de aceptación: (1) una próxima acción por estado del negocio con el catálogo de fondo; (2) cola única «Completá tu catálogo» con descarte persistido; (3) campo de código único con cuatro acciones y escáner contextual; (4) tabla densa de cinco columnas con Stock disponible derivado del Historial; (5) KPI «Bajo mínimo» y «N sin verificar». La maqueta de referencia es la variante A del asset indicado arriba (commit `d082ee8`, rama desechable `prototype/ui-productos-stock`, sin PR y nunca se mergea). Las deudas declaradas no se entregan como tickets nuevos.

## Cierre del mapa

| Decisión | Gist |
|---|---|
| [Regla de derivación de la próxima acción](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/422) | Precedencia precio → stock inicial → sugerido → aviso de mínimo; una ganadora y contador «quedan N»; salto por permiso, plan fuera de la pantalla. |
| [Contrato de la cola única](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/423) | Auto-avance, indicador de pasos disponibles, descarte persistido en `tenantProductSeeds`, 4 fetches eager y 2 lazy. |
| [Campo de código único y unificación de movimientos](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/424) | Cuatro acciones, escáner contextual, costo separado, conteo con rol real, ubicaciones en panel lateral, `Idempotency-Key` por operación. |
| [Prototipo de la pantalla](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/425) | Gana la variante A: acción + catálogo, dos columnas en escritorio y acción arriba en 390px. |
| [Columnas y KPIs del catálogo](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/426) | Cinco columnas, Stock disponible derivado del Historial, «Bajo mínimo» + «N sin verificar», mínimo vacío con pista de rotación 7d. |
| [Forma del PRD y handoff a #163](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/427) | PRD nuevo `aceptado`, épica con cuatro requisitos, avance chico con `prd:` y sin `adr:`, deudas declaradas. |

**No queda nada por decidir antes de ejecutar.**

## Fuera de esta entrega

Implementar la simplificación, tocar la piel del tablero B ni las otras pantallas de #163, agregar campos de base o migraciones, o mergear: la ejecución sigue en `mauri/ui-productos-simplificacion` y el merge lo hace Mauri.
