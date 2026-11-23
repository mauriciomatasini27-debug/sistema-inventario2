# Trazabilidad — stock

Fecha: 2026-11-23. Historia: AUD-S5 de PRD-AUD-03 (ADR-0127).
Pantallas: `src/pages/panel/stock.astro` (1277 líneas) y `src/pages/panel/stock/importar.astro`.
Handlers: `src/pages/api/products.ts`, `stock/*`, `counts.ts`, `locations.ts`, `lots.ts`.
No auditado: el flujo de importación por Excel más allá del archivo (el parseo vive en
`lib/importacion-archivo.ts`) y la baja de lotes vencidos (job, sin pantalla).

## Campos persistidos

| Campo en pantalla | Payload | Handler | Repo | Columna | Estado |
|---|---|---|---|---|---|
| Nombre | `nombre` | `POST /api/products` | `altaProducto` (`lib/repos/catalogo.ts:392`) | `products.nombre` | ok |
| Código (opcional) | `codigo` | idem | idem (`:457`) | `product_codes.codigo` (+ `sku`) | ok |
| SKU (derivado del código o `INT-…`) | `sku` | idem | idem (`:449`) | `products.sku` | ok |
| Precio | `precio_centavos` | idem | idem | `products.precio_centavos` | ok |
| Venta por peso | `por_peso` | idem | idem (`:474`) | `products.por_peso` | ok |
| Ubicación | `location_id` | idem | idem (`:468`) | `products.location_id` | ok |
| Sector (default `general`) | `sector` | idem | idem | `products.sector` | ok |
| Umbrales (mínimo y reposición) | `min_stock`, `reorder_qty` | idem | idem (`:472`) | `products.min_stock`, `reorder_qty` | ok |
| Foto | `foto.url`, `.ancho`, `.alto`, `.bytes` | idem | idem (`:461`) | `product_photos.url`/`ancho`/`alto`/`bytes` | ok |
| Controla vencimiento (checkbox) | `controla_vencimiento` | idem | `altaProducto` (`:423`) | — (solo espejo en memoria) | **huérfano (stock-1)** |
| Permisos del producto | `permisos[]` | idem | — | — | **huérfano (stock-2)** |
| Cantidad inicial | `cantidad` | `POST /api/stock/ingreso` | `manejarIngresoLote` (`lib/ingreso-lote.ts:18`) | `stock_movements` (stock inicial) / `stock_lots.cantidad` | ok |
| Costo del ingreso | `costo_centavos` | idem | `crearLote` (`lib/repos/lotes.ts`) | `stock_lots.costo_centavos` | ok |
| Vencimiento del lote | `vence_el` | idem | idem | `stock_lots.vence_el` | ok |
| Controla vencimiento (ingreso) | `controla_vencimiento` | idem (`:32`) | idem | — (decide lote vs movimiento) | ok (dominio) |
| SKU del ingreso | `sku` | idem | idem | `stock_lots.sku`, `stock_movements.sku` | ok |
| Stock inicial pendiente (cantidad por SKU) | `sku`, `cantidad` | `POST /api/stock/inicial` | `stock-inicial.ts` | `stock_movements`, `products.stock_actual` | ok |
| Precio pendiente | `sku`, `precio_centavos` | `POST /api/stock/precio` | `precio-pendiente.ts` | `products.precio_centavos` | ok |
| Altas por plantilla del rubro | `nombres[]` | `POST /api/stock/plantilla` | `siembra-productos.ts` | `products.nombre` | ok |
| Ubicación (alta y renombre) | `nombre`; `id` + `nombre` | `POST`/`PATCH /api/locations` | `altaUbicacion`/`renombrarUbicacion` | `locations.nombre` | ok |
| Conteo: quién contó y líneas | `contado_por`, `lineas[].sku`, `lineas[].fisico` | `POST /api/counts` | `crearConteo` (`lib/repos/stock.ts`) | `stock_counts.contado_por`, `stock_count_lines.sku`/`fisico` | ok |
| Conteo: confirmación | `rol`, `confirmado_por`, `motivo` | `PATCH /api/counts?id=` | `confirmarConteo` | `stock_counts.confirmado_por`/`estado` + `stock_movements` (AJUSTE_CONTEO) | ok |
| Archivo de importación | multipart (nombre, bytes) | `POST /api/stock/importar/preview` y `/confirmar` | `lib/importacion-archivo.ts`, `repos/importaciones.ts` | `stock_imports.archivo_nombre`/`archivo_sha256`/`formato`/`filas_*`, `stock_movements` | ok |

## Solo lectura

| Elemento | Handler | Repo | Columnas |
|---|---|---|---|
| Listado y buscador del panel | `GET /api/products?panel=1&codigo=` | `listarProductos`, `buscarProductoPorCodigo` | `products.*`, `product_codes.codigo`, `product_photos.url` |
| Lotes de un SKU | `GET /api/lots?sku=` | `listarLotesDetalle` | `stock_lots.*` |
| Ubicaciones | `GET /api/locations` | `listarUbicaciones` | `locations.nombre`, `archivada` |
| Pendientes de stock inicial y de precio | `GET /api/stock/inicial`, `GET /api/stock/precio` | `listarPendientesStockInicial`, `listarPendientesPrecio` | `stock_movements`, `products.precio_centavos` |
| Plantilla del rubro | `GET /api/stock/plantilla` | `plantilla_productos_rubro` | `tenant_product_seeds` |

## Columnas del módulo sin pantalla

| Columna | Clasificación |
|---|---|
| `products.origen` | interna: la escribe el servidor (`alta_al_vender`, `plantilla_rubro`) |
| `products.stock_actual` | derivada de `stock_movements`; el panel la muestra pero no la edita directo |
| `stock_lots.cantidad_restante` | derivada por FEFO |
| `stock_movements.tipo`, `.motivo`, `.idem_key` | internas del movimiento |
| `stock_imports.creado_por`, `.movimientos` | internas de la importación |
| `product_codes.padre` | sin pantalla: lo usa el alta de códigos hijos, que no tiene UI |

## Hallazgos

1. **stock-1 — “controla vencimiento” del alta no se persiste.** El checkbox viaja como
   `controla_vencimiento`, `altaProducto` lo guarda en el espejo de memoria (`catalogo.ts:423`) y
   `products` no tiene columna. El ingreso lo lee del espejo (`lib/ingreso-lote.ts:31`), así que en
   multi/shared (siempre DB) o después de un reinicio el flag se pierde y el producto no exige
   lote. Issue #477. Accionable: columna en `products` (migración) y leerla de la base en el ingreso.
2. **stock-2 — `permisos[]` no se usa.** Está en el schema del handler (`api/products.ts:43`) y no
   lo lee `altaProducto` ni ninguna otra pieza. Issue #478. Accionable: quitarlo del contrato.
3. **stock-3 — la importación no deja elegir el sector.** El archivo trae nombre/cantidad/costo y
   el alta cae en `general` (`products.sector` default); `stock_imports` no guarda sector. Nota de
   producto: si se importa un rubro con sectores, todo queda en `general`.
