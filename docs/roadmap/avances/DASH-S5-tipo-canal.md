---
item: DASH-S5
estado: hecho
adr: ADR-0043
prd: PRD-DASH-01
fecha: 2026-10-23
---
DASH-S5 corrección: main (2d7610e) no pasaba `npm run verify`. Tres causas, arregladas en la raíz y sin subir baselines:
- typecheck (TS2353): el `Map` en memoria `control.waPrefs` (`src/lib/store.ts`) no declaraba `canal` ni `optInAtMs`, que `src/lib/repos/alerta-prefs.ts` guarda desde DASH-S5 (PR #20). Se agregan `canal?: CanalElegido` (`"whatsapp" | "email" | "ambos"`, igual que la columna `canal` de `notification_preferences`) y `optInAtMs?: number | null`, sin casts. `tests/alerta-prefs-canal-mem.test.ts` cubre que el repo en memoria guarda y devuelve el canal, y que sin canal cae a `"email"`.
- arch AT4: `alerta-prefs.ts` importaba `control` de `../store.js` y subía el trinquete `storeRepos` de 72 a 73; ahora lo toma de `./_almacen.js`, como `whatsapp.ts`.
- arch SEC2-S2: `/api/whatsapp/historial` (DASH-S2) lee `bot_turnos` del comercio y no estaba en `PREFIJOS_DATOS`; se agrega.
- test T-UI-04: el formulario de consentimiento de Gmail (`/panel/integraciones`, PR #25) no usaba `errores-campo`; ahora marca el checkbox con `mostrarErrores` si se envía sin aceptar.
