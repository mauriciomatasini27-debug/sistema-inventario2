---
id: PRD-SUP-01
tipo: prd
estado: hecho
modulos: [persistencia]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: auditoría 2026-10-13 sobre docs/migracion-supabase.md, src/lib/db.ts, drizzle.config.ts,
  drizzle/meta/journal.json, .env.example, package.json. Gap: la app habla a localhost y clientFor no negocia
  TLS ni pooler. El journal ya lista 0000 a 0014 medido hoy.
---
# PRD-SUP-01 - Conexión Supabase como Postgres gerenciado

Fuente: auditoría 2026-10-13 sobre `docs/migracion-supabase.md`, `src/lib/db.ts`, `drizzle.config.ts`, `drizzle/meta/_journal.json`, `.env.example`, `package.json`. Gap: la app habla a `localhost` y `clientFor` no negocia TLS ni pooler. El journal ya lista 0000 a 0014 medido hoy.

Data shape: `SupabaseConnection = { ref, controlUrl, tenantUrl, poolMode }` con `poolMode` en `session-5432`, `direct`, o `transaction-6543`. La URL es la única fuente de verdad. `clientFor` deriva `isTxPooler` e `isLocal` desde la URL. Sin banderas sueltas.

## Épica SUP-E1. Conectar una base Supabase Free

- SUP-S1. Proyecto y URLs. AC: Given cuenta Supabase When creo proyecto `sistema-inventario` en `ca-central-1` (desvío del plan original `sa-east-1`, ADR-0048) Then obtengo connection strings de Session pooler y las guardo fuera de git. Depende de: nada.
- SUP-S2. Variables de entorno. AC: Given Session pooler When seteo `.env` Then `CONTROL_DATABASE_URL` y `TENANT_DATABASE_URL` usan la misma URL con `sslmode=require` y `.env` sigue ignorado por git. Depende de: SUP-S1.
- SUP-S3. Driver con TLS y pooler. AC: Given URL con puerto When llamo `clientFor` Then usa `max 5` en nube, `prepare false` solo en 6543, y `ssl require` salvo localhost. Tablas: ninguna, solo `src/lib/db.ts`. Depende de: SUP-S2.
- SUP-S4. Migraciones a Supabase. AC: Given Session pooler o directa When corro `drizzle-kit migrate` Then `Table Editor` muestra `sales`, `cash_movements`, `outbox`, `id_mappings`, `sync_state` y `drizzle.__drizzle_migrations` con una fila por migración 0000 a 0036. Nunca migrar por 6543. Depende de: SUP-S3.

## Épica SUP-E2. Verificar corte a nube

- SUP-S5. Prueba viva. AC: Given dev contra Supabase When hago una venta y pido `GET /api/cash/balance`, `GET /api/tickets` y balance de `credit` Then cada respuesta trae `fuente: "db"`. Depende de: SUP-S4.
- SUP-S6. Tests. AC: Given Supabase viva When corro `npm test` Then pasan `tests/sync-durable.test.ts`, `tests/pers-write-through.test.ts` y `tests/credit-rutas.test.ts`. Depende de: SUP-S5.

## Estrategia prueba

| Tipo | Caso | Resultado |
|---|---|---|
| Conexión | `select now()` con `ssl require` | una fila con hora |
| Migración | `drizzle-kit migrate` por Session pooler | 15 entradas 0000 a 0014 aplicadas |
| Corte | venta más balance | `fuente: "db"` en las tres lecturas |
| Regresión | suite dominial | verdes los tres archivos de SUP-S6 |
