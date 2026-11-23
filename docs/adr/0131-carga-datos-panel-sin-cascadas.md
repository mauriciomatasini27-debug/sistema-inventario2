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
- `AbortController` ligado al ciclo de vida de cada pantalla.

## Pendientes

- Definir qué pantallas justifican endpoint agregado vs `Promise.all`.
- Medir cuánto aporta cada cascada (admin, caja, venta, stock) antes de elegir.
- Acordar el skeleton (estados vacío/cargando/error) con el design-system.
