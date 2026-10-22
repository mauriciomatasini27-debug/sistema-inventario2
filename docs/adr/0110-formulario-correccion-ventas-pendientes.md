---
id: ADR-0110
tipo: adr
estado: aceptado
modulos: [ventas, sync]
depende_de: [ADR-0097, PRD-VF-01, ADR-0106]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  La corrección de una venta pendiente pasa de un textarea JSON a un formulario por línea y por pago.
  Un módulo puro arma el payload desde un borrador tipado y conserva los campos que el formulario no edita.
  El contrato de `/api/sync/no-aplicables` y `postSalesSchema` no cambia; el JSON crudo queda como modo avanzado.
---
# ADR-0110 - Formulario por línea para corregir ventas pendientes

Estado: aceptado (2026-10-22). Fecha: 2026-10-21. Fuentes: `docs/roadmap/avances/P10-7.md`, `docs/roadmap/avances/P10-9.md`, `docs/diseno/PRD-VF-01-verificacion-cola-offline-venta.md`, `docs/diseno/PRD-STOCK-01-carga-stock-tanda1.md`, `docs/adr/0106-producto-provisorio-alta-al-vender.md`, `src/pages/panel/ventas-pendientes.astro`, `src/pages/api/sync/no-aplicables.ts`, `src/lib/repos/sync.ts` (`reintentarVentaNoAplicable`), `src/modules/sync/aplicar-venta-outbox.ts`, `src/lib/validation.ts` (`postSalesSchema`, `salesLineSchema`), `src/lib/pesos.ts`, `src/lib/panel-modulos.ts`, `tests/sync-no-aplicables.test.ts`.

## Decisión

`/panel/ventas-pendientes` muestra un formulario por venta en lugar del textarea JSON como camino principal. El Dueño ve y corrige las líneas y los pagos; el texto JSON queda detrás de un modo avanzado explícito. El endpoint `POST /api/sync/no-aplicables` no cambia: sigue recibiendo `{ op_id, accion: "reintentar", payload }` y `postSalesSchema` sigue siendo la autoridad de validación.

La pantalla trabaja sobre un borrador tipado, no sobre el payload crudo. Un módulo puro nuevo, `src/lib/ventas-pendientes-form.ts`, define `EdicionVenta` (`lineas` y `pagos`) y expone `edicionDePayload`, `payloadCorregido`, `totalCentavos` y `pagosSuman`. Cada línea editable tiene `product_id`, `qty` y `precio_centavos`; cada pago tiene `medio` y `monto_centavos`. `edicionDePayload` lee las líneas válidas del payload y usa los `pagos` existentes o, si no hay, un pago único por el total con el `medio` del payload. `payloadCorregido` clona el payload original y reemplaza solo `lineas` y `pagos`: cada línea conserva `precio_id`, `alta` y cualquier otro campo del original por posición. Así el formulario nunca pierde campos que no muestra.

Los campos editables son los que explican los motivos de P10-7:

- Líneas: `product_id` (SKU, texto de 1 a 64) se muestra como texto de solo lectura; `qty` (entero de 1 a 999) y `precio_centavos` (entero de 0 a 999.999.999) se editan en centavos. `precio_id`, `alta` y cualquier otro campo de la línea se conservan tal como llegaron y no se editan en el formulario.
- Pagos: cada fila edita `medio` y `monto_centavos` (entero mayor que 0), con entre 1 y 5 filas. Si el payload no trae `pagos`, se muestra un pago único por el total con el `medio` del payload. Se puede agregar o quitar un pago mientras quede al menos uno.
- Totales: la pantalla muestra el total de las líneas, la suma de los pagos cuando existen y la diferencia. Con `pagos` presente, Reintentar no envía mientras la diferencia no sea 0 y muestra el aviso.

Los inputs usan los límites y los tipos de `salesLineSchema` y `postSalesSchema`, pero el formulario no reemplaza la validación del servidor. Un payload que el servidor rechaza con 422 `payload_invalido` deja el formulario con los valores editados y el mensaje de error; no se recorta ni se completa nada solo. Tampoco se corrigen solos los pagos, el stock ni las líneas: la decisión de qué cambiar es del Dueño.

El modo avanzado es una salida explícita, no una sincronización bidireccional. El textarea muestra el payload original y no se actualiza con el formulario. Al reintentar en ese modo se parsea el texto y se envía ese payload; si el JSON es inválido, se muestra el error y no se envía nada. El payload corregido del formulario conserva cualquier campo desconocido que ya traía el original. Esto mantiene una salida para los campos fiscales y para `alta`, que el formulario no edita.

`device_code`, `seq_local` y `client_occurred_at` se muestran en el resumen pero no se editan: identifican la operación de la outbox y el correlativo del dispositivo. Cambiarlos rompería la idempotencia por `op_id` y el replay.

La pantalla sigue siendo solo para el Dueño (`exigirDueno` en `src/pages/api/sync/no-aplicables.ts:24`) y sin conexión no intenta corregir: muestra el error y conserva lo tipeado. No hay migraciones, dependencias nuevas ni cambios en el esquema de `outbox`.

## Por qué

P10-7 ya hace visible la venta que no se pudo aplicar y su motivo, pero la única forma de corregirla es editar el JSON completo. Eso exige conocer `postSalesSchema`, los nombres en snake_case y la aritmética en centavos, y en el celular un textarea de 120 px es incómodo. Los motivos más frecuentes (`SIN_STOCK`, `LINEA_INVALIDA`, `PAGOS_NO_SUMAN`) se arreglan cambiando una cantidad, un precio o un pago, no reescribiendo el payload.

Las alternativas se descartaron por estas razones. Dejar el textarea y mejorar los mensajes de error no evita el problema de fondo: el Dueño sigue editando un contrato interno. Un endpoint de corrección con campos sueltos duplica el contrato y la validación en el servidor. Corregir automáticamente cantidades, precios o pagos cambia plata sin que el Dueño lo decida y puede aplicar una venta que no corresponde. El formulario sobre el payload existente resuelve el caso real sin tocar el contrato ni la idempotencia.

## Qué cambia

- `src/pages/panel/ventas-pendientes.astro`: reemplaza el textarea principal por el formulario de líneas y pagos, con totales y modo avanzado.
- `src/lib/ventas-pendientes-form.ts` (nuevo): edición tipada, armado del payload corregido, total y control de pagos. Sin acceso a red ni a base.
- Tests: unitarios del módulo puro (`tests/p10-9-formulario-venta.test.ts`) con campos que el formulario no edita, totales, pagos y payloads inválidos.
- `tests/sync-no-aplicables.test.ts` no cambia: el endpoint y el repo conservan su comportamiento.

## Pendientes

- Mostrar el nombre del producto cuando la venta no trae `alta.nombre` requiere consultar el catálogo; queda fuera de esta decisión.
- La primera entrega no deja agregar ni quitar líneas, no tipea el precio en pesos con errores por campo y no reconstruye el formulario desde el modo avanzado. Esas partes de VP-S1 a VP-S5 quedan pendientes.
- La corrección sigue necesitando conexión. Encolar correcciones offline es otra decisión.
- Si el formulario no cubre un motivo nuevo de `aplicarVentaOutbox`, se evalúa exponer ese campo o dejarlo solo en el modo avanzado.
