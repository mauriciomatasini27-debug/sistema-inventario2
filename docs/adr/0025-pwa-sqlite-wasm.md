---
id: ADR-0025
tipo: adr
estado: aceptado
modulos: [offline, persistencia]
depende_de: [ADR-0003, PRD-PWA-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Ship PWA con manifest.webmanifest + sw.js + SQLite-WASM sobre OPFS con misma firma que src/offline/db.ts;
  fotos en cola 800px/200KB 100/50MB; cifrado en compartidos + borrado remoto. PRD:
  diseno/PRD-PWA-01-offline-local.md.
---
# ADR-0025 - PWA instalable + SQLite-WASM/OPFS

Estado: aceptado (2026-10-12, evidencia: `src/offline/db.ts`). Fecha: 2026-10-11. Fuentes: OF1/OF3/OF11/OF14, ADR-0003, `src/offline/db.ts:2-3`, `public/` (solo favicon+og), `astro.config.mjs`.

## Decisión

Ship PWA con `manifest.webmanifest` + `sw.js` + SQLite-WASM sobre OPFS con misma firma que `src/offline/db.ts`; fotos en cola 800px/200KB 100/50MB; cifrado en compartidos + borrado remoto. PRD: `diseno/PRD-PWA-01-offline-local.md`.

## Por qué

OF1 exige 100% celular; hoy el offline local es stub en memoria sin instalabilidad.

## Qué cambia

Nuevo `manifest`, `sw.js`, iconos; `db.ts` cambia backing; `photos_queue`.

## Alternativa descartada

Recortar PWA del MVP: solo válido con ADR que lo declare; por defecto se implementa.

## Pendientes

PWA-S1→S5 + test instalar + vender offline + `repararSeq` tras crash. Verificar BarcodeDetector/OPFS iOS en fuente oficial.
