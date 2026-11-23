---
id: ADR-0132
tipo: adr
estado: propuesto
modulos: [design-system, admin]
depende_de: []
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Se fija un presupuesto de pintado y motion: se limita backdrop-filter en superficies masivas, se respeta prefers-reduced-motion en reveal y NumberFlow, y toda animación queda dentro de un budget medible.
---
# ADR-0132 - Presupuesto de pintado y motion

Estado: propuesto. Fecha: 2026-11-23. Fuentes: PRD-NAV-03.

## Decisión

El pintado y la animación se acotan a un presupuesto explícito en vez de quedar libres. El `backdrop-filter: blur(16px)` de `.card` en `PanelShell.astro` se limita (solo superficies no masivas, apoyándose en el `@supports` y el `prefers-reduced-transparency` que ya existen); las animaciones `reveal` (IntersectionObserver en `BaseLayout.astro`) y `NumberFlow` respetan `prefers-reduced-motion` y, cuando corren, se mantienen dentro de un budget de duración y cantidad.

## Por qué

El `backdrop-filter` en tarjetas repetidas, la animación de aparición por scroll y los precios animados (`NumberFlow`) suman trabajo de composición/paint que en hardware humilde se percibe como jank durante y después de la navegación. El efecto estético no justifica el costo en una PWA de operación diaria.

## Qué cambia

- Reglas de tema/CSS para acotar `backdrop-filter` en superficies masivas.
- `prefers-reduced-motion` aplicado de forma consistente a reveal y precios.
- Un budget de motion documentado (p. ej. una transición de entrada por vista, duración tope).

## Presupuesto

- INP por pantalla ≤ 200 ms y CLS ≤ 0.1 (umbral "good" de Web Vitals). El observer de Event Timing no emite eventos por debajo de 16 ms, así que cuando no hay entradas sobre ese umbral la evidencia dice "sin eventos ≥16 ms", no un valor medido.
- A lo sumo una superficie con `backdrop-filter` por pantalla del panel (la topbar). `/venta` queda exceptuada: sus dos tarjetas de ticket/cobro no son masivas y se muestra una por paso.
- p95 de frame durante scroll ≤ 20 ms en la medición de referencia (`--escala 2 --cpu 4`).

La medición vive en `scripts/medir-pintado.mjs`; el presupuesto se revisa con cada NAV-S5/S6.

## Evidencia NAV-S5 (2026-11-23)

El blur por tarjeta se elimina de `PanelShell`: `.panel-shell .card` queda opaca (`--tema-superficie`) y desaparece el bloque `@supports`/`prefers-reduced-transparency` que aplicaba `blur(16px)` a cada tarjeta. El vidrio queda en `PanelTopbar` (una superficie chica) y en las tarjetas de ticket/cobro de venta, que no son masivas.

Medición con `scripts/medir-pintado.mjs` (3 corridas, `--escala 2 --cpu 4`): las pantallas de caja, stock, precios, reportes y panel pasan de 12 superficies con blur (11 tarjetas) a 1 (la topbar); no se observaron interacciones de 16 ms o más, CLS en 0 (venta 0,01) y p95 de frame en scroll entre 17,6 y 18,5 ms. El detalle está en `PRD-NAV-03` § Evidencia NAV-S5.

Los selectores compuestos de PanelShell se auditaron y no se reescribieron: reducir su especificidad cambia el cascade y requiere una revisión visual aparte; no son el cuello de layout/recalc en la medición.

## Presupuesto de motion (NAV-S6)

- Con `prefers-reduced-motion: reduce`: cero animaciones. `BaseLayout` no marca las secciones con `reveal` y no crea el `IntersectionObserver`; `NumberFlow` conserva `respectMotionPreference` y el `@media reduce` global corta animaciones y transiciones CSS, incluidas las view transitions.
- Con movimiento permitido: una animación de entrada por superficie, sin bucles, usando solo `opacity`/`transform`. Tope de 240 ms por animación: `--motion-entrada` en `global.css` para `reveal` y `transformTiming` de 240 ms / `opacityTiming` de 160 ms en `TablaCatalogo`.
- El presupuesto se valida con `tests/navegacion-nav-s6.test.ts` (tope y cableado) y `tests/e2e/nav-s6-reduced-motion.spec.ts` (reduce sin observer ni WAAPI; movimiento dentro de 240 ms con un cambio real de precio).

## Pendientes

- ~~Medir INP/CLS por pantalla para priorizar qué superficie pierde el blur.~~ Resuelto en NAV-S5: caja, stock, precios, reportes y panel pierden el blur de sus 11 tarjetas; la medición queda en `scripts/medir-pintado.mjs`.
- ~~Definir el budget numérico y dónde se documenta (tokens o gotchas de diseño).~~ Resuelto: § Presupuesto de este ADR y el script de medición.
- ~~Confirmar que `NumberFlow` con `respectMotionPreference` ya cubre el caso reduced-motion (NAV-S6).~~ Resuelto en NAV-S6: `@number-flow/react` 0.6.2 desactiva `canAnimate` cuando `matchMedia('(prefers-reduced-motion: reduce)')` da true, y el custom element omite `element.animate` por el mismo motivo; la e2e lo comprueba con un cambio real de precio (0 animaciones WAAPI bajo reduce).
