# Panel

Ruta `/panel`. Dueño ve todos los módulos. Empleado ve solo los permitidos.

## Qué mirar

- `h1` empieza con `Hola`.
- Tarjetas de totales y accesos a módulos.
- `AsistenteDrawer` aparece si el plan incluye asistente.
- `upsell` sale del plan activo.

## Receta

```sh
node scripts/control-app/control-app.mjs login --rol duenio
node scripts/control-app/control-app.mjs ir /panel
node scripts/control-app/control-app.mjs api GET /api/panel/indice
node scripts/control-app/control-app.mjs captura --nombre panel-duenio
```

`/api/panel/indice` devuelve `rol`, `modulos` y `upsell`. Para empleado no debe traer módulos `soloDueno`.

```sh
node scripts/control-app/control-app.mjs login --rol empleado
node scripts/control-app/control-app.mjs ir /panel
node scripts/control-app/control-app.mjs api GET /api/panel/indice
```

## APIs

- `GET /api/panel/indice` resuelve módulos por plan y rol.
- `GET /api/auth/sesion-actual` confirma quién está atendiendo.

## Límites

El panel no muestra botones de administración a empleados. Si un módulo de Dueño aparece con rol empleado, es un bug de autorización.
