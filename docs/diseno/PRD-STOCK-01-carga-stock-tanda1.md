---
id: PRD-STOCK-01
tipo: prd
estado: hecho
modulos: [inventario, ventas, offline]
depende_de: [ADR-0011, ADR-0024, ADR-0061, ADR-0062, ADR-0097, ADR-0106, ADR-0107, PRD-PERS-06]
reemplaza: []
reemplazado_por: ""
resumen: |
  Tanda 1 para hacer más fácil la carga de stock: alta al vender en /venta offline con nombre y precio
  marcado "sin stock inicial" (STOCK-E1) y catálogo sugerido por rubro sin precios con pantalla para
  destildar y registro de seeds (STOCK-E2). Las migraciones 0033 y 0034 se aplicaron el 2026-10-21.
> Estado al 2026-10-21: hecho. STOCK-S1, S2, S3, S4, S6, S7, S8 y S9 implementados; S5 es regresión cubierta por `cola-venta.ts`.
---
# PRD-STOCK-01 - Carga de stock Tanda 1: alta al vender y catálogo sugerido por rubro

Fuente: `docs/03-inventario-precios/inventario-parte-1.md` (F1-F14), `src/pages/venta.astro`, `src/pages/api/sales.ts`, `src/modules/sales/registro_venta.ts`, `src/modules/sales/vender_mostrador.ts`, `src/modules/inventario/inventario.ts`, `src/lib/repos/catalogo.ts`, `src/lib/repos/stock.ts`, `src/offline/cola-venta.ts`, `src/offline/catalogo-local.ts`, `src/lib/repos/sync.ts`, `src/pages/panel/stock.astro`, `src/pages/api/locations.ts`, `src/pages/api/onboarding/alta.ts`, `drizzle/0032_tenant_location_seeds.sql`, `src/db/schema-planes.ts` (`tenantLocationSeeds`), `src/lib/repos/siembra-ubicaciones.ts`, `src/modules/onboarding/plantillas-rubro.ts`, `src/modules/onboarding/ubicaciones-aviso.ts`, `docs/adr/0097-verificacion-formal.md` (VF-S2). Fecha de extracción: 2026-10-20. Restringido por ADR-0011, ADR-0024, ADR-0061, ADR-0062 y ADR-0097.

## Problema

`/venta` (`src/pages/venta.astro`) cobra por `product_id` (el SKU) sin crearlo. Si el SKU no está en el catálogo, `registrar_venta` (`src/modules/sales/registro_venta.ts`) lo trata como desconocido y `descontar` (`src/modules/inventario/inventario.ts`) lo deja con stock 0: en online rechaza con `SIN_STOCK` y en offline lo registra como sobreventa, pero nunca queda una fila en `products`. El comercio arranca sin stock y el cajero no puede dar de alta un producto desconocido con nombre y precio sin salir a `/panel`. A la vez, la siembra por rubro existe para ubicaciones (`plantillas-rubro.ts` + `tenant_location_seeds`, migración `0032`) pero no para productos.

## Épica STOCK-E1. Alta al vender

Requisito STOCK-R1: en `/venta`, un SKU o producto desconocido se da de alta al vuelo con nombre y precio, marcado "sin stock inicial" (`products.stock_actual = 0` y `products.origen = "alta_al_vender"`), y la venta se cobra y encola sin perderse.

- Historia STOCK-S1. Alta al vuelo en `/venta` offline. AC: Given `/venta` offline con el catálogo local (`offline:catalogo`) sin el SKU When el cajero ingresa SKU desconocido, nombre y precio y cobra Then el SKU se suma al snapshot local `offline:catalogo` con stock 0 y el precio cargado, la venta se encola en `slice0-outbox` con su `op_id` y el alta (`sku`, `nombre`, `precio_centavos`) dentro del payload, y sale el ticket provisorio; al reconectar, `POST /api/sync/push` guarda la op en `outbox` sin 409 ni pérdida. El push materializa la venta con `aplicarVentaOutbox` y crea el producto con `origen = "alta_al_vender"` en la misma transacción (P10-6, PR #224, mergeado). ADR: 0106. Talla M. Depende de: STOCK-S2 y P10-6 (PR #224).
- Historia STOCK-S2. Alta al vuelo online. AC: Given `/venta` online con el SKU desconocido When el cajero da nombre y precio Then `POST /api/sales` → `registrar_venta` crea el producto con `origen = "alta_al_vender"` y stock 0 y registra la venta en la misma `db.transaction`, incluida la fila de `ticket_lines` (ya no se descarta si el SKU no está en `products`; el producto se crea en la misma tx); Given el SKU ya existe en el catálogo Then no lo pisa y solo registra la venta. ADR: 0106. Talla M. Depende de: nada (es el primer slice implementable).
- Historia STOCK-S3. Conflicto de sync entre dos devices. AC: Given dos devices offline que venden el mismo SKU desconocido con nombre y precio distintos When las dos ops se aplican (cada device tiene su propio `device_seq`; el orden entre devices lo da el aplicador) Then el primero crea el producto y el segundo no lo pisa y ambas ventas quedan; ninguna venta se pierde. ADR: 0106. Talla L. Depende de: STOCK-S1.
- Historia STOCK-S4. Carga progresiva de cantidades iniciales en `/panel`. AC: Given el catálogo con productos "sin stock inicial" When el dueño abre `/panel/stock` Then ve los productos con `origen = "alta_al_vender"` y stock 0 ordenados por unidades vendidas (`ticket_lines.qty` de los últimos 30 días, de a 5 por vez; criterio aprobado por Mauri), y puede cargar la cantidad inicial por SKU; al guardar se aplica un ALTA con `aplicarMovimiento` (`src/lib/repos/stock.ts`) y el producto deja de aparecer como pendiente; `origen` queda como historial. ADR: 0106. Talla M. Depende de: STOCK-S1.
- Historia STOCK-S5. La cola offline no pierde la venta. AC: Given ventas offline con producto provisorio When el push lanza o responde fuera de 2xx (p.ej. 422 por `device_seq`) Then `sincronizarColaVenta` (`src/offline/cola-venta.ts`, ya hecho en VF-S2) corta en el primer fallo y no saca de la cola lo no confirmado; la venta sigue en `slice0-outbox`. El payload con `alta` no cambia esa regla; es regresión, no código nuevo. ADR: 0097. Talla S. Depende de: STOCK-S1.

## Épica STOCK-E2. Catálogo sugerido por rubro

Requisito STOCK-R2: el sistema sugiere un catálogo de productos por rubro (solo nombres, sin precios) que el dueño puede destildar antes de crearlo, y lo sembrado queda registrado.

- Historia STOCK-S6. Plantilla de productos por rubro versionada. AC: Given el rubro del tenant When se arma la sugerencia Then sale de `PLANTILLAS_PRODUCTOS_RUBRO` (nueva, espejo de `plantillas-rubro.ts`) con `VERSION_PLANTILLAS_PRODUCTOS_RUBRO` y sin precios; Given un rubro sin plantilla Then usa `otro`, igual que `plantilla_rubro()` en `plantillas-rubro.ts`. ADR: 0107. Talla S. Depende de: nada.
- Historia STOCK-S7. Pantalla para destildar lo que no vende. AC: Given la plantilla del rubro When el dueño abre la pantalla en `/panel/stock` Then ve los nombres con checkbox y puede destildar; al confirmar solo se crean los seleccionados y el aviso se descarta (registro por tenant en `tenant_product_seeds`; el descarte por dispositivo queda como decisión abierta). ADR: 0107. Talla M. Depende de: STOCK-S6.
- Historia STOCK-S8. Registro de seeds de productos. AC: Given que se confirmó la siembra When se crean los productos Then `registrarSiembraProductos` inserta una fila por tenant en `tenant_product_seeds` (`rubro`, `plantilla_version`, `cantidad`, `sembrado_at`) con `ON CONFLICT DO NOTHING` (espejo de `registrarSiembraUbicaciones` en `src/lib/repos/siembra-ubicaciones.ts`); `leerSiembraProductos` (espejo de `leerSembradasPorRubro`) la lee y el aviso sobrevive un reinicio. ADR: 0107. Talla S. Depende de: STOCK-S7.
- Historia STOCK-S9. Productos sembrados sin precio. AC: Given un producto creado desde la plantilla When se crea Then `products.precio_centavos = 0` (columna `bigint NOT NULL`, no admite nulo) y `products.origen = "plantilla_rubro"`; `/panel/stock` lo lista para completar el precio. ADR: 0107. Talla S. Depende de: STOCK-S7.

## Métricas

| Métrica | Fuente | Meta |
|---|---|---|
| % de productos con stock inicial cargado | `products` con `stock_actual > 0` sobre el total | subir tras la primera semana |
| % de ventas con producto provisorio | `ticket_lines` unido con `products.origen = "alta_al_vender"` | bajar a medida que se carga stock |
| Tiempo hasta la primera carga de stock | alta del tenant → primer `stock_movements` tipo `ALTA` | menos de 1 día |
| % de productos sembrados completados | `tenant_product_seeds.cantidad` vs productos con precio > 0 | subir tras el primer mes |

## Fuera de alcance

Precios sugeridos o automáticos, importación masiva desde Excel o CSV, categorías de productos, proveedores por producto, multi-tenant cruzado y el conteo por sector (ya cubierto por `/api/stock/conteo`). No se toca el shape de `GET /api/sync/pull` ni de `POST /api/sync/push`.

## Dependencias externas

STOCK-S1 a STOCK-S5 dependen de ADR-0106 y de la migración `0033_products_origen`. STOCK-S6 a STOCK-S9 dependen de ADR-0107 y de la migración `0034_tenant_product_seeds`. Ambas se aplicaron el 2026-10-21. P10-6 (PR #224) quedó mergeado y aplica las ventas de la outbox con `registrar_venta`.

## Migraciones (aplicadas el 2026-10-21)

| Tag | Qué hace | Estado |
|---|---|---|
| `0033_products_origen` | agrega `products.origen` text nullable (valores `alta_al_vender`, `plantilla_rubro`) | aplicada |
| `0034_tenant_product_seeds` | crea `tenant_product_seeds` (`tenant_id` text PK, `rubro`, `plantilla_version`, `cantidad`, `sembrado_at`) | aplicada |

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Alta al vuelo offline | SKU desconocido + nombre + precio, cobrar | Producto con stock 0 y origen "alta_al_vender", venta encolada, ticket provisorio |
| Feliz | Sync tras reconectar | Reintentar sync | Producto y venta aplicados, cola vacía |
| Fallo | Dos devices, mismo SKU | Dos push ordenados | El primero crea, el segundo no pisa, ambas ventas quedan |
| Fallo | Push sin red | `POST /api/sync/push` falla | La venta sigue en `slice0-outbox`, no se pierde |
| Feliz | Plantilla por rubro | Abrir la pantalla | Nombres con checkbox, destildar y confirmar crea solo los seleccionados |
| Fallo | Plantilla sin coincidencias | Rubro `otro` | No crea nada, no rompe |
| Regresión | VF-S2 | `sincronizarColaVenta` con fallo | Corta y no vacía la cola (ADR-0097) |
