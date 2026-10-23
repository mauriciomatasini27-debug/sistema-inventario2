---
item: DASH-S5
estado: hecho
adr: ADR-0043
prd: PRD-DASH-01
fecha: 2026-10-23
---
DASH-S5 corrección de tipos: el `Map` en memoria `control.waPrefs` (`src/lib/store.ts`) no declaraba `canal` ni `optInAtMs`, que `src/lib/repos/alerta-prefs.ts` sí guarda desde DASH-S5, y `npm run verify` fallaba en typecheck (TS2353). Se agregan `canal?: CanalElegido` (`"whatsapp" | "email" | "ambos"`, igual que la columna `canal` de `notification_preferences`) y `optInAtMs?: number | null`, sin casts. `tests/alerta-prefs-canal-mem.test.ts` cubre que el repo en memoria guarda y devuelve el canal, y que sin canal cae a `"email"`.
