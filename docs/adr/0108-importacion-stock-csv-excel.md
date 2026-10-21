---
id: ADR-0108
tipo: adr
estado: propuesto
modulos: [inventario, catalogo]
depende_de: [ADR-0062, ADR-0106, ADR-0107, PRD-STOCK-01]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  La importación de stock es online, con parseo en el servidor y vista previa sin escritura. Confirmar
  vuelve a subir el mismo archivo y aplica solo las filas válidas en una transacción, con una fila en
  stock_imports para idempotencia y auditoría. La cantidad se suma como ALTA.
---
# ADR-0108 - Importación de stock desde CSV o Excel con vista previa y errores por fila

Estado: propuesto. Fecha: 2026-10-20. Fuentes: `docs/03-inventario-precios/inventario-parte-1.md` (F1), `docs/03-inventario-precios/inventario-parte-3.md` (Fase 2), `docs/diseno/PRD-STOCK-01-carga-stock-tanda1.md`, `docs/adr/0106-producto-provisorio-alta-al-vender.md`, `docs/adr/0107-plantilla-catalogo-por-rubro.md`, `src/db/schema.ts` (`products`, `stock_lots`, `stock_movements`), `src/lib/repos/catalogo.ts` (`altaProducto`, `listarProductos`), `src/lib/repos/stock.ts` (`aplicarMovimiento`, `movimientoDuplicado`), `src/lib/ingreso-lote.ts`, `src/pages/api/stock/ingreso.ts`, `src/pages/panel/stock.astro`, `src/lib/control.ts` (`resolverRolEfectivo`), `src/modules/inventario/escaneo.ts` (`estadoAltaDesdeRol`), `package.json`.

## Decisión

La importación tiene tres pasos. El dueño descarga una plantilla, sube el archivo para ver la vista previa y confirma. La vista previa no escribe. La confirmación vuelve a subir el mismo archivo y aplica las filas válidas.

La forma del dominio es una importación con filas. `ImportacionStock` tiene `archivo`, `resumen`, `columnasIgnoradas` y `filas`. Cada `FilaImportacion` es una unión discriminada:

- `estado: "nueva"` o `estado: "existente"`, con `sku`, `nombre`, `precioCentavos`, `cantidad`, `sector`, `stockActual` y `stockResultante`, y `errores: []`.
- `estado: "error"`, con `fila`, `crudo` y `errores: ErrorFila[]`.

Una fila con errores no se puede aplicar. `ErrorFila` tiene `campo`, `codigo` y `mensaje`. El borde HTTP usa snake_case (`precio_centavos`, `stock_actual`) y el dominio usa camelCase, como el resto del repo.

El parseo corre en el servidor. Un módulo puro `src/modules/inventario/importacion.ts` parsea CSV, detecta el delimitador entre coma, punto y coma y tabulación, normaliza los encabezados y valida cada fila. El CSV se decodifica como UTF-8 con BOM o sin BOM. Si la decodificación UTF-8 falla, se decodifica como Windows-1252 y la vista previa devuelve una advertencia. Un adaptador `src/lib/importacion-xlsx.ts` lee `.xlsx` con la dependencia `read-excel-file` y devuelve las mismas filas crudas. Para `.xlsx` se lee la primera hoja; las demás se ignoran. No se agrega una librería de Excel al bundle del navegador. No se acepta el formato `.xls` binario.

La plantilla es un CSV UTF-8 con BOM y los encabezados `sku,nombre,precio,cantidad,sector`. `precio` se escribe en pesos con hasta dos decimales y se convierte a centavos con aritmética entera. `cantidad` es un entero positivo. `sector` vacío usa `general`; un sector no vacío debe cumplir `SECTOR_RE` (`src/modules/inventario/sectores.ts:10`), si no la fila queda en error. Se aceptan alias de encabezado (`producto`, `descripcion`, `precio_venta`, `precio_unitario`, `stock`, `cantidad_inicial`). Las columnas desconocidas se ignoran y se informan en `columnas_ignoradas`. Si falta una columna obligatoria, el archivo se rechaza entero.

La confirmación aplica solo las filas válidas. Cada fila nueva crea un producto con `stock_actual = 0`, `nombre`, `precio_centavos` y `sector`. Cada fila válida, nueva o existente, crea un lote sin vencimiento en `stock_lots` (`cantidad = cantidad`, `cantidadRestante = cantidad`, `venceEl = null`, `costoCentavos = 0`) y un movimiento `ALTA` con `delta = cantidad` y `loteId = <lote_id>`. Una fila existente solo suma stock; no toca `nombre`, `precio_centavos`, `sector` ni `location_id` del producto existente. La cantidad se suma, no se fija. Para fijar un stock exacto está el conteo ciego (`POST /api/stock/conteo`). El movimiento usa `idemKey = import:<importacion_id>:<sku>`, `tipo = "ALTA"` y `motivo = "importacion"`. Los contadores de la respuesta salen del estado al confirmar, no de la vista previa: un SKU que se creó entre la vista previa y la confirmación cuenta como existente.

Los productos nuevos se insertan con `on conflict do nothing`, el literal de `altaProducto` (`src/lib/repos/catalogo.ts:337-339`). El lote se inserta primero y su `id` va en el movimiento. La importación, los productos, los lotes y los movimientos van en una sola transacción. Si una fila falla en la base, no se aplica ninguna. En single sin base se usa el espejo en memoria con la misma regla de todo o nada. En multi sin base se responde 503.

La idempotencia vive en una tabla nueva `stock_imports`, una fila por importación, con `idem_key` único, `archivo_sha256`, `archivo_nombre`, `formato`, contadores y `creado_por` (text, el google sub del usuario; sin FK porque `users` vive en control). La fila se inserta en la misma transacción. Si la `Idempotency-Key` ya existe con el mismo hash, la respuesta es 200 con `reintento: true` y no se escribe nada. Si existe con otro hash, la respuesta es 409 `ARCHIVO_CAMBIADO`. La vista previa devuelve el hash en `archivo.sha256` y la confirmación lo exige en el campo `archivo_sha256`. Así el archivo que se importa es el que se previsualizó, y un reintento no duplica stock.

Los límites son 2 MB de archivo, 1000 filas de datos, 20 columnas, 64 caracteres de SKU, 200 de nombre y 40 de sector, los mismos topes vigentes (`src/pages/api/products.ts:20-23`; el sector lo fija `SECTOR_RE`, `src/modules/inventario/sectores.ts:10`) y el tope de archivo sigue los 2 MB de `src/pages/api/media/upload-url.ts:9`. Un archivo más grande responde 413, uno con más filas responde 422 `DEMASIADAS_FILAS`, un formato no soportado responde 415. Las filas completamente vacías se ignoran y no cuentan como error.

La importación es solo online. No entra en `slice0-outbox` ni en `POST /api/sync/push`. La confirmación rechaza un request con marcas de grant offline con 403 `sensible_solo_online`, el mismo gate `exigirOnlineParaSensible` que las operaciones sensibles (`src/lib/offline-gate.ts:33`). La pantalla `/panel/stock/importar` muestra el estado sin conexión y no encola nada.

La vista previa la puede pedir cualquier miembro activo. Confirmar exige Dueño o un empleado con el permiso `crear_productos` (`src/lib/validation.ts:125-132` y `src/modules/inventario/escaneo.ts:23`). El rol sale de `resolverRolEfectivo` (`src/lib/control.ts:77`), nunca del cuerpo.

Las rutas son `POST /api/stock/importar/preview`, `POST /api/stock/importar/confirmar` y `GET /api/stock/importar/plantilla.csv`. Los dos POST reciben `multipart/form-data` con el campo `archivo`. La confirmación exige `Idempotency-Key` y el campo `archivo_sha256`.

## Por qué

El parseo en el servidor deja una sola implementación de las reglas. El cliente no puede inventar filas válidas ni necesita una librería de Excel. La vista previa sin escritura permite equivocarse sin ensuciar el catálogo.

Volver a subir el archivo en la confirmación evita guardar archivos temporales o sesiones de importación. La vista previa es una lectura, no un contrato de confianza. El hash obliga a que las dos subidas sean el mismo archivo.

La suma como `ALTA` conserva la invariante de `stock_movements` append-only y `products.stock_actual` como caché (`src/db/schema.ts:290-299`, `src/lib/repos/stock.ts:114-150`). Fijar el stock desde una planilla choca con ventas concurrentes y con el conteo ciego. La suma es la operación que ya existe en el ingreso de mercadería.

Una transacción evita el estado intermedio de una importación a medias. `aplicarMovimiento` no alcanza para esto porque inserta el movimiento y actualiza el stock fuera de una transacción y, en single sin base, cae al espejo en memoria sin propagar el error; en multi propaga como `BaseNoDisponible` (`src/lib/repos/stock.ts:139-149`, `src/lib/repos/_almacen.ts:96-99`). La importación necesita preservar esa propagación y revertir todo.

`stock_imports` resuelve dos cosas que los `idem_key` por fila no resuelven. Distingue un reintento del mismo archivo de una key reusada con otro archivo, y deja un registro de cuántas filas se importaron. Sin esa tabla, una key con un archivo distinto podría aplicar las filas nuevas y saltar las repetidas, que es un resultado peor que un 409.

No tocar `nombre`, `precio_centavos` ni `sector` de un producto existente evita pisar datos que el dueño ya corrigió. El precio de la planilla solo se usa al crear. Actualizar precios es otra operación.

## Qué cambia

- `src/modules/inventario/importacion.ts` nuevo, puro, con el parseo CSV, la plantilla, la conversión de precio a centavos y la validación por fila.
- `src/lib/importacion-xlsx.ts` nuevo, adaptador de `.xlsx` con `read-excel-file`.
- `src/lib/repos/importaciones.ts` nuevo para `stock_imports` y la búsqueda por `Idempotency-Key`.
- `src/lib/repos/stock.ts` suma una función de importación en lote, con una transacción y sin el fallback silencioso de `aplicarMovimiento`.
- `src/lib/repos/catalogo.ts` suma `leerProductosPorSkus`, porque `listarProductos` no selecciona `stock_actual` (`src/lib/repos/catalogo.ts:232-234`) y la vista previa necesita el stock actual y el resultante.
- `src/pages/api/stock/importar/preview.ts`, `confirmar.ts` y `plantilla.csv.ts` nuevos.
- `src/pages/panel/stock/importar.astro` nuevo y un enlace desde `/panel/stock`.
- Migración propuesta `0035_stock_imports`, no aplicada. El tag salta `0033`/`0034` porque ADR-0106 y ADR-0107 los reservan para el PR de código de la tanda 1.
- No cambia el shape de `POST /api/products`, `POST /api/stock/ingreso`, `GET /api/sync/pull` ni `POST /api/sync/push`.

## Alternativa descartada

Parsear el archivo en el navegador. Agrega una librería al bundle, duplica las reglas de validación y obliga a confiar en las filas que manda el cliente.

Confirmar con un JSON de filas que devolvió la vista previa. El cliente puede cambiar cantidades o precios entre la vista previa y la confirmación, y el payload crece con cada fila.

Derivar la idempotencia solo de `idem_key` por fila, sin `stock_imports`. No distingue una key reusada con otro archivo y no deja auditoría de la importación.

Fijar `stock_actual = cantidad` en vez de sumar. Una planilla atrasada borra ventas concurrentes y rompe la suma de movimientos.

Reusar `aplicarMovimiento` una vez por fila. No es atómico entre filas y esconde los errores de base.

Mandar la importación por la outbox como una operación offline. Es una tarea de administración, no una operación de mostrador, y necesita leer el catálogo actual para la vista previa.

## Pendientes

Mauri debe aprobar la migración `0035_stock_imports` antes de aplicarla. El PR de código que la traiga agrega `drizzle/0035_stock_imports.sql` (el tag queda reservado para este cambio, no lo usa la tanda 1) y la registra en `docs/roadmap/migraciones-aplicadas.md` después de aplicarla. Este PR de docs no agrega `drizzle/*.sql`.

Fijar la versión de `read-excel-file` y confirmar que corre en el adaptador Node de Astro. La dependencia es solo del servidor.

Definir el contenido inicial de la plantilla y los alias de encabezado en el PR de código. La lista de la Decisión es la v1.

`products.origen` de ADR-0106 no se usa en esta importación. Si esa columna ya existe, la importación deja `origen` en null. La procedencia queda en `stock_movements.motivo`.

No se importan costos ni fechas de vencimiento. La cantidad entra en un lote sin vencimiento y costo 0. Para un producto que controla vencimiento, el alta por lote sigue siendo el camino. Fotos, códigos de barras y categorías van en otra tanda.

## Evidencia de verificación

Verificado contra el código el 2026-10-20.

| Afirmación | Evidencia |
|---|---|
| `products.sku` es único y `products.stock_actual` existe | `src/db/schema.ts:17-32` |
| `stock_movements` tiene `idem_key`, `sku`, `delta`, `tipo` y `motivo` | `src/db/schema.ts:290-299` |
| `stock_lots` tiene `sku`, `cantidad`, `cantidadRestante`, `venceEl` y `costoCentavos` | `src/db/schema.ts:278-288` |
| `aplicarMovimiento` inserta el movimiento, actualiza el stock, en single sin base cae al espejo y en multi propaga `BaseNoDisponible` | `src/lib/repos/stock.ts:139-149`, `src/lib/repos/_almacen.ts:96-99` |
| `aplicarMovimiento` no abre una transacción | `src/lib/repos/stock.ts:130-143` |
| `altaProducto` inserta con `on conflict do nothing` y no aplica un movimiento de stock | `src/lib/repos/catalogo.ts:337-339` |
| `listarProductos` no selecciona `stock_actual` | `src/lib/repos/catalogo.ts:232-234` |
| `SECTOR_RE` fija 40 caracteres y `products.ts` topa sku 64, nombre 200 y sector 64 | `src/pages/api/products.ts:20-23`, `src/modules/inventario/sectores.ts:10` |
| El gate exige online con `exigirOnlineParaSensible` y responde 403 `sensible_solo_online` | `src/lib/offline-gate.ts:33`, `src/lib/offline-gate.ts:61` |
| Los repos ya usan `db.transaction` | `src/lib/fiscal-emitir.ts:123`, `src/lib/repos/fiado.ts:140` |
| `users` vive en la base de control por URL, no por un esquema aparte | `src/lib/db.ts:35-37`, `src/lib/control-db.ts:2` |
| El repo llega a `0032_tenant_location_seeds`; las migraciones de la tanda 1 no están en `drizzle/` | `drizzle/meta/_journal.json` |
| `POST /api/stock/ingreso` acepta un SKU por request y no crea el producto | `src/pages/api/stock/ingreso.ts:8`, `src/lib/ingreso-lote.ts:6-13`, `src/lib/repos/lotes.ts:201-245` |
| Hoy no hay parser CSV o XLSX ni ruta de importación | `src/pages/api/stock` solo tiene `conteo.ts` e `ingreso.ts`; `package.json` no declara una librería de Excel |
| El rol efectivo sale de la sesión y la membership | `src/lib/control.ts:77-85` |
| La importación masiva está en el roadmap P1 | `docs/03-inventario-precios/inventario-parte-1.md:665`, `docs/03-inventario-precios/inventario-parte-3.md:349` |
