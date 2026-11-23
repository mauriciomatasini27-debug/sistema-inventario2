---
id: ADR-0125
tipo: adr
estado: aceptado
modulos: [catalogo, inventario, ventas]
depende_de: [ADR-0106]
reemplaza: []
reemplazado_por: ""
modifica: [ADR-0114]
modificado_por: []
resumen: Dueño y Empleado pueden crear productos por Alta al vuelo y por Alta de catálogo (creación e importación) sin crear_productos; el gate quedó retirado y la decisión cumplida.
---
# ADR-0125 - Altas de producto y permisos por rol

Estado: aceptado. Fecha: 2026-11-22. Decisión cumplida el 2026-11-22 por spec #433 (T0–T3): sin gate `crear_productos` ni `pendiente_revision`. Fuentes: reporte del escaneo en la venta (código desconocido sin UI de alta ni cobro), `src/pages/venta.astro`, `src/pages/panel/stock.astro`, `src/pages/api/products.ts`, `src/pages/api/stock/importar/confirmar.ts`, `src/modules/sales/registro_venta.ts`, `src/lib/panel-modulos.ts`, `src/modules/auth/modelo.ts`, ADR-0106, ADR-0114 y avance STOCK-S19.

## Decisión

Dueño y Empleado pueden crear productos mediante **Alta al vuelo** y mediante **Alta de catálogo** (creación explícita e importación), sin necesitar el permiso `crear_productos`. El gate de permiso se retiró en T0–T3 de spec #433: la sesión válida y la membership siguen delimitando el Comercio (ADR-0066), y el rol o permisos enviados en el body de la request no deciden la autorización.

`pendiente_revision` y `estadoAltaDesdeRol` se retiraron en T3: ya no hay gate que decida si el Alta de catálogo puede hacerse. El estado del producto queda acotado a `activo` en el repositorio; ninguna vía de alta crea `pendiente_revision`.

## Por qué

- El Empleado por defecto no recibe `crear_productos` (`PERMISOS_EMPLEADO_DEFAULT` solo incluye `registrar_devoluciones`). La compuerta de la UI ocultaba el alta y, sin nombre que cargar, el código desconocido no entraba al ticket: no había forma de cargar el producto ni de cobrarlo.
- El registro de venta ya creaba el producto con `origen: "alta_al_vender"` dentro de la transacción, sin consultar rol. La compuerta de la UI era más restrictiva que el camino que realmente escribe.
- ADR-0114 decía que un código desconocido no creaba producto. El lector sigue sin crear al decodificar, pero el alta al vuelo sí crea al cobrar o al cargar stock; esta decisión modifica esa afirmación sin borrarla.
- STOCK-S19 alineó el alta desde el panel de stock con `crear_productos`; mantener esa alineación en el Alta al vuelo contradecía la decisión de que ambos roles puedan crear. Por eso el gate se retiró en todas las vías, no solo en la del código desconocido.

## Qué cambia

- El alta por código desconocido en la venta y en el panel de stock se ofrece a Dueño y Empleado por igual.
- La Alta de catálogo no exige `crear_productos`: la creación explícita (`POST /api/products`) y la confirmación de importación (`/api/stock/importar/confirmar`) quedan disponibles para Dueño y Empleado dentro de su Comercio y con sesión válida.
- El panel de stock muestra a ambos roles el formulario `Agregar producto`, la acción de importar y el catálogo sugerido; esos controles ya no se ocultan por permiso ni dependen de un `data-puede-crear`. `/api/stock/plantilla` (GET y POST) tampoco exige Dueño: sesión válida, membership activa y Comercio siguen siendo el límite (ADR-0066).
- El contrato HTTP y los mensajes de error se conservan; la validación de nombre y precio sigue vigente (T1 sumó el rechazo de nombres vacíos o solo espacios, reutilizando el mensaje original del esquema para que la respuesta 422 no cambie). Solo cambia la regla de autorización.
- `Código de producto` conserva su definición: es el identificador, no un código de barras.
- `Producto provisorio`, `Alta al vuelo` y `Alta de catálogo` pasan a ser términos del glosario.

## Excepción heredada: modo single/legacy sin sesión

La historia 19 de spec #433 pide rechazar el alta de un usuario sin sesión. En modo single/legacy se conserva deliberadamente el comportamiento P9-13: `resolverRolEfectivo` devuelve `legado` cuando no hay sesión y `POST /api/products` sigue escribiendo con el default Dueño (201). Este cambio no modifica ese modo, que está preservado desde T1/T2 para no romper flujos legacy; el límite de sesión válida + membership se aplica en el modo multi. `tests/sec05-rol-sesion.test.ts` fija este comportamiento con un test de caracterización.

## Pendientes

Sin pendientes sobre el gate `crear_productos`: la decisión quedó cumplida en T0–T3 de spec #433 y los avances STOCK-S19 y AUD-VTA-05 ya reflejan la nueva regla. `crear_productos` permanece en la lista cerrada de permisos válidos por compatibilidad con memberships almacenadas; retirarlo es una decisión separada y queda fuera de este ADR.
