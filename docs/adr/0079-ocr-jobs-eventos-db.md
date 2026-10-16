---
id: ADR-0079
tipo: adr
estado: aceptado
modulos: [persistencia]
depende_de: [ADR-0005, ADR-0024, ADR-0052, ADR-0060, PRD-PERS-04]
reemplaza: []
reemplazado_por: ""
resumen: |
  Se crean las tablas ocrjobs y ocreventos con migración Drizzle 0018 (sin tenantid: aislamiento por base de
  tenant). El repositorio src/lib/repos/ocr.ts pasa a DB-first vía dbVivaTenant() para altas, lecturas,
  actualizaciones e idempotencia por idempotencykey, con espejo memoria y 503 en multi sin base.
---
# ADR-0079 - Trabajos y eventos de OCR DB-first

Estado: aceptado (2026-10-14, evidencia: `tests/pers4-ocr-jobs-eventos.test.ts` con Postgres local). Fecha: 2026-10-14. Fuentes: PRD `diseno/PRD-PERS-04-ocr-jobs-eventos-db.md`, ADR-0060 (Pendientes), ADR-0052, ADR-0024, `src/lib/repos/ocr.ts`, `src/jobs/vencer-ocr.ts`, `src/modules/ocr/jobs.ts`.

## Decisión

Se crean las tablas `ocr_jobs` y `ocr_eventos` con migración Drizzle `0018` (sin `tenant_id`: aislamiento por base de tenant). El repositorio `src/lib/repos/ocr.ts` pasa a DB-first vía `dbVivaTenant()` para altas, lecturas, actualizaciones e idempotencia por `idempotency_key`, con espejo memoria y 503 en multi sin base. El job de vencimiento deja de tocar `store` directo y usa el repo más `leerBorradorOcrRepo`. **No se elige ni se cablea proveedor de OCR.**

## Qué cambia

- Migración `drizzle/0018_ocr_jobs_eventos.sql` + entrada en el journal.
- `src/db/schema.ts`: tablas `ocrJobs` y `ocrEventos` alineadas a `OcrJob` y al log de eventos.
- `src/lib/repos/ocr.ts`: funciones async DB-first + `listarJobs`.
- `src/jobs/vencer-ocr.ts` y rutas `ocr/*` / `jobs/vencer-ocr`: `await` al repo.
- Tests nuevos o ampliación (`tests/pers4-ocr-jobs-eventos.test.ts`) single sin DB + multi PG A/B.
- Si el trinquete `store.` (u otro) baja, se actualiza `tests/arch/baselines.json` al número nuevo.

## Alternativa descartada

Meter jobs/eventos dentro de `supplier_drafts` / facturas: el job tiene ciclo propio (cola, recuerdo, vencido) distinto del borrador. Esperar la decisión de OCR definitivo (ADR-0005) antes de persistir: P1.2 pide integridad ya y el contrato HTTP ya existe sin proveedor cableado. Meter `tenant_id` en cada fila: contradice el modelo de base-por-tenant de ADR-0052.

## Consecuencias

Reiniciar el proceso con base viva ya no pierde trabajos ni eventos de OCR. Las funciones del repo pasan a async (callers con `await`). El espejo en `store` sigue hasta ARQ-S4. El dueño sigue debiendo decidir el proveedor de OCR por separado.

## Pendientes

Retiro del espejo memoria (P2.2 / ARQ-S4). Backfill de jobs/eventos que solo vivieron en memoria. Aplicar `0018` a bases reales con aprobación del dueño. Decisión de OCR definitivo (ADR-0005).

## Evidencia de aceptación (2026-10-14)

- Migración `drizzle/0018_ocr_jobs_eventos.sql` aplicada solo a Postgres local (127.0.0.1:54329, bases A y B); no se tocó Supabase.
- Verificación local con `PG_TEST_URL_A/B`:
  - `npm run typecheck`: 0 errores
  - `npm run check:arch`: `Test Files  11 passed (11)`, `Tests  22 passed (22)`; baseline `storeRepos` 433→431
  - `npm test`: `Test Files  137 passed (137)`, `Tests  988 passed (988)`
  - `npm run build`: `12:09:00 [build] Complete!`
- Cambio de comportamiento: con base viva, jobs y eventos OCR sobreviven reinicio; en multi sin base las rutas responden 503; single sin base igual que hoy. Sin cambio de shape HTTP ni de ids. No se eligió proveedor de OCR.
