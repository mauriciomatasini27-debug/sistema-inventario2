# Panel

Ruta `/panel`. Dueño ve todos los módulos. Empleado ve solo los permitidos.

## Qué mirar

- `h1` empieza con `Hola`.
- Barra de cinco accesos: Inicio, Productos, Vender, Fiado, Más. Vender va al centro.
- En ~390px solo se ven esos cinco. El resto está en Más, agrupado.
- En escritorio la misma agrupación está en la columna izquierda.
- Números del día, aviso de stock bajo si hay, y atajos a Vender, Productos y Fiado.
- `AsistenteDrawer` aparece si el plan incluye asistente.
- `upsell` sale del plan activo.
- Un empleado no ve ventas pendientes ni Gmail en Más.
- Sin `ver_saldos_caja` no se ve el saldo de caja. Sin `crear_productos` no se ve el alta.

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
