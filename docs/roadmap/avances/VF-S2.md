---
item: VF-S2
estado: hecho
adr: ADR-0097
prd: PRD-VF-01
fecha: 2026-10-19
---
VF-S2 hecho: `sincronizarColaVenta` y `quitarConfirmados` en `src/offline/cola-venta.ts` sacan solo lo 2xx y cortan en el primer fallo; `sync-worker.ts` también corta; tests de comportamiento y de propiedad (fast-check) que fallaban contra el código viejo.
