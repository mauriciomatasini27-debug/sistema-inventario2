---
id: ADR-0097
tipo: adr
estado: propuesto
modulos: [ventas, sync]
depende_de: [ADR-0003, ADR-0017, ADR-0061, ADR-0086]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Se adopta verificación formal acotada a promesas donde un bug cuesta plata o datos. TLA+ con TLC
  cubre orden de eventos y concurrencia sobre modelos chicos, y fast-check cubre leyes de funciones
  puras sobre el código TS real. Arranca por la cola offline de /venta y no entra al gate todavía.
---
# ADR-0097 - Verificación formal de promesas críticas

Estado: propuesto. Fecha: 2026-10-19. Fuentes: spike del 2026-10-19 sobre la cola offline de `/venta` y `empujarOperacion` (modelo, `.cfg` y salidas de TLC en el box, `/workspace/formal-eval/`, fuera del repo); `src/pages/venta.astro:146-167`, `src/lib/repos/sync.ts:95-160`, `src/db/schema.ts:112`; ADR-0003 (datos offline), ADR-0017 (slice 0), ADR-0061 (repo sync), ADR-0086 (gate local).

## Decisión

Se adopta verificación formal solo donde una promesa rota cuesta plata o datos y los tests llegan poco. La elección de herramienta sigue la pregunta, no el lenguaje del producto.

- Para eventos en mal orden, carreras y máquinas de estado sobre un diseño chico se usa TLA+ con TLC sobre un modelo acotado. Es el default para esa clase de pregunta.
- Para leyes de funciones puras en TypeScript se usa fast-check contra el código real, con entradas generadas. No se modela la función a mano.
- Para memoria, overflow y otras propiedades del código compilado se usaría un verificador que corra sobre el código. Hoy no aplica porque el repo no tiene Rust, C ni bloques `unsafe`.
- No se adopta Quint ni Apalache por ahora. Agregan un segundo lenguaje y toolchain para propiedades que TLA+ y fast-check ya cubren en este repo.

Las specs viven en `verificacion/tla/` en la raíz del repo. Cada modelo lleva su archivo `.tla`, sus `.cfg` por escenario y una nota de qué parte del código describe. El modelo del spike es la primera copia de referencia y se mueve ahí en VF-S1.

La skill local la genera `/create-formal-verification-skill` y vive en `.agents/skills/verify-<área>/SKILL.md`. Registra la cobertura por archivo y función, el commit de sync, el comando para correr el chequeo, cómo distinguir un bug de un error de modelado y qué hacer cuando cambia el código cubierto. El commit de sync se mueve solo después de confirmar que el modelo describe el código nuevo. `/maintain-formal-verification-skill` es el par que revisa el resultado y devuelve in sync, updated, bug o blocked.

El alcance no es "verificar el repo". Es una lista corta de promesas. Entra una promesa cuando romperla pierde una venta, duplica una fila, cobra dos veces, deja stock negativo o pierde un comprobante. No entra una función solo porque sea fácil de modelar.

## Por qué

### El spike encontró un bug real en la cola offline

El modelo `VentaSync` describe la cola de `/venta` y `empujarOperacion` con N=3 ventas, 2 drenajes concurrentes y búsqueda completa. Estas son las tres leyes que se chequearon.

- `NoVentaPerdida`. Toda venta cobrada offline está en la outbox del servidor o sigue en la cola local.
- `AlMasUnaFila`. Ningún `op_id` tiene más de una fila en la outbox del servidor.
- `NoAtascada`. Ningún item que queda en la cola está condenado a 422 para siempre.

Resultados reales de TLC2 2026.10.15 con tla2tools.jar 1.8.0 y JRE 21. La tabla sale de `RESULTADOS.txt` del spike. En las corridas violadas, los estados generados varían un poco entre corridas porque TLC usa 2 workers; el contraejemplo es el mismo.

| Escenario | Ley | Resultado | Generados / distintos |
|---|---|---|---|
| `actual-perdida` | `NoVentaPerdida` | violada | 19 / 19 |
| `actual-duplicado` | `AlMasUnaFila` | se cumple | 39.196 / 18.560 |
| `sinpk-duplicado` | `AlMasUnaFila` | violada | 5.102 / 2.806 |
| `fixparcial-atascada` | `NoAtascada` | violada | 815 / 439 |
| `fix-sin-lock` | las tres | se cumplen | 19.661 / 7.519 |
| `fix-completo` | las tres | se cumplen | 2.250 / 1.326 |
| `fixsinpk-duplicado` | `AlMasUnaFila` | violada | 2.248 / 1.036 |

Las corridas que se cumplen terminaron con 0 estados en cola. TLC corta en el contraejemplo cuando la ley se viola.

El contraejemplo de `NoVentaPerdida` en el código actual, contado en pasos del código.

1. Una venta se cobra sin red. `POST /api/sales` falla y la venta queda en `localStorage[outboxKey]` (`venta.astro:146`).
2. Se toca sync. El drenaje lee la cola y manda el push de esa venta (`venta.astro:155`).
3. El pedido se pierde antes de llegar al servidor. El `catch` lo registra y el `for` sigue con el próximo (`venta.astro:165`).
4. No hay próximo. `localStorage.setItem(outboxKey, "[]")` borra la cola (`venta.astro:167`). La venta no está en el servidor ni en la cola. TLC la viola en 4 estados.

El mismo final ocurre con un 422 o un 5xx. `fetch` no lanza con una respuesta HTTP de error, el código no mira el status y el borrado final corre igual.

El servidor no es el problema. La PK de `op_id` (`src/db/schema.ts:112`) y la relectura ante 23505 (`src/lib/repos/sync.ts:149`) sostienen `AlMasUnaFila` aun con dos drenajes y respuestas perdidas. El 422 por `device_seq` (`src/lib/repos/sync.ts:123`) ordena la cola. El bug está en el cliente, que trata "intenté" como "sincronicé".

### El arreglo tiene dos partes, no una

Sacar de la cola solo lo que tuvo 2xx y seguir con el próximo no alcanza. La corrida `fixparcial-atascada` viola `NoAtascada` en 815 estados generados. La venta 1 se pierde en la red, la venta 2 entra y deja el `max(device_seq)` en 2, y la venta 1 queda en la cola con un 422 seguro para siempre.

Sacar solo lo 2xx y cortar en el primer fallo cumple las tres leyes, con 19.661 estados generados y 7.519 distintos. Un lock entre pestañas no hace falta para estas leyes, porque la PK del servidor cubre la concurrencia. Agregar un solo drenaje a la vez también cumple, con 2.250 estados generados y 1.326 distintos, y baja el espacio de búsqueda. La PK es lo que impide duplicados. Con el mismo arreglo y sin PK, `AlMasUnaFila` vuelve a fallar en 2.248 estados generados.

### Qué queda afuera

El modelo no cubre payload distinto con el mismo `op_id` (409), `/api/sales` en línea, `src/offline/sync-worker.ts`, stock negativo ni caja. `sync-worker.ts` tiene el mismo patrón de seguir tras un fallo, pero hoy usa un push loopback sin red real, así que va como candidato y no como hallazgo.

## Qué cambia

- Se agregan este ADR y el PRD-VF-01. No se agrega código, dependencia ni migración en este ADR.
- VF-S1 mueve el modelo `VentaSync` a `verificacion/tla/`, conserva los siete escenarios y agrega `scripts/verificacion-tla.sh`.
- VF-S2 arregla `src/pages/venta.astro` y agrega el test de regresión que reproduce la pérdida.
- VF-S3 genera `.agents/skills/verify-venta-sync/SKILL.md` con la cobertura y el commit de sync, y la prueba con un quiebre.
- VF-S4 suma el segundo modelo estable sobre PLAN-S4.

### Gate

TLA+ no entra a `npm run verify` todavía. El script `scripts/verificacion-tla.sh` es opcional. Si falta `java` o falta el jar, imprime el motivo y sale 0. Si están, corre el modelo vigente y el quiebre deliberado.

Entra al gate recién cuando haya 2 modelos estables. Un modelo es estable cuando pasa sobre el código actual, falla en una variante rota deliberada y tiene su skill local con cobertura y sync commit al día. Hasta entonces, el script se corre a mano en los PRs que tocan las áreas cubiertas.

### Costo

- Java 17+ y `tla2tools.jar` viven fuera de `package.json`. El spike usó JRE 21, tla2tools.jar 1.8.0 y TLC2 2026.10.15.
- Con estas cotas las 7 corridas tardan unos 7 segundos en total en el box. El costo crece rápido con N y con la cantidad de drenajes, así que cada modelo fija sus cotas y las justifica.
- El modelo se mantiene cuando cambia el código cubierto. Para eso está `/maintain-formal-verification-skill`.
- La meta-skill es beta en pstack v0.15.27 y no está vendorizada. El ADR no depende de que la meta-skill sea estable. Los artefactos durables son el modelo, los `.cfg`, el script y la skill local generada.

## Pendientes

- OK de Mauri para vendorizar `/create-formal-verification-skill` y `/maintain-formal-verification-skill` (beta, pstack v0.15.27).
- OK de Mauri para pedir Java 17+ y `tla2tools.jar` (versión pinneada) a quien corra el chequeo, incluida su máquina Windows. En el box ya hay un JRE 21 en `~/.local`, fuera del repo.
- OK de Mauri para sumar fast-check como devDependency.
- Confirmar el segundo modelo estable. El candidato de VF-S4 es PLAN-S4.
- Decidir si el script opcional corre también en la verificación local manual.
