---
item: OCR1-S4
estado: hecho
adr: ADR-0005
prd: PRD-OCR-01
fecha: 2026-10-18
---
OCR1-S4 hecho: el umbral de fallback vive en `UMBRAL_FALLBACK_NUBE = 0.6` (`src/modules/ocr/motor.ts`, ADR-0089 prevé subirlo a 0.7); decisión: `Extraccion.nubeOfrecida` queda verdadera solo cuando Paddle respondió bajo el umbral (pdf, texto directo y motor caído E6 no la ofrecen), la ruta 201 y el evento `ocr_borrador_listo` responden `fallback_nube: "ofrecido"` con `revisa` y borrador `pendiente` sin llamar a Vision ni Textract ni exponer claves/endpoints (AT2), y `GET /api/ocr/jobs/:id` deriva `fallback_nube` del evento ya persistido vía `buscarFallbackNubeJob` (`src/lib/repos/ocr.ts`, jsonb `payload->>'job_id'`), sin columna nueva ni migración.
