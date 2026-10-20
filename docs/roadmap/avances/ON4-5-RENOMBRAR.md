---
item: ON4-5-RENOMBRAR
estado: hecho
adr: ADR-0011
prd: PRD-E2E-01
fecha: 2026-10-20
---
ON4-5-RENOMBRAR hecho: `PATCH /api/locations` con zod `{ id uuid, nombre 1..80 con trim }` renombra la ubicación del tenant vía `renombrarUbicacion` (DB por `dbVivaTenant` más espejo en memoria, `esChoqueUnicoUbicacion` para el índice case-insensitive), responde 422 inválido, 404 inexistente, 409 duplicada sin contar la propia y 503 sin base, y cada fila de la tarjeta "Ubicaciones" de `/panel/stock` suma "Renombrar" con label visible, Guardar/Cancelar, Enter guarda, Escape cancela y devuelve el foco, error 409 en `role=status`/`aria-live` y `prefers-reduced-motion` respetado; archivar sigue fuera.
