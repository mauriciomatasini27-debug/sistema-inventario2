---
id: ADR-0107
tipo: adr
estado: propuesto
modulos: [inventario, onboarding, persistencia]
depende_de: [ADR-0011, ADR-0062, ADR-0106, PRD-STOCK-01]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Plantilla de productos por rubro versionada y sin precios, con pantalla para destildar y una tabla de
  seeds análoga a tenant_location_seeds. Extiende el patrón de siembra de ubicaciones de la migración 0032.
---
# ADR-0107 - Plantilla de catálogo por rubro, pantalla para destildar y registro de seeds

Estado: propuesto. Fecha: 2026-10-20. Fuentes: `src/modules/onboarding/plantillas-rubro.ts`, `src/modules/onboarding/ubicaciones-rubro.ts`, `src/modules/onboarding/ubicaciones-aviso.ts`, `src/lib/repos/siembra-ubicaciones.ts`, `drizzle/0032_tenant_location_seeds.sql`, `src/db/schema-planes.ts` (`tenantLocationSeeds`), `src/pages/api/onboarding/alta.ts`, `src/lib/repos/catalogo.ts` (`sembrarUbicacionesRubro`, `altaProducto`), `src/lib/repos/siembra-ubicaciones.ts` (`registrarSiembraUbicaciones`, `leerSembradasPorRubro`), `src/db/schema.ts` (`products`), ADR-0106.

## Decisión

La plantilla de productos por rubro vive en `src/modules/onboarding/plantillas-productos-rubro.ts`, espejo de `plantillas-rubro.ts`: `VERSION_PLANTILLAS_PRODUCTOS_RUBRO = "v1"` y `PLANTILLAS_PRODUCTOS_RUBRO: Record<string, { productos: string[] }>` con solo nombres, sin precios. Un rubro sin plantilla cae en `otro`, igual que `plantilla_rubro()`. Vive en código (no en tabla) por la misma razón que las ubicaciones: se versiona con el repo y se revisa en PR.

El registro de seeds es una tabla nueva `tenant_product_seeds`, espejo de `tenant_location_seeds`: `tenant_id` text PK, `rubro` text, `plantilla_version` text, `cantidad` integer, `sembrado_at` timestamp. Igual que 0032: `tenant_id` texto sin FK y RLS habilitado sin policies. Migración propuesta `0034_tenant_product_seeds`, no aplicada; no se agrega ningún `drizzle/*.sql` en este PR. Para v1 la versión se guarda como texto (`"v1"`); si la plantilla cambia, se sube `VERSION_PLANTILLAS_PRODUCTOS_RUBRO` y la fila existente no se re-siembra (una fila por tenant).

El repositorio `src/lib/repos/siembra-productos.ts` espeja `siembra-ubicaciones.ts`: `registrarSiembraProductos` inserta una fila por tenant con `ON CONFLICT DO NOTHING` (idempotente) y `leerSiembraProductos` la lee, con el evento en memoria como fallback en single sin base.

Los productos sembrados se crean con `products.precio_centavos = 0` y `products.origen = "plantilla_rubro"` (columna de ADR-0106), y se registran en `tenant_product_seeds`. La pantalla en `/panel/stock` lista la plantilla con checkbox, permite destildar y al confirmar crea solo los seleccionados y registra la siembra; el aviso se puede descartar por dispositivo, espejo de `ubicaciones-aviso.ts`.

El disparador es la pantalla, no el alta automática: el dueño elige qué quiere antes de crear. `POST /api/onboarding/alta` sigue sembrando ubicaciones como hoy y el catálogo de productos queda a confirmación.

## Por qué

Extiende el patrón ya aceptado de siembra de ubicaciones (migración 0032, `tenant_location_seeds`, `registrarSiembraUbicaciones`) en vez de inventar otro. La pantalla para destildar respeta que el dueño no quiera productos que no vende, y crear solo lo confirmado evita llenar el catálogo de basura. `precio_centavos = 0` es el único placeholder que `products` acepta (`NOT NULL`), y el panel después lo completa.

## Qué cambia

`plantillas-productos-rubro.ts` y `siembra-productos.ts` nuevos; `tenant_product_seeds` nueva (migración propuesta, no aplicada); `products.origen = "plantilla_rubro"`; sección nueva en `/panel/stock`. No cambia `GET /api/locations` ni `POST /api/onboarding/alta`.

## Alternativa descartada

Sembrar automáticamente en el alta: crea productos que el dueño no quiere y obliga a borrarlos después. La pantalla para destildar los evita.

## Pendientes

Aprobación de Mauri para aplicar `0034_tenant_product_seeds`. Definir el contenido inicial de `PLANTILLAS_PRODUCTOS_RUBRO` por rubro.
