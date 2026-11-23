---
id: ADR-0131
tipo: adr
estado: propuesto
modulos: [admin, inventario]
depende_de: []
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Las pantallas del panel cargan sus datos con un único viaje (endpoint agregado o fetch en paralelo) con skeleton y AbortController, en vez de encadenar await fetch secuenciales en scripts inline.
---
# ADR-0131 - Carga de datos del panel sin cascadas

Estado: propuesto. Fecha: 2026-11-23. Fuentes: PRD-NAV-02.

## Decisión

Las pantallas del panel dejan de encadenar `await fetch(...)` secuenciales en scripts inline (patrón actual en `admin.astro`, `caja.astro`, `venta.astro` y `stock.astro`) y pasan a un único viaje por pantalla: o un endpoint agregado por pantalla, o `Promise.all` de los fetch necesarios con skeleton de carga. La isla `TablaCatalogo` (`client:visible`) no duplica el fetch: lee un store poblado por la única fuente, y cualquier fetch en curso se aborta con `AbortController` al desmontar la página.

## Por qué

Tras recibir el HTML, la página queda "congelada" hasta que terminan las cascadas de fetch encadenados (uno espera al anterior). La isla de catálogo agrava esto: se hidrata en `client:visible` y pinta solo cuando el store `catalogo-panel` recibió los productos desde el script de la página. Paralelizar/agregar y mostrar skeleton da una carga percibida inmediata; abortar evita setState sobre páginas desmontadas.

## Qué cambia

- Patrón de carga: un viaje por pantalla (agregado o paralelo) + skeleton.
- `TablaCatalogo` consume una única fuente de datos sin refetch propio.
- `AbortController` ligado al ciclo de vida de cada pantalla (la cancelación de `TablaCatalogo` queda en NAV-S4).

## Evidencia (NAV-S3, 2026-11-23)

Las cuatro pantallas agrupan su carga inicial en `Promise.all`: `/admin` (lista + badge), `/panel/caja` (cinco fuentes), `/venta` (catálogo local + balance) y `/panel/stock` (catálogo, sugerido, stock inicial y precios). El detalle de `/admin` también carga flags y auditoría en paralelo. El HTML trae skeleton con `aria-busy="true"`; cada loader lo apaga y, si la API falla, quita el skeleton y muestra el estado de error.

La cascada que quedaba del lado del servidor estaba en `sincronizarUsoDiarioDesdeContadores`, que encadenaba dos lecturas por tenant dentro de un `for`: ahora esas dos lecturas van en paralelo y los tenants se esperan con un único `Promise.all`.

No se agregó endpoint agregado: el AC admite paralelo o un viaje, y `Promise.all` conserva contratos y autorización existentes. Evidencia en `tests/navegacion-nav-s3.test.ts`, `tests/e2e/nav-s3-skeleton.spec.ts` y `PRD-NAV-02` § Evidencia NAV-S3.

NAV-S3 no implementa `AbortController`: la cancelación de `TablaCatalogo` y del fetch de stock/precios queda en NAV-S4, como declara el PRD-NAV-02.

Evidencia NAV-S4 (2026-11-23): la carga de catálogo de `/panel/stock` y `/panel/precios` pasa por `cargarCatalogoPanel` (`src/lib/catalogo-carga.ts`), que aborta con `AbortController` en `pagehide`/`beforeunload` y descarta los callbacks posteriores al aborto. `TablaCatalogo` sigue leyendo el store `catalogo-panel` sin fetch propio. Tests: `tests/navegacion-nav-s4.test.ts` y `tests/e2e/nav-s4-cancelacion.spec.ts`.

## Pendientes

- ~~Definir qué pantallas justifican endpoint agregado vs `Promise.all`.~~ Resuelto en NAV-S3: `Promise.all` alcanza para las cuatro pantallas; no se agrega endpoint agregado.
- Medir cuánto aporta cada cascada (admin, caja, venta, stock) antes de elegir un endpoint agregado; la evidencia actual prueba orden de render, no milisegundos.
- ~~Acordar el skeleton (estados vacío/cargando/error) con el design-system.~~ Resuelto: se reutiliza `.skel` y el patrón `aria-busy` de los KPI.
- ~~Ligar `AbortController` al ciclo de vida de la carga de catálogo.~~ Resuelto en NAV-S4: stock y precios abortan al salir y la isla no refetchea.
