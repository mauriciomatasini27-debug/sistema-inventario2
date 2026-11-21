---
id: PLAN-COM-01-E
tipo: plan
estado: aceptado
modulos: [admin, auth, bot, caja, compras, email, fiado, fiscal, inventario, offline, onboarding, pagos, persistencia, precios, tenant, ventas]
depende_de: [PLAN-COM-01, PLAN-COM-01-A, PLAN-COM-01-B, PLAN-COM-01-C, ADR-0064]
reemplaza: []
reemplazado_por: ""
resumen: |
  Ejecución de la poda de comentarios por área: dos olas, un commit por área, gate `verify` por área,
  deuda publicada antes de podar, base del ratchet y criterio de fin.
---
# PLAN-COM-01-E — Ejecución de la poda por área

Fecha: 2026-11-21. Fuente: mapa wayfinder #271 (tickets #272–#278). Estado: aceptado. Este documento no ejecuta la poda: ordena el trabajo posterior y fija cuándo se considera terminado.

## Alcance

- Solo `src/`. La política de ADR-0064 cubre `src/`; `tests/`, `scripts/` y `verificacion/` quedan fuera.
- `src/modules/cash/` ya está podado (TB-166) y no se relee: su resultado (ADR-0120, `docs/guias/gotchas-caja.md`, skill `delete-comment` y check con clases) es entrada, no trabajo pendiente.
- Fuera también los 4 hallazgos falsos de seguridad de `PLAN-COM-01` (ya corregidos en el código, verificados en #276).

## Inventarios

- `PLAN-COM-01` A/B/C: 603 a borrar, 65 a refactor, 135 a conservar y 39 falsos verificados.
- #273: 1.073 unidades de idea en `src/modules/` (salvo `cash/`), `src/offline/` y `src/middleware.ts` —495 borrar, 111 refactor, 467 conservar—. Vive en `origin/research/comentarios-no-cubiertos`, commit `31c5f81`, archivo `research/comentarios-no-cubiertos/inventario.md`; se consulta con `git show 31c5f81:research/comentarios-no-cubiertos/inventario.md`. No se mergea: la ejecución relee cada bloque con el skill antes de borrar, así que es una guía y no la autoridad.
- El inventario de `PLAN-COM-01` es del 2026-10-13 y el de #273 es textual y conservador: antes de borrar en cada área, confirmar qué entradas ya resolvieron otros PRs y releer el bloque contra el código real.

## Método

ADR-0064 y su sección «Procedimiento», con el skill `/delete-comment`: cinco categorías, test de Excusa y tres criterios de ADR. Las decisiones van a un ADR o `decisions.tsv`; los gotchas de runtime a `docs/guias/gotchas-<área>.md`; `GLOSSARY.md` solo define términos del dominio. Todo bloque nuevo declara su clase `[plataforma]`/`[fiscal]`/`[tenant]` y el id del ítem; los marcadores en líneas nuevas llevan `#<issue>` en la misma línea (COM-S7). No JSDoc.

## Orden y granularidad

Área = directorio con inventario propio. Un commit por área; los módulos chicos se agrupan. Cada commit borra *borrar* + *refactor*, consolida *conservar* y ajusta los baselines.

- **Ola 1 (PLAN-COM-01):** `db → jobs → pages → pages/api → lib → sueltos`.
- **Ola 2 (#273):** `middleware → offline → módulos grandes (whatsapp y sales al final) → módulos menores`.

## Deuda

Se publica por área **antes** de podar (#276). Total: 88 issues = 3 ya publicados (#290–#292) + 65 del plan + 20 agrupados del inventario #273. Cada issue lleva `ready-for-agent` o `ready-for-human`. Los issues pueden quedar abiertos después de podar el área: son trabajo posterior, no condición para darla por terminada.

## Gate

`VITEST_MAX_WORKERS=4 npm run verify` completo antes de cerrar cada área. Ese gate ya incluye `docs:check`, `typecheck`, `check:arch`, la suite, los gates de docs y `check-comment-ids`. Una rama por ítem (`mauri/<tema>`), sin push a `main`; el merge lo hace Mauri (AGENTS.md).

## Ratchet

La base del check de comentarios queda fija en `eda3de2` durante todo el esfuerzo, sin moverla por área (#274). Al terminar, se cambia a `merge-base` con `origin/main`.

## Criterio de fin

El esfuerzo completo termina cuando:

1. Todas las áreas de las dos olas están podadas.
2. La deuda se publicó antes de podar cada área.
3. `verify` quedó verde por área.
4. Los baselines quedaron ajustados.
5. Los 23 bloques abuelados de TB-165/ADR-0115 quedaron resueltos (al final, sin inventarles clase).
6. La base del ratchet se movió a `merge-base` con `origin/main`.

Los issues de deuda pueden seguir abiertos: se rastrean aparte.

## Pendientes fuera del mapa

- Clasificar los 23 bloques abuelados de TB-165/ADR-0115 que el ratchet dejó pasar sin clase; se resuelven al final, cuando el resto esté podado.
- Confirmar, área por área, qué entradas del inventario de octubre ya resolvieron otros PRs desde entonces.

## Registro

Las decisiones y su discusión están en el mapa wayfinder #271 (7/7 tickets). Este documento es el handoff durable para las sesiones de ejecución.
