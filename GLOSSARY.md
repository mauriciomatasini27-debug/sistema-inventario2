# Inventario y catálogo

Vocabulario del catálogo de productos del comercio y de la venta.

## Language

**Código de producto**:
Identificador corto y legible que se asigna a un producto para buscarlo y cobrarlo en la venta. Es único dentro de un comercio y es opcional: un producto puede no tenerlo.
_Avoid_: SKU, código de barras, barcode, PLU

**Tenant (Comercio)**:
Organización propietaria de los datos (productos, ventas, clientes, caja) en el sistema. Cada request de datos se resuelve a un único tenant, que determina qué base o filas se usan.
_Avoid_: organization, cuenta, tenant_id

**Ingesta Gmail**:
Flujo de lectura de comprobantes (facturas de servicios) que entran por correo Gmail: clasificación capa 1, extracción de PDF/OCR/cuerpo, creación de un borrador pendiente y registro de log.
_Avoid_: sync Gmail, sincronización, watcheo

**Baseline**:
Estado de referencia mínimo aceptado de una pieza (skill, componente, política o gate): el nivel a partir del cual se considera disponible; el resto queda pendiente o como deuda aceptada.
_Avoid_: Umbral nuevo sin acuerdo, To Do, 'pendiente de definir'

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
