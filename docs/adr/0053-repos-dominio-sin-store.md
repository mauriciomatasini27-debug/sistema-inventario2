# ADR-0053 - Repositorios de dominio en `src/lib/repos/`: rutas sin `store`

Estado: propuesto. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E4), ADR-0024 (PERS-S4, PERS-S5), ADR-0052, `node scripts/cutover-scope.mjs`.

## Decisión

Cada dominio expone un repositorio en `src/lib/repos/<dominio>.ts` con las lecturas y escrituras que hoy hacen las rutas sobre `store`. El repositorio va primero a Postgres del tenant con `dbVivaTenant()` (ADR-0052); solo si devuelve `null` (modo `single` sin base: dev, tests, build) usa la memoria particionada. Las rutas de `src/pages/api` dejan de importar `lib/store` dominio por dominio, y un arch-test por grupo lo verifica. Orden: tickets, precios y proveedores (grupo 1), luego fiscal, whatsapp/email y el resto.

## Por qué

PERS-S5 pide 0 imports de `store` en `src/pages/api`. Mover la memoria detrás de un repositorio deja una sola puerta por dominio, hace visible el fallback y permite borrar la memoria de un dominio cuando su tabla esté completa, sin tocar las rutas de nuevo.

## Qué cambia

`src/lib/repos/tickets.ts`, `precios.ts`, `proveedores.ts`; rutas `tickets*`, `prices/adjustments` y `suppliers` sin `store`; tests contra Postgres local con `PG_TEST_URL_*`.

## Alternativa descartada

Borrar la memoria de golpe: rompe dev, build y la suite que corre sin base. Dejar la memoria en las rutas: no cumple PERS-S5 y esparce el fallback en 71 archivos.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.
