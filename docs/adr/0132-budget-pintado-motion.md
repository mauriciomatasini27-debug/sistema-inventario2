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

## Pendientes

- Medir INP/CLS por pantalla para priorizar qué superficie pierde el blur.
- Definir el budget numérico y dónde se documenta (tokens o gotchas de diseño).
- Confirmar que `NumberFlow` con `respectMotionPreference` ya cubre el caso reduced-motion.
