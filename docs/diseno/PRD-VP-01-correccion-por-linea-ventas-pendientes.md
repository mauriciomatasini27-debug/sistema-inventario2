---
id: PRD-VP-01
tipo: prd
estado: propuesto
modulos: [ventas, sync]
depende_de: [ADR-0097, PRD-VF-01, ADR-0106, ADR-0110]
reemplaza: []
reemplazado_por: ""
resumen: |
  Formulario por línea y por pago para corregir las ventas offline que quedaron pendientes en
  `/panel/ventas-pendientes`. Conserva los campos que no edita y mantiene el contrato actual del endpoint;
  el JSON crudo queda como modo avanzado.
---
# PRD-VP-01 - Corrección por línea de ventas pendientes

Fuente: `docs/roadmap/avances/P10-9.md`, `docs/roadmap/avances/P10-7.md`, `docs/diseno/PRD-VF-01-verificacion-cola-offline-venta.md`, `docs/diseno/PRD-STOCK-01-carga-stock-tanda1.md`, `docs/adr/0106-producto-provisorio-alta-al-vender.md`, `src/pages/panel/ventas-pendientes.astro`, `src/pages/api/sync/no-aplicables.ts`, `src/lib/repos/sync.ts` (`reintentarVentaNoAplicable`), `src/modules/sync/aplicar-venta-outbox.ts`, `src/lib/validation.ts` (`postSalesSchema`, `salesLineSchema`), `src/lib/pesos.ts`, `src/lib/panel-modulos.ts`. Fecha de extracción: 2026-10-21. Restringido por ADR-0110, ADR-0097, PRD-VF-01 y ADR-0106.

## Problema

P10-7 dejó las ventas que no se pudieron aplicar en `/panel/ventas-pendientes`, con su motivo y una acción para reintentar o descartar. La corrección todavía se hace sobre el JSON crudo del payload: el textarea de `src/pages/panel/ventas-pendientes.astro:155-157` muestra `JSON.stringify(payload, null, 2)` y `reintentar` hace `JSON.parse` de lo tipeado (`src/pages/panel/ventas-pendientes.astro:105-115`). El Dueño tiene que conocer la forma de `postSalesSchema` (`src/lib/validation.ts:24`), escribir snake_case y calcular centavos para cambiar una cantidad o un precio.

Los motivos que devuelve `aplicarVentaOutbox` son `payload_invalido`, `SIN_STOCK`, `LINEA_INVALIDA`, `DESCUENTO_INVALIDO`, `PAGOS_NO_SUMAN` y `FISCAL_RECHAZO`. Los tres del medio se resuelven casi siempre cambiando una cantidad, un precio o un pago. Con el textarea, un error de tipeo produce otro `payload_invalido`, la fila sigue pendiente y el Dueño no sabe qué campo rompió. En el celular el textarea es chico, el teclado tapa el JSON y no hay ayudas de formato.

El costo es operativo: una venta que se cobró en el mostrador queda sin aplicar en el servidor hasta que alguien con paciencia corrija el JSON. El stock y la caja del servidor no reflejan esa venta mientras tanto, y el Dueño vuelve a verla en la lista en cada revisión.

## Épica VP-E1. Corregir una venta pendiente sin editar JSON

Requisito VP-R1: el Dueño ve las líneas y los pagos de la venta pendiente como campos editables, corrige lo que causó el rechazo y reintenta. El payload que se envía conserva los campos que el formulario no muestra. El contrato de `/api/sync/no-aplicables` no cambia.

- Historia VP-S1. Ver la venta como formulario. AC: Given una venta pendiente con dos líneas y `pagos` When el Dueño abre `/panel/ventas-pendientes` Then ve la fecha, la caja, el motivo y un formulario con una fila por línea (`product_id`, cantidad, precio unitario en pesos y subtotal) y una fila por pago (`medio` y monto en pesos); ve el total de las líneas, la suma de los pagos y la diferencia; `device_code`, `seq_local` y `client_occurred_at` se muestran como datos de la operación, no como campos editables; el textarea JSON no está visible por defecto. ADR: 0110. Talla M. Depende de: nada.
- Historia VP-S2. Editar líneas con validación por campo. AC: Given el formulario de la venta When cambia la cantidad a un entero entre 1 y 999 o el precio a un valor en pesos con hasta dos decimales Then el subtotal y el total se recalculan sin enviar nada al servidor; Given la cantidad queda vacía, en 0, con decimales o arriba de 999 Then el campo muestra el error y Reintentar queda deshabilitado; Given el precio supera `$ 9.999.999,99` Then el campo muestra el error y no se envía; Given borra una línea de dos Then queda una línea y el total se recalcula; Given intenta quitar la última línea Then el botón no está disponible y el formulario explica que la venta necesita al menos una línea; Given agrega una línea Then aparece una fila vacía con el SKU marcado como obligatorio. ADR: 0110. Talla M. Depende de: VP-S1.
- Historia VP-S3. Editar pagos y cerrar la diferencia. AC: Given la venta trae `pagos` When cambia un medio o un monto Then la suma de los pagos y la diferencia contra el total se recalculan; Given la diferencia no es 0 Then Reintentar queda deshabilitado y el formulario indica cuánto falta o sobra; Given la venta no trae `pagos` Then muestra un solo selector de `medio` y el total como pago único, y no crea `pagos` al reintentar; Given agrega un pago Then puede tener hasta 5 y todos los montos son enteros mayores que 0; Given quita un pago y queda uno Then el botón de quitar no está disponible. ADR: 0110. Talla M. Depende de: VP-S1.
- Historia VP-S4. Conservar los campos que el formulario no edita. AC: Given un payload con `offline`, `device_code`, `seq_local`, `client_occurred_at`, `precio_id` y campos `fiscal_*` When el Dueño cambia una cantidad y reintenta Then el payload enviado conserva esos campos con el mismo valor y solo cambia `lineas` (y `pagos` o `medio` si los editó); Given una línea trae `alta.nombre` Then el nombre se muestra y se puede editar, y `alta` se conserva; Given el payload trae un campo que la pantalla no conoce Then ese campo viaja igual en el payload corregido. ADR: 0110. Talla S. Depende de: VP-S1.
- Historia VP-S5. Modo JSON avanzado. AC: Given el formulario When abre "JSON avanzado" Then el textarea muestra el payload del borrador actual y el formulario queda oculto; Given edita el JSON y reintenta Then se envía el payload parseado; Given el JSON es inválido y reintenta Then ve el error, no se envía nada y sigue en modo avanzado con el texto intacto; Given cierra el modo avanzado con un JSON válido Then el formulario se reconstruye desde ese JSON; Given el JSON trae campos que el formulario no muestra Then se conservan al volver al formulario y al reintentar. ADR: 0110. Talla M. Depende de: VP-S4.
- Historia VP-S6. Reintentar, error del servidor y venta ya resuelta. AC: Given correcciones válidas When toca Reintentar Then se hace `POST /api/sync/no-aplicables` con `{ op_id, accion: "reintentar", payload }`, la venta desaparece de la lista si se aplicó y el estado muestra el resultado; Given el servidor responde 422 `payload_invalido` Then el formulario conserva los valores editados y muestra el mensaje; Given responde 409 `venta_no_pendiente` Then la lista se recarga y la fila ya no aparece; Given no hay conexión Then muestra el error y conserva lo tipeado; Given un Empleado abre la pantalla o llama al endpoint Then no ve la entrada y recibe 403, como hoy. ADR: 0110. Talla S. Depende de: VP-S2, VP-S3.

## Métricas

| Métrica | Fuente | Meta |
|---|---|---|
| Tiempo hasta resolver una venta pendiente | `created_at` de la op y el momento del reintento exitoso | bajar respecto del textarea |
| Ventas resueltas al primer reintento | reintentos con `resultado: "aplicada"` sobre reintentos totales | subir tras la primera semana |
| Pendientes que vuelven con `payload_invalido` | motivos `payload_invalido` después de usar el formulario | bajar |
| Ventas pendientes acumuladas | filas con estado `no_aplicable:%` por tenant | bajar |

## Fuera de alcance

Cambiar `postSalesSchema` o el contrato de `/api/sync/no-aplicables`; corregir automáticamente cantidades, precios, stock o pagos; consultar el catálogo para completar nombres o validar SKU; editar `device_code`, `seq_local`, `client_occurred_at`, `offline` o el `op_id`; corrección en lote; corrección sin conexión o en la outbox local; descartar varias ventas a la vez; emitir o reemitir el comprobante fiscal; mostrar el historial de intentos.

## Dependencias externas

Ninguna. No hay migraciones ni dependencias nuevas. El formulario usa `parsearPesos` y `formatearCentavos` del repo y el endpoint existente. La verificación formal de la cola (ADR-0097, PRD-VF-01) no cambia porque el contrato de push y de la outbox queda igual.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Corregir cantidad y precio | Venta con 2 líneas y `pagos` que suman | El subtotal y la diferencia se recalculan y el payload conserva `fijos` |
| Feliz | Reintentar aplicado | Payload válido | 200, la fila desaparece y el estado muestra el resultado |
| Fallo | Cantidad inválida | `qty` 0, 1000 o decimal | Error en el campo y Reintentar deshabilitado |
| Fallo | Precio fuera de tope | Precio mayor a `$ 9.999.999,99` | Error en el campo, sin request |
| Fallo | Pagos no suman | Total 15000 y pagos 10000 | Diferencia visible y Reintentar deshabilitado |
| Fallo | JSON inválido en modo avanzado | `{"lineas": [` | Error visible, sin request, texto intacto |
| Borde | Campos desconocidos | Payload con `fiscal_receptor_cuit` y `precio_id` | Ambos viajan igual en el payload corregido |
| Borde | Límites | 50 líneas y 5 pagos | Se puede editar; una línea o un pago más no se agrega |
| Regresión | API sin cambios | `tests/sync-no-aplicables.test.ts` | Sigue verde sin modificar el test |
| E2E | Formulario en 360 px | Venta pendiente sembrada | Se corrige por línea, se reintenta y la fila sale de la lista |
