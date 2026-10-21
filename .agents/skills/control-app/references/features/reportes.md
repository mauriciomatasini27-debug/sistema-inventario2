# Reportes y exportación

Ruta `/panel/reportes`. Rol duenio.

## Selectores

- `#tablero-body` filas del tablero.
- `#estado-tablero` estado del tablero.
- `#snapshot-lista` snapshots manuales.
- `#estado-snapshot` estado de snapshots.
- `#historial-body` historial de caja.
- `#estado-historial` estado del historial.

## Receta

```sh
node scripts/control-app/control-app.mjs login --rol duenio
node scripts/control-app/control-app.mjs ir /panel/reportes
node scripts/control-app/control-app.mjs api GET '/api/analytics/tablero?desde=2026-10-01&hasta=2026-10-31'
node scripts/control-app/control-app.mjs captura --nombre reportes
```

Después de una venta, el tablero tiene que reflejar el movimiento. Si no hay datos, primero hacé la receta de `venta.md`.

## Exportación

- `GET /api/analytics/export?formato=csv&desde=...&hasta=...`
- `GET /api/analytics/export?formato=pdf&desde=...&hasta=...`
- `GET /api/analytics/snapshots?desde=...&hasta=...&origen=manual`
- `GET /api/cash/history?limit=10`

`api` devuelve `texto` cuando la respuesta no es JSON. Para CSV o PDF, mirá el status y el comienzo del texto. La CLI no guarda binarios.

## Límites

No hay descarga de archivos. Si el cambio toca el PDF, verificá con Playwright o con una request directa y guardá el archivo a mano.
