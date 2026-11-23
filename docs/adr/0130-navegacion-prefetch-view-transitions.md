---
id: ADR-0130
tipo: adr
estado: propuesto
modulos: [admin, landing]
depende_de: []
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: La navegación entre rutas deja de ser un full reload SSR visible: se habilitan prefetch y View Transitions cross-document nativas, con MPA y sin JS como fallback, sin migrar a un router SPA.
---
# ADR-0130 - Navegación con prefetch y View Transitions

Estado: propuesto. Fecha: 2026-11-23. Fuentes: PRD-NAV-01.

## Decisión

La fluidez entre rutas se logra habilitando el `prefetch` de Astro y las View Transitions cross-document nativas (`@view-transition { navigation: auto }`) en todos los documentos, con degradación a MPA para clientes sin soporte o sin JS. No se adopta `<ClientRouter />` (el router SPA de Astro) ni se reemplaza `output: "server"`.

## Por qué

Hoy cada cambio de ruta es un full reload: Astro está en `output: "server"` y `astro.config.mjs` no activa `prefetch` ni View Transitions. El navegador espera el primer byte del SSR, re-parsea el HTML y re-ejecuta los scripts de cada página; ese "blanco" es lo que se percibe como freeze. El prefetch calienta la siguiente página antes del clic y las View Transitions interpolan el pintado.

Se descarta `<ClientRouter />` por dos razones. Primero, el ADR pedía no migrar a un router SPA. Segundo, los `<script>` procesados por Astro son módulos y se ejecutan una sola vez por documento: el router SPA reemplaza el `<body>` sin volver a ejecutarlos, así que una pantalla revisitada quedaría sin inicializar salvo migrar la inicialización de todas las páginas a `astro:page-load`. Las View Transitions nativas animan la navegación sin tocar los scripts: cada navegación sigue siendo un documento nuevo y el fallback sin JS es el MPA de siempre.

El costo medido es +20 a +28 ms de LCP (3–4 %) por el snapshot cross-document, con latencia simulada de 150 ms y mediana de 3 corridas; la evidencia y el comando quedan en PRD-NAV-01. Se acepta a cambio de cubrir el blanco entre rutas; si el delta crece, se revisa con medición en producción.

## Qué cambia

- `astro.config.mjs` suma `prefetch` (`prefetchAll` en hover) para las páginas internas.
- `src/styles/navegacion.css` define `@view-transition { navigation: auto }` y desactiva la animación con `prefers-reduced-motion`; cada documento con `<html>` lo importa.
- Los enlaces a `/api` llevan `data-astro-prefetch="false"`: no son páginas y no se prefetchean.
- El alcance es todos los documentos (landing, panel, venta, admin, alta, ticket y onboarding), porque la transición necesita el opt-in en los dos extremos de cada enlace.
- No se migra ningún layout ni página a un framework SPA.

## Evidencia

- Medición repetible: `npm run medir:navegacion -- --base-url http://localhost:4321` (TTFB/LCP caliente y frío, View Transition y navegación sin JS). Resultados del 2026-11-23 en PRD-NAV-01.
- Comportamiento: `tests/e2e/navegacion-vt.spec.ts` (prefetch tras hover, View Transition en la navegación y MPA sin JS) y guardas estáticas en `tests/navegacion-view-transitions.test.ts`.

## Pendientes

- Repetir la medición contra el deploy (en dev el HTML no se cachea y el prefetch no se reutiliza), para confirmar que el prefetch baja el TTFB de producción.
- Revisar el delta de LCP si el equipo lo considera bloqueante; hoy es de 3–4 % y no cambia el orden de magnitud.
- Los scripts de panel/admin/venta no requieren migración mientras no se adopte un router SPA.
