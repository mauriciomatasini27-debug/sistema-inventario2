---
id: ADR-0048
tipo: adr
estado: aceptado
modulos: [persistencia]
depende_de: [ADR-0002, ADR-0003, PRD-SUP-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Usar un solo proyecto Supabase Free con una sola base para desarrollo y demo. CONTROLDATABASEURL y
  TENANTDATABASEURL llevan la misma URL del Session pooler en sa-east-1 por puerto 5432 con sslmode=require.
  Región sa-east-1.
---
# ADR-0048 - Supabase en un solo proyecto Free con Session pooler

Estado: aceptado (parcial) (2026-10-14, evidencia: `.env.example` con Session pooler 5432 y `sslmode=require` en ambas URLs, `drizzle.config.ts`, `src/lib/db.ts` con un cliente por URL; parcial: el proyecto real quedó en `ca-central-1` (desvío de `sa-east-1`) y backup `pg_dump` sin definir). Fecha: 2026-10-13. Fuentes: `docs/migracion-supabase.md`, `drizzle.config.ts`, `src/lib/db.ts`, PRD `diseno/PRD-SUP-01-conexion-supabase.md`.

## Decisión

Usar un solo proyecto Supabase Free con una sola base para desarrollo y demo. `CONTROL_DATABASE_URL` y `TENANT_DATABASE_URL` llevan la misma URL del Session pooler en `sa-east-1` por puerto 5432 con `sslmode=require`. Región `sa-east-1`. Sin `service_role` ni REST de Supabase. Solo connection string por Postgres directo vía Drizzle.

## Por qué

El plan Free permite solo 2 proyectos activos y gastar dos en este sistema deja sin margen. `drizzle.config.ts` ya migra control más tenant en una sola base desde `./src/db` sin `pgSchema` separado. `src/lib/db.ts` cachea un cliente por URL y con la misma URL reusa el mismo pool. La directa exige IPv6 y en Argentina suele fallar con `ENOTFOUND` o `ETIMEDOUT`, por eso el Session pooler es el default.

## Qué cambia

`.env` con ambas variables a la misma URL del pooler. `.env.example` solo con el formato sin contraseña. Separación control versus tenants queda diferida a producción real según ADR-0002 y ADR-0003.

## Alternativa descartada

Dos proyectos desde el día uno, uno para control y otro para tenants. Se descarta porque consume el cupo Free, duplica operación y el schema actual no lo necesita. Tampoco se usa Transaction pooler 6543 para runtime normal porque no soporta prepared statements.

## Pendientes

Crear el proyecto y guardar la password fuera de git. Confirmar cifras Free en `https://supabase.com/pricing` antes de decidir costos. Definir backup propio con `pg_dump` porque Free no trae PITR ni backups descargables.
