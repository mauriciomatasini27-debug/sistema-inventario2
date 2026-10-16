---
id: ADR-0068
tipo: adr
estado: aceptado
modulos: []
depende_de: [ADR-0069, PRD-DEP-01]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0068 - Vitest 2 a 5

Estado: aceptado. Fecha: 2026-10-14. Fuentes: PRD `diseno/PRD-DEP-01-actualizacion-dependencias.md`, PRs #8, #10, #11 y #15, alertas Dependabot #19, #30, #31, #38 y #39.

## Decisión

Subir `vitest` a `^5.0.4` (arrastra `@vitest/mocker` 5 y `tinypool` 2.x) en un PR propio, con el lockfile de #10, que es el único de los cuatro que instala, pasa CI y trae `tinypool` corregido.

## Qué cambia

- `package.json`: `vitest` `^2.1.0` a `^5.0.4`. `package-lock.json`: `vite` 8 queda anidado bajo `vitest`, `@astrojs/react` y `@tailwindcss/vite`; Astro 4 sigue con su `vite` 5.
- Sin cambios en tests ni en `vitest.config`.

## Cambios que rompen (guías de migración oficiales v3, v4 y v5)

- v3: `vite` 5+ como peer, `spy.mockReset` restaura la implementación original, `test.each` con `%` cambia el formato de nombres.
- v4: `vite` 6.4+ como peer, `poolOptions` aplanadas, se quitan `workspace` y `deps.external` viejos, el reporter `basic` desaparece.
- v5: `vite` 6.4/7/8 como peer, Node 20.19+ / 22.12+.
- Ninguno aplica: el proyecto no configura pools, workspace ni reporters, y no usa `mockReset`.

## Seguridad

Cierra las críticas GHSA-5gmw-xhrv-c9v3 y GHSA-85c8-ppgw-ccpr (`tinypool`), GHSA-5xrq-8626-4rwp (`vitest` UI) y la media GHSA-82fw-gwwq-j7x9 (`@vitest/mocker`).

## Riesgo y vuelta atrás

Riesgo bajo: solo herramienta de test, no llega al build. Vuelta atrás: revertir `package.json` y `package-lock.json`.

## Alternativa descartada

Vitest 4.1.11 (#11): cierra las mismas alertas pero su lockfile no instala y queda una mayor atrás.

## Evidencia de aceptación (2026-10-14)

- Commit: 8bbc9a0, PR #23.
- CI `ci` verde (run 38505109703).
- Local con Postgres (`PG_TEST_URL_A/B`): `npx vitest run` 117 archivos, 877 passed (igual que con vitest 2.1.9); `tsc --noEmit` 0 errores; `npm run build` OK.
- `npm ls tinypool`: vacío (vitest 5 ya no lo usa). `npm audit`: de 3 críticas a 1 (queda `astro`, ADR-0069).
