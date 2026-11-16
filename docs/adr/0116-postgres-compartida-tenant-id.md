---
id: ADR-0116
tipo: adr
estado: aceptado
modulos: [tenant, persistencia, offline]
depende_de: [ADR-0003, ADR-0048, ADR-0050, ADR-0051, ADR-0052, PRD-ISO-01, PRD-ISO-02]
reemplaza: []
reemplazado_por: ""
modifica: [ADR-0003, ADR-0051, PRD-ISO-01, PRD-ISO-02]
modificado_por: []
resumen: |
  Una Postgres compartida para muchos comercios. Aislamiento por tenant_id en tablas de
  negocio y resolución en el servidor (ADR-0050/0051). TENANT_MODE=shared. No reemplaza
  los contratos offline/sync de ADR-0003. El camino multi por URL (P1-68) queda histórico.
---
# ADR-0116 - Postgres compartida con tenant_id

Estado: aceptado. Fecha: 2026-11-13; C0–C6 mergeados en `main` (PRs #189, #191, #192 y PRs previos). Migración `0043_shared_tenant_nucleo` aplicada en la base real del piloto (confirmación de Mauri, 2026-11-14). Fuentes: ADR-0003, ADR-0048, ADR-0051, PRD-ISO-01, PRD-ISO-02, avance P1-68, plan opción C.

## Decisión

El piloto y el crecimiento en Free usan **una** Postgres de negocio para muchos comercios. Cada fila de comercio lleva `tenant_id`. El servidor resuelve el tenant por sesión o membership (ADR-0050/0051) y filtra. No se exige `TENANT_DATABASE_URL_<id>` por alta.

`TENANT_MODE=shared` es el modo de este corte. No redefine `single` (sigue siendo `slice0` sin sesión, como fijan los tests ISO actuales). `multi` (una URL por id, P1-68) puede convivir en código hasta un subtract posterior. El runbook piloto pasa a una URL compartida (reescribe `deploy-piloto` en el PR de guía).

Control puede usar la misma URL que negocio (ADR-0048). Las tablas de catálogo (`tenants`, `memberships`, `sessions`, …) no mezclan filas de stock/ventas sin dueño.

Contratos offline, outbox, sync y API de ADR-0003 siguen vigentes salvo delta explícito en PRs posteriores.

### Matriz ISO (mecanismo)

Se mantienen el comportamiento fail-closed y el dueño en servidor.

| Historia | Con C |
|---|---|
| ISO-S1, S3, S4, S5, S7, S8 | Se mantienen (403 sin sesión/membership, docs con dueño, gate middleware, wizard/huérfanas) |
| ISO-S2 | Deja de ser «sin URL dedicada». Pasa a «sin contexto de tenant → fail-closed» |
| ISO-S6 | `getTenantDb()` abre el pool compartido. El aislamiento es el filtro por `tenant_id` |
| ISO-S9 | Backfill deja de negar «base compartida». Política por tabla/tenant en el PR de migración |

## Por qué

ADR-0003 fija una Postgres por cliente. En Supabase Free eso son dos proyectos para dos comercios y un proyecto nuevo por cada alta. El aislamiento que importa al mostrador es «A no ve el stock de B». Eso se logra con `tenant_id` en una sola base, alineado con el aislamiento fiscal que ya usa columna de dueño (ADR-0050).

Estirar `single` rompería los tests que exigen `slice0` sin login. Un tercer valor `shared` deja ese contrato intacto.

## Qué cambia

- Topología Postgres de comercio en ADR-0003. De «1 DB por cliente» a «1 DB compartida + `tenant_id`» bajo este ADR.
- ADR-0051. La alternativa «`tenant_id` en todas las tablas» deja de estar descartada para el camino `shared`.
- Guía piloto y avances. El procedimiento de dos proyectos / `piloto1`/`piloto2` queda obsoleto como camino piloto; P1-68 queda histórico.
- Código (fuera de este ADR, PRs siguientes). Columna nullable → repos filtran → `NOT NULL` + uniques `(tenant_id, …)`. Routing lee `sessions.tenant_id` en `shared`. Alta sin `reclamarIdBaseLibre`.

## Alternativa descartada

Seguir el piloto solo con `multi` + dos proyectos Free (P1-68). Aísla bien, pero cada comercio nuevo gasta otro proyecto. Una sola Postgres con `tenant_id` es el corte que escala en Free.

Redefinir `TENANT_MODE=single` para exigir UUID de sesión. Choca con ISO-S1 en single sin login (`slice0`).

## Pendientes

- Waves siguientes: filtros `tenant_id` en caja/fiado/precios/etc. (los `NOT NULL` y los uniques compuestos `(tenant_id, …)` ya quedaron aplicados por `0045_shared_tenant_sellar_nucleo` y `0047_shared_tenant_periferia`, que suman 57 `SET NOT NULL` y los uniques de `src/db/schema-precios.ts`; actualizado 2026-11-15).
- Decidir si el código `multi` de P1-68 se borra o queda dormido.
- Dueño del backfill para filas ya existentes en la DB single de producción (usar `--shared --tenant-id`).
