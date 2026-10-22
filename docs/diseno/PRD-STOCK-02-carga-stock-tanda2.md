---
id: PRD-STOCK-02
tipo: prd
estado: hecho
modulos: [inventario, catalogo]
depende_de: [ADR-0062, ADR-0106, ADR-0107, PRD-STOCK-01, ADR-0108]
reemplaza: []
reemplazado_por: ""
resumen: |
  Tanda 2 para cargar stock desde CSV o Excel: plantilla, vista previa sin escritura, errores por fila y
  confirmación idempotente que suma cantidades como ALTA. La migración `0035_stock_imports` se aplicó el 2026-10-21 y quedó registrada.
> Estado al 2026-10-21: hecho. STOCK-E3 implementado con vista previa, confirmación, plantilla CSV y errores por fila.
---
# PRD-STOCK-02 - Carga de stock Tanda 2: importación desde CSV o Excel

Fuente: `docs/03-inventario-precios/inventario-parte-1.md` (F1), `docs/03-inventario-precios/inventario-parte-2.md` (Flujo 1), `docs/03-inventario-precios/inventario-parte-3.md` (Fase 2), `docs/diseno/PRD-STOCK-01-carga-stock-tanda1.md`, `docs/adr/0106-producto-provisorio-alta-al-vender.md`, `docs/adr/0107-plantilla-catalogo-por-rubro.md`, `src/db/schema.ts` (`products`, `stock_lots`, `stock_movements`), `src/lib/repos/catalogo.ts`, `src/lib/repos/stock.ts`, `src/lib/repos/lotes.ts`, `src/lib/ingreso-lote.ts`, `src/pages/api/stock/ingreso.ts`, `src/pages/panel/stock.astro`, `src/lib/control.ts`, `package.json`. Fecha de extracción: 2026-10-20. Restringido por ADR-0062, ADR-0106, ADR-0107 y ADR-0108.

## Problema

La tanda 1 resuelve el alta al vender y el catálogo sugerido por rubro, pero el dueño que ya tiene su catálogo en una planilla sigue cargando producto por producto. El ingreso actual acepta un SKU por request (`loteSchema`, `src/lib/ingreso-lote.ts:6-13`), con un máximo de 999 unidades, y `crearLote` inserta el lote con FK a `products.sku` (`src/lib/repos/lotes.ts:201-245`), así que no crea el producto que falta. No existe un parser de CSV, Excel o XLSX en el proyecto. `src/pages/api/stock` solo tiene `conteo.ts` e `ingreso.ts`, y `package.json` no declara una librería de Excel. La importación masiva está en el roadmap como P1, en `docs/03-inventario-precios/inventario-parte-1.md:665` y `docs/03-inventario-precios/inventario-parte-3.md:349`, y el onboarding la ofrece como camino de carga en `docs/03-inventario-precios/inventario-parte-2.md:395`.

El costo de no tenerla es directo. La carga de a uno no escala a un catálogo de 200 productos y no entra en la meta O1 del PRD de inventario, que pide cargar el stock inicial en menos de una jornada, medido hasta los 100 productos. La importación también reduce los errores de tipeo de SKU y precio, que después rompen la venta y el conteo.

## Épica STOCK-E3. Importar catálogo y stock desde un archivo

Requisito STOCK-R3: el dueño sube un CSV o un XLSX, ve una vista previa con el estado de cada fila, corrige los errores y confirma. La confirmación crea los productos nuevos, suma la cantidad como ALTA a los existentes y no duplica stock en reintentos.

- Historia STOCK-S10. Plantilla y contrato de columnas. AC: Given el dueño abre `/panel/stock/importar` When descarga la plantilla Then recibe un CSV UTF-8 con BOM, encabezados `sku,nombre,precio,cantidad,sector`, una fila de ejemplo y la explicación de que `precio` va en pesos con hasta dos decimales y `cantidad` se suma al stock actual; Given sube un archivo al que le falta una columna obligatoria Then recibe 422 `COLUMNAS_FALTANTES` con la lista de columnas que faltan y no se escribe nada. ADR: 0108. Talla S. Depende de: nada.
- Historia STOCK-S11. Vista previa sin escritura. AC: Given un CSV o XLSX válido When sube el archivo Then `POST /api/stock/importar/preview` devuelve `archivo` (`nombre`, `sha256`, `bytes`, `formato`), `resumen` (`total`, `validas`, `nuevas`, `existentes`, `con_error`) y una fila por registro con `estado` `nueva`, `existente` o `error`; las filas válidas traen `stock_actual` y `stock_resultante` y las filas con error traen `errores`; no se escribe en `products`, `stock_movements` ni `stock_imports`; Given el archivo es `.xls`, un PDF o un tipo no soportado Then 415; Given pesa más de 2 MB Then 413. ADR: 0108. Talla M. Depende de: STOCK-S10.
- Historia STOCK-S12. Errores por fila y por campo. AC: Given una fila con SKU vacío, precio inválido, cantidad no entera o sector inválido When previsualiza Then la fila queda en `estado: "error"` con `errores: [{ campo, codigo, mensaje }]` y las demás filas conservan su estado; Given dos filas con el mismo SKU Then ambas quedan en error `SKU_DUPLICADO_EN_ARCHIVO` y no se importa ninguna de las dos; Given una fila completamente vacía Then se ignora y no cuenta como error; Given un CSV con coma decimal (`1500,50`) Then el precio se interpreta como 150050 centavos. ADR: 0108. Talla M. Depende de: STOCK-S11.
- Historia STOCK-S13. Confirmar e importar solo las filas válidas. AC: Given la vista previa con 3 filas válidas y 1 con error When confirma Then `POST /api/stock/importar/confirmar` aplica las 3 válidas en una transacción, crea los productos nuevos con `stock_actual = 0`, crea un lote sin vencimiento por fila y un movimiento `ALTA` con `motivo = "importacion"`, y suma la cantidad a los existentes sin tocar `nombre`, `precio_centavos`, `sector` ni `location_id`, y responde 201 con `importacion_id`, `filas_importadas`, `filas_nuevas`, `filas_existentes`, `filas_error` y `movimientos`; Given ninguna fila es válida Then 422 `SIN_FILAS_VALIDAS` y no escribe; Given la importación termina Then la pantalla de resultado muestra las filas importadas y el stock resultante, y `/panel/stock` lista los productos nuevos. ADR: 0108. Talla L. Depende de: STOCK-S12.
- Historia STOCK-S14. Reintento idempotente y archivo cambiado. AC: Given una confirmación exitosa When el cliente reintenta con la misma `Idempotency-Key` y el mismo `archivo_sha256` Then 200 con `reintento: true` y ningún movimiento nuevo; Given la misma key con otro hash Then 409 `ARCHIVO_CAMBIADO`; Given dos confirmaciones concurrentes con la misma key Then una aplica y la otra lee la fila de `stock_imports` y responde `reintento: true`; el stock no se duplica. ADR: 0108. Talla M. Depende de: STOCK-S13.
- Historia STOCK-S15. Permisos, límites y conexión. AC: Given un empleado sin `crear_productos` When confirma Then 403 y no escribe; Given el dueño o un empleado con `crear_productos` Then puede confirmar; Given un archivo con más de 1000 filas de datos Then 422 `DEMASIADAS_FILAS` y no escribe; Given el usuario está sin red Then la pantalla explica que la importación necesita conexión y no encola nada. ADR: 0108. Talla S. Depende de: STOCK-S13.

## Métricas

| Métrica | Fuente | Meta |
|---|---|---|
| Tiempo hasta la primera importación | desde el alta del tenant hasta el primer `stock_imports.creado_en` | menos de 1 día |
| Filas importadas por importación | mediana de `stock_imports.filas_importadas` | 50 o más |
| % de filas importadas sin error | `filas_importadas` sobre `filas_total` en `stock_imports` | subir tras la primera semana |
| % de importaciones con al menos una fila | importaciones con `filas_importadas > 0` sobre el total | subir tras el primer mes |
| Importaciones duplicadas | mismo `archivo_sha256` en 24 h | 0 |
| Productos con stock después de importar | `products.stock_actual > 0` sobre el total | subir tras la primera semana |

## Fuera de alcance

Listas de precios de proveedor, costos, historial de costos, fotos, códigos de barras, categorías, fechas de vencimiento y costos por lote, actualización de `nombre`, `precio_centavos`, `sector` o `location_id` de productos existentes, importación de mermas o devoluciones, varias hojas del mismo libro, formato `.xls` binario, evaluación de fórmulas, mapeo manual de columnas, edición de la vista previa, importación offline y jobs en segundo plano. La importación no reemplaza el ingreso por lote de un producto que controla vencimiento. No se toca el shape de `GET /api/sync/pull` ni de `POST /api/sync/push`. La importación no usa `products.origen` de ADR-0106.

## Dependencias externas

La importación depende de ADR-0108 y de la migración `0035_stock_imports`, aplicada el 2026-10-21 y registrada en `docs/roadmap/migraciones-aplicadas.md`.

El parseo de `.xlsx` necesita la dependencia de servidor `read-excel-file`. El CSV se parsea con un módulo local, sin dependencia nueva. El navegador no suma librerías de Excel.

La tanda 1 y esta tanda comparten la tabla `products` y la meta de carga inicial. `0033_products_origen` y `0034_tenant_product_seeds` están aplicadas; la importación no usa `products.origen` y lo deja en null. La procedencia queda en `stock_movements.motivo`.

## Migraciones (aplicadas el 2026-10-21)

| Tag | Qué hace | Estado |
|---|---|---|
| `0035_stock_imports` | crea `stock_imports` (`id` uuid PK, `idem_key` text único, `archivo_nombre` text, `archivo_sha256` text, `formato` text, `filas_total` integer, `filas_importadas` integer, `filas_nuevas` integer, `filas_existentes` integer, `filas_error` integer, `movimientos` integer, `creado_por` text, `creado_en` timestamp) | aplicada |

La tabla vive en la base del tenant, como `products` y `stock_movements`, así que no lleva `tenant_id` ni RLS. No se modifica el esquema de `products` ni de `stock_movements`.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | CSV con productos nuevos y existentes | 3 filas, 2 SKU nuevos y 1 existente | Vista previa con `nuevas: 2`, `existentes: 1`; confirmar crea 2 productos, 3 lotes sin vencimiento y 3 movimientos ALTA, y suma el stock del existente |
| Feliz | XLSX con una hoja | 2 filas en la primera hoja | Misma vista previa y mismo resultado que el CSV |
| Feliz | Precio con coma decimal | `1500,50` | `precio_centavos = 150050` |
| Feliz | CSV de Excel en Windows-1252 | Nombre con tilde | Se lee bien y la vista previa muestra una advertencia de codificación |
| Fallo | Falta una columna | Archivo sin `cantidad` | 422 `COLUMNAS_FALTANTES`, sin escritura |
| Fallo | Errores por fila | Precio vacío, cantidad `1,5`, sector `Bebidas!` | Filas en error con campo y mensaje; las válidas se pueden confirmar |
| Fallo | SKU repetido en el archivo | Dos filas con `COCA600` | Ambas en error `SKU_DUPLICADO_EN_ARCHIVO`, ninguna se importa |
| Fallo | Archivo demasiado grande | 3 MB | 413, sin parseo ni escritura |
| Fallo | Formato no soportado | `.xls` | 415, sin parseo ni escritura |
| Fallo | Sin filas válidas | Todas las filas con error | 422 `SIN_FILAS_VALIDAS`, sin escritura |
| Fallo | Reintento mismo archivo | Misma key y mismo hash | 200 `reintento: true`, sin movimientos nuevos |
| Fallo | Key reusada con otro archivo | Misma key, otro hash | 409 `ARCHIVO_CAMBIADO`, sin escritura |
| Fallo | Empleado sin permiso | Confirmar | 403, sin escritura |
| Fallo | Sin conexión | Confirmar offline | Mensaje de conexión requerida, sin entrada en la outbox |
| Regresión | Ingreso de mercadería | `POST /api/stock/ingreso` | Sigue creando lote y movimiento ALTA como hoy |
| Regresión | Invariante de stock | Después de importar | `products.stock_actual` es igual a la suma de `stock_movements.delta` y a la suma de `stock_lots.cantidad_restante` del SKU |

## Verificación contra el código

Verificado contra el código el 2026-10-20.

| Afirmación | Evidencia |
|---|---|
| `products.sku` es único y `products.stock_actual` existe | `src/db/schema.ts:17-32` |
| `products` no tiene `origen` en el esquema actual; ADR-0106 lo propone | `src/db/schema.ts:17-32`, `docs/adr/0106-producto-provisorio-alta-al-vender.md:22` |
| `stock_movements` es append-only y tiene `idem_key` y `motivo` | `src/db/schema.ts:290-299` |
| `stock_lots` guarda cantidad, restante, vencimiento y costo | `src/db/schema.ts:278-288` |
| `aplicarMovimiento` actualiza el stock, en single sin base cae al espejo y en multi propaga `BaseNoDisponible` | `src/lib/repos/stock.ts:139-149`, `src/lib/repos/_almacen.ts:96-99` |
| `altaProducto` inserta con `on conflict do nothing` y no aplica un movimiento de stock | `src/lib/repos/catalogo.ts:337-339` |
| `listarProductos` no devuelve `stock_actual` | `src/lib/repos/catalogo.ts:232-234` |
| `POST /api/stock/ingreso` acepta un SKU por request y no crea productos | `src/pages/api/stock/ingreso.ts:8`, `src/lib/ingreso-lote.ts:6-13` |
| `crearLote` inserta un lote con FK a `products.sku` | `src/lib/repos/lotes.ts:201-245` |
| Hay parser CSV/XLSX y rutas de importación | `src/modules/inventario/importacion.ts`, `src/lib/importacion-xlsx.ts`, `src/pages/api/stock/importar/{preview,confirmar,plantilla.csv}.ts`; `read-excel-file` en `package.json` |
| El rol efectivo sale de la sesión y la membership | `src/lib/control.ts:77-85` |
| `PERMISOS_EMPLEADO` incluye `crear_productos` | `src/lib/validation.ts:125-130` |
| `estadoAltaDesdeRol` activa el alta con el permiso | `src/modules/inventario/escaneo.ts:23-26` |
| El tope de sector es 40 y `products.ts` fija sku 64, nombre 200 | `src/pages/api/products.ts:20-23`, `src/modules/inventario/sectores.ts:10` |
| El file gate de grant offline responde 403 `sensible_solo_online` | `src/lib/offline-gate.ts:33`, `src/lib/offline-gate.ts:61` |
| Los repos ya usan `db.transaction` | `src/lib/repos/fiado.ts:140` |
| Las migraciones 0033, 0034 y 0035 están en el journal y aplicadas | `drizzle/meta/_journal.json`, `docs/roadmap/migraciones-aplicadas.md` |
| La importación masiva está en el roadmap P1 | `docs/03-inventario-precios/inventario-parte-1.md:665`, `docs/03-inventario-precios/inventario-parte-3.md:349` |
