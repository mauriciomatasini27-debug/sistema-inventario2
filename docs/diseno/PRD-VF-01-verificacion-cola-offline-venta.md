---
id: PRD-VF-01
tipo: prd
estado: aceptado
modulos: [ventas, sync]
depende_de: [ADR-0003, ADR-0061, ADR-0097]
reemplaza: []
reemplazado_por: ""
resumen: |
  Primera tajada de ADR-0097. Mueve el modelo VentaSync al repo, arregla la cola offline de /venta
  para no perder ventas, deja la skill local con cobertura y sync commit, y suma un segundo modelo.
---
# PRD-VF-01 - Verificación formal y arreglo de la cola offline de venta

Fuente: spike de ADR-0097 sobre `src/pages/venta.astro` y `src/lib/repos/sync.ts`, con TLC2 2026.10.15. Uso en este sistema: caja con ventas offline y reintento por sync. Restringido por ADR-0097.

## Problema

Una venta cobrada sin red se encola en `localStorage`. Cuando quien atiende la caja toca sync, el código intenta empujar cada item y al final borra la cola entera con `localStorage.setItem(outboxKey, "[]")` (`src/pages/venta.astro:167`), sin mirar si cada push tuvo 2xx. Si el pedido se pierde por red, o si el servidor responde 422 o 5xx, la venta desaparece de la cola y no está en el servidor. El modelo de ADR-0097 viola `NoVentaPerdida` en 4 estados.

El arreglo ingenuo de sacar solo lo 2xx y seguir con el próximo tampoco sirve. Deja una venta vieja en la cola con un `device_seq` menor al máximo ya insertado, condenada a 422 para siempre. La corrida `fixparcial-atascada` viola `NoAtascada` en 815 estados generados.

## Épica VF-E1. Modelo, arreglo, skill y segundo candidato

Requisito VF-R1: el repo tiene el modelo `VentaSync` y un comando reproducible que muestra el hallazgo y las corridas del arreglo.

Requisito VF-R2: el drenaje no borra de la cola una venta que no recibió 2xx.

Requisito VF-R3: una skill local registra la cobertura y el commit de sync, y se prueba con un quiebre real.

Requisito VF-R4: un segundo modelo entra con las mismas garantías y queda como modelo estable.

- Historia VF-S1. Mover el modelo a `verificacion/tla/` con sus `.cfg` y un script opcional. El modelo conserva las cotas del spike (N=3, 2 drenajes) y sus banderas `LIMPIA_TODO`, `CORTA_EN_FALLO`, `UN_DRENAJE` y `PK`. Estado: hecho (2026-10-19): `verificacion/tla/` tiene `VentaSync.tla`, `venta-sync.cfg` y los quiebres `quiebre-limpia-todo`, `quiebre-sigue-tras-fallo` y `quiebre-sin-pk`; se corre con `scripts/verificar-formal.sh` (`npm run verificar:formal`), que pinnea tla2tools.jar 1.7.4 con SHA256 y lo cachea fuera del repo. AC: Given Java 17+ y el jar 1.7.4 When corro `npm run verificar:formal` Then las 4 corridas dan `ok`: `venta-sync` cumple las tres leyes con 7519 estados distintos y cada quiebre encuentra su violación esperada; Given no hay Java o falta la red Then el script avisa "No se verificó nada" y sale 0. ADR: 0097. Talla M. Depende de: nada.

- Historia VF-S2. Arreglar la cola offline para sacar de la cola solo los items con 2xx y cortar el drenaje en el primer fallo. Un 422 o un 5xx deja el item en la cola y frena el drenaje. Agregar un test de regresión que reproduce la pérdida. Estado: hecho (2026-10-19): la lógica vive en `src/offline/cola-venta.ts` (`sincronizarColaVenta`, `quitarConfirmados`) y la usa el `onclick` de `#sync` en `src/pages/venta.astro`; `src/offline/sync-worker.ts` también corta el flush ante un fallo; `tests/cola-venta.test.ts` (4 de comportamiento y 1 propiedad con fast-check) y `tests/sync-worker-corte.test.ts` fallan contra el código viejo y pasan ahora. AC: Given una venta encolada y el push falla por red When termina sync Then la venta sigue en `localStorage`; Given dos ventas encoladas y la primera falla When termina sync Then la segunda no se envía y las dos siguen en la cola; Given el push responde 200 o 201 When termina sync Then esa venta sale de la cola y se intenta la siguiente; Given el test corre sobre el código anterior a esta historia When lo ejecuto Then falla porque la venta no está ni en la cola ni en el servidor; Given el código con el arreglo Then pasa. ADR: 0097. Talla M. Depende de: nada.

- Historia VF-S3. Generar la skill local con `/create-formal-verification-skill` a partir del modelo y probarla con un quiebre real. Estado: hecho (2026-10-19): `.agents/skills/verify-venta-sync/SKILL.md` registra cobertura, comandos y sync commit, y se probó con un quiebre real (`continue` en vez de `break` en `cola-venta.ts`: los tests dieron rojo; revertido). AC: Given la skill en `.agents/skills/verify-venta-sync/SKILL.md` When un agente la lee en frío Then puede decidir si su cambio toca el código cubierto, correr el chequeo, distinguir un bug de un error de modelado y actualizar el commit de sync; Given rompo a propósito la condición de 2xx en una rama de prueba When sigo la skill Then el chequeo falla y nombra la ley; Given restauro el código Then vuelve a pasar. ADR: 0097. Talla M. Depende de: VF-S1, VF-S2.

- Historia VF-S4. Estado: pendiente. Modelar el segundo candidato, PLAN-S4, sobre `src/pages/api/plan/cambiar.ts` y los repos de planes, con tres leyes. `UnSoloCambio`: el plan cambia exactamente una vez en `hasta`. `SinUpgradeSinCobro`: un pedido de subida responde 409 `requiere_cobro` y no altera la suscripción. `ProgramadoCompleto`: no queda `plan_programado` sin `hasta`. AC: Given `verificacion/tla/PlanCambio.tla` con dos pedidos concurrentes y dos ciclos When corro el script Then las tres leyes se cumplen sobre el código actual; Given una variante que aplica la baja antes de `hasta` o permite dos cambios When corro el script Then falla; Given la skill local de plan When la leo Then tiene cobertura y commit de sync. ADR: 0097. Talla M. Depende de: VF-S1, VF-S3.

## Dependencias externas

- Java 17+ y tla2tools.jar 1.7.4 fuera de `package.json`. El script los busca y sale 0 si faltan; el jar se cachea en `${XDG_CACHE_HOME:-$HOME/.cache}/sistema-inventario/tla/`, fuera del repo, y se verifica su SHA256.
- Meta-skills vendorizadas desde pstack v0.15.28 (siguen en beta). VF-S3 ya quedó escrita.
- fast-check 4.10.2 como devDependency. VF-S2 lo usa en el test de propiedad de `tests/cola-venta.test.ts`.
- No hay migración ni cambio de base.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Modelo del código actual | `actual-perdida.cfg` | `NoVentaPerdida` violada en 4 estados |
| Feliz | Modelo del arreglo | `fix-completo.cfg` | las tres leyes se cumplen, 1.326 estados distintos |
| Fallo | Pérdida por red | venta encolada, push falla | la venta sigue en la cola |
| Fallo | 422 o 5xx | push responde error HTTP | el item sigue en la cola y el drenaje se detiene |
| Fallo | Atasco | solo sacar 2xx y seguir el `for` | el modelo viola `NoAtascada` |
| Regresión | Duplicado con PK | dos drenajes concurrentes | una sola fila por `op_id` |
| Regresión | Duplicado sin PK | variante `sinpk-duplicado` | el modelo viola `AlMasUnaFila` |
| Regresión | Skill | quiebre en una rama de prueba | el chequeo falla y nombra la ley |
