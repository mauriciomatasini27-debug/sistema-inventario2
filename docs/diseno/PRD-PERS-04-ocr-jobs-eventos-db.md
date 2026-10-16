---
id: PRD-PERS-04
tipo: prd
estado: propuesto
modulos: [persistencia]
depende_de: [ADR-0005, ADR-0024, ADR-0052, ADR-0060, ADR-0079]
reemplaza: []
reemplazado_por: ""
resumen: |
  src/lib/repos/ocr.ts concentra buscarJobPorClave, obtenerJob, crearJobRegistro, marcarJobFallo,
  vincularBorradorAlJob, actualizarJob y registrarEventoOcr, pero solo escribe en store.ocrJobs / ocrJobsByKey /
  ocrEventos. El job src/jobs/vencer-ocr.ts itera store.ocrJobs y empuja eventos directo a memoria.
---
# PRD-PERS-04 - Trabajos y eventos de OCR DB-first

Fuente: pendientes de ADR-0060 ("los trabajos y eventos de OCR (`ocrJobs`, `ocrEventos`) no tienen tabla todavía"); `docs/ROADMAP.md`, Pendientes priorizados P1.2. Uso en este sistema: canal de ingreso de comprobantes (WA/Gmail) de cualquier comercio. Restringido por ADR-0079, ADR-0060, ADR-0052 y ADR-0024. Tipo persistencia. **No elige ni cablea proveedor de OCR** (decisión abierta del dueño, ADR-0005).

## Problema

`src/lib/repos/ocr.ts` concentra `buscarJobPorClave`, `obtenerJob`, `crearJobRegistro`, `marcarJobFallo`, `vincularBorradorAlJob`, `actualizarJob` y `registrarEventoOcr`, pero solo escribe en `store.ocrJobs` / `ocrJobsByKey` / `ocrEventos`. El job `src/jobs/vencer-ocr.ts` itera `store.ocrJobs` y empuja eventos directo a memoria. En multi con base viva un reinicio pierde trabajos y eventos; en single sin base el comportamiento actual (memoria) se conserva. Los borradores y facturas ya van por `facturas-proveedor.ts` con DB primero; acá solo falta el ciclo de vida del job y el log de eventos.

## Épica PERS4-E1. Tablas reales y repositorio DB-first

Requisito PERS4-R1: con base viva del tenant, trabajos y eventos de OCR se persisten en Postgres del tenant; en single sin base siguen en memoria; en multi sin base propagan `BaseNoDisponible` (503). La idempotencia por `Idempotency-Key` (wamid/message-id) se sostiene con índice único en DB. El motor / proveedor de OCR no forma parte de este PRD.

- Historia PERS4-S1. Migración Drizzle nueva que crea `ocr_jobs` (con unicidad de `idempotency_key`) y `ocr_eventos` (append-only), alineadas al tipo `OcrJob` de `src/modules/ocr/jobs.ts`. AC: Given Postgres local When corro la migración Then ambas tablas existen en A y B; Given el journal Then el índice 0018 queda registrado. ADR: 0079. Talla S. Depende de: nada.
- Historia PERS4-S2. `src/lib/repos/ocr.ts` DB-first: `buscarJobPorClave`, `obtenerJob`, `crearJobRegistro`, `marcarJobFallo`, `vincularBorradorAlJob`, `actualizarJob` y `listarJobs` (para el vencimiento) con `dbVivaTenant()`, espejo memoria y 503 en multi sin base. AC: Given multi con base de A When creo un job Then queda en `ocr_jobs` de A y B no lo ve; Given la misma `Idempotency-Key` Then se reusa el job existente (200 duplicado); Given single sin base Then se comporta como hoy. ADR: 0079. Talla S. Depende de: PERS4-S1.
- Historia PERS4-S3. `registrarEventoOcr` DB-first: INSERT en `ocr_eventos` + espejo en `store.ocrEventos`. AC: Given multi con base de A When se emite `ocr_borrador_listo` / `ocr_confirmado` / `ocr_descartado` Then hay fila en `ocr_eventos` de A y B no la ve; Given single sin base Then solo memoria como hoy. ADR: 0079. Talla S. Depende de: PERS4-S1.
- Historia PERS4-S4. `ejecutarVencimientoOcr` deja de tocar `store.ocrJobs` / `store.ocrEventos` directo: lista jobs por el repo, lee borradores con `leerBorradorOcrRepo`, marca recuerdo con `actualizarJob` / `con_recuerdo` y registra `ocr_vencido` / `ocr_recuerdo` con `registrarEventoOcr`. AC: Given multi con base de A When el job marca vencido/recuerdo Then el job y el evento quedan en A; B no los ve; Given single sin base Then se comporta como hoy. ADR: 0079. Talla S. Depende de: PERS4-S2, PERS4-S3.

## Fuera de alcance

Elegir o cablear proveedor de OCR (PaddleOCR / Vision / Textract / multimodal): decisión del dueño (ADR-0005). Retiro total del espejo en `store` (ARQ-S4 / P2.2). Backfill de jobs/eventos que solo vivieron en memoria. Aplicar la migración a bases reales / Supabase (solo Postgres local de tests). Cambiar contratos HTTP de `/api/ocr/*` (status codes, shape de respuesta) salvo el 503 multi sin base ya estándar.

## Dependencias externas

Ninguna. Sin servicios nuevos ni Supabase. Sin endpoint Paddle ni claves de Vision/Textract.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Job en PG | POST `/api/ocr/jobs` en tenant-a | Fila en `ocr_jobs` de A; B no la ve |
| Feliz | Evento | Job listo / confirmar / descartar en A | Fila en `ocr_eventos` de A |
| Feliz | Vencimiento | Job con borrador vencido / recuerdo 24h en A | Job actualizado + evento en A |
| Fallo | Idempotencia | Misma Idempotency-Key | 200 duplicado, un solo job en DB |
| Regresión | Single sin DB | Sin `TENANT_DATABASE_URL` | Memoria como hoy (`tests/pers2-ocr.test.ts`, `tests/ocr-fase0.test.ts`) |
| Arch | Trinquetes | `store.` / `esModoMulti` / `as never` | No suben; si `store.` baja, bajar baseline |
