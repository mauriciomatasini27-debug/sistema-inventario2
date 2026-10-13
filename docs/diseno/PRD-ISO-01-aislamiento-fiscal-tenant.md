# PRD-ISO-01 - Aislamiento por tenant de los datos fiscales (R1)

Fuente: auditoría de código 2026-10-13 sobre `src/lib/fiscal-db.ts:194-199` (`leerFiscalDocs` hace `db.select().from(fiscalDocuments)` sin filtro), `src/lib/fiscal-db.ts:10-16` (`dbViva` llama `getTenantDb()` sin argumento), `src/lib/db.ts:42-46` (`getTenantDb(tenantId?)` cae a `TENANT_DATABASE_URL` compartida), `src/lib/server-db.ts:11-27` (`intentarLeer`/`intentarPersistir` sin tenant), `src/db/schema-fiscal.ts:33` (`fiscal_documents` sin `tenant_id`), `src/middleware.ts:4-25` (rutas `/api/fiscal/*` fuera de `protegida`, sin sesión), `src/pages/api/fiscal/{documents,history,export}.ts` (devuelven la unión DB+memoria completa), `src/pages/api/fiscal/wizard.ts:22-39` (`tenant_id` elegido por el cliente). Contexto: ADR-0001 y ADR-0002 (1 base por cliente, el servidor resuelve la base), ADR-0003, ADR-0048 (dev/demo con una sola base Supabase para control y tenants), Ley 25.326. Fecha extracción: 2026-10-13. Restringido por ADR-0050, ADR-0002, ADR-0003, ADR-0018, ADR-0019, ADR-0048.

## Hallazgo

El aislamiento entre comercios depende de que cada tenant tenga su propia base (ADR-0002), pero ningún caller de `src/` pasa `tenantId` a `getTenantDb()` (16 llamadas, todas sin argumento), así que todos los tenants escriben y leen la misma `TENANT_DATABASE_URL`. Con ADR-0048 esa base además es la misma que control. `fiscal_documents` no tiene `tenant_id`, `leerFiscalDocs` lee la tabla entera y `GET /api/fiscal/history` responde todo sin filtro y sin sesión. Resultado: con dos comercios reales en el mismo despliegue, cualquiera que llame `GET /api/fiscal/history` ve los comprobantes de todos (CUIT/DNI del receptor, importes, CAE, QR). Severidad: alta (datos personales y fiscales de terceros, Ley 25.326); hoy latente porque el despliegue es dev/demo de un solo comercio. El mismo patrón (base compartida sin `tenant_id`) alcanza a ventas, caja, fiado, compras, precios y sync; este PRD cubre solo lo fiscal y deja el resto en Pendientes.

## Épica ISO-E1. Contexto de tenant en el servidor

Requisito ISO-1: el tenant de una request fiscal lo resuelve el servidor, nunca el cliente por sí solo.

- Historia ISO-S1. Resolvedor `tenantDeRequest(request)` en `src/lib/tenant-context.ts`: en modo `TENANT_MODE=multi` exige sesión válida (`resolverSesion`) y membership activa del tenant pedido en header `X-Tenant-Id`; sin eso devuelve 403 con el mismo texto de E5 que no revela si el tenant existe. En modo `single` (default dev/demo, ADR-0048) devuelve `DEFAULT_TENANT_ID` (o `slice0`). AC: Given modo multi sin sesión When pido `GET /api/fiscal/history` Then 403; Given sesión de A con `X-Tenant-Id: B` sin membership Then 403 y evento `acceso_denegado`; Given modo single Then responde como hoy. ADR: 0050, 0002. Talla M. Depende de: nada.
- Historia ISO-S2. `getTenantDb()` sin `tenantId` en modo multi lanza (fail-closed) en lugar de caer a la base compartida; en modo single se conserva el fallback. AC: Given `TENANT_MODE=multi` When llamo `getTenantDb()` Then error `Falta tenant`; Given `getTenantDb("A")` sin `TENANT_DATABASE_URL_A` en modo multi Then error, nunca la URL compartida. ADR: 0050, 0002. Talla S. Depende de: nada.

## Épica ISO-E2. Datos fiscales con dueño

Requisito ISO-2: todo comprobante fiscal guarda a qué tenant pertenece y toda lectura filtra por él, en DB y en memoria.

- Historia ISO-S3. Columna `fiscal_documents.tenant_id text` (migración `0015`, nullable para filas previas, índice por `tenant_id`) y campo `tenant_id` en `StoredFiscalDoc`; `persistirFiscalDoc` y `asegurarFiscalDoc` lo estampan desde el contexto. AC: Given venta del tenant A When se crea el doc fiscal Then la fila y la copia en memoria tienen `tenant_id = A`. ADR: 0050, 0019. Talla S. Depende de: ISO-S1.
- Historia ISO-S4. `leerFiscalDocs(tenantId)` filtra `where tenant_id = $1`; las rutas `documents`, `history` y `export` pasan el tenant del contexto y filtran también la memoria. Una fila sin `tenant_id` no se muestra a nadie en modo multi. AC (test rojo primero): Given docs de A y de B When A pide `history` Then solo ve los suyos; Given doc sin `tenant_id` en modo multi Then no aparece. ADR: 0050. Talla M. Depende de: ISO-S3.

## Dependencias externas

Ninguna para dev/demo. Producción multi-tenant espera a la separación real de bases (ADR-0002, ADR-0003) y a la consulta legal Ley 25.326 ya abierta en el roadmap.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Fallo | Fuga cruzada | Docs de A y B, A pide `history` | Solo docs de A |
| Fallo | Sin sesión en multi | `GET /api/fiscal/history` | 403 |
| Fallo | Tenant ajeno | Sesión A, `X-Tenant-Id: B` | 403, evento `acceso_denegado` |
| Fallo | Fallback compartido | `getTenantDb()` en multi | Error, sin conexión |
| Fallo | Fila legada | Doc sin `tenant_id` en multi | No aparece |
| Regresión | Modo single | Suite actual sin `TENANT_MODE` | Mismos resultados que hoy |

Arch-tests: AT1 ninguna lectura de `fiscalDocuments` en `src/lib` sin `tenant_id` en el `where` (test que escanea el archivo). AT2 ninguna ruta `/api/fiscal/*` de lectura usa `leerFiscalDocs` sin argumento.

## Pendientes

Mismo patrón fuera de fiscal: `src/lib/compras-db.ts`, `src/lib/server-db.ts` y las 13 rutas con `getTenantDb()` sin argumento (ventas, caja, fiado, compras, precios, sync, tickets) siguen dependiendo de una base por tenant que hoy no existe. `wizard.ts` sigue tomando `tenant_id` del body. Las rutas Slice-0 siguen sin sesión en modo single.
