---
id: PRD-NAV-03
tipo: prd
estado: propuesto
modulos: [design-system, admin]
depende_de: [ADR-0132]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Pintado y motion dentro de un presupuesto: limitar backdrop-filter en superficies masivas, respetar prefers-reduced-motion en reveal y NumberFlow, y medir INP/CLS por pantalla.
---
# PRD-NAV-03 - Pintado y motion sin jank

Fuente: bug "freeze al cambiar de ruta". Restringido por ADR-0132.

> Estado al 2026-11-23: NAV-S5 implementado. Las tarjetas del panel ya no llevan `backdrop-filter`; el vidrio queda solo en la barra superior y en las tarjetas chicas de venta. INP/CLS por pantalla se miden con `scripts/medir-pintado.mjs`. NAV-S6 (reduced-motion en reveal y NumberFlow) sigue pendiente.

## Problema

Parte del "tildado" es trabajo de paint/composición: `PanelShell.astro` aplica `backdrop-filter: blur(16px)` a cada `.card`, `BaseLayout.astro` anima la aparición por scroll con un `IntersectionObserver` (`reveal`), y `TablaCatalogo` anima los precios con `NumberFlow`. En hardware humilde, la suma se percibe como jank durante y después de la navegación.

## Épica NAV-E3. Pintado y motion acotado

Requisito NAV-R3: el pintado y la animación deben respetar `prefers-reduced-motion` y un presupuesto, sin jank medible en la navegación.

- Historia NAV-S5. Auditar y reducir el CSS/paint costoso (backdrop-filter en tarjetas masivas, selectores compuestos del `<style>` de PanelShell) y medir INP/CLS por pantalla. AC: Given una pantalla con muchas tarjetas When mido INP/CLS Then el costo de paint baja sin romper el layout. ADR: 0132. Talla M. Depende de: nada.
- Historia NAV-S6. Aplicar `prefers-reduced-motion` de forma consistente al `reveal` de BaseLayout y a `NumberFlow`, y limitar las animaciones a un presupuesto. AC: Given un usuario con reduced-motion When navega Then no corre animación de entrada ni precios animados. ADR: 0132. Talla S. Depende de: NAV-S5.

## Dependencias externas

Ninguna. Refactor de estilos y animaciones existentes.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Pantalla con tarjetas | panel/caja | INP estable, sin blur masivo |
| Fallo | prefers-reduced-motion | sistema en reduce | sin reveal ni NumberFlow animado |
| Fallo | Regresión visual | quitar blur | layout intacto, contraste correcto |

## Evidencia NAV-S5 (2026-11-23)

Auditoría en tema claro, viewport 1280×800:

| Pantalla | Tarjetas `.card` | Superficies con blur antes | Después |
|---|---|---|---|
| `/panel/caja` | 11 | 12 (topbar + 11 tarjetas) | 1 (topbar) |
| `/panel/stock` | 11 | 12 | 1 |
| `/panel/precios` | 11 | 12 | 1 |
| `/panel/reportes` | 11 | 12 | 1 |
| `/panel` | 11 | 12 | 1 |
| `/venta` | 6 | 6 (tarjetas chicas de ticket/cobro) | 6 (sin cambios) |

Cambio: se elimina el bloque `@supports` que aplicaba `backdrop-filter: blur(16px)` a cada `.panel-shell .card` y su fallback `prefers-reduced-transparency`, que ya no hace falta porque la tarjeta es opaca (`--tema-superficie`). La barra superior (`PanelTopbar`) conserva el vidrio. Las tarjetas de venta no son masivas y quedan como estaban.

Medición con `scripts/medir-pintado.mjs` (3 corridas por ruta, `--escala 2 --cpu 4`, misma app sembrada con `control-app seed`; base del PR: `origin/main` = `f4cf013`):

| Métrica | Antes (`f4cf013`) | Después |
|---|---|---|
| Tarjetas con blur por pantalla | 11 | 0 |
| INP (eventos reales tras clic) | menos de 16 ms (sin entradas sobre el umbral) | menos de 16 ms |
| CLS | 0 (venta 0,01) | 0 (venta 0,01) |
| p95 de frame en scroll | 17,4–18,6 ms | 17,6–18,5 ms |
| Paint/raster traceados | 0,5–3,9 ms | 0,1–3,8 ms |

El costo estructural baja de 11 capas con blur a 0 por pantalla; INP, CLS y p95 quedan dentro del presupuesto de ADR-0132. En este box el blur no mostró una diferencia de milisegundos estable en los proxies de paint (el ruido entre corridas es mayor), así que la evidencia cuantitativa es la cantidad de superficies con blur y el no-empeoramiento de las métricas. `paintMs`/`rasterMs` son sumas de spans de la traza y pueden solaparse entre hilos: sirven de comparación relativa, no de costo absoluto.

El INP es un proxy: `PerformanceObserver` de `event` agrupado por `interactionId` y p98 de las interacciones de la corrida, con el mínimo de 16 ms que impone la API. Cuando no hay entradas sobre ese umbral, la tabla informa "menos de 16 ms" y el JSON deja `inp: null`, en vez de afirmar un valor medido.

El script aborta si una ruta no renderizó (sin `h1` o con menos de 100 caracteres), para que un 404 no puntúe como "0 blur".

Los selectores compuestos del `<style>` de PanelShell se auditaron: son cadenas largas de `:not()` para excluir botones especiales. No se reescribieron porque bajar su especificidad cambia el cascade y exige una revisión visual aparte; no aparecen como cuello en layout/recalc (17–29 ms con CPU 4x).

Layout: `tests/e2e/nav-s5-pintado.spec.ts` comprueba 11 tarjetas visibles en caja, 0 con blur, topbar todavía con blur, sin desborde horizontal y alto de página mayor a 600 px.
