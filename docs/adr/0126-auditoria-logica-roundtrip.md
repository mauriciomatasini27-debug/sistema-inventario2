---
id: ADR-0126
tipo: adr
estado: propuesto
modulos: [persistencia]
depende_de: []
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: La lógica se verifica con un check estático de columnas referenciadas y tests de round-trip por módulo, no con revisión a ojo del código.
---
# ADR-0126 - Auditoría de lógica por round-trip y check de columnas

Estado: propuesto. Fecha: 2026-11-22. Fuentes: PRD-AUD-02.

## Decisión

La lógica código ↔ base se verifica en dos capas: (1) un check estático que confirma que cada tabla o columna referenciada en `src/` (repos y queries) existe en `src/db/schema*.ts`; (2) tests de round-trip por módulo crítico que insertan, leen y comparan un registro sin pérdida de datos ni de tipos.

## Por qué

El código puede compilar y aun así referenciar columnas que no existen en la base, o escribir campos que después no se leen. Comparar solo el esquema (ADR-0125) no cubre qué hace el código con ese esquema. El round-trip es la evidencia mínima de que un dato sobrevive el camino completo.

## Qué cambia

- Agrega un check de referencias estático a `scripts/` y lo suma a `verify`.
- Agrega tests de round-trip para los módulos críticos (ventas, caja, inventario, fiado, fiscal) sobre Postgres de test A/B.
- Los hallazgos se triagean a issues con el módulo afectado.

## Pendientes

- (Resuelto en AUD-S4) La lista de módulos críticos de la primera pasada es ventas, caja, inventario, fiado y fiscal; ver abajo.
- (Resuelto en AUD-S3) El check estático falla `verify` ante una referencia inexistente; ver abajo.

## Implementación (AUD-S3)

- `npm run check:columnas` entra en `verify` (paso `columnas`, después de `arch`): **falla** ante una referencia a tabla o columna que no exista en `src/db/schema*.ts`, y nombra `archivo:línea`. Con el árbol actual da 0 hallazgos sobre 612 archivos y 126 tablas. Falta sumarlo a `.github/workflows/ci.yml`, que hoy es manual-only: el token del agente no tiene scope `workflow`.
- Alcance: SQL crudo de `src/`, no las queries de Drizzle (esas ya las valida `tsc`). Resuelve las interpolaciones `${tabla}` y `${tabla.propiedad}` a `"tabla"` y `"tabla"."columna"` contra los exports del schema, y parsea las sentencias completas: tabla de `from|join|into|update`, columnas calificadas por alias, lista de columnas del `insert`, destinos del `set` y columnas sin calificar cuando la sentencia toca una única tabla real.
- Lo que no cubre, a propósito para no dar falsos positivos: columnas sueltas dentro de un fragmento (`sql\`estado = 'pendiente'\`` armado con `sql.join`; las interpolaciones de columnas del schema en ese fragmento sí se validan), fuentes que son CTE (`from ranked`), joins con columnas sin calificar (ambiguas) y SQL armado en runtime con `sql.raw`.
- Los `sql\`` de `src/db/schema*.ts` no se escanean: ese archivo es la referencia.
- Lógica pura en `scripts/check-columnas-lib.mjs` con tests en `tests/check-columnas.test.ts`; el CLI solo recorre archivos y arma la salida.

## Implementación (AUD-S4)

- `tests/aud-s4-roundtrip.test.ts` con el harness en `tests/helpers/roundtrip.ts`: por módulo crítico, arma una fila con **todas** las columnas del schema (`getTableColumns`), la inserta, la relee por clave primaria (simple o compuesta) y compara valor y tipo JS. Después pone en `NULL` las columnas que el schema declara nulables: si la base quedó `NOT NULL` donde el schema dice nullable, el round-trip lo delata.
- Cobertura: 31 tablas. Ventas: `sales`, `tickets`, `ticket_lines`, `ticket_payments`. Caja: `cash_movements`, `cash_days`, `closing_summaries`, `shift_handovers`, `handover_counts`, `cash_drawer_drops`, `cash_reversals`, `cash_audit_log`, `cash_qr_receipts`, `cash_due_items`. Inventario: `locations`, `products`, `product_codes`, `product_photos`, `stock_lots`, `stock_movements`, `inventory_counts`, `stock_counts`, `stock_count_lines`, `stock_imports`. Fiado: `customers`, `customer_movements`. Fiscal: `fiscal_settings`, `fiscal_sequences`, `fiscal_customers`, `fiscal_documents`, `fiscal_wizard`. Resultado: 0 hallazgos.
- Valores canónicos pensados para detectar pérdida: `bigint` `9007199254740993n` (> 2^53; si el camino pasa por `number`, cambia), `timestamp` con milisegundos (una columna `timestamp(0)` en la base pierde el milisegundo), `jsonb` con anidado, `null` y arreglo. Un tipo de columna nuevo en el schema sin valor canónico hace fallar el armado: la columna no queda sin cubrir por olvido.
- El tipo JS lo mapea Drizzle según el schema, así que una base con otro tipo SQL puede devolver el mismo tipo JS; la comparación schema ↔ base sigue siendo `audit:db` (ADR-0125) y acá se verifica que el **valor** sobreviva el camino completo.
- Corre contra `PG_TEST_URL_A` con un `tenant_id` aleatorio por corrida y borra sus filas en `afterAll`: repetible y sin tocar los fixtures de otros tests PG. Sin `PG_TEST_URL_A` los cinco módulos se saltean; el guard de tipos se prueba igual con casos puros.
- Un caso crea una tabla sonda `timestamp(0)` dentro de una transacción y espera que el round-trip falle: prueba que el test detecta una base que no coincide con el schema, y la transacción se revierte para no dejar la tabla.

