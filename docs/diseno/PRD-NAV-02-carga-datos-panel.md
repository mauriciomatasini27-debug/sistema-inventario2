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

> Estado al 2026-11-23: NAV-S3 implementado. Las pantallas admin, caja, venta y stock agrupan sus cargas iniciales en `Promise.all` y muestran skeleton con `aria-busy` desde el HTML; el sync de uso del admin ya no encadena lecturas por tenant. NAV-S4 (TablaCatalogo sin refetch y con cancelación) sigue pendiente.

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

## Evidencia NAV-S3 (2026-11-23)

Inventario y decisión por pantalla:

| Pantalla | Cargas iniciales | Cómo quedaron |
|---|---|---|
| `/admin` | `GET /api/admin/tenants` + `GET /api/admin/reportes?estado=recibido`; el detalle suma `flags` + `actos` | Dos `Promise.all` (lista/badge y detalle/auditoría). Skeleton en contadores, tabla, badge y cajón. |
| `/panel/caja` | `balance`, `history`, `due-items`, `close`, `qr` | Un `Promise.all` de cinco. Skeleton en saldo, movimientos, vencimientos y QR. |
| `/venta` | catálogo local (solo baja si está vencido) + `balance` | Un `Promise.all` de catálogo y balance. Skeleton en balance. |
| `/panel/stock` | `products?panel=1`, `plantilla`, `stock/inicial`, `stock/precio` | Un `Promise.all` de cuatro. Skeleton en KPIs y catálogo; la isla `TablaCatalogo` sigue leyendo el store que puebla la única fuente. |

No se agregó un endpoint agregado por pantalla: el AC acepta “en paralelo o en un viaje”, y paralelizar evita duplicar contratos y autorización. La cascada real que quedaba estaba del lado del servidor en `sincronizarUsoDiarioDesdeContadores`: ahora lee bot y asistente en paralelo por tenant y espera a todos los tenants en un solo `Promise.all`.

Evidencia automatizada:

- `tests/navegacion-nav-s3.test.ts`: guarda estática de los `Promise.all`, del skeleton/`aria-busy` y de la limpieza en error.
- `tests/e2e/nav-s3-skeleton.spec.ts`: retiene las respuestas de caja, el catálogo de stock y el balance de venta; comprueba skeleton antes de liberar y contenido después.
- `tests/e2e/kpi-skeleton.spec.ts` sigue cubriendo el skeleton compartido de los KPI del panel.

No se midió TTFB contra una base lenta: la prueba es de orden de render (skeleton antes de la respuesta), no de milisegundos. Medir la ganancia con latencia de base queda como pendiente de ADR-0131.

