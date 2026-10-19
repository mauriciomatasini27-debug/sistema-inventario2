# Verificación formal de la cola offline de venta

Modelo TLA+ `VentaSync.tla` de la cola offline de `/venta` y su drenaje contra `POST /api/sync/push`. Cubre la promesa VF-S1 de `docs/diseno/PRD-VF-01-verificacion-cola-offline-venta.md` y ADR-0097.

## Qué verifica

Tres leyes sobre el código arreglado (VF-S2):

- `NoVentaPerdida`: toda venta cobrada offline está en la outbox del servidor o sigue en la cola local.
- `AlMasUnaFila`: ningún `op_id` tiene más de una fila en la outbox del servidor.
- `NoAtascada`: ningún item que queda en la cola está condenado a 422 para siempre.

El modelo describe `sincronizarColaVenta` (`src/offline/cola-venta.ts`), su `onclick` de `#sync` (`src/pages/venta.astro`), `empujarOperacion` (`src/lib/repos/sync.ts`) y la PK de `op_id` (`src/db/schema.ts`).

Además de `venta-sync.cfg`, tres configs de quiebre reproducen un bug deliberado y exigen que TLC lo encuentre:

| Config | Banderas | Ley | Esperado |
|---|---|---|---|
| `venta-sync` | `LIMPIA_TODO=FALSE`, `CORTA_EN_FALLO=TRUE`, `UN_DRENAJE=FALSE`, `PK=TRUE` | las tres | se cumplen (7.519 estados distintos) |
| `quiebre-limpia-todo` | `LIMPIA_TODO=TRUE`, `CORTA_EN_FALLO=FALSE`, `UN_DRENAJE=FALSE`, `PK=TRUE` | `NoVentaPerdida` | violada (traza de 4 estados) |
| `quiebre-sigue-tras-fallo` | `LIMPIA_TODO=FALSE`, `CORTA_EN_FALLO=FALSE`, `UN_DRENAJE=FALSE`, `PK=TRUE` | `NoAtascada` | violada (traza de 9 estados) |
| `quiebre-sin-pk` | `LIMPIA_TODO=FALSE`, `CORTA_EN_FALLO=TRUE`, `UN_DRENAJE=FALSE`, `PK=FALSE` | `AlMasUnaFila` | violada (traza de 12 estados) |

Los números de la tabla son de `-workers 1`. Con más workers los estados generados varían un poco; el contraejemplo es el mismo.

## Cotas

N = 3 ventas encolables, `Flushes = {f1, f2}` (dos drenajes concurrentes), búsqueda completa. Las leyes se checan sobre todas las interleavings acotadas. El espacio crece rápido con N y con la cantidad de drenajes, por eso quedan fijos.

## Qué queda afuera

- 409 por mismo `op_id` con distinto payload. La caja nunca reusa un `op_id`.
- `/api/sales` en línea (la venta que sí llega al servidor).
- `src/offline/sync-worker.ts`. Tenía el mismo patrón de seguir tras un fallo de red; VF-S2 lo cambió a cortar el flush (test en `tests/sync-worker-corte.test.ts`), pero no está modelado acá.
- Un 2xx con `resultado: "necesita_conexion"` (SYNC-S7) sale de la cola como confirmado. Las ventas de `/venta` no llevan `payload.tipo` sensible, así que el modelo no lo distingue.
- Stock negativo y caja.

## Cómo correr

```bash
npm run verificar:formal
```

Java 17+ y `tla2tools.jar` quedan fuera de `package.json`. El script los busca y, si faltan, avisa el motivo y sale 0 (no rompe `npm run verify`). Busca Java en `$JAVA_HOME/bin/java` y, si no está, en el `PATH`. Descarga `tla2tools.jar` 1.7.4 a `${XDG_CACHE_HOME:-$HOME/.cache}/sistema-inventario/tla/`, fuera del repo, y verifica su SHA256 antes de usarlo. El cache no ensucia `git status`.

Para ver el contraejemplo completo de una config:

```bash
bash scripts/verificar-formal.sh --traza quiebre-sigue-tras-fallo
```

## Salida esperada

```
ok  venta-sync: se cumplen NoVentaPerdida, AlMasUnaFila, NoAtascada (7519 estados distintos)
ok  quiebre-limpia-todo: TLC encontró la violación esperada de NoVentaPerdida (traza de 4 estados)
ok  quiebre-sigue-tras-fallo: TLC encontró la violación esperada de NoAtascada (traza de 9 estados)
ok  quiebre-sin-pk: TLC encontró la violación esperada de AlMasUnaFila (traza de 12 estados)
```

## Qué significa un FALLA

Un `FALLA` es una de dos cosas:

- Bug en el código: el modelo sigue describiendo el diseño correcto y el código se desvió. Arreglar el código, no el modelo.
- Modelo desactualizado: el código cambió a propósito y el modelo ya no lo describe. Actualizar `VentaSync.tla` y el commit de sync.

Para decidir cuál es y volver a poner el modelo al día, usar `/maintain-formal-verification-skill`. No aflojar las leyes ni las banderas para que pase.
