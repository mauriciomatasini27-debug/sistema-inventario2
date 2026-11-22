---
id: ADR-0121
tipo: adr
estado: aceptado
modulos: [catalogo, ventas, inventario, tickets]
depende_de: [ADR-0064, ADR-0110]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: La venta por peso usa gramos enteros en las columnas integer existentes y precio por kilogramo en precio_centavos.
---
# ADR-0121 - Venta por peso con gramos enteros

Estado: aceptado. Fecha: 2026-11-21. Fuentes: `GLOSSARY.md`, `docs/traspaso/pendientes-2026-11-21.md`, relevamiento de `src/db/schema.ts`, `src/lib/validation.ts`, `src/modules/sales`, `src/modules/inventario`, `src/modules/pricing/redondeo.ts` y `src/lib/pesos.ts`.

## Decisión

Un producto puede venderse por peso mediante el campo `products.por_peso` (boolean, default false). Cuando está activo, `precio_centavos` significa centavos por kilogramo y la cantidad de cada línea, lote y movimiento se interpreta como peso en gramos enteros; cuando está apagado, conserva su significado actual de precio por unidad y cantidad en unidades. El importe de una línea se calcula con aritmética entera `bigint` como `(gramos * centavos_por_kg + 500) / 1000`, mitad arriba al centavo.

El flag es irreversible una vez que el producto tiene ventas: no se puede desactivar sin reescribir el significado de tickets históricos. La carga en pantalla se hace en kilogramos con hasta tres decimales y se convierte a gramos antes de validar. La cola offline no cambia su contrato: el mismo `qty` entero pasa a significar gramos según el producto resuelto en el servidor.

## Por qué

- El modelo actual es de unidades enteras en toda la cadena (`salesLineSchema.qty` 1..999, `stock_lots.cantidad` integer, `ticket_lines.qty` integer). Migrar esas columnas a `numeric` para kilogramos decimales introduciría floats, deriva en FEFO y un cambio de contrato en sync.
- Los pesos en gramos enteros mantienen las invariantes de stock, los locks `FOR UPDATE` y la aritmética `bigint` de centavos. Solo hay que reinterpretar la unidad según el producto.
- El precio por kilogramo reutiliza `precio_centavos`: el dueño ajusta el valor al activar el flag, sin columnas de precio adicionales ni migración de datos históricos.
- El redondeo mitad arriba con `bigint` es determinista y coincide con la regla que ya usa la desagregación de IVA.

## Qué cambia

- Migración nueva (tag propio, sin editar las aplicadas): `products.por_peso boolean NOT NULL DEFAULT false`.
- Validación y núcleo de venta, carrito, stock/FEFO y ticket pasan a recibir la unidad del producto para interpretar la cantidad.
- Catálogo, API de productos, espejo en memoria y snapshot offline exponen el flag.
- UI de `/venta` carga kilogramos con tres decimales y muestra el resultado en kilogramos y centavos por kilogramo.
- Devoluciones, régimen fiscal y proveedor de precios quedan registrados como deuda: la unidad de esas líneas también es gramos, pero su comportamiento se implementa en entregas posteriores.

## Pendientes

- Ajustar devoluciones y su validación de cantidades para productos por peso.
- Ajustar el detalle fiscal (`fiscal_fes12Schema.cantidad`) y la facturación por línea.
- Definir el cálculo de precios sugeridos por kilogramo en el módulo de precios.
- Verificar el comportamiento offline de extremo a extremo con productos por peso.
