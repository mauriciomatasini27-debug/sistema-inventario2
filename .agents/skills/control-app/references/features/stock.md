# Stock

Rutas `/panel/stock` y `/panel/stock/importar`. Rol duenio.

## Stock

Selectores reales.

- `#stock-productos` cantidad de productos.
- `#stock-umbral` productos en o bajo el mínimo.
- `#estado-stock` estado de la carga.
- `#lote-sku` y `#lote-buscar` consulta de lotes.
- `#ubicacion-nombre` y `#ubicacion-crear` alta de ubicación.
- `#ingreso-sku`, `#ingreso-cantidad`, `#ingreso-costo`, `#ingreso-vence`, `#ingreso-enviar` ingreso de mercadería.
- `#estado-ingreso` resultado del ingreso.

Receta de ingreso.

```sh
node scripts/control-app/control-app.mjs login --rol duenio
node scripts/control-app/control-app.mjs ir /panel/stock
node scripts/control-app/control-app.mjs escribir '#ingreso-sku' 'CAFE-001'
node scripts/control-app/control-app.mjs escribir '#ingreso-cantidad' '5'
node scripts/control-app/control-app.mjs clic '#ingreso-enviar'
node scripts/control-app/control-app.mjs api GET /api/lots?sku=CAFE-001
node scripts/control-app/control-app.mjs captura --nombre stock-ingreso
```

## Importación

Ruta `/panel/stock/importar`.

- `#archivo-importar` input file. Acepta `.csv` y `.xlsx`.
- `#preview-importar` genera la vista previa.
- `#estado-importar` estado del preview.
- `#resumen-importar`, `#contadores-importar` resumen.
- `#tabla-importar` tabla de filas.
- `#confirmar-importar` aplica.
- `#resultado-importar` resultado final.

Endpoints.

- `POST /api/stock/importar/preview` recibe multipart.
- `POST /api/stock/importar/confirmar` aplica.
- `GET /api/stock/importar/plantilla.csv` descarga la plantilla.

## Límites

La CLI no sube archivos. Para importar usá Playwright directo con `setInputFiles` en `tests/e2e` o extendé la CLI con un comando `subir`. El resto del stock sí se puede recorrer con `escribir`, `clic` y `api`.
