# Umbrales y alertas

Ruta `/panel/alertas/umbrales`. Rol duenio.

## Selectores

- `#umb-sector` selector de sector.
- `#umb-sector-min` mínimo masivo por sector.
- `#umb-sector-reorder` cantidad de reposición masiva.
- `#umb-aplicar` aplica al sector.
- `#umb-masivo` estado del modo masivo.
- `#umb-body` tabla de productos.
- Cada fila es `tr[data-sku="<sku>"]`.
- Cada celda editable es `td[data-campo="min_stock"]` o `td[data-campo="reorder_qty"]` con un `input`.
- `#umb-guardar` guarda los cambios.
- `#umb-estado` resultado.

## Receta

```sh
node scripts/control-app/control-app.mjs login --rol duenio
node scripts/control-app/control-app.mjs ir /panel/alertas/umbrales
node scripts/control-app/control-app.mjs escribir 'tr[data-sku="YERBA-002"] td[data-campo="min_stock"] input' '6'
node scripts/control-app/control-app.mjs clic '#umb-guardar'
node scripts/control-app/control-app.mjs api GET '/api/products?sku=YERBA-002'
node scripts/control-app/control-app.mjs captura --nombre umbrales
```

El seed deja `YERBA-002` con stock 3 y mínimo 5, y `GASEOSA-003` con stock 0 y mínimo 2. La tabla tiene que mostrarlos como bajo mínimo.

## APIs

- `GET /api/products` lista productos con umbrales.
- `GET /api/products?sku=...` confirma un cambio puntual.
- `GET /api/analytics/tablero` alimenta las sugerencias.

## Límites

El guardado real puede requerir base local. Si `api` devuelve `base_no_disponible`, revisá `estado` y levantá Postgres con `levantar`.
