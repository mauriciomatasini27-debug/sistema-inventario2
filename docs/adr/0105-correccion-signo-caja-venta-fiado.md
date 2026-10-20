---
id: ADR-0105
tipo: adr
estado: aceptado
modulos: [caja, ventas, credito, fiscal]
depende_de: [ADR-0004, ADR-0024, ADR-0063, PRD-CAJA-01, PRD-PERS-01]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Una venta suma a caja (ingreso), el fiado crea venta/ticket/líneas/stock, el cobro de fiado es atómico, la devolución a cuenta reintegra y ticket_lines se persiste.
---

# ADR-0105 - Corrección de signo de caja, fiado y atomicidad de cobro

Estado: aceptado. Fecha: 2026-10-20. Fuentes: `docs/roadmap/auditorias/2026-10-20.md`, `src/modules/sales/registro_venta.ts:266`, `src/lib/repos/fiado.ts:100-132 y 199-207`, `src/lib/repos/ventas.ts:187 y 285`, `src/db/schema.ts:89`.

## Decisión

1. El cobro de una venta se registra en `cash_movements` con `tipo: "ingreso"` (no `"egreso"`), `origen: "venta"` y `categoriaId: "venta"`. Se corrige `registro_venta.ts`, `vender_mostrador.ts` y `confirmar_venta.ts`; se actualizan `tests/slice0-http.test.ts` para esperar saldo positivo.
2. `ventaACuenta` de fiado persiste `sales`, `tickets`, `ticket_lines`, `ticket_discounts` y `stock_movements` en la misma transacción que `customer_movements`, con contador `ticket_counters` y 409 por idempotency key.
3. `cobroFiado` escribe `customer_movements` y la entrada de caja (`registrarIngresoCobro`) dentro de una sola transacción; en modo memoria usa espejo atómico y falla todo o nada.
4. `registrar_devolucion` acepta `fueAcuenta` según el medio de pago; cuando es true, reintegra `customer_movements` del cliente con el monto devuelto. El valor por defecto para devoluciones no a cuenta sigue siendo false.
5. `ticket_lines` y `ticket_discounts` se insertan al emitir cualquier venta con snapshot de precio y costo congelados (GP4), y se leen al consultar el ticket.

## Por qué

El signo "egreso" en ventas deja la caja con saldo negativo y contradice C8.8 (el cobro ingresa a caja). El fiado sin venta ni ticket rompe FC2 y el cierre de caja. El cobro no atómico permite inconsistencia entre saldo de cliente y caja ante fallo. La devolución sin reintegro rompe FC10. `ticket_lines` vacío incumple TV1/TV2 y deja el ticket sin detalle fiscal de líneas.

## Qué cambia

- `src/modules/sales/registro_venta.ts`, `vender_mostrador.ts`, `confirmar_venta.ts`: signo ingreso e inserción de líneas de ticket.
- `src/lib/repos/fiado.ts`: `ventaACuenta` completa y `cobroFiado` atómico.
- `src/lib/repos/ventas.ts`: `fueAcuenta` por medio en `registrar_devolucion`.
- `tests/slice0-http.test.ts`, `tests/fiado*.test.ts`, `tests/tickets.test.ts`: aserciones de saldo positivo y líneas de ticket.
- No crea tablas nuevas (`ticket_lines`, `ticket_discounts`, `customer_movements`, `cash_movements`, `stock_movements` ya existen).

## Pendientes

- Aprobación de Mauri (afecta plata y datos).
- Correr `npm run verify` verde tras el cambio.
- Registrar avance en `docs/roadmap/avances/P10-1.md` a `P10-5.md`.
