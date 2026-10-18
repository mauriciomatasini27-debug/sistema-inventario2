---
id: PRD-SEC-03
tipo: prd
estado: hecho
modulos: [tenant]
depende_de: [ADR-0050, ADR-0051, ADR-0074, ADR-0075]
reemplaza: []
reemplazado_por: ""
resumen: |
  scripts/backfill-tenant-id.mjs solo imprime un UPDATE sobre fiscaldocuments y nunca verificó el resultado.
  fiscalsettings ganó tenantid en la migración 0016 (ADR-0074) y sus filas previas quedaron con tenantid nulo:
  no se leen, y el CUIT de emisión cae a ARCACUITPROVEEDOR hasta que alguien vuelva a guardar la configuración.
---
# PRD-SEC-03 - Backfill real de `tenant_id` en filas fiscales previas

Fuente: `docs/ROADMAP.md`, Pendientes priorizados P0.3 (2026-10-14), pendientes de ADR-0050, ADR-0051 y ADR-0074. Uso en este sistema: bases de cualquier comercio, sin reglas por rubro. Restringido por ADR-0075, ADR-0074, ADR-0051 y ADR-0050. Tipo seguridad.

## Problema

`scripts/backfill-tenant-id.mjs` solo imprime un `UPDATE` sobre `fiscal_documents` y nunca verificó el resultado. `fiscal_settings` ganó `tenant_id` en la migración 0016 (ADR-0074) y sus filas previas quedaron con `tenant_id` nulo: no se leen, y el CUIT de emisión cae a `ARCA_CUIT_PROVEEDOR` hasta que alguien vuelva a guardar la configuración. Además `fiscal_settings` tiene índice único por `tenant_id`, así que un `UPDATE` ciego de todas las filas nulas falla si hay más de una o si el comercio ya guardó una fila nueva.

## Épica SEC3-E1. Backfill aplicable, seguro e idempotente

Requisito SEC3-R1: el backfill asigna el comercio dueño a las filas fiscales sin `tenant_id`, solo con aprobación explícita, y repetirlo no cambia nada.

- Historia SEC3-S1. El plan cubre `fiscal_documents` y `fiscal_settings`. En `fiscal_settings` asigna el tenant solo a la fila nula más reciente, y solo si el tenant no tiene ya una fila; las demás nulas quedan y se informan. AC: Given dos filas nulas y ninguna del tenant When aplico Then la más reciente queda del tenant y la otra sigue nula; Given el tenant ya tiene fila When aplico Then ninguna nula cambia. ADR: 0075. Talla S. Depende de: nada.
- Historia SEC3-S2. El script es seco por defecto: se conecta (si hay base) para contar filas nulas por tabla, imprime las sentencias y no escribe. Con `--apply` corre todo en una transacción y reporta filas cambiadas por tabla. Se niega con más de un comercio en la base. Nunca imprime valores de entorno. AC: Given `--apply` dos veces When la segunda corre Then 0 filas cambiadas; Given sin `--apply` Then ningún dato cambia. ADR: 0075. Talla S. Depende de: SEC3-S1.

## Dependencias externas

Ninguna. Sin migración nueva. El script corre contra la base real solo cuando el usuario lo ejecuta con aprobación; los tests usan Postgres local.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Fallo | Base compartida | `--comercios 2` | se niega, sin escribir |
| Fallo | Tenant vacío | `--tenant-id ""` | se niega |
| Feliz | Aplicar | filas nulas en ambas tablas, PG local | quedan del tenant, conteo por tabla |
| Borde | Settings con fila del tenant | tenant ya tiene fila | nulas sin tocar, sin violar el índice único |
| Regresión | Idempotencia | `--apply` dos veces | segunda vez 0 filas |
| Regresión | Seco | sin `--apply` | conteos y sentencias, datos iguales |
