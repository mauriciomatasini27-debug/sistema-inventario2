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
