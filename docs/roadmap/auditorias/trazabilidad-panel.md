# Trazabilidad — panel

Fecha: 2026-11-23. Historia: AUD-S5 de PRD-AUD-03 (ADR-0127).
Pantalla: `src/pages/panel.astro` (202 líneas) + `src/components/panel/*` (KpiStrip, SalesChart,
MixDonut, HeatCard, MovementsTable, StockCard, NavTablero, Modo, ReportesComercioDialog).
Handlers: `GET /api/panel/indice`, `GET /api/sales/resumen`. Repos: `lib/repos/panel.ts`,
`lib/repos/planes.ts`.

## Campos persistidos

Ninguno: el panel es 100 % lectura. No hay formulario que escriba en la base; el único POST del
tablero son los diálogos de reportes (`POST /api/reportes`), que devuelven un archivo y no
persisten (ver `Solo lectura`).

## Solo lectura

| Elemento | Handler | Repo | Columnas |
|---|---|---|---|
| Ventas de hoy y del mes | `GET /api/sales/resumen` | `leerResumenPanel` (`lib/repos/panel.ts:31`) | `sales.medio`, `sales.total_centavos`, `sales.client_occurred_at`, `sales.created_at` |
| Devoluciones del período | idem | idem (`:36`) | `sale_returns.monto_centavos`, `medio`, `created_at` (join a `sales` por `sale_id`) |
| Correcciones de medio | idem | idem (`:41`) | `ticket_payment_corrections.medio_nuevo`, `created_at` (join a `sales`) |
| Mix por medio y heatmap 28 días | idem | `construirResumen` (`lib/panel-resumen.ts`) | derivado de las filas anteriores |
| Stock bajo | idem | idem | `products.stock_actual`, `products.min_stock` |
| Turnos de hoy | idem | idem (`:55`) | `shift_handovers.fecha_jornada`, `turno`, `entregado_por`, `estado`, `created_at` |
| Módulos y upsell del comercio | `GET /api/panel/indice` | `indicePanel`, `planIncluye`, `ofertasUpsell` | `subscriptions`, `plan_features` (DB) y `control.tenants`/`memberships` (store de control) |
| Ventas pendientes de sync (solo Dueño) | idem | `listarVentasNoAplicables` (`lib/repos/sync.js`) | tabla de ops no aplicables |
| Balance de caja (barra) | `GET /api/cash/balance` | `obtenerBalance` | `cash_movements.*` |
| Reportes descargables | `POST /api/reportes` | `lib/reportes` | `sales`, `products`, `cash_movements` |

## Columnas del módulo sin pantalla

No aplica: el módulo no es dueño de tablas. Todo lo que muestra lo lee de ventas, caja y stock, ya
trazados en sus archivos.

## Hallazgos

1. **panel-1 — la ventana del resumen filtra por `sales.created_at` y agrupa por
   `client_occurred_at`.** `lib/repos/panel.ts:34` filtra `gte(sales.createdAt, desde)` y `:32`
   selecciona `clientOccurredAt`, que es lo que agrupa `construirResumen`. Una venta offline que se
   sincroniza hoy pero ocurrió anteayer aparece en el día de la ocurrencia, aunque entró a la
   ventana por la fecha de inserción. No es un campo sin columna: es una inconsistencia de ventana,
   y el efecto es que “ventas del mes” puede incluir o excluir una venta según cuándo se sincronizó.
   Nota para el PRD de reportes; no bloquea AUD-S5.

Ninguna tarjeta del panel quedó sin origen: las seis fuentes de arriba cubren lo que muestran
`KpiStrip`, `SalesChart`, `MixDonut`, `HeatCard`, `MovementsTable` y `StockCard`.
