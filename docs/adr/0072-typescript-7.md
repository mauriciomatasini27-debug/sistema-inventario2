# ADR-0072 - TypeScript 5.9 a 7

Estado: aceptado. Fecha: 2026-10-14. Fuentes: PRD `diseno/PRD-DEP-01-actualizacion-dependencias.md`, PR #7, notas de versión de TypeScript 6.0 y 7.0.

## Decisión

Subir `typescript` a `^7.0.2` en un PR propio, con lockfile regenerado, como último paso de la pila.

## Qué cambia

`package.json` y `package-lock.json`. `npm run typecheck` (`tsc --noEmit`) usa el compilador nativo.

## Cambios que rompen (notas de versión)

- 6.0 deprecó y 7.0 quita: `target: es5`, `moduleResolution: node`/`classic`, `baseUrl` sin `paths`, `outFile`, `esModuleInterop: false`, `module: amd/umd/system`. `tsconfig.json` usa `ES2022`, `ESNext` y `bundler`: no aplica.
- 7.0 es el compilador en Go y no expone la API de JavaScript (`require("typescript").createProgram` es `undefined`). Astro 4 traía su propio TypeScript 5.9 para `tsconfck`; con Astro 7 no hay paquete del árbol que dependa de la API del `typescript` raíz. Medido: `tsc --noEmit` 0 errores, 877 tests y `build` verdes.

## Riesgo y vuelta atrás

Riesgo bajo en CI; medio en herramientas futuras que usen la API (por ejemplo `@astrojs/check` o plugins de editor). Vuelta atrás: revertir `package.json` y `package-lock.json`.

## Alternativa descartada

TypeScript 6 como paso intermedio: no hay error que lo justifique y Dependabot volvería a abrir el salto a 7.

## Evidencia de aceptación (2026-10-14)

- Commit: ea7f0b2, PR #27.
- CI `ci` verde (run 38505658911).
- Local: `npx tsc -v` 7.0.2; `npm run typecheck` 0 errores; un archivo de prueba con `const x: number = "a"` da `error TS2322` (el compilador nativo sí revisa); `npx vitest run` 881 passed; build OK.
- `npm ls typescript`: solo `typescript@7.0.2`; ningún paquete del árbol usa la API de JavaScript.
