# PRD-SYNC-01 - Sync pull, heartbeat, grants y devices

Fuente: `docs/01-fundacion/modo-offline.md` (OF3, OF4, OF5, OF9, OF14), ADR-0003, ADR-0017. Gap verificado 2026-10-11: solo existen `src/pages/api/sync/push.ts` + `promote.ts`; sin `pull`, `heartbeat`, `offline-grants`, `devices/register`.

## Épica SYNC-E1. Pull incremental + cursor (OF3, OF4)

- SYNC-S1. `GET /api/sync/pull?cursor=`. AC: Given cursor viejo When pido Then devuelve lote ≤50 con `cursor_nuevo` + catálogo (productos, códigos, precio, stock+hora, medios, jornada, permisos, clientes fiado, turnos, promos 7d, lotes). Given sin cambios When pido Then vacío + mismo cursor. Tablas: `sync_state`, `products`, `product_codes`, `stock_lots`. Depende de: nada.
- SYNC-S2. Pull <2min + búsqueda difusa local. AC: Given 10k productos When sincronizo Then pull completo <2min; búsqueda local sin red. Depende de: SYNC-S1.

## Épica SYNC-E2. Heartbeat + indicador (OF5, OF12, OF14)

- SYNC-S3. `POST /api/sync/heartbeat` + `GET /api/health`. AC: Given online When late `pendientes+última op` Then servidor registra `device_sync_state`; UI muestra verde/gris-ámbar/azul/rojo + contador. Ping a `/api/health`, nunca `navigator.onLine`. Depende de: SYNC-S1.
- SYNC-S4. Avisos 24/60h + límite 72h. AC: Given 24h sin sync When pasa job Then avisa; 72h → cuarentena + `Necesita conexión`. Depende de: SYNC-S3.

## Épica SYNC-E3. Offline grants + devices (OF9)

- SYNC-S5. `POST /api/sync/offline-grants` (firmado: user/tenant/device/rol/permisos/vence, 72h def 24h-7d). AC: Given login online When pido grant Then recibo JWT verificable offline con mismos permisos. Given revocación When sincronizo Then cuarentena post-revocación. Tablas: `offline_grants`, `sessions`. Depende de: Auth AU8/AU9.
- SYNC-S6. `POST /api/devices/register` + nombrar + revocar. AC: Given device nuevo When registro Then `device_id` único server + `offline_grant` inicial; login/invitación/nuevo device solo online. Existe `devices/nombrar.ts`, falta `register`. Depende de: SYNC-S5.
- SYNC-S7. Sensibles solo online. AC: Given offline When intento tope/plazo/baja/ajuste/reversión/export Then `Necesita conexión` (OF16/FC13). Depende de: SYNC-S5.

## Estrategia prueba

| Tipo | Caso | Resultado |
|---|---|---|
| Feliz | pull cursor | lote + cursor nuevo |
| Fallo | grant revocado | cuarentena, no vende sensible |
| Concurrencia | 2 devices mismo seq | dedup `op_id`, orden recepción |
