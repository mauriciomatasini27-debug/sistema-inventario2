---
id: GUIA-NAVEGACION-01
tipo: spec
estado: aceptado
modulos: [admin, inventario]
depende_de: [ADR-0131]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Detalles de runtime de la navegación MPA que el código no expresa y que no son decisiones de arquitectura.
---
# Gotchas de runtime de la navegación

Guía de referencia. Fecha: 2026-11-23. Fuente: NAV-S4 (ADR-0064, ADR-0131) y NAV-S6 (ADR-0132).

Son comportamientos de la plataforma o del runtime. No son decisiones: por eso no van en un ADR.

- **`pagehide` no siempre llega en una navegación MPA.** Chromium puede emitir solo `beforeunload` al salir de una página completa; para cancelar una carga al desmontar hay que escuchar ambos eventos. Abortar dos veces es inocuo. Ver `EVENTOS_SALIDA` en `src/lib/catalogo-carga.ts`.
- **Abortar no cancela un `fetch` que ya resolvió.** Después del `await` hay que volver a chequear `signal.aborted` antes de pintar; el rechazo por aborto llega como `AbortError` y no debe mostrarse como error real. Ver `cargarCatalogoPanel` en `src/lib/catalogo-carga.ts`.
- **`BaseLayout` no envuelve el panel.** `src/layouts/BaseLayout.astro` se usa en landing, privacidad, términos y eliminar datos; las pantallas del panel usan `PanelShell.astro`, que trae su propio `<html>` y `<body>`. Un `<script>` de `BaseLayout` (como el `reveal` con `IntersectionObserver`) no corre en `/panel*`, `/venta` ni `/admin`: para probarlo navegá a `/`.
- **El harness `?data=mil` solo activa si la isla hidrata.** `modoHarnessCatalogo` exige `import.meta.env.DEV` y `TablaCatalogo` se monta con `client:visible`: a 360 px, en `/panel/stock` la tabla queda fuera del viewport y no hidruta (`aria-rowcount=0`). `/panel/precios` sí hidruta; usalo para e2e de catálogo mil o scrolleá primero hasta `[data-harness="mil"]`.
