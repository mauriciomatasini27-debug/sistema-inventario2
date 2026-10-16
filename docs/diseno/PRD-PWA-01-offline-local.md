---
id: PRD-PWA-01
tipo: prd
estado: propuesto
modulos: [offline, persistencia]
depende_de: [ADR-0003]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: docs/01-fundacion/modo-offline.md (OF1, OF3, OF11, OF14), ADR-0003. Gap: src/offline/db.ts:2-3 stub en
  memoria; public/ sin manifest/SW/iconos; 0 hits manifest|serviceWorker en src/.
---
# PRD-PWA-01 - PWA instalable + SQLite local + OPFS

Fuente: `docs/01-fundacion/modo-offline.md` (OF1, OF3, OF11, OF14), ADR-0003. Gap: `src/offline/db.ts:2-3` stub en memoria; `public/` sin manifest/SW/iconos; 0 hits `manifest|serviceWorker` en `src/`.

## Épica PWA-E1. Instalabilidad

- PWA-S1. `manifest.webmanifest` + iconos + `theme-color` + `beforeinstallprompt`/iOS guía. AC: Given Chrome Android When visito Then ofrece instalar; iOS muestra `Compartir→Agregar`. Depende de: nada.
- PWA-S2. `sw.js` + cache catálogo + `GET /api/sync/pull` fondo. AC: Given sin red When abro Then app abre + vende con catálogo último. Depende de: PWA-S1, SYNC-S1.

## Épica PWA-E2. SQLite-WASM + OPFS + fotos

- PWA-S3. Reemplazar `src/offline/db.ts` stub por SQLite-WASM + OPFS (tablas `TABLAS_OFFLINE`). AC: Given venta offline When confirmo Then tx local única + `outbox` misma tx + ticket provisorio `Dx-NNNN`. Given crash When reabro Then `repararSeq` sin huecos. Depende de: PWA-S2.
- PWA-S4. Fotos en cola (800px/200KB, límite 100/50MB, miniatura `pendiente`). AC: Given foto producto offline When guardo Then miniatura local + subida tras datos. Tablas: `photos_queue`. Depende de: PWA-S3.
- PWA-S5. Cifrado en compartidos + borrado remoto al revocar + cuota `persist()+estimate()`. AC: Given device compartido When revoco Then borrado remoto + sin base legible. Depende de: PWA-S3.

## Estrategia prueba

| Tipo | Caso | Resultado |
|---|---|---|
| Feliz | instalar + vender offline | provisorio + sync sin duplicar |
| Fallo | OPFS iOS no disponible | degradación declarada por ADR, nunca crash |
