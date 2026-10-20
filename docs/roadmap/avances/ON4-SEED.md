---
item: ON4-SEED
estado: hecho
adr: ADR-0011
prd: PRD-E2E-01
fecha: 2026-10-20
---
ON4-SEED hecho: al terminar `POST /api/onboarding/alta` se siembran las ubicaciones de `plantilla_rubro(rubro)` (kiosco 6, rubro desconocido usa `otro`) en `locations` del tenant vía `sembrarUbicacionesRubro`, vacías y no archivadas; la decisión pura vive en `nombresUbicacionesRubro`, es idempotente por "ya hay ubicaciones" (activas o archivadas) y el evento `ubicaciones_sembradas_rubro` en `control.events` lleva origen "Sistema (plantilla de rubro)", `VERSION_PLANTILLAS_RUBRO` y la cantidad creada; queda fuera ON4.5 y el reintento de admin.
