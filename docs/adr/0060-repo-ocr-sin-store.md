---
id: ADR-0060
tipo: adr
estado: aceptado
modulos: [persistencia]
depende_de: [ADR-0024, ADR-0052, ADR-0053, ADR-0057, PRD-PERS-02]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0060 - Repositorio de OCR en `src/lib/repos/ocr.ts`: rutas `ocr/*` sin `store`

Estado: aceptado. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E11), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

`src/lib/repos/ocr.ts` concentra trabajos y eventos de OCR; los borradores y facturas siguen en `facturas-proveedor.ts`. Los mapas sin tabla quedan en memoria dentro del repositorio, marcados con un comentario.

## Qué cambia

`src/lib/repos/ocr.ts`; funciones nuevas en `facturas-proveedor.ts` si faltan; rutas `ocr/*` sin `store`; `tests/pers2-ocr.test.ts`.

## Alternativa descartada

Meter OCR dentro de `facturas-proveedor.ts`: el OCR es un canal de entrada con su propio ciclo de vida.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.

## Evidencia de aceptación (2026-10-13)

- Commits: dc0152e.
- `npm test`: 807 passed, 3 failed, 20 skipped. Fallan los 2 de caja-c11 y el de `tests/vencimientos.test.ts` que depende de la fecha (preexistentes, ver ADR-0057).
- Tests PG con Postgres local (`PG_TEST_URL_A/B`): 7/7 en `tests/pers2-ocr.test.ts`. La factura de proveedor que genera la confirmación queda en la base de A y B no la ve.
- Pendiente: los trabajos y eventos de OCR (`ocrJobs`, `ocrEventos`) no tienen tabla todavía y viven en la memoria particionada por tenant dentro de `src/lib/repos/ocr.ts`; en multi se pierden al reiniciar hasta que se agregue la tabla.
- `tsc --noEmit`: 1 error preexistente. `npm run build`: OK.
- Rutas en `src/pages/api` que importan `store`: 21 → 16.
