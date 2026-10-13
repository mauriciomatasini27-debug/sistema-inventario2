# PRD-ISO-02 - Aislamiento por tenant del resto del plano de datos (R1)

Fuente: PRD-ISO-01 (Pendientes), ADR-0050, auditoría de código 2026-10-13: 13 rutas con `dbViva()` local que llama `getTenantDb()` sin tenant (`src/pages/api/{sync/pull,sync/push,credit/payments,credit/sales-on-account,purchase-orders,purchase-orders/close,suppliers,tickets/link,prices/adjustments}.ts`, `src/modules/sales/{registro_venta,buscar_venta}.ts`, `src/modules/cash/registro_movimiento.ts`), `src/lib/compras-db.ts:22` (`dbViva` sin tenant, usado por `supplier-invoices/*`), `src/lib/server-db.ts` (`intentarLeer`/`intentarPersistir` con tenant opcional, usados por `cash`, `credit/balance`, `tickets`, `products`, `lots`, `locations`, `sync/promote`, `whatsapp/consult`, `email/close-summary`, `sales/medium-corrections`, `fiscal/settings`, `fiscal/customers`), `src/pages/api/fiscal/wizard.ts:22-39` y `delegacion-confirmada.ts:9-30` (`tenant_id` del body o query), `src/middleware.ts:18-24` (rutas de datos fuera de `protegida`). Fecha extracción: 2026-10-13. Restringido por ADR-0051, ADR-0050, ADR-0002, ADR-0003, ADR-0048.

## Hallazgo

Fuera de lo fiscal ninguna tabla del tenant tiene `tenant_id`: el diseño (ADR-0002) aísla por base propia. Pero como ningún caller pasa el tenant, en `TENANT_MODE=multi` todas esas lecturas y escrituras fallan cerradas (ADR-0050) y caen a la memoria global de `store.ts`, o en `single` van a la base compartida. Pasar el tenant a mano en más de 40 llamadas es frágil; se resuelve una vez por request en el servidor (ADR-0051).

## Épica ISO-E3. Tenant por request en todo el plano de datos

Requisito ISO-3: toda ruta de datos corre con un tenant resuelto por el servidor, y toda conexión a la base del tenant sale de ese contexto.

- Historia ISO-S5. Contexto de tenant por request con `AsyncLocalStorage` (`conTenant(tenantId, fn)`, `tenantActual()`) en `src/lib/tenant-mode.ts`; el middleware resuelve `tenantDeRequest` para las rutas de datos (`/api/sales`, `/api/cash`, `/api/credit`, `/api/purchase-orders`, `/api/supplier-invoices`, `/api/suppliers`, `/api/prices`, `/api/sync`, `/api/tickets`, `/api/products`, `/api/lots`, `/api/locations`, `/api/returns`, `/api/fiscal`, `/api/whatsapp/consult`, `/api/email/close-summary`) y corre `next()` dentro del contexto. AC: Given `TENANT_MODE=multi` sin sesión When `POST /api/sales` Then 403 sin tocar memoria ni base; Given sesión de A con `X-Tenant-Id: A` Then la ruta corre con `tenantActual() = A`; Given modo single Then todo responde como hoy. ADR: 0051, 0050. Talla M. Depende de: ISO-S1.
- Historia ISO-S6. `getTenantDb()` sin argumento usa `tenantActual()`; en multi sin contexto lanza `Falta tenant`. `server-db.ts` y `compras-db.ts` no cambian de firma. AC: Given multi y `conTenant("A")` con `TENANT_DATABASE_URL_A` When llamo `getTenantDb()` Then usa la URL de A; Given multi fuera de contexto Then lanza. ADR: 0051. Talla S. Depende de: ISO-S5.
- Historia ISO-S7. `wizard.ts` y `delegacion-confirmada.ts`: en multi el tenant es el del contexto; un `tenant_id` en body o query distinto responde 403 con el texto de E5. AC: Given sesión de A When `POST /api/fiscal/wizard` con `tenant_id: B` Then 403; Given `tenant_id` omitido Then usa A. ADR: 0051, 0050. Talla S. Depende de: ISO-S5.

## Épica ISO-E4. Sin escrituras huérfanas y backfill

Requisito ISO-4: en multi no se escribe nada sin dueño, y las filas fiscales previas tienen un plan para recibirlo.

- Historia ISO-S8. Escrituras sin tenant en multi: como el middleware corta antes (ISO-S5), `sales`, `returns` y `fiscal/nd` nunca estampan `tenant_id` nulo; si igual llega un doc sin dueño a `asegurarFiscalDoc` en multi, se rechaza. AC: Given multi When `asegurarFiscalDoc(doc)` sin tenant ni contexto Then error y nada en memoria ni base. ADR: 0051. Talla S. Depende de: ISO-S5.
- Historia ISO-S9. Plan de backfill de `fiscal_documents.tenant_id` nulo: `scripts/backfill-tenant-id.mjs` en seco por defecto imprime conteo y el `UPDATE ... WHERE tenant_id IS NULL` para la base de un solo comercio (`DEFAULT_TENANT_ID`); solo ejecuta con `--apply` y nunca sobre una base compartida por más de un comercio. AC: Given `node scripts/backfill-tenant-id.mjs` Then no escribe y muestra la sentencia; Given base con más de un comercio declarado Then se niega. ADR: 0051. Talla S. Depende de: ISO-S3.

## Dependencias externas

Ninguna para dev/demo. Producción multi necesita una base por comercio (`TENANT_DATABASE_URL_<id>`) aprovisionada por control (ADR-0002, ADR-0003).

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Fallo | Sin sesión en multi | `POST /api/sales`, `GET /api/cash/balance` | 403, memoria intacta |
| Feliz | Contexto | Sesión A, `X-Tenant-Id: A` | `tenantActual() = A` dentro de la ruta |
| Fallo | Fuera de contexto | `getTenantDb()` en multi | `Falta tenant` |
| Fallo | Wizard ajeno | Sesión A, body `tenant_id: B` | 403 |
| Fallo | Doc huérfano | `asegurarFiscalDoc` sin tenant en multi | Error |
| Feliz | Backfill en seco | Script sin flags | Solo imprime |
| Regresión | Modo single | Suite actual | Igual que hoy |

Arch-tests: AT3 toda ruta de `src/pages/api` que use `getTenantDb`, `dbViva`, `intentarLeer` o `intentarPersistir` cae bajo un prefijo de rutas de datos del middleware. AT4 ningún archivo fuera de `src/lib/db.ts` lee `TENANT_DATABASE_URL`.

## Pendientes

La memoria de `store.ts` sigue siendo global al proceso: en multi el fallback a memoria de una ruta puede mezclar comercios si falla la base del tenant. Hasta el cutover (PERS-S4/S5) producción multi debe correr un proceso por comercio o con base viva obligatoria. Sin `tenant_id` en tablas no fiscales: el aislamiento depende de la base por comercio.
