---
id: harness-venta
tipo: spec
estado: hecho
modulos: [ventas-caja-fiado]
depende_de: [PRD-UI-07, ADR-0038]
reemplaza: []
reemplazado_por: ""
resumen: Primer harness worst-case de /venta para PRD-UI-07 UI-S28 (SPEC-UI-00 T-UI-06): fixture, toggle dev-only y reporte de roturas.
---

# Harness worst-case de /venta

Reporte de PRD-UI-07 UI-S28 / SPEC-UI-00 T-UI-06. Fixture en `src/lib/venta-worst.ts`, toggle dev-only en `src/pages/venta.astro` y spec en `tests/e2e/venta-worst.spec.ts`.

## Cómo correrlo

```bash
npm run dev
PW_CHANNEL=chrome npx playwright test tests/e2e/venta-worst.spec.ts
```

URLs del harness, solo con `import.meta.env.DEV`:

- `/venta?data=worst`: llena la UI con el peor caso (sin POST).
- `/venta?data=worst&dir=rtl`: idem con `<html dir="rtl">`.

Escenarios del spec: 360x800, zoom 200% (viewport 180x400, `deviceScaleFactor` 2), `colorScheme: dark` y `dir=rtl`. Cada uno guarda screenshot en `test-results/`.

## What broke

| Escenario | Qué se rompió | Causa | Fix | Estado |
|---|---|---|---|---|
| 360px | Desborde con SKU largo sin espacios | Sin `overflow-wrap: anywhere` en textos largos | `overflow-wrap: anywhere` en `#balance`, `.producto .nombre`, `.provisorio` | verificado en Chrome 2026-10-17 |
| 360px | Ancho de inputs supera el contenedor | `box-sizing: content-box` sumaba padding y borde al 100% | `*, *::before, *::after { box-sizing: border-box }` | verificado en Chrome 2026-10-17 |
| 360px | Nombres largos empujan el monto | Sin `min-width: 0` en el hijo flex | `min-width: 0` en `.card` y `.producto .nombre`, `flex: 1 1 auto` | verificado en Chrome 2026-10-17 |
| RTL | Márgenes y alineación de izquierda en `dir=rtl` | Propiedades físicas (`margin`, `text-align`) | `margin-inline`, `padding-inline`, `text-align: start` | verificado en Chrome 2026-10-17 |
| zoom 200% | `#estado` desbordaba 142px en 133px con el error de API largo sin espacios (falla real del spec en Chrome) | `white-space: pre-wrap` sin permiso de corte dentro de palabras | `overflow-wrap: anywhere` en `#estado` | verificado en Chrome 2026-10-17 |
| dark | Página sin modo oscuro | Sin bloque `prefers-color-scheme: dark` | Bloque dark con `var(--color-void)` de fondo y `var(--color-star-white)` de texto | verificado en Chrome 2026-10-17 |

## What held up

Corrida 2026-10-17 con Chrome (`PW_CHANNEL=chrome`): 4/4 escenarios en verde tras el fix de `#estado`.

- Touch targets: `input, select, button` conservan `min-height: 44px`; `#cobrar` mide 44px o más.
- Montos: `.monto` usa `font-variant-numeric: tabular-nums` y `white-space: nowrap`, sin salto de ancho.
- Cola offline de 50 provisorios: se renderiza sin desborde horizontal.
- Toggle: en build de producción queda inerte; el fixture no entra al bundle cliente.
