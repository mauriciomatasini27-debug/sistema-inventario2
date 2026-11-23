# Round-trip por módulo crítico — código ↔ base real

Fecha: 2026-11-23.
Rama: `mauri/aud-s4` (sobre AUD-S3, commit `60291c4f`).
Historia: AUD-S4 de PRD-AUD-02, restringida por ADR-0126.
Alcance: escribe solo en la base de test de `PG_TEST_URL_A`, con un `tenant_id` aleatorio por
corrida, y borra sus filas al terminar. No toca Supabase ni `drizzle/*.sql`.

## Evidencia de la corrida

```
tests/aud-s4-roundtrip.test.ts (10 tests) 242ms
  AUD-S4: el guard de tipos detecta pérdida (4)
  AUD-S4: round-trip por módulo crítico (5 módulos + 1 sonda)
```

0 hallazgos: las 31 tablas de los cinco módulos devuelven todos sus campos con el mismo valor y
el mismo tipo JS que se escribió.

## Cobertura

| Módulo | Tablas |
|---|---|
| ventas | `sales`, `tickets`, `ticket_lines`, `ticket_payments` |
| caja | `cash_movements`, `cash_days`, `closing_summaries`, `shift_handovers`, `handover_counts`, `cash_drawer_drops`, `cash_reversals`, `cash_audit_log`, `cash_qr_receipts`, `cash_due_items` |
| inventario | `locations`, `products`, `product_codes`, `product_photos`, `stock_lots`, `stock_movements`, `inventory_counts`, `stock_counts`, `stock_count_lines`, `stock_imports` |
| fiado | `customers`, `customer_movements` |
| fiscal | `fiscal_settings`, `fiscal_sequences`, `fiscal_customers`, `fiscal_documents`, `fiscal_wizard` |

## Qué prueba cada cosa

- **Todas las columnas del schema**: el harness arma la fila desde `getTableColumns(tabla)`, no a
  mano. Una columna nueva en `src/db/schema*.ts` entra al test sin tocar nada; un tipo nuevo hace
  fallar el armado hasta que se le enseñe el valor canónico.
- **Valor**: `bigint` canónico `9007199254740993n` (> 2^53) escribe y relee el mismo entero; si el
  camino pasa por `number`, el valor cambia y el round-trip falla. `timestamp` canónico lleva
  milisegundos, `jsonb` lleva anidado, `null` y arreglo.
- **Tipo**: cada columna se compara contra el tipo JS que declara el schema (`bigint`, `number`,
  `boolean`, `Date`, `object`, `string`). El caso "entero leído como texto" del PRD tiene cuatro
  tests unitarios que prueban que el guard lo detecta.
- **PK compuesta**: `product_codes` y `fiscal_sequences` se releen por las dos o tres columnas de
  su `primaryKey({ columns })`, que no vive en la columna sino en el callback de la tabla.
- **Nulabilidad**: después del control completo, el harness pone en `NULL` las columnas que el
  schema declara nulables y vuelve a leer. Si la base quedó `NOT NULL` donde el schema dice
  nullable, el round-trip lo delata.
- **Falla si la base no coincide con el schema**: una tabla sonda declara `timestamp` y se crea
  como `timestamp(0)` dentro de una transacción; el round-trip tiene que fallar perdiendo el
  milisegundo, y la transacción se revierte.

## Límites

- El tipo JS lo mapea Drizzle según el schema, así que una base con otro tipo SQL puede devolver el
  mismo tipo JS (por ejemplo `int4` leído como `number`). La comparación schema ↔ base es
  `audit:db` (ADR-0125); acá se verifica que el **valor** sobreviva el camino completo.
- Corre contra `PG_TEST_URL_A`, no contra una base privada: con `tenant_id` aleatorio y borrado en
  `afterAll` se puede repetir sin ensuciar los fixtures de otros tests PG. Sin `PG_TEST_URL_A` los
  cinco módulos se saltean y el guard de tipos se sigue probando solo.

## Cómo correrlo

```
PG_TEST_URL_A=postgres://postgres@127.0.0.1:54329/pers_tenant_a npx vitest run tests/aud-s4-roundtrip.test.ts
```

En `verify` entra con la suite completa (`scripts/verify.mjs` levanta Postgres local y exporta
`PG_TEST_URL_A/B`).
