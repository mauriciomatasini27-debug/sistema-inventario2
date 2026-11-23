# Trazabilidad — caja

Fecha: 2026-11-23. Historia: AUD-S5 de PRD-AUD-03 (ADR-0127).
Pantalla: `src/pages/panel/caja.astro` (975 líneas). Handlers: `src/pages/api/cash/*`.
Repo: `src/lib/repos/caja.ts`, `movimientos-caja.ts`.
No auditado: el export CSV (`GET /api/cash/export`, solo lectura) y los jobs de medianoche
(`correrCierreMedianoche`), que no tienen pantalla por diseño.

## Campos persistidos

| Campo en pantalla | Payload | Handler | Repo | Columna | Estado |
|---|---|---|---|---|---|
| Tipo (ingreso/egreso) | `tipo` | `POST /api/cash/movements` | `insertarMovimientosCaja` | `cash_movements.tipo` | ok |
| Medio | `metodo` | idem | idem | `cash_movements.metodo` | ok |
| Categoría | `categoria_id` (fijo `manual`) | idem | idem | `cash_movements.categoria_id` | ok |
| Origen | `origen` | idem | idem | `cash_movements.origen` | ok |
| Monto | `monto_centavos` | idem | idem | `cash_movements.monto_centavos` | ok |
| Dispositivo / secuencia / hora | `device_code`, `seq_local`, `client_occurred_at` | idem | `cash_movements.idempotency_key`/`created_at` | ok (dominio) |
| Nota del movimiento | `nota` (aceptada por el schema) | idem | — | — | **huérfano (caja-1)** |
| Fecha de jornada (cierre) | `fecha_jornada` | `POST /api/cash/close` | `cerrarCaja` | `closing_summaries.fecha_jornada` | ok |
| Tipo de cierre | `close_type` (fijo `manual`) | idem | idem | `closing_summaries.close_type` | ok |
| Total y desglose del cierre | calculados del histórico | idem | idem | `closing_summaries.total_centavos`, `por_medio` | ok (derivado) |
| Fecha de jornada (retiro) | `fecha_jornada` | `POST /api/cash/drops` | `registrarRetiro` | `cash_drawer_drops.fecha_jornada` | ok |
| Monto del retiro | `monto_centavos` | idem | idem | `cash_drawer_drops.monto_centavos` | ok |
| Motivo | `motivo` | idem | idem | `cash_drawer_drops.motivo` | ok |
| Quién retira | `creado_por` | idem | idem | `cash_drawer_drops.creado_por` | ok |
| Retiro sorpresa | `sorpresa` | idem | idem | `cash_drawer_drops.sorpresa` | ok |
| Turno: jornada, turno, quién entrega, esperado | `fecha_jornada`, `turno`, `entregado_por`, `esperado_centavos` | `POST /api/cash/shifts` | `abrirTurno` | `shift_handovers.*` | ok |
| Conciliación: contado y conteos por medio | `turno_id`, `contado_centavos`, `conteos_por_medio` | `POST /api/cash/shifts/conciliate` | `conciliarCaja` | `shift_handovers.contado_centavos`/`diferencia_centavos`, `handover_counts.medio`/`monto_centavos` | ok |
| Resolución: nota y quién resolvió | `turno_id`, `nota`, `resuelto_por` | `POST /api/cash/shifts/resolve` | `resolverCaja` | `shift_handovers.resolucion_nota`, `resuelto_por`, `estado` | ok |
| Reversión: a qué movimiento, motivo, actor | `revierte_a`, `motivo`, `actor` | `POST /api/cash/reversals` | `revertirCaja` | `cash_reversals.revierte_a`/`motivo`/`actor`, `cash_audit_log` | ok |
| QR: número, monto, origen | `numero_operacion`, `monto_centavos`, `origen` | `POST /api/cash/qr` | `registrarQr` | `cash_qr_receipts.numero_operacion`/`monto_centavos`/`origen` | ok |
| Vencimiento: concepto, vence, monto | `concepto`, `vence_el`, `monto_centavos` | `POST /api/cash/due-items` | `crearVencimiento` | `cash_due_items.concepto`/`vence_el`/`monto_centavos` | ok |
| Pago de vencimiento | `id` (query) + `metodo` opcional | `PATCH /api/cash/due-items?id=` | `pagarVencimiento` | `cash_due_items.estado`/`pagado_el`/`cash_movement_id` + egreso | ok |

## Solo lectura

| Elemento | Handler | Repo | Columnas |
|---|---|---|---|
| Balance y totales por medio | `GET /api/cash/balance` | `obtenerBalance` | `cash_movements.metodo`, `monto_centavos`, `tipo` |
| Últimos movimientos | `GET /api/cash/history?limit=10` | `listarMovimientosConFecha` | `cash_movements.*` |
| Cierre del día | `GET /api/cash/close?fecha=` | `leerCierre` | `closing_summaries.*` |
| Vencimientos | `GET /api/cash/due-items` | `listarVencimientos` | `cash_due_items.*` |
| Comprobantes QR | `GET /api/cash/qr` | `listarQr` | `cash_qr_receipts.*` |
| Export CSV | `GET /api/cash/export` | `listarMovimientosConFecha` | `cash_movements.*` |

## Columnas del módulo sin pantalla

| Columna | Clasificación |
|---|---|
| `cash_movements.sale_id` | interna: la llena la venta |
| `cash_qr_receipts.cash_movement_id`, `.fecha_operacion` | sin pantalla: las llena la ingesta (bot/Gmail/manual), no el panel |
| `cash_qr_receipts.estado` | se muestra en el listado y cambia por la ingesta; el panel solo lo deshace (`deshacerQr`) |
| `cash_due_items.avisado_el` | sin pantalla: la marca el job de avisos (CAJA-S3) |
| `closing_summaries.ultimo_movimiento_id` | interna |
| `handover_counts.created_at`, `cash_audit_log.detalle` | internas del cierre/reversión |

## Hallazgos

1. **caja-1 — `nota` en el contrato de movimientos no tiene columna.** `cashMovementSchema` la
   define (`lib/validation.ts:58`), el panel no la manda y `cash_movements` no tiene columna
   `nota` (`src/db/schema.ts:148`). Un cliente de la API que la mande la pierde en silencio.
   Issue #476. Accionable: sacarla del schema o agregar la columna (decisión de producto: la nota del
   movimiento es útil para el arqueo).
2. **caja-2 — el pago de un vencimiento no deja elegir el medio desde el panel.** `PATCH
   /api/cash/due-items` acepta `metodo` (`api/cash/due-items.ts:79`) pero `caja.astro:344` manda
   el body vacío, así que el egreso sale con el medio por defecto. Nota: el campo existe en la
   API y no en la pantalla; no es un campo huérfano, es una pantalla incompleta.
