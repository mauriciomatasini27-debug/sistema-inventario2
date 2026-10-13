# ADR-0004 - Caja, Ventas, Fiado y Precios

Estado: aceptado. Fecha: 2026-10-10. Fuentes: Caja Parte 1/2/3, Ticket Parte 1/2, Fiado, Precios Parte 1/2.

## Caja C1-C18

C1 caja única ARS por comercio. C2 apertura día con `opened_at/opened_by` servidor inmutables, 1 vigente por `fecha_jornada` America/Argentina. C3 movimientos ingresos/egresos inmutables. C4 5 medios fijos: Efectivo, Débito, Mercado Pago, QR, Transferencia. C5 categorías sistema + propias, `requiere_nota`. C6 saldos derivados `SUM` por medio + total, misma función dominio cliente/servidor. C7 reversión por movimiento opuesto `revierte_a` único, `cash_audit_log`. C8 pedido pagado y egreso misma tx. C9 vencimientos `cash_due_items`. C10 outbox `notification_events` + bot. C11 historial/reportes/export. C12 cierre manual/auto `closing_summaries` único por jornada. C13 QR `cash_qr_receipts` `numero_operacion` único, Gmail beta regex determinista. C14 devolución tope acumulado `FOR UPDATE` venta. C15 retiros `retiro_caja` con `tipo_retiro`, nunca `retiro_dueno` para Empleado. C16 sueldos solo Dueño con empleado + período. C17 turnos conteo ciego vs esperado, tolerancia def ±$500, `diferencia_turno` + resolución dueño, `shift_handovers` + `handover_counts` + `cash_drawer_drops` + conteo sorpresa. C18 fiado lado caja: `A cuenta` no ingresa, `cobro_fiado` sí.

Tablas: `cash_days`, `cash_movements`, `closing_summaries`, `shift_handovers`, `handover_counts`, `cash_drawer_drops`, `cash_due_items`, `cash_qr_receipts`, `cash_audit_log`.

Reglas: bigint centavos, solo INSERT/SELECT + trigger, saldos derivados, `idempotency_key`, jornada servidor + corte, `close_type` CHECK, nota obligatoria si `requiere_nota`.

## Ticket TV1-TV18

TV1 1 venta = 1 ticket misma tx stock + caja + idempotency. TV2 contenido sin costos. TV3 numeración correlativa servidor con lock fila, offline provisorio `DeviceCode-SeqLocal` luego definitivo + alias. TV4 descuentos línea + ticket orden fijo centavos mitad-arriba prorrateo mayor resto. TV5 medios + `A cuenta` TV5.8, dividido P1. TV6 vínculos atómicos e inmutabilidad por documentos vinculados. TV7 leyenda `DOCUMENTO NO VÁLIDO COMO FACTURA`. TV8 historial por definitivo/provisorio. TV9 link público token + vencimiento. TV10 PDF/imagen + QR a link P1. TV11 wa.me default gratis. TV12 central plantilla paga P1 opcional. TV13 devolución parcial/total correlativo propio. TV14 corrección medio P1 auditada. TV15 térmica 58/80 P2 BT. TV16 integra F2/F3/F7/F10/F12, C8/C12/C17, FC2/FC3, RT12. TV17 SQLite local + doble hora + cola. TV18 Dueño todo, Empleado sin costos, Admin solo métricas.

Tablas: `tickets`, `ticket_lines` con precio/costo congelados, `ticket_payments`, `sale_id`, doble número.

## Fiado FC1-FC9

FC1 ficha nombre + teléfono/DNI/notas 280c, anti-duplicados, Ley 25.326 mínima. FC2 `venta_a_cuenta` descuenta stock sin ingreso caja atómico con ticket. FC3 ticket `Pago: A cuenta`. FC4 saldo `SUM(debe-haber)` centavos + caché tx + job nocturno, a favor solo offline a revisar. FC5 `Cobro de fiado` por 5 medios a caja. FC6 tope + plazo, superar solo Dueño, offline contra saldo local. FC7 buckets 0-30/31-60/>60 + días atraso determinista. FC8 wa.me gratis default, central P1. FC9 Dueño topes/ajustes/incobrables/reportes, Empleado dentro tope.

Tablas: `customers`, `customer_movements` append-only (inicial, venta, cobro, devolución, ajuste débito/crédito, incobrable, reversión).

## Precios GP1-GP11

GP1 masivo % 0.01-300 / 0.01-90 con previa y vigencia Ahora/Programada. GP2 por categoría P0, proveedor P1. GP3 vigencia + programados cancelables, reversible solo vía ajuste nuevo. GP4 snapshot precio/costo/descuento por línea, offline con catálogo local sin recalcular cerrado. GP5 ficha costo/precio/ganancia/markup/margen, modo markup fijo recalcula con confirmación. GP6 recomendación mensual determinista desde caja + facturas + sueldos + retiro dueño aparte, con/sin retiro. GP7 config solo Dueño online redondeo paso $1/10/50/100 def $10 dirección arriba, topes, umbrales. GP8 auditoría inmutable + job como Sistema. GP9 integra F1/F7, descuentos, RT, consumos, ticket, caja, OF, AU, bot, promos no acumulan. GP10 1 DB por cliente, admin sin ver montos sin consentimiento. GP11 asesor proveedor P1 top-N ahorro def 5% desactualizado def 60d.

Tablas: `cost_history` inmutable v1, `product_markups`, `price_settings` + overrides, `audit_log`.

Cálculo centavos `nuevo=vigente*(1±p)` + redondeo, valida impuestos+comisiones+ganancia<60%. Jobs: aplica programados a hora vigencia + push <2min, recomendación mensual + consejo viernes. Idempotencia creación ajuste 1 tx + confirmación reforzada + solo online sensibles.

## Decisiones

- Dinero siempre bigint centavos + lint.
- Todo corrige con documento vinculado, nunca UPDATE.
- Offline nunca bloquea mostrador, servidor reasigna y audita.
- Fiado determinista sin scoring.
- Precio manual prevalece sobre bot.

## Contratos API (piloto R1)

- `POST /api/sales` con `Idempotency-Key` header. Body Zod: líneas con `product_id + qty + precio_id`, `medio`, `device_code + seq_local`. Responde 201 con `ticket_definitivo + provisorio`, 409 si `Idempotency-Key` repetida con distinto body, 422 si stock insuficiente con modo offline permitido.
- `POST /api/cash/movements` con mismo `Idempotency-Key` de la venta. Body: `tipo ingreso/egreso`, `metodo_id`, `categoria_id`, `origen venta/retiro/sueldo/devolucion/cobro_fiado`, `sale_id?`. Responde 201, 409 duplicado, 403 si Empleado intenta `retiro_dueno` o sueldos.
- `POST /api/cash/reversals` con `revierte_a` único. Responde 201, 409 si ya revertido, 422 si `revierte_a` no existe.
- `GET /api/cash/balance` deriva `SUM` por medio más total. Sin persistir saldos.
- `GET /api/tickets?numero=` busca por definitivo o provisorio alias. Orden por fecha venta.

## Eventos outbox

- `venta_confirmada {op_id, sale_id, ticket_definitivo, ticket_provisorio, total_centavos, medio, device_code, client_occurred_at}`.
- `caja_egreso {op_id, cash_movement_id, sale_id?, origen, monto_centavos}`.
- `cierre_caja {fecha_jornada, closing_summary_id, ultimo_movimiento_id}`.
- Entrega at-least-once por `op_id`. Consumidor bot y email para NE4 cierre.

## Errores E1-E6

- E1 stock insuficiente online: 422, venta no creada, mensaje con disponible.
- E2 sobreventa offline: se acepta, se marca `sobreventa=true`, se audita, Dueño resuelve.
- E3 doble toque: 409 por `Idempotency-Key`, devuelve original sin duplicar.
- E4 devolución sobre tope: 422 con acumulado vigente.
- E5 cierre con turno en disputa: 422, exige resolución Dueño primero.
- E6 hueco numeración offline: alerta a Control Plane más Dueño, provisorio sigue buscable.

## Fuera de corte

- Pago dividido P1, corrección medio TV14 P1, central WA TV12 P1, térmica TV15 P2, PDF/QR TV10 P1, Gmail abierto C13 P1, conciliación bancaria Fase 3, liquidación sueldos y cargas, scoring crediticio.
