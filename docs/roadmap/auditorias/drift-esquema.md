# Drift de esquema — base real ↔ `src/db/schema*.ts` ↔ `drizzle/*.sql`

Fecha: 2026-11-23.
Rama: `mauri/aud-s2` (sobre AUD-S1, commit `16cf998a`).
Historia: AUD-S2 de PRD-AUD-01, restringida por ADR-0125.
Alcance: solo lectura. No se escribió en ninguna base ni se editó un `drizzle/*.sql` aplicado.

## Evidencia de la corrida

Supabase `rpdrzvrmuuglfavynyph` (SIstemadegestion, PostgreSQL 17.11) y el clúster local
(`postgres://postgres@127.0.0.1:54329/pers_tenant_a`) tienen el **mismo catálogo `public`**:
126 tablas, 1088 columnas, 280 índices y 162 constraints. La huella es idéntica en las dos bases:

```
cols ecd2b00514abe82f97fef6b5d47065b9
idx  12cb7aa9e82209e6253e975bbea66786
con  e832f8289a6b136295d85408d54b4638
```

La huella es `md5(string_agg(...))` sobre `information_schema.columns` (nombre, tipo, largo,
precisión, escala, nulabilidad y default, en orden de `ordinal_position`), `pg_indexes`
(nombre y `indexdef`) y `pg_constraint` (nombre, tipo y `pg_get_constraintdef`). Como el catálogo
es igual, el diff que `audit:db` calcula contra el clúster local aplica literalmente a Supabase:
hoy no hay credencial de conexión directa a Supabase para el script (solo el MCP de solo lectura),
y esta huella es la prueba de equivalencia. Para volver a correrlo contra Supabase hace falta un
DSN de solo lectura en `AUDIT_DATABASE_URL`.

Corrida sobre el clúster local (`npm run audit:db`; con `-- --json --estricto` da el mismo total):

```
audit:db base=127.0.0.1:54329/pers_tenant_a schema=17 archivos migraciones=59 archivos tablas_base=126
resumen: 23 hallazgos en 9 tablas (tipo=7 indice-columnas=1 columna-faltante=2 pk=1 fk=3 columna-sobrante=8 indice-sobrante=1)
```

Los 23 hallazgos son **19 divergencias únicas**: `whatsapp_usage` aparece una vez en el diff
contra el schema y otra contra las migraciones con las mismas 4 columnas.

## Triage

Decisiones:

- **corregir-schema**: la base queda como está; el cambio va en `src/db/schema*.ts` (y, cuando
  haga falta dejar constancia en el historial, en una migración nueva e idempotente).
- **corregir-base**: la base se cambia con una migración nueva, aprobada por Mauri; nunca se
  edita un `drizzle/*.sql` ya aplicado.

| # | Tabla · objeto | Lado real (Supabase = local) | Lado esperado | Decisión | Dueño |
|---|---|---|---|---|---|
| 1 | `arca_tokens.expiration` | `timestamp with time zone` | `timestamp without time zone` (`schema-fiscal-control.ts:23`) | corregir-schema | esquema |
| 2 | `arca_tokens.updated_at` | `timestamp with time zone` | `timestamp without time zone` (`schema-fiscal-control.ts:24`) | corregir-schema | esquema |
| 3 | `fiscal_computers.not_after` | `timestamp with time zone` | `timestamp without time zone` (`schema-fiscal-control.ts:14`) | corregir-schema | esquema |
| 4 | `fiscal_documents.proximo_intento` | `timestamp with time zone` | `timestamp without time zone` (`schema-fiscal.ts:67`) | corregir-schema | esquema |
| 5 | `fiscal_jobs.clave` | no existe | `text` PK (`schema.ts:284`) | corregir-schema: quitar la declaración duplicada de `schema.ts`; la forma real es la de `schema-fiscal-control.ts:40-47` y la crea `0003_fiscal_d8_d7_t3.sql:41-48`; `0013` (forma `clave`) quedó muerta por `IF NOT EXISTS` y no se edita | esquema |
| 6 | `fiscal_jobs.created_at` | no existe | `timestamp` NOT NULL (`schema.ts:288`) | corregir-schema (misma corrección que #5) | esquema |
| 7 | `fiscal_jobs.intentos` | `bigint` | `integer` (`schema.ts:287`) | corregir-schema (misma corrección que #5) | esquema |
| 8 | `fiscal_jobs.tenant_id` | `uuid` | `text` (`schema.ts:285`) | corregir-schema (misma corrección que #5) | esquema |
| 9 | `fiscal_jobs.proximo_intento` | `timestamp with time zone` | `timestamp without time zone` (`schema-fiscal-control.ts:46`) | corregir-schema (`withTimezone: true`) | esquema |
| 10 | `fiscal_jobs` PK | `[id]` | `[clave]` (`schema.ts:283-289`) | corregir-schema (misma corrección que #5) | esquema |
| 11 | `customers.customers_tenant_id_idx` | índice **no** unique sobre `(tenant_id)` (`0047_shared_tenant_periferia.sql:9`) | `uniqueIndex` (`schema-credito.ts:20`) | corregir-schema: un unique sobre `tenant_id` solo permitiría un cliente por comercio; pasa a `index` | esquema |
| 12 | `product_codes` FK | `(tenant_id, sku) → products(tenant_id, sku)` (`0045_shared_tenant_sellar_nucleo.sql:207`) | FK suelta `sku → products.sku` (`schema.ts:339-341`) | corregir-schema: declarar la FK compuesta (`foreignKey`) como en la migración | esquema |
| 13 | `product_photos` FK | `(tenant_id, sku) → products(tenant_id, sku)` (`0045`) | FK suelta `sku → products.sku` (`schema.ts:400`) | corregir-schema (FK compuesta) | esquema |
| 14 | `stock_lots` FK | `(tenant_id, sku) → products(tenant_id, sku)` (`0045`) | FK suelta `sku → products.sku` (`schema.ts:350-352`) | corregir-schema (FK compuesta) | esquema |
| 15 | `whatsapp_usage.entregado_en` | `timestamp without time zone` nullable, 0 filas | no declarada en schema ni en migraciones | corregir-base: `DROP COLUMN` en migración nueva (sin lectores ni escritores en `src/`) | base (aprueba Mauri) |
| 16 | `whatsapp_usage.leido_en` | `timestamp without time zone` nullable, 0 filas | no declarada | corregir-base (misma migración que #15) | base (aprueba Mauri) |
| 17 | `whatsapp_usage.fallo_codigo` | `integer` nullable, 0 filas | no declarada | corregir-base (misma migración que #15) | base (aprueba Mauri) |
| 18 | `whatsapp_usage.fallo_motivo` | `text` nullable, 0 filas | no declarada | corregir-base (misma migración que #15) | base (aprueba Mauri) |
| 19 | `fiscal_computers.fiscal_computers_ambiente_alias_key` | `UNIQUE (ambiente, alias)` en la base (0 filas) | no declarada ni en schema ni en migraciones | corregir-schema: declarar el unique compuesto; migración nueva con `CREATE UNIQUE INDEX IF NOT EXISTS` (no-op) para que el historial lo refleje | esquema |

Resumen por decisión: **corregir-schema 15** (ítems 1-14 y 19), **corregir-base 4** (15-18).
Ninguna divergencia queda ambigua; no hay ítems "aceptados así" sin dueño.

Notas de impacto:

- Los cinco `timestamp` de #1-#4 y #9 son deadlines y marcas de reintento fiscal. Con
  `timestamp without time zone` el valor depende del `TimeZone` de la sesión; la base y las
  migraciones usan `timestamptz`, que es lo correcto para instantes absolutos.
- `fiscal_jobs` está vacía en producción (0 filas) y **ningún módulo la usa**: la tabla existe
  solo en `schema.ts` y `schema-fiscal-control.ts`. Por eso la corrección de #5-#8 y #10 no
  tiene riesgo de datos.
- Las 4 columnas de `whatsapp_usage` no las lee ni escribe nada en `src/`, no están en ningún
  `drizzle/*.sql` y la tabla tiene 0 filas en producción: el `DROP` no pierde información.
- `fiscal_computers` también tiene 0 filas; el unique de #19 hoy solo existe en la base.

## Falsos positivos del instrumento corregidos antes de triagear

La primera corrida (misma base, commit `15601e6c`) daba 55 hallazgos. 32 eran del parser de
`scripts/audit-db-lib.mjs`, no de la base, y se corrigieron en el PR #469 (AUD-S1) con tests:

- **15 nulabilidad**: `.$type<…>()` cortaba la cadena de la columna y se perdían `notNull()` y
  `default()` de 15 columnas JSONB (`jsonb("payload").$type<…>().notNull()`).
- **8 indice-sobrante**: 7 `CONSTRAINT "x" UNIQUE` declarados en la línea de la columna
  (`0001`, `0005`) y 1 `CREATE UNIQUE INDEX` dentro de un bloque `DO` (`0012`).
- **3 fk** y **3 fk-sobrante**: las FK compuestas se partían por columna y el
  `DROP CONSTRAINT` de las FK viejas (`0045`) no se aplicaba.

## Fuera de alcance

Triggers, funciones, RLS/grants, secuencias y datos no entran en `audit:db` y no se auditaron
acá. La huella tampoco cubre esos objetos: la igualdad Supabase ↔ local vale para tablas,
columnas, índices y constraints de `public`.

## Cómo reproducir

```
TENANT_DATABASE_URL=postgres://postgres@127.0.0.1:54329/pers_tenant_a npm run audit:db
TENANT_DATABASE_URL=… npm run audit:db -- --json --estricto
```

Contra Supabase, con un DSN de solo lectura en `AUDIT_DATABASE_URL`. La consulta de huella
usada para comparar las dos bases es la misma en ambas: `string_agg` sobre
`information_schema.columns`, `pg_indexes` y `pg_constraint` de `public`, con `md5`.
