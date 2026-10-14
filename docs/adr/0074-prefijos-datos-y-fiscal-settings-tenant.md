# ADR-0074 - Rutas de datos completas en el middleware y `fiscal_settings` por tenant

Estado: propuesto. Fecha: 2026-10-14. Fuentes: PRD `diseno/PRD-SEC-02-prefijos-datos-y-fiscal-settings.md`, ADR-0066 (Pendientes), ADR-0051, ADR-0050, `src/lib/tenant-context.ts`, `src/db/schema-fiscal.ts`, `src/pages/api/fiscal/settings.ts`, `src/lib/repos/fiscal.ts`.

## Decisión

`PREFIJOS_DATOS` suma `/api/payment-orders`, `/api/payees`, `/api/counts`, `/api/stock`, `/api/service-accounts`, `/api/utility-bills` y `/api/ocr`, y un arch-test exige que toda ruta de `src/pages/api` que use repositorios por tenant esté cubierta. `fiscal_settings` gana `tenant_id` con índice único (migración Drizzle nueva); la ruta hace upsert por tenant y lee de la base, y `resolverCuitFiscal` filtra por el tenant del contexto.

## Qué cambia

- En `TENANT_MODE=multi`, los siete prefijos responden 403 sin tenant resoluble y corren dentro de `conTenant`. En single nada cambia.
- `POST /api/fiscal/settings` reemplaza la fila del tenant (antes `onConflictDoNothing` sin clave, que insertaba filas sueltas); `GET` lee de la base del tenant y cae a memoria solo sin base.
- Emitir sin CUIT en el body usa solo la configuración del tenant actual.

## Alternativa descartada

Confiar en que cada base de tenant tiene un solo comercio (ADR-0048 single project lo contradice) o resolver el tenant dentro de cada ruta sin middleware. Se descarta porque duplica la lógica de ADR-0051 y deja rutas nuevas desprotegidas por omisión.

## Consecuencias

Filas previas de `fiscal_settings` quedan con `tenant_id` nulo y no se leen hasta el backfill (P0.3 del ROADMAP). Clientes en multi que llamaban esas siete rutas sin sesión pasan a recibir 403.

## Pendientes

Backfill de `tenant_id` en `fiscal_settings` junto con el resto (`scripts/backfill-tenant-id.mjs`).
