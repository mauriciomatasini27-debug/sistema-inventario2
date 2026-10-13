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
