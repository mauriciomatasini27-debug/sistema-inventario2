---
id: ADR-0124
tipo: adr
estado: aceptado
modulos: [catalogo, inventario, ventas]
depende_de: [ADR-0106]
reemplaza: []
reemplazado_por: ""
modifica: [ADR-0114]
modificado_por: []
resumen: Dueño y Empleado pueden crear productos por Alta al vuelo sin crear_productos; el permiso sigue rigiendo el Alta de catálogo y su retiro queda pendiente.
---
# ADR-0124 - Altas de producto y permisos por rol

Estado: aceptado. Fecha: 2026-11-22. Fuentes: reporte del escaneo en la venta (código desconocido sin UI de alta ni cobro), `src/pages/venta.astro`, `src/pages/panel/stock.astro`, `src/pages/api/products.ts`, `src/pages/api/stock/importar/confirmar.ts`, `src/modules/sales/registro_venta.ts`, `src/lib/panel-modulos.ts`, `src/modules/auth/modelo.ts`, ADR-0106, ADR-0114 y avance STOCK-S19.

## Decisión

Dueño y Empleado pueden crear productos mediante **Alta al vuelo**, sin necesitar el permiso `crear_productos`. El permiso sigue exigéndose hoy para la **Alta de catálogo**; su retiro está registrado en Pendientes y no se ejecuta en este ADR.

`pendiente_revision` es el resultado del gate que decide si el Alta de catálogo puede hacerse. No es un estado del producto: ningún producto se crea con ese estado.

## Por qué

- El Empleado por defecto no recibe `crear_productos` (`PERMISOS_EMPLEADO_DEFAULT` solo incluye `registrar_devoluciones`). La compuerta de la UI ocultaba el alta y, sin nombre que cargar, el código desconocido no entraba al ticket: no había forma de cargar el producto ni de cobrarlo.
- El registro de venta ya creaba el producto con `origen: "alta_al_vender"` dentro de la transacción, sin consultar rol. La compuerta de la UI era más restrictiva que el camino que realmente escribe.
- ADR-0114 decía que un código desconocido no creaba producto. El lector sigue sin crear al decodificar, pero el alta al vuelo sí crea al cobrar o al cargar stock; esta decisión modifica esa afirmación sin borrarla.
- STOCK-S19 alineó el alta desde el panel de stock con `crear_productos`; mantener esa alineación en el Alta al vuelo contradecía la decisión de que ambos roles puedan crear.

## Qué cambia

- El alta por código desconocido en la venta y en el panel de stock se ofrece a Dueño y Empleado por igual.
- `Código de producto` conserva su definición: es el identificador, no un código de barras.
- `Producto provisorio`, `Alta al vuelo` y `Alta de catálogo` pasan a ser términos del glosario.

## Pendientes

- Quitar el gate `crear_productos` del Alta de catálogo (`POST /api/products` e importación) con sus tests, para que la decisión se cumpla en todas las vías.
- Al caer ese gate, revisar `estadoAltaDesdeRol` y `pendiente_revision`: hoy solo gobierna el Alta de catálogo.
- Actualizar el avance STOCK-S19 para reflejar que el alta por código desconocido dejó de estar alineada a `crear_productos`.
