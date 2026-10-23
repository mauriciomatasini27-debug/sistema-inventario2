---
item: ON4-SEED-DB
estado: hecho
adr: ADR-0011
prd: PRD-E2E-01
fecha: 2026-10-20
---
ON4-SEED-DB hecho: la siembra de ubicaciones por rubro queda registrada en `tenant_location_seeds` (migración `0032_tenant_location_seeds`, aplicada el 2026-10-20) vía `registrarSiembraUbicaciones` al terminar `POST /api/onboarding/alta`, y `GET /api/locations` arma `sembradas_por_rubro` con `leerSembradasPorRubro` (evento en memoria o fila en la base) sin cambiar la forma de la respuesta, así el aviso de `/panel/stock` sobrevive un reinicio. La migración se aplicó con aprobación de Mauri.
