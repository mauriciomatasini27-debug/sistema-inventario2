---
name: verify-plan-cambio
description: "Verifica la baja programada de plan con TLA+/TLC y tests de comportamiento: fechaCambioDePlan, planVigenteDe, cambioDePlan, leerSuscripcionActiva, programarCambioPlan y POST /api/plan/cambiar. Usala ante cualquier cambio en ese código o en el contrato de plan_programado/hasta, antes de dar por cerrado el cambio."
---

# Verificar la baja programada de plan

Esta skill cubre una promesa concreta. Una baja pedida por el Dueño se programa a fin de período, se aplica una sola vez al llegar `hasta`, no se aplica antes y no deja `plan_programado` sin fecha. Subir sin cobro responde 409 y no toca la suscripción. Pedir el plan vigente cancela el programado. El chequeo formal valida el modelo del diseño. Los tests validan el código real. Corré los dos.

## Cuándo usarla

Usala si tu cambio toca alguno de estos archivos o funciones. Si no toca ninguno, no hace falta.

| Archivo | Qué mirar |
|---|---|
| `src/pages/api/plan/cambiar.ts` | `POST`, el corte de `destinoId === activa.planId` (cancelación), el 409 `requiere_cobro`, la llamada a `fechaCambioDePlan` y las dos llamadas a `programarCambioPlan` |
| `src/modules/planes/ciclo.ts` | `fechaCambioDePlan`, `finDeCicloMensual`, `inicioDiaAR`, `planVigenteDe` |
| `src/modules/planes/catalogo.ts` | `cambioDePlan`: `sin_cambio`, `fin_de_ciclo` y `inmediato` (subida) |
| `src/lib/repos/planes.ts` | `leerSuscripcionActiva`, `aplicarProgramado`, `programarCambioPlan`, `programarEnMemoria`, el update de `subscriptions` con `plan_programado`/`hasta` |
| `tests/plan-s4-baja-programada.test.ts` | si los cambiás, actualizá también el registro de cobertura de esta skill |

También usala si cambia el contrato de `plan_programado`/`hasta`, la semántica de "el cambio rige desde `hasta`" o el rodado perezoso al leer la suscripción.

## Cómo correr

```bash
npm run verificar:formal
npx vitest run tests/plan-s4-baja-programada.test.ts
```

Necesita Java 17+. En Ubuntu o WSL: `sudo apt install -y openjdk-17-jre-headless`. Si tu Java no está en el `PATH`, exportá `JAVA_HOME` solo en esa shell; no lo escribas en archivos del repo. El script busca `$JAVA_HOME/bin/java`, si no está usa el `PATH`, y descarga `tla2tools.jar` 1.7.4 a `${XDG_CACHE_HOME:-$HOME/.cache}/sistema-inventario/tla/` con chequeo de SHA256. Si falta Java o el jar, avisa "No se verificó nada", sale 0 y no hay verde.

Verde formal de PlanCambio son estas seis líneas:

```
ok  plan-cambio: se cumplen UnSoloCambio, SinUpgradeSinCobro, ProgramadoCompleto, CancelaMismoPlan (10738 estados distintos)
ok  quiebre-baja-antes: TLC encontró la violación esperada de UnSoloCambio (traza de 6 estados)
ok  quiebre-dos-cambios: TLC encontró la violación esperada de UnSoloCambio (traza de 9 estados)
ok  quiebre-subida-sin-cobro: TLC encontró la violación esperada de SinUpgradeSinCobro (traza de 4 estados)
ok  quiebre-sin-hasta: TLC encontró la violación esperada de ProgramadoCompleto (traza de 4 estados)
ok  quiebre-no-cancela: TLC encontró la violación esperada de CancelaMismoPlan (traza de 7 estados)
```

El script corre además las cuatro líneas de VentaSync; las diez juntas tienen que dar `ok`. Con `-workers 1` los números son deterministas: si cambian sin que cambie el modelo o el `.cfg`, averiguá por qué. Lo que importa es que todas digan `ok`.

## Las leyes

- `UnSoloCambio`: el plan vigente cambia a lo sumo una vez por baja programada y solo al llegar `hasta`, nunca antes. Si se rompe, el Dueño pierde días del plan que pagó o la misma baja se aplica dos veces.
- `SinUpgradeSinCobro`: un pedido de subida responde 409 `requiere_cobro` y no altera `plan`, `plan_programado` ni `hasta`. Si se rompe, se sube de plan sin cobrar el prorrateo.
- `ProgramadoCompleto`: nunca queda `plan_programado` sin `hasta`. Si se rompe, el rodado no sabe cuándo aplicar el cambio y la suscripción queda a medias.
- `CancelaMismoPlan`: pedir el plan vigente con un programado pendiente deja `plan_programado` y `hasta` en null, sin tocar `plan`. Si se rompe, la baja que el Dueño quiso cancelar sigue agendada.

## Qué hacer ante un FALLA

Un `FALLA` en la corrida normal, o un quiebre que no encuentra su violación, es una de dos cosas. Decidí con evidencia, no por comodidad.

1. Sacá la traza del config que corresponda:

   ```bash
   bash scripts/verificar-formal.sh --traza quiebre-dos-cambios
   ```

   `--traza` acepta cualquier `.cfg` del directorio y deduce el `.tla` por el nombre del config.

2. Traducí cada `State N` a acciones del código, en este orden: `Iniciar` es un pedido del Dueño que llega a `POST /api/plan/cambiar`; `Leer` es `leerSuscripcionActiva` (aplica `planVigenteDe` y persiste el rodado si `ahora >= hasta`); `MismoPlan` es el corte `destinoId === activa.planId` y la cancelación con `programarCambioPlan(null, null)`; `Subida` es el 409 `requiere_cobro` de `cambioDePlan`; `Baja` es `fechaCambioDePlan` + `programarCambioPlan(planProgramado, inicioDiaAR(fecha))`; `AvanzarDia` es el paso del reloj entre lecturas.

3. Revisá paso por paso si hoy ese paso puede pasar en el código.

   - Si un paso no puede pasar, es error de modelado. El código cambió a propósito y el modelo quedó viejo. Actualizá `PlanCambio.tla` en el mismo cambio.
   - Si todos los pasos pueden pasar, es bug del código. Arreglá el código. No debilites las leyes, no apagues banderas y no cambies el `.cfg` para que pase.

El formal no lee tu TypeScript. TLC valida el modelo. Un cambio de código que rompe la promesa no hace fallar `npm run verificar:formal` si el modelo quedó igual. Por eso los tests son obligatorios. Si los tests dan rojo, la assertion que falla nombra el daño. Pedí una baja, mirá si el plan vigente sigue igual antes de `hasta`, si rueda una sola vez al llegar y si pedir el plan actual limpia `plan_programado` y `hasta`.

Correspondencia entre un quiebre de código y el modelo:

| Quiebre en el código | Bandera / config | Ley que cae |
|---|---|---|
| aplicar el programado antes de `hasta` (p. ej. comparar contra `desde` o ignorar `hasta`) | `BAJA_ANTES = TRUE`, `quiebre-baja-antes` | `UnSoloCambio` |
| no limpiar `plan_programado`/`hasta` al rodar, o volver a aplicar el mismo programado | `DOS_CAMBIOS = TRUE`, `quiebre-dos-cambios` | `UnSoloCambio` |
| el 409 de subida igual escribe `plan` o el programado | `SUBIDA_ALTERA = TRUE`, `quiebre-subida-sin-cobro` | `SinUpgradeSinCobro` |
| `programarCambioPlan` con `planProgramado` y `hasta = null` | `PROGRAMA_SIN_HASTA = TRUE`, `quiebre-sin-hasta` | `ProgramadoCompleto` |
| pedir el plan vigente no limpia `plan_programado`/`hasta` | `NO_CANCELA = TRUE`, `quiebre-no-cancela` | `CancelaMismoPlan` |

## Actualizar el modelo cuando el cambio es intencional

Actualizá `verificacion/tla/PlanCambio.tla` en el mismo cambio que el código. Reglas.

- Una acción indivisible del código es un paso del modelo. La lectura de `leerSuscripcionActiva` (roda y devuelve la vista) es un paso; la escritura de `programarCambioPlan` es otro. La ventana de carrera es entre esos dos pasos: el otro pedido puede programar o cancelar en el medio.
- El modelo describe la fila lógica de la suscripción (`plan`, `plan_programado`, `hasta`), no la transacción de Postgres. Si agregás una escritura nueva a esos campos, agregá su acción y su rama en `Next`.
- Si cambiás una bandera, actualizá el `.cfg` que la representa y el quiebre que la prueba. Cada config nuevo necesita su línea en `scripts/verificar-formal.sh`.
- Si el cambio hace que una ley ya no aplique, pará. Cambiar una ley es una decisión de producto, no un ajuste del modelo. Reportalo antes de tocarla.
- Después de cambiar el modelo, corré `npm run verificar:formal` y los tests. Recién con las diez `ok` y los tests verdes movés el sync commit, editando este mismo archivo.

## Cotas, supuestos y qué queda afuera

Cotas del modelo:

- `DIA_MAX = 4`. Reloj de días acotado: días 1-2 son el primer ciclo y 3-4 el segundo.
- `N_PEDIDOS = 2`, dos pedidos concurrentes del Dueño.
- `MAX_PEDIDOS = 3`. Cada pedido se puede reiniciar hasta agotar la cota, suficiente para programar y rodar dos bajas.
- `-workers 1`, búsqueda completa y `CHECK_DEADLOCK FALSE`.

Supuestos:

- El pedido ya pasó autenticación, membresía de Dueño y validación del body. El modelo no cubre 403 ni 422.
- El precio solo decide subida, baja o mismo plan (`Nivel`). El prorrateo de PLAN-S3 queda afuera.
- La fila de la suscripción es una sola y sus campos se escriben juntos (`programarCambioPlan` escribe `planProgramado` y `hasta` en el mismo update). La persistencia best-effort no cambia la promesa.
- El rodado es perezoso: ocurre en la primera lectura con `dia >= hasta`, no en un job.

Queda afuera:

- El calendario mensual real (`finDeCicloMensual`: aniversario, día 31 en meses cortos, cambio de año). El modelo usa `dia + 1` como próximo fin de ciclo.
- El prorrateo de subida y el proveedor de cobro de PLAN-S3.
- Postgres, Drizzle y el reintento en memoria ante fallo de persistencia.
- Autenticación, membresía, `tenantDeSesion` y validación del body.
- `/panel/plan`, `control.events` y el texto "Tu plan pasa a …".

## Registro de cobertura y sync commit

Cubierto por el modelo `verificacion/tla/PlanCambio.tla` y los `.cfg` de `verificacion/tla/`:

| Código | Qué lo cubre |
|---|---|
| `POST /api/plan/cambiar.ts`, corte de mismo plan y cancelación | acción `MismoPlan`; bandera `NO_CANCELA` |
| `POST /api/plan/cambiar.ts`, 409 de subida | acción `Subida`; bandera `SUBIDA_ALTERA` |
| `POST /api/plan/cambiar.ts`, programación de la baja | acción `Baja`; bandera `PROGRAMA_SIN_HASTA` |
| `fechaCambioDePlan` e `inicioDiaAR` | acción `Baja` (`fecha` = `hasta` vigente o `dia + 1`) |
| `planVigenteDe` y el rodado de `leerSuscripcionActiva` / `aplicarProgramado` | acción `Leer`; banderas `BAJA_ANTES`, `DOS_CAMBIOS` |
| `programarCambioPlan` y los campos `plan_programado`/`hasta` | acciones `MismoPlan`, `Baja`; ley `ProgramadoCompleto` |
| `cambioDePlan` (`sin_cambio` / `fin_de_ciclo` / subida) | `Nivel` y las acciones `MismoPlan`, `Baja`, `Subida` |
| `tests/plan-s4-baja-programada.test.ts` | comportamiento real, fuera del modelo |

El sync commit base es `d8ae4c7` (`origin/main` al abrir VF-S4). Esta skill es nueva en el cambio VF-S4; al commitearse, el comando de abajo devuelve su propio commit y ese pasa a ser el sync commit.

```bash
git log -1 --format=%H -- .agents/skills/verify-plan-cambio/SKILL.md
```

Si ese comando no devuelve nada, la skill todavía no está commiteada y el sync commit sigue siendo `d8ae4c7`. Para ver si el código cubierto cambió desde el último sync:

```bash
git log --oneline d8ae4c7..HEAD -- src/pages/api/plan/cambiar.ts src/modules/planes/ciclo.ts src/modules/planes/catalogo.ts src/lib/repos/planes.ts
```

Si hay commits ahí, revisá si el modelo sigue describiendo el código antes de confiar en un verde.

Para mantener esta verificación al día después de cambios que no la corrieron, usá `/maintain-formal-verification-skill`.
