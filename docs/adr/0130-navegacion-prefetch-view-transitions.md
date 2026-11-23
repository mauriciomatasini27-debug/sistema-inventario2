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
resumen: La navegación entre rutas deja de ser un full reload SSR: se habilitan prefetch y View Transitions de Astro con fallback MPA, sin migrar a un router SPA.
---
# ADR-0130 - Navegación con prefetch y View Transitions

Estado: propuesto. Fecha: 2026-11-23. Fuentes: PRD-NAV-01.

## Decisión

La fluidez entre rutas se logra habilitando el `prefetch` de Astro y las View Transitions (`viewTransitions`) con fallback progresivo (MPA) para clientes sin JS, en vez de migrar a un router SPA (React Router o similar). No se reemplaza el modelo `output: "server"` de Astro.

## Por qué

Hoy cada cambio de ruta es un full reload: Astro está en `output: "server"` y `astro.config.mjs` no activa `prefetch` ni View Transitions. El navegador espera el primer byte del SSR, re-parsea el HTML y re-ejecuta los scripts inline de cada página; ese "blanco" es lo que se percibe como freeze. El prefetch calienta la siguiente página antes del clic y las View Transitions interpolan el pintado sin recargar. Mantener MPA como fallback evita reescribir las 32 páginas de `src/pages/*.astro`, que dependen de scripts inline y `DOMContentLoaded`.

## Qué cambia

- `astro.config.mjs` suma `prefetch` y View Transitions (sintaxis exacta de Astro 7 por confirmar).
- Fallback MPA: sin JS la navegación sigue como hoy; con JS, transición de vista.
- Se mide TTFB/LCP antes y después como evidencia del PRD-NAV-01.
- No se migra ningún layout ni página a un framework SPA.

## Pendientes

- Confirmar en Astro 7 la sintaxis exacta de prefetch/viewTransitions antes de implementar.
- Verificar que los scripts inline de panel/admin/venta no rompan con la persistencia de estado que introducen las transiciones de vista.
- Decidir el alcance: landing, panel o ambos en una primera pasada.
