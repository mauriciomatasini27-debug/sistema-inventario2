---
id: PRD-NAV-02
tipo: prd
estado: propuesto
modulos: [admin, inventario]
depende_de: [ADR-0131]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Carga de datos del panel sin cascadas: un único viaje por pantalla (agregado o paralelo) con skeleton, y la isla TablaCatalogo consume una única fuente sin refetch propio.
---
# PRD-NAV-02 - Carga de datos del panel sin cascadas

Fuente: bug "freeze al cambiar de ruta". Restringido por ADR-0131.

## Problema

Tras recibir el HTML, muchas pantallas quedan "congeladas" mientras encadenan `await fetch(...)` secuenciales en scripts inline: `admin.astro` carga tenants → auditoría → reportes → flags en serie, y `caja.astro`, `venta.astro` y `stock.astro` repiten el patrón. La isla `TablaCatalogo` (`client:visible`) suma otra espera: se hidrata y pinta recién cuando el store `catalogo-panel` recibió los productos desde el script de la página.

## Épica NAV-E2. Carga de datos sin cascadas

Requisito NAV-R2: cada pantalla carga sus datos en un único viaje (o fetch en paralelo) con skeleton visible y cancelación al desmontar.

- Historia NAV-S3. Inventariar las cascadas de fetch de cada página del panel y colapsarlas (endpoint agregado o `Promise.all`) con skeleton de carga. AC: Given una pantalla con N fetch encadenados When carga Then los datos llegan en paralelo o en un viaje y el skeleton se muestra de inmediato. ADR: 0131. Talla M. Depende de: nada.
- Historia NAV-S4. Que `TablaCatalogo` no duplique fetch ni bloquee la hidratación: poblar el store desde una única fuente y abortar el fetch en curso (`AbortController`) al desmontar. AC: Given la pantalla stock/precios When desmonto o cambio de ruta Then el fetch en curso se cancela y no hay setState sobre la página desmontada. ADR: 0131. Talla M. Depende de: NAV-S3.

## Dependencias externas

Ninguna. Refactor de scripts inline y de la isla de catálogo existentes.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Pantalla con cascada | admin/caja | datos en un viaje, skeleton inmediato |
| Fallo | Cambio de ruta a mitad de fetch | desmontar stock | fetch abortado, sin warning de setState |
| Fallo | Fetch con error | API caída | skeleton → estado de error, no pantalla congelada |
