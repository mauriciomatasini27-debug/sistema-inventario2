---
id: ADR-0023
tipo: adr
estado: aceptado
modulos: [offline]
depende_de: [ADR-0003, PRD-SYNC-01]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0023 - Sync pull, heartbeat, grants y devices

Estado: aceptado (2026-10-12, evidencia: `src/pages/api/sync/pull.ts`). Fecha: 2026-10-11. Fuentes: OF3/OF4/OF5/OF9, ADR-0003, `src/pages/api/sync/push.ts`, `src/offline/grants.ts`, `src/offline/sync-worker.ts:7`.

## Decisión

Cerrar OF3-OF5/OF9 con `GET /api/sync/pull?cursor=`, `POST /api/sync/heartbeat` (+ `GET /api/health`), `POST /api/sync/offline-grants` firmado y `POST /api/devices/register`. PRD: `diseno/PRD-SYNC-01-sync-pull-grants.md`.

## Por qué

Sin pull el catálogo local no se actualiza; sin grants no hay sesión offline verificable; sin heartbeat no hay indicador ni avisos 24/60/72h. Todo probado hoy como comentario/stub.

## Qué cambia

Nuevos endpoints + tablas `sync_state`, `device_sync_state`, `offline_grants`. `devices/nombrar.ts` se conserva; se agrega `register`.

## Alternativa descartada

Reusar solo push/promote: se descarta porque deja OF3/OF9 sin implementar.

## Pendientes

Implementar SYNC-S1→S7 + tests pull/heartbeat/cuarentena.
