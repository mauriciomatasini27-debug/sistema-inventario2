---
id: ADR-0106
tipo: adr
estado: aceptado
modulos: [inventario, ventas, offline]
depende_de: [ADR-0011, ADR-0024, ADR-0061, ADR-0062, ADR-0097, PRD-STOCK-01]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: [PRD-VP-03]
resumen: |
  El producto provisorio es una fila de products con origen "alta_al_vender" y stock 0; el alta al vuelo
  viaja dentro del payload de la venta (mismo op_id) y el servidor crea el producto y registra la venta en
  una tx. Dos devices que crean el mismo SKU: gana el primero, el segundo no lo pisa.
---
# ADR-0106 - Producto provisorio al vender y conflictos de sync offline

Estado: aceptado (2026-10-21). Fecha: 2026-10-20. Fuentes: `src/pages/venta.astro`, `src/pages/api/sales.ts`, `src/modules/sales/registro_venta.ts`, `src/modules/sales/vender_mostrador.ts`, `src/lib/repos/catalogo.ts`, `src/lib/repos/stock.ts`, `src/offline/cola-venta.ts`, `src/offline/sensibles.ts`, `src/lib/repos/sync.ts`, `src/db/schema.ts` (`products`), `docs/adr/0097-verificacion-formal.md` (VF-S2).

## Decisión

El producto provisorio es una fila de `products` (`id`, `sku`, `nombre`, `precio_centavos`, `stock_actual = 0`, `sector`) con `products.origen = "alta_al_vender"`. `products.origen` es una columna text nullable nueva (migración `0033_products_origen`, aplicada el 2026-10-21). No hay tabla nueva para el alta al vuelo.

El alta al vuelo viaja dentro del payload de la venta, no como op separada: el mismo `op_id` y el mismo `device_seq` llevan el producto nuevo (`alta: { sku, nombre, precio_centavos }` por línea) y la venta.

Hay dos caminos:

- En línea, `/venta` hace `POST /api/sales` (`src/pages/venta.astro`) y `registrar_venta` (`src/modules/sales/registro_venta.ts`) ya abre `db.transaction`. Ahí se suma la inserción del producto provisorio antes del descuento, así alta y venta son atómicos e idempotentes por `Idempotency-Key`.
- Sin red, el `fetch` a `/api/sales` lanza y la venta queda en `localStorage["slice0-outbox"]`. El botón de sync la manda a `POST /api/sync/push` con `modulo: "sales"`. El camino offline lo materializa `aplicarVentaOutbox` (`src/modules/sync/aplicar-venta-outbox.ts`) con `registrar_venta` (`key = op_id`, `offline: true`), y el alta del producto provisorio se hace en la misma transacción (P10-6, PR #224, mergeado). `POST /api/sync/promote` solo asigna el ticket definitivo.

Conflicto de sync: la regla es por SKU, no por `op_id`. Si dos devices venden el mismo SKU desconocido offline, el primer op que inserta el producto gana nombre y precio; el segundo lo encuentra por `products.sku` (único) y no lo sobrescribe, pero registra su venta. Si el SKU ya existe con `origen` distinto o nulo, el alta al vuelo no crea ni pisa: solo registra la venta. La inserción del producto provisorio usa `on conflict (sku) do nothing` en vez del `SKU_DUPLICADO` de `altaProducto` (`src/lib/repos/catalogo.ts`).

"sin stock inicial" es `origen = "alta_al_vender"` con `stock_actual = 0`. Cargar una cantidad inicial por `/panel/stock` aplica un ALTA con `aplicarMovimiento` (`src/lib/repos/stock.ts`). `origen` no se limpia: queda como historial (decisión de Mauri); "pendiente de stock inicial" es `origen = "alta_al_vender"` sin ningún `stock_movements` tipo `ALTA` para ese SKU.

Además, `offline:catalogo:<tenantId>` (`src/offline/catalogo-local.ts`) guarda solo `stock` y `precioCentavos` por SKU, sin nombre, y se aísla por tenant desde P10-13. El producto provisorio creado sin red se suma a ese snapshot local (stock 0, precio cargado) para que la próxima venta del mismo SKU autocomplete el precio; el nombre vive solo en el payload encolado. El próximo pull lo pisa con lo que tenga el servidor.

La cola offline sigue las leyes de VF-S2 y ADR-0097: `sincronizarColaVenta` (`src/offline/cola-venta.ts`) corta en el primer fallo (excepción o status fuera de 2xx) y `quitarConfirmados` solo saca lo confirmado; el push es idempotente por `op_id` y `empujarOperacion` (`src/lib/repos/sync.ts`) no duplica filas.

## Por qué

Un solo op evita el orden frágil entre dos ops (producto y venta) y hace que el alta y la venta sean atómicos: o entran los dos o no entra ninguno, y una venta nunca referencia un producto que no existe. First-writer-wins por SKU evita pisar el nombre o el precio que otro device cargó. Reutilizar `products` y el outbox existente (`outbox`, `id_mappings`, `device_seq`) no suma tablas ni un módulo nuevo.

## Qué cambia

`products.origen` nuevo (migración `0033_products_origen`, aplicada); `registrar_venta` crea el producto provisorio dentro de su transacción; `/venta` suma nombre y precio y encola el alta con la venta; `/panel/stock` suma la carga progresiva de cantidades iniciales. No cambia el shape de `POST /api/sync/push` ni de `GET /api/sync/pull`.

## Alternativa descartada

Op separada `alta_producto` con `modulo: "catalogo"`: obliga a ordenar dos ops y a decidir qué pasa si la venta llega antes que el producto. El op único lo evita.

## Modificación posterior (2026-11-25, PRD-VP-03)

El camino **online** de `/venta` deja de crear el Producto provisorio. Al pulsar «Guardar», `/venta` da de alta un producto **normal** (`origen` nulo) con stock, fecha de vencimiento (lote) y ubicación mediante `POST /api/products` + `POST /api/stock/ingreso` (lote inicial con `vence_el` opcional), con `Idempotency-Key` distinto por operación, y suma la línea al ticket sin `alta`. El producto así creado nace con su lote de stock inicial y **no** entra como pendiente a la cola «Cargá el stock inicial».

El camino `linea.alta` de `POST /api/sales` y `aplicarVentaOutbox` **se conserva** en el backend, por compatibilidad con la cola offline verificada (`/verify-venta-sync`), y en la UI offline: solo desaparece del camino online. La creación de `origen = "alta_al_vender"` y la regla de conflicto por SKU (`on conflict (sku) do nothing`) de este ADR siguen vigentes para el alta provisoria offline. «Producto provisorio» pasa a nombrar únicamente esa variante offline. El detalle vive en `PRD-VP-03`.

## Pendientes

Mauri aprobó el 2026-10-20 la migración `0033_products_origen`; se aplicó el 2026-10-21. P10-6 (PR #224) quedó mergeado y `registrar_venta` ya crea el producto provisorio en la misma transacción, así que la línea de `ticket_lines` con SKU desconocido no se descarta. Queda como refinamiento que `offline:catalogo:<tenantId>` guarde también el nombre, hoy solo guarda stock y precio (P10-13).
