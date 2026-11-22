---
id: ADR-0124
tipo: adr
estado: aceptado
modulos: [inventario, ventas, catalogo, caja]
depende_de: [ADR-0026, ADR-0062]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: El historial de stock es la única fuente de verdad; stock y lotes pasan a ser proyecciones de un único seam, verificables y conciliables sin reescribir datos.
---
# ADR-0124 - Historial de stock como única fuente de verdad

Estado: aceptado. Fecha: 2026-11-22. Fuentes: `docs/traspaso/pendientes-2026-11-21.md` (desincronización lotes/stock, bug 5 de la auditoría de ventas), `docs/diseno/PRD-CAT-01-catalogo-lotes-ubicaciones.md`, `docs/03-inventario-precios/inventario-parte-3.md:69`, `docs/08-operacion-admin-analytics/reportes-rotacion.md:737`, `docs/diseno/PRD-PERS-06-sync-pull-catalogo-db.md:20` y relevamiento de `src/db/schema.ts`, `src/lib/repos/stock.ts`, `src/lib/repos/lotes.ts`, `src/lib/repos/ventas.ts` y `src/modules/sales/registro_venta.ts`.

## Decisión

`stock_movements` es la única fuente de verdad sobre el stock de cada comercio. `products.stock_actual` y `stock_lots.cantidad_restante` dejan de ser verdades independientes: son proyecciones escritas por un único seam en `src/lib/repos/stock.ts` dentro de la misma transacción que inserta el movimiento, y se comprueban contra el historial. La venta sigue eligiendo lotes por FEFO, pero el lote que descuenta y el total que baja son dos vistas de esa misma escritura.

Toda entrada de stock —carga inicial, ajustes de conteo, importación, devolución— crea o actualiza un lote real, genérico y sin vencimiento cuando no hay uno identificable, y su movimiento apunta a él. La devolución recupera el lote original de la venta a través de la clave de idempotencia de la venta y reingresa a ese lote. La sobreventa se marca explícitamente y se excluye de la proyección de stock disponible. En memoria rige el mismo seam: si hay base configurada y falla, la operación falla en vez de espejarse en memoria; si no hay base, la memoria es el modo legítimo y se escribe de forma atómica.

## Por qué

- Coexistían tres números con la misma pretensión —`stock_actual`, `cantidad_restante` y `Σ delta`— sin trigger, CHECK ni transacción que los mantuviera iguales. El helper `invarianteStockLotesMovs` (`src/lib/repos/lotes.ts:200-204`) ya exigía la igualdad de los tres, pero solo se usaba en tests de memoria.
- Los documentos se contradecían: `inventario-parte-3.md:69` y `reportes-rotacion.md:737` declaraban al historial como única fuente, mientras `PRD-PERS-06:20` declaraba a `products.stock_actual`. Elegir una es la única forma de que la conciliación tenga contra qué comparar.
- La venta en base ya era atómica (`aplicarVentaLotes`); el desvío venía de los otros escritores (`aplicarMovimiento`, `crearLote`, baja de vencidos, devoluciones, conteos, stock inicial) y de la caída a memoria. Un único seam ataca la causa, no cada síntoma.
- ADR-0026 y PRD-CAT-01 crearon lotes y FEFO sin fijar cuál cantidad mandaba; esta decisión cierra ese vacío sin cambiar el contrato de las APIs.

## Qué cambia

- `aplicarMovimiento` en `src/lib/repos/stock.ts` pasa a ser el único escritor: movimiento, `stock_actual` y `cantidad_restante` en una transacción. `aplicarVentaLotes` solo decide FEFO y delega las escrituras.
- Las entradas sin lote pasan a tener un lote genérico persistido; desaparece el lote virtual `seed-${sku}`.
- La devolución reingresa al lote original, dentro de la transacción del seam.
- La sobreventa lleva una marca explícita y se excluye de la proyección de stock disponible.
- `npm run conciliar:stock` reporta desvíos históricos en modo read-only, con salida 1 si los hay; no repara datos ni agrega migraciones.
- Modelo TLA+ nuevo `StockLotes.tla` para la invariante, fuera de `npm run verify`.

## Pendientes

- Implementar lo anterior por spec y tickets; el desvío histórico solo se reporta, nunca se reescribe.
- Ratificar en el spec si la sobreventa se marca con flag o con tipo propio: la recomendación es flag, para no sacarla del informe de rotación, que filtra `tipo='VENTA'`.
- La reparación o migración de datos existentes requiere autorización explícita de Mauri y no entra en este ADR.
