# Migración de Postgres local a Supabase (plan gratis)

Estado: guía. Fecha: 2026-10-22. Alcance: `drizzle.config.ts`, `src/lib/db.ts`, `.env`, `drizzle/` y `docs/roadmap/migraciones/` (ADR-0112).

## Punto de partida

- Drizzle con `dialect: "postgresql"` y driver `postgres-js` (`src/lib/db.ts`). El schema vive en `src/db/*.ts`.
- `.env` define `CONTROL_DATABASE_URL` y `TENANT_DATABASE_URL`. En local apuntan a `localhost` con usuario `postgres`.
- `drizzle.config.ts` toma un solo schema (`./src/db`) y usa `TENANT_DATABASE_URL`. Las migraciones crean todas las tablas, de control y de tenant, en una sola base.
- `drizzle/` llega a `0047_shared_tenant_periferia`. Hay 48 archivos `.sql` y 48 entradas en `drizzle/meta/_journal.json` (2026-11-15).
- La última migración aplicada en la base real es `0047_shared_tenant_periferia` (registro 2026-11-15, `docs/roadmap/migraciones/0047_shared_tenant_periferia.json`). Cada migración se registra en `docs/roadmap/migraciones/<tag>.json`; `docs/roadmap/migraciones-aplicadas.md` es el índice derivado que regenera `main`.

## 1. Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) y registrate con GitHub o Google.
2. **New project**.
   - Organization: la personal (plan Free).
   - Name: `sistema-inventario`.
   - Database password: generá una fuerte y guardala. Evitá `@ : / ? #` o codificalos en la URL.
   - Region: **Canada (Central) `ca-central-1`**. Es la región del proyecto real (ADR-0048); el plan original de `sa-east-1` se descartó.
3. Esperá a que termine el aprovisionamiento.

## 2. Obtener las connection strings

En el dashboard, **Connect** → **Connection string** → **URI**. Hay tres:

| Tipo | Host / puerto | Usuario | Para qué |
|---|---|---|---|
| Direct connection | `db.<ref>.supabase.co:5432` | `postgres` | Migraciones. Solo IPv6 en plan Free. |
| Session pooler | `aws-0-ca-central-1.pooler.supabase.com:5432` | `postgres.<ref>` | Migraciones y servidor de larga vida si tu red no tiene IPv6. |
| Transaction pooler | `aws-0-ca-central-1.pooler.supabase.com:6543` | `postgres.<ref>` | Serverless o muchas conexiones cortas. No soporta prepared statements. |

Reemplazá `[YOUR-PASSWORD]` por tu contraseña.

> Si la conexión directa falla con `ENOTFOUND` o `ETIMEDOUT`, usá el **Session pooler** en el puerto 5432.

## 3. Una base o dos

Para desarrollo y demo usá **un solo proyecto, una sola base y la misma URL en las dos variables**.

Por qué:

- El plan Free permite 2 proyectos activos. Gastar los dos deja sin margen.
- `drizzle.config.ts` migra todas las tablas en una sola base desde `./src/db`. No hay `pgSchema` separado.
- `src/lib/db.ts` cachea un cliente por URL. Con la misma URL reutiliza el pool.

En producción, separá control y tenants con dos proyectos o un plan pago, según ADR-0002 y ADR-0003.

## 4. Variables de entorno

En `.env`, nunca commiteado:

```env
# Servidor Astro Node: Session pooler, puerto 5432
CONTROL_DATABASE_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-0-ca-central-1.pooler.supabase.com:5432/postgres?sslmode=require
TENANT_DATABASE_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-0-ca-central-1.pooler.supabase.com:5432/postgres?sslmode=require
```

Actualizá `.env.example` solo con el formato, sin contraseña.

Para serverless, cambiá al puerto `6543` y aplicá el ajuste del paso 6.

## 5. Correr las migraciones

El script existe en `package.json`.

```bash
npm run db:migrate
```

- Usá la conexión directa o el Session pooler en 5432. No migres por el Transaction pooler 6543.
- El journal está completo. `drizzle-kit migrate` aplica lo que figura en `drizzle/meta/_journal.json`.
- El journal ordena por `when`, no por número. Por eso `0035_stock_imports` aparece antes de `0033` y `0034`. Es esperado.
- Toda migración nueva se aplica solo con aprobación de Mauri y se registra en `docs/roadmap/migraciones/<tag>.json` antes del merge del PR que la trae. El `.md` derivado lo regenera `main` con `npm run docs:migraciones`.

## 6. Ajustes de código

`src/lib/db.ts` ya usa la configuración correcta para Supabase:

```ts
const isTxPooler = url.includes(":6543");
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
c = postgres(url, {
  max: isLocal ? 10 : isTxPooler ? 1 : 5,
  prepare: !isTxPooler,
  ssl: isLocal ? false : "require",
});
```

- **SSL**: Supabase exige TLS. `?sslmode=require` en la URL y `ssl: "require"` en el cliente son redundancia segura.
- **Puerto 6543**: obligatorio `prepare: false`, si no falla con `prepared statement "..." does not exist`.
- **Puerto 5432**: funciona igual que el Postgres local.
- **Conexiones**: el plan Free tiene tope bajo. `max` queda en 1 para el Transaction pooler y en 5 para el Session pooler.

## 7. Probar que anda

1. En Supabase → **Table Editor** tienen que aparecer las tablas (`sales`, `cash_movements`, `outbox`, `id_mappings`, `sync_state`, etc.) y `drizzle.__drizzle_migrations` con una fila por migración.
2. Conexión rápida:
   ```bash
   node -e "const p=require('postgres');const s=p(process.env.TENANT_DATABASE_URL,{ssl:'require'});s\`select now()\`.then(r=>{console.log(r);return s.end()})"
   ```
3. App: `npm run dev`, hacé una venta y consultá `GET /api/cash/balance`, `GET /api/tickets` y el balance de `credit`. La respuesta tiene que traer `fuente: "db"`.
4. Tests: `npm test` con `PG_TEST_URL_A` y `PG_TEST_URL_B` definidas. Los bloques PG se saltean sin base.

## 8. Límites del plan Free

- **Pausa por inactividad**: el proyecto se pausa tras una semana sin actividad. Se reactiva a mano.
- **Tamaño de base**: 500 MB. Ojo con `email_outbox`, logs y tablas append-only.
- **2 proyectos activos** por organización.
- **Conexiones**: instancia Nano con tope bajo. Usá el pooler y `max` bajo por proceso.
- **Egress** de ~5 GB/mes y **Storage** de 1 GB.
- **Sin backups descargables ni PITR**. Hacé `pg_dump` propio si los datos importan.
- Confirmá las cifras en [precios de Supabase](https://supabase.com/pricing) antes de decidir.

## Seguridad

- `.env` contiene secretos reales. Confirmá que está en `.gitignore`.
- No uses la `service_role` key ni la API REST. El proyecto habla Postgres directo vía Drizzle y solo necesita la connection string.
- No imprimas URLs con contraseña en logs, CI ni capturas.
