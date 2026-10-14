# PRD-PERS-02 - Cutover a Postgres por tenant: memoria aislada, sin fallback silencioso en multi y jobs con tenant (R1)

Fuente: PRD-PERS-01 (PERS-S4 y PERS-S5 pendientes), ADR-0024, ADR-0050, ADR-0051, PRD-ISO-02 (Pendientes), `node scripts/cutover-scope.mjs` (110 archivos de `src/pages/api` importan `src/lib/store.ts`, medido 2026-10-13), `src/lib/store.ts:97` (`store` único por proceso), `src/lib/server-db.ts` (`intentarLeer`/`intentarPersistir` devuelven `null`/`false` y el caller cae a memoria), `dbViva()` local en 13 rutas y en `src/lib/compras-db.ts`, `src/middleware.ts` (`X-Job-Secret` pasa sin tenant), `src/pages/api/jobs/*`. Fecha extracción: 2026-10-13. Restringido por ADR-0052, ADR-0024, ADR-0051, ADR-0002.

## Hallazgo

Con ISO-S5 la base ya sale del tenant de la request, pero la memoria no: `store` es un objeto por proceso. En `TENANT_MODE=multi` una ruta que cae a memoria (base caída o dominio todavía sin DB) lee y escribe el mismo `store` para todos los comercios. Además los jobs entran por `X-Job-Secret` sin tenant. Retirar `store.ts` de 110 rutas es Talla L; este PRD cierra primero el riesgo de mezcla con un corte verificable y deja el resto del cutover por dominio.

## Épica PERS2-E1. Memoria por tenant y sin fallback silencioso

Requisito PERS2-1: en multi ningún dato de un comercio queda visible para otro, aunque una ruta todavía use memoria.

- Historia PERS2-S1. `store` particionado por tenant: en multi cada `tenantActual()` tiene su propio estado en memoria (mismas claves que hoy); fuera de contexto en multi acceder a `store` lanza. En single hay un solo estado como hoy. AC: Given multi When A registra una venta en memoria Then `store` dentro de `conTenant("B")` no la ve; Given multi fuera de contexto When leo `store.movements` Then error `Falta tenant`. ADR: 0052, 0051. Talla M. Depende de: ISO-S5.
- Historia PERS2-S2. Sin fallback silencioso en multi: `intentarLeer` e `intentarPersistir` y los `dbViva()` locales propagan el error en multi en lugar de caer a memoria; la ruta responde 503 `base_no_disponible`. En single (dev, tests, build) se conserva el fallback. AC: Given multi sin `TENANT_DATABASE_URL_A` When `GET /api/credit/balance` como A Then 503; Given single sin DB Then responde desde memoria como hoy. ADR: 0052, 0024. Talla M. Depende de: PERS2-S1.

## Épica PERS2-E2. Jobs con tenant

Requisito PERS2-2: un job con `X-Job-Secret` en multi actúa sobre un comercio explícito.

- Historia PERS2-S3. En multi el middleware exige `X-Tenant-Id` junto a `X-Job-Secret`, valida que el tenant exista en control y esté `activo` o `suspendido`, y corre el job dentro de `conTenant`. Sin tenant o tenant inexistente: 403 con el texto de E5. El secreto mal puesto sigue sin pasar. En single no cambia. AC: Given multi y secreto válido sin `X-Tenant-Id` When `POST /api/jobs/cierre-medianoche` Then 403; Given `X-Tenant-Id: A` activo Then corre con `tenantActual() = A`. ADR: 0052. Talla S. Depende de: ISO-S5.

## Épica PERS2-E3. Postgres local para tests de cutover

Requisito PERS2-3: el cutover se prueba contra Postgres real local, nunca contra Supabase.

- Historia PERS2-S4. `scripts/pg-local.sh` levanta un Postgres local en el box (`/workspace/.pgdata`, puerto 54329, solo `127.0.0.1`), crea una base por tenant de prueba y corre las migraciones de `drizzle/` contra ella. Los tests de integración se activan con `PG_TEST_URL` y se saltean sin ella. AC: Given Postgres local When corro `tests/pers2-pg.test.ts` con `PG_TEST_URL` Then crédito de A se lee con `fuente: db` desde la base de A y B no lo ve; Given sin `PG_TEST_URL` Then el test se saltea. ADR: 0052. Talla M. Depende de: PERS2-S2.

## Épica PERS2-E4. Rutas sin `store`: tickets, precios y proveedores (PERS-S4, grupo 1)

Requisito PERS2-4: las rutas de `tickets`, `prices` y `suppliers` no importan `src/lib/store.ts`; leen y escriben por un repositorio de dominio en `src/lib/repos/` que va a Postgres del tenant y solo en `single` sin base usa la memoria (ADR-0053).

- Historia PERS2-S5. `src/lib/repos/tickets.ts` cubre `GET /api/tickets` (tickets de la venta), `tickets/compartir` (envíos por central) y `tickets/link` (links, hashes, vistos y revocaciones) con DB primero vía `dbVivaTenant()`. AC: Given multi con base de A When creo y revoco un link Then quedan en `ticket_links` de A y `tickets/link` no importa `store`; Given single sin base Then se comporta como hoy. ADR: 0053, 0052. Talla M. Depende de: PERS2-S2.
- Historia PERS2-S6. `src/lib/repos/precios.ts` para `prices/adjustments` (ajustes idempotentes por clave). AC: Given multi con base de A When repito el mismo ajuste Then una sola fila y respuesta idempotente; la ruta no importa `store`. ADR: 0053. Talla S. Depende de: PERS2-S2.
- Historia PERS2-S7. `src/lib/repos/proveedores.ts` para `suppliers` (alta por CUIT con 409). AC: Given multi con base de A When doy de alta el mismo CUIT dos veces Then 409 y una fila; B no lo ve. ADR: 0053. Talla S. Depende de: PERS2-S2.

Arch-test AT7: ningún archivo de `src/pages/api/{tickets,prices,suppliers}*` importa `lib/store`; contador global de rutas con `store` baja de 71.

## Épica PERS2-E5. Rutas sin `store`: fiscal (PERS-S4, grupo 2)

Requisito PERS2-5: las 8 rutas de `src/pages/api/fiscal/` no importan valores de `src/lib/store.ts` (un `import type` se permite); leen y escriben comprobantes, ND y wizard por `src/lib/repos/fiscal.ts`, que envuelve `src/lib/fiscal-db.ts` con DB primero y memoria solo en `single` sin base (ADR-0053, ADR-0054).

- Historia PERS2-S8. Comprobantes: `fiscal/documents`, `history`, `export`, `emitir`, `retry` y `nd` usan el repositorio (lectura, alta idempotente por clave, reintento, ND por clave de cabecera y su movimiento). AC: Given multi con base de A When emito un comprobante Then queda en `fiscal_documents` de A, B no lo ve en `history` y la ruta no importa `store`; Given single sin base Then se comporta como hoy. ADR: 0054, 0052. Talla M. Depende de: PERS2-S2.
- Historia PERS2-S9. Wizard: `fiscal/wizard` y `fiscal/delegacion-confirmada` leen y guardan el estado por `fiscal_wizard` del tenant. AC: Given multi con base de A When avanzo el wizard Then el estado queda en la base de A y B arranca de cero. ADR: 0054. Talla S. Depende de: PERS2-S2.

Arch-test AT8: ningún archivo de `src/pages/api/fiscal/` importa valores de `lib/store`; el contador global baja de 66.

## Épica PERS2-E6. Rutas sin `store`: whatsapp y email (PERS-S4, grupo 3)

Requisito PERS2-6: `whatsapp/consult`, `whatsapp/webhook`, `email/send` y `email/close-summary` no importan valores de `src/lib/store.ts` (un `import type` y `control`, que es el plano de control global, se permiten); leen y escriben por `src/lib/repos/whatsapp.ts` y `src/lib/repos/email.ts` con DB primero y memoria solo en `single` sin base (ADR-0053, ADR-0055).

- Historia PERS2-S10. `src/lib/repos/whatsapp.ts` cubre sesiones del bot (`whatsapp_sessions`), lista de pedido del viernes, y las lecturas de precios, stock y proveedores y las altas de órdenes de compra y movimientos que hace el webhook. AC: Given multi con base de A When el dueño de A consulta stock o arma un pedido por WhatsApp Then lee y escribe solo en la base de A, B no ve la sesión ni el pedido, y las rutas no importan `store`; Given single sin base Then se comporta como hoy. ADR: 0055. Talla M. Depende de: PERS2-S2.
- Historia PERS2-S11. `src/lib/repos/email.ts` cubre la cola de envíos (`email_outbox`), los eventos del resumen y los movimientos de caja que lee `close-summary`. AC: Given multi con base de A When encolo un email Then queda en `email_outbox` de A y B no lo ve. ADR: 0055. Talla S. Depende de: PERS2-S2.

Arch-test AT9: ningún archivo de `src/pages/api/{whatsapp,email}/` importa `store` de `lib/store`; el contador global baja de 58.

## Épica PERS2-E7. Rutas sin `store`: caja (PERS-S4, grupo 4)

Requisito PERS2-7: las 11 rutas de `src/pages/api/cash/` que hoy importan `store` (balance, history, export, close, drops, qr, reversals, due-items, shifts, shifts/conciliate, shifts/resolve) leen y escriben por `src/lib/repos/caja.ts` con DB primero y memoria solo en `single` sin base (ADR-0053, ADR-0056).

- Historia PERS2-S12. Movimientos y cierre: `balance`, `history`, `export`, `close`, `reversals` y `due-items` usan el repositorio (movimientos, cierres, reversiones con su auditoría, vencimientos de caja). AC: Given multi con base de A When registro una reversión o cierro la caja Then quedan en las tablas de caja de A y B no las ve; la ruta no importa `store`; Given single sin base Then se comporta como hoy. ADR: 0056. Talla M. Depende de: PERS2-S2.
- Historia PERS2-S13. Turnos, retiros y QR: `shifts`, `shifts/conciliate`, `shifts/resolve`, `drops` y `qr` usan el repositorio (`shift_handovers`, `cash_drawer_drops` y recibos QR). AC: Given multi con base de A When registro un retiro idempotente Then una fila en `cash_drawer_drops` de A y ninguna en B. ADR: 0056. Talla M. Depende de: PERS2-S2.

Arch-test AT10: ningún archivo de `src/pages/api/cash/` importa `store` de `lib/store`; el contador global baja de 54.

## Épica PERS2-E8. Rutas sin `store`: facturas de proveedores y órdenes de pago (PERS-S4, grupo 5)

Requisito PERS2-8: las 6 rutas de `src/pages/api/supplier-invoices/` y las 4 de `src/pages/api/payment-orders/` leen y escriben por `src/lib/repos/facturas-proveedor.ts` y `src/lib/repos/ordenes-pago.ts` con DB primero y memoria solo en `single` sin base. Los movimientos de caja que generan los pagos van por `src/lib/repos/caja.ts` (ADR-0053, ADR-0056, ADR-0057).

- Historia PERS2-S14. Facturas de proveedores: borradores, confirmación, descarte, conciliación con órdenes de compra, cuenta corriente y pagos. AC: Given multi con base de A When confirmo un borrador y registro un pago Then quedan en la base de A, B no los ve y las rutas no importan `store`; Given single sin base Then se comporta como hoy. ADR: 0057. Talla M. Depende de: PERS2-S2.
- Historia PERS2-S15. Órdenes de pago: preparar, cancelar, confirmar pagada y sugerir desde notificación, con numeración por tenant. AC: Given multi con base de A When preparo una orden Then queda en la base de A con su número y B arranca su propia numeración. ADR: 0057. Talla S. Depende de: PERS2-S2.

Arch-test AT11: ningún archivo de `src/pages/api/{supplier-invoices,payment-orders}/` importa `store` de `lib/store`; el contador global baja de 43.

## Épica PERS2-E9. Rutas sin `store`: consumos de servicios y fiado (PERS-S4, grupo 6)

Requisito PERS2-9: `utility-bills`, `utility-bills/due`, `utility-bills/pay`, `credit/balance`, `credit/payments` y `credit/sales-on-account` leen y escriben por `src/lib/repos/servicios.ts` y `src/lib/repos/fiado.ts` con DB primero y memoria solo en `single` sin base. Los movimientos de caja van por `src/lib/repos/caja.ts` (ADR-0053, ADR-0056, ADR-0058).

- Historia PERS2-S16. Consumos de servicios: alta (idempotente por mensaje de origen), vencimientos y pago. AC: Given multi con base de A When cargo y pago una factura de servicio Then quedan en la base de A, B no la ve y las rutas no importan `store`; Given single sin base Then se comporta como hoy. ADR: 0058. Talla S. Depende de: PERS2-S2.
- Historia PERS2-S17. Fiado: venta a cuenta, cobros y saldo por cliente. AC: Given multi con base de A When registro una venta a cuenta y un cobro Then el saldo de A los refleja y B no los ve. ADR: 0058. Talla S. Depende de: PERS2-S2.

Arch-test AT12: ningún archivo de `src/pages/api/{utility-bills,credit}*` importa `store` de `lib/store`; el contador global baja de 33.

## Épica PERS2-E10. Rutas sin `store`: jobs programados (PERS-S4, grupo 7)

Requisito PERS2-10: los 6 jobs de `src/pages/api/jobs/` que hoy importan `store` (whatsapp-aviso, whatsapp-semanal, whatsapp-cierre, cierre-medianoche, vencimientos-lotes, vencimientos-servicios) leen y escriben por los repositorios de dominio que ya existen (`caja.ts`, `servicios.ts`, `ordenes-pago.ts`, `whatsapp.ts`) y por `src/lib/repos/lotes.ts` para lotes, siempre con el tenant que resuelve `gateJob` (ADR-0052, ADR-0053, ADR-0059).

- Historia PERS2-S18. Jobs de avisos y cierre: whatsapp-aviso, whatsapp-semanal, whatsapp-cierre y cierre-medianoche usan los repositorios de caja y whatsapp. AC: Given multi con base de A When corre el cierre de medianoche para A Then el cierre queda en la base de A y B no lo ve; el job no importa `store`; Given single sin base Then se comporta como hoy. ADR: 0059. Talla M. Depende de: PERS2-S12, PERS2-S10.
- Historia PERS2-S19. Jobs de vencimientos: vencimientos-lotes y vencimientos-servicios usan `lotes.ts`, `servicios.ts` y `ordenes-pago.ts`. AC: Given multi con base de A When corre el job para A Then solo marca vencimientos de A. ADR: 0059. Talla S. Depende de: PERS2-S15, PERS2-S16.

Arch-test AT13: ningún archivo de `src/pages/api/jobs/` importa `store` de `lib/store`; el contador global baja de 27.

## Dependencias externas

Postgres local instalado en el box (apt). Producción multi necesita `TENANT_DATABASE_URL_<id>` por comercio (ADR-0002).

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Fallo | Mezcla en memoria | Venta de A, lectura como B | B no la ve |
| Fallo | Fuera de contexto | `store` en multi sin tenant | `Falta tenant` |
| Fallo | Base caída en multi | Sin URL de A | 503 `base_no_disponible` |
| Fallo | Job sin tenant | Secreto válido sin `X-Tenant-Id` | 403 |
| Feliz | Job con tenant | `X-Tenant-Id: A` | Corre como A |
| Feliz | Postgres local | Crédito de A | `fuente: db`, B aislado |
| Regresión | Modo single | Suite actual | Igual que hoy |

Arch-tests: AT5 ningún `catch` en `src/pages/api` traga un error de base en multi sin pasar por `server-db.ts` (los `dbViva()` locales usan el helper central). AT6 `store` no se exporta como objeto plano (solo vía la partición).

## Pendientes

PERS-S4 por dominio (credit, tickets, prices, suppliers, fiscal, whatsapp/email) y PERS-S5 (0 imports de `store` en `src/pages/api`) siguen abiertos; la memoria por tenant no es durable y un reinicio la pierde. Jobs que recorren todos los comercios necesitan un fan-out por tenant desde control.
