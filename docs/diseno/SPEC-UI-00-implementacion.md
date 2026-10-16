---
id: SPEC-UI-00
tipo: spec
estado: propuesto
modulos: []
depende_de: [PRD-UI-00, PRD-UI-07]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# SPEC-UI-00 - Implementación ADRs 0032 a 0038

Fuente: `diseno/PRD-UI-0*.md`, `adr/0032..0038`, hallazgos repo 2026-10-12: sin `--mo-*`, Tailwind v4 `@theme` en `src/styles/global.css`, sin lint, sin harness, `panel/venta/admin` con `<style>` inline.

## Adaptaciones decididas

Tokens se quedan `--color-*` de `@theme`, sin port `--mo-*`, medido en `global.css` que no declara ninguno.

Checks verifican invariantes nuevas, no el backlog existente, que queda en tickets.

Harness `_internal` no se commitea, solo su contrato y su gate AT1 de PRD-UI-07.

Sin dependencias nuevas en esta tanda, las installs quedan en tickets.

## Cambios aplicados

- U1 este archivo con tickets T-UI-01 a T-UI-07.
- U2 `scripts/check-ui.mjs` más `npm run check:ui`, 9 invariantes, sin dependencias.
- U3 `global.css`: smooth solo con `no-preference`, kill global con `reduce`, `:focus-visible`, `100dvh`, `16px` en coarse, `.tnum`.
- U4 `BaseLayout.astro`: `viewport-fit=cover` y `theme-color` a canvas `#f7f5f2`.

## Tickets

| Ticket | Alcance | Aceptación | Talla |
|---|---|---|---|
| T-UI-01 | Sonner más `Toaster` único en root, migrar `alert()` de `alta/estado` | Toast success/error/promise visible sobre modal, cero `alert()` | S |
| T-UI-02 | Diálogos `base-ui` más confirm en destructivas | Destructiva crítica pide nombre, resto confirma o deshace | M |
| T-UI-03 | `Virtuoso` en listas largas más `NumberFlow` en precios con `.tnum` | 1000 filas fluidas a 360px gama baja, sin salto de ancho | M |
| T-UI-04 | Inventario `locales/**/*.json` más errores con fix junto al campo | Cada error dice cómo arreglar, foco al primer inválido | M |
| T-UI-05 | Medición contraste AA light y dark registrada por par | Tabla par medido más valor más umbral, cero solo-color | S |
| T-UI-06 | Primer harness `venta` con `?data=worst` a 360px, zoom, dark, RTL | Reporte `What broke` con fix por fila más `What held up` | M |
| T-UI-07 | Gate `interface-review` por PR más guidelines con fetch fresco | PR visual no mergea con `HIGH` abierto | M |

## Verificación

`npm run check:ui` en verde más `npm run typecheck` en verde, ambos sobre el árbol real.
