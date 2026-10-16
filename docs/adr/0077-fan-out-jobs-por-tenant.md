---
id: ADR-0077
tipo: adr
estado: aceptado
modulos: [tenant]
depende_de: [ADR-0051, ADR-0052, PRD-PERS-02, PRD-SEC-04]
reemplaza: []
reemplazado_por: ""
resumen: |
  En TENANTMODE=multi, un job con X-Job-Secret válido en /api/jobs/ y sin X-Tenant-Id corre una vez por cada
  tenant de control.tenants con estado activo o suspendido, en secuencia y ordenado por id, cada vez dentro de
  su conTenant.
---
# ADR-0077 - Fan-out de jobs por tenant

Estado: aceptado (2026-10-14, evidencia: `tests/sec04-fan-out-jobs.test.ts` y `tests/pers2-jobs.test.ts` con Postgres local, commit `6621f3a`). Fecha: 2026-10-14. Fuentes: PRD `diseno/PRD-SEC-04-fan-out-jobs-por-tenant.md`, ADR-0052 (Pendientes), PRD-PERS-02, ADR-0051, `src/lib/tenant-context.ts`, `src/middleware.ts`, `src/pages/api/jobs/*`.

## Decisión

En `TENANT_MODE=multi`, un job con `X-Job-Secret` válido en `/api/jobs/*` y sin `X-Tenant-Id` corre una vez por cada tenant de `control.tenants` con estado `activo` o `suspendido`, en secuencia y ordenado por id, cada vez dentro de su `conTenant`. `gateJob` devuelve esa lista; un helper compartido (`correrJob`) ejecuta el cuerpo de la ruta por tenant, captura errores por tenant y responde 200 con un resumen (`fan_out`, `total`, `fallidos`, `resultados` con `tenant_id`, `status` y `cuerpo`). Con `X-Tenant-Id` el camino de un solo tenant no cambia. Enmienda PERS2-S3 (ADR-0052): "multi sin `X-Tenant-Id` → 403" pasa a ser fan-out, solo en `/api/jobs/*`.

## Qué cambia

- `gateJob` suma una variante de fan-out con la lista de tenants elegibles; secreto inválido sigue en `null`, tenant explícito inexistente o no elegible sigue en 403 E5, single sigue con el tenant por defecto.
- El middleware deja pasar el fan-out sin envolver en un solo `conTenant`; la ruta envuelve por tenant. Fuera de `/api/jobs/*`, secreto válido sin tenant en multi sigue en 403.
- Las seis rutas de jobs con tenant (cierre-medianoche, vencimientos-lotes, vencimientos-servicios, whatsapp-aviso, whatsapp-cierre, whatsapp-semanal) delegan en `correrJob` en vez de repetir gate, `conTenant` y el 503 de `BaseNoDisponible`. `whatsapp-cierre` avisa un cierre puntual (`tenant_id` y `fecha_jornada` en el body) y no es un barrido: no hace fan-out y en multi sigue exigiendo `X-Tenant-Id` (403 E5 sin él).
- `aviso-sync` y `vencer-ocr` leen la memoria del comercio (`store`): también pasan por `correrJob` y hacen fan-out. Los jobs de control (`mora-diaria`, `purgar-demos`, `whatsapp-lunes`, `enqueue`) solo leen `control`: en multi sin `X-Tenant-Id` dejan de recibir 403 del middleware y corren una vez, sin contexto de tenant, sobre todo control.
- Un tenant que falla (excepción o `BaseNoDisponible`) queda en el resumen con 500 o 503 y no corta a los demás. El error inesperado no expone mensaje ni stack.

## Alternativa descartada

Que el cron externo conozca la lista de comercios y llame una vez por tenant: duplica control fuera del repo y deja comercios nuevos sin jobs. Llamar `next()` varias veces desde el middleware: Astro no garantiza re-ejecutar la ruta con el mismo request (el body ya se consumió). Correr en paralelo: con bases por tenant y el pool actual no hace falta, y en secuencia el log y los errores quedan ordenados.

## Consecuencias

Un solo disparo de cron cubre todos los comercios. La respuesta del fan-out es siempre 200 y el cron debe mirar `fallidos`. La duración del job crece con la cantidad de comercios; si pasa a ser un problema, la cola por tenant (pg-boss) es el siguiente paso.

## Pendientes

Paralelismo acotado y reintentos por tenant. Llevar los jobs de control (mora-diaria, purgar-demos, whatsapp-lunes) al mismo helper si en algún momento leen datos por tenant. Test del middleware con el módulo virtual `astro:middleware` (hoy se prueba con el build en el box).

## Evidencia de aceptación (2026-10-14)

- Commits: 6621f3a. Sin migración; suite contra Postgres local (127.0.0.1:54329, bases A y B); no se tocó Supabase.
- `npm run evidencia` con `PG_TEST_URL_A/B` locales:
  - tsc: 0 errores
  - vitest: `Test Files  135 passed (135)`
  - vitest: `Tests  976 passed (976)`
  - build: `11:27:18 [build] Complete!`
  - sha: `6621f3a`
- `npm run check:arch`: `Test Files  11 passed (11)`, `Tests  22 passed (22)`; `tests/arch/baselines.json` sin cambios (`esModoMulti` 151).
- Build corriendo en el box (`TENANT_MODE=multi`, sin tenants en control, puerto local): `POST /api/jobs/aviso-sync` y `/api/jobs/cierre-medianoche` con secreto y sin `X-Tenant-Id` responden `{"fan_out":true,"total":0,"fallidos":0,"resultados":[]}`; `/api/jobs/whatsapp-cierre` y `/api/sales` responden 403 `No tenés permiso para ver este comercio.`; sin secreto `{"error":"no autorizado"}`.
- Cambio de comportamiento: en multi, un job con secreto válido y sin `X-Tenant-Id` en `/api/jobs/*` ya no recibe 403; corre por cada comercio activo o suspendido (o una vez sin tenant en los jobs de control).
