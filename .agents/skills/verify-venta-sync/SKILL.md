---
name: verify-venta-sync
description: "Verifica la cola offline de /venta con TLA+/TLC y tests de comportamiento: sincronizarColaVenta, quitarConfirmados, el onclick de #sync, empujarOperacion, la tabla outbox y su PK, device_seq. Usala ante cualquier cambio en ese código o en el contrato de push, antes de dar por cerrado el cambio."
---

# Verificar la cola offline de venta

Esta skill cubre una promesa concreta. Una venta cobrada sin red no se pierde, no se duplica en el servidor y no queda atascada para siempre. El chequeo formal valida el modelo del diseño. Los tests validan el código real. Corré los dos.

## Cuándo usarla

Usala si tu cambio toca alguno de estos archivos o funciones. Si no toca ninguno, no hace falta.

| Archivo | Qué mirar |
|---|---|
| `src/offline/cola-venta.ts` | `sincronizarColaVenta`, `quitarConfirmados`, `contarSensibles`, los tipos `ItemCola`, `DepsColaVenta`, `RespuestaPush` y `ResultadoColaVenta` |
| `src/pages/venta.astro` | el `onclick` de `#sync` (arma `leer`, `escribir`, `enviar`), el `onclick` de `#cobrar` (encolado offline), `nextSeq`, las claves `slice0-outbox` y `slice0-seq` |
| `src/lib/repos/sync.ts` | `empujarOperacion` y sus ramas: replay por `op_id`, chequeo de `device_seq` con 422, `INSERT` y relectura ante 23505 |
| `src/db/schema.ts` | `outbox`, en particular `opId` como `primaryKey` y `device_seq` |
| `tests/cola-venta.test.ts`, `tests/sync-worker-corte.test.ts` | si los cambiás, actualizá también el registro de cobertura de esta skill |

También usala si cambia el contrato de `POST /api/sync/push`, el formato de la cola en `localStorage` o la monotonía de `device_seq`.

## Cómo correr

```bash
npm run verificar:formal
npx vitest run tests/cola-venta.test.ts tests/sync-worker-corte.test.ts
```

Necesita Java 17+. En Ubuntu o WSL: `sudo apt install -y openjdk-17-jre-headless`. Si tu Java no está en el `PATH`, exportá `JAVA_HOME` solo en esa shell; no lo escribas en archivos del repo. El script busca `$JAVA_HOME/bin/java`, si no está usa el `PATH`, y descarga `tla2tools.jar` 1.7.4 a `${XDG_CACHE_HOME:-$HOME/.cache}/sistema-inventario/tla/` con chequeo de SHA256.

Verde formal son estas cuatro líneas:

```
ok  venta-sync: se cumplen NoVentaPerdida, AlMasUnaFila, NoAtascada (7519 estados distintos)
ok  quiebre-limpia-todo: TLC encontró la violación esperada de NoVentaPerdida (traza de 4 estados)
ok  quiebre-sigue-tras-fallo: TLC encontró la violación esperada de NoAtascada (traza de 9 estados)
ok  quiebre-sin-pk: TLC encontró la violación esperada de AlMasUnaFila (traza de 12 estados)
```

Con `-workers 1` los números son deterministas: si cambian sin que cambie el modelo o el `.cfg`, averiguá por qué. Lo que importa es que las cuatro digan `ok`. Si el script imprime "No se verificó nada" y sale 0, no hay verde. Falta Java o el jar.

## Las leyes

- `NoVentaPerdida`: toda venta cobrada offline está en la outbox del servidor o sigue en la cola local. Si se rompe, la caja cobró y esa venta desaparece.
- `AlMasUnaFila`: ningún `op_id` tiene más de una fila en la outbox del servidor. Si se rompe, el servidor registra la misma venta dos veces.
- `NoAtascada`: ningún item que queda en la cola está condenado a 422 para siempre. Si se rompe, la venta queda en `localStorage` y nunca va a poder subir.

## Qué hacer ante un FALLA

Un `FALLA` en la corrida normal, o un quiebre que no encuentra su violación, es una de dos cosas. Decidí con evidencia, no por comodidad.

1. Sacá la traza del config que corresponda:

   ```bash
   bash scripts/verificar-formal.sh --traza quiebre-sigue-tras-fallo
   ```

2. Traducí cada `State N` a acciones del código, en este orden: `Vender` es encolar una venta en `#cobrar`; `Empezar` es el `onclick` de `#sync` leyendo `localStorage[outboxKey]`; `Llegar`, `Pre`, `SeqChk`, `Ins`, `ResponderOk` son las ramas de `empujarOperacion`; `Responder422` es el 422 por `device_seq`; `Fallo` es el `catch` de `enviar` o un status no 2xx; `Seguir` con `LIMPIA_TODO` es el `escribir` final.

3. Revisá paso por paso si hoy ese paso puede pasar en el código.

   - Si un paso no puede pasar, es error de modelado. El código cambió a propósito y el modelo quedó viejo. Actualizá `VentaSync.tla` en el mismo cambio.
   - Si todos los pasos pueden pasar, es bug del código. Arreglá el código. No debilites las leyes, no apagues banderas y no cambies el `.cfg` para que pase.

El formal no lee tu TypeScript. TLC valida el modelo. Un cambio de código que rompe la promesa no hace fallar `npm run verificar:formal` si el modelo quedó igual. Por eso los tests son obligatorios. Si los tests dan rojo, la assertion que falla nombra el daño. Encolá una venta, hacé fallar el push y mirá si la venta sigue en la cola, si se envió la siguiente y si se borró algo que no tenía 2xx.

Correspondencia entre un quiebre de código y el modelo:

| Quiebre en el código | Bandera / config | Ley que cae |
|---|---|---|
| `escribir([])` o borrar toda la cola al terminar | `LIMPIA_TODO = TRUE`, `quiebre-limpia-todo` | `NoVentaPerdida` |
| `continue` en vez de `break` ante no 2xx o error de red | `CORTA_EN_FALLO = FALSE`, `quiebre-sigue-tras-fallo` | `NoAtascada` |
| sacar la PK de `outbox.op_id` o no releer ante 23505 | `PK = FALSE`, `quiebre-sin-pk` | `AlMasUnaFila` |

## Actualizar el modelo cuando el cambio es intencional

Actualizá `verificacion/tla/VentaSync.tla` en el mismo cambio que el código. Reglas.

- Una acción indivisible del código es un paso del modelo. No partas un `await` en dos pasos ni juntes dos awaits en uno.
- En JavaScript el único punto donde otra venta se puede colar es un `await`. Entre que un `await` resuelve y el próximo `await` no corre otro handler. Por eso "leer la cola y mandar el primero", "recibir la respuesta y mandar el siguiente" y "recibir la última y escribir" son pasos atómicos. El `await deps.enviar(item)` es donde `Vender` puede intercalarse.
- Si agregás un paso nuevo al código, agregá su acción, su variable y su rama en `Next`. Si cambiás una bandera, actualizá el `.cfg` que la representa y el quiebre que la prueba.
- Si el cambio hace que una ley ya no aplique, pará. Cambiar una ley es una decisión de producto, no un ajuste del modelo. Reportalo antes de tocarla.
- Después de cambiar el modelo, corré `npm run verificar:formal` y los tests. Recién con las cuatro `ok` y los tests verdes movés el sync commit, editando este mismo archivo.

## Cotas, supuestos y qué queda afuera

Cotas del modelo:

- `N = 3` ventas encolables.
- `Flushes = {f1, f2}`, dos drenajes concurrentes, por ejemplo dos clics o dos pestañas sobre el mismo `localStorage`.
- `-workers 1`, búsqueda completa y `CHECK_DEADLOCK FALSE`.
- `op_id` y `device_seq` se modelan con el mismo número porque `nextSeq` es monótono.

Supuestos:

- La caja nunca reusa un `op_id`.
- `localStorage` no pierde datos por cuota ni por el navegador.
- El servidor responde 2xx, 4xx o 5xx como dice `empujarOperacion`. Un 2xx con `resultado: "necesita_conexion"` sale de la cola como confirmado. Las ventas de `/venta` no llevan `payload.tipo` sensible, así que el modelo no lo distingue.
- La transacción de `empujarOperacion` es atómica para la fila de `outbox`. La PK es lo que sostiene `AlMasUnaFila`.

Queda afuera:

- 409 por mismo `op_id` con payload distinto.
- `/api/sales` en línea, el camino donde la venta sí llega al servidor.
- `src/offline/sync-worker.ts`. Tiene el mismo patrón de cortar el flush y lo cubre `tests/sync-worker-corte.test.ts`, pero no está modelado en `VentaSync.tla`.
- Stock negativo, caja y cualquier efecto posterior al push.
- Fallas de `localStorage`, JSON inválido y comportamiento fino de `fetch`.

## Registro de cobertura y sync commit

Cubierto por el modelo `verificacion/tla/VentaSync.tla` y los `.cfg` de `verificacion/tla/`:

| Código | Qué lo cubre |
|---|---|
| `sincronizarColaVenta`, `quitarConfirmados` | acciones `Empezar`, `Fallo`, `Seguir`; banderas `LIMPIA_TODO`, `CORTA_EN_FALLO` |
| `onclick` de `#sync` y `onclick` de `#cobrar` en `src/pages/venta.astro` | acciones `Empezar`, `Vender`; `Flushes` para dos drenajes |
| `empujarOperacion` | acciones `Pre`, `SeqChk`, `Ins`, `ResponderOk`, `Responder422` |
| `outbox.op_id` en `src/db/schema.ts` | bandera `PK` |
| `device_seq` monótono | acción `SeqChk` y `MaxSeq` |
| `src/offline/sync-worker.ts` | solo `tests/sync-worker-corte.test.ts`, fuera del modelo |

El sync commit es el commit que agregó o actualizó por última vez esta skill. Se obtiene con:

```bash
git log -1 --format=%H -- .agents/skills/verify-venta-sync/SKILL.md
```

Si ese comando no devuelve nada, la skill todavía no está commiteada y no hay sync commit. El sync commit solo se mueve editando este archivo en el mismo cambio, después de confirmar que el modelo y los tests describen el código nuevo. Para ver si el código cubierto cambió desde el último sync:

```bash
git log --oneline "$(git log -1 --format=%H -- .agents/skills/verify-venta-sync/SKILL.md)"..HEAD -- src/offline/cola-venta.ts src/pages/venta.astro src/lib/repos/sync.ts src/db/schema.ts
```

Si hay commits ahí, revisá si el modelo sigue describiendo el código antes de confiar en un verde.

Para mantener esta verificación al día después de cambios que no la corrieron, usá `/maintain-formal-verification-skill`.
