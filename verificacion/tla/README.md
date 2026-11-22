# Verificación formal de la cola offline de venta, la baja de plan y los Lotes y stock

Tres modelos TLA+ en este directorio:

- `VentaSync.tla`: la cola offline de `/venta` y su drenaje contra `POST /api/sync/push` (VF-S1).
- `PlanCambio.tla`: la baja programada de plan de PLAN-S4 y su rodado perezoso (VF-S4).
- `StockLotes.tla`: Lotes y stock con el Historial como única fuente de verdad (AUD-VTA-05).

Los dos primeros cubren promesas de `docs/diseno/PRD-VF-01-verificacion-cola-offline-venta.md` y ADR-0097; el tercero cubre la spec #398 y ADR-0123. El modelo de stock corre **solo** en `npm run verificar:formal`: no entra en `npm run verify`.

## Java en este box

No hay `java` en el PATH (RETRO-AUD-04). El JRE 17 está fijado en `~/.cache/sistema-inventario/jdk-17`; corré:

```bash
JAVA_HOME="$HOME/.cache/sistema-inventario/jdk-17" npm run verificar:formal
```

El jar de TLA+ se descarga y se verifica por SHA256 solo la primera vez, en `$XDG_CACHE_HOME/sistema-inventario/tla`.

## Qué verifica VentaSync

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

## Cotas de VentaSync

N = 3 ventas encolables, `Flushes = {f1, f2}` (dos drenajes concurrentes), búsqueda completa. Las leyes se checan sobre todas las interleavings acotadas. El espacio crece rápido con N y con la cantidad de drenajes, por eso quedan fijos.

## Qué queda afuera de VentaSync

- 409 por mismo `op_id` con distinto payload. La caja nunca reusa un `op_id`.
- `/api/sales` en línea (la venta que sí llega al servidor).
- `src/offline/sync-worker.ts`. Tenía el mismo patrón de seguir tras un fallo de red; VF-S2 lo cambió a cortar el flush (test en `tests/sync-worker-corte.test.ts`), pero no está modelado acá.
- Un 2xx con `resultado: "necesita_conexion"` (SYNC-S7) sale de la cola como confirmado. Las ventas de `/venta` no llevan `payload.tipo` sensible, así que el modelo no lo distingue.
- Stock negativo y caja.

## Qué verifica PlanCambio

Modelo de PLAN-S4 sobre `POST /api/plan/cambiar`, `fechaCambioDePlan`/`planVigenteDe` (`src/modules/planes/ciclo.ts`), `cambioDePlan` (`src/modules/planes/catalogo.ts`) y `leerSuscripcionActiva`/`programarCambioPlan` (`src/lib/repos/planes.ts`). Dos pedidos del Dueño corren intercalados, cada uno lee (y roda si toca), decide y escribe.

Cuatro leyes:

- `UnSoloCambio`: una baja programada se aplica a lo sumo una vez y nunca antes de su `hasta`. La primera lectura con `dia >= hasta` la aplica; el programado se limpia para que no vuelva a aplicarse.
- `SinUpgradeSinCobro`: un pedido de subida responde 409 `requiere_cobro` y deja intactos `plan`, `plan_programado` y `hasta`.
- `ProgramadoCompleto`: nunca queda `plan_programado` sin `hasta`, ni en la fila ni en la historia de programados.
- `CancelaMismoPlan`: pedir el plan vigente con un programado pendiente deja `plan_programado` y `hasta` en null, sin tocar `plan`.

Además de `plan-cambio.cfg`, cinco configs de quiebre reproducen un bug deliberado:

| Config | Banderas | Ley | Esperado |
|---|---|---|---|
| `plan-cambio` | todas las banderas `FALSE` | las cuatro | se cumplen (10.738 estados distintos) |
| `quiebre-baja-antes` | `BAJA_ANTES=TRUE` | `UnSoloCambio` | violada (traza de 6 estados) |
| `quiebre-dos-cambios` | `DOS_CAMBIOS=TRUE` | `UnSoloCambio` | violada (traza de 9 estados) |
| `quiebre-subida-sin-cobro` | `SUBIDA_ALTERA=TRUE` | `SinUpgradeSinCobro` | violada (traza de 4 estados) |
| `quiebre-sin-hasta` | `PROGRAMA_SIN_HASTA=TRUE` | `ProgramadoCompleto` | violada (traza de 4 estados) |
| `quiebre-no-cancela` | `NO_CANCELA=TRUE` | `CancelaMismoPlan` | violada (traza de 7 estados) |

Los números de la tabla son de `-workers 1`. Con más workers los estados generados varían un poco; el contraejemplo es el mismo.

## Cotas de PlanCambio

`DIA_MAX = 4` (reloj de días acotado; días 1-2 son el primer ciclo y 3-4 el segundo), `N_PEDIDOS = 2` (dos pedidos concurrentes del Dueño) y `MAX_PEDIDOS = 3` (cada pedido se puede reiniciar hasta agotar esa cota, suficiente para programar y rodar dos bajas). `Baja` solo agenda un `hasta` futuro dentro de la cota (`dia + 1` o el `hasta` vigente de la vista). Búsqueda completa, `-workers 1` y `CHECK_DEADLOCK FALSE`.

## Qué queda afuera de PlanCambio

- El calendario mensual real de `finDeCicloMensual` (aniversario, día 31 en meses cortos, cambio de año). El modelo usa `dia + 1` como próximo fin de ciclo.
- El prorrateo de PLAN-S3. `Nivel` compara precios solo para decidir subida, baja o mismo plan.
- Persistencia en Postgres y su reintento best-effort. El modelo describe la fila lógica de la suscripción y el rodado perezoso al leer.
- El job de rollover. No existe: el cambio ocurre en la primera lectura con `dia >= hasta`.
- Autenticación, membresía del Dueño y validación del body (403/422). Se modela el pedido ya autorizado.
- `/panel/plan` y los eventos de `control.events`.
- "Exactamente una vez en `hasta`" se chequea como seguridad: a lo sumo una vez y nunca antes de `hasta` sobre la fila persistida. Que el rodado ocurra se apoya en `planVigenteDe`, que ya devuelve el programado desde `hasta` en cualquier lectura; no hay ley de liveness.
- Dos pedidos concurrentes con lecturas viejas: gana el último que escribe (`programarCambioPlan` no compara contra lo leído). Las leyes se cumplen igual; el modelo no exige que el último pedido sea el "correcto".

## Qué verifica StockLotes

Modelo de AUD-VTA-05 sobre `aplicarMovimiento` (`src/lib/repos/stock.ts`), `aplicarVentaLotes`, la sobreventa marcada (T03), el fallo de base sin espejo (T04) y la devolución al Lote original (T05). Dos escritores corren intercalados con claves de idempotencia acotadas: reintentar una clave ya aplicada no agrega movimientos. `bdHist` es el Historial de la base y `memHist`/`memStock`/`memLotes` son el espejo en memoria; `Confirmar` escribe ambos en un paso, representando el commit y su espejo dentro del mismo seam.

Cuatro leyes:

- `TresNumeros`: en cada store, Stock disponible = Historial (suma de deltas sin la sobreventa marcada) = suma del resto de los Lotes.
- `SinEspejoTrasFallo`: si la base configurada falla, el intento no cambia memoria y ningún movimiento vive solo en el espejo.
- `DevolucionAlLoteOriginal`: cada devolución reingresa a los Lotes consumidos por la venta de la misma clave de idempotencia, con reparto proporcional, sobrante por redondeo al Lote de vencimiento más cercano y movimientos escritos en la misma transacción.
- `BajaConMovimiento`: toda baja de Lote tiene su movimiento en el Historial, y todo movimiento de salida (salvo la sobreventa) tiene su baja.

Además de `stock-lotes.cfg`, una config de quiebre reproduce el bug original:

| Config | Banderas | Ley | Esperado |
|---|---|---|---|
| `stock-lotes` | `ESPEJO_TRAS_FALLO=FALSE` | las cuatro | se cumplen (55.054 estados distintos) |
| `quiebre-stock-espejo` | `ESPEJO_TRAS_FALLO=TRUE` | `SinEspejoTrasFallo` | violada (traza de 3 estados) |

El contraejemplo del quiebre es `Alta` → `Falla de base`: con `ESPEJO_TRAS_FALLO`, la memoria baja el Stock disponible y el resto del Lote y escribe un movimiento `VENTA` que la base nunca confirmó. Se demostró primero la violación con la config de quiebre (rojo) y después se verificó la config principal (verde).

## Cotas de StockLotes

`MAXCANT = 3` unidades por Lote, `MAXSTOCK = 6`, `MAXMOV = 5` movimientos en el Historial, `MAXOPS = 2` operaciones por escritor (`Ops = {o1, o2}`) y `Idem = {k1, k2, k3}`. Tres Lotes (`l1` vence antes, `l2` después, `gen` genérico sin vencimiento). Búsqueda completa, `-workers 1` y `CHECK_DEADLOCK FALSE`.

## Qué queda afuera de StockLotes

- El modo sin base configurada: la memoria es legítima y atómica; acá siempre hay base y lo que se comprueba es que un fallo no se espeje.
- Costos, precios, caja, fiado y el informe de rotación. La sobreventa se modela como movimiento marcado que no baja proyecciones.
- FEFO real por fecha civil: `Expira` es un orden fijo de tres Lotes, con `gen` al final.
- El reparto con más de dos Lotes por SKU: una venta consume a lo sumo dos, suficiente para probar proporcionalidad y sobrante.
- La conciliación read-only (`npm run conciliar:stock`) y la reparación de desvíos históricos: están fuera de este modelo.
- El modelo de `VentaSync.tla`: este es un spec separado y no toca la cola offline.

## Cómo correr

```bash
npm run verificar:formal
```

Este comando es opcional y queda fuera de `npm run verify`.

Java 17+ y `tla2tools.jar` quedan fuera de `package.json`. El script los busca y, si faltan, avisa el motivo y sale 0 (no rompe `npm run verify`). Busca Java en `$JAVA_HOME/bin/java` y, si no está, en el `PATH`. Descarga `tla2tools.jar` 1.7.4 a `${XDG_CACHE_HOME:-$HOME/.cache}/sistema-inventario/tla/`, fuera del repo, y verifica su SHA256 antes de usarlo. El cache no ensucia `git status`.

Para ver el contraejemplo completo de una config:

```bash
bash scripts/verificar-formal.sh --traza quiebre-sigue-tras-fallo
bash scripts/verificar-formal.sh --traza quiebre-stock-espejo
```

## Salida esperada

```
ok  venta-sync: se cumplen NoVentaPerdida, AlMasUnaFila, NoAtascada (7519 estados distintos)
ok  quiebre-limpia-todo: TLC encontró la violación esperada de NoVentaPerdida (traza de 4 estados)
ok  quiebre-sigue-tras-fallo: TLC encontró la violación esperada de NoAtascada (traza de 9 estados)
ok  quiebre-sin-pk: TLC encontró la violación esperada de AlMasUnaFila (traza de 12 estados)
ok  plan-cambio: se cumplen UnSoloCambio, SinUpgradeSinCobro, ProgramadoCompleto, CancelaMismoPlan (10738 estados distintos)
ok  quiebre-baja-antes: TLC encontró la violación esperada de UnSoloCambio (traza de 6 estados)
ok  quiebre-dos-cambios: TLC encontró la violación esperada de UnSoloCambio (traza de 9 estados)
ok  quiebre-subida-sin-cobro: TLC encontró la violación esperada de SinUpgradeSinCobro (traza de 4 estados)
ok  quiebre-sin-hasta: TLC encontró la violación esperada de ProgramadoCompleto (traza de 4 estados)
ok  quiebre-no-cancela: TLC encontró la violación esperada de CancelaMismoPlan (traza de 7 estados)
ok  stock-lotes: se cumplen TresNumeros, SinEspejoTrasFallo, DevolucionAlLoteOriginal, BajaConMovimiento (55054 estados distintos)
ok  quiebre-stock-espejo: TLC encontró la violación esperada de SinEspejoTrasFallo (traza de 3 estados)
```

## Qué significa un FALLA

Un `FALLA` es una de dos cosas:

- Bug en el código: el modelo sigue describiendo el diseño correcto y el código se desvió. Arreglar el código, no el modelo.
- Modelo desactualizado: el código cambió a propósito y el modelo ya no lo describe. Actualizar el `.tla` correspondiente y el commit de sync de su skill.

Para decidir cuál es y volver a poner el modelo al día, usar `/maintain-formal-verification-skill`. No aflojar las leyes ni las banderas para que pase.
