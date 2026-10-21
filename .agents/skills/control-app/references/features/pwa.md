# PWA y wipe remoto

Rutas `/venta` y APIs de sync. El device del seed es `CONTROL-APP-01`.

## PWA

- `/venta` registra el service worker `public/sw.js`.
- El manifest sale de la app y el modo offline usa la cola `slice0-outbox`.
- `#catalogo-estado` indica si hay catálogo descargado.
- `#sync` reintenta la cola.
- `#estado` y `#balance` muestran el resultado.

## Wipe remoto

El Dueño revoca el device y el próximo heartbeat del device recibe `wipe:true`.

```sh
node scripts/control-app/control-app.mjs login --rol duenio
node scripts/control-app/control-app.mjs api POST /api/devices/revocar-remoto '{"tenant_id":"control-app","device_code":"CONTROL-APP-01","motivo":"verificacion"}'
node scripts/control-app/control-app.mjs api POST /api/sync/heartbeat '{"device_code":"CONTROL-APP-01","pendientes":0}'
```

La primera llamada devuelve `wipe:true` y `grants_revocados:1`. La segunda tiene que devolver `wipe:true` para ese device.

El endpoint de revocación exige reautenticación reciente. El login del seed setea `reauthAt` al momento. Si pasó la ventana, volvé a `login --rol duenio`.

## APIs

- `POST /api/devices/revocar-remoto` cuerpo `{tenant_id, device_code, motivo}`.
- `POST /api/sync/heartbeat` cuerpo `{device_code, pendientes}`.
- `POST /api/sync/push` empuja operaciones.
- `POST /api/sync/pull` baja cambios.
- `GET /api/sync/no-aplicables` lista ventas trabadas.

## Límites

La CLI no inspecciona `localStorage`, IndexedDB ni el service worker. Para probar el borrado local de verdad usá Playwright con `context.setOffline` y `/verify-venta-sync`. Acá se prueba el contrato servidor del wipe.
