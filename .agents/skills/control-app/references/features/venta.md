# Venta

Ruta `/venta`. Rol empleado. Es la caja rápida con cola offline.

## Selectores

- `#sku` código o SKU.
- `#qty` cantidad.
- `#precio` precio en pesos, con coma decimal. El seed deja `CAFE-001` en 850000 centavos. En el campo se escribe `8500,00`.
- `#medio` medio de pago. Valores `efectivo`, `transferencia`, `tarjeta`, `fiado` según el select.
- `#cobrar` abre el paso de cobro. `#confirmar-cobro` confirma la venta. `#volver-ticket` vuelve al ticket sin vaciarlo.
- `#sync` reintenta la cola offline.
- `#estado` último resultado.
- `#balance` balance de caja.
- `#catalogo-estado` estado del catálogo descargado.

## Receta

```sh
node scripts/control-app/control-app.mjs login --rol empleado
node scripts/control-app/control-app.mjs ir /venta
node scripts/control-app/control-app.mjs escribir '#sku' 'CAFE-001'
node scripts/control-app/control-app.mjs escribir '#qty' '1'
node scripts/control-app/control-app.mjs escribir '#precio' '8500,00'
node scripts/control-app/control-app.mjs clic '#resultados button'
node scripts/control-app/control-app.mjs clic '#cobrar'
node scripts/control-app/control-app.mjs clic '#confirmar-cobro'
node scripts/control-app/control-app.mjs api GET /api/cash/balance
node scripts/control-app/control-app.mjs captura --nombre venta-empleado
```

`#cobrar` abre el paso. `#confirmar-cobro` devuelve 201 y deja un ticket en `#estado`. El `api` tiene que mostrar el movimiento en caja. La captura prueba el estado visual.

## Offline

La cola usa `localStorage.slice0-outbox:<tenant>` y `localStorage.slice0-seq:<tenant>`; sin login quedan las legadas globales (P10-14). Para cortar la red hace falta Playwright directo, porque la CLI no expone `setOffline`. El spec `tests/e2e/venta.spec.ts` ya cubre ese camino. Si tocás la cola, corré `/verify-venta-sync`.

## APIs

- `POST /api/sales` crea la venta.
- `POST /api/sync/push` empuja operaciones.
- `GET /api/cash/balance` muestra el efecto en caja.
- `POST /api/tickets/compartir` y `POST /api/tickets/thermal` generan el ticket.

## Límites

No hay comando para cortar la red ni para inspeccionar `localStorage`. Para eso usá Playwright directo.
