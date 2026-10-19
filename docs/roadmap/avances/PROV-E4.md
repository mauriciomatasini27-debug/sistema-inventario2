---
item: PROV-E4 (PROV-S11 y PROV-S12)
estado: hecho
adr: ADR-0096
prd: PRD-PROV-01
fecha: 2026-10-19
---
PROV-E4 hecho: cupo por número de proveedor (`CUPO_PROV_MENSAJES` = 20 mensajes por ventana móvil de `CUPO_PROV_VENTANA_MIN` = 60 min en `src/modules/whatsapp/proveedor.ts`, default ajustable pendiente de Mauri) contado en memoria (`control.proveedorCupo`, sin migración) para contactos pendientes y verificados; sobre el cupo el bot no descarga media ni crea job/borrador ni avisa al Dueño, responde una sola vez `RESPUESTA_PROV_CUPO` por corte y después calla; los mensajes rechazados no cuentan, así que se repone solo al correr la ventana, y el Dueño lo habilita al aprobar (o re-aprobar) el contacto en `POST /api/suppliers/contactos/decidir`, que borra el cupo; un contacto revocado no consume cupo y se trata como no vinculado (genérico, sin job, borrador ni aviso), con tests en `tests/prov-e4-cupo-revocado.test.ts`.
