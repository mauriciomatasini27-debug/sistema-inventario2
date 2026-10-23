---
item: DASH-S5
estado: hecho
adr: ADR-0043
prd: PRD-DASH-01
fecha: 2026-10-23
---
DASH-S5 corrección: main (2d7610e) no pasaba `npm run verify`; se arregla en la raíz sin subir baselines: `control.waPrefs` (`src/lib/store.ts`) declara `canal?: CanalElegido` (`"whatsapp" | "email" | "ambos"`, como la columna `canal` de `notification_preferences`) y `optInAtMs` (TS2353), `alerta-prefs.ts` toma `control` de `./_almacen.js` (trinquete AT4), `/api/whatsapp/historial` entra a `PREFIJOS_DATOS` (SEC2-S2) y el consentimiento de Gmail usa `errores-campo` (T-UI-04); `tests/alerta-prefs-canal-mem.test.ts` cubre que el repo en memoria guarda el canal y cae a `"email"` si falta.
