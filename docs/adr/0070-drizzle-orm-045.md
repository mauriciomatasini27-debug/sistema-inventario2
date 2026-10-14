# ADR-0070 - Drizzle ORM 0.36 a 0.45

Estado: aceptado. Fecha: 2026-10-14. Fuentes: PRD `diseno/PRD-DEP-01-actualizacion-dependencias.md`, PR #14, alerta Dependabot #15 (GHSA-gpj5-g38j-94v9), notas de versión de `drizzle-orm` 0.37 a 0.45.

## Decisión

Subir `drizzle-orm` a `^0.45.4` en un PR propio, con lockfile regenerado. `drizzle-kit` 0.31 ya es compatible.

## Qué cambia

`package.json` y `package-lock.json`. Sin cambios en `src/db`.

## Cambios que rompen (notas de versión)

En 0.x cada minor puede romper. Los que tocan Postgres: tipos de `.$inferSelect` más estrictos en columnas con default, cambios en `onConflictDoUpdate` con `where` y escape de identificadores (el arreglo de seguridad). La compilación con `tsc` y los tests de `tests/pers2-*` contra Postgres son la prueba.

## Seguridad

Cierra la alta GHSA-gpj5-g38j-94v9 (inyección SQL por identificadores mal escapados).

## Riesgo y vuelta atrás

Riesgo bajo a medio: toca todo acceso a base, pero sin cambio de esquema ni de migraciones. Vuelta atrás: revertir `package.json` y `package-lock.json`.

## Alternativa descartada

Esperar a drizzle 1.0: deja abierta una inyección SQL.

## Evidencia de aceptación (2026-10-14)

- Commit: 42377e3, PR #25.
- CI `ci` verde (run 38505249608) con Postgres de servicio y migraciones `drizzle-kit migrate`.
- Local: `npx vitest run` 877 passed; `npx vitest run tests/pers2` 118 passed contra Postgres; `tsc --noEmit` 0 errores; build OK.
- `npm audit`: queda 1 alta (`node-forge`, sin versión corregida) y 4 moderadas de `drizzle-kit` (`@esbuild-kit`, solo desarrollo).
