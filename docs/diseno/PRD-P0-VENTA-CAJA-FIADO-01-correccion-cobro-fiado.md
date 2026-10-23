---
id: PRD-P0-VENTA-CAJA-FIADO-01
tipo: prd
estado: hecho
modulos: [caja, ventas, credito, fiscal]
depende_de: [ADR-0004, ADR-0024, ADR-0063, PRD-CAJA-01, PRD-PERS-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Corrige los 5 defectos críticos de venta, caja y fiado encontrados en la auditoría 2026-10-20: signo de caja en ventas, fiado sin venta/ticket, cobro de fiado no atómico, devolución sin reintegro y ticket_lines vacío.
---

# PRD-P0-VENTA-CAJA-FIADO-01 - Corrección crítica de cobro, caja y fiado

Estado: hecho (2026-10-21). Fuente: `docs/roadmap/auditorias/2026-10-20.md` (hallazgos C8.8, FC2, FC5, FC10, TV1/TV2). Restringido por ADR-0004, ADR-0024, ADR-0063, PRD-CAJA-01 y PRD-PERS-01. Fecha extracción: 2026-10-20.

## Épica P0-E1. Signo correcto del cobro de venta en caja

Requisito P0-1: una venta suma dinero a caja (ingreso), nunca resta.

- Historia P0-S1. `POST /api/sales` y `POST /api/cash/movements` insertan el cobro de venta con `tipo: "ingreso"` y `origen: "venta"`. AC: Given una venta de $15.000 en Efectivo When se registra Then `GET /api/cash/balance` devuelve `por_medio.Efectivo = "15000"` y `total = "15000"`. ADR: 0105. Talla S. Depende de: nada.
- Historia P0-S2. Los tests del Slice 0 esperan saldo positivo y un único par venta-cashMovement por idempotency key. AC: Given `tests/slice0-http.test.ts` corre Then `egresos` de origen venta está vacío y `ingresos` tiene longitud 1. ADR: 0105. Talla S. Depende de: P0-S1.

## Épica P0-E2. Fiado crea venta, ticket y stock

Requisito P0-2: `ventaACuenta` de fiado persiste la venta completa igual que una venta al contado.

- Historia P0-S3. `ventaACuenta` inserta `sales`, `tickets`, `ticket_lines`, `ticket_discounts` y `stock_movements` en la misma transacción que `customer_movements`. AC: Given un fiado de $10.000 con 2 líneas When se confirma Then existe una venta con ticket definitivo, líneas con precio congelado (el costo no se guarda en `ticket_lines`) y stock descontado. ADR: 0105. Talla M. Depende de: P0-S1, P0-S4.
- Historia P0-S4. `ticket_lines` y `ticket_discounts` se insertan al emitir una venta al contado; el fiado inserta `ticket_lines` pero todavía no `ticket_discounts`. AC: Given una venta al contado con descuento por línea When se consulta el ticket Then cada línea tiene `bruto` y `descuento` snapshot. ADR: 0105. Talla S. Depende de: nada.

## Épica P0-E3. Atomicidad del cobro de fiado

Requisito P0-3: el cobro de fiado registra el abono y la entrada de caja en una sola transacción.

- Historia P0-S5. `cobroFiado` escribe `customer_movements` y `registrarIngresoCobro` dentro de la misma transacción DB; en modo memoria usa espejo atómico. AC: Given un cobro de fiado de $5.000 When se procesa con base viva Then el balance de caja sube $5.000 y el saldo del cliente baja $5.000, o falla todo. ADR: 0105. Talla M. Depende de: P0-S1.

## Épica P0-E4. Devolución reintegra cuenta corriente

Requisito P0-4: una devolución pagada a cuenta abona al cliente.

- Historia P0-S6. `registrar_devolucion` recibe `fueAcuenta` del medio de pago y, cuando es true, reintegra `customer_movements` del cliente con el monto devuelto. AC: Given una devolución a cuenta de $2.000 When se registra Then el debe/haber del cliente refleja el reintegro y el acumulado de devoluciones no supera el total de la venta. ADR: 0105. Talla S. Depende de: nada.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Venta al contado | $15.000 Efectivo | caja +15000, ticket creado |
| Feliz | Venta a cuenta | $10.000, 2 líneas | venta, ticket, líneas, stock descontado |
| Feliz | Cobro de fiado | $5.000 Transferencia | caja +5000, cliente -5000, una tx |
| Feliz | Devolución a cuenta | $2.000 | cliente +2.000, acumulado válido |
| Fallo | Cobro duplicado | misma Idempotency-Key | 409, un solo movimiento |
| Regresión | Suite Slice 0 | `tests/slice0-http.test.ts` | saldo positivo, sin egresos de venta |

Arch-tests: AT1 las rutas de venta/fiado/caja no importan `src/pages/api` entre sí de forma cíclica; AT2 ningún test espera saldo negativo por una venta; AT3 toda escritura de venta/fiado/caja usa `dbVivaTenant()` con espejo memoria documentado.

## Pendientes detectados en la auditoría 2026-10-21

- El fallback de `cobroFiado` cuando la transacción falla escribe el crédito en memoria y después llama a `registrarIngresoCobro`, que puede escribir la caja en la base viva. Un fallo deja caja en DB y crédito solo en memoria (`src/lib/repos/fiado.ts:300-317`). Es el ítem P10-15.
- `ticket_lines` no tiene columna de costo (`src/db/schema.ts:92-98`), así que la promesa de costo congelado no se cumple. Es el ítem P10-16. Resuelto: migración 0039 agrega `costo_centavos` y `registrar_venta`/`ventaACuenta` congelan el costo unitario vigente.
- `ventaACuenta` no inserta `ticket_discounts`; los descuentos del fiado no quedan persistidos. Es el ítem P10-16. Resuelto en `src/lib/repos/fiado.ts`.
- `ventaACuenta` y `cobroFiado` no tienen test contra Postgres vivo; los casos PG quedan skipped sin base. Es el ítem P10-16. Resuelto en `tests/p10-16-fiado-descuentos.test.ts` (PG A/B + memoria).
