---
id: ADR-0082
tipo: adr
estado: aceptado
modulos: [bot, offline, pagos, persistencia, ventas]
depende_de: [ADR-0065, ADR-0073, PRD-PERS-07]
reemplaza: []
reemplazado_por: ""
modifica: [ADR-0073]
resumen: |
  Los 9 errores tragados permitidos por E7 se reemplazan por console.warn con prefijo del módulo y el error,
  devolviendo el mismo valor por defecto que hoy, salvo donde el error ya tiene a quién subir.
---
# ADR-0082 - Errores tragados de E7 a cero

Estado: aceptado (2026-10-14, evidencia: `tests/pers7-errores-tragados.test.ts` y `tests/arch/sin-errores-tragados.test.ts` con `PERMITIDOS` vacío). Fecha: 2026-10-14. Fuentes: PRD `diseno/PRD-PERS-07-errores-tragados.md`, ADR-0073 (E7), ADR-0065, `tests/arch/sin-errores-tragados.test.ts`, `src/lib/repos/ordenes-pago.ts`, `src/offline/db.ts`, `src/modules/sales/ticket_template.ts`, `src/modules/whatsapp/cliente-cloud.ts`.

## Decisión

Los 9 errores tragados permitidos por E7 se reemplazan por `console.warn` con prefijo del módulo y el error, devolviendo el mismo valor por defecto que hoy, salvo donde el error ya tiene a quién subir. No hay logger propio en `src`, así que no se agrega uno: `console.warn` alcanza y es lo que ve la consola del navegador y el log del servidor. `PERMITIDOS` queda vacío y el test espera tamaño 0, así que cualquier `.catch(() => null)` nuevo rompe CI.

- `ordenes-pago.ts`: la lectura de la orden rival dentro del conflicto del insert registra su falla (con la key) y se relanza el error original del insert, que es la causa real. Relanzar el error de la lectura rival en su lugar ocultaría el conflicto; el camino resultante no cambia (multi 503, single fallback en memoria; con rival, 409).
- `offline/db.ts`: `tail` de `transact()` registra y resuelve. Relanzar ahí cortaría la cadena de turnos para siempre; el llamador ya recibe el rechazo por `run`.
- `ticket_template.ts`, `cliente-cloud.ts`: 2xx sin JSON registra el status y sigue en `respuesta_invalida`.
- `BaseLayout.astro`, `alta.astro`, `alta/estado.astro`, `venta.astro`: `console.warn` en el navegador y mismo valor por defecto; sin helper compartido (`alta/estado.astro` usa `define:vars`, script inline que no puede importar).

## Qué cambia

- Los 9 sitios de `PERMITIDOS` en `src` registran con `console.warn` o relanzan.
- `tests/arch/sin-errores-tragados.test.ts`: `PERMITIDOS` vacío, tamaño esperado 0.
- Tests de error para la orden rival, los dos clientes de WhatsApp y la cola offline.

## Alternativa descartada

Logger propio o servicio externo: no existe uno en `src` y sería un servicio o dependencia nueva fuera de la talla S. Relanzar en todos los sitios: rompería la cola offline y cambiaría la UI de alta y venta ante respuestas sin JSON. Dejar la lista: E7 seguiría con 9 sitios sin rastro.

## Consecuencias

Fallas que hoy no dejan rastro aparecen como `console.warn` en el log del servidor o en la consola del navegador. Ningún status, shape HTTP ni mensaje de la UI cambia. E7 queda en 0 y no admite excepciones sin editar el test.

## Pendientes

Logger estructurado si se adopta un servicio de logs. Revisar los `catch` con cuerpo que solo devuelven un valor (p.ej. `panel.astro`) si se amplía el detector de E7.

## Evidencia de aceptación (2026-10-14)

- Sin migración. E7 en 0: `PERMITIDOS` vacío y `expect(PERMITIDOS.size).toBe(0)`.
- `npm run evidencia` con `PG_TEST_URL_A/B` (Postgres local 127.0.0.1:54329):
  - tsc: 0 errores
  - vitest: `Test Files  140 passed (140)`
  - vitest: `Tests  1001 passed (1001)`
  - build: `13:07:31 [build] Complete!`
  - sha: `4ae095f`
- `npm run check:arch`: `Test Files  11 passed (11)`, `Tests  22 passed (22)`; baselines sin cambio (`storeRepos` 430, `esModoMulti` 145, `asNeverTestsTotal` 443).
- TDD: antes del cambio, los 4 tests de `tests/pers7-errores-tragados.test.ts` fallaban (`ordenRivalTrasConflicto` no existía; sin `console.warn` en la cola offline ni en los dos clientes de WhatsApp); después pasan.
- Cambio de comportamiento: los 9 sitios registran con `console.warn` (servidor o consola del navegador) donde antes callaban. Ninguno relanza un error nuevo: la orden rival que falla se registra y se sigue relanzando el error original del insert como antes. Sin cambio de shape HTTP, status codes ni UI.
