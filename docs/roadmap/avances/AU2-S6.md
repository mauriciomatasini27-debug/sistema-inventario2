---
item: AU2-S6
estado: hecho
adr: ADR-0030
prd: PRD-AU-02
fecha: 2026-10-19
---
AU2-S6 hecho: la lista de admins queda única en la práctica. `POST /api/tenants` deja de usar `esSuperadmin` y pasa por `exigirAdmin`, la misma puerta que las rutas `/api/admin/*`, con la misma allowlist (`ADMIN_ALLOWLIST_SUBS` más el fallback deprecado `SUPERADMIN_SUBS`) y auditoría del rechazo (`acceso_denegado_admin`). `exigirAdmin` acepta un mensaje opcional para conservar el texto de cada ruta; el de tenants sigue siendo "No tenés permiso para crear comercios." `esSuperadmin` queda como helper de `control.ts` sin uso en rutas. Test en `tests/admin-lista-unica.test.ts`: un sub fuera de la allowlist recibe 403 en tenants y en el embudo, y los dos rechazos quedan como actos auditados.
