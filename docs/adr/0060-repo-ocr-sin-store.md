# ADR-0060 - Repositorio de OCR en `src/lib/repos/ocr.ts`: rutas `ocr/*` sin `store`

Estado: propuesto. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E11), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

`src/lib/repos/ocr.ts` concentra trabajos y eventos de OCR; los borradores y facturas siguen en `facturas-proveedor.ts`. Los mapas sin tabla quedan en memoria dentro del repositorio, marcados con un comentario.

## Qué cambia

`src/lib/repos/ocr.ts`; funciones nuevas en `facturas-proveedor.ts` si faltan; rutas `ocr/*` sin `store`; `tests/pers2-ocr.test.ts`.

## Alternativa descartada

Meter OCR dentro de `facturas-proveedor.ts`: el OCR es un canal de entrada con su propio ciclo de vida.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.
