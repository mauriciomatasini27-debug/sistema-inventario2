# Inventario y catálogo

Vocabulario del catálogo de productos del comercio y de la venta.

## Language

**Código de producto**:
Identificador corto y legible que se asigna a un producto para buscarlo y cobrarlo en la venta. Es único dentro de un comercio y es opcional: un producto puede no tenerlo.
_Avoid_: SKU, código de barras, barcode, PLU

**Alta al vuelo**:
Creación de un producto a partir de un Código de producto desconocido durante una venta o una carga de stock.
_Avoid_: alta rápida, crear sobre la marcha, alta desde el lector

**Alta de catálogo**:
Creación explícita de un producto en el catálogo del Comercio, con nombre y precio definidos, de forma manual o desde una importación.
_Avoid_: alta manual, carga de catálogo, alta de producto

**Producto provisorio**:
Producto que nace de una Alta al vuelo: tiene Código de producto y un precio para esa operación, pero no tiene stock inicial.
_Avoid_: producto temporal, producto fantasma, provisorio

**Tenant (Comercio)**:
Organización propietaria de los datos (productos, ventas, clientes, caja) en el sistema. Cada request de datos se resuelve a un único tenant, que determina qué base o filas se usan.
_Avoid_: organization, cuenta, tenant_id

**Numero de devolucion (D-\*)**:
Correlativo propio de cada Comercio para sus devoluciones: empieza en `D-000001` y sigue en orden dentro de ese Comercio, sin reutilizar el número de la venta ni depender de lo que emitan otros comercios.
_Avoid_: número global de devolución, correlativo único en toda la base, número de ticket de venta

**Ingesta Gmail**:
Flujo de lectura de comprobantes (facturas de servicios) que entran por correo Gmail: clasificación capa 1, extracción de PDF/OCR/cuerpo, creación de un borrador pendiente y registro de log.
_Avoid_: sync Gmail, sincronización, watcheo

**Baseline**:
Estado de referencia mínimo aceptado de una pieza (skill, componente, política o gate): el nivel a partir del cual se considera disponible; el resto queda pendiente o como deuda aceptada.
_Avoid_: Umbral nuevo sin acuerdo, To Do, 'pendiente de definir'

**Unicidad por comercio**:
Restricción de identidad cuyo alcance es un Tenant (Comercio): el mismo valor puede existir en dos comercios, pero no repetirse dentro de uno.
_Avoid_: unicidad global, clave única global

**Pesos argentinos**:
Unidad monetaria en la que se expresan precios, totales y pagos del comercio.
_Avoid_: importe, plata, money, peso

**Peso**:
Magnitud física de un producto que se mide para cobrarlo por kilogramo.
_Avoid_: weight, kilograms, pesos argentinos

**Peso en gramos**:
Cantidad de masa de un producto o de una línea de venta, expresada en gramos enteros.
_Avoid_: gramaje, kilos, kg, weight

**Venta por peso**:
Venta en la que el precio de cada línea se calcula a partir del peso en gramos y de un precio por kilogramo, y no de una cantidad de unidades.
_Avoid_: venta a granel, venta por kg

### Stock y lotes

**Historial de stock**:
Registro inmutable de cada entrada y salida de mercadería de un comercio. Es la única verdad sobre el stock de un producto; cualquier otro número se comprueba contra él.
_Avoid_: movimientos de stock, log de stock, stock_movements

**Stock disponible**:
Cantidad de un producto que se puede vender en un momento dado, resultante de las entradas y salidas registradas en el historial.
_Avoid_: stock actual, existencias, saldo de stock

**Lote**:
Grupo de unidades de un mismo producto que entraron juntas y comparten vencimiento y costo. Es la unidad con la que se controla la rotación por vencimiento.
_Avoid_: partida, batch

**Lote genérico**:
Lote sin vencimiento que representa mercadería que entró sin una identificación de lote, como la carga inicial o un ajuste.
_Avoid_: lote ficticio, lote semilla

**FEFO**:
Regla por la que una venta descuenta primero las unidades con vencimiento más cercano y, entre las que vencen igual, las que entraron antes.
_Avoid_: rotación por vencimiento, primero en vencer primero

**Sobreventa**:
Venta confirmada por una cantidad mayor a la que había disponible al registrarla. Se contabiliza en caja y fiado, pero no representa una salida de stock.
_Avoid_: stock negativo, venta en descubierto

## Roles

**Dueño**:
La persona que administra un Tenant (Comercio). Es el único rol con la checklist completa, el diálogo de bienvenida y el cuestionario de configuración.
_Avoid_: owner, admin, usuario dueño

**Empleado**:
La persona que trabaja en un Tenant (Comercio) sin administrarlo. Tiene su propio tour y una checklist corta, y no recibe el diálogo de bienvenida ni el cuestionario del Dueño.
_Avoid_: usuario, operador

## Onboarding

**Cuestionario de configuración**:
Serie guiada de pasos con los que el Dueño completa la configuración inicial de su comercio. No es un requisito para entrar a la aplicación.
_Avoid_: wizard, onboarding
