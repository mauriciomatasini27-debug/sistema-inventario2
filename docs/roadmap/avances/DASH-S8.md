---
item: DASH-S8
estado: hecho
adr: ADR-0045
prd: PRD-DASH-01
fecha: 2026-10-17
---
DASH-S8 hecho (parcial: /panel/plan; el medidor del drawer espera a DASH-S7): núcleo puro `src/lib/plan-panel.ts` (nombre del plan o "Sin plan activo", marca de catálogo de ejemplo, features incluidas/no incluidas con etiqueta legible y medidor del asistente con cupo efectivo, restante nunca negativo, agotado = usado >= cupo y reinicio el día 1 del mes siguiente en hora AR), `CUPO_ASISTENTE_POR_DEFECTO` exportado desde `src/modules/ia/asistente.ts` y compartido por el bloqueo y el medidor, mes unificado en hora AR con `mesAR` (`src/lib/fecha-ar.ts`) como default de `crearAsistente` y del endpoint, `GET /api/plan/resumen` read-only bajo `/api/plan` (sesión + membership activa, sin precios ni datos de otro tenant, 503 `base_no_disponible`) y la pantalla `/panel/plan` en Tema Papel con medidor accesible y número en texto, enlazada desde AjustesCard; omitidos el drawer del asistente y su estado `sin_cupo` (DASH-S7/DASH-S9); de paso, el test de aceptar invitación de `tests/auth-onboarding.test.ts` invita con el reloj real porque la ruta vence a 7 días y con la fecha fija fallaba desde el 2026-10-17T12:00Z.
